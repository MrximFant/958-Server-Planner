import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Lock, RotateCcw, Save, Train, Download, ChevronLeft, ChevronRight,
  Settings, Menu, Search, X, Shuffle, ArrowUp, ArrowDown, Plus,
} from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

// ── Constants ──────────────────────────────────────────────────────
const DAYS    = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ROLES   = ['driver', 'vip'];
const FONT    = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const ROLE_META = {
  driver: { label: 'DRIVER', icon: '🚂', color: '#f0a500' },
  vip:    { label: 'VIP',    icon: '⭐', color: '#c87aff' },
};

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

// Derive driverQueue/vipQueue from old mode_config shapes, best-effort.
function deriveQueuesFromLegacy(cfg) {
  if (!cfg) return { driverQueue: [], vipQueue: [] };
  if (Array.isArray(cfg.driverQueue) || Array.isArray(cfg.vipQueue)) {
    return { driverQueue: cfg.driverQueue ?? [], vipQueue: cfg.vipQueue ?? [] };
  }
  // old round_robin shape already covered above (driverQueue/vipQueue keys)
  // old fixed_driver shape: fixedDriver (single id) + vipPool (array of member OBJECTS)
  if (cfg.fixedDriver || (Array.isArray(cfg.vipPool) && cfg.vipPool.length)) {
    const driverQueue = cfg.fixedDriver ? [cfg.fixedDriver] : [];
    const vipQueue = Array.isArray(cfg.vipPool) ? cfg.vipPool.map(p => (typeof p === 'string' ? p : p?.id)).filter(Boolean) : [];
    return { driverQueue, vipQueue };
  }
  // old paired shape: pairs = [{driver,vip}]
  if (Array.isArray(cfg.pairs) && cfg.pairs.length) {
    return {
      driverQueue: cfg.pairs.map(p => p.driver).filter(Boolean),
      vipQueue: cfg.pairs.map(p => p.vip).filter(Boolean),
    };
  }
  return { driverQueue: [], vipQueue: [] };
}

// Auto-fill: walk each queue across the 7 days, skipping locked slots.
function autoFillSlots(existingSlots, driverQueue, vipQueue) {
  const slots = { ...existingSlots };
  let di = 0, vi = 0;
  DAYS.forEach((_, d) => {
    const dKey = `${d}-driver`;
    const vKey = `${d}-vip`;
    if (!slots[dKey]?.locked) {
      if (driverQueue.length) { slots[dKey] = { memberId: driverQueue[di % driverQueue.length], locked: false }; di++; }
      else slots[dKey] = { memberId: null, locked: false };
    }
    if (!slots[vKey]?.locked) {
      if (vipQueue.length) { slots[vKey] = { memberId: vipQueue[vi % vipQueue.length], locked: false }; vi++; }
      else slots[vKey] = { memberId: null, locked: false };
    }
  });
  return slots;
}

