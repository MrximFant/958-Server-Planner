import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Swords, Save, Download, ChevronLeft, ChevronRight, X, Search, Plus, Trash2 } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

// ── Constants ──────────────────────────────────────────────────────
const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const EVENT_TYPES = [
  { id: 'canyon', label: 'CANYON STORM', icon: '🏔' },
  { id: 'desert', label: 'DESERT STORM', icon: '🏜' },
];

const TASKFORCES = ['A', 'B'];

const ROLE_META = {
  coordinator: { label: 'Team Coordinator', icon: '👑', color: '#ffd700' },
  lethal:      { label: 'Lethal Killer',    icon: '🔥', color: '#ff4060' },
  science:     { label: 'Science Hub',      icon: '✅', color: '#00e87a' },
  info:        { label: 'Info Center',      icon: 'ℹ️', color: '#00c8ff' },
};
const ROLE_CYCLE = [null, 'coordinator', 'lethal', 'science', 'info'];

const DEFAULT_TEAMS = [
  { number: 1, label: 'Hospital 1 & 3 → Mercenary Factory' },
  { number: 2, label: 'Hospital 2 & 4 → Arsenal' },
  { number: 3, label: 'Oil Refinery 1 → Nuclear Silo' },
  { number: 4, label: 'Oil Refinery 2 → Nuclear Silo' },
];

function defaultConfig() {
  return { teams: DEFAULT_TEAMS.map(t => ({ ...t })) };
}

// ── Helpers ────────────────────────────────────────────────────────
function memberName(m) {
  return m?.in_game_name || m?.username || '?';
}

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

