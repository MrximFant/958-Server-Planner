import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// Palette used to assign each distinct building (or combined group of buildings) its own
// marker dot color. Buildings sharing a combine_group are really one team, so they share
// a color; every other distinct building/group gets the next color in the palette, wrapping
// around if there are ever more distinct keys than palette entries.
const MARKER_COLOR_PALETTE = ['#00c8ff', '#ff6b35', '#a855f7', '#22d3ee', '#facc15', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#4ade80', '#c084fc'];

// Given the list of { marker, building } pairs already matched & rendered on the map, assign
// each distinct building/combined-group a stable, deterministic color. Effective key = building's
// combine_group if set, else its own id. Order of first appearance in `matched` determines which
// palette color a key gets. Returns a map of buildingId -> color.
function computeMarkerColors(matched) {
  const colorByKey = {};
  const colorByBuildingId = {};
  let idx = 0;
  matched.forEach(({ building }) => {
    const key = building.combine_group || building.id;
    if (!(key in colorByKey)) {
      colorByKey[key] = MARKER_COLOR_PALETTE[idx % MARKER_COLOR_PALETTE.length];
      idx += 1;
    }
    colorByBuildingId[building.id] = colorByKey[key];
  });
  return colorByBuildingId;
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
  lethal:      { label: 'Role: Moves to next building', icon: '🔥', color: '#ff4060' },
};
const ROLE_CYCLE = [null, 'coordinator', 'lethal'];

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
  { name: 'Oil Refinery 1',      category: 'oil_refinery',      phase: 'phase1' },
  { name: 'Oil Refinery 2',      category: 'oil_refinery',      phase: 'phase1' },
  { name: 'Info Center',         category: 'info_center',       phase: 'phase1' },
  { name: 'Science Hub',         category: 'science_hub',       phase: 'phase1' },
  { name: 'Field Hospital 1',    category: 'field_hospital',    phase: 'phase1' },
  { name: 'Field Hospital 2',    category: 'field_hospital',    phase: 'phase1' },
  { name: 'Field Hospital 3',    category: 'field_hospital',    phase: 'phase1' },
  { name: 'Field Hospital 4',    category: 'field_hospital',    phase: 'phase1' },
  { name: 'Arsenal',             category: 'arsenal',           phase: 'phase2' },
  { name: 'Mercenary Factory',   category: 'mercenary_factory', phase: 'phase2' },
  { name: 'Nuclear Silo',        category: 'nuclear_silo',      phase: 'phase2' },
  { name: 'Substitutes',         category: 'substitutes',       phase: null },
];

const SECTIONS = [
  { key: 'phase1',     title: 'PHASE 1 — FIRST 10 MIN',   match: b => b.phase === 'phase1',                         newDefaults: { category: 'custom', phase: 'phase1' } },
  { key: 'phase2',     title: 'PHASE 2 — AFTER MINUTE 10', match: b => b.phase === 'phase2',                         newDefaults: { category: 'custom', phase: 'phase2' } },
  { key: 'substitutes',title: 'SUBSTITUTES',               match: b => b.category === 'substitutes' && !b.phase,     newDefaults: { category: 'substitutes', phase: null } },
];

// ── Helpers ────────────────────────────────────────────────────────
function memberName(m) {
  return m?.in_game_name || m?.username || '?';
}

function categoryMeta(cat) {
  return CATEGORY_META[cat] || CATEGORY_META.custom;
}

// Players assigned to a phase1 building with role === 'lethal' (🔥) whose building links_to
// the given phase2 building are displayed as "present" there too (map/export only — no new
// battle_plan_assignments row is created). Returns deduped member ids, with their source
// building attached for export-text disambiguation.
function getIncomingFireMembers(phase2BuildingId, buildings) {
  const seen = new Set();
  const result = [];
  buildings
    .filter(b => b.phase === 'phase1' && b.links_to_id === phase2BuildingId)
    .forEach(sourceBuilding => {
      (sourceBuilding.assignments ?? [])
        .filter(a => a.role === 'lethal')
        .forEach(a => {
          if (seen.has(a.member_id)) return;
          seen.add(a.member_id);
          result.push({ member_id: a.member_id, sourceBuilding });
        });
    });
  return result;
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
    combine_group: null,
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
    combine_group: null,
    assignments: [],
  }));
}

// Find other buildings sharing the same non-null combine_group.
function groupmateBuildings(building, allBuildings) {
  const group = building.combine_group || null;
  if (!group) return [];
  return allBuildings.filter(b => b.id !== building.id && b.combine_group === group);
}

