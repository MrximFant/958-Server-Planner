import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Shuffle, Lock, Unlock, RotateCcw, Save, Train, Info, ChevronDown, ChevronUp } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────
const DAYS   = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ROLES  = ['driver', 'vip'];
const FONT   = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const MODES = [
  {
    id: 'manual',
    label: 'Manual',
    icon: '✋',
    color: '#00c8ff',
    desc: 'Full control. Drag members into any slot. No automation.',
    detail: 'Best for alliances with specific rules each week or changing circumstances.',
  },
  {
    id: 'fixed_driver',
    label: 'Fixed Driver',
    icon: '🚂',
    color: '#00e87a',
    desc: 'One person drives every day. VIPs rotate from a pool.',
    detail: 'Best when one dedicated player always drives and VIPs are rotated fairly.',
  },
  {
    id: 'paired',
    label: 'Paired Rotation',
    icon: '🔁',
    color: '#f0a500',
    desc: 'Members paired as (Driver, VIP). After a full cycle, roles swap.',
    detail: 'Pairs rotate through days. Once everyone has gone, Driver↔VIP swap for the next cycle. Fairest for small groups.',
  },
  {
    id: 'round_robin',
    label: 'Round Robin',
    icon: '🎯',
    color: '#c87aff',
    desc: 'Separate Driver queue and VIP queue, each cycling independently.',
    detail: 'Pure fair rotation. Add members to each queue; they cycle through the days automatically.',
  },
  {
    id: 'priority',
    label: 'Priority Days',
    icon: '🏆',
    color: '#ff6080',
    desc: 'Lock specific days for event winners or officers. Rest auto-fills.',
    detail: 'Mark important days with specific members (canyon winners, etc.). Other days fill via round robin.',
  },
];

const EMPTY_SLOTS = () => {
  const s = {};
  DAYS.forEach((_, d) => {
    ROLES.forEach(r => { s[`${d}-${r}`] = { memberId: null, locked: false }; });
  });
  return s;
};

// ── Helpers ────────────────────────────────────────────────────────
function initSlots(dbSlots) {
  const s = EMPTY_SLOTS();
  (dbSlots ?? []).forEach(row => {
    const key = `${row.day_of_week}-${row.role}`;
    s[key] = { memberId: row.member_id, locked: row.locked };
  });
  return s;
}

function memberName(m) {
  return m?.in_game_name || m?.username || '?';
}

function memberInitials(m) {
  const n = memberName(m);
  return n.slice(0, 2).toUpperCase();
}

// Auto-fill algorithms
function genFixedDriver(members, driverMemberId, vipPool) {
  const slots = EMPTY_SLOTS();
  DAYS.forEach((_, d) => {
    slots[`${d}-driver`] = { memberId: driverMemberId, locked: false };
  });
  vipPool.forEach((m, i) => {
    if (i < 7) slots[`${i}-vip`] = { memberId: m.id, locked: false };
  });
  return slots;
}

function genPaired(pairs) {
  // pairs: [{driver, vip}]
  const slots = EMPTY_SLOTS();
  pairs.forEach((pair, i) => {
    if (i < 7) {
      slots[`${i}-driver`] = { memberId: pair.driver, locked: false };
      slots[`${i}-vip`]    = { memberId: pair.vip,    locked: false };
    }
  });
  return slots;
}

function genRoundRobin(driverQueue, vipQueue) {
  const slots = EMPTY_SLOTS();
  DAYS.forEach((_, d) => {
    if (driverQueue.length) slots[`${d}-driver`] = { memberId: driverQueue[d % driverQueue.length], locked: false };
    if (vipQueue.length)    slots[`${d}-vip`]    = { memberId: vipQueue[d % vipQueue.length],       locked: false };
  });
  return slots;
}

function genPriority(existing, driverPool, vipPool) {
  const slots = { ...existing };
  let di = 0, vi = 0;
  DAYS.forEach((_, d) => {
    if (!slots[`${d}-driver`]?.locked && !slots[`${d}-driver`]?.memberId) {
      if (driverPool.length) { slots[`${d}-driver`] = { memberId: driverPool[di % driverPool.length], locked: false }; di++; }
    }
    if (!slots[`${d}-vip`]?.locked && !slots[`${d}-vip`]?.memberId) {
      if (vipPool.length) { slots[`${d}-vip`] = { memberId: vipPool[vi % vipPool.length], locked: false }; vi++; }
    }
  });
  return slots;
}

