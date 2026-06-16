import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Swords, Save, Download, ChevronLeft, ChevronRight, X, Search, Plus, Trash2, Map, List } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

// Desert Storm map image is expected at /public/desert-storm-map.png (user-provided asset, not committed).
// If it's missing, MapView shows a placeholder message instead of a broken image.
const MAP_IMAGE_SRC = '/desert-storm-map.png';

// Fixed marker layout for the (shared, non-customizable) Desert Storm battlefield, as % of image width/height.
const MAP_MARKERS = [
  { name: 'Info Center',        x: 35.5, y: 20.7 },
  { name: 'Field Hospital IV',  x: 68.8, y: 20.7 },
  { name: 'Arsenal',            x: 51.5, y: 20.7 },
  { name: 'Oil Refinery I',     x: 22.5, y: 34.3 },
  { name: 'Field Hospital II',  x: 81.1, y: 34.3 },
  { name: 'Nuclear Silo',       x: 51.5, y: 47.1 },
  { name: 'Field Hospital I',   x: 22.1, y: 60.4 },
  { name: 'Oil Refinery II',    x: 81.1, y: 60.4 },
  { name: 'Mercenary Factory',  x: 51.4, y: 72.1 },
  { name: 'Field Hospital III', x: 30.4, y: 74.6 },
  { name: 'Science Hub',        x: 71.2, y: 74.6 },
];

// Map a category to the trailing roman-numeral/number sequence used to disambiguate
// multiple buildings of the same category (e.g. "Field Hospital I/II/III/IV").
const ROMAN_TO_NUM = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
function trailingOrdinal(name) {
  const m = (name || '').trim().match(/(\d+|[ivx]+)\s*$/i);
  if (!m) return null;
  const token = m[1].toLowerCase();
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return ROMAN_TO_NUM[token] ?? null;
}

const CATEGORY_TO_MARKER_BASE = {
  info_center: 'Info Center',
  arsenal: 'Arsenal',
  oil_refinery: 'Oil Refinery',
  nuclear_silo: 'Nuclear Silo',
  field_hospital: 'Field Hospital',
  mercenary_factory: 'Mercenary Factory',
  science_hub: 'Science Hub',
};

// Match a building (free-text name + category) to one of the fixed MAP_MARKERS.
// Primary: category. Fallback: case-insensitive substring name match.
// When multiple markers share a category base (e.g. Field Hospital I-IV), disambiguate by trailing ordinal.
function matchBuildingToMarker(building) {
  const base = CATEGORY_TO_MARKER_BASE[building.category];
  if (base) {
    const candidates = MAP_MARKERS.filter(mk => mk.name.startsWith(base));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const bOrd = trailingOrdinal(building.name);
      if (bOrd != null) {
        const byOrd = candidates.find(mk => trailingOrdinal(mk.name) === bOrd);
        if (byOrd) return byOrd;
      }
      // Fallback: substring match within the candidate set.
      const lowerName = (building.name || '').toLowerCase();
      const bySubstr = candidates.find(mk => lowerName.includes(mk.name.toLowerCase()));
      if (bySubstr) return bySubstr;
    }
  }
  // Full fallback: fuzzy substring match against all markers by name.
  const lowerName = (building.name || '').toLowerCase();
  const direct = MAP_MARKERS.find(mk => lowerName.includes(mk.name.toLowerCase()) || mk.name.toLowerCase().includes(lowerName));
  return direct || null;
}

const PHASE_DOT_COLOR = {
  phase1: '#00c8ff',
  phase2: '#f0a500',
};
function phaseDotColor(building) {
  return PHASE_DOT_COLOR[building.phase] || '#7a9bb8'; // kill_squad / substitutes / null -> neutral
}

// ── Constants ──────────────────────────────────────────────────────
const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const EVENT_TYPES = [
  { id: 'canyon', label: 'CANYON STORM', icon: '🏔' },
  { id: 'desert', label: 'DESERT STORM', icon: '🏜' },
];

const TASKFORCES = ['A', 'B'];

const ROLE_META = {
  coordinator: { label: 'Role: Coordinator', icon: '👑', color: '#ffd700' },
  lethal:      { label: 'Role: Lethal Killer', icon: '🔥', color: '#ff4060' },
  science:     { label: 'Role: Science',      icon: '✅', color: '#00e87a' },
  info:        { label: 'Role: Info',         icon: 'ℹ️', color: '#00c8ff' },
};
const ROLE_CYCLE = [null, 'coordinator', 'lethal', 'science', 'info'];

