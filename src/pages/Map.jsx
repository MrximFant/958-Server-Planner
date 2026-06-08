import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import tilesData from '../data/territories.json';
import { ArrowLeft, ZoomIn, ZoomOut, Menu, X, Lock, Eye, EyeOff } from 'lucide-react';

const CANVAS_SIZE = 3000;

export default function Map() {
  const { serverId } = useParams();
  const navigate     = useNavigate();
  const { session }  = useAuth();

  const role       = session?.serverId === serverId ? session.role : null;
  const myAllianceId = session?.allianceId ?? null;

  // Full edit: admin or helper. Alliance edit: owner or alliance_admin of own alliance.
  const canEditAll  = role === 'admin' || role === 'helper';
  const canEditOwn  = role === 'owner' || (role === 'member' && (session?.allianceRole === 'owner' || session?.allianceRole === 'alliance_admin'));

  const [alliances,      setAlliances]      = useState([]);
  const [ownership,      setOwnership]      = useState({}); // tileId → territory row
  const [loading,        setLoading]        = useState(true);
  const [sidebarOpen,    setSidebarOpen]    = useState(window.innerWidth > 900);
  const [zoom,           setZoom]           = useState(0.35);
  const [selectedAlliance, setSelectedAlliance] = useState(null);
  const [hoveredTile,    setHoveredTile]    = useState(null);
  const [hideNames,      setHideNames]      = useState(false);
  const [busyTile,       setBusyTile]       = useState(null);

  const mapRef = useRef(null);
  // Pan state
  const panRef  = useRef({ dragging: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 });

  useEffect(() => {
    async function load() {
      const { data: als } = await supabase
        .from('alliances')
        .select('id, name, tag, color')
        .eq('server_id', serverId)
        .order('name');

      const allianceIds = (als ?? []).map(a => a.id);

      let terrData = [];
      if (allianceIds.length > 0) {
        const { data } = await supabase
          .from('territories')
          .select('*')
          .in('owner_id', allianceIds);
        terrData = data ?? [];
      }

      setAlliances(als ?? []);
      const lookup = {};
      terrData.forEach(t => { lookup[t.id] = t; });
      setOwnership(lookup);
      setLoading(false);
    }
    load();

    // Realtime updates
    const channel = supabase.channel(`map-${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territories' }, payload => {
        if (payload.eventType === 'DELETE') {
          setOwnership(prev => { const n = { ...prev }; delete n[payload.old.id]; return n; });
        } else {
          setOwnership(prev => ({ ...prev, [payload.new.id]: payload.new }));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [serverId]);

  async function handleTileClick(tileId) {
    if (!selectedAlliance) return;

    // Permission check
    if (canEditAll) {
      // admin/helper: assign any tile to selected alliance
    } else if (canEditOwn && selectedAlliance.id === myAllianceId) {
      // alliance owner/admin: can only assign to own alliance
    } else {
      return;
    }

    setBusyTile(tileId);
    const current = ownership[tileId];

    if (current?.owner_id === selectedAlliance.id) {
      // Deselect — remove ownership
      await supabase.from('territories').delete().eq('id', tileId);
      setOwnership(prev => { const n = { ...prev }; delete n[tileId]; return n; });
    } else {
      await supabase.from('territories').upsert({
        id: tileId,
        owner_id: selectedAlliance.id,
        last_capture_at: new Date().toISOString(),
      });
      setOwnership(prev => ({ ...prev, [tileId]: { id: tileId, owner_id: selectedAlliance.id, last_capture_at: new Date().toISOString() } }));
    }
    setBusyTile(null);
  }

  // Pan handlers
  function onMouseDown(e) {
    if (e.button !== 0) return;
    panRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollX: mapRef.current.scrollLeft,
      scrollY: mapRef.current.scrollTop,
    };
  }
  function onMouseMove(e) {
    if (!panRef.current.dragging) return;
    mapRef.current.scrollLeft = panRef.current.scrollX - (e.clientX - panRef.current.startX);
    mapRef.current.scrollTop  = panRef.current.scrollY - (e.clientY - panRef.current.startY);
  }
  function onMouseUp() { panRef.current.dragging = false; }

  const canEdit = canEditAll || canEditOwn;
  const isLoggedIn = !!role;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace', fontSize: 14 }}>
      LOADING WAR MAP…
    </div>
  );

  const allianceMap = Object.fromEntries(alliances.map(a => [a.id, a]));

  return (
    <div style={{ height: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", overflow: 'hidden', position: 'relative' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`}</style>

      {/* Topbar */}
      <div style={{ height: 48, background: 'rgba(8,13,20,0.95)', borderBottom: '1px solid #1e3550', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', zIndex: 50, flexShrink: 0 }}>
        <button onClick={() => navigate(`/server/${serverId}`)} style={S.iconBtn} title="Back to server">
          <ArrowLeft size={15} />
        </button>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '2px', color: '#00c8ff', flex: 1 }}>WAR MAP</div>

        {!isLoggedIn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.25)', padding: '4px 12px', fontSize: 11, color: '#ff6080', fontWeight: 700, letterSpacing: '1px' }}>
            <Lock size={11} /> PUBLIC VIEW — LOG IN TO EDIT
          </div>
        )}

        {isLoggedIn && !canEdit && (
          <div style={{ fontSize: 11, color: '#3a5878', letterSpacing: '1px' }}>VIEW ONLY</div>
        )}

        {canEdit && (
          <button onClick={() => setHideNames(h => !h)} style={{ ...S.iconBtn, color: hideNames ? '#3a5878' : '#00c8ff' }} title={hideNames ? 'Show alliance names' : 'Hide alliance names'}>
            {hideNames ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}

        <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} style={S.iconBtn} title="Zoom in"><ZoomIn size={15} /></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.1))} style={S.iconBtn} title="Zoom out"><ZoomOut size={15} /></button>
        <button onClick={() => setSidebarOpen(o => !o)} style={{ ...S.iconBtn, color: sidebarOpen ? '#00c8ff' : '#3a5878' }} title="Toggle sidebar">
          {sidebarOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: sidebarOpen ? 240 : 0,
          minWidth: sidebarOpen ? 240 : 0,
          background: 'rgba(8,13,20,0.95)',
          borderRight: '1px solid #1e3550',
          overflow: 'hidden',
          transition: 'width 0.2s, min-width 0.2s',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 40,
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 10 }}>
              ALLIANCES — {alliances.length}
            </div>

            {!canEdit && isLoggedIn && (
              <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.6, marginBottom: 12, padding: '8px 10px', border: '1px solid #1e3550' }}>
                Log in as admin or alliance owner to assign territories.
              </div>
            )}

            {!isLoggedIn && (
              <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.6, marginBottom: 12, padding: '8px 10px', border: '1px solid #1e3550' }}>
                <Lock size={10} style={{ marginRight: 4 }} />
                Public view. Log in on the server dashboard to interact.
              </div>
            )}

            {canEdit && (
              <div style={{ fontSize: 11, color: '#7a9bb8', marginBottom: 12, lineHeight: 1.6 }}>
                {canEditAll
                  ? 'Select an alliance, then click tiles to assign.'
                  : 'Select your alliance, then click tiles to assign.'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {alliances
                .filter(a => canEditAll || !canEditOwn || a.id === myAllianceId)
                .map(a => {
                  const tileCount = Object.values(ownership).filter(t => t.owner_id === a.id).length;
                  const isSelected = selectedAlliance?.id === a.id;
                  const isOwn = a.id === myAllianceId;
                  const selectable = canEditAll || (canEditOwn && isOwn);
                  return (
                    <button
                      key={a.id}
                      onClick={() => selectable ? setSelectedAlliance(isSelected ? null : a) : null}
                      style={{
                        width: '100%', textAlign: 'left', background: isSelected ? `${a.color}15` : 'transparent',
                        border: `1px solid ${isSelected ? a.color : '#1e3550'}`,
                        padding: '8px 10px', cursor: selectable ? 'pointer' : 'default',
                        opacity: (!selectable && canEditOwn) ? 0.5 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? a.color : '#d0e4f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {!hideNames || canEditAll ? a.name : '???'}
                            {a.tag && <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5878', marginLeft: 4 }}>{a.tag}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>{tileCount} tiles</div>
                        </div>
                        {isOwn && <div style={{ fontSize: 9, color: '#00c8ff', fontWeight: 700, letterSpacing: '1px' }}>MINE</div>}
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* Unowned tile count */}
            {(() => {
              const owned = Object.keys(ownership).length;
              const total = tilesData.length;
              return (
                <div style={{ marginTop: 16, padding: '8px 10px', border: '1px solid #1e3550', fontSize: 11, color: '#3a5878' }}>
                  <div>{owned} / {total} tiles claimed</div>
                  <div style={{ marginTop: 4, height: 4, background: '#1e3550', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${(owned / total) * 100}%`, background: '#00c8ff', borderRadius: 2 }} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Map canvas */}
        <div
          ref={mapRef}
          style={{ flex: 1, overflow: 'auto', cursor: panRef.current.dragging ? 'grabbing' : 'grab', position: 'relative' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <div style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            position: 'relative',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            background: '#0a0f1e',
          }}>
            {tilesData.map(tile => {
              const terr = ownership[tile.id];
              const owner = terr ? allianceMap[terr.owner_id] : null;
              const isOwnTile = owner?.id === myAllianceId;
              const isSelectedAlliance = owner?.id === selectedAlliance?.id;
              const isBusy = busyTile === tile.id;
              const hovered = hoveredTile === tile.id;

              // Visibility: if public view, show colors but not names
              // If logged in member, show own alliance in full, others as color only (names visible in sidebar)
              const showColor = owner ? owner.color : '#1a2535';

              return (
                <div
                  key={tile.id}
                  onMouseEnter={() => setHoveredTile(tile.id)}
                  onMouseLeave={() => setHoveredTile(null)}
                  onClick={() => handleTileClick(tile.id)}
                  style={{
                    position: 'absolute',
                    left: tile.coordinates.x,
                    top: tile.coordinates.y,
                    width: tile.coordinates.width,
                    height: tile.coordinates.height,
                    background: isBusy ? '#fff' : showColor,
                    border: isSelectedAlliance ? `2px solid ${owner.color}` : '1px solid rgba(0,0,0,0.3)',
                    outline: isOwnTile ? `2px solid rgba(0,200,255,0.6)` : 'none',
                    filter: hovered && canEdit && selectedAlliance ? 'brightness(1.4)' : 'none',
                    cursor: canEdit && selectedAlliance ? 'crosshair' : 'default',
                    transition: 'background 0.1s',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  {/* Tile name — only shown at higher zoom or on hover */}
                  {(zoom > 0.7 || hovered) && (
                    <span style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.6)', pointerEvents: 'none',
                      textAlign: 'center', padding: 2,
                    }}>
                      {!hideNames && owner ? (isLoggedIn ? owner.name : '?') : tile.name || tile.id}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hovered tile tooltip */}
      {hoveredTile && (() => {
        const tile = tilesData.find(t => t.id === hoveredTile);
        const terr = ownership[hoveredTile];
        const owner = terr ? allianceMap[terr.owner_id] : null;
        if (!tile) return null;
        return (
          <div style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(8,13,20,0.95)', border: '1px solid #1e3550',
            padding: '6px 16px', fontSize: 12, color: '#d0e4f4',
            fontFamily: "'Share Tech Mono',monospace", zIndex: 100,
            display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
          }}>
            <span style={{ color: '#3a5878' }}>{tile.id}</span>
            <span>{tile.name || '—'}</span>
            {owner && (
              <>
                <span style={{ color: '#3a5878' }}>·</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: owner.color }} />
                <span style={{ color: owner.color }}>{isLoggedIn ? owner.name : '???'}</span>
              </>
            )}
            {!owner && <span style={{ color: '#3a5878' }}>unclaimed</span>}
          </div>
        );
      })()}
    </div>
  );
}

const S = {
  iconBtn: {
    background: 'none', border: '1px solid #1e3550', color: '#7a9bb8',
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  },
};