// ── Main component ─────────────────────────────────────────────────
export default function TrainPlanner() {
  const { serverId }  = useParams();
  const navigate      = useNavigate();
  const { session }   = useAuth();

  const role          = session?.serverId === serverId ? session.role       : null;
  const myAllianceId  = session?.allianceId ?? null;
  const allianceRole  = session?.allianceRole ?? null;
  const canEdit       = role === 'admin' || role === 'helper' || role === 'owner' || allianceRole === 'alliance_admin';

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [members,     setMembers]     = useState([]);  // alliance members
  const [alliance,    setAlliance]    = useState(null);
  const [scheduleId,  setScheduleId]  = useState(null);

  // ── Schedule state ───────────────────────────────────────────────
  const [mode,        setMode]        = useState('manual');
  const [weekLabel,   setWeekLabel]   = useState('Current Week');
  const [slots,       setSlots]       = useState(EMPTY_SLOTS);

  // Mode-specific config state
  const [fixedDriver, setFixedDriver] = useState(null);        // memberId
  const [vipPool,     setVipPool]     = useState([]);          // [member]
  const [pairs,       setPairs]       = useState([]);          // [{driver: id, vip: id}]
  const [driverQueue, setDriverQueue] = useState([]);          // [memberId]
  const [vipQueue,    setVipQueue]    = useState([]);          // [memberId]
  const [modeOpen,    setModeOpen]    = useState(false);

  // ── Drag state ───────────────────────────────────────────────────
  const [dragging,    setDragging]    = useState(null);   // { memberId, fromSlot? }
  const [dragOver,    setDragOver]    = useState(null);   // slot key
  const [selected,    setSelected]    = useState(null);   // selected member for click-assign

  // ── Load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myAllianceId) { setLoading(false); return; }

    async function load() {
      const [{ data: al }, { data: mems }] = await Promise.all([
        supabase.from('alliances').select('id, name, color, server_id').eq('id', myAllianceId).single(),
        supabase.from('members').select('id, username, in_game_name, power1, troop1, alliance_role').eq('alliance_id', myAllianceId).order('username'),
      ]);
      setAlliance(al);
      setMembers(mems ?? []);

      // Load existing schedule
      const { data: sched } = await supabase
        .from('train_schedules')
        .select('*')
        .eq('alliance_id', myAllianceId)
        .maybeSingle();

      if (sched) {
        setScheduleId(sched.id);
        setMode(sched.mode ?? 'manual');
        setWeekLabel(sched.week_label ?? 'Current Week');

        const cfg = sched.mode_config ?? {};
        if (cfg.fixedDriver)  setFixedDriver(cfg.fixedDriver);
        if (cfg.vipPool)      setVipPool(cfg.vipPool);
        if (cfg.pairs)        setPairs(cfg.pairs);
        if (cfg.driverQueue)  setDriverQueue(cfg.driverQueue);
        if (cfg.vipQueue)     setVipQueue(cfg.vipQueue);

        const { data: dbSlots } = await supabase
          .from('train_slots')
          .select('*')
          .eq('schedule_id', sched.id);
        setSlots(initSlots(dbSlots));
      }
      setLoading(false);
    }
    load();
  }, [myAllianceId]);

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!myAllianceId) return;
    setSaving(true);

    const modeConfig = { fixedDriver, vipPool, pairs, driverQueue, vipQueue };

    let sid = scheduleId;
    if (!sid) {
      const { data } = await supabase
        .from('train_schedules')
        .insert({ alliance_id: myAllianceId, mode, week_label: weekLabel, mode_config: modeConfig })
        .select('id').single();
      sid = data?.id;
      setScheduleId(sid);
    } else {
      await supabase.from('train_schedules')
        .update({ mode, week_label: weekLabel, mode_config: modeConfig })
        .eq('id', sid);
    }

    if (!sid) { setSaving(false); return; }

    // Upsert all 14 slots
    const rows = [];
    DAYS.forEach((_, d) => {
      ROLES.forEach(r => {
        const slot = slots[`${d}-${r}`];
        rows.push({
          schedule_id:  sid,
          day_of_week:  d,
          role:         r,
          member_id:    slot?.memberId ?? null,
          locked:       slot?.locked ?? false,
        });
      });
    });
    await supabase.from('train_slots').upsert(rows, { onConflict: 'schedule_id,day_of_week,role' });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [myAllianceId, scheduleId, mode, weekLabel, slots, fixedDriver, vipPool, pairs, driverQueue, vipQueue]);

  // ── Auto-generate based on mode ───────────────────────────────────
  function generate() {
    if (mode === 'fixed_driver') {
      setSlots(genFixedDriver(members, fixedDriver, vipPool));
    } else if (mode === 'paired') {
      setSlots(genPaired(pairs));
    } else if (mode === 'round_robin') {
      setSlots(genRoundRobin(driverQueue, vipQueue));
    } else if (mode === 'priority') {
      const dPool = members.filter(m => !Object.values(slots).some(s => s.locked && s.memberId === m.id)).map(m => m.id);
      const vPool = [...dPool];
      setSlots(genPriority(slots, dPool, vPool));
    }
  }

  // ── Slot assignment ───────────────────────────────────────────────
  function assignSlot(key, memberId) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], memberId } }));
  }

  function clearSlot(key) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], memberId: null } }));
  }

  function toggleLock(key) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], locked: !prev[key]?.locked } }));
  }

  function clearAll() {
    if (!confirm('Clear all slots?')) return;
    setSlots(EMPTY_SLOTS());
  }

  // ── Drag handlers ─────────────────────────────────────────────────
  function onDragStart(e, memberId, fromSlot = null) {
    setDragging({ memberId, fromSlot });
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e, key) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(key);
  }
  function onDragLeave() { setDragOver(null); }
  function onDrop(e, key) {
    e.preventDefault();
    setDragOver(null);
    if (!dragging || !canEdit) return;
    const { memberId, fromSlot } = dragging;
    // If dragged from another slot, clear that slot
    if (fromSlot && fromSlot !== key) {
      setSlots(prev => ({
        ...prev,
        [fromSlot]: { ...prev[fromSlot], memberId: null },
        [key]:      { ...prev[key], memberId },
      }));
    } else {
      assignSlot(key, memberId);
    }
    setDragging(null);
    setSelected(null);
  }
  function onDropPool(e) {
    e.preventDefault();
    if (!dragging?.fromSlot) return;
    clearSlot(dragging.fromSlot);
    setDragging(null);
  }

  // Click assign: select member → click slot
  function onMemberClick(memberId) {
    if (!canEdit) return;
    setSelected(s => s === memberId ? null : memberId);
  }
  function onSlotClick(key) {
    if (!canEdit) return;
    if (selected) {
      assignSlot(key, selected);
      setSelected(null);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────
  const memberById = Object.fromEntries(members.map(m => [m.id, m]));
  const assignedIds = new Set(Object.values(slots).map(s => s.memberId).filter(Boolean));
  const currentMode = MODES.find(m => m.id === mode);

  // ── Pairs helpers ─────────────────────────────────────────────────
  function addPair(driverId, vipId) {
    if (!driverId || !vipId) return;
    setPairs(p => [...p, { driver: driverId, vip: vipId }]);
  }
  function removePair(i) { setPairs(p => p.filter((_, j) => j !== i)); }
  function swapPairs() { setPairs(p => p.map(pair => ({ driver: pair.vip, vip: pair.driver }))); }

  // ── Queue helpers ─────────────────────────────────────────────────
  function toggleQueue(arr, setArr, memberId) {
    setArr(a => a.includes(memberId) ? a.filter(id => id !== memberId) : [...a, memberId]);
  }
  function moveQueue(arr, setArr, i, dir) {
    const n = [...arr];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setArr(n);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>
      LOADING TRAIN PLANNER…
    </div>
  );

  if (!myAllianceId) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', gap: 16 }}>
      <style>{FONT}</style>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '2px' }}>NO ALLIANCE</div>
      <p style={{ color: '#3a5878', fontSize: 13 }}>You must be logged in as an alliance member to use the train planner.</p>
      <button onClick={() => navigate(`/server/${serverId}`)} style={S.backBtn}><ArrowLeft size={14} /> BACK</button>
    </div>
  );

  return (
    <div style={{ height: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', overflow: 'hidden' }}>
      <style>{FONT}</style>

      {/* ── Topbar ──────────────────────────────────────────────── */}
      <div style={{ height: 48, background: 'rgba(8,13,20,0.97)', borderBottom: '1px solid #1e3550', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flexShrink: 0, zIndex: 50 }}>
        <button onClick={() => navigate(`/server/${serverId}/alliance`)} style={S.iconBtn}><ArrowLeft size={15} /></button>
        <Train size={15} style={{ color: '#f0a500', flexShrink: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '2px', color: '#f0a500' }}>TRAIN PLANNER</div>
        {alliance && <div style={{ fontSize: 11, color: '#3a5878', marginLeft: 4 }}>— {alliance.name}</div>}
        <div style={{ flex: 1 }} />
        <input
          value={weekLabel}
          onChange={e => setWeekLabel(e.target.value)}
          style={{ background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', width: 140 }}
          placeholder="Week label…"
          readOnly={!canEdit}
        />
        {canEdit && (
          <>
            <button onClick={clearAll} style={{ ...S.iconBtn, color: '#ff6080' }} title="Clear all slots"><RotateCcw size={14} /></button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: saved ? 'rgba(0,232,122,0.1)' : 'rgba(240,165,0,0.1)', border: `1px solid ${saved ? 'rgba(0,232,122,0.4)' : 'rgba(240,165,0,0.4)'}`, color: saved ? '#00e87a' : '#f0a500', padding: '5px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: saving ? 'default' : 'pointer' }}
            >
              <Save size={13} />
              {saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE'}
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Mode + Config ─────────────────────────────────── */}
        <div style={{ width: 260, minWidth: 260, background: 'rgba(5,10,18,0.98)', borderRight: '1px solid #1e3550', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Mode selector */}
          <div style={{ borderBottom: '1px solid #1e3550', flexShrink: 0 }}>
            <button
              onClick={() => setModeOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', color: currentMode?.color ?? '#d0e4f4' }}
            >
              <span style={{ fontSize: 16 }}>{currentMode?.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '1.5px', flex: 1, textAlign: 'left' }}>{currentMode?.label?.toUpperCase()}</span>
              {modeOpen ? <ChevronUp size={13} style={{ color: '#3a5878' }} /> : <ChevronDown size={13} style={{ color: '#3a5878' }} />}
            </button>
            {modeOpen && (
              <div style={{ borderTop: '1px solid #1e3550' }}>
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setModeOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 14px',
                      background: mode === m.id ? `${m.color}0d` : 'transparent',
                      border: 'none', borderBottom: '1px solid #1e3550',
                      cursor: canEdit ? 'pointer' : 'default', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 14, marginTop: 1 }}>{m.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '1px', color: mode === m.id ? m.color : '#d0e4f4' }}>{m.label.toUpperCase()}</div>
                      <div style={{ fontSize: 10, color: '#3a5878', lineHeight: 1.5, marginTop: 2 }}>{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mode config panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            <ModeConfig
              mode={mode}
              members={members}
              memberById={memberById}
              canEdit={canEdit}
              fixedDriver={fixedDriver} setFixedDriver={setFixedDriver}
              vipPool={vipPool}        setVipPool={setVipPool}
              pairs={pairs}            addPair={addPair} removePair={removePair} swapPairs={swapPairs}
              driverQueue={driverQueue} setDriverQueue={setDriverQueue} moveDriverQueue={(i,d) => moveQueue(driverQueue, setDriverQueue, i, d)}
              vipQueue={vipQueue}       setVipQueue={setVipQueue}       moveVipQueue={(i,d) => moveQueue(vipQueue, setVipQueue, i, d)}
              toggleQueue={toggleQueue}
              generate={generate}
              currentMode={currentMode}
            />
          </div>
        </div>

        {/* ── Center: Grid ────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <ScheduleGrid
            slots={slots}
            days={DAYS}
            memberById={memberById}
            canEdit={canEdit}
            dragOver={dragOver}
            selected={selected}
            mode={mode}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onSlotClick={onSlotClick}
            clearSlot={clearSlot}
            toggleLock={toggleLock}
          />
        </div>

        {/* ── Right: Member pool ───────────────────────────────────── */}
        <div
          style={{ width: 190, minWidth: 190, background: 'rgba(5,10,18,0.98)', borderLeft: '1px solid #1e3550', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onDragOver={e => e.preventDefault()}
          onDrop={onDropPool}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3550', fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', flexShrink: 0 }}>
            MEMBERS — {members.length}
          </div>
          {selected && (
            <div style={{ padding: '6px 12px', background: 'rgba(0,200,255,0.06)', borderBottom: '1px solid rgba(0,200,255,0.2)', fontSize: 10, color: '#00c8ff' }}>
              ✓ Click a slot to assign
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {members.map(m => {
              const isAssigned = assignedIds.has(m.id);
              const isSel      = selected === m.id;
              return (
                <div
                  key={m.id}
                  draggable={canEdit}
                  onDragStart={e => onDragStart(e, m.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onMemberClick(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 3,
                    background: isSel ? 'rgba(0,200,255,0.12)' : isAssigned ? 'rgba(0,200,255,0.03)' : 'transparent',
                    border: `1px solid ${isSel ? 'rgba(0,200,255,0.5)' : isAssigned ? 'rgba(0,200,255,0.15)' : '#1e3550'}`,
                    cursor: canEdit ? 'grab' : 'default',
                    opacity: isAssigned && !isSel ? 0.55 : 1,
                  }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: 2, background: alliance?.color ?? '#1e3550', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#080d14', flexShrink: 0 }}>
                    {memberInitials(m)}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? '#00c8ff' : '#d0e4f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {memberName(m)}
                    </div>
                    {m.power1 && <div style={{ fontSize: 9, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>{m.power1}B{m.troop1 ? ` · ${m.troop1}` : ''}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid #1e3550', fontSize: 9, color: '#2a4058', lineHeight: 1.6, flexShrink: 0 }}>
            Drag to a slot, or click member then click slot.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mode Config Panel ──────────────────────────────────────────────
function ModeConfig({ mode, members, memberById, canEdit, fixedDriver, setFixedDriver, vipPool, setVipPool, pairs, addPair, removePair, swapPairs, driverQueue, setDriverQueue, vipQueue, setVipQueue, moveDriverQueue, moveVipQueue, toggleQueue, generate, currentMode }) {
  const [pairDriver, setPairDriver] = useState('');
  const [pairVip,    setPairVip]    = useState('');

  const sel = (label, value, onChange) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={S.sel} disabled={!canEdit}>
      <option value="">— {label} —</option>
      {members.map(m => <option key={m.id} value={m.id}>{m.in_game_name || m.username}</option>)}
    </select>
  );

  return (
    <div>
      {/* Mode info */}
      <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.6, marginBottom: 14, padding: '8px 10px', border: `1px solid ${currentMode?.color}25`, background: `${currentMode?.color}08` }}>
        {currentMode?.detail}
      </div>

      {/* MANUAL */}
      {mode === 'manual' && (
        <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.7 }}>
          Drag members from the pool on the right into any slot, or click a member then click a slot. Use the lock icon to protect a slot from being cleared.
        </div>
      )}

      {/* FIXED DRIVER */}
      {mode === 'fixed_driver' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={S.cfgLabel}>FIXED DRIVER</div>
            {sel('select driver', fixedDriver ?? '', setFixedDriver)}
          </div>
          <div>
            <div style={S.cfgLabel}>VIP ROTATION ORDER</div>
            <p style={{ fontSize: 10, color: '#2a4058', marginBottom: 8 }}>Click to add/remove from VIP pool:</p>
            {members.filter(m => m.id !== fixedDriver).map(m => {
              const inPool = vipPool.some(p => p.id === m.id);
              return (
                <button key={m.id} onClick={() => canEdit && setVipPool(p => inPool ? p.filter(x => x.id !== m.id) : [...p, m])}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', marginBottom: 3, background: inPool ? 'rgba(0,232,122,0.08)' : 'transparent', border: `1px solid ${inPool ? 'rgba(0,232,122,0.3)' : '#1e3550'}`, color: inPool ? '#00e87a' : '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: canEdit ? 'pointer' : 'default' }}>
                  {inPool ? '✓' : '+'} {m.in_game_name || m.username}
                </button>
              );
            })}
          </div>
          {canEdit && <button onClick={generate} style={S.genBtn}><Shuffle size={12} /> GENERATE SCHEDULE</button>}
        </div>
      )}

      {/* PAIRED */}
      {mode === 'paired' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={S.cfgLabel}>PAIRS ({pairs.length})</div>
            <p style={{ fontSize: 10, color: '#2a4058', marginBottom: 8 }}>Each pair takes one day. After a full cycle, roles swap automatically.</p>
            {pairs.map((pair, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', marginBottom: 3, border: '1px solid #1e3550', background: 'rgba(240,165,0,0.04)' }}>
                <div style={{ flex: 1, fontSize: 10 }}>
                  <div style={{ color: '#f0a500' }}>🚂 {memberById[pair.driver] ? (memberById[pair.driver].in_game_name || memberById[pair.driver].username) : '?'}</div>
                  <div style={{ color: '#7a9bb8' }}>⭐ {memberById[pair.vip] ? (memberById[pair.vip].in_game_name || memberById[pair.vip].username) : '?'}</div>
                </div>
                {canEdit && <button onClick={() => removePair(i)} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
              </div>
            ))}
            {canEdit && pairs.length > 0 && (
              <button onClick={swapPairs} style={{ display: 'flex', alignItems: 'center', gap: 6, ...S.genBtn, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)', color: '#f0a500', marginBottom: 8 }}>
                <RotateCcw size={11} /> SWAP ALL ROLES
              </button>
            )}
          </div>
          {canEdit && (
            <div>
              <div style={S.cfgLabel}>ADD PAIR</div>
              {sel('Driver', pairDriver, setPairDriver)}
              <div style={{ height: 4 }} />
              {sel('VIP', pairVip, setPairVip)}
              <button
                onClick={() => { addPair(pairDriver, pairVip); setPairDriver(''); setPairVip(''); }}
                disabled={!pairDriver || !pairVip}
                style={{ ...S.genBtn, marginTop: 8 }}
              >
                + ADD PAIR
              </button>
            </div>
          )}
          {canEdit && <button onClick={generate} style={S.genBtn}><Shuffle size={12} /> GENERATE SCHEDULE</button>}
        </div>
      )}

      {/* ROUND ROBIN */}
      {mode === 'round_robin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <QueueEditor label="DRIVER QUEUE 🚂" queue={driverQueue} members={members} memberById={memberById} canEdit={canEdit}
            toggle={id => toggleQueue(driverQueue, setDriverQueue, id)} move={moveDriverQueue} />
          <QueueEditor label="VIP QUEUE ⭐" queue={vipQueue} members={members} memberById={memberById} canEdit={canEdit}
            toggle={id => toggleQueue(vipQueue, setVipQueue, id)} move={moveVipQueue} />
          {canEdit && <button onClick={generate} style={S.genBtn}><Shuffle size={12} /> GENERATE SCHEDULE</button>}
        </div>
      )}

      {/* PRIORITY */}
      {mode === 'priority' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.7 }}>
            In the grid, lock any slot with the 🔒 icon and assign a specific member. Then click Generate to auto-fill the remaining unlocked slots.
          </div>
          {canEdit && <button onClick={generate} style={{ ...S.genBtn, background: 'rgba(255,96,128,0.1)', border: '1px solid rgba(255,96,128,0.3)', color: '#ff6080' }}>
            <Shuffle size={12} /> AUTO-FILL UNLOCKED
          </button>}
        </div>
      )}
    </div>
  );
}

function QueueEditor({ label, queue, members, memberById, canEdit, toggle, move }) {
  return (
    <div>
      <div style={S.cfgLabel}>{label}</div>
      {/* Ordered queue */}
      {queue.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {queue.map((id, i) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', marginBottom: 2, border: '1px solid rgba(200,122,255,0.25)', background: 'rgba(200,122,255,0.06)' }}>
              <span style={{ fontSize: 9, color: '#3a5878', width: 14, textAlign: 'right', fontFamily: 'monospace' }}>{i + 1}.</span>
              <span style={{ flex: 1, fontSize: 11, color: '#d0e4f4', fontWeight: 700 }}>{memberById[id] ? (memberById[id].in_game_name || memberById[id].username) : '?'}</span>
              {canEdit && (
                <>
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={S.qBtn}>▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === queue.length - 1} style={S.qBtn}>▼</button>
                  <button onClick={() => toggle(id)} style={{ ...S.qBtn, color: '#ff4060' }}>×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Add members */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {members.filter(m => !queue.includes(m.id)).map(m => (
          <button key={m.id} onClick={() => canEdit && toggle(m.id)}
            style={{ textAlign: 'left', padding: '4px 8px', background: 'transparent', border: '1px solid #1e3550', color: '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: canEdit ? 'pointer' : 'default' }}>
            + {m.in_game_name || m.username}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Schedule Grid ──────────────────────────────────────────────────
function ScheduleGrid({ slots, days, memberById, canEdit, dragOver, selected, mode, onDragStart, onDragOver, onDragLeave, onDrop, onSlotClick, clearSlot, toggleLock }) {
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 72, padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', borderBottom: '1px solid #1e3550' }}></th>
              {days.map((d, i) => (
                <th key={d} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#d0e4f4', borderBottom: '1px solid #1e3550', minWidth: 90 }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { role: 'driver', label: 'DRIVER', icon: '🚂', color: '#f0a500' },
              { role: 'vip',    label: 'VIP',    icon: '⭐', color: '#c87aff' },
            ].map(({ role, label, icon, color }) => (
              <tr key={role}>
                <td style={{ padding: '8px 10px 8px 0', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color }}>
                    {icon} {label}
                  </div>
                </td>
                {days.map((_, d) => {
                  const key    = `${d}-${role}`;
                  const slot   = slots[key] ?? {};
                  const member = slot.memberId ? memberById[slot.memberId] : null;
                  const isOver = dragOver === key;
                  const isLocked = slot.locked;

                  return (
                    <td key={d} style={{ padding: '4px 3px', verticalAlign: 'top' }}>
                      <div
                        onDragOver={e => onDragOver(e, key)}
                        onDragLeave={onDragLeave}
                        onDrop={e => onDrop(e, key)}
                        onClick={() => !member && onSlotClick(key)}
                        style={{
                          minHeight: 64, borderRadius: 2, padding: '6px 8px',
                          background: isOver  ? `${color}18` :
                                      member  ? `${color}0d` : 'rgba(30,53,80,0.2)',
                          border: `1px solid ${isOver ? color : isLocked ? `${color}60` : member ? `${color}30` : '#1e3550'}`,
                          cursor: canEdit && !member ? 'crosshair' : 'default',
                          position: 'relative', transition: 'border-color 0.1s',
                          boxSizing: 'border-box',
                        }}
                      >
                        {member ? (
                          <SlotMember
                            member={member}
                            role={role}
                            color={color}
                            isLocked={isLocked}
                            canEdit={canEdit}
                            slotKey={key}
                            onDragStart={onDragStart}
                            clearSlot={clearSlot}
                            toggleLock={toggleLock}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 48 }}>
                            {isLocked
                              ? <Lock size={12} style={{ color: `${color}60` }} />
                              : <span style={{ fontSize: 18, opacity: 0.15 }}>{icon}</span>
                            }
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: '#2a4058' }}>
        <span>🔒 Locked slot</span>
        <span>Drag member from pool → slot</span>
        <span>Drag member from slot → pool to remove</span>
        <span>Click member in pool → click slot to assign</span>
        {canEdit && <span style={{ color: '#3a5878' }}>× removes assignment · lock protects slot</span>}
      </div>
    </div>
  );
}

function SlotMember({ member, role, color, isLocked, canEdit, slotKey, onDragStart, clearSlot, toggleLock }) {
  return (
    <div
      draggable={canEdit && !isLocked}
      onDragStart={e => !isLocked && onDragStart(e, member.id, slotKey)}
      style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.2, paddingRight: 16 }}>
        {member.in_game_name || member.username}
      </div>
      {member.username && member.in_game_name && (
        <div style={{ fontSize: 9, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>@{member.username}</div>
      )}
      {canEdit && (
        <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 2 }}>
          <button
            onClick={e => { e.stopPropagation(); toggleLock(slotKey); }}
            style={{ background: 'none', border: 'none', color: isLocked ? color : '#3a5878', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
            title={isLocked ? 'Unlock slot' : 'Lock slot'}
          >
            {isLocked ? <Lock size={9} /> : <Unlock size={9} />}
          </button>
          {!isLocked && (
            <button
              onClick={e => { e.stopPropagation(); clearSlot(slotKey); }}
              style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
              title="Remove"
            >
              <span style={{ fontSize: 10, lineHeight: 1 }}>×</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const S = {
  iconBtn: { background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  backBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '8px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  cfgLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 },
  genBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  sel: { width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: '6px 8px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11 },
  qBtn: { background: 'none', border: 'none', color: '#3a5878', cursor: 'pointer', padding: '2px 4px', fontSize: 10, fontFamily: 'monospace' },
};
