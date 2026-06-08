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

  // Only treat session as valid if it belongs to this server
  const role         = session?.serverId === serverId ? session.role : null;
  const myAllianceId = role ? (session?.allianceId ?? null) : null;

  // Who can edit:
  //   canEditAll  — server admin or server helper: any tile, any alliance
  //   canEditOwn  — alliance owner (role='owner') or alliance admin (role='member', allianceRole='alliance_admin'): own alliance tiles only
  const canEditAll = role === 'admin' || role === 'helper';
  const canEditOwn = role === 'owner' || (role === 'member' && session?.allianceRole === 'alliance_admin');
  const canEdit    = canEditAll || canEditOwn;
  const isLoggedIn = !!role;

  const [server,           setServer]          = useState(null);
  const [alliances,        setAlliances]        = useState([]);
  const [ownership,        setOwnership]        = useState({});
  const [loading,          setLoading]          = useState(true);
  const [sidebarOpen,      setSidebarOpen]      = useState(window.innerWidth > 900);
  const [zoom,             setZoom]             = useState(0.35);
  const [selectedAlliance, setSelectedAlliance] = useState(null);
  const [hoveredTile,      setHoveredTile]      = useState(null);
  const [hideNames,        setHideNames]        = useState(false);
  const [busyTile,         setBusyTile]         = useState(null);

  const mapRef   = useRef(null);
  const panRef   = useRef({ active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 });
  const pinchRef = useRef({ active: false, dist: 0 });

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: srv }, { data: als }] = await Promise.all([
        supabase.from('servers').select('id, server_number, name, public_map').eq('id', serverId).single(),
        supabase.from('alliances').select('id, name, tag, color').eq('server_id', serverId).order('name'),
      ]);

      const allianceIds = (als ?? []).map(a => a.id);
      let terrData = [];
      if (allianceIds.length > 0) {
        const { data } = await supabase.from('territories').select('*').in('owner_id', allianceIds);
        terrData = data ?? [];
      }

      setServer(srv);
      setAlliances(als ?? []);
      const lookup = {};
      terrData.forEach(t => { lookup[t.id] = t; });
      setOwnership(lookup);
      setLoading(false);
    }
    load();

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

  // ── Tile click ─────────────────────────────────────────────
  async function handleTileClick(tileId) {
    if (!selectedAlliance) return;
    if (!canEditAll && !(canEditOwn && selectedAlliance.id === myAllianceId)) return;

    setBusyTile(tileId);
    const current = ownership[tileId];
    if (current?.owner_id === selectedAlliance.id) {
      await supabase.from('territories').delete().eq('id', tileId);
      setOwnership(prev => { const n = { ...prev }; delete n[tileId]; return n; });
    } else {
      const row = { id: tileId, owner_id: selectedAlliance.id, last_capture_at: new Date().toISOString() };
      await supabase.from('territories').upsert(row);
      setOwnership(prev => ({ ...prev, [tileId]: row }));
    }
    setBusyTile(null);
  }

  // ── Mouse pan ──────────────────────────────────────────────
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

  // ── Touch pan + pinch zoom ─────────────────────────────────
  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      panRef.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, scrollX: mapRef.current.scrollLeft, scrollY: mapRef.current.scrollTop };
    } else if (e.touches.length === 2) {
      panRef.current.active = false;
      pinchRef.current = { active: true, dist: getTouchDist(e.touches) };
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && panRef.current.active) {
      mapRef.current.scrollLeft = panRef.current.scrollX - (e.touches[0].clientX - panRef.current.startX);
      mapRef.current.scrollTop  = panRef.current.scrollY - (e.touches[0].clientY - panRef.current.startY);
    } else if (e.touches.length === 2 && pinchRef.current.active) {
      const newDist = getTouchDist(e.touches);
      const delta   = newDist - pinchRef.current.dist;
      pinchRef.current.dist = newDist;
      setZoom(z => Math.min(2, Math.max(0.1, z + delta * 0.005)));
    }
  }

  function onTouchEnd() {
    panRef.current.active  = false;
    pinchRef.current.active = false;
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace', fontSize: 14 }}>
      LOADING WAR MAP…
    </div>
  );

  // ── Public map gate ────────────────────────────────────────
  // If server has public_map = false and the user is not logged in, show lock screen
  if (!isLoggedIn && !server?.public_map) {
    return (
      <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', padding: 24, textAlign: 'center' }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`}</style>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}><Lock size={48} /></div>
        <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '3px', marginBottom: 8 }}>MAP ACCESS RESTRICTED</div>
        <p style={{ color: '#3a5878', fontSize: 14, maxWidth: 340, lineHeight: 1.7, marginBottom: 24 }}>
          This server's war map is not publicly visible. Log in with your alliance credentials to access it.
        </p>
        <button onClick={() => navigate(`/server/${serverId}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '10px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '2px', cursor: 'pointer' }}>
          <ArrowLeft size={14} /> BACK TO SERVER
        </button>
      </div>
    );
  }

  const allianceMap = Object.fromEntries(alliances.map(a => [a.id, a]));
  const ownedCount  = Object.keys(ownership).length;
  const totalCount  = tilesData.length;

  return (
    <div style={{ height: '100vh', background: '#080d14', display: 'flex', flexDirection: 'column', fontFamily: "'Rajdhani',sans-serif", overflow: 'hidden' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`}</style>

      {/* ── Topbar ──────────────────────────────────────────── */}
      <div style={{ height: 48, background: 'rgba(8,13,20,0.97)', borderBottom: '1px solid #1e3550', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', zIndex: 50, flexShrink: 0 }}>
        <button onClick={() => navigate(`/server/${serverId}`)} style={S.iconBtn} title="Back">
          <ArrowLeft size={15} />
        </button>

        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '2px', color: '#00c8ff', flex: 1 }}>
          WAR MAP
          {server && <span style={{ color: '#3a5878', marginLeft: 8, fontSize: 11 }}>— Server {server.server_number}</span>}
        </div>

        {/* Status badge */}
        {!isLoggedIn && server?.public_map && (
          <div style={S.badge('#ff6080', 'rgba(255,64,96,0.08)', 'rgba(255,64,96,0.25)')}>
            <Lock size={10} /> PUBLIC VIEW
          </div>
        )}
        {isLoggedIn && !canEdit && (
          <div style={S.badge('#3a5878', 'transparent', '#1e3550')}>VIEW ONLY</div>
        )}
        {canEditOwn && !canEditAll && (
          <div style={S.badge('#00e87a', 'rgba(0,232,122,0.08)', 'rgba(0,232,122,0.25)')}>EDIT: OWN TILES</div>
        )}
        {canEditAll && (
          <div style={S.badge('#f0a500', 'rgba(240,165,0,0.08)', 'rgba(240,165,0,0.25)')}>EDIT: ALL TILES</div>
        )}

        {/* Hide names toggle (all logged-in editors) */}
        {canEdit && (
          <button onClick={() => setHideNames(h => !h)} style={{ ...S.iconBtn, color: hideNames ? '#3a5878' : '#00c8ff' }} title={hideNames ? 'Show alliance names' : 'Hide alliance names'}>
            {hideNames ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}

        <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} style={S.iconBtn} title="Zoom in"><ZoomIn size={15} /></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.1))} style={S.iconBtn} title="Zoom out"><ZoomOut size={15} /></button>
        <button onClick={() => setSidebarOpen(o => !o)} style={{ ...S.iconBtn, color: sidebarOpen ? '#00c8ff' : '#3a5878' }}>
          {sidebarOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div style={{ width: sidebarOpen ? 240 : 0, minWidth: sidebarOpen ? 240 : 0, background: 'rgba(8,13,20,0.97)', borderRight: '1px solid #1e3550', overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', display: 'flex', flexDirection: 'column', zIndex: 40 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>

            {/* Context note */}
            <div style={{ fontSize: 11, color: '#3a5878', lineHeight: 1.6, marginBottom: 12, padding: '8px 10px', border: '1px solid #1e3550' }}>
              {!isLoggedIn && '🔓 Public view — log in to see full info.'}
              {isLoggedIn && !canEdit && '👁 You can view but not edit territories.'}
              {canEditOwn && !canEditAll && `✏ Select your alliance below, then click tiles.`}
              {canEditAll && '✏ Select any alliance, then click tiles to assign or unassign.'}
            </div>

            {/* Alliance list — all visible to everyone */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 8 }}>
              ALLIANCES — {alliances.length}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {alliances.map(a => {
                const tileCount  = Object.values(ownership).filter(t => t.owner_id === a.id).length;
                const isSelected = selectedAlliance?.id === a.id;
                const isOwn      = a.id === myAllianceId;
                // Clickable (to set as active for editing) only if you have edit rights for this alliance
                const selectable = canEditAll || (canEditOwn && isOwn);

                return (
                  <button
                    key={a.id}
                    onClick={() => selectable ? setSelectedAlliance(isSelected ? null : a) : undefined}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: isSelected ? `${a.color}18` : 'transparent',
                      border: `1px solid ${isSelected ? a.color : '#1e3550'}`,
                      padding: '8px 10px',
                      cursor: selectable ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? a.color : '#d0e4f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {hideNames && !canEditAll ? '???' : a.name}
                          {a.tag && <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5878', marginLeft: 4 }}>{a.tag}</span>}
                        </div>
                        <div style={{ fontSize: 10, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>{tileCount} tiles</div>
                      </div>
                      {isOwn && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#00c8ff' }}>MINE</div>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tile progress */}
            <div style={{ padding: '8px 10px', border: '1px solid #1e3550', fontSize: 11, color: '#3a5878' }}>
              <div style={{ marginBottom: 4 }}>{ownedCount} / {totalCount} tiles claimed</div>
              <div style={{ height: 4, background: '#1e3550', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${(ownedCount / totalCount) * 100}%`, background: '#00c8ff', borderRadius: 2 }} />
              </div>
            </div>

            {/* Server time note */}
            <div style={{ marginTop: 12, padding: '8px 10px', border: '1px solid #1e3550', fontSize: 10, color: '#3a5878', lineHeight: 1.7 }}>
              ⏱ <strong style={{ color: '#4a6888' }}>SERVER TIME</strong><br />
              All capture windows and protection timers run on server time (UTC). War rules based on server time coming soon.
            </div>
          </div>
        </div>

        {/* ── Map area ─────────────────────────────────────────── */}
        <div
          ref={mapRef}
          style={{ flex: 1, overflow: 'auto', cursor: panRef.current.active ? 'grabbing' : 'grab', position: 'relative', touchAction: 'none' }}
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
                const terr   = ownership[tile.id];
                const owner  = terr ? allianceMap[terr.owner_id] : null;
                const isOwn  = owner?.id === myAllianceId;
                const isSel  = owner?.id === selectedAlliance?.id;
                const isBusy = busyTile === tile.id;
                const hov    = hoveredTile === tile.id;
                const isTarget = selectedAlliance && canEdit && (canEditAll || selectedAlliance.id === myAllianceId);

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
                      background: isBusy ? '#ffffff' : (owner ? owner.color : '#1a2535'),
                      border: isSel ? `2px solid ${owner.color}` : '1px solid rgba(0,0,0,0.25)',
                      outline: isOwn ? '2px solid rgba(0,200,255,0.5)' : 'none',
                      filter: hov && isTarget ? 'brightness(1.5)' : undefined,
                      cursor: isTarget ? 'crosshair' : 'default',
                      transition: 'background 0.08s',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                    }}
                  >
                    {zoom > 0.65 && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.55)', pointerEvents: 'none', textAlign: 'center', padding: 2, lineHeight: 1.2 }}>
                        {owner && !hideNames ? (isLoggedIn ? owner.name : '?') : (tile.name || tile.id)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hover tooltip ───────────────────────────────────── */}
      {hoveredTile && (() => {
        const tile  = tilesData.find(t => t.id === hoveredTile);
        const terr  = ownership[hoveredTile];
        const owner = terr ? allianceMap[terr.owner_id] : null;
        if (!tile) return null;
        return (
          <div style={{ position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(8,13,20,0.97)', border: '1px solid #1e3550', padding: '5px 14px', fontSize: 11, color: '#d0e4f4', fontFamily: "'Share Tech Mono',monospace", zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
            <span style={{ color: '#3a5878' }}>{tile.id}</span>
            {tile.name && <span>{tile.name}</span>}
            <span style={{ color: '#1e3550' }}>|</span>
            {owner
              ? <><div style={{ width: 7, height: 7, borderRadius: '50%', background: owner.color }} /><span style={{ color: owner.color }}>{isLoggedIn ? owner.name : '???'}</span></>
              : <span style={{ color: '#3a5878' }}>unclaimed</span>
            }
          </div>
        );
      })()}
    </div>
  );
}

function badge(color, bg, border) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, border: `1px solid ${border}`, color, padding: '3px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1px', flexShrink: 0 };
}

const S = {
  iconBtn: { background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  badge: (color, bg, border) => badge(color, bg, border),
};