const CATEGORY_META = {
  oil_refinery:      { icon: '🛢️', label: 'Oil Refinery' },
  info_center:       { icon: 'ℹ️', label: 'Info Center' },
  science_hub:       { icon: '🔬', label: 'Science Hub' },
  field_hospital:    { icon: '➕', label: 'Field Hospital' },
  oil_well:          { icon: '🪨', label: 'Oil Well' },
  arsenal:           { icon: '⚔️', label: 'Arsenal' },
  mercenary_factory: { icon: '🏭', label: 'Mercenary Factory' },
  nuclear_silo:      { icon: '☢️', label: 'Nuclear Silo' },
  kill_squad:        { icon: '💀', label: 'Kill Squad' },
  substitutes:       { icon: '🔄', label: 'Substitutes' },
  custom:            { icon: '🏗️', label: 'Custom' },
};

const DEFAULT_BUILDINGS = [
  { name: 'Oil Refinery',        category: 'oil_refinery',      phase: 'phase1' },
  { name: 'Info Center',         category: 'info_center',       phase: 'phase1' },
  { name: 'Science Hub',         category: 'science_hub',       phase: 'phase1' },
  { name: 'Field Hospital 1',    category: 'field_hospital',    phase: 'phase1' },
  { name: 'Field Hospital 2',    category: 'field_hospital',    phase: 'phase1' },
  { name: 'Arsenal',             category: 'arsenal',           phase: 'phase2' },
  { name: 'Mercenary Factory',   category: 'mercenary_factory', phase: 'phase2' },
  { name: 'Nuclear Silo',        category: 'nuclear_silo',      phase: 'phase2' },
  { name: 'Kill Squad',          category: 'kill_squad',        phase: null },
  { name: 'Substitutes',         category: 'substitutes',       phase: null },
];

const SECTIONS = [
  { key: 'phase1',     title: 'PHASE 1 — FIRST 10 MIN',   match: b => b.phase === 'phase1',                         newDefaults: { category: 'custom', phase: 'phase1' } },
  { key: 'phase2',     title: 'PHASE 2 — AFTER MINUTE 10', match: b => b.phase === 'phase2',                         newDefaults: { category: 'custom', phase: 'phase2' } },
  { key: 'kill_squad', title: 'KILL SQUAD',                match: b => b.category === 'kill_squad' && !b.phase,      newDefaults: { category: 'kill_squad', phase: null } },
  { key: 'substitutes',title: 'SUBSTITUTES',               match: b => b.category === 'substitutes' && !b.phase,     newDefaults: { category: 'substitutes', phase: null } },
];

// ── Helpers ────────────────────────────────────────────────────────
function memberName(m) {
  return m?.in_game_name || m?.username || '?';
}

