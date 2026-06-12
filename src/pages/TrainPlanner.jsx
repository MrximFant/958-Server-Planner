import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Shuffle, Lock, Unlock, RotateCcw, Save, Train, Info, Download, ChevronLeft, ChevronRight, Settings, Menu, Users } from 'lucide-react';

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
    desc: 'Full control. Drag members into any slot.',
    detail: 'Best for alliances with specific rules each week or changing circumstances.',
  },
  {
    id: 'fixed_driver',
    label: 'Fixed Driver',
    icon: '🚂',
    color: '#00e87a',
    desc: 'One person drives every day. VIPs rotate.',
    detail: 'Best when one dedicated player always drives and VIPs are rotated fairly.',
  },
  {
    id: 'paired',
    label: 'Paired Rotation',
    icon: '🔁',
    color: '#f0a500',
    desc: 'Members paired as (Driver, VIP). Roles swap each cycle.',
    detail: 'Pairs rotate through days. Once everyone has gone, Driver↔VIP swap for the next cycle.',
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
    desc: 'Lock specific days for event winners. Rest auto-fills.',
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

function genPaired(pairs, startDate) {
  const slots = EMPTY_SLOTS();
  if (!pairs.length) return slots;
  let offset = 0;
  if (startDate) {
    const start = new Date(startDate + 'T00:00:00');
    const now = getMondayDate();
    const diffMs = now - start;
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 3600 * 1000));
    const cycleLen = pairs.length;
    if (cycleLen > 0) {
      const totalDays = diffWeeks * 7;
      offset = Math.floor(totalDays / cycleLen) % cycleLen;
      const fullCycles = Math.floor(totalDays / cycleLen);
      if (fullCycles % 2 === 1) {
        pairs = pairs.map(p => ({ driver: p.vip, vip: p.driver }));
      }
    }
  }
  pairs.forEach((pair, i) => {
    const dayIdx = (i + offset) % 7;
    if (dayIdx < 7) {
      slots[`${dayIdx}-driver`] = { memberId: pair.driver, locked: false };
      slots[`${dayIdx}-vip`]    = { memberId: pair.vip,    locked: false };
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

function weekLabelFromDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return 'Week of ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  const [weekLabelOverride, setWeekLabelOverride] = useState('');

  // ── Schedule state ───────────────────────────────────────────────
  const [mode,        setMode]        = useState('manual');
  const [slots,       setSlots]       = useState(EMPTY_SLOTS);

  // Mode-specific config state
  const [fixedDriver,     setFixedDriver]     = useState(null);
  const [vipPool,         setVipPool]         = useState([]);
  const [pairs,           setPairs]           = useState([]);
  const [pairedStartDate, setPairedStartDate] = useState('');
  const [driverQueue,     setDriverQueue]     = useState([]);
  const [vipQueue,        setVipQueue]        = useState([]);

  // ── Unsaved changes dialog ────────────────────────────────────────
  const [pendingNav, setPendingNav] = useState(null);

  // ── Drag state ───────────────────────────────────────────────────
  const [dragging,    setDragging]    = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [selected,    setSelected]    = useState(null);

  // ── Panel state ──────────────────────────────────────────────────
  const [membersOpen, setMembersOpen] = useState(true);
  const [leftOpen,    setLeftOpen]    = useState(true);

  // ── Manage Train modal ───────────────────────────────────────────
  const [managingTrain, setManagingTrain] = useState(false);
  const [placeholders,  setPlaceholders]  = useState([]);
  const [newPlaceholderName, setNewPlaceholderName] = useState('');
  // Manage Train modal sub-state
  const [mtFirstWeek,   setMtFirstWeek]   = useState('');
  const [mtWeeksAhead,  setMtWeeksAhead]  = useState(4);
  const [mtGenerating,  setMtGenerating]  = useState(false);

  // Derived label shown in topbar
  const displayLabel = weekLabelOverride || (currentWeekKey ? weekLabelFromDate(currentWeekKey) : 'Current Week');

  function markDirty() { setIsDirty(true); }

  // ── Load placeholders ─────────────────────────────────────────────
  useEffect(() => {
    if (!myAllianceId) return;
    const stored = localStorage.getItem(`tp_placeholders_${myAllianceId}`);
    if (stored) {
      try { setPlaceholders(JSON.parse(stored)); } catch {}
    }
  }, [myAllianceId]);

  function savePlaceholders(newList) {
    setPlaceholders(newList);
    if (myAllianceId) localStorage.setItem(`tp_placeholders_${myAllianceId}`, JSON.stringify(newList));
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
      }
      setLoading(false);
    }
    load();
  }, [myAllianceId]);

  function applySchedule(sched) {
    setScheduleId(sched.id);
    setCurrentWeekKey(sched.week_label ?? '');
    setWeekLabelOverride('');
    setMode(sched.mode ?? 'manual');

    const cfg = sched.mode_config ?? {};
    if (cfg.fixedDriver !== undefined)      setFixedDriver(cfg.fixedDriver);
    if (cfg.vipPool !== undefined)          setVipPool(cfg.vipPool);
    if (cfg.pairs !== undefined)            setPairs(cfg.pairs);
    if (cfg.pairedStartDate !== undefined)  setPairedStartDate(cfg.pairedStartDate);
    if (cfg.driverQueue !== undefined)      setDriverQueue(cfg.driverQueue);
    if (cfg.vipQueue !== undefined)         setVipQueue(cfg.vipQueue);

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

    const modeConfig = { fixedDriver, vipPool, pairs, pairedStartDate, driverQueue, vipQueue };
    const wLabel = currentWeekKey || toDateString(getMondayDate());

    let sid = scheduleId;
    if (!sid) {
      const { data } = await supabase
        .from('train_schedules')
        .insert({ alliance_id: myAllianceId, mode, week_label: wLabel, mode_config: modeConfig })
        .select('id').single();
      sid = data?.id;
      if (sid) {
        setScheduleId(sid);
        const newSched = { id: sid, alliance_id: myAllianceId, mode, week_label: wLabel, mode_config: modeConfig };
        setAllSchedules(prev => {
          const filtered = prev.filter(s => s.week_label !== wLabel);
          return [...filtered, newSched].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
        });
      }
    } else {
      await supabase.from('train_schedules')
        .update({ mode, week_label: wLabel, mode_config: modeConfig })
        .eq('id', sid);
      setAllSchedules(prev => prev.map(s => s.id === sid ? { ...s, mode, week_label: wLabel, mode_config: modeConfig } : s));
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
  }, [myAllianceId, scheduleId, currentWeekKey, mode, slots, fixedDriver, vipPool, pairs, pairedStartDate, driverQueue, vipQueue]);

  // ── Unsaved changes guard ─────────────────────────────────────────
  function guardedNavigateWeek(dir) {
    if (isDirty) { setPendingNav({ type: 'week', dir }); return; }
    navigateWeek(dir);
  }

  function guardedDateChange(key, existingSched) {
    if (isDirty) { setPendingNav({ type: 'date', key, sched: existingSched }); return; }
    if (existingSched) applySchedule(existingSched);
    else { setScheduleId(null); setCurrentWeekKey(key); setWeekLabelOverride(''); setSlots(EMPTY_SLOTS()); setIsDirty(false); }
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
      else { setScheduleId(null); setCurrentWeekKey(nav.key); setWeekLabelOverride(''); setSlots(EMPTY_SLOTS()); setIsDirty(false); }
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
      setIsDirty(false);
    }
  }

  function createNewWeek() {
    const sorted = [...allSchedules].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
    let baseDate;
    if (sorted.length > 0) {
      const lastLabel = sorted[sorted.length - 1].week_label;
      const parsed = new Date(lastLabel + 'T00:00:00');
      if (!isNaN(parsed.getTime())) baseDate = getMondayDate(new Date(parsed.getTime() + 7 * 24 * 3600000));
      else baseDate = getMondayDate(new Date(Date.now() + 7 * 24 * 3600000));
    } else { baseDate = getMondayDate(); }

    const newKey = toDateString(baseDate);
    if (allSchedules.some(s => s.week_label === newKey)) { alert('A schedule for that week already exists.'); return; }

    setScheduleId(null);
    setCurrentWeekKey(newKey);
    setWeekLabelOverride('');
    setSlots(EMPTY_SLOTS());
    setIsDirty(false);
  }

  // ── Auto-generate based on mode ───────────────────────────────────
  function generate() {
    if (mode === 'fixed_driver') {
      setSlots(genFixedDriver(members, fixedDriver, vipPool));
    } else if (mode === 'paired') {
      setSlots(genPaired(pairs, pairedStartDate));
    } else if (mode === 'round_robin') {
      setSlots(genRoundRobin(driverQueue, vipQueue));
    } else if (mode === 'priority') {
      const dPool = members.filter(m => !Object.values(slots).some(s => s.locked && s.memberId === m.id)).map(m => m.id);
      const vPool = [...dPool];
      setSlots(genPriority(slots, dPool, vPool));
    }
    markDirty();
  }

  // ── Fixed Driver roll-to-next-week ───────────────────────────────
  function rollVipToNextWeek() {
    if (vipPool.length < 2) return;
    const next = [...vipPool.slice(1), vipPool[0]];
    setVipPool(next);
    setSlots(genFixedDriver(members, fixedDriver, next));
    markDirty();
  }

  // ── Slot assignment ───────────────────────────────────────────────
  function assignSlot(key, memberId) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], memberId } }));
    markDirty();
  }

  function clearSlot(key) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], memberId: null } }));
    markDirty();
  }

  function toggleLock(key) {
    if (!canEdit) return;
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], locked: !prev[key]?.locked } }));
    markDirty();
  }

  function clearAll() {
    if (!confirm('Clear all slots?')) return;
    setSlots(EMPTY_SLOTS());
    markDirty();
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
    if (fromSlot && fromSlot !== key) {
      setSlots(prev => {
        const targetMemberId = prev[key]?.memberId ?? null;
        return {
          ...prev,
          [fromSlot]: { ...prev[fromSlot], memberId: targetMemberId },
          [key]:      { ...prev[key],      memberId },
        };
      });
    } else {
      assignSlot(key, memberId);
    }
    setDragging(null);
    setSelected(null);
    markDirty();
  }
  function onDropPool(e) {
    e.preventDefault();
    if (!dragging?.fromSlot) return;
    clearSlot(dragging.fromSlot);
    setDragging(null);
  }

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

  // ── Generate weeks (Manage Train modal) ──────────────────────────
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
        .insert({ alliance_id: myAllianceId, mode: 'manual', week_label: label, mode_config: {} })
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

  function handleAddSingleWeek() {
    const sorted = [...allSchedules].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
    let baseDate;
    if (sorted.length > 0) {
      const lastLabel = sorted[sorted.length - 1].week_label;
      const parsed = new Date(lastLabel + 'T00:00:00');
      if (!isNaN(parsed.getTime())) baseDate = getMondayDate(new Date(parsed.getTime() + 7 * 24 * 3600000));
      else baseDate = getMondayDate(new Date(Date.now() + 7 * 24 * 3600000));
    } else { baseDate = getMondayDate(); }
    const newKey = toDateString(baseDate);
    if (allSchedules.some(s => s.week_label === newKey)) { alert('A schedule for that week already exists.'); return; }
    supabase.from('train_schedules')
      .insert({ alliance_id: myAllianceId, mode: 'manual', week_label: newKey, mode_config: {} })
      .select('*').single()
      .then(({ data }) => {
        if (data) {
          setAllSchedules(prev => [...prev, data].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || '')));
        }
      });
  }

  // ── Derived ───────────────────────────────────────────────────────
  const memberById = Object.fromEntries(allMembers.map(m => [m.id, m]));
  const assignedIds = new Set(Object.values(slots).map(s => s.memberId).filter(Boolean));
  const currentMode = MODES.find(m => m.id === mode);

  // ── Pairs helpers ─────────────────────────────────────────────────
  function addPair(driverId, vipId) {
    if (!driverId || !vipId) return;
    setPairs(p => [...p, { driver: driverId, vip: vipId }]);
    markDirty();
  }
  function removePair(i) { setPairs(p => p.filter((_, j) => j !== i)); markDirty(); }
  function swapPairs() { setPairs(p => p.map(pair => ({ driver: pair.vip, vip: pair.driver }))); markDirty(); }

  // ── Queue helpers ─────────────────────────────────────────────────
  function toggleQueue(arr, setArr, memberId) {
    setArr(a => a.includes(memberId) ? a.filter(id => id !== memberId) : [...a, memberId]);
    markDirty();
  }
  function moveQueue(arr, setArr, i, dir) {
    const n = [...arr];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setArr(n);
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
    <div style={{ height: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', overflow: 'hidden' }}>
      <style>{FONT}
        {`
        @media (max-width: 768px) {
          .tp-left-panel { position: fixed !important; top: 0; left: 0; height: 100vh; z-index: 60; transform: translateX(var(--left-tx, -100%)); transition: transform 0.2s; }
          .tp-left-panel.open { transform: translateX(0) !important; }
          .tp-right-panel { position: fixed !important; top: 0; right: 0; height: 100vh; z-index: 60; transform: translateX(var(--right-tx, 100%)); transition: transform 0.2s; }
          .tp-right-panel.open { transform: translateX(0) !important; }
        }
        `}
      </style>

      {/* ── Unsaved changes dialog ───────────────────────────────── */}
      {pendingNav && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0d1520', border: '1px solid rgba(240,165,0,0.4)', padding: '28px 32px', maxWidth: 380, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500', marginBottom: 12 }}>UNSAVED CHANGES</div>
            <p style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>You have unsaved changes. Save before switching weeks?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleUnsavedSave} style={{ flex: 1, padding: '9px', background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.4)', color: '#f0a500', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' }}>SAVE</button>
              <button onClick={handleUnsavedDiscard} style={{ flex: 1, padding: '9px', background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.3)', color: '#ff4060', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' }}>DISCARD</button>
              <button onClick={() => setPendingNav(null)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANAGE TRAIN Modal ───────────────────────────────────── */}
      {managingTrain && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0' }}
          onClick={e => { if (e.target === e.currentTarget) setManagingTrain(false); }}
        >
          <div style={{ background: '#0d1520', border: '1px solid #1e3550', width: '90%', maxWidth: 680, padding: '0 0 24px', position: 'relative', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e3550', marginBottom: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500' }}>⚙ MANAGE TRAIN</div>
              <button onClick={() => setManagingTrain(false)} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '20px 20px 0' }}>

              {/* Section A: Schedule Setup */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>A. SCHEDULE SETUP</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#5a7898', fontWeight: 700, letterSpacing: '1.5px', marginBottom: 4 }}>FIRST WEEK STARTS ON (MONDAY)</div>
                    <input
                      type="date"
                      value={mtFirstWeek}
                      onChange={e => {
                        // Snap to Monday
                        const d = new Date(e.target.value + 'T00:00:00');
                        const monday = getMondayDate(d);
                        setMtFirstWeek(toDateString(monday));
                      }}
                      style={{ ...S.sel, width: 'auto', minWidth: 160 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#5a7898', fontWeight: 700, letterSpacing: '1.5px', marginBottom: 4 }}>PLAN AHEAD (WEEKS)</div>
                    <input
                      type="number"
                      min={1} max={20}
                      value={mtWeeksAhead}
                      onChange={e => setMtWeeksAhead(Math.max(1, Math.min(20, parseInt(e.target.value) || 4)))}
                      style={{ ...S.sel, width: 80 }}
                    />
                  </div>
                  <button
                    onClick={handleGenerateWeeks}
                    disabled={!mtFirstWeek || mtGenerating}
                    style={{ ...S.genBtn, width: 'auto', padding: '8px 16px', opacity: !mtFirstWeek ? 0.5 : 1 }}
                  >
                    {mtGenerating ? 'GENERATING…' : 'GENERATE WEEKS'}
                  </button>
                </div>
              </div>

              {/* Section B: Existing Weeks */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8' }}>B. EXISTING WEEKS ({sortedScheds.length})</div>
                  {canEdit && (
                    <button onClick={handleAddSingleWeek} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#00c8ff', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.25)', padding: '3px 10px', cursor: 'pointer' }}>+ ADD SINGLE WEEK</button>
                  )}
                </div>
                {sortedScheds.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic' }}>No weeks saved yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e3550' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>WK #</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>DATE RANGE</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>MODE</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', color: '#5a7898', fontSize: 9, letterSpacing: '1.5px', fontWeight: 700 }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedScheds.map((s, i) => {
                        const isActive = s.id === scheduleId;
                        const modeInfo = MODES.find(m => m.id === (s.mode || 'manual'));
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid rgba(30,53,80,0.5)', background: isActive ? 'rgba(240,165,0,0.05)' : 'transparent' }}>
                            <td style={{ padding: '6px 8px', color: isActive ? '#f0a500' : '#7a9bb8', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ padding: '6px 8px', fontFamily: "'Share Tech Mono',monospace", color: isActive ? '#f0a500' : '#d0e4f4', fontSize: 10 }}>{formatWeekRange(s.week_label)}</td>
                            <td style={{ padding: '6px 8px', color: modeInfo?.color || '#7a9bb8', fontSize: 10 }}>{modeInfo?.icon} {modeInfo?.label}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {canEdit && (
                                <button
                                  onClick={() => handleDeleteWeekFromModal(s)}
                                  style={{ background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.25)', color: '#ff4060', cursor: 'pointer', padding: '2px 8px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9 }}
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

              {/* Section C: Placeholder Members */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>C. PLACEHOLDER MEMBERS</div>
                <p style={{ fontSize: 11, color: '#5a7898', lineHeight: 1.6, marginBottom: 12 }}>
                  Placeholder members can be assigned to train slots without being real accounts. Useful for reserved spots.
                </p>
                {placeholders.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {placeholders.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', marginBottom: 3, background: 'rgba(90,120,152,0.1)', border: '1px solid rgba(90,120,152,0.25)' }}>
                        <span style={{ flex: 1, fontSize: 11, color: '#d0e4f4', fontWeight: 700 }}>{p.name}</span>
                        <span style={{ fontSize: 9, color: '#5a7898', fontWeight: 700 }}>(P)</span>
                        <button onClick={() => removePlaceholder(p.id)} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
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
                    style={{ ...S.sel, flex: 1 }}
                  />
                  <button onClick={addPlaceholder} style={{ ...S.genBtn, width: 'auto', padding: '6px 16px' }}>ADD</button>
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
        {/* Row 1: title + save */}
        <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderBottom: '1px solid rgba(30,53,80,0.5)' }}>
          {/* Mobile toggles */}
          <button
            className="tp-mobile-only"
            onClick={() => setLeftOpen(o => !o)}
            style={{ ...S.iconBtn, display: 'none' }}
            title="Toggle mode panel"
          >
            <Menu size={14} />
          </button>
          <button onClick={() => navigate(`/server/${serverId}/alliance`)} style={S.iconBtn}><ArrowLeft size={15} /></button>
          <Train size={15} style={{ color: '#f0a500', flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '2px', color: '#f0a500' }}>TRAIN PLANNER</div>
          {alliance && <div style={{ fontSize: 11, color: '#5a7898', marginLeft: 4 }}>— {alliance.name}</div>}
          {isDirty && <div style={{ fontSize: 9, color: '#f0a500', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', padding: '2px 7px', letterSpacing: '1px', fontWeight: 700 }}>UNSAVED</div>}
          <div style={{ flex: 1 }} />
          {canEdit && (
            <button
              onClick={() => setManagingTrain(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(122,155,184,0.08)', border: '1px solid rgba(122,155,184,0.3)', color: '#7a9bb8', padding: '5px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 }}
              title="Manage train schedule"
            >
              <Settings size={12} /> MANAGE
            </button>
          )}
          <button onClick={handleExport} style={{ ...S.iconBtn, color: '#00c8ff' }} title="Export schedule to clipboard"><Download size={14} /></button>
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
          {/* Mobile members toggle */}
          <button
            onClick={() => setMembersOpen(o => !o)}
            style={{ ...S.iconBtn, display: 'none' }}
            className="tp-mobile-only"
            title="Toggle members panel"
          >
            <Users size={14} />
          </button>
        </div>

        {/* Row 2: active week label */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderTop: '1px solid rgba(30,53,80,0.4)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', color: '#5a7898' }}>WEEK:</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: '#d0e4f4' }}>
            {currentWeekKey ? formatWeekRange(currentWeekKey) : 'No week selected'}
          </span>
          {sortedScheds.length > 1 && schedIdx >= 0 && (
            <span style={{ fontSize: 9, color: '#5a7898' }}>({schedIdx + 1}/{sortedScheds.length})</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => guardedNavigateWeek(-1)} disabled={schedIdx <= 0} style={{ ...S.weekNavBtn, opacity: schedIdx <= 0 ? 0.3 : 1, padding: '2px 8px', fontSize: 10 }}>← PREV</button>
          <button onClick={() => guardedNavigateWeek(1)} disabled={schedIdx >= sortedScheds.length - 1} style={{ ...S.weekNavBtn, opacity: schedIdx >= sortedScheds.length - 1 ? 0.3 : 1, padding: '2px 8px', fontSize: 10 }}>NEXT →</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ── Left: Config (top, scrollable) + Week list (middle) + Mode tab bar (bottom) */}
        <div
          className={`tp-left-panel${leftOpen ? ' open' : ''}`}
          style={{ width: 270, minWidth: 270, background: 'rgba(5,10,18,0.98)', borderRight: '1px solid #1e3550', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* Mode config panel — flex:1, scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            <ModeConfig
              mode={mode}
              members={allMembers}
              memberById={memberById}
              canEdit={canEdit}
              fixedDriver={fixedDriver} setFixedDriver={v => { setFixedDriver(v); markDirty(); }}
              vipPool={vipPool}        setVipPool={v => { setVipPool(v); markDirty(); }}
              pairs={pairs}            addPair={addPair} removePair={removePair} swapPairs={swapPairs}
              pairedStartDate={pairedStartDate} setPairedStartDate={v => { setPairedStartDate(v); markDirty(); }}
              driverQueue={driverQueue} setDriverQueue={v => { setDriverQueue(v); markDirty(); }}
              vipQueue={vipQueue}       setVipQueue={v => { setVipQueue(v); markDirty(); }}
              toggleQueue={toggleQueue}
              moveDriverQueue={(i, d) => moveQueue(driverQueue, setDriverQueue, i, d)}
              moveVipQueue={(i, d) => moveQueue(vipQueue, setVipQueue, i, d)}
              generate={generate}
              rollVipToNextWeek={rollVipToNextWeek}
              currentMode={currentMode}
              slots={slots}
              setSlots={setSlots}
              markDirty={markDirty}
            />
          </div>

          {/* Week List — maxHeight 180px */}
          <div style={{ flexShrink: 0, borderTop: '1px solid #1e3550' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8' }}>WEEKS ({sortedScheds.length})</div>
              {canEdit && (
                <button onClick={createNewWeek} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#00c8ff', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.25)', padding: '2px 8px', cursor: 'pointer' }}>+ NEW</button>
              )}
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {sortedScheds.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: 10, color: '#5a7898', fontStyle: 'italic' }}>No saved weeks yet. Save to create one.</div>
              )}
              {sortedScheds.map((s, i) => {
                const isActive = s.id === scheduleId;
                const label = formatWeekRange(s.week_label);
                return (
                  <div
                    key={s.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: isActive ? 'rgba(240,165,0,0.07)' : 'transparent', borderLeft: isActive ? '2px solid #f0a500' : '2px solid transparent', cursor: 'pointer' }}
                    onClick={() => {
                      if (!isActive) {
                        if (isDirty) { setPendingNav({ type: 'date', key: s.week_label, sched: s }); }
                        else applySchedule(s);
                      }
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: isActive ? '#f0a500' : '#7a9bb8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                      <div style={{ fontSize: 8, color: '#5a7898', letterSpacing: '1px' }}>WK {i + 1}</div>
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
                        style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', padding: '2px 4px', fontSize: 12, opacity: 0.5, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
                      >🗑</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mode selector tab bar — bottom strip */}
          <div style={{ flexShrink: 0, borderTop: '1px solid #1e3550', background: 'rgba(5,10,18,0.99)', padding: '6px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 5 }}>SCHEDULING MODE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {MODES.map(m => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { if (canEdit && m.id !== mode) { setMode(m.id); markDirty(); } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 8px',
                      background: active ? `${m.color}18` : 'rgba(10,18,30,0.6)',
                      border: `1px solid ${active ? m.color + '70' : '#1e3550'}`,
                      color: active ? m.color : '#7a9bb8',
                      fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.5px',
                      cursor: canEdit ? 'pointer' : 'default',
                      transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 11 }}>{m.icon}</span>
                    <span>{m.label.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
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
        {membersOpen ? (
          <div
            className="tp-right-panel open"
            style={{ width: 220, minWidth: 220, background: 'rgba(5,10,18,0.98)', borderLeft: '1px solid #1e3550', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onDragOver={e => e.preventDefault()}
            onDrop={onDropPool}
          >
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3550', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 2 }}>DRAG TO SLOT</div>
                <div style={{ fontSize: 9, color: '#5a7898', letterSpacing: '1px' }}>MEMBERS — {allMembers.length}</div>
              </div>
              <button
                onClick={() => setMembersOpen(false)}
                style={{ background: 'none', border: '1px solid #1e3550', color: '#5a7898', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center' }}
                title="Collapse members panel"
              >
                <ChevronRight size={13} />
              </button>
            </div>
            {selected && (
              <div style={{ padding: '6px 12px', background: 'rgba(0,200,255,0.06)', borderBottom: '1px solid rgba(0,200,255,0.2)', fontSize: 10, color: '#00c8ff' }}>
                ✓ Click a slot to assign
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
              {allMembers.map(m => {
                const isAssigned = assignedIds.has(m.id);
                const isSel      = selected === m.id;
                const isPlaceholder = m.is_placeholder;
                return (
                  <div
                    key={m.id}
                    draggable={canEdit}
                    onDragStart={e => onDragStart(e, m.id)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => onMemberClick(m.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 3,
                      background: isSel ? 'rgba(0,200,255,0.12)' : isAssigned ? 'rgba(0,200,255,0.05)' : 'transparent',
                      border: `1px solid ${isSel ? 'rgba(0,200,255,0.5)' : isAssigned ? 'rgba(0,200,255,0.2)' : '#1e3550'}`,
                      cursor: canEdit ? 'grab' : 'default',
                      opacity: 1,
                    }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 2, background: isPlaceholder ? '#2a4058' : (alliance?.color ?? '#1e3550'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#080d14', flexShrink: 0, position: 'relative' }}>
                      {memberInitials(m)}
                      {isAssigned && (
                        <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#00e87a', border: '1px solid #080d14' }} />
                      )}
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? '#00c8ff' : isAssigned ? '#a0c8e8' : '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {memberName(m)}
                        </div>
                        {isPlaceholder && <span style={{ fontSize: 8, color: '#5a7898', fontWeight: 700, background: 'rgba(90,120,152,0.15)', padding: '1px 3px', flexShrink: 0 }}>(P)</span>}
                      </div>
                      {isAssigned && <div style={{ fontSize: 8, color: '#00e87a', fontWeight: 700, letterSpacing: '1px' }}>ASSIGNED</div>}
                      {m.power1 && !isAssigned && !isPlaceholder && <div style={{ fontSize: 9, color: '#5a7898', fontFamily: "'Share Tech Mono',monospace" }}>{m.power1}B{m.troop1 ? ` · ${m.troop1}` : ''}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid #1e3550', fontSize: 9, color: '#2a4058', lineHeight: 1.6, flexShrink: 0 }}>
              Drag to slot · Drag slot→here to remove · Click member then slot to assign
            </div>
          </div>
        ) : (
          /* Collapsed members strip */
          <div
            style={{ width: 36, minWidth: 36, background: 'rgba(5,10,18,0.98)', borderLeft: '1px solid #1e3550', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}
            onDragOver={e => e.preventDefault()}
            onDrop={onDropPool}
          >
            <button
              onClick={() => setMembersOpen(true)}
              style={{ background: 'none', border: 'none', color: '#5a7898', cursor: 'pointer', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
              title="Expand members panel"
            >
              <ChevronLeft size={14} />
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#5a7898', writingMode: 'vertical-rl', transform: 'rotate(180deg)', userSelect: 'none' }}>MEMBERS</div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile overlay backdrops */}
      <style>{`
        @media (max-width: 768px) {
          .tp-mobile-only { display: flex !important; }
          .tp-left-panel { --left-tx: -100%; }
          .tp-right-panel { --right-tx: 100%; }
        }
      `}</style>
    </div>
  );
}

// ── Mode Config Panel ──────────────────────────────────────────────
function ModeConfig({ mode, members, memberById, canEdit, fixedDriver, setFixedDriver, vipPool, setVipPool, pairs, addPair, removePair, swapPairs, pairedStartDate, setPairedStartDate, driverQueue, setDriverQueue, vipQueue, setVipQueue, moveDriverQueue, moveVipQueue, toggleQueue, generate, rollVipToNextWeek, currentMode, slots, setSlots, markDirty }) {
  const [pairDriver, setPairDriver] = useState('');
  const [pairVip,    setPairVip]    = useState('');

  const sel = (label, value, onChange) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={S.sel} disabled={!canEdit}>
      <option value="">— {label} —</option>
      {members.map(m => <option key={m.id} value={m.id}>{m.in_game_name || m.username}</option>)}
    </select>
  );

  const ordinal = (n) => {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div>
      {/* Mode info */}
      <div style={{ fontSize: 11, color: '#5a7898', lineHeight: 1.6, marginBottom: 14, padding: '8px 10px', border: `1px solid ${currentMode?.color}25`, background: `${currentMode?.color}08` }}>
        {currentMode?.detail}
      </div>

      {/* MANUAL */}
      {mode === 'manual' && (
        <div style={{ fontSize: 11, color: '#5a7898', lineHeight: 1.7 }}>
          Drag members from the pool on the right into any slot, or click a member then click a slot. Use the lock icon to protect a slot from being cleared. Dragging a member from one slot to another will swap them.
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
            <p style={{ fontSize: 10, color: '#2a4058', marginBottom: 8 }}>Click to add/remove from VIP pool. Order = rotation sequence.</p>
            {vipPool.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {vipPool.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', marginBottom: 3, background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.25)' }}>
                    <span style={{ fontSize: 9, color: '#00e87a', fontFamily: 'monospace', minWidth: 22 }}>{ordinal(i + 1)}</span>
                    <span style={{ flex: 1, fontSize: 11, color: '#00e87a', fontWeight: 700 }}>{p.in_game_name || p.username}</span>
                    {canEdit && <button onClick={() => setVipPool(prev => prev.filter(x => x.id !== p.id))} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
                  </div>
                ))}
              </div>
            )}
            {members.filter(m => m.id !== fixedDriver && !vipPool.some(p => p.id === m.id)).map(m => (
              <button key={m.id} onClick={() => canEdit && setVipPool(p => [...p, m])}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', marginBottom: 3, background: 'transparent', border: '1px solid #1e3550', color: '#5a7898', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: canEdit ? 'pointer' : 'default' }}>
                + {m.in_game_name || m.username}
              </button>
            ))}
          </div>
          {canEdit && (
            <>
              <button onClick={rollVipToNextWeek} style={{ ...S.genBtn, background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a' }}>
                <RotateCcw size={12} /> ROLL TO NEXT WEEK
              </button>
              <button onClick={generate} style={S.genBtn}><Shuffle size={12} /> GENERATE SCHEDULE</button>
            </>
          )}
        </div>
      )}

      {/* PAIRED */}
      {mode === 'paired' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={S.cfgLabel}>ROTATION START DATE</div>
            <p style={{ fontSize: 10, color: '#2a4058', marginBottom: 6 }}>Set the first Monday this rotation began. Auto-calculates which pair is up each week.</p>
            <input
              type="date"
              value={pairedStartDate}
              onChange={e => setPairedStartDate(e.target.value)}
              disabled={!canEdit}
              style={{ ...S.sel, fontSize: 11, padding: '5px 8px' }}
            />
          </div>
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
          <div style={{ fontSize: 10, color: '#7a9bb8', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(255,96,128,0.05)', border: '1px solid rgba(255,96,128,0.2)' }}>
            Lock slots for event winners. Unlocked slots auto-fill from the pool.
          </div>
          <PriorityDayLocks slots={slots} setSlots={setSlots} members={members} canEdit={canEdit} markDirty={markDirty} />
          {canEdit && <button onClick={generate} style={{ ...S.genBtn, background: 'rgba(255,96,128,0.1)', border: '1px solid rgba(255,96,128,0.3)', color: '#ff6080' }}>
            <Shuffle size={12} /> AUTO-FILL UNLOCKED
          </button>}
        </div>
      )}
    </div>
  );
}

// ── Priority Day Locks ─────────────────────────────────────────────
function PriorityDayLocks({ slots, setSlots, members, canEdit, markDirty }) {
  const [selDay, setSelDay] = useState(null);

  function lockSlot(dayIdx, role, memberId) {
    const key = `${dayIdx}-${role}`;
    setSlots(prev => ({ ...prev, [key]: { memberId, locked: true } }));
    markDirty();
    setSelDay(null);
  }

  function clearLock(dayIdx, role) {
    const key = `${dayIdx}-${role}`;
    setSlots(prev => ({ ...prev, [key]: { memberId: null, locked: false } }));
    markDirty();
  }

  return (
    <div>
      <div style={S.cfgLabel}>DAY LOCKS (MON–SUN)</div>
      {DAYS.map((day, d) => {
        const dSlot = slots[`${d}-driver`] ?? {};
        const vSlot = slots[`${d}-vip`]    ?? {};
        return (
          <div key={d} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', color: '#5a7898', marginBottom: 3 }}>{day}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ flex: 1 }}>
                {dSlot.locked && dSlot.memberId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.4)' }}>
                    <span style={{ fontSize: 11 }}>👑</span>
                    <span style={{ flex: 1, fontSize: 9, color: '#f0a500', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {members.find(m => m.id === dSlot.memberId)?.in_game_name || members.find(m => m.id === dSlot.memberId)?.username || '?'}
                    </span>
                    {canEdit && <button onClick={() => clearLock(d, 'driver')} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 }}>×</button>}
                  </div>
                ) : (
                  <button
                    onClick={() => canEdit && setSelDay({ dayIdx: d, role: 'driver' })}
                    style={{ width: '100%', padding: '4px 5px', background: 'transparent', border: '1px dashed #1e3550', color: '#5a7898', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 8, letterSpacing: '0.5px', cursor: canEdit ? 'pointer' : 'default', textAlign: 'center' }}
                  >
                    🚂 SET DRIVER
                  </button>
                )}
              </div>
              <div style={{ flex: 1 }}>
                {vSlot.locked && vSlot.memberId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: 'rgba(200,122,255,0.1)', border: '1px solid rgba(200,122,255,0.4)' }}>
                    <span style={{ fontSize: 11 }}>👑</span>
                    <span style={{ flex: 1, fontSize: 9, color: '#c87aff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {members.find(m => m.id === vSlot.memberId)?.in_game_name || members.find(m => m.id === vSlot.memberId)?.username || '?'}
                    </span>
                    {canEdit && <button onClick={() => clearLock(d, 'vip')} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 }}>×</button>}
                  </div>
                ) : (
                  <button
                    onClick={() => canEdit && setSelDay({ dayIdx: d, role: 'vip' })}
                    style={{ width: '100%', padding: '4px 5px', background: 'transparent', border: '1px dashed #1e3550', color: '#5a7898', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 8, letterSpacing: '0.5px', cursor: canEdit ? 'pointer' : 'default', textAlign: 'center' }}
                  >
                    ⭐ SET VIP
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {selDay && (
        <div style={{ marginTop: 8, padding: '8px', background: '#0a1220', border: '1px solid #1e3550' }}>
          <div style={{ fontSize: 9, color: '#5a7898', marginBottom: 6, fontWeight: 700, letterSpacing: '1.5px' }}>
            SELECT {selDay.role.toUpperCase()} FOR {DAYS[selDay.dayIdx]}
          </div>
          {members.map(m => (
            <button key={m.id} onClick={() => lockSlot(selDay.dayIdx, selDay.role, m.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', marginBottom: 2, background: 'transparent', border: '1px solid #1e3550', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: 'pointer' }}>
              {m.in_game_name || m.username}
            </button>
          ))}
          <button onClick={() => setSelDay(null)} style={{ width: '100%', marginTop: 6, padding: '4px', background: 'transparent', border: '1px solid #2a4058', color: '#5a7898', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, cursor: 'pointer' }}>CANCEL</button>
        </div>
      )}
    </div>
  );
}

function QueueEditor({ label, queue, members, memberById, canEdit, toggle, move }) {
  return (
    <div>
      <div style={S.cfgLabel}>{label}</div>
      {queue.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {queue.map((id, i) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', marginBottom: 2, border: '1px solid rgba(200,122,255,0.25)', background: 'rgba(200,122,255,0.06)' }}>
              <span style={{ fontSize: 9, color: '#5a7898', width: 14, textAlign: 'right', fontFamily: 'monospace' }}>{i + 1}.</span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {members.filter(m => !queue.includes(m.id)).map(m => (
          <button key={m.id} onClick={() => canEdit && toggle(m.id)}
            style={{ textAlign: 'left', padding: '4px 8px', background: 'transparent', border: '1px solid #1e3550', color: '#5a7898', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: canEdit ? 'pointer' : 'default' }}>
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
              <th style={{ width: 80, padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#5a7898', borderBottom: '1px solid #1e3550' }}></th>
              {days.map((d) => (
                <th key={d} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#d0e4f4', borderBottom: '1px solid #1e3550', minWidth: 90 }}>
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
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color }}>
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
                          minHeight: 52, borderRadius: 2, padding: '6px 8px',
                          background: isOver  ? `${color}22` :
                                      member  ? `${color}18` : 'rgba(20,35,55,0.35)',
                          border: `1px solid ${isOver ? color : isLocked ? `${color}70` : member ? `${color}50` : '#1e3550'}`,
                          cursor: canEdit && !member ? 'crosshair' : 'default',
                          position: 'relative', transition: 'border-color 0.1s',
                          boxSizing: 'border-box',
                        }}
                      >
                        {isLocked && !member && (
                          <div style={{ position: 'absolute', top: 3, left: 3 }}>
                            <span style={{ fontSize: 10 }}>👑</span>
                          </div>
                        )}
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 40 }}>
                            {isLocked
                              ? <Lock size={12} style={{ color: `${color}70` }} />
                              : <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#4a6880', fontFamily: "'Rajdhani',sans-serif" }}>— OPEN —</span>
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
        <span>Drag filled slot → another slot to swap</span>
        <span>Drag slot → pool to remove</span>
        {canEdit && <span style={{ color: '#5a7898' }}>× removes assignment · lock protects slot</span>}
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
      <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', lineHeight: 1.2, paddingRight: canEdit ? 18 : 0 }}>
        {member.in_game_name || member.username}
      </div>
      {member.username && member.in_game_name && (
        <div style={{ fontSize: 9, color: '#5a7a98', fontFamily: "'Share Tech Mono',monospace" }}>@{member.username}</div>
      )}
      {isLocked && <span style={{ fontSize: 9 }}>👑</span>}
      {canEdit && (
        <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 2 }}>
          <button
            onClick={e => { e.stopPropagation(); toggleLock(slotKey); }}
            style={{ background: 'none', border: 'none', color: isLocked ? color : '#5a7898', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
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
  cfgLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#5a7898', marginBottom: 6 },
  genBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  sel: { width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: '6px 8px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11 },
  qBtn: { background: 'none', border: 'none', color: '#5a7898', cursor: 'pointer', padding: '2px 4px', fontSize: 10, fontFamily: 'monospace' },
  weekNavBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(30,53,80,0.5)', border: '1px solid #1e3550', color: '#7a9bb8', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', cursor: 'pointer', whiteSpace: 'nowrap' },
};