// ── Week helpers ────────────────────────────────────────────────────
function getMondayDate(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWeekRange(mondayStr) {
  const mon = new Date(mondayStr + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(mon)} – ${fmt(sun)} ${sun.getFullYear()}`;
}

function nextWeekDate(sortedScheds) {
  if (sortedScheds.length > 0) {
    const lastLabel = sortedScheds[sortedScheds.length - 1].week_label;
    const parsed = new Date(lastLabel + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return getMondayDate(new Date(parsed.getTime() + 7 * 24 * 3600000));
    return getMondayDate(new Date(Date.now() + 7 * 24 * 3600000));
  }
  return getMondayDate();
}

// ── Main component ─────────────────────────────────────────────────
export default function TrainPlanner() {
  const { serverId }  = useParams();
  const navigate      = useNavigate();
  const { session }   = useAuth();

  const role          = session?.serverId === serverId ? session.role       : null;
  const myAllianceId  = session?.allianceId ?? null;
  const allianceRole  = session?.allianceRole ?? null;
  const canEdit       = role === 'admin' || role === 'helper' || allianceRole === 'owner' || allianceRole === 'alliance_admin';

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [members,     setMembers]     = useState([]);
  const [alliance,    setAlliance]    = useState(null);
  const [isDirty,     setIsDirty]     = useState(false);
  const [toast,       setToast]       = useState('');

  // ── Multi-week state ─────────────────────────────────────────────
  const [allSchedules,    setAllSchedules]    = useState([]);
  const [currentWeekKey,  setCurrentWeekKey]  = useState('');
  const [scheduleId,      setScheduleId]      = useState(null);

  // ── Schedule state ───────────────────────────────────────────────
  const [slots,       setSlots]       = useState(EMPTY_SLOTS);
  const [driverQueue, setDriverQueue] = useState([]);
  const [vipQueue,    setVipQueue]    = useState([]);

  // ── Unsaved changes dialog ────────────────────────────────────────
  const [pendingNav, setPendingNav] = useState(null);

  // ── Cell popover / mobile sheet state ─────────────────────────────
  const [activeCell, setActiveCell] = useState(null); // { day, role } | null
  const [pickerOpen, setPickerOpen] = useState(false); // member picker for activeCell

  // ── Mobile view state ──────────────────────────────────────────────
  const [mobileDay,      setMobileDay]      = useState(0);
  const [mobileGridView, setMobileGridView] = useState(false);
  const [isMobile,       setIsMobile]       = useState(typeof window !== 'undefined' && window.innerWidth < 768);

  // ── Panel state ──────────────────────────────────────────────────
  const [leftOpen,    setLeftOpen]    = useState(true);

  // ── Manage Train (flattened) ──────────────────────────────────────
  const [managePanelOpen, setManagePanelOpen] = useState(false); // advanced section
  const [placeholders,  setPlaceholders]  = useState([]);
  const [newPlaceholderName, setNewPlaceholderName] = useState('');
  const [mtFirstWeek,   setMtFirstWeek]   = useState('');
  const [mtWeeksAhead,  setMtWeeksAhead]  = useState(4);
  const [mtGenerating,  setMtGenerating]  = useState(false);

  function markDirty() { setIsDirty(true); }

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Load placeholders ─────────────────────────────────────────────
  useEffect(() => {
    if (!myAllianceId) return;
    const stored = localStorage.getItem(`tp_ph_${myAllianceId}`);
    if (stored) {
      try { setPlaceholders(JSON.parse(stored)); } catch {}
    } else {
      // Migrate from older key name if present
      const legacy = localStorage.getItem(`tp_placeholders_${myAllianceId}`);
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy);
          setPlaceholders(parsed);
          localStorage.setItem(`tp_ph_${myAllianceId}`, legacy);
        } catch {}
      }
    }
  }, [myAllianceId]);

  function savePlaceholders(newList) {
    setPlaceholders(newList);
    if (myAllianceId) localStorage.setItem(`tp_ph_${myAllianceId}`, JSON.stringify(newList));
  }

  function addPlaceholder() {
    const name = newPlaceholderName.trim();
    if (!name) return;
    const newPh = { id: 'ph_' + Date.now(), name };
    savePlaceholders([...placeholders, newPh]);
    setNewPlaceholderName('');
  }

  function removePlaceholder(id) {
    savePlaceholders(placeholders.filter(p => p.id !== id));
  }

  // ── Derived: allMembers merges real + placeholders ────────────────
  const allMembers = [
    ...members,
    ...placeholders.map(p => ({ ...p, username: p.name, is_placeholder: true })),
  ];

  // ── Load all schedules ────────────────────────────────────────────
  useEffect(() => {
    if (!myAllianceId) { setLoading(false); return; }

    async function load() {
      const [{ data: al }, { data: mems }] = await Promise.all([
        supabase.from('alliances').select('id, name, color, server_id').eq('id', myAllianceId).single(),
        supabase.from('members').select('id, username, in_game_name, power1, troop1, alliance_role').eq('alliance_id', myAllianceId).order('username'),
      ]);
      setAlliance(al);
      setMembers(mems ?? []);

      const { data: scheds } = await supabase
        .from('train_schedules')
        .select('*')
        .eq('alliance_id', myAllianceId)
        .order('week_label');

      const rows = scheds ?? [];
      setAllSchedules(rows);

      const todayMonday = toDateString(getMondayDate());
      let target = rows.find(s => s.week_label === todayMonday);
      if (!target && rows.length > 0) target = rows[rows.length - 1];

      if (target) {
        applySchedule(target);
      } else {
        setCurrentWeekKey(todayMonday);
        setScheduleId(null);
        setSlots(EMPTY_SLOTS());
        setDriverQueue([]);
        setVipQueue([]);
      }
      setLoading(false);
    }
    load();
  }, [myAllianceId]);

  function applySchedule(sched) {
    setScheduleId(sched.id);
    setCurrentWeekKey(sched.week_label ?? '');

    const cfg = sched.mode_config ?? {};
    const { driverQueue: dq, vipQueue: vq } = deriveQueuesFromLegacy(cfg);
    setDriverQueue(dq);
    setVipQueue(vq);

    supabase
      .from('train_slots')
      .select('*')
      .eq('schedule_id', sched.id)
      .then(({ data: dbSlots }) => {
        setSlots(initSlots(dbSlots));
        setIsDirty(false);
      });
  }

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!myAllianceId) return;
    setSaving(true);

    const modeConfig = { driverQueue, vipQueue };
    const wLabel = currentWeekKey || toDateString(getMondayDate());

    let sid = scheduleId;
    if (!sid) {
      const { data } = await supabase
        .from('train_schedules')
        .insert({ alliance_id: myAllianceId, mode: 'unified', week_label: wLabel, mode_config: modeConfig })
        .select('id').single();
      sid = data?.id;
      if (sid) {
        setScheduleId(sid);
        const newSched = { id: sid, alliance_id: myAllianceId, mode: 'unified', week_label: wLabel, mode_config: modeConfig };
        setAllSchedules(prev => {
          const filtered = prev.filter(s => s.week_label !== wLabel);
          return [...filtered, newSched].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
        });
      }
    } else {
      await supabase.from('train_schedules')
        .update({ mode: 'unified', week_label: wLabel, mode_config: modeConfig })
        .eq('id', sid);
      setAllSchedules(prev => prev.map(s => s.id === sid ? { ...s, mode: 'unified', week_label: wLabel, mode_config: modeConfig } : s));
    }

    if (!sid) { setSaving(false); return; }

    const rows = [];
    DAYS.forEach((_, d) => {
      ROLES.forEach(r => {
        const slot = slots[`${d}-${r}`];
        rows.push({ schedule_id: sid, day_of_week: d, role: r, member_id: slot?.memberId ?? null, locked: slot?.locked ?? false });
      });
    });
    await supabase.from('train_slots').upsert(rows, { onConflict: 'schedule_id,day_of_week,role' });

    setSaving(false);
    setSaved(true);
    setIsDirty(false);
    setTimeout(() => setSaved(false), 2500);
  }, [myAllianceId, scheduleId, currentWeekKey, slots, driverQueue, vipQueue]);

  // ── Unsaved changes guard ─────────────────────────────────────────
  function guardedNavigateWeek(dir) {
    if (isDirty) { setPendingNav({ type: 'week', dir }); return; }
    navigateWeek(dir);
  }

  async function handleUnsavedSave() {
    await handleSave();
    const nav = pendingNav;
    setPendingNav(null);
    setTimeout(() => executePendingNav(nav), 100);
  }

  function handleUnsavedDiscard() {
    const nav = pendingNav;
    setIsDirty(false);
    setPendingNav(null);
    executePendingNav(nav);
  }

  function executePendingNav(nav) {
    if (!nav) return;
    if (nav.type === 'week') navigateWeek(nav.dir);
    else if (nav.type === 'date') {
      if (nav.sched) applySchedule(nav.sched);
      else { setScheduleId(null); setCurrentWeekKey(nav.key); setSlots(EMPTY_SLOTS()); setIsDirty(false); }
    } else if (nav.type === 'newweek') {
      doCreateNextWeek();
    }
  }

  // ── Week navigation ───────────────────────────────────────────────
  function navigateWeek(dir) {
    const sorted = [...allSchedules].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
    const idx = sorted.findIndex(s => s.id === scheduleId);
    if (dir === -1 && idx > 0) applySchedule(sorted[idx - 1]);
    else if (dir === 1 && idx < sorted.length - 1) applySchedule(sorted[idx + 1]);
  }

  async function handleDeleteWeek() {
    if (!scheduleId) { alert('This week has not been saved yet — nothing to delete.'); return; }
    if (!confirm('Delete this entire week\'s schedule? This cannot be undone.')) return;
    await supabase.from('train_slots').delete().eq('schedule_id', scheduleId);
    await supabase.from('train_schedules').delete().eq('id', scheduleId);
    const remaining = allSchedules.filter(s => s.id !== scheduleId);
    setAllSchedules(remaining);
    if (remaining.length > 0) {
      const sorted = [...remaining].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
      applySchedule(sorted[sorted.length - 1]);
    } else {
      setScheduleId(null);
      setCurrentWeekKey(toDateString(getMondayDate()));
      setSlots(EMPTY_SLOTS());
      setDriverQueue([]);
      setVipQueue([]);
      setIsDirty(false);
    }
  }

  // ── "+ NEXT WEEK" — one-click: duplicate queues, clear locks, advance label ──
  function createNextWeek() {
    if (isDirty) { setPendingNav({ type: 'newweek' }); return; }
    doCreateNextWeek();
  }

  function doCreateNextWeek() {
    const sorted = [...allSchedules].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
    const baseDate = nextWeekDate(sorted);
    const newKey = toDateString(baseDate);
    if (allSchedules.some(s => s.week_label === newKey)) { alert('A schedule for that week already exists.'); return; }

    setScheduleId(null);
    setCurrentWeekKey(newKey);
    // Duplicate current queues; clear per-slot locks/assignments for the new week
    setSlots(EMPTY_SLOTS());
    setIsDirty(true);
  }

  // ── Auto-fill ──────────────────────────────────────────────────────
  function generate() {
    setSlots(prev => autoFillSlots(prev, driverQueue, vipQueue));
    markDirty();
  }

  // ── Slot assignment ───────────────────────────────────────────────
  function lockSlot(key, memberId) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { memberId, locked: true } }));
    markDirty();
  }

  function setSlotAuto(key) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], locked: false } }));
    markDirty();
    generateAfter();
  }

  function generateAfter() {
    setTimeout(() => {
      setSlots(prev => autoFillSlots(prev, driverQueue, vipQueue));
    }, 0);
  }

  function clearSlot(key) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { memberId: null, locked: false } }));
    markDirty();
  }

  // ── Export ────────────────────────────────────────────────────────
  function handleExport() {
    const allianceName = alliance?.name || 'Alliance';
    const weekRange = currentWeekKey ? formatWeekRange(currentWeekKey) : 'Unknown Week';
    const lines = [
      `TRAIN SCHEDULE — ${allianceName}`,
      weekRange,
      '',
    ];
    DAYS.forEach((day, d) => {
      const driverSlot = slots[`${d}-driver`];
      const vipSlot    = slots[`${d}-vip`];
      const driverMem  = driverSlot?.memberId ? memberById[driverSlot.memberId] : null;
      const vipMem     = vipSlot?.memberId    ? memberById[vipSlot.memberId]    : null;
      const dName = driverMem ? memberName(driverMem) : '— OPEN —';
      const vName = vipMem    ? memberName(vipMem)    : '— OPEN —';
      lines.push(`${day}  Driver: ${dName}  VIP: ${vName}`);
    });
    const text = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setToast('COPIED!');
        setTimeout(() => setToast(''), 2000);
      });
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
      a.download = `train-schedule-${currentWeekKey || 'week'}.txt`;
      a.click();
    }
  }

  // ── Bulk generate weeks ───────────────────────────────────────────
  async function handleGenerateWeeks() {
    if (!myAllianceId || !mtFirstWeek) return;
    setMtGenerating(true);
    const startMonday = getMondayDate(new Date(mtFirstWeek + 'T00:00:00'));
    const weeks = parseInt(mtWeeksAhead, 10) || 4;
    let reloaded = [...allSchedules];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(startMonday.getTime() + i * 7 * 24 * 3600000);
      const label = toDateString(d);
      if (reloaded.some(s => s.week_label === label)) continue;
      const { data } = await supabase
        .from('train_schedules')
        .insert({ alliance_id: myAllianceId, mode: 'unified', week_label: label, mode_config: { driverQueue, vipQueue } })
        .select('*').single();
      if (data) reloaded = [...reloaded, data];
    }
    reloaded.sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
    setAllSchedules(reloaded);
    setMtGenerating(false);
    setToast(`Generated weeks!`);
    setTimeout(() => setToast(''), 2000);
  }

  async function handleDeleteWeekFromModal(sched) {
    if (!confirm('Delete this week\'s schedule?')) return;
    await supabase.from('train_slots').delete().eq('schedule_id', sched.id);
    await supabase.from('train_schedules').delete().eq('id', sched.id);
    const remaining = allSchedules.filter(s => s.id !== sched.id);
    setAllSchedules(remaining);
    if (sched.id === scheduleId) {
      if (remaining.length > 0) {
        const sorted = [...remaining].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
        applySchedule(sorted[sorted.length - 1]);
      } else {
        setScheduleId(null);
        setCurrentWeekKey(toDateString(getMondayDate()));
        setSlots(EMPTY_SLOTS());
        setIsDirty(false);
      }
    }
  }

  // ── Derived ───────────────────────────────────────────────────────
  const memberById = Object.fromEntries(allMembers.map(m => [m.id, m]));

  // ── Queue helpers ─────────────────────────────────────────────────
  function addToQueue(which, memberId) {
    const setArr = which === 'driver' ? setDriverQueue : setVipQueue;
    setArr(a => a.includes(memberId) ? a : [...a, memberId]);
    markDirty();
  }
  function removeFromQueue(which, memberId) {
    const setArr = which === 'driver' ? setDriverQueue : setVipQueue;
    setArr(a => a.filter(id => id !== memberId));
    markDirty();
  }
  function moveQueueItem(which, i, dir) {
    const arr = which === 'driver' ? driverQueue : vipQueue;
    const setArr = which === 'driver' ? setDriverQueue : setVipQueue;
    const n = [...arr];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setArr(n);
    markDirty();
  }
  function reverseQueue(which) {
    const setArr = which === 'driver' ? setDriverQueue : setVipQueue;
    setArr(a => [...a].reverse());
    markDirty();
  }
  function shuffleQueue(which) {
    const setArr = which === 'driver' ? setDriverQueue : setVipQueue;
    setArr(a => {
      const n = [...a];
      for (let i = n.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [n[i], n[j]] = [n[j], n[i]];
      }
      return n;
    });
    markDirty();
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a7898', fontFamily: 'monospace' }}>
      LOADING TRAIN PLANNER…
    </div>
  );

  if (!myAllianceId) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', gap: 16 }}>
      <style>{FONT}</style>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '2px' }}>NO ALLIANCE</div>
      <p style={{ color: '#5a7898', fontSize: 13 }}>You must be logged in as an alliance member to use the train planner.</p>
      <button onClick={() => navigate(`/server/${serverId}`)} style={S.backBtn}><ArrowLeft size={14} /> BACK</button>
    </div>
  );

  const sortedScheds = [...allSchedules].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
  const schedIdx = sortedScheds.findIndex(s => s.id === scheduleId);

  return (
    <div style={{ height: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', overflow: 'hidden', position: 'relative' }}>
      <ParticleBackground />
      <style>{FONT}
        {`
        @media (max-width: 768px) {
          .tp-left-panel { position: fixed !important; top: 0; left: 0; height: 100vh; z-index: 60; transform: translateX(var(--left-tx, -100%)); transition: transform 0.2s; }
          .tp-left-panel.open { transform: translateX(0) !important; }
          .tp-mobile-only { display: flex !important; }
        }
        `}
      </style>

      {/* ── Unsaved changes dialog ───────────────────────────────── */}
      {pendingNav && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0d1520', border: '1px solid rgba(240,165,0,0.4)', padding: '28px 32px', maxWidth: 380, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500', marginBottom: 12 }}>UNSAVED CHANGES</div>
            <p style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>You have unsaved changes. Save before continuing?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleUnsavedSave} style={{ flex: 1, padding: '9px', background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.4)', color: '#f0a500', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>SAVE</button>
              <button onClick={handleUnsavedDiscard} style={{ flex: 1, padding: '9px', background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.3)', color: '#ff4060', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>DISCARD</button>
              <button onClick={() => setPendingNav(null)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Advanced panel (bulk generate + placeholders) ───────── */}
      {managePanelOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0' }}
          onClick={e => { if (e.target === e.currentTarget) setManagePanelOpen(false); }}
        >
          <div style={{ background: '#0d1520', border: '1px solid #1e3550', width: '90%', maxWidth: 560, padding: '0 0 24px', position: 'relative', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e3550' }}>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500' }}>⚙ ADVANCED</div>
              <button onClick={() => setManagePanelOpen(false)} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', fontSize: 18, lineHeight: 1, minWidth: 44, minHeight: 44 }}>×</button>
            </div>

            <div style={{ padding: '20px 20px 0' }}>
              {/* Bulk generate weeks */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>BULK GENERATE WEEKS</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#5a7898', fontWeight: 700, letterSpacing: '1.5px', marginBottom: 4 }}>FIRST WEEK STARTS ON (MONDAY)</div>
                    <input
                      type="date"
                      value={mtFirstWeek}
                      onChange={e => {
                        const d = new Date(e.target.value + 'T00:00:00');
                        const monday = getMondayDate(d);
                        setMtFirstWeek(toDateString(monday));
                      }}
                      style={{ ...S.sel, width: 'auto', minWidth: 160, minHeight: 44 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#5a7898', fontWeight: 700, letterSpacing: '1.5px', marginBottom: 4 }}>PLAN AHEAD (WEEKS)</div>
                    <input
                      type="number"
                      min={1} max={20}
                      value={mtWeeksAhead}
                      onChange={e => setMtWeeksAhead(Math.max(1, Math.min(20, parseInt(e.target.value) || 4)))}
                      style={{ ...S.sel, width: 80, minHeight: 44 }}
                    />
                  </div>
                  <button
                    onClick={handleGenerateWeeks}
                    disabled={!mtFirstWeek || mtGenerating}
                    style={{ ...S.genBtn, width: 'auto', padding: '8px 16px', opacity: !mtFirstWeek ? 0.5 : 1, minHeight: 44 }}
                  >
                    {mtGenerating ? 'GENERATING…' : 'GENERATE WEEKS'}
                  </button>
                </div>
              </div>

              {/* All weeks table */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>ALL WEEKS ({sortedScheds.length})</div>
                {sortedScheds.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic' }}>No weeks saved yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e3550' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>WK #</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>DATE RANGE</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedScheds.map((s, i) => {
                        const isActive = s.id === scheduleId;
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid rgba(30,53,80,0.5)', background: isActive ? 'rgba(240,165,0,0.05)' : 'transparent' }}>
                            <td style={{ padding: '6px 8px', color: isActive ? '#f0a500' : '#7a9bb8', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ padding: '6px 8px', fontFamily: "'Share Tech Mono',monospace", color: isActive ? '#f0a500' : '#d0e4f4', fontSize: 10 }}>{formatWeekRange(s.week_label)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {canEdit && (
                                <button
                                  onClick={() => handleDeleteWeekFromModal(s)}
                                  style={{ background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.25)', color: '#ff4060', cursor: 'pointer', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, minHeight: 32 }}
                                >
                                  DELETE
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Placeholder Members */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>PLACEHOLDER MEMBERS</div>
                <p style={{ fontSize: 11, color: '#5a7898', lineHeight: 1.6, marginBottom: 12 }}>
                  Placeholder members can be assigned to train slots without being real accounts. Useful for reserved spots.
                </p>
                {placeholders.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {placeholders.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', marginBottom: 3, background: 'rgba(90,120,152,0.1)', border: '1px solid rgba(90,120,152,0.25)' }}>
                        <span style={{ flex: 1, fontSize: 11, color: '#d0e4f4', fontWeight: 700 }}>{p.name}</span>
                        <span style={{ fontSize: 9, color: '#5a7898', fontWeight: 700 }}>(P)</span>
                        <button onClick={() => removePlaceholder(p.id)} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', minWidth: 32, minHeight: 32 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Placeholder name…"
                    value={newPlaceholderName}
                    onChange={e => setNewPlaceholderName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPlaceholder()}
                    style={{ ...S.sel, flex: 1, minHeight: 44 }}
                  />
                  <button onClick={addPlaceholder} style={{ ...S.genBtn, width: 'auto', padding: '6px 16px', minHeight: 44 }}>ADD</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.5)', color: '#00e87a', padding: '8px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '2px', pointerEvents: 'none' }}>
          {toast}
        </div>
      )}

      {/* ── Topbar ──────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(8,13,20,0.97)', borderBottom: '1px solid #1e3550', flexShrink: 0, zIndex: 50 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <button className="tp-mobile-only" onClick={() => setLeftOpen(o => !o)} style={{ ...S.iconBtn, display: 'none' }} title="Toggle weeks panel"><Menu size={14} /></button>
          <button onClick={() => navigate(`/server/${serverId}/alliance`)} style={S.iconBtn}><ArrowLeft size={15} /></button>
          <Train size={15} style={{ color: '#f0a500', flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500' }}>TRAIN PLANNER</div>
          {alliance && <div style={{ fontSize: 13, color: '#c0d8f0', marginLeft: 4 }}>— {alliance.name}</div>}
          {isDirty && <div style={{ fontSize: 10, color: '#f0a500', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', padding: '2px 7px', letterSpacing: '1px', fontWeight: 700 }}>UNSAVED</div>}
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderTop: '1px solid rgba(30,53,80,0.4)', background: 'rgba(5,10,18,0.5)' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#8aadcc' }}>WEEK:</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#ffffff', fontWeight: 700 }}>
            {currentWeekKey ? formatWeekRange(currentWeekKey) : '— no week —'}
          </span>
          {sortedScheds.length > 1 && schedIdx >= 0 && (
            <span style={{ fontSize: 10, color: '#8aadcc' }}>{schedIdx + 1}/{sortedScheds.length}</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => guardedNavigateWeek(-1)} disabled={schedIdx <= 0} style={{ ...S.weekNavBtn, opacity: schedIdx <= 0 ? 0.3 : 1 }}><ChevronLeft size={12} /> PREV</button>
          <button onClick={() => guardedNavigateWeek(1)} disabled={schedIdx >= sortedScheds.length - 1} style={{ ...S.weekNavBtn, opacity: schedIdx >= sortedScheds.length - 1 ? 0.3 : 1 }}>NEXT <ChevronRight size={12} /></button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ── Left: Week sidebar ─────────────────────────────────── */}
        <div
          className={`tp-left-panel${leftOpen ? ' open' : ''}`}
          style={{ width: 240, minWidth: 240, background: 'rgba(5,10,18,0.98)', borderRight: '1px solid #1e3550', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div style={{ flexShrink: 0, padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {canEdit && (
              <button onClick={createNextWeek} style={{ ...S.genBtn, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.4)', color: '#00e87a', minHeight: 44 }}>
                <Plus size={13} /> NEXT WEEK
              </button>
            )}
            <div style={{ display: 'flex', gap: 5 }}>
              {canEdit && (
                <button onClick={() => setManagePanelOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px', background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '1px', cursor: 'pointer', minHeight: 40 }}>
                  <Settings size={11} /> ADVANCED
                </button>
              )}
              <button onClick={handleExport} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px', background: 'transparent', border: '1px solid #1e3550', color: '#8aadcc', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '1px', cursor: 'pointer', minHeight: 40 }}>
                <Download size={11} /> EXPORT
              </button>
            </div>
            {canEdit && (
              <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px', background: saved ? 'rgba(0,232,122,0.1)' : 'rgba(240,165,0,0.1)', border: `1px solid ${saved ? 'rgba(0,232,122,0.5)' : 'rgba(240,165,0,0.5)'}`, color: saved ? '#00e87a' : '#f0a500', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', cursor: saving ? 'default' : 'pointer', minHeight: 44 }}>
                <Save size={11} />{saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 10px 4px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#8aadcc' }}>WEEKS ({sortedScheds.length})</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedScheds.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 10, color: '#5a7898', fontStyle: 'italic' }}>No saved weeks yet. Save to create one.</div>
            )}
            {sortedScheds.map((s, i) => {
              const isActive = s.id === scheduleId;
              const label = formatWeekRange(s.week_label);
              return (
                <div
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: isActive ? 'rgba(240,165,0,0.07)' : 'transparent', borderLeft: isActive ? '2px solid #f0a500' : '2px solid transparent', cursor: 'pointer', minHeight: 44 }}
                  onClick={() => {
                    if (!isActive) {
                      if (isDirty) { setPendingNav({ type: 'date', key: s.week_label, sched: s }); }
                      else applySchedule(s);
                    }
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: isActive ? '#f0a500' : '#c0d8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                    <div style={{ fontSize: 9, color: '#8aadcc', letterSpacing: '1px' }}>WK {i + 1}</div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (isActive) { handleDeleteWeek(); }
                        else {
                          if (!confirm('Delete this week\'s schedule?')) return;
                          supabase.from('train_slots').delete().eq('schedule_id', s.id).then(() =>
                            supabase.from('train_schedules').delete().eq('id', s.id)
                          );
                          setAllSchedules(prev => prev.filter(x => x.id !== s.id));
                        }
                      }}
                      title="Delete week"
                      style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', padding: '2px 4px', fontSize: 14, opacity: 0.6, flexShrink: 0, minWidth: 36, minHeight: 36 }}
                    >🗑</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Center: planner ─────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 10px' : '20px 16px' }}>
          {isMobile && !mobileGridView ? (
            <DayCarousel
              day={mobileDay}
              setDay={setMobileDay}
              slots={slots}
              memberById={memberById}
              canEdit={canEdit}
              onOpenCell={(day, role) => { setActiveCell({ day, role }); setPickerOpen(true); }}
              onSwitchToGrid={() => setMobileGridView(true)}
            />
          ) : (
            <ScheduleGrid
              slots={slots}
              memberById={memberById}
              canEdit={canEdit}
              activeCell={activeCell}
              setActiveCell={setActiveCell}
              setPickerOpen={setPickerOpen}
              isMobile={isMobile}
              mobileGridView={mobileGridView}
              onSwitchToCarousel={() => setMobileGridView(false)}
            />
          )}

          {!isMobile && (
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <QueuePanel
                title="DRIVER QUEUE 🚂"
                color="#f0a500"
                queue={driverQueue}
                allMembers={allMembers}
                memberById={memberById}
                canEdit={canEdit}
                onAdd={id => addToQueue('driver', id)}
                onRemove={id => removeFromQueue('driver', id)}
                onMove={(i, dir) => moveQueueItem('driver', i, dir)}
                onShuffle={() => shuffleQueue('driver')}
                onReverse={() => reverseQueue('driver')}
              />
              <QueuePanel
                title="VIP QUEUE ⭐"
                color="#c87aff"
                queue={vipQueue}
                allMembers={allMembers}
                memberById={memberById}
                canEdit={canEdit}
                onAdd={id => addToQueue('vip', id)}
                onRemove={id => removeFromQueue('vip', id)}
                onMove={(i, dir) => moveQueueItem('vip', i, dir)}
                onShuffle={() => shuffleQueue('vip')}
                onReverse={() => reverseQueue('vip')}
              />
            </div>
          )}

          {canEdit && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <button onClick={generate} style={{ ...S.genBtn, width: 'auto', padding: '10px 24px', minHeight: 44 }}>
                <Shuffle size={13} /> AUTO-FILL FROM QUEUES
              </button>
            </div>
          )}

          {isMobile && (
            <div style={{ marginTop: 20 }}>
              <QueuePanel
                title="DRIVER QUEUE 🚂"
                color="#f0a500"
                queue={driverQueue}
                allMembers={allMembers}
                memberById={memberById}
                canEdit={canEdit}
                onAdd={id => addToQueue('driver', id)}
                onRemove={id => removeFromQueue('driver', id)}
                onMove={(i, dir) => moveQueueItem('driver', i, dir)}
                onShuffle={() => shuffleQueue('driver')}
                onReverse={() => reverseQueue('driver')}
              />
              <div style={{ height: 16 }} />
              <QueuePanel
                title="VIP QUEUE ⭐"
                color="#c87aff"
                queue={vipQueue}
                allMembers={allMembers}
                memberById={memberById}
                canEdit={canEdit}
                onAdd={id => addToQueue('vip', id)}
                onRemove={id => removeFromQueue('vip', id)}
                onMove={(i, dir) => moveQueueItem('vip', i, dir)}
                onShuffle={() => shuffleQueue('vip')}
                onReverse={() => reverseQueue('vip')}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Member picker (cell action: lock / auto / clear) ───────── */}
      {pickerOpen && activeCell && (
        <CellActionSheet
          cell={activeCell}
          slots={slots}
          allMembers={allMembers}
          memberById={memberById}
          canEdit={canEdit}
          isMobile={isMobile}
          onLock={memberId => { lockSlot(`${activeCell.day}-${activeCell.role}`, memberId); setPickerOpen(false); setActiveCell(null); }}
          onAuto={() => { setSlotAuto(`${activeCell.day}-${activeCell.role}`); setPickerOpen(false); setActiveCell(null); }}
          onClear={() => { clearSlot(`${activeCell.day}-${activeCell.role}`); setPickerOpen(false); setActiveCell(null); }}
          onClose={() => { setPickerOpen(false); setActiveCell(null); }}
        />
      )}
    </div>
  );
}

// ── Day carousel (mobile) ───────────────────────────────────────────
function DayCarousel({ day, setDay, slots, memberById, canEdit, onOpenCell, onSwitchToGrid }) {
  function go(delta) {
    setDay(d => (d + delta + 7) % 7);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => go(-1)} style={{ ...S.iconBtn, width: 44, height: 44 }} title="Previous day"><ChevronLeft size={18} /></button>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '3px', color: '#d0e4f4' }}>{DAYS[day]}</div>
        <button onClick={() => go(1)} style={{ ...S.iconBtn, width: 44, height: 44 }} title="Next day"><ChevronRight size={18} /></button>
      </div>

      {/* Dot indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
        {DAYS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i)}
            title={d}
            style={{
              width: i === day ? 14 : 10, height: i === day ? 14 : 10, borderRadius: '50%',
              border: 'none', cursor: 'pointer', padding: 0,
              background: i === day ? '#f0a500' : '#1e3550',
              minWidth: 30, minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{
              width: i === day ? 14 : 8, height: i === day ? 14 : 8, borderRadius: '50%',
              background: i === day ? '#f0a500' : '#1e3550', display: 'block',
            }} />
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ROLES.map(role => {
          const meta = ROLE_META[role];
          const key = `${day}-${role}`;
          const slot = slots[key] ?? {};
          const member = slot.memberId ? memberById[slot.memberId] : null;
          return (
            <button
              key={role}
              onClick={() => canEdit && onOpenCell(day, role)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '16px',
                background: member ? `${meta.color}18` : 'rgba(20,35,55,0.35)',
                border: `1px solid ${slot.locked ? `${meta.color}80` : member ? `${meta.color}50` : '#1e3550'}`,
                cursor: canEdit ? 'pointer' : 'default', textAlign: 'left', minHeight: 64, width: '100%',
              }}
            >
              <div style={{ fontSize: 24 }}>{meta.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: meta.color }}>{meta.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: member ? '#ffffff' : '#5a7890' }}>
                  {member ? memberName(member) : '— OPEN —'}
                </div>
              </div>
              <StateIcon locked={slot.locked} hasMember={!!member} />
            </button>
          );
        })}
      </div>

      <button onClick={onSwitchToGrid} style={{ marginTop: 16, width: '100%', padding: '10px', background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
        SHOW 7-DAY GRID
      </button>
    </div>
  );
}

function StateIcon({ locked, hasMember }) {
  if (locked) return <span style={{ fontSize: 18 }} title="Locked">🔒</span>;
  if (hasMember) return <span style={{ fontSize: 18 }} title="Auto">🔄</span>;
  return <span style={{ fontSize: 18 }} title="Empty">⬜</span>;
}

// ── Schedule Grid (desktop / tablet, or mobile grid-view toggle) ───
function ScheduleGrid({ slots, memberById, canEdit, activeCell, setActiveCell, setPickerOpen, isMobile, mobileGridView, onSwitchToCarousel }) {
  return (
    <div>
      {isMobile && mobileGridView && (
        <button onClick={onSwitchToCarousel} style={{ marginBottom: 12, padding: '10px 16px', background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
          SHOW DAY VIEW
        </button>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 80, padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#5a7898', borderBottom: '1px solid #1e3550' }}></th>
              {DAYS.map((d) => (
                <th key={d} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#d0e4f4', borderBottom: '1px solid #1e3550', minWidth: 90 }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map(role => {
              const meta = ROLE_META[role];
              return (
                <tr key={role}>
                  <td style={{ padding: '8px 10px 8px 0', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: meta.color }}>
                      {meta.icon} {meta.label}
                    </div>
                  </td>
                  {DAYS.map((_, d) => {
                    const key = `${d}-${role}`;
                    const slot = slots[key] ?? {};
                    const member = slot.memberId ? memberById[slot.memberId] : null;
                    const isActive = activeCell && activeCell.day === d && activeCell.role === role;

                    return (
                      <td key={d} style={{ padding: '4px 3px', verticalAlign: 'top' }}>
                        <div
                          onClick={() => { if (canEdit) { setActiveCell({ day: d, role }); setPickerOpen(true); } }}
                          style={{
                            minHeight: 56, borderRadius: 2, padding: '8px',
                            background: isActive ? `${meta.color}28` : member ? `${meta.color}18` : 'rgba(20,35,55,0.35)',
                            border: `1px solid ${isActive ? meta.color : slot.locked ? `${meta.color}80` : member ? `${meta.color}50` : '#1e3550'}`,
                            cursor: canEdit ? 'pointer' : 'default',
                            position: 'relative', transition: 'border-color 0.1s',
                            boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4,
                            justifyContent: 'center', alignItems: 'center', minWidth: 44,
                          }}
                        >
                          <div style={{ position: 'absolute', top: 4, right: 4 }}>
                            <StateIcon locked={slot.locked} hasMember={!!member} />
                          </div>
                          {member ? (
                            <>
                              <div style={{ width: 28, height: 28, borderRadius: 2, background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#080d14' }}>
                                {memberInitials(member)}
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.2 }}>
                                {memberName(member)}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: '#5a7890', fontFamily: "'Rajdhani',sans-serif" }}>OPEN</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#6a8aa8' }}>
        <span>🔄 Auto</span>
        <span>🔒 Locked</span>
        <span>⬜ Empty</span>
        {canEdit && <span>Click a cell to lock, auto-fill, or clear it</span>}
      </div>
    </div>
  );
}

// ── Cell action sheet / popover (lock / auto / clear) ───────────────
function CellActionSheet({ cell, slots, allMembers, canEdit, isMobile, onLock, onAuto, onClear, onClose }) {
  const [search, setSearch] = useState('');
  const key = `${cell.day}-${cell.role}`;
  const slot = slots[key] ?? {};
  const meta = ROLE_META[cell.role];

  const filtered = allMembers.filter(m => memberName(m).toLowerCase().includes(search.toLowerCase()));

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e3550' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', color: meta.color }}>
          {meta.icon} {DAYS[cell.day]} — {meta.label}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
          <button onClick={onAuto} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.3)', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
            🔄 SET AUTO
          </button>
          <button onClick={onClear} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.3)', color: '#ff4060', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
            ⬜ CLEAR
          </button>
        </div>
      )}

      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#5a7898', marginBottom: 6 }}>LOCK TO MEMBER</div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#5a7898' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members…"
            style={{ width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 10px 10px 30px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none', boxSizing: 'border-box', minHeight: 44 }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', maxHeight: isMobile ? '40vh' : 320 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic', padding: '8px 0' }}>No members found.</div>
        )}
        {filtered.map(m => {
          const isCurrent = slot.memberId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => canEdit && onLock(m.id)}
              disabled={!canEdit}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '10px 10px', marginBottom: 4,
                background: isCurrent ? 'rgba(240,165,0,0.1)' : 'transparent',
                border: `1px solid ${isCurrent ? 'rgba(240,165,0,0.4)' : '#1e3550'}`,
                cursor: canEdit ? 'pointer' : 'default', minHeight: 44,
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 2, background: m.is_placeholder ? '#2a4058' : '#1e3550', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#d0e4f4', flexShrink: 0 }}>
                {memberInitials(m)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isCurrent ? '#f0a500' : '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {memberName(m)} {m.is_placeholder && <span style={{ fontSize: 9, color: '#5a7898' }}>(P)</span>}
                </div>
                {m.power1 && !m.is_placeholder && (
                  <div style={{ fontSize: 9, color: '#5a7898', fontFamily: "'Share Tech Mono',monospace" }}>{m.power1}B{m.troop1 ? ` · ${m.troop1}` : ''}</div>
                )}
              </div>
              {isCurrent && <Lock size={13} style={{ color: '#f0a500', flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background: '#0d1520', borderTop: '1px solid #1e3550', width: '100%', height: '62vh', display: 'flex', flexDirection: 'column', borderRadius: '12px 12px 0 0' }}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#0d1520', border: '1px solid #1e3550', width: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
    </div>
  );
}

// ── Queue panel (driver / vip ordered list editor) ───────────────────
function QueuePanel({ title, color, queue, allMembers, memberById, canEdit, onAdd, onRemove, onMove, onShuffle, onReverse }) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const available = allMembers.filter(m => !queue.includes(m.id) && memberName(m).toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ border: `1px solid ${color}30`, background: `${color}08`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color }}>{title}</div>
        {canEdit && queue.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onShuffle} title="Shuffle" style={{ ...S.qIconBtn, color }}>
              <Shuffle size={13} />
            </button>
            <button onClick={onReverse} title="Reverse cycle" style={{ ...S.qIconBtn, color }}>
              <RotateCcw size={13} />
            </button>
          </div>
        )}
      </div>

      {queue.length === 0 && (
        <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic', marginBottom: 8 }}>No members in queue yet.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {queue.map((id, i) => {
          const m = memberById[id];
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: `1px solid ${color}30`, background: `${color}0c` }}>
              <span style={{ fontSize: 10, color: '#5a7898', width: 18, textAlign: 'right', fontFamily: 'monospace' }}>{i + 1}.</span>
              <span style={{ flex: 1, fontSize: 12, color: '#d0e4f4', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m ? memberName(m) : '? (removed)'}
              </span>
              {canEdit && (
                <>
                  <button onClick={() => onMove(i, -1)} disabled={i === 0} style={S.qIconBtn} title="Move up"><ArrowUp size={13} /></button>
                  <button onClick={() => onMove(i, 1)} disabled={i === queue.length - 1} style={S.qIconBtn} title="Move down"><ArrowDown size={13} /></button>
                  <button onClick={() => onRemove(id)} style={{ ...S.qIconBtn, color: '#ff4060' }} title="Remove"><X size={13} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        adding ? (
          <div>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#5a7898' }} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search members…"
                style={{ width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: '8px 8px 8px 26px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, outline: 'none', boxSizing: 'border-box', minHeight: 40 }}
              />
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {available.map(m => (
                <button key={m.id} onClick={() => { onAdd(m.id); setSearch(''); }}
                  style={{ textAlign: 'left', padding: '8px', background: 'transparent', border: '1px solid #1e3550', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, cursor: 'pointer', minHeight: 40 }}>
                  + {memberName(m)}
                </button>
              ))}
              {available.length === 0 && <div style={{ fontSize: 10, color: '#5a7898', fontStyle: 'italic', padding: '4px 0' }}>No matches.</div>}
            </div>
            <button onClick={() => { setAdding(false); setSearch(''); }} style={{ marginTop: 6, width: '100%', padding: '8px', background: 'transparent', border: '1px solid #2a4058', color: '#5a7898', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: 'pointer', minHeight: 40 }}>DONE</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px', background: 'transparent', border: `1px solid ${color}40`, color, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
            <Plus size={13} /> ADD MEMBER
          </button>
        )
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const S = {
  iconBtn: { background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  backBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '8px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  cfgLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#5a7898', marginBottom: 6 },
  genBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  sel: { width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: '6px 8px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11 },
  qIconBtn: { background: 'none', border: 'none', color: '#5a7898', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 28 },
  weekNavBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(30,53,80,0.5)', border: '1px solid #1e3550', color: '#7a9bb8', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', cursor: 'pointer', whiteSpace: 'nowrap' },
};