function categoryMeta(cat) {
  return CATEGORY_META[cat] || CATEGORY_META.custom;
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

// Local id generator for not-yet-saved buildings, so links_to_id can reference them client-side.
let localIdCounter = 0;
function localId() {
  localIdCounter += 1;
  return `local_${Date.now()}_${localIdCounter}`;
}

function emptyBuilding(defaults) {
  return {
    id: localId(),
    name: 'New Building',
    category: defaults.category,
    phase: defaults.phase,
    links_to_id: null,
    sort_order: 0,
    assignments: [], // [{ member_id, role }]
  };
}

function seedBuildings() {
  return DEFAULT_BUILDINGS.map((b, i) => ({
    id: localId(),
    name: b.name,
    category: b.category,
    phase: b.phase,
    links_to_id: null,
    sort_order: i,
    assignments: [],
  }));
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
  const [allPlans, setAllPlans] = useState([]); // [{id, event_type, taskforce, week_label, rules_text}]
  const [allBuildings, setAllBuildings] = useState({}); // plan_id -> buildings[]

  const [currentWeekKey, setCurrentWeekKey] = useState('');
  const [planId, setPlanId] = useState(null);
  const [rulesText, setRulesText] = useState('');
  const [buildings, setBuildings] = useState([]); // [{id, name, category, phase, links_to_id, sort_order, assignments:[{member_id,role}]}]

  const [pendingNav, setPendingNav] = useState(null);
  const [picker, setPicker] = useState(null); // { buildingId } | null
  const [pickerSearch, setPickerSearch] = useState('');

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [openAccordion, setOpenAccordion] = useState({});
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'

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
        const { data: buildingRows } = await supabase.from('battle_plan_buildings').select('*').in('plan_id', planIds).order('sort_order');
        const buildingsByPlan = {};
        (buildingRows ?? []).forEach(b => {
          if (!buildingsByPlan[b.plan_id]) buildingsByPlan[b.plan_id] = [];
          buildingsByPlan[b.plan_id].push({ ...b, assignments: [] });
        });
        const allBuildingIds = (buildingRows ?? []).map(b => b.id);
        const assignmentsByBuilding = {};
        if (allBuildingIds.length > 0) {
          const { data: assignRows } = await supabase.from('battle_plan_assignments').select('*').in('building_id', allBuildingIds).order('sort_order');
          (assignRows ?? []).forEach(a => {
            if (!assignmentsByBuilding[a.building_id]) assignmentsByBuilding[a.building_id] = [];
            assignmentsByBuilding[a.building_id].push({ member_id: a.member_id, role: a.role });
          });
        }
        Object.keys(buildingsByPlan).forEach(pid => {
          buildingsByPlan[pid] = buildingsByPlan[pid].map(b => ({ ...b, assignments: assignmentsByBuilding[b.id] ?? [] }));
        });
        grouped = buildingsByPlan;
        setAllBuildings(grouped);
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

  function applyForEventTaskforce(evt, tf, plansList, buildingsMap) {
    const list = plansFor(evt, tf, plansList);
    const todayMonday = toDateString(getMondayDate());
    let target = list.find(p => p.week_label === todayMonday);
    if (!target && list.length > 0) target = list[list.length - 1];

    if (target) {
      applyPlan(target, buildingsMap[target.id] ?? (allBuildings[target.id] ?? []), evt);
    } else {
      setPlanId(null);
      setCurrentWeekKey(todayMonday);
      setRulesText('');
      setBuildings(evt === 'desert' ? seedBuildings() : []);
      setIsDirty(false);
    }
  }

  function applyPlan(plan, buildingRows, evt) {
    setPlanId(plan.id);
    setCurrentWeekKey(plan.week_label ?? '');
    setRulesText(plan.rules_text ?? '');
    const rows = buildingRows ?? [];
    setBuildings(rows.length > 0 ? rows.map(b => ({ ...b })) : (evt === 'desert' || plan.event_type === 'desert' ? seedBuildings() : []));
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
    applyForEventTaskforce(evt, tf, allPlans, allBuildings);
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
        .insert({ alliance_id: myAllianceId, event_type: eventType, taskforce, week_label: wLabel, rules_text: rulesText })
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
        .update({ rules_text: rulesText, week_label: wLabel })
        .eq('id', pid).select('*').single();
      setAllPlans(prev => prev.map(p => p.id === pid ? (data ?? { ...p, rules_text: rulesText, week_label: wLabel }) : p));
    }

    if (!pid) { setSaving(false); return; }

    // Replace all buildings + assignments for this plan.
    // Map local (client-generated) ids to real DB ids so links_to_id resolves correctly.
    await supabase.from('battle_plan_buildings').delete().eq('plan_id', pid);

    const idMap = {};
    // Insert buildings first without links_to_id, then update links in a second pass.
    const buildingInserts = buildings.map((b, i) => ({
      plan_id: pid,
      name: b.name,
      category: b.category,
      phase: b.phase,
      links_to_id: null,
      sort_order: b.sort_order ?? i,
    }));
    const { data: insertedBuildings } = await supabase.from('battle_plan_buildings').insert(buildingInserts).select('*');

    (insertedBuildings ?? []).forEach((row, i) => {
      idMap[buildings[i].id] = row.id;
    });

    // Second pass: set links_to_id using the id map.
    const linkUpdates = buildings
      .map((b) => ({ realId: idMap[b.id], linksTo: b.links_to_id ? idMap[b.links_to_id] : null }))
      .filter(u => u.realId && u.linksTo);
    await Promise.all(linkUpdates.map(u => supabase.from('battle_plan_buildings').update({ links_to_id: u.linksTo }).eq('id', u.realId)));

    // Insert assignments for each building.
    const assignmentRows = [];
    buildings.forEach((b) => {
      const realBuildingId = idMap[b.id];
      if (!realBuildingId) return;
      (b.assignments ?? []).forEach((a, ai) => {
        assignmentRows.push({ building_id: realBuildingId, member_id: a.member_id, role: a.role ?? null, sort_order: ai });
      });
    });
    if (assignmentRows.length > 0) {
      await supabase.from('battle_plan_assignments').insert(assignmentRows);
    }

    // Update local state to reflect real ids.
    const newBuildings = buildings.map(b => ({
      ...b,
      id: idMap[b.id] ?? b.id,
      links_to_id: b.links_to_id ? (idMap[b.links_to_id] ?? b.links_to_id) : null,
    }));
    setBuildings(newBuildings);
    setAllBuildings(prev => ({ ...prev, [pid]: newBuildings }));

    setSaving(false);
    setSaved(true);
    setIsDirty(false);
    setTimeout(() => setSaved(false), 2500);
  }, [myAllianceId, planId, currentWeekKey, eventType, taskforce, rulesText, buildings]);

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
    if (dir === -1 && idx > 0) applyPlan(list[idx - 1], allBuildings[list[idx - 1].id] ?? [], eventType);
    else if (dir === 1 && idx < list.length - 1) applyPlan(list[idx + 1], allBuildings[list[idx + 1].id] ?? [], eventType);
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
    // Duplicate building names/categories/phases/links, clear assignments.
    setBuildings(prev => {
      const idMap = {};
      const cloned = prev.map(b => {
        const newBid = localId();
        idMap[b.id] = newBid;
        return { ...b, id: newBid, assignments: [] };
      });
      return cloned.map(b => ({ ...b, links_to_id: b.links_to_id ? (idMap[b.links_to_id] ?? null) : null }));
    });
    setIsDirty(true);
  }

  async function handleDeleteWeek() {
    if (!planId) { alert('This week has not been saved yet — nothing to delete.'); return; }
    if (!confirm('Delete this entire week\'s plan? This cannot be undone.')) return;
    await supabase.from('battle_plan_buildings').delete().eq('plan_id', planId);
    await supabase.from('battle_plans').delete().eq('id', planId);
    const remaining = allPlans.filter(p => p.id !== planId);
    setAllPlans(remaining);
    const list = plansFor(eventType, taskforce, remaining);
    if (list.length > 0) applyPlan(list[list.length - 1], allBuildings[list[list.length - 1].id] ?? [], eventType);
    else {
      setPlanId(null);
      setCurrentWeekKey(toDateString(getMondayDate()));
      setRulesText('');
      setBuildings(eventType === 'desert' ? seedBuildings() : []);
      setIsDirty(false);
    }
  }

  // ── Building editing ──────────────────────────────────────────────
  function addBuilding(sectionKey) {
    if (!canManage) return;
    const section = SECTIONS.find(s => s.key === sectionKey);
    if (!section) return;
    setBuildings(prev => [...prev, { ...emptyBuilding(section.newDefaults), sort_order: prev.length }]);
    markDirty();
  }
  function renameBuilding(buildingId, name) {
    if (!canManage) return;
    setBuildings(prev => prev.map(b => b.id === buildingId ? { ...b, name } : b));
    markDirty();
  }
  function deleteBuilding(buildingId) {
    if (!canManage) return;
    if (!confirm('Delete this building? Assigned players will be removed from it.')) return;
    setBuildings(prev => prev
      .filter(b => b.id !== buildingId)
      .map(b => b.links_to_id === buildingId ? { ...b, links_to_id: null } : b));
    markDirty();
  }
  function setLinksTo(buildingId, targetId) {
    if (!canManage) return;
    setBuildings(prev => prev.map(b => b.id === buildingId ? { ...b, links_to_id: targetId || null } : b));
    markDirty();
  }

  // ── Assignment helpers ──────────────────────────────────────────────
  const memberById = Object.fromEntries(members.map(m => [m.id, m]));

  function assignMember(memberId, buildingId) {
    if (!canManage) return;
    setBuildings(prev => prev.map(b => {
      if (b.id !== buildingId) return b;
      if ((b.assignments ?? []).some(a => a.member_id === memberId)) return b;
      return { ...b, assignments: [...(b.assignments ?? []), { member_id: memberId, role: null }] };
    }));
    markDirty();
    setPicker(null);
    setPickerSearch('');
  }
  function removeMember(memberId, buildingId) {
    if (!canManage) return;
    setBuildings(prev => prev.map(b => b.id === buildingId ? { ...b, assignments: (b.assignments ?? []).filter(a => a.member_id !== memberId) } : b));
    markDirty();
  }
  function cycleRole(memberId, buildingId) {
    if (!canManage) return;
    setBuildings(prev => prev.map(b => {
      if (b.id !== buildingId) return b;
      return {
        ...b,
        assignments: (b.assignments ?? []).map(a => {
          if (a.member_id !== memberId) return a;
          const idx = ROLE_CYCLE.indexOf(a.role);
          const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length];
          return { ...a, role: next };
        }),
      };
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

    function lineForBuilding(b) {
      const meta = categoryMeta(b.category);
      const linkTarget = b.links_to_id ? buildings.find(x => x.id === b.links_to_id) : null;
      const arrow = linkTarget ? ` → ${categoryMeta(linkTarget.category).icon} ${linkTarget.name}` : '';
      lines.push(`${meta.icon} ${b.name}${arrow}`);
      const assigns = b.assignments ?? [];
      if (assigns.length === 0) lines.push('  (no players assigned)');
      assigns.forEach(a => {
        const m = memberById[a.member_id];
        if (!m) return;
        const roleMeta = a.role ? ROLE_META[a.role] : null;
        const icon = roleMeta ? roleMeta.icon + ' ' : '';
        const power = m.power1 ? `${m.power1}M` : '?';
        const troop = m.troop1 ? `, ${m.troop1}` : '';
        lines.push(`  ${icon}${memberName(m)} (${power}${troop})`);
      });
    }

    SECTIONS.forEach(section => {
      const list = buildings.filter(section.match);
      lines.push('');
      lines.push(section.title);
      if (list.length === 0) lines.push('(none)');
      list.forEach(lineForBuilding);
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

  const phase2Buildings = buildings.filter(b => b.phase === 'phase2');

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
          members={members.filter(m => !(buildings.find(b => b.id === picker.buildingId)?.assignments ?? []).some(a => a.member_id === m.id))}
          search={pickerSearch}
          setSearch={setPickerSearch}
          isMobile={isMobile}
          onPick={(memberId) => assignMember(memberId, picker.buildingId)}
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
          {eventType === 'desert' && (
            <button onClick={handleExport} style={{ ...S.smallBtn, color: '#8aadcc' }}><Download size={12} /> {isMobile ? '' : 'COPY FOR DISCORD'}</button>
          )}
          {eventType === 'desert' && canManage && (
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

        {/* Taskforce sub-tabs + week nav — only relevant for desert storm */}
        {eventType === 'desert' && (
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
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: isMobile ? '12px 10px 40px' : '20px 24px 40px', maxWidth: 1400, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {eventType === 'canyon' ? (
          <div style={{ border: '1px solid #1e3550', background: 'rgba(20,35,55,0.25)', padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '1.5px', color: '#f0a500', marginBottom: 8 }}>WORK IN PROGRESS</div>
            <p style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              Canyon Storm planner coming soon — building layouts differ from Desert Storm.
            </p>
          </div>
        ) : (
          <>
            {/* List / Map view toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid #1e3550', width: 'fit-content' }}>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  background: viewMode === 'list' ? 'rgba(0,200,255,0.12)' : 'transparent', border: 'none',
                  color: viewMode === 'list' ? '#00c8ff' : '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                  fontSize: 11, letterSpacing: '1.5px', cursor: 'pointer', minHeight: 44,
                }}
              >
                <List size={13} /> LIST VIEW
              </button>
              <button
                onClick={() => setViewMode('map')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  background: viewMode === 'map' ? 'rgba(0,200,255,0.12)' : 'transparent', border: 'none',
                  color: viewMode === 'map' ? '#00c8ff' : '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                  fontSize: 11, letterSpacing: '1.5px', cursor: 'pointer', minHeight: 44, borderLeft: '1px solid #1e3550',
                }}
              >
                <Map size={13} /> MAP VIEW
              </button>
            </div>

            {viewMode === 'map' && (
              <MapView
                buildings={buildings}
                memberById={memberById}
                isMobile={isMobile}
                taskforce={taskforce}
                weekLabel={currentWeekKey}
                onMarkerClick={(buildingId) => setPicker({ buildingId })}
              />
            )}

            {viewMode === 'list' && SECTIONS.map(section => {
              const list = buildings.filter(section.match).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              return (
                <div key={section.key} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8' }}>{section.title}</div>
                    {canManage && (
                      <button onClick={() => addBuilding(section.key)} style={{ ...S.smallBtn, border: '1px solid #1e3550', color: '#7a9bb8' }}>
                        <Plus size={12} /> ADD BUILDING
                      </button>
                    )}
                  </div>

                  {list.length === 0 && (
                    <div style={{ color: '#5a7898', fontSize: 12, fontStyle: 'italic' }}>No buildings in this section yet.</div>
                  )}

                  {isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {list.map(b => (
                        <BuildingAccordion
                          key={b.id}
                          building={b}
                          isOpen={!!openAccordion[b.id]}
                          onToggle={() => setOpenAccordion(prev => ({ ...prev, [b.id]: !prev[b.id] }))}
                          memberById={memberById}
                          canManage={canManage}
                          phase2Options={phase2Buildings}
                          linkTarget={b.links_to_id ? buildings.find(x => x.id === b.links_to_id) : null}
                          onRename={n => renameBuilding(b.id, n)}
                          onDelete={() => deleteBuilding(b.id)}
                          onSetLinksTo={tid => setLinksTo(b.id, tid)}
                          onAddPlayer={() => setPicker({ buildingId: b.id })}
                          onRemovePlayer={mid => removeMember(mid, b.id)}
                          onCycleRole={mid => cycleRole(mid, b.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(list.length, 4) || 1}, 1fr)`, gap: 14 }}>
                      {list.map(b => (
                        <BuildingCard
                          key={b.id}
                          building={b}
                          memberById={memberById}
                          canManage={canManage}
                          phase2Options={phase2Buildings}
                          linkTarget={b.links_to_id ? buildings.find(x => x.id === b.links_to_id) : null}
                          onRename={n => renameBuilding(b.id, n)}
                          onDelete={() => deleteBuilding(b.id)}
                          onSetLinksTo={tid => setLinksTo(b.id, tid)}
                          onAddPlayer={() => setPicker({ buildingId: b.id })}
                          onRemovePlayer={mid => removeMember(mid, b.id)}
                          onCycleRole={mid => cycleRole(mid, b.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

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
          </>
        )}
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

// ── Building name editor (inline, admin only) ──────────────────────
function BuildingNameEditor({ name, canManage, onRename, style }) {
  if (!canManage) {
    return <span style={{ fontSize: 12, fontWeight: 700, color: '#d0e4f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>{name}</span>;
  }
  return (
    <input
      value={name}
      onChange={e => onRename(e.target.value)}
      style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed #2a4058', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none', padding: '2px 0', minWidth: 0, ...style }}
    />
  );
}

// ── Phase transition link control ───────────────────────────────────
function LinksToControl({ building, phase2Options, linkTarget, canManage, onSetLinksTo }) {
  if (building.phase !== 'phase1') return null;
  if (!canManage) {
    if (!linkTarget) return null;
    return (
      <div style={{ fontSize: 10, color: '#8aadcc', marginTop: 6 }}>
        → {categoryMeta(linkTarget.category).icon} {linkTarget.name}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <select
        value={building.links_to_id || ''}
        onChange={e => onSetLinksTo(e.target.value || null)}
        style={{ width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#8aadcc', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, padding: '6px 6px', outline: 'none', minHeight: 32 }}
      >
        <option value="">→ moves to: (none)</option>
        {phase2Options.map(opt => (
          <option key={opt.id} value={opt.id}>→ {opt.name}</option>
        ))}
      </select>
    </div>
  );
}

// ── Building card (desktop/tablet) ──────────────────────────────────
function BuildingCard({ building, memberById, canManage, phase2Options, linkTarget, onRename, onDelete, onSetLinksTo, onAddPlayer, onRemovePlayer, onCycleRole }) {
  const meta = categoryMeta(building.category);
  return (
    <div style={{ border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3550' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>
          <BuildingNameEditor name={building.name} canManage={canManage} onRename={onRename} />
          {canManage && (
            <button onClick={onDelete} title="Delete building" style={{ background: 'none', border: 'none', color: '#5a7898', cursor: 'pointer', fontSize: 13, padding: '2px', minWidth: 24, minHeight: 24, flexShrink: 0 }}>×</button>
          )}
        </div>
        <LinksToControl building={building} phase2Options={phase2Options} linkTarget={linkTarget} canManage={canManage} onSetLinksTo={onSetLinksTo} />
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {(building.assignments ?? []).map(a => {
          const m = memberById[a.member_id];
          if (!m) return null;
          return <PlayerRow key={a.member_id} member={m} role={a.role} canManage={canManage} onRemove={() => onRemovePlayer(a.member_id)} onCycleRole={() => onCycleRole(a.member_id)} />;
        })}
        {(building.assignments ?? []).length === 0 && (
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

// ── Building accordion (mobile) ──────────────────────────────────────
function BuildingAccordion({ building, isOpen, onToggle, memberById, canManage, phase2Options, linkTarget, onRename, onDelete, onSetLinksTo, onAddPlayer, onRemovePlayer, onCycleRole }) {
  const meta = categoryMeta(building.category);
  const count = (building.assignments ?? []).length;
  return (
    <div style={{ border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', minHeight: 44, textAlign: 'left' }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#d0e4f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{building.name}</span>
        <span style={{ fontSize: 10, color: '#5a7898' }}>{count} {isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canManage && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={building.name}
                onChange={e => onRename(e.target.value)}
                placeholder="Building name…"
                style={{ flex: 1, background: '#0a1220', border: '1px solid #1e3550', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none', padding: '8px', minHeight: 40 }}
              />
              <button onClick={onDelete} title="Delete building" style={{ background: 'none', border: '1px solid #1e3550', color: '#ff4060', cursor: 'pointer', fontSize: 13, minWidth: 40, minHeight: 40 }}>×</button>
            </div>
          )}
          <LinksToControl building={building} phase2Options={phase2Options} linkTarget={linkTarget} canManage={canManage} onSetLinksTo={onSetLinksTo} />
          {(building.assignments ?? []).map(a => {
            const m = memberById[a.member_id];
            if (!m) return null;
            return <PlayerRow key={a.member_id} member={m} role={a.role} canManage={canManage} onRemove={() => onRemovePlayer(a.member_id)} onCycleRole={() => onCycleRole(a.member_id)} />;
          })}
          {(building.assignments ?? []).length === 0 && (
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

// ── Map view ──────────────────────────────────────────────────────
function MapView({ buildings, memberById, isMobile, taskforce, weekLabel, onMarkerClick }) {
  const [imgStatus, setImgStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Match each building (with a marker) — first match wins per marker name.
  const matched = []; // [{ marker, building }]
  const usedMarkerNames = new Set();
  buildings.forEach(b => {
    const marker = matchBuildingToMarker(b);
    if (!marker || usedMarkerNames.has(marker.name)) return;
    usedMarkerNames.add(marker.name);
    matched.push({ marker, building: b });
  });

  const byBuildingId = Object.fromEntries(matched.map(m => [m.building.id, m]));

  // Connector lines: phase1 building -> linked phase2 building, when both are matched to markers.
  const connectors = matched
    .filter(m => m.building.phase === 'phase1' && m.building.links_to_id)
    .map(m => {
      const target = byBuildingId[m.building.links_to_id];
      if (!target) return null;
      return { from: m.marker, to: target.marker };
    })
    .filter(Boolean);

  function handleDownload() {
    const img = imgRef.current;
    if (!img || imgStatus !== 'ok') return;
    const canvas = document.createElement('canvas');
    const w = img.naturalWidth || 1200;
    const h = img.naturalHeight || 800;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Connectors first (under markers).
    ctx.strokeStyle = 'rgba(0,200,255,0.8)';
    ctx.lineWidth = Math.max(2, w * 0.0025);
    connectors.forEach(c => {
      const x1 = (c.from.x / 100) * w, y1 = (c.from.y / 100) * h;
      const x2 = (c.to.x / 100) * w, y2 = (c.to.y / 100) * h;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(10, w * 0.012);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,200,255,0.8)';
      ctx.fill();
    });

    // Markers + labels.
    matched.forEach(({ marker, building }) => {
      const cx = (marker.x / 100) * w;
      const cy = (marker.y / 100) * h;
      const dotR = Math.max(5, w * 0.006);
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = phaseDotColor(building);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0a1220';
      ctx.stroke();

      const names = (building.assignments ?? []).map(a => {
        const m = memberById[a.member_id];
        return m ? memberName(m) : null;
      }).filter(Boolean);

      const labelLines = [building.name, ...(names.length > 0 ? [names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '')] : ['(unassigned)'])];

      const fontSize = Math.max(12, Math.round(w * 0.012));
      ctx.font = `bold ${fontSize}px Arial`;
      const padding = 6;
      const lineHeight = fontSize + 4;
      const textW = Math.max(...labelLines.map(l => ctx.measureText(l).width));
      const boxW = textW + padding * 2;
      const boxH = lineHeight * labelLines.length + padding;
      const boxX = cx - boxW / 2;
      const boxY = cy + dotR + 4;

      ctx.fillStyle = 'rgba(8,13,20,0.85)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = 'rgba(122,155,184,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      labelLines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#ffffff' : '#a8c4dc';
        ctx.fillText(line, cx, boxY + padding / 2 + i * lineHeight);
      });
    });

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `desert-storm-${taskforce}-${weekLabel || 'week'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10 }}>
        {imgStatus === 'ok' && (
          <button onClick={handleDownload} style={{ ...S.smallBtn, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.4)', color: '#00e87a' }}>
            <Download size={12} /> DOWNLOAD MAP
          </button>
        )}
      </div>

      {imgStatus === 'error' && (
        <div style={{ border: '1px solid #1e3550', background: 'rgba(20,35,55,0.25)', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🗺️</div>
          <div style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6 }}>
            Upload <code style={{ color: '#f0a500' }}>public/desert-storm-map.png</code> to enable the map view.
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          display: imgStatus === 'error' ? 'none' : 'block',
          overflow: 'auto', maxWidth: '100%', border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)',
        }}
      >
        <div style={{ position: 'relative', width: isMobile ? 900 : '100%', maxWidth: isMobile ? 'none' : 1100, margin: isMobile ? 0 : '0 auto' }}>
          <img
            ref={imgRef}
            src={MAP_IMAGE_SRC}
            alt="Desert Storm map"
            onLoad={() => setImgStatus('ok')}
            onError={() => setImgStatus('error')}
            style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }}
          />

          {imgStatus === 'ok' && (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <marker id="ds-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="rgba(0,200,255,0.85)" />
                </marker>
              </defs>
              {connectors.map((c, i) => (
                <line
                  key={i}
                  x1={`${c.from.x}%`} y1={`${c.from.y}%`}
                  x2={`${c.to.x}%`} y2={`${c.to.y}%`}
                  stroke="rgba(0,200,255,0.85)" strokeWidth={2}
                  markerEnd="url(#ds-arrowhead)"
                />
              ))}
            </svg>
          )}

          {imgStatus === 'ok' && matched.map(({ marker, building }) => {
            const names = (building.assignments ?? []).map(a => {
              const m = memberById[a.member_id];
              return m ? memberName(m) : null;
            }).filter(Boolean);
            const shownNames = names.slice(0, 3);
            const extra = names.length - shownNames.length;
            const onLeftHalf = marker.x < 50;
            const dotColor = phaseDotColor(building);

            return (
              <button
                key={building.id}
                onClick={() => onMarkerClick(building.id)}
                title={`${building.name} — tap to assign players`}
                style={{
                  position: 'absolute', left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -50%)',
                  display: 'flex', flexDirection: 'column', alignItems: onLeftHalf ? 'flex-start' : 'flex-end',
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  minWidth: 44, minHeight: 44, justifyContent: 'center', zIndex: 2,
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%', background: dotColor,
                  border: '2px solid #0a1220', boxShadow: `0 0 6px ${dotColor}`, flexShrink: 0,
                }} />
                <div style={{
                  marginTop: 4, background: 'rgba(8,13,20,0.88)', border: '1px solid rgba(122,155,184,0.4)',
                  padding: '4px 7px', maxWidth: 130, textAlign: onLeftHalf ? 'left' : 'right',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {building.name}
                  </div>
                  {shownNames.length > 0 ? (
                    <div style={{ fontSize: 9, color: '#a8c4dc', lineHeight: 1.4 }}>
                      {shownNames.join(', ')}{extra > 0 ? ` +${extra} more` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: '#5a7898', fontStyle: 'italic' }}>unassigned</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
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