function nextWeekDate(weekLabels) {
  if (weekLabels.length > 0) {
    const lastLabel = weekLabels[weekLabels.length - 1];
    const parsed = new Date(lastLabel + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return getMondayDate(new Date(parsed.getTime() + 7 * 24 * 3600000));
  }
  return getMondayDate(new Date(Date.now() + 7 * 24 * 3600000));
}

// ── Main component ─────────────────────────────────────────────────
export default function BattlePlanner() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const role = session?.serverId === serverId ? session.role : null;
  const myAllianceId = session?.allianceId ?? null;
  const allianceRole = session?.allianceRole ?? null;
  const canManage = role === 'admin' || allianceRole === 'owner' || allianceRole === 'alliance_admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [members, setMembers] = useState([]);
  const [alliance, setAlliance] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState('');

  const [eventType, setEventType] = useState('canyon');
  const [taskforce, setTaskforce] = useState('A');

  // All plans for this alliance, keyed for lookup
  const [allPlans, setAllPlans] = useState([]); // [{id, event_type, taskforce, week_label, config, rules_text}]
  const [allSlots, setAllSlots] = useState({}); // plan_id -> slot rows

  const [currentWeekKey, setCurrentWeekKey] = useState('');
  const [planId, setPlanId] = useState(null);
  const [config, setConfig] = useState(defaultConfig);
  const [rulesText, setRulesText] = useState('');
  const [slots, setSlots] = useState([]); // [{team_number, member_id, role, is_sub, slot_order}]

  const [pendingNav, setPendingNav] = useState(null);
  const [picker, setPicker] = useState(null); // { teamNumber, isSub } | null
  const [pickerSearch, setPickerSearch] = useState('');

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [openAccordion, setOpenAccordion] = useState(0);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function markDirty() { setIsDirty(true); }

  // ── Load everything ───────────────────────────────────────────────
  useEffect(() => {
    if (!myAllianceId) { setLoading(false); return; }

    async function load() {
      const [{ data: al }, { data: mems }, { data: plans }] = await Promise.all([
        supabase.from('alliances').select('id, name, color, server_id').eq('id', myAllianceId).single(),
        supabase.from('members').select('id, username, in_game_name, power1, troop1, alliance_role').eq('alliance_id', myAllianceId).order('username'),
        supabase.from('battle_plans').select('*').eq('alliance_id', myAllianceId).order('week_label'),
      ]);
      setAlliance(al);
      setMembers(mems ?? []);
      setAllPlans(plans ?? []);

      let grouped = {};
      const planIds = (plans ?? []).map(p => p.id);
      if (planIds.length > 0) {
        const { data: slotRows } = await supabase.from('battle_plan_slots').select('*').in('plan_id', planIds);
        (slotRows ?? []).forEach(s => {
          if (!grouped[s.plan_id]) grouped[s.plan_id] = [];
          grouped[s.plan_id].push(s);
        });
        setAllSlots(grouped);
      }

      applyForEventTaskforce('canyon', 'A', plans ?? [], grouped);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAllianceId]);

  function plansFor(evt, tf, plansList) {
    return (plansList ?? allPlans).filter(p => p.event_type === evt && p.taskforce === tf)
      .sort((a, b) => (a.week_label || '').localeCompare(b.week_label || ''));
  }

  function applyForEventTaskforce(evt, tf, plansList, slotsMap) {
    const list = plansFor(evt, tf, plansList);
    const todayMonday = toDateString(getMondayDate());
    let target = list.find(p => p.week_label === todayMonday);
    if (!target && list.length > 0) target = list[list.length - 1];

    if (target) {
      applyPlan(target, slotsMap[target.id] ?? (allSlots[target.id] ?? []));
    } else {
      setPlanId(null);
      setCurrentWeekKey(todayMonday);
      setConfig(defaultConfig());
      setRulesText('');
      setSlots([]);
      setIsDirty(false);
    }
  }

  function applyPlan(plan, slotRows) {
    setPlanId(plan.id);
    setCurrentWeekKey(plan.week_label ?? '');
    setConfig(plan.config && plan.config.teams ? plan.config : defaultConfig());
    setRulesText(plan.rules_text ?? '');
    setSlots((slotRows ?? []).map(s => ({ team_number: s.team_number, member_id: s.member_id, role: s.role, is_sub: s.is_sub, slot_order: s.slot_order })));
    setIsDirty(false);
  }

  // ── Switch event/taskforce tabs ──────────────────────────────────
  function switchTo(evt, tf) {
    if (isDirty) { setPendingNav({ type: 'switch', evt, tf }); return; }
    doSwitchTo(evt, tf);
  }

  function doSwitchTo(evt, tf) {
    setEventType(evt);
    setTaskforce(tf);
    applyForEventTaskforce(evt, tf, allPlans, allSlots);
  }

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!myAllianceId) return;
    setSaving(true);

    const wLabel = currentWeekKey || toDateString(getMondayDate());
    let pid = planId;

    if (!pid) {
      const { data, error } = await supabase
        .from('battle_plans')
        .insert({ alliance_id: myAllianceId, event_type: eventType, taskforce, week_label: wLabel, config, rules_text: rulesText })
        .select('*').single();
      if (error) { setSaving(false); return; }
      pid = data?.id;
      if (pid) {
        setPlanId(pid);
        setAllPlans(prev => [...prev.filter(p => p.id !== pid), data]);
      }
    } else {
      const { data } = await supabase
        .from('battle_plans')
        .update({ config, rules_text: rulesText, week_label: wLabel })
        .eq('id', pid).select('*').single();
      setAllPlans(prev => prev.map(p => p.id === pid ? (data ?? { ...p, config, rules_text: rulesText, week_label: wLabel }) : p));
    }

    if (!pid) { setSaving(false); return; }

    // Replace all slots for this plan
    await supabase.from('battle_plan_slots').delete().eq('plan_id', pid);
    if (slots.length > 0) {
      const rows = slots.map((s, i) => ({
        plan_id: pid,
        team_number: s.team_number,
        member_id: s.member_id ?? null,
        role: s.role ?? null,
        is_sub: !!s.is_sub,
        slot_order: s.slot_order ?? i,
      }));
      await supabase.from('battle_plan_slots').insert(rows);
    }
    setAllSlots(prev => ({ ...prev, [pid]: slots.map((s, i) => ({ plan_id: pid, team_number: s.team_number, member_id: s.member_id ?? null, role: s.role ?? null, is_sub: !!s.is_sub, slot_order: s.slot_order ?? i })) }));

    setSaving(false);
    setSaved(true);
    setIsDirty(false);
    setTimeout(() => setSaved(false), 2500);
  }, [myAllianceId, planId, currentWeekKey, eventType, taskforce, config, rulesText, slots]);

  // ── Unsaved changes guard ─────────────────────────────────────────
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
    if (nav.type === 'switch') doSwitchTo(nav.evt, nav.tf);
    else if (nav.type === 'week') navigateWeek(nav.dir);
    else if (nav.type === 'newweek') doCreateNextWeek();
  }

  // ── Week navigation ───────────────────────────────────────────────
  const weekList = plansFor(eventType, taskforce, allPlans);
  const weekIdx = weekList.findIndex(p => p.id === planId);

  function guardedNavigateWeek(dir) {
    if (isDirty) { setPendingNav({ type: 'week', dir }); return; }
    navigateWeek(dir);
  }
  function navigateWeek(dir) {
    const list = plansFor(eventType, taskforce, allPlans);
    const idx = list.findIndex(p => p.id === planId);
    if (dir === -1 && idx > 0) applyPlan(list[idx - 1], allSlots[list[idx - 1].id] ?? []);
    else if (dir === 1 && idx < list.length - 1) applyPlan(list[idx + 1], allSlots[list[idx + 1].id] ?? []);
  }

  function createNextWeek() {
    if (isDirty) { setPendingNav({ type: 'newweek' }); return; }
    doCreateNextWeek();
  }
  function doCreateNextWeek() {
    const list = plansFor(eventType, taskforce, allPlans);
    const baseDate = nextWeekDate(list.map(p => p.week_label));
    const newKey = toDateString(baseDate);
    if (list.some(p => p.week_label === newKey)) { alert('A plan for that week already exists.'); return; }

    setPlanId(null);
    setCurrentWeekKey(newKey);
    // Keep team labels, clear player assignments
    setConfig(prev => ({ teams: (prev.teams ?? DEFAULT_TEAMS).map(t => ({ ...t })) }));
    setSlots([]);
    setIsDirty(true);
  }

  async function handleDeleteWeek() {
    if (!planId) { alert('This week has not been saved yet — nothing to delete.'); return; }
    if (!confirm('Delete this entire week\'s plan? This cannot be undone.')) return;
    await supabase.from('battle_plan_slots').delete().eq('plan_id', planId);
    await supabase.from('battle_plans').delete().eq('id', planId);
    const remaining = allPlans.filter(p => p.id !== planId);
    setAllPlans(remaining);
    const list = plansFor(eventType, taskforce, remaining);
    if (list.length > 0) applyPlan(list[list.length - 1], allSlots[list[list.length - 1].id] ?? []);
    else {
      setPlanId(null);
      setCurrentWeekKey(toDateString(getMondayDate()));
      setConfig(defaultConfig());
      setRulesText('');
      setSlots([]);
      setIsDirty(false);
    }
  }

  // ── Team config editing ──────────────────────────────────────────
  function updateTeamLabel(teamNumber, label) {
    if (!canManage) return;
    setConfig(prev => ({ teams: (prev.teams ?? []).map(t => t.number === teamNumber ? { ...t, label } : t) }));
    markDirty();
  }
  function addTeam() {
    if (!canManage) return;
    setConfig(prev => {
      const teams = prev.teams ?? [];
      const nextNum = teams.length > 0 ? Math.max(...teams.map(t => t.number)) + 1 : 1;
      return { teams: [...teams, { number: nextNum, label: `Team ${nextNum}` }] };
    });
    markDirty();
  }
  function removeTeam(teamNumber) {
    if (!canManage) return;
    if (!confirm('Remove this team? Assigned players in it will be moved to substitutes.')) return;
    setConfig(prev => ({ teams: (prev.teams ?? []).filter(t => t.number !== teamNumber) }));
    setSlots(prev => prev.map(s => s.team_number === teamNumber ? { ...s, team_number: teamNumber, is_sub: true } : s));
    markDirty();
  }

  // ── Slot helpers ──────────────────────────────────────────────────
  const assignedMemberIds = new Set(slots.map(s => s.member_id).filter(Boolean));
  const memberById = Object.fromEntries(members.map(m => [m.id, m]));

  function teamSlots(teamNumber) {
    return slots.filter(s => s.team_number === teamNumber && !s.is_sub);
  }
  function subSlots() {
    return slots.filter(s => s.is_sub);
  }

  function assignMember(memberId, teamNumber, isSub) {
    if (!canManage) return;
    setSlots(prev => [...prev, { team_number: isSub ? 0 : teamNumber, member_id: memberId, role: null, is_sub: isSub, slot_order: prev.length }]);
    markDirty();
    setPicker(null);
    setPickerSearch('');
  }
  function removeMember(memberId, teamNumber, isSub) {
    if (!canManage) return;
    setSlots(prev => prev.filter(s => !(s.member_id === memberId && s.team_number === (isSub ? 0 : teamNumber) && s.is_sub === isSub)));
    markDirty();
  }
  function cycleRole(memberId, teamNumber) {
    if (!canManage) return;
    setSlots(prev => prev.map(s => {
      if (s.member_id === memberId && s.team_number === teamNumber && !s.is_sub) {
        const idx = ROLE_CYCLE.indexOf(s.role);
        const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length];
        return { ...s, role: next };
      }
      return s;
    }));
    markDirty();
  }

  // ── Export ────────────────────────────────────────────────────────
  function handleExport() {
    const allianceName = alliance?.name || 'Alliance';
    const evtMeta = EVENT_TYPES.find(e => e.id === eventType);
    const weekRange = currentWeekKey ? formatWeekRange(currentWeekKey) : 'Unknown Week';
    const lines = [
      `${evtMeta?.icon ?? ''} ${evtMeta?.label ?? eventType.toUpperCase()} — TASKFORCE ${taskforce} — ${allianceName}`,
      `Week of ${weekRange}`,
      '',
    ];
    (config.teams ?? []).forEach(team => {
      lines.push(`TEAM ${team.number} — ${team.label}`);
      const ts = teamSlots(team.number);
      if (ts.length === 0) lines.push('(no players assigned)');
      ts.forEach(s => {
        const m = memberById[s.member_id];
        if (!m) return;
        const meta = s.role ? ROLE_META[s.role] : null;
        const icon = meta ? meta.icon + ' ' : '';
        const power = m.power1 ? `${m.power1}M` : '?';
        const troop = m.troop1 ? `, ${m.troop1}` : '';
        lines.push(`${icon}${memberName(m)} (${power}${troop})`);
      });
      lines.push('');
    });
    const subs = subSlots();
    lines.push('SUBSTITUTES');
    if (subs.length === 0) lines.push('(none)');
    subs.forEach(s => {
      const m = memberById[s.member_id];
      if (!m) return;
      const power = m.power1 ? `${m.power1}M` : '?';
      const troop = m.troop1 ? `, ${m.troop1}` : '';
      lines.push(`${memberName(m)} (${power}${troop})`);
    });
    lines.push('');
    lines.push('RULES');
    lines.push(rulesText.trim() || '(none)');

    const text = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setToast('COPIED!');
        setTimeout(() => setToast(''), 2000);
      });
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
      a.download = `battle-plan-${eventType}-${taskforce}-${currentWeekKey || 'week'}.txt`;
      a.click();
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a7898', fontFamily: 'monospace' }}>
      LOADING BATTLE PLANNER…
    </div>
  );

  if (!myAllianceId) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', gap: 16 }}>
      <style>{FONT}</style>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '2px' }}>NO ALLIANCE</div>
      <p style={{ color: '#5a7898', fontSize: 13 }}>You must be logged in as an alliance member to use the battle planner.</p>
      <button onClick={() => navigate(`/server/${serverId}`)} style={S.backBtn}><ArrowLeft size={14} /> BACK</button>
    </div>
  );

  const teams = config.teams ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', position: 'relative' }}>
      <ParticleBackground />
      <style>{FONT}</style>

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

      {/* ── Member picker ────────────────────────────────────────── */}
      {picker && (
        <MemberPicker
          members={members.filter(m => !assignedMemberIds.has(m.id))}
          search={pickerSearch}
          setSearch={setPickerSearch}
          isMobile={isMobile}
          onPick={(memberId) => assignMember(memberId, picker.teamNumber, picker.isSub)}
          onClose={() => { setPicker(null); setPickerSearch(''); }}
        />
      )}

      {/* ── Toast ────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.5)', color: '#00e87a', padding: '8px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '2px', pointerEvents: 'none' }}>
          {toast}
        </div>
      )}

      {/* ── Topbar ──────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(8,13,20,0.97)', borderBottom: '1px solid #1e3550', flexShrink: 0, zIndex: 50, position: 'sticky', top: 0 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <button onClick={() => navigate(`/server/${serverId}/alliance`)} style={S.iconBtn}><ArrowLeft size={15} /></button>
          <Swords size={15} style={{ color: '#f0a500', flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500' }}>BATTLE PLANNER</div>
          {alliance && <div style={{ fontSize: 13, color: '#c0d8f0', marginLeft: 4 }}>— {alliance.name}</div>}
          {isDirty && <div style={{ fontSize: 10, color: '#f0a500', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', padding: '2px 7px', letterSpacing: '1px', fontWeight: 700 }}>UNSAVED</div>}
          <div style={{ flex: 1 }} />
          <button onClick={handleExport} style={{ ...S.smallBtn, color: '#8aadcc' }}><Download size={12} /> {isMobile ? '' : 'COPY FOR DISCORD'}</button>
          {canManage && (
            <button onClick={handleSave} disabled={saving} style={{ ...S.smallBtn, background: saved ? 'rgba(0,232,122,0.1)' : 'rgba(240,165,0,0.1)', border: `1px solid ${saved ? 'rgba(0,232,122,0.5)' : 'rgba(240,165,0,0.5)'}`, color: saved ? '#00e87a' : '#f0a500' }}>
              <Save size={12} />{saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE'}
            </button>
          )}
        </div>

        {/* Event type tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 12px', borderTop: '1px solid rgba(30,53,80,0.4)' }}>
          {EVENT_TYPES.map(evt => (
            <button
              key={evt.id}
              onClick={() => switchTo(evt.id, taskforce)}
              style={{
                flex: isMobile ? 1 : undefined, padding: '10px 18px', background: eventType === evt.id ? 'rgba(240,165,0,0.1)' : 'transparent',
                border: 'none', borderBottom: eventType === evt.id ? '2px solid #f0a500' : '2px solid transparent',
                color: eventType === evt.id ? '#f0a500' : '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                fontSize: 12, letterSpacing: '1.5px', cursor: 'pointer', minHeight: 44,
              }}
            >
              {evt.icon} {evt.label}
            </button>
          ))}
        </div>

        {/* Taskforce sub-tabs + week nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid rgba(30,53,80,0.4)', background: 'rgba(5,10,18,0.5)', flexWrap: 'wrap' }}>
          {TASKFORCES.map(tf => (
            <button
              key={tf}
              onClick={() => switchTo(eventType, tf)}
              style={{
                padding: '6px 14px', background: taskforce === tf ? 'rgba(0,200,255,0.12)' : 'transparent',
                border: `1px solid ${taskforce === tf ? 'rgba(0,200,255,0.4)' : '#1e3550'}`,
                color: taskforce === tf ? '#00c8ff' : '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 36,
              }}
            >
              TASKFORCE {tf}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: '#1e3550', margin: '0 4px' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#8aadcc' }}>WEEK:</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#ffffff', fontWeight: 700 }}>
            {currentWeekKey ? formatWeekRange(currentWeekKey) : '— no week —'}
          </span>
          {weekList.length > 1 && weekIdx >= 0 && (
            <span style={{ fontSize: 10, color: '#8aadcc' }}>{weekIdx + 1}/{weekList.length}</span>
          )}
          <button onClick={() => guardedNavigateWeek(-1)} disabled={weekIdx <= 0} style={{ ...S.weekNavBtn, opacity: weekIdx <= 0 ? 0.3 : 1 }}><ChevronLeft size={12} /></button>
          <button onClick={() => guardedNavigateWeek(1)} disabled={weekIdx >= weekList.length - 1} style={{ ...S.weekNavBtn, opacity: weekIdx >= weekList.length - 1 ? 0.3 : 1 }}><ChevronRight size={12} /></button>
          <div style={{ flex: 1 }} />
          {canManage && (
            <>
              <button onClick={createNextWeek} style={{ ...S.smallBtn, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.4)', color: '#00e87a' }}>
                <Plus size={12} /> NEXT WEEK
              </button>
              <button onClick={handleDeleteWeek} style={{ ...S.smallBtn, background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.25)', color: '#ff4060' }}>
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: isMobile ? '12px 10px 40px' : '20px 24px 40px', maxWidth: 1400, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {canManage && (
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addTeam} style={{ ...S.smallBtn, border: '1px solid #1e3550', color: '#7a9bb8' }}>
              <Plus size={12} /> ADD TEAM
            </button>
          </div>
        )}

        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teams.map((team, i) => (
              <TeamAccordion
                key={team.number}
                team={team}
                isOpen={openAccordion === i}
                onToggle={() => setOpenAccordion(openAccordion === i ? -1 : i)}
                slots={teamSlots(team.number)}
                memberById={memberById}
                canManage={canManage}
                onLabelChange={l => updateTeamLabel(team.number, l)}
                onRemoveTeam={() => removeTeam(team.number)}
                onAddPlayer={() => setPicker({ teamNumber: team.number, isSub: false })}
                onRemovePlayer={mid => removeMember(mid, team.number, false)}
                onCycleRole={mid => cycleRole(mid, team.number)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(teams.length, 4) || 1}, 1fr)`, gap: 14 }}>
            {teams.map(team => (
              <TeamCard
                key={team.number}
                team={team}
                slots={teamSlots(team.number)}
                memberById={memberById}
                canManage={canManage}
                onLabelChange={l => updateTeamLabel(team.number, l)}
                onRemoveTeam={() => removeTeam(team.number)}
                onAddPlayer={() => setPicker({ teamNumber: team.number, isSub: false })}
                onRemovePlayer={mid => removeMember(mid, team.number, false)}
                onCycleRole={mid => cycleRole(mid, team.number)}
              />
            ))}
            {teams.length === 0 && (
              <div style={{ color: '#5a7898', fontSize: 12, fontStyle: 'italic' }}>No teams configured yet.{canManage ? ' Click ADD TEAM to start.' : ''}</div>
            )}
          </div>
        )}

        {/* Substitutes */}
        <div style={{ marginTop: 24, border: '1px solid #1e3550', background: 'rgba(20,35,55,0.25)', padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 12 }}>SUBSTITUTES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subSlots().map(s => {
              const m = memberById[s.member_id];
              if (!m) return null;
              return (
                <PlayerRow key={s.member_id} member={m} canManage={canManage} onRemove={() => removeMember(s.member_id, 0, true)} />
              );
            })}
            {subSlots().length === 0 && (
              <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic' }}>No substitutes added.</div>
            )}
          </div>
          {canManage && (
            <button onClick={() => setPicker({ teamNumber: 0, isSub: true })} style={{ ...S.addPlayerBtn, marginTop: 10 }}>
              <Plus size={13} /> ADD PLAYER
            </button>
          )}
        </div>

        {/* Rules */}
        <div style={{ marginTop: 24, border: '1px solid #1e3550', background: 'rgba(20,35,55,0.25)', padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8', marginBottom: 12 }}>RULES</div>
          {canManage ? (
            <textarea
              value={rulesText}
              onChange={e => { setRulesText(e.target.value); markDirty(); }}
              placeholder="Enter rules for this taskforce…"
              rows={5}
              style={{ width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 13, lineHeight: 1.6, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
            />
          ) : (
            <p style={{ color: '#a8c4dc', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {rulesText.trim() || 'No rules set.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Player row ───────────────────────────────────────────────────
function PlayerRow({ member, role, canManage, onRemove, onCycleRole }) {
  const meta = role ? ROLE_META[role] : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: meta ? `${meta.color}12` : 'rgba(20,35,55,0.4)', border: `1px solid ${meta ? meta.color + '40' : '#1e3550'}`, minHeight: 44 }}>
      {onCycleRole ? (
        <button
          onClick={onCycleRole}
          disabled={!canManage}
          title={meta ? meta.label : 'No role — tap to assign'}
          style={{ background: 'none', border: 'none', cursor: canManage ? 'pointer' : 'default', fontSize: 16, padding: 0, minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          {meta ? meta.icon : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid #3a5878', display: 'inline-block' }} />}
        </button>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memberName(member)}</div>
        <div style={{ fontSize: 10, color: '#7a9bb8', fontFamily: "'Share Tech Mono',monospace" }}>
          {member.power1 ? `${member.power1}M` : '?'}{member.troop1 ? ` · ${member.troop1}` : ''}
        </div>
      </div>
      {canManage && (
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px', minWidth: 28, minHeight: 28 }}>×</button>
      )}
    </div>
  );
}

// ── Team card (desktop/tablet) ──────────────────────────────────────
function TeamCard({ team, slots, memberById, canManage, onLabelChange, onRemoveTeam, onAddPlayer, onRemovePlayer, onCycleRole }) {
  return (
    <div style={{ border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3550', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#00c8ff', flexShrink: 0 }}>T{team.number}</span>
        {canManage ? (
          <input
            value={team.label}
            onChange={e => onLabelChange(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed #2a4058', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none', padding: '2px 0', minWidth: 0 }}
          />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#d0e4f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.label}</span>
        )}
        {canManage && (
          <button onClick={onRemoveTeam} title="Remove team" style={{ background: 'none', border: 'none', color: '#5a7898', cursor: 'pointer', fontSize: 13, padding: '2px', minWidth: 24, minHeight: 24, flexShrink: 0 }}>×</button>
        )}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {slots.map(s => {
          const m = memberById[s.member_id];
          if (!m) return null;
          return <PlayerRow key={s.member_id} member={m} role={s.role} canManage={canManage} onRemove={() => onRemovePlayer(s.member_id)} onCycleRole={() => onCycleRole(s.member_id)} />;
        })}
        {slots.length === 0 && (
          <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic' }}>No players assigned.</div>
        )}
        {canManage && (
          <button onClick={onAddPlayer} style={S.addPlayerBtn}>
            <Plus size={13} /> ADD PLAYER
          </button>
        )}
      </div>
    </div>
  );
}

// ── Team accordion (mobile) ──────────────────────────────────────────
function TeamAccordion({ team, isOpen, onToggle, slots, memberById, canManage, onLabelChange, onRemoveTeam, onAddPlayer, onRemovePlayer, onCycleRole }) {
  return (
    <div style={{ border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', minHeight: 44, textAlign: 'left' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#00c8ff', flexShrink: 0 }}>T{team.number}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#d0e4f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.label}</span>
        <span style={{ fontSize: 10, color: '#5a7898' }}>{slots.length} {isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canManage && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={team.label}
                onChange={e => onLabelChange(e.target.value)}
                placeholder="Team label…"
                style={{ flex: 1, background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none', padding: '8px', minHeight: 40 }}
              />
              <button onClick={onRemoveTeam} title="Remove team" style={{ background: 'none', border: '1px solid #1e3550', color: '#ff4060', cursor: 'pointer', fontSize: 13, minWidth: 40, minHeight: 40 }}>×</button>
            </div>
          )}
          {slots.map(s => {
            const m = memberById[s.member_id];
            if (!m) return null;
            return <PlayerRow key={s.member_id} member={m} role={s.role} canManage={canManage} onRemove={() => onRemovePlayer(s.member_id)} onCycleRole={() => onCycleRole(s.member_id)} />;
          })}
          {slots.length === 0 && (
            <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic' }}>No players assigned.</div>
          )}
          {canManage && (
            <button onClick={onAddPlayer} style={S.addPlayerBtn}>
              <Plus size={13} /> ADD PLAYER
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Member picker (bottom sheet on mobile, popover on desktop) ──────
function MemberPicker({ members, search, setSearch, isMobile, onPick, onClose }) {
  const filtered = members.filter(m => memberName(m).toLowerCase().includes(search.toLowerCase()));

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e3550' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', color: '#00c8ff' }}>ADD PLAYER</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#5a7898' }} />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search roster…"
            style={{ width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 10px 10px 30px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none', boxSizing: 'border-box', minHeight: 44 }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', maxHeight: isMobile ? '50vh' : 360 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic', padding: '8px 0' }}>No members found.</div>
        )}
        {filtered.map(m => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px', marginBottom: 4, background: 'transparent', border: '1px solid #1e3550', cursor: 'pointer', minHeight: 44 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memberName(m)}</div>
              {m.power1 && (
                <div style={{ fontSize: 9, color: '#5a7898', fontFamily: "'Share Tech Mono',monospace" }}>{m.power1}M{m.troop1 ? ` · ${m.troop1}` : ''}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background: '#0d1520', borderTop: '1px solid #1e3550', width: '100%', height: '70vh', display: 'flex', flexDirection: 'column', borderRadius: '12px 12px 0 0' }}>
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

// ── Styles ─────────────────────────────────────────────────────────
const S = {
  iconBtn: { background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  backBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '8px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  smallBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', background: 'transparent', border: '1px solid #1e3550', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', cursor: 'pointer', minHeight: 32, whiteSpace: 'nowrap' },
  weekNavBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(30,53,80,0.5)', border: '1px solid #1e3550', color: '#7a9bb8', padding: '4px 8px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, cursor: 'pointer', minHeight: 32 },
  addPlayerBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 },
};