function assignedInSiblingTaskforce(eventType, weekLabel, taskforce, allPlans, allBuildings) {
  const result = new Set();
  if (!weekLabel) return result;
  const sibling = allPlans.find(p => p.event_type === eventType && p.week_label === weekLabel && p.taskforce !== taskforce);
  if (!sibling) return result;
  (allBuildings[sibling.id] ?? []).forEach(b => (b.assignments ?? []).forEach(a => result.add(a.member_id)));
  return result;
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
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);

  // No-show tracking
  const [allNoshows, setAllNoshows] = useState([]); // all battle_plan_noshows rows for this alliance
  const [noshowModalOpen, setNoshowModalOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Auto-derived plan title (replaces the old manual "Plan Name" field).
  const planTitle = `${alliance?.name || 'Alliance'} — Taskforce ${taskforce}`;

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
      const [{ data: al }, { data: mems }, { data: plans }, { data: noshows }] = await Promise.all([
        supabase.from('alliances').select('id, name, color, server_id').eq('id', myAllianceId).single(),
        supabase.from('members').select('id, username, in_game_name, power1, troop1, alliance_role').eq('alliance_id', myAllianceId).order('username'),
        supabase.from('battle_plans').select('*').eq('alliance_id', myAllianceId).order('week_label'),
        supabase.from('battle_plan_noshows').select('*').eq('alliance_id', myAllianceId),
      ]);
      setAlliance(al);
      setMembers(mems ?? []);
      setAllPlans(plans ?? []);
      setAllNoshows(noshows ?? []);

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
      combine_group: b.combine_group || null,
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

  // ── No-show tracking ────────────────────────────────────────────────
  // Saves a diff against existing battle_plan_noshows rows for the exact
  // (alliance, event_type, taskforce, week_label) scope: inserts newly-checked
  // members, deletes unchecked ones. Doesn't require planId to exist in DB yet.
  async function handleSaveNoshows(checkedMemberIds) {
    if (!myAllianceId) return;
    const wLabel = currentWeekKey || toDateString(getMondayDate());
    const existing = allNoshows.filter(n => n.alliance_id === myAllianceId && n.event_type === eventType && n.taskforce === taskforce && n.week_label === wLabel);
    const existingIds = new Set(existing.map(n => n.member_id));
    const checkedSet = new Set(checkedMemberIds);

    const toInsert = [...checkedSet].filter(mid => !existingIds.has(mid));
    const toDeleteRows = existing.filter(n => !checkedSet.has(n.member_id));

    if (toInsert.length > 0) {
      await supabase.from('battle_plan_noshows').insert(
        toInsert.map(mid => ({ alliance_id: myAllianceId, event_type: eventType, taskforce, week_label: wLabel, member_id: mid }))
      );
    }
    if (toDeleteRows.length > 0) {
      await supabase.from('battle_plan_noshows').delete().in('id', toDeleteRows.map(r => r.id));
    }

    // Refresh local state.
    const { data: refreshed } = await supabase.from('battle_plan_noshows').select('*').eq('alliance_id', myAllianceId);
    setAllNoshows(refreshed ?? []);
    setNoshowModalOpen(false);
  }

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
    else if (nav.type === 'loadplan') { applyPlan(nav.plan, allBuildings[nav.plan.id] ?? [], eventType); if (isMobile) setSidebarOpen(false); }
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

  async function handleDeleteWeekById(targetPlanId) {
    if (!targetPlanId) { alert('This week has not been saved yet — nothing to delete.'); return; }
    if (!confirm('Delete this week\'s plan? This cannot be undone.')) return;
    await supabase.from('battle_plan_buildings').delete().eq('plan_id', targetPlanId);
    await supabase.from('battle_plans').delete().eq('id', targetPlanId);
    const remaining = allPlans.filter(p => p.id !== targetPlanId);
    setAllPlans(remaining);
    setAllBuildings(prev => { const next = { ...prev }; delete next[targetPlanId]; return next; });
    if (targetPlanId === planId) {
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
  }
  function handleDeleteWeek() { handleDeleteWeekById(planId); }

  function handleExportTable() {
    const allianceName = alliance?.name || 'Alliance';
    const evtMeta = EVENT_TYPES.find(e => e.id === eventType);
    const weekRange = currentWeekKey ? formatWeekRange(currentWeekKey) : 'Unknown Week';
    const header = `${evtMeta?.icon ?? ''} ${evtMeta?.label ?? ''} — TASKFORCE ${taskforce} — ${allianceName} — ${weekRange}`;
    const rows = [];
    SECTIONS.forEach(section => {
      buildings.filter(section.match).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach(b => {
        const sLabel = section.title.split('—')[0].trim();
        const assigns = b.assignments ?? [];
        const players = assigns.length === 0 ? '—' : assigns.map(a => {
          const m = memberById[a.member_id]; if (!m) return null;
          const icon = a.role === 'coordinator' ? '👑 ' : a.role === 'lethal' ? '🔥 ' : '';
          return `${icon}${memberName(m)}`;
        }).filter(Boolean).join(', ');
        const linkTarget = b.links_to_id ? buildings.find(x => x.id === b.links_to_id) : null;
        rows.push([sLabel, b.name, players, linkTarget ? linkTarget.name : '—']);
      });
    });
    const cols = ['SECTION', 'BUILDING', 'PLAYERS', 'MOVES TO'];
    const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => (r[i] || '').length)));
    const fmt = row => row.map((cell, i) => ` ${(cell || '').padEnd(widths[i])} `).join('│');
    const divider = widths.map(w => '─'.repeat(w + 2)).join('┼');
    const lines = [header, '```', fmt(cols), divider, ...rows.map(fmt), '```'];
    const text = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => { setToast('TABLE COPIED!'); setTimeout(() => setToast(''), 2000); });
    } else {
      const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
      a.download = `battle-table-${taskforce}-${currentWeekKey || 'week'}.txt`; a.click();
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

  const siblingTaskforceAssigned = useMemo(
    () => assignedInSiblingTaskforce(eventType, currentWeekKey, taskforce, allPlans, allBuildings),
    [eventType, currentWeekKey, taskforce, allPlans, allBuildings]
  );
  const crossTaskforceAssigned = siblingTaskforceAssigned;
  const thisTaskforceAssigned = useMemo(() => {
    const s = new Set();
    buildings.forEach(b => (b.assignments ?? []).forEach(a => s.add(a.member_id)));
    return s;
  }, [buildings]);

  function assignMember(memberId, buildingId) {
    if (!canManage) return;
    setBuildings(prev => {
      const source = prev.find(b => b.id === buildingId);
      const groupmateIds = new Set(groupmateBuildings(source ?? { id: buildingId, combine_group: null }, prev).map(b => b.id));
      return prev.map(b => {
        if (b.id !== buildingId && !groupmateIds.has(b.id)) return b;
        if ((b.assignments ?? []).some(a => a.member_id === memberId)) return b;
        return { ...b, assignments: [...(b.assignments ?? []), { member_id: memberId, role: null }] };
      });
    });
    markDirty();
    setPicker(null);
    setPickerSearch('');
  }
  function removeMember(memberId, buildingId) {
    if (!canManage) return;
    setBuildings(prev => {
      const source = prev.find(b => b.id === buildingId);
      const groupmateIds = new Set(groupmateBuildings(source ?? { id: buildingId, combine_group: null }, prev).map(b => b.id));
      return prev.map(b => {
        if (b.id !== buildingId && !groupmateIds.has(b.id)) return b;
        return { ...b, assignments: (b.assignments ?? []).filter(a => a.member_id !== memberId) };
      });
    });
    markDirty();
  }
  function cycleRole(memberId, buildingId) {
    if (!canManage) return;
    setBuildings(prev => {
      const source = prev.find(b => b.id === buildingId);
      const groupmateIds = new Set(groupmateBuildings(source ?? { id: buildingId, combine_group: null }, prev).map(b => b.id));
      return prev.map(b => {
        if (b.id !== buildingId && !groupmateIds.has(b.id)) return b;
        return {
          ...b,
          assignments: (b.assignments ?? []).map(a => {
            if (a.member_id !== memberId) return a;
            const idx = ROLE_CYCLE.indexOf(a.role);
            const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length];
            return { ...a, role: next };
          }),
        };
      });
    });
    markDirty();
  }
  // Set (or clear) a building's combine_group. Pass a fresh group id to start a new merge,
  // or null to un-combine. Does not touch assignments.
  function setCombineGroup(buildingId, groupId) {
    if (!canManage) return;
    setBuildings(prev => prev.map(b => b.id === buildingId ? { ...b, combine_group: groupId } : b));
    markDirty();
  }
  function clearAllAssignments() {
    if (!canManage) return;
    if (!confirm('Clear ALL player assignments for every building this week? Buildings, links, and combine groups are kept. You still need to hit SAVE to persist this.')) return;
    setBuildings(prev => prev.map(b => ({ ...b, assignments: [] })));
    markDirty();
  }

  // ── Export ────────────────────────────────────────────────────────
  function handleExport() {
    const allianceName = alliance?.name || 'Alliance';
    const evtMeta = EVENT_TYPES.find(e => e.id === eventType);
    const weekRange = currentWeekKey ? formatWeekRange(currentWeekKey) : 'Unknown Week';
    const lines = [
      `${evtMeta?.icon ?? ''} ${evtMeta?.label ?? eventType.toUpperCase()} — TASKFORCE ${taskforce} — ${allianceName}`,
      planTitle,
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
      if (b.phase === 'phase2') {
        const incoming = getIncomingFireMembers(b.id, buildings);
        incoming.forEach(({ member_id, sourceBuilding }) => {
          const m = memberById[member_id];
          if (!m) return;
          lines.push(`  🔥 ${memberName(m)} (incoming from ${sourceBuilding.name})`);
        });
      }
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

  // No-show counts scoped to the current eventType + taskforce (recomputed on every render,
  // same pattern as weekList derived from allPlans).
  const noShowCounts = {};
  allNoshows
    .filter(n => n.event_type === eventType && n.taskforce === taskforce)
    .forEach(n => { noShowCounts[n.member_id] = (noShowCounts[n.member_id] ?? 0) + 1; });

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
          members={members.filter(m => {
            const pickerBuilding = buildings.find(b => b.id === picker.buildingId);
            const alreadyHere = (pickerBuilding?.assignments ?? []).some(a => a.member_id === m.id);
            if (alreadyHere) return false;
            if (crossTaskforceAssigned.has(m.id)) return false;
            const group = pickerBuilding?.combine_group;
            const groupBuildingIds = group
              ? buildings.filter(b => b.combine_group === group).map(b => b.id)
              : [picker.buildingId];
            const assignedElsewhere = buildings.some(b =>
              !groupBuildingIds.includes(b.id) &&
              (b.assignments ?? []).some(a => a.member_id === m.id)
            );
            return !assignedElsewhere;
          })}
          search={pickerSearch}
          setSearch={setPickerSearch}
          isMobile={isMobile}
          noShowCounts={noShowCounts}
          onPick={(memberId) => assignMember(memberId, picker.buildingId)}
          onClose={() => { setPicker(null); setPickerSearch(''); }}
        />
      )}

      {/* ── Guide modal ──────────────────────────────────────────── */}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}

      {/* ── No-show modal ────────────────────────────────────────── */}
      {noshowModalOpen && (
        <NoshowModal
          members={members}
          weekLabel={currentWeekKey}
          existingNoshows={allNoshows.filter(n => n.alliance_id === myAllianceId && n.event_type === eventType && n.taskforce === taskforce && n.week_label === (currentWeekKey || toDateString(getMondayDate())))}
          isMobile={isMobile}
          onSave={handleSaveNoshows}
          onClose={() => setNoshowModalOpen(false)}
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
          {eventType === 'desert' && <button onClick={() => setSidebarOpen(v => !v)} style={S.iconBtn}>☰</button>}
          <Swords size={15} style={{ color: '#f0a500', flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '2px', color: '#f0a500' }}>BATTLE PLANNER</div>
          {alliance && <div style={{ fontSize: 13, color: '#c0d8f0', marginLeft: 4 }}>— {alliance.name}</div>}
          {isDirty && <div style={{ fontSize: 10, color: '#f0a500', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', padding: '2px 7px', letterSpacing: '1px', fontWeight: 700 }}>UNSAVED</div>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setGuideOpen(true)} style={{ ...S.smallBtn, color: '#8aadcc' }}>❓ {isMobile ? '' : 'GUIDE'}</button>
          {eventType === 'desert' && (
            <button onClick={handleExport} style={{ ...S.smallBtn, color: '#8aadcc' }}><Download size={12} /> {isMobile ? '' : 'COPY FOR DISCORD'}</button>
          )}
          {eventType === 'desert' && (
            <button onClick={handleExportTable} style={{ ...S.smallBtn, color: '#8aadcc' }}><Download size={12} /> {isMobile ? '' : 'EXPORT TABLE'}</button>
          )}
          {eventType === 'desert' && canManage && (
            <button onClick={() => setNoshowModalOpen(true)} style={{ ...S.smallBtn, color: '#ff4060', border: '1px solid rgba(255,64,96,0.3)' }}>
              ❗ {isMobile ? '' : 'MARK NO-SHOWS'}
            </button>
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
                <button onClick={clearAllAssignments} style={{ ...S.smallBtn, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.4)', color: '#f0a500' }}>
                  CLEAR ASSIGNMENTS
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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {eventType === 'desert' && sidebarOpen && isMobile && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 55 }} />
        )}
        {eventType === 'desert' && (
          <div style={{
            width: 200, flexShrink: 0, background: 'rgba(5,10,18,0.95)',
            borderRight: '1px solid #1e3550', display: 'flex', flexDirection: 'column',
            ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 60, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.2s' } : { display: sidebarOpen ? 'flex' : 'none', flexDirection: 'column' })
          }}>
            <div style={{ padding: '12px', borderBottom: '1px solid #1e3550', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#7a9bb8' }}>WEEKS</span>
              {isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', fontSize: 18, minWidth: 32, minHeight: 32 }}>×</button>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {weekList.length === 0 && <div style={{ padding: '12px', fontSize: 11, color: '#5a7898' }}>No saved weeks yet.</div>}
              {weekList.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', background: p.id === planId ? 'rgba(0,200,255,0.1)' : 'transparent', borderBottom: '1px solid rgba(30,53,80,0.4)' }}>
                  <button
                    onClick={() => { if (isDirty) { setPendingNav({ type: 'loadplan', plan: p }); } else { applyPlan(p, allBuildings[p.id] ?? [], eventType); if (isMobile) setSidebarOpen(false); } }}
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: p.id === planId ? '#00c8ff' : '#a8c4dc', padding: '10px 12px', fontSize: 11, fontFamily: "'Share Tech Mono',monospace", cursor: 'pointer', minHeight: 44 }}
                  >
                    {formatWeekRange(p.week_label)}
                  </button>
                  <button onClick={() => handleDeleteWeekById(p.id)} style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', padding: '0 10px', minHeight: 44, fontSize: 13 }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ flex: 1, padding: isMobile ? '12px 10px 40px' : '20px 24px 40px', maxWidth: 1400, width: '100%', margin: '0 auto', boxSizing: 'border-box', overflowY: 'auto' }}>

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
                planTitle={planTitle}
                onExportText={handleExport}
                onExportTable={handleExportTable}
                onMarkerClick={(buildingId) => setPicker({ buildingId })}
                onRemovePlayer={canManage ? removeMember : null}
              />
            )}

            {viewMode === 'list' && SECTIONS.map(section => {
              const list = buildings.filter(b => {
                if (!section.match(b)) return false;
                if (!b.combine_group) return true;
                const groupMembers = buildings.filter(x => x.combine_group === b.combine_group);
                const primary = groupMembers.reduce((a, c) => (a.sort_order ?? 0) <= (c.sort_order ?? 0) ? a : c);
                return primary.id === b.id && section.match(primary);
              }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

              const groupKey = b => b.combine_group || b.id;
              const groupsInOrder = [];
              const groupsByKey = {};
              list.forEach(b => {
                const key = groupKey(b);
                if (!groupsByKey[key]) {
                  groupsByKey[key] = b.combine_group
                    ? buildings.filter(x => x.combine_group === b.combine_group)
                    : [b];
                  groupsInOrder.push(key);
                }
              });
              const renderUnits = groupsInOrder.map(key => groupsByKey[key]);

              const ungroupedInSection = list.filter(b => !b.combine_group);

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
                      {renderUnits.map(unit => unit.length > 1 ? (
                        <CombinedBuildingAccordion
                          key={groupKey(unit[0])}
                          members={unit}
                          isOpen={!!openAccordion[groupKey(unit[0])]}
                          onToggle={() => setOpenAccordion(prev => ({ ...prev, [groupKey(unit[0])]: !prev[groupKey(unit[0])] }))}
                          memberById={memberById}
                          canManage={canManage}
                          phase2Options={phase2Buildings}
                          allBuildings={buildings}
                          ungroupedInSection={ungroupedInSection}
                          onRenameMember={(bid, n) => renameBuilding(bid, n)}
                          onSetLinksTo={tid => setLinksTo(unit[0].id, tid)}
                          onUncombine={bid => setCombineGroup(bid, null)}
                          onCombineWith={otherId => {
                            const gid = unit[0].combine_group || `combine_${localId()}`;
                            if (!unit[0].combine_group) unit.forEach(m => setCombineGroup(m.id, gid));
                            setCombineGroup(otherId, gid);
                          }}
                          onAddPlayer={() => setPicker({ buildingId: unit[0].id })}
                          onRemovePlayer={mid => removeMember(mid, unit[0].id)}
                          onCycleRole={mid => cycleRole(mid, unit[0].id)}
                        />
                      ) : (
                        <BuildingAccordion
                          key={unit[0].id}
                          building={unit[0]}
                          isOpen={!!openAccordion[unit[0].id]}
                          onToggle={() => setOpenAccordion(prev => ({ ...prev, [unit[0].id]: !prev[unit[0].id] }))}
                          memberById={memberById}
                          canManage={canManage}
                          phase2Options={phase2Buildings}
                          allBuildings={buildings}
                          ungroupedInSection={ungroupedInSection}
                          linkTarget={unit[0].links_to_id ? buildings.find(x => x.id === unit[0].links_to_id) : null}
                          onRename={n => renameBuilding(unit[0].id, n)}
                          onDelete={() => deleteBuilding(unit[0].id)}
                          onSetLinksTo={tid => setLinksTo(unit[0].id, tid)}
                          onCombineWith={otherId => {
                            const gid = `combine_${localId()}`;
                            setCombineGroup(unit[0].id, gid);
                            setCombineGroup(otherId, gid);
                          }}
                          onAddPlayer={() => setPicker({ buildingId: unit[0].id })}
                          onRemovePlayer={mid => removeMember(mid, unit[0].id)}
                          onCycleRole={mid => cycleRole(mid, unit[0].id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(renderUnits.length, 4) || 1}, 1fr)`, gap: 14 }}>
                      {renderUnits.map(unit => unit.length > 1 ? (
                        <CombinedBuildingCard
                          key={groupKey(unit[0])}
                          members={unit}
                          memberById={memberById}
                          canManage={canManage}
                          phase2Options={phase2Buildings}
                          allBuildings={buildings}
                          ungroupedInSection={ungroupedInSection}
                          onRenameMember={(bid, n) => renameBuilding(bid, n)}
                          onSetLinksTo={tid => setLinksTo(unit[0].id, tid)}
                          onUncombine={bid => setCombineGroup(bid, null)}
                          onCombineWith={otherId => {
                            const gid = unit[0].combine_group || `combine_${localId()}`;
                            if (!unit[0].combine_group) unit.forEach(m => setCombineGroup(m.id, gid));
                            setCombineGroup(otherId, gid);
                          }}
                          onAddPlayer={() => setPicker({ buildingId: unit[0].id })}
                          onRemovePlayer={mid => removeMember(mid, unit[0].id)}
                          onCycleRole={mid => cycleRole(mid, unit[0].id)}
                        />
                      ) : (
                        <BuildingCard
                          key={unit[0].id}
                          building={unit[0]}
                          memberById={memberById}
                          canManage={canManage}
                          phase2Options={phase2Buildings}
                          linkTarget={unit[0].links_to_id ? buildings.find(x => x.id === unit[0].links_to_id) : null}
                          ungroupedInSection={ungroupedInSection}
                          allBuildings={buildings}
                          onRename={n => renameBuilding(unit[0].id, n)}
                          onDelete={() => deleteBuilding(unit[0].id)}
                          onSetLinksTo={tid => setLinksTo(unit[0].id, tid)}
                          onCombineWith={otherId => {
                            const gid = `combine_${localId()}`;
                            setCombineGroup(unit[0].id, gid);
                            setCombineGroup(otherId, gid);
                          }}
                          onAddPlayer={() => setPicker({ buildingId: unit[0].id })}
                          onRemovePlayer={mid => removeMember(mid, unit[0].id)}
                          onCycleRole={mid => cycleRole(mid, unit[0].id)}
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
                  placeholder={'1. Be on time! It is critical to start complete.\n2. Stick to your assigned position so we have building coverage.\n3. Do not leave before you secure a sub to swap with you.\n4. After 15 minutes, if the score gap is big enough, let subs in so everyone can score.\n5. No-shows may be deprioritized for next week\'s team makeup.'}
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

// ── "+ combine with" dropdown — lets an admin merge this building with another
// ungrouped building in the same section into one combined card. ─────────────
function CombineWithControl({ building, ungroupedInSection, buildings, onCombineWith }) {
  const options = (buildings ?? ungroupedInSection ?? []).filter(b => b.id !== building.id && !b.combine_group);
  if (options.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <select
        value=""
        onChange={e => { if (e.target.value) onCombineWith(e.target.value); }}
        style={{ width: '100%', background: '#0a1220', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, padding: '6px 6px', outline: 'none', minHeight: 32 }}
      >
        <option value="">+ COMBINE WITH…</option>
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </select>
    </div>
  );
}

// ── Removable name chip — used inside a combined card to show/rename/remove one member building ──
function MemberChip({ building, canManage, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', padding: '3px 6px' }}>
      {editing && canManage ? (
        <input
          autoFocus
          value={building.name}
          onChange={e => onRename(e.target.value)}
          onBlur={() => setEditing(false)}
          style={{ background: '#0a1220', border: '1px solid #1e3550', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, padding: '2px 4px', outline: 'none', width: 90 }}
        />
      ) : (
        <span
          onClick={() => canManage && setEditing(true)}
          style={{ fontSize: 10, fontWeight: 700, color: '#00c8ff', cursor: canManage ? 'text' : 'default' }}
        >
          {building.name}
        </span>
      )}
      {canManage && (
        <button onClick={onRemove} title="Remove from combined card" style={{ background: 'none', border: 'none', color: '#ff4060', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0, minWidth: 16, minHeight: 16 }}>✕</button>
      )}
    </div>
  );
}

// ── Building card (desktop/tablet) ──────────────────────────────────
function BuildingCard({ building, memberById, canManage, phase2Options, linkTarget, ungroupedInSection, allBuildings, onRename, onDelete, onSetLinksTo, onCombineWith, onAddPlayer, onRemovePlayer, onCycleRole }) {
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
        {canManage && <CombineWithControl building={building} ungroupedInSection={ungroupedInSection} buildings={allBuildings} onCombineWith={onCombineWith} />}
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
function BuildingAccordion({ building, isOpen, onToggle, memberById, canManage, phase2Options, linkTarget, ungroupedInSection, allBuildings, onRename, onDelete, onSetLinksTo, onCombineWith, onAddPlayer, onRemovePlayer, onCycleRole }) {
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
          {canManage && <CombineWithControl building={building} ungroupedInSection={ungroupedInSection} buildings={allBuildings} onCombineWith={onCombineWith} />}
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

// ── Combined card shared body: header (name, chips, combine-with, links control for
// the primary building) + roster (union of all members' assignments) + add player. ──
function combinedDisplayName(members) {
  const sorted = [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return sorted.map(m => m.name).join(' & ');
}
function combinedIcon(members) {
  const sorted = [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return categoryMeta(sorted[0].category).icon;
}
function unionAssignments(members) {
  const seen = new Set();
  const result = [];
  members.forEach(b => (b.assignments ?? []).forEach(a => {
    if (seen.has(a.member_id)) return;
    seen.add(a.member_id);
    result.push(a);
  }));
  return result;
}

// ── Combined building card (desktop/tablet) ─────────────────────────
function CombinedBuildingCard({ members, memberById, canManage, phase2Options, allBuildings, ungroupedInSection, onRenameMember, onSetLinksTo, onUncombine, onCombineWith, onAddPlayer, onRemovePlayer, onCycleRole }) {
  const sorted = [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const primary = sorted[0];
  const linkTarget = primary.links_to_id ? allBuildings.find(x => x.id === primary.links_to_id) : null;
  const assignments = unionAssignments(members);
  return (
    <div style={{ border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3550' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{combinedIcon(members)}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#d0e4f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {combinedDisplayName(members)}
          </span>
        </div>
        {canManage && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {sorted.map(b => (
              <MemberChip key={b.id} building={b} canManage={canManage} onRename={n => onRenameMember(b.id, n)} onRemove={() => onUncombine(b.id)} />
            ))}
          </div>
        )}
        <LinksToControl building={primary} phase2Options={phase2Options} linkTarget={linkTarget} canManage={canManage} onSetLinksTo={onSetLinksTo} />
        {canManage && <CombineWithControl building={primary} ungroupedInSection={ungroupedInSection} buildings={allBuildings} onCombineWith={onCombineWith} />}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {assignments.map(a => {
          const m = memberById[a.member_id];
          if (!m) return null;
          return <PlayerRow key={a.member_id} member={m} role={a.role} canManage={canManage} onRemove={() => onRemovePlayer(a.member_id)} onCycleRole={() => onCycleRole(a.member_id)} />;
        })}
        {assignments.length === 0 && (
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

// ── Combined building accordion (mobile) ─────────────────────────────
function CombinedBuildingAccordion({ members, isOpen, onToggle, memberById, canManage, phase2Options, allBuildings, ungroupedInSection, onRenameMember, onSetLinksTo, onUncombine, onCombineWith, onAddPlayer, onRemovePlayer, onCycleRole }) {
  const sorted = [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const primary = sorted[0];
  const linkTarget = primary.links_to_id ? allBuildings.find(x => x.id === primary.links_to_id) : null;
  const assignments = unionAssignments(members);
  const count = assignments.length;
  return (
    <div style={{ border: '1px solid #1e3550', background: 'rgba(13,21,32,0.6)' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', minHeight: 44, textAlign: 'left' }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{combinedIcon(members)}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#d0e4f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{combinedDisplayName(members)}</span>
        <span style={{ fontSize: 10, color: '#5a7898' }}>{count} {isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canManage && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {sorted.map(b => (
                <MemberChip key={b.id} building={b} canManage={canManage} onRename={n => onRenameMember(b.id, n)} onRemove={() => onUncombine(b.id)} />
              ))}
            </div>
          )}
          <LinksToControl building={primary} phase2Options={phase2Options} linkTarget={linkTarget} canManage={canManage} onSetLinksTo={onSetLinksTo} />
          {canManage && <CombineWithControl building={primary} ungroupedInSection={ungroupedInSection} buildings={allBuildings} onCombineWith={onCombineWith} />}
          {assignments.map(a => {
            const m = memberById[a.member_id];
            if (!m) return null;
            return <PlayerRow key={a.member_id} member={m} role={a.role} canManage={canManage} onRemove={() => onRemovePlayer(a.member_id)} onCycleRole={() => onCycleRole(a.member_id)} />;
          })}
          {assignments.length === 0 && (
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

// Build the label lines for a marker: assigned player names only (no building name —
// the map image already prints it), each prefixed with a role icon when applicable.
// 👑 for coordinator, 🔥 for lethal (moves to next building) — purely role-driven.
function markerNameLines(building, memberById, allBuildings) {
  const names = (building.assignments ?? []).map(a => {
    const m = memberById[a.member_id];
    if (!m) return null;
    const icon = a.role && ROLE_META[a.role] ? ROLE_META[a.role].icon + ' ' : '';
    return `${icon}${memberName(m)}`;
  }).filter(Boolean);

  if (building.phase === 'phase2' && allBuildings) {
    getIncomingFireMembers(building.id, allBuildings).forEach(({ member_id }) => {
      const m = memberById[member_id];
      if (!m) return;
      names.push(`🔥 ${memberName(m)}`);
    });
  }

  return names;
}

// ── Map view ──────────────────────────────────────────────────────
function MapView({ buildings, memberById, isMobile, taskforce, weekLabel, planTitle, onExportText, onExportTable, onMarkerClick, onRemovePlayer }) {
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

  // Distinct color per building/combined-group (buildings sharing a combine_group share a color).
  const markerColorByBuildingId = computeMarkerColors(matched);

  function dotColorFor(building) {
    return markerColorByBuildingId[building.id] || '#7a9bb8';
  }

  // True when a building is part of an *active* combine group (2+ members sharing the same
  // combine_group) — used to give those markers a stronger glow on the map.
  function isActivelyCombined(building) {
    if (!building.combine_group) return false;
    return buildings.some(b => b.id !== building.id && b.combine_group === building.combine_group);
  }

  // Substitutes building(s) for the overlay panel.
  const substitutesBuildings = buildings.filter(b => b.category === 'substitutes');

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

    if (planTitle) {
      const titleFontSize = Math.max(20, Math.round(w * 0.022));
      ctx.font = `bold ${titleFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const titlePadding = 10;
      const titleY = 8;
      const titleText = planTitle;
      const titleW = ctx.measureText(titleText).width + titlePadding * 2;
      ctx.fillStyle = 'rgba(8,13,20,0.85)';
      ctx.fillRect(w / 2 - titleW / 2, titleY, titleW, titleFontSize + titlePadding);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(titleText, w / 2, titleY + titlePadding / 2);
    }

    // Markers + labels.
    matched.forEach(({ marker, building }) => {
      const cx = (marker.x / 100) * w;
      const cy = (marker.y / 100) * h;
      const dotR = Math.max(5, w * 0.006);
      const color = dotColorFor(building);
      const combined = isActivelyCombined(building);
      ctx.shadowColor = color;
      ctx.shadowBlur = combined ? 18 : 0;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0a1220';
      ctx.stroke();

      const names = markerNameLines(building, memberById, buildings);

      const labelLines = names.length > 0 ? [names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '')] : ['(unassigned)'];

      const fontSize = Math.max(12, Math.round(w * 0.012));
      ctx.font = `bold ${fontSize}px Arial`;
      const padding = 6;
      const lineHeight = fontSize + 4;
      const textW = Math.max(...labelLines.map(l => ctx.measureText(l).width));
      const boxW = textW + padding * 2;
      const boxH = lineHeight * labelLines.length + padding;
      const boxX = cx - boxW / 2;
      const boxY = cy + dotR + 4;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      labelLines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#111827' : '#374151';
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
      {planTitle && (
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '1.5px', color: '#f0a500', marginBottom: 10, textAlign: 'center' }}>{planTitle}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        {onExportText && (
          <button onClick={onExportText} style={{ ...S.smallBtn, color: '#8aadcc' }}>
            <Download size={12} /> COPY FOR DISCORD
          </button>
        )}
        {onExportTable && <button onClick={onExportTable} style={{ ...S.smallBtn, color: '#8aadcc' }}><Download size={12} /> EXPORT TABLE</button>}
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

          {imgStatus === 'ok' && matched.map(({ marker, building }) => {
            const names = markerNameLines(building, memberById, buildings);
            const shownNames = names.slice(0, 3);
            const extra = names.length - shownNames.length;
            const onLeftHalf = marker.x < 50;
            const dotColor = dotColorFor(building);
            const combined = isActivelyCombined(building);

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
                  border: '2px solid #0a1220', flexShrink: 0,
                  boxShadow: combined ? `0 0 14px 4px ${dotColor}, 0 0 4px ${dotColor}` : `0 0 6px ${dotColor}`,
                }} />
                <div style={{
                  marginTop: 4, background: 'rgba(255,255,255,0.95)', border: '1px solid #cbd5e1',
                  padding: '4px 7px', maxWidth: 130, textAlign: onLeftHalf ? 'left' : 'right',
                }}>
                  {shownNames.length > 0 ? (
                    <div style={{ fontSize: 9, color: '#111827', lineHeight: 1.4 }}>
                      {shownNames.join(', ')}{extra > 0 ? ` +${extra} more` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: '#374151', fontStyle: 'italic' }}>unassigned</div>
                  )}
                </div>
              </button>
            );
          })}

          {imgStatus === 'ok' && substitutesBuildings.length > 0 && (
            <SubstitutesPanel
              substitutesBuildings={substitutesBuildings}
              memberById={memberById}
              onMarkerClick={onMarkerClick}
              onRemovePlayer={onRemovePlayer}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Substitutes overlay panel (bottom-left, anchored on the map container) ──
function SubstitutesPanel({ substitutesBuildings, memberById, onMarkerClick, onRemovePlayer }) {
  return (
    <div style={{
      position: 'absolute', left: 10, bottom: 10, zIndex: 5, maxWidth: 220,
      background: 'rgba(8,13,20,0.92)', border: '1px solid rgba(122,155,184,0.5)', padding: '8px 10px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#f0a500', marginBottom: 6 }}>
        🔄 SUBSTITUTES
      </div>
      {substitutesBuildings.map(b => (
        <div key={b.id} style={{ marginBottom: 6 }}>
          {(b.assignments ?? []).map(a => {
            const m = memberById[a.member_id];
            if (!m) return null;
            return (
              <button
                key={a.member_id}
                onClick={() => onRemovePlayer && onRemovePlayer(a.member_id, b.id)}
                title={onRemovePlayer ? 'Tap to remove' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none', cursor: onRemovePlayer ? 'pointer' : 'default',
                  padding: '2px 0', minHeight: 22,
                }}
              >
                <span style={{ fontSize: 10, color: '#d0e4f4', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memberName(m)}</span>
                {onRemovePlayer && <span style={{ color: '#ff4060', fontSize: 11 }}>×</span>}
              </button>
            );
          })}
          {(b.assignments ?? []).length === 0 && (
            <div style={{ fontSize: 10, color: '#5a7898', fontStyle: 'italic' }}>none</div>
          )}
          <button
            onClick={() => onMarkerClick(b.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, width: '100%', textAlign: 'left',
              background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff',
              fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.5px', cursor: 'pointer',
              padding: '4px 6px', minHeight: 28,
            }}
          >
            <Plus size={10} /> ADD
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Member picker (bottom sheet on mobile, popover on desktop) ──────
function MemberPicker({ members, search, setSearch, isMobile, onPick, onClose, noShowCounts = {} }) {
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memberName(m)}</span>
                {noShowCounts[m.id] > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#ff4060', flexShrink: 0 }}>❗{noShowCounts[m.id]}</span>
                )}
              </div>
              {m.power1 && (
                <div style={{ fontSize: 12, color: '#ffffff', fontFamily: "'Share Tech Mono',monospace" }}>{m.power1}M{m.troop1 ? ` · ${m.troop1}` : ''}</div>
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

// ── No-show modal (bottom sheet on mobile, popover on desktop) ──────
function NoshowModal({ members, weekLabel, existingNoshows, isMobile, onSave, onClose }) {
  const [checked, setChecked] = useState(() => new Set(existingNoshows.map(n => n.member_id)));
  const [saving, setSaving] = useState(false);

  function toggle(memberId) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  async function handleSaveClick() {
    setSaving(true);
    await onSave([...checked]);
    setSaving(false);
  }

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e3550' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', color: '#ff4060' }}>MARK NO-SHOWS{weekLabel ? ` — ${formatWeekRange(weekLabel)}` : ''}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', maxHeight: isMobile ? '55vh' : 380 }}>
        {members.length === 0 && (
          <div style={{ fontSize: 11, color: '#5a7898', fontStyle: 'italic', padding: '8px 0' }}>No members found.</div>
        )}
        {members.map(m => {
          const isChecked = checked.has(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px',
                marginBottom: 4, background: isChecked ? 'rgba(255,64,96,0.1)' : 'transparent',
                border: `1px solid ${isChecked ? 'rgba(255,64,96,0.4)' : '#1e3550'}`, cursor: 'pointer', minHeight: 44,
              }}
            >
              <span style={{
                width: 18, height: 18, border: `1px solid ${isChecked ? '#ff4060' : '#3a5878'}`,
                background: isChecked ? '#ff4060' : 'transparent', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff',
              }}>
                {isChecked ? '✓' : ''}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memberName(m)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3550', display: 'flex', gap: 8 }}>
        <button onClick={handleSaveClick} disabled={saving} style={{ flex: 1, padding: '9px', background: 'rgba(255,64,96,0.12)', border: '1px solid rgba(255,64,96,0.4)', color: '#ff4060', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
        <button onClick={onClose} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid #1e3550', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
          CANCEL
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background: '#0d1520', borderTop: '1px solid #1e3550', width: '100%', height: '75vh', display: 'flex', flexDirection: 'column', borderRadius: '12px 12px 0 0' }}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#0d1520', border: '1px solid #1e3550', width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
    </div>
  );
}

// ── Guide modal ──────────────────────────────────────────────────
function GuideModal({ onClose }) {
  const bullets = [
    'LIST VIEW shows every building grouped by Phase 1 (first 10 min) and Phase 2 (after minute 10).',
    'Tap "ADD PLAYER" on any building to assign someone — players can be on multiple buildings at once.',
    "Tap a player's role icon to cycle: none → 👑 Coordinator → 🔥 Moves to next building.",
    'Phase 1 buildings have a "→ moves to" dropdown — link it to whichever Phase 2 building your team pushes to after minute 10. 🔥-tagged players will then also show up at that Phase 2 building.',
    'Use "+ COMBINE WITH" on a building to merge it with another in the same phase into one card with a shared roster — handy when one team covers multiple buildings.',
    'MAP VIEW shows the same data laid over the real battlefield image, with colored lines connecting linked buildings.',
    'Use "MARK NO-SHOWS" each week to track attendance — repeat no-shows get a ❗ badge when picking players.',
    '"+ NEXT WEEK" copies your buildings/links/team setup forward but clears all player assignments, so you can re-assign fresh each week.',
    'Use "COPY FOR DISCORD" or "DOWNLOAD MAP" to share the plan with your alliance.',
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#0d1520', border: '1px solid #1e3550', width: 460, maxWidth: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e3550' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', color: '#00c8ff' }}>❓ HOW THE BATTLE PLANNER WORKS</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7a9bb8', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, color: '#c0d8f0', fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ color: '#f0a500', flexShrink: 0 }}>•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3550' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '9px', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.4)', color: '#00c8ff', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', minHeight: 44 }}>
            GOT IT
          </button>
        </div>
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
