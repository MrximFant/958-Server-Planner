import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import tilesData from '../data/territories.json';
import { ArrowLeft, ZoomIn, ZoomOut, Menu, X, Lock, Eye, EyeOff, Map, Crosshair } from 'lucide-react';

const CANVAS_SIZE = 3000;

// ── Access helpers ──────────────────────────────────────────────
// LIVE map  — shows actual claimed territory ownership
// PLAN map  — shows each alliance's internal attack/defence planning
//
// Who can see LIVE:  everyone if public_map=true; logged-in members otherwise
// Who can see PLAN:  only the alliance itself (members + owner + alliance_admin)
//                    server admin/helper can see ALL alliances' plans
//
// Who can edit LIVE: alliance owner / alliance_admin (own alliance only)
//                    server admin / helper (any alliance)
// Who can edit PLAN: alliance owner / alliance_admin (own alliance only)
//                    server admin / helper (any alliance)

export default function MapPage() {
  const { serverId } = useParams();
  const navigate     = useNavigate();
  const { session }  = useAuth();

  const role         = session?.serverId === serverId ? session.role    : null;
  const myAllianceId = role                            ? session.allianceId ?? null : null;
  const allianceRole = session?.allianceRole ?? null;

  const canEditAll = role === 'admin' || role === 'helper';
  const canEditOwn = role === 'owner' || (role === 'member' && allianceRole === 'alliance_admin');
  const canEdit    = canEditAll || canEditOwn;
  const isLoggedIn = !!role;

  // Map mode: 'live' | 'plan'
  // Plan mode only available when logged in with an alliance (or admin/helper)
  const canSeePlan  = isLoggedIn && (canEditAll || !!myAllianceId);
  const [mapMode,   setMapMode]   = useState('live');

  const [server,    setServer]    = useState(null);
  const [alliances, setAlliances] = useState([]);
  // live layer: tileId → { id, owner_id, last_capture_at }
  const [liveData,  setLiveData]  = useState({});
  // plan layer: tileId → { id (uuid), alliance_id, tile_id, notes }
  const [planData,  setPlanData]  = useState({});
  // partner data from handshakes: [{serverNumber, name, alliances}]
  const [partnerServers,  setPartnerServers]  = useState([]);
  // partnerLiveData: tileId → { owner_id, serverNumber, alliance }
  const [partnerLiveData, setPartnerLiveData] = useState({});
  // partnerPlanData: tileId → [{ alliance_id, serverNumber, alliance }]
  const [partnerPlanData, setPartnerPlanData] = useState({});
  const [loading,   setLoading]   = useState(true);

  const [sidebarOpen,      setSidebarOpen]      = useState(window.innerWidth > 900);
  const [zoom,             setZoom]             = useState(0.35);
  const [selectedAlliance, setSelectedAlliance] = useState(null);
  const [hoveredTile,      setHoveredTile]      = useState(null);
  const [hideNames,        setHideNames]        = useState(false);
  const [busyTile,         setBusyTile]         = useState(null);

  const mapRef   = useRef(null);
  const panRef   = useRef({ active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 });
  const pinchRef = useRef({ active: false, dist: 0 });

  // ── Data loading ──────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: srv }, { data: als }] = await Promise.all([
        supabase.from('servers').select('id, server_number, name, public_map').eq('id', serverId).single(),
        supabase.from('alliances').select('id, name, tag, color').eq('server_id', serverId).order('name'),
      ]);

      const allianceIds = (als ?? []).map(a => a.id);

      // Load live territory data
      let terrRows = [];
      if (allianceIds.length > 0) {
        const { data } = await supabase.from('territories').select('*').in('owner_id', allianceIds);
        terrRows = data ?? [];
      }

      // Load plan data — admins/helpers see all, others see own alliance only
      let planRows = [];
      if (isLoggedIn && allianceIds.length > 0) {
        const query = supabase.from('alliance_plans').select('*');
        if (canEditAll) {
          query.in('alliance_id', allianceIds);
        } else if (myAllianceId) {
          query.eq('alliance_id', myAllianceId);
        }
        const { data } = await query;
        planRows = data ?? [];
      }

      setServer(srv);
      setAlliances(als ?? []);

      const liveLookup = {};
      terrRows.forEach(t => { liveLookup[t.id] = t; });
      setLiveData(liveLookup);

      const planLookup = {};
      planRows.forEach(p => {
        if (!planLookup[p.tile_id]) planLookup[p.tile_id] = [];
        planLookup[p.tile_id].push(p);
      });
      setPlanData(planLookup);

      // ── Partner server data via handshakes ────────────────────
      // Only load if logged in (partner data is not public)
      if (isLoggedIn && srv) {
        const { data: handshakes } = await supabase
          .from('server_handshakes')
          .select('*')
          .or(`initiator_server_id.eq.${serverId},target_server_id.eq.${serverId}`)
          .eq('status', 'accepted');

        const acceptedHs = handshakes ?? [];
        const pServerMap = {}; // partnerId → { serverNumber, name, alliances, liveSharedIds, planSharedIds }

        for (const hs of acceptedHs) {
          if (!hs.share_map && !hs.share_roster) continue;
          const partnerId = hs.initiator_server_id === serverId ? hs.target_server_id : hs.initiator_server_id;
          if (!partnerId) continue;

          // Load partner server info + alliances
          const [{ data: pSrv }, { data: pAls }] = await Promise.all([
            supabase.from('servers').select('id, server_number, name').eq('id', partnerId).single(),
            supabase.from('alliances').select('id, name, tag, color').eq('server_id', partnerId).order('name'),
          ]);
          if (!pSrv) continue;

          const partnerAllianceIds = (pAls ?? []).map(a => a.id);

          // Load partner's alliance_handshake_settings for THIS handshake
          const { data: hsSettings } = await supabase
            .from('alliance_handshake_settings')
            .select('alliance_id, share_live_map, share_plan_map')
            .eq('handshake_id', hs.id)
            .in('alliance_id', partnerAllianceIds.length > 0 ? partnerAllianceIds : ['none']);

          const settingsMap = {};
          (hsSettings ?? []).forEach(s => { settingsMap[s.alliance_id] = s; });

          // Alliances that opted in to share live map (server cap must also allow share_map)
          const liveShareIds = hs.share_map
            ? partnerAllianceIds.filter(id => settingsMap[id]?.share_live_map !== false)
            : [];

          // Alliances that opted in to share plan map
          const planShareIds = hs.share_map
            ? partnerAllianceIds.filter(id => settingsMap[id]?.share_plan_map === true)
            : [];

          if (!pServerMap[partnerId]) {
            pServerMap[partnerId] = { ...pSrv, alliances: pAls ?? [], liveShareIds, planShareIds };
          } else {
            // merge if multiple handshakes with same server (edge case)
            pServerMap[partnerId].liveShareIds = [...new Set([...pServerMap[partnerId].liveShareIds, ...liveShareIds])];
            pServerMap[partnerId].planShareIds = [...new Set([...pServerMap[partnerId].planShareIds, ...planShareIds])];
          }
        }

        // Load partner territories
        const newPartnerLive = {};
        const newPartnerPlan = {};
        const partnerServersList = Object.values(pServerMap);

        for (const ps of partnerServersList) {
          const alByIdP = Object.fromEntries(ps.alliances.map(a => [a.id, a]));

          if (ps.liveShareIds.length > 0) {
            const { data: pTerr } = await supabase
              .from('territories').select('*').in('owner_id', ps.liveShareIds);
            (pTerr ?? []).forEach(t => {
              newPartnerLive[t.id] = { ...t, serverNumber: ps.server_number, alliance: alByIdP[t.owner_id] };
            });
          }

          if (ps.planShareIds.length > 0) {
            const { data: pPlans } = await supabase
              .from('alliance_plans').select('*').in('alliance_id', ps.planShareIds);
            (pPlans ?? []).forEach(p => {
              if (!newPartnerPlan[p.tile_id]) newPartnerPlan[p.tile_id] = [];
              newPartnerPlan[p.tile_id].push({ ...p, serverNumber: ps.server_number, alliance: alByIdP[p.alliance_id] });
            });
          }
        }

        setPartnerServers(partnerServersList);
        setPartnerLiveData(newPartnerLive);
        setPartnerPlanData(newPartnerPlan);
      }

      setLoading(false);
    }
    load();

    // Realtime — live layer
    const liveChannel = supabase.channel(`live-${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territories' }, p => {
        if (p.eventType === 'DELETE') {
          setLiveData(prev => { const n = { ...prev }; delete n[p.old.id]; return n; });
        } else {
          setLiveData(prev => ({ ...prev, [p.new.id]: p.new }));
        }
      }).subscribe();

    // Realtime — plan layer
    const planChannel = supabase.channel(`plan-${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alliance_plans' }, p => {
        if (p.eventType === 'DELETE') {
          setPlanData(prev => {
            const n = { ...prev };
            const tileId = p.old.tile_id;
            if (n[tileId]) {
              n[tileId] = n[tileId].filter(r => r.id !== p.old.id);
              if (n[tileId].length === 0) delete n[tileId];
            }
            return n;
          });
        } else {
          setPlanData(prev => {
            const tileId = p.new.tile_id;
            const existing = prev[tileId] ?? [];
            const filtered = existing.filter(r => r.id !== p.new.id);
            return { ...prev, [tileId]: [...filtered, p.new] };
          });
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(liveChannel);
      supabase.removeChannel(planChannel);
    };
  }, [serverId, isLoggedIn, canEditAll, myAllianceId]);

  // ── Tile interactions ─────────────────────────────────────────
  const handleTileClick = useCallback(async (tileId) => {
    if (!selectedAlliance) return;
    const targetId = selectedAlliance.id;
    if (!canEditAll && !(canEditOwn && targetId === myAllianceId)) return;

    setBusyTile(tileId);

    if (mapMode === 'live') {
      const current = liveData[tileId];
      if (current?.owner_id === targetId) {
        await supabase.from('territories').delete().eq('id', tileId);
        setLiveData(prev => { const n = { ...prev }; delete n[tileId]; return n; });
      } else {
        const row = { id: tileId, owner_id: targetId, last_capture_at: new Date().toISOString() };
        await supabase.from('territories').upsert(row);
        setLiveData(prev => ({ ...prev, [tileId]: row }));
      }
    } else {
      // Plan mode
      const existing = (planData[tileId] ?? []).find(p => p.alliance_id === targetId);
      if (existing) {
        await supabase.from('alliance_plans').delete().eq('id', existing.id);
        setPlanData(prev => {
          const n = { ...prev };
          n[tileId] = (n[tileId] ?? []).filter(p => p.id !== existing.id);
          if (n[tileId].length === 0) delete n[tileId];
          return n;
        });
      } else {
        const { data: inserted } = await supabase.from('alliance_plans')
          .insert({ alliance_id: targetId, tile_id: tileId })
          .select().single();
        if (inserted) {
          setPlanData(prev => ({ ...prev, [tileId]: [...(prev[tileId] ?? []), inserted] }));
        }
      }
    }

    setBusyTile(null);
  }, [selectedAlliance, canEditAll, canEditOwn, myAllianceId, mapMode, liveData, planData]);

  // ── Pan + pinch ───────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button !== 0) return;
    panRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollX: mapRef.current.scrollLeft, scrollY: mapRef.current.scrollTop };
  }
  function onMouseMove(e) {
    if (!panRef.current.active) return;
    mapRef.current.scrollLeft = panRef.current.scrollX - (e.clientX - panRef.current.startX);
    mapRef.current.scrollTop  = panRef.current.scrollY - (e.clientY - panRef.current.startY);
  }
  function onMouseUp() { panRef.current.active = false; }

  function dist2(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }
  function onTouchStart(e) {
    if (e.touches.length === 1) {
      panRef.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, scrollX: mapRef.current.scrollLeft, scrollY: mapRef.current.scrollTop };
    } else if (e.touches.length === 2) {
      panRef.current.active = false;
      pinchRef.current = { active: true, dist: dist2(e.touches) };
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && panRef.current.active) {
      mapRef.current.scrollLeft = panRef.current.scrollX - (e.touches[0].clientX - panRef.current.startX);
      mapRef.current.scrollTop  = panRef.current.scrollY - (e.touches[0].clientY - panRef.current.startY);
    } else if (e.touches.length === 2 && pinchRef.current.active) {
      const d = dist2(e.touches);
      setZoom(z => Math.min(2, Math.max(0.1, z + (d - pinchRef.current.dist) * 0.005)));
      pinchRef.current.dist = d;
    }
  }
  function onTouchEnd() { panRef.current.active = false; pinchRef.current.active = false; }

  // ── Early returns ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>
      LOADING WAR MAP…
    </div>
  );

  if (!isLoggedIn && !server?.public_map) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', padding: 24, textAlign: 'center' }}>
      <style>{FONT}</style>
      <Lock size={48} style={{ opacity: 0.25, marginBottom: 16 }} />
      <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '3px', marginBottom: 8 }}>MAP ACCESS RESTRICTED</div>
      <p style={{ color: '#3a5878', fontSize: 14, maxWidth: 340, lineHeight: 1.7, marginBottom: 24 }}>
        This server's war map is private. Log in with your alliance credentials to access it.
      </p>
      <button onClick={() => navigate(`/server/${serverId}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '10px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '2px', cursor: 'pointer' }}>
        <ArrowLeft size={14} /> BACK TO SERVER
      </button>
    </div>
  );

  // ── Derived display data ───────────────────────────────────────
  const allianceById = Object.fromEntries(alliances.map(a => [a.id, a]));

  // In plan mode, tile colour:
  //   - own plan tile → own alliance colour (solid)
  //   - admin: other alliance plan tiles → their colour (slightly transparent)
  //   - live data shown as faint ghost underneath in plan mode
  function getTileAppearance(tileId) {
    const partnerLive = partnerLiveData[tileId];
    const partnerPlans = partnerPlanData[tileId] ?? [];

    if (mapMode === 'live') {
      const terr = liveData[tileId];
      if (!terr) {
        // Show partner territory as semi-transparent if no own territory
        if (partnerLive) return { bg: (partnerLive.alliance?.color ?? '#888') + '60', liveOwner: null, partnerLive, plans: [] };
        return { bg: '#1a2535', plans: [] };
      }
      const owner = allianceById[terr.owner_id];
      return { bg: owner?.color ?? '#1a2535', liveOwner: owner, partnerLive: partnerLive ?? null, plans: [] };
    } else {
      const plans = planData[tileId] ?? [];
      const liveTerr = liveData[tileId];
      const liveOwner = liveTerr ? allianceById[liveTerr.owner_id] : null;

      if (plans.length === 0) {
        // Check partner plans
        const pp = partnerPlans[0];
        if (pp) return { bg: (pp.alliance?.color ?? '#888') + '50', ghost: true, liveOwner, plans: [], partnerPlans };
        return { bg: liveOwner ? liveOwner.color + '40' : '#1a2535', ghost: true, liveOwner, plans: [] };
      }

      const myPlan = plans.find(p => p.alliance_id === myAllianceId) ?? plans[0];
      const planAlliance = allianceById[myPlan.alliance_id];
      return { bg: planAlliance?.color ?? '#1a2535', planAlliance, liveOwner, plans, partnerPlans, ghost: false };
    }
  }

  const ownedCount = Object.keys(liveData).length;
  const plannedCount = canSeePlan
    ? (canEditAll
        ? Object.values(planData).filter(arr => arr.length > 0).length
        : Object.values(planData).filter(arr => arr.some(p => p.alliance_id === myAllianceId)).length)
    : 0;

  const isTargetMode = selectedAlliance && canEdit && (canEditAll || selectedAlliance.id === myAllianceId);

  return (
    <div style={{ height: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", overflow: 'hidden' }}>
      <style>{FONT}</style>

      {/* ── Topbar ───────────────────────────────────────────── */}
      <div style={{ height: 48, background: 'rgba(8,13,20,0.97)', borderBottom: '1px solid #1e3550', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', zIndex: 50, flexShrink: 0 }}>
        <button onClick={() => navigate(`/server/${serverId}`)} style={S.iconBtn}><ArrowLeft size={15} /></button>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
          <button
            onClick={() => { setMapMode('live'); setSelectedAlliance(null); }}
            style={{ ...S.modeBtn, ...(mapMode === 'live' ? S.modeBtnActive('#00c8ff') : {}) }}
            title="Live map — actual territory ownership"
          >
            <Map size={12} /> LIVE
          </button>
          {canSeePlan && (
            <button
              onClick={() => { setMapMode('plan'); setSelectedAlliance(null); }}
              style={{ ...S.modeBtn, ...(mapMode === 'plan' ? S.modeBtnActive('#f0a500') : {}) }}
              title="Planning map — your alliance's attack/defence plan"
            >
              <Crosshair size={12} /> PLAN
            </button>
          )}
        </div>

        <div style={{ flex: 1, fontWeight: 700, fontSize: 11, letterSpacing: '2px', color: mapMode === 'plan' ? '#f0a500' : '#00c8ff', marginLeft: 4 }}>
          {mapMode === 'live' ? 'LIVE MAP' : 'PLANNING MAP'}
          {server && <span style={{ color: '#3a5878', marginLeft: 6 }}>— S{server.server_number}</span>}
        </div>

        {/* Status badge */}
        {!isLoggedIn && <Chip color="#ff6080" bg="rgba(255,64,96,0.08)" border="rgba(255,64,96,0.25)"><Lock size={10} /> PUBLIC</Chip>}
        {isLoggedIn && !canEdit && <Chip color="#3a5878" bg="transparent" border="#1e3550">VIEW ONLY</Chip>}
        {canEditOwn && !canEditAll && <Chip color="#00e87a" bg="rgba(0,232,122,0.07)" border="rgba(0,232,122,0.25)">EDIT OWN</Chip>}
        {canEditAll && <Chip color="#f0a500" bg="rgba(240,165,0,0.07)" border="rgba(240,165,0,0.25)">EDIT ALL</Chip>}

        {canEdit && (
          <button onClick={() => setHideNames(h => !h)} style={{ ...S.iconBtn, color: hideNames ? '#3a5878' : '#00c8ff' }} title="Toggle names">
            {hideNames ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={S.iconBtn}><ZoomIn size={14} /></button>
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} style={S.iconBtn}><ZoomOut size={14} /></button>
        <button onClick={() => setSidebarOpen(o => !o)} style={{ ...S.iconBtn, color: sidebarOpen ? '#00c8ff' : '#3a5878' }}>
          {sidebarOpen ? <X size={14} /> : <Menu size={14} />}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <div style={{ width: sidebarOpen ? 240 : 0, minWidth: sidebarOpen ? 240 : 0, background: 'rgba(8,13,20,0.97)', borderRight: '1px solid #1e3550', overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', display: 'flex', flexDirection: 'column', zIndex: 40 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>

            {/* Mode description */}
            <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', border: `1px solid ${mapMode === 'plan' ? 'rgba(240,165,0,0.2)' : '#1e3550'}`, background: mapMode === 'plan' ? 'rgba(240,165,0,0.04)' : 'transparent' }}>
              {mapMode === 'live' && !isLoggedIn && '🔓 Public view. Log in to interact.'}
              {mapMode === 'live' && isLoggedIn && !canEdit && '👁 Live territory ownership — view only.'}
              {mapMode === 'live' && canEditOwn && !canEditAll && '✏ Select your alliance, click tiles to claim/release.'}
              {mapMode === 'live' && canEditAll && '✏ Select any alliance, click to assign any tile.'}
              {mapMode === 'plan' && !canEdit && '👁 Your alliance\'s plan — view only.'}
              {mapMode === 'plan' && canEditOwn && !canEditAll && '✏ Mark tiles your alliance plans to target or hold.'}
              {mapMode === 'plan' && canEditAll && '✏ View and edit all alliances\' plans.'}
            </div>

            {/* Alliance list */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 8 }}>
              ALLIANCES — {alliances.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
              {alliances.map(a => {
                const isSelected = selectedAlliance?.id === a.id;
                const isOwn      = a.id === myAllianceId;
                const selectable = canEditAll || (canEditOwn && isOwn);
                const liveTiles  = Object.values(liveData).filter(t => t.owner_id === a.id).length;
                const planTiles  = canSeePlan
                  ? Object.values(planData).filter(arr => arr.some(p => p.alliance_id === a.id)).length
                  : 0;

                // In plan mode, only show alliances the user can see plans for
                if (mapMode === 'plan' && !canEditAll && a.id !== myAllianceId) return null;

                return (
                  <button key={a.id}
                    onClick={() => selectable ? setSelectedAlliance(isSelected ? null : a) : undefined}
                    style={{ width: '100%', textAlign: 'left', background: isSelected ? `${a.color}18` : 'transparent', border: `1px solid ${isSelected ? a.color : '#1e3550'}`, padding: '7px 9px', cursor: selectable ? 'pointer' : 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: isSelected ? a.color : '#d0e4f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {hideNames && !canEditAll ? '???' : a.name}
                          {a.tag && <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: '#3a5878', marginLeft: 4 }}>{a.tag}</span>}
                        </div>
                        <div style={{ fontSize: 9, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>
                          {liveTiles} live{canSeePlan ? ` · ${planTiles} planned` : ''}
                        </div>
                      </div>
                      {isOwn && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px', color: '#00c8ff' }}>MINE</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Partner servers */}
            {partnerServers.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 8 }}>
                  PARTNER SERVERS — {partnerServers.length}
                </div>
                {partnerServers.map(ps => {
                  const psLiveTiles = Object.values(partnerLiveData).filter(t => t.serverNumber === ps.server_number).length;
                  const psPlanTiles = Object.values(partnerPlanData).filter(arr => arr.some(p => p.serverNumber === ps.server_number)).length;
                  const sharesLive = ps.liveShareIds.length > 0;
                  const sharesPlan = ps.planShareIds.length > 0;
                  return (
                    <div key={ps.id} style={{ border: '1px solid #1e3550', padding: '7px 9px', marginBottom: 3, background: 'rgba(0,200,255,0.03)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#7a9bb8', marginBottom: 2 }}>
                        S{ps.server_number} · {ps.name}
                      </div>
                      <div style={{ fontSize: 9, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>
                        {sharesLive ? `${psLiveTiles} live tiles` : 'no live map'}
                        {sharesPlan ? ` · ${psPlanTiles} plans` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {sharesLive && <span style={{ fontSize: 8, color: '#00c8ff', border: '1px solid rgba(0,200,255,0.2)', padding: '1px 5px' }}>LIVE</span>}
                        {sharesPlan && <span style={{ fontSize: 8, color: '#f0a500', border: '1px solid rgba(240,165,0,0.2)', padding: '1px 5px' }}>PLAN</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Stats */}
            <div style={{ padding: '8px 10px', border: '1px solid #1e3550', fontSize: 10, color: '#3a5878', marginBottom: 10 }}>
              {mapMode === 'live' ? (
                <>
                  <div style={{ marginBottom: 4 }}>{ownedCount} / {tilesData.length} tiles claimed</div>
                  <div style={{ height: 3, background: '#1e3550', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${(ownedCount / tilesData.length) * 100}%`, background: '#00c8ff', borderRadius: 2 }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 4 }}>{plannedCount} tiles planned</div>
                  <div style={{ fontSize: 9, color: '#2a4058', marginTop: 2 }}>
                    LIVE map shows as ghost overlay in planning mode.
                  </div>
                </>
              )}
            </div>

            {/* Server time notice */}
            <div style={{ padding: '8px 10px', border: '1px solid #1e3550', fontSize: 9, color: '#2a4058', lineHeight: 1.7 }}>
              ⏱ <strong style={{ color: '#3a5878' }}>SERVER TIME</strong><br />
              Capture windows and protection timers run on server time (UTC). Rules coming soon.
            </div>
          </div>
        </div>

        {/* ── Map ──────────────────────────────────────────────── */}
        <div
          ref={mapRef}
          style={{ flex: 1, overflow: 'auto', cursor: 'grab', position: 'relative', touchAction: 'none' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div style={{ width: CANVAS_SIZE * zoom, height: CANVAS_SIZE * zoom, position: 'relative' }}>
            <div style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, position: 'absolute', top: 0, left: 0, transform: `scale(${zoom})`, transformOrigin: 'top left', background: '#0a0f1e' }}>
              {tilesData.map(tile => {
                const { bg, liveOwner, planAlliance, ghost, plans, partnerLive, partnerPlans } = getTileAppearance(tile.id);
                const isBusy    = busyTile === tile.id;
                const hov       = hoveredTile === tile.id;
                const isOwnLive = liveOwner?.id === myAllianceId;
                const isOwnPlan = plans.some(p => p.alliance_id === myAllianceId);
                const isSel     = selectedAlliance && (
                  mapMode === 'live' ? liveOwner?.id === selectedAlliance.id
                                     : plans.some(p => p.alliance_id === selectedAlliance.id)
                );

                // Dashed border for planned tiles that aren't yet claimed in PLAN mode
                const borderStyle = mapMode === 'plan' && plans.length > 0 && !liveOwner
                  ? `2px dashed ${planAlliance?.color ?? '#f0a500'}`
                  : isSel
                    ? `2px solid ${(liveOwner ?? planAlliance)?.color ?? '#fff'}`
                    : '1px solid rgba(0,0,0,0.25)';

                const hasPartner = mapMode === 'live' ? !!partnerLive : (partnerPlans?.length > 0);

                return (
                  <div
                    key={tile.id}
                    onMouseEnter={() => setHoveredTile(tile.id)}
                    onMouseLeave={() => setHoveredTile(null)}
                    onClick={() => handleTileClick(tile.id)}
                    style={{
                      position: 'absolute',
                      left:   tile.coordinates.x,
                      top:    tile.coordinates.y,
                      width:  tile.coordinates.width,
                      height: tile.coordinates.height,
                      background: isBusy ? '#ffffff' : bg,
                      border: borderStyle,
                      outline: isOwnLive || (mapMode === 'plan' && isOwnPlan) ? '2px solid rgba(0,200,255,0.45)' : 'none',
                      filter: hov && isTargetMode ? 'brightness(1.5)' : undefined,
                      cursor: isTargetMode ? 'crosshair' : 'default',
                      opacity: ghost ? 0.55 : 1,
                      transition: 'background 0.08s',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                    }}
                  >
                    {zoom > 0.65 && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.6)', pointerEvents: 'none', textAlign: 'center', padding: 2, lineHeight: 1.2 }}>
                        {(() => {
                          if (hideNames && !canEditAll) return tile.name || tile.id;
                          if (mapMode === 'plan' && planAlliance) return planAlliance.name;
                          if (liveOwner && isLoggedIn) return liveOwner.name;
                          if (liveOwner) return '?';
                          if (mapMode === 'live' && partnerLive?.alliance) return `S${partnerLive.serverNumber}`;
                          return tile.name || tile.id;
                        })()}
                      </span>
                    )}
                    {/* Partner server corner badge */}
                    {hasPartner && zoom > 0.5 && (
                      <span style={{ position: 'absolute', top: 1, right: 1, fontSize: 5, fontWeight: 700, color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.45)', padding: '0 2px', pointerEvents: 'none', lineHeight: 1.5 }}>
                        S{mapMode === 'live' ? partnerLive?.serverNumber : partnerPlans?.[0]?.serverNumber}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tooltip ──────────────────────────────────────────────── */}
      {hoveredTile && (() => {
        const tile      = tilesData.find(t => t.id === hoveredTile);
        const liveTerr  = liveData[hoveredTile];
        const liveOwner = liveTerr ? allianceById[liveTerr.owner_id] : null;
        const plans     = planData[hoveredTile] ?? [];
        const pLive     = partnerLiveData[hoveredTile];
        const pPlans    = partnerPlanData[hoveredTile] ?? [];
        if (!tile) return null;
        return (
          <div style={{ position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(8,13,20,0.97)', border: '1px solid #1e3550', padding: '5px 14px', fontSize: 11, color: '#d0e4f4', fontFamily: "'Share Tech Mono',monospace", zIndex: 100, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none', maxWidth: '90vw' }}>
            <span style={{ color: '#3a5878' }}>{tile.id}</span>
            {tile.name && <span>{tile.name}</span>}
            {tile.level && <span style={{ color: '#3a5878' }}>Lv{tile.level}</span>}
            {tile.buff && <span style={{ color: '#f0a500' }}>+{tile.buff.percentage}% {tile.buff.item}</span>}
            <span style={{ color: '#1e3550' }}>|</span>
            {liveOwner
              ? <><div style={{ width: 7, height: 7, borderRadius: '50%', background: liveOwner.color }} /><span style={{ color: liveOwner.color }}>{isLoggedIn ? liveOwner.name : '???'}</span></>
              : <span style={{ color: '#3a5878' }}>unclaimed</span>
            }
            {pLive?.alliance && (
              <span style={{ color: '#7a9bb8' }}>· S{pLive.serverNumber}: <span style={{ color: pLive.alliance.color }}>{pLive.alliance.name}</span></span>
            )}
            {mapMode === 'plan' && plans.length > 0 && (
              <span style={{ color: '#f0a500' }}>· {plans.length} planned</span>
            )}
            {mapMode === 'plan' && pPlans.length > 0 && (
              <span style={{ color: '#7a9bb8' }}>· {pPlans.length} partner plans</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Chip({ color, bg, border, children }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, border: `1px solid ${border}`, color, padding: '3px 8px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', flexShrink: 0 }}>
      {children}
    </div>
  );
}

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const S = {
  iconBtn: { background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  modeBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #1e3550', color: '#3a5878', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  modeBtnActive: (color) => ({ border: `1px solid ${color}40`, color, background: `${color}10` }),
};
