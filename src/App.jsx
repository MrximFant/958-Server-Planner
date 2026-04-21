import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import tilesData from './data/territories.json';
import { Shield, Clock, Menu, X, Info, ChevronRight, Zap } from 'lucide-react';

// Tile Type Colors
const TYPE_COLORS = {
  'Stronghold': '#475569',
  'Coyote Town': '#1e40af',
  'Waterhold': '#0369a1',
  'Lawless Road': '#3f3f46',
  'Derby Grounds': '#166534',
  'Sand County': '#854d0e',
  'Trade Post': '#52525b',
  'Grand Nexus': '#7e22ce',
  'Golden Palace': '#fbbf24',
  'Small CrystalGold Mine': '#0d9488',
  'Medium CrystalGold Mine': '#0f766e',
  'Large CrystalGold Mine': '#115e59',
  'Mega CrystalGold Mine': '#134e4a',
  'Colossal CrystalGold Mine': '#134e4a',
  'Warzone Outpost': '#27272a'
};

function App() {
  const [ownership, setOwnership] = useState({});
  const [alliances, setAlliances] = useState([]);
  const [selectedAlliance, setSelectedAlliance] = useState(null);
  const [sliderHours, setSliderHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  
  // Responsive Map Scaling
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);

  const CANVAS_SIZE = 3000;
  // Calculate scale based on the smaller dimension to ensure "Fit to Window"
  const SCALE = useMemo(() => {
    if (dimensions.width === 0) return 0.3;
    return Math.min(dimensions.width / CANVAS_SIZE, dimensions.height / CANVAS_SIZE);
  }, [dimensions]);

  useEffect(() => {
    fetchInitialData();
    
    // Realtime setup
    const channel = supabase
      .channel('live-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territories' }, 
        (payload) => {
          setOwnership(prev => ({ ...prev, [payload.new.id]: payload.new }));
        }
      ).subscribe();

    // Resize listener
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth - 40,
          height: containerRef.current.offsetHeight - 40
        });
      }
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 500); // Initial calculation

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  async function fetchInitialData() {
    const { data: allyData } = await supabase.from('alliances').select('*');
    const { data: terrData } = await supabase.from('territories').select('*');
    setAlliances(allyData || []);
    const lookup = {};
    terrData?.forEach(t => lookup[t.id] = t);
    setOwnership(lookup);
    setLoading(false);
  }

  const handleTileClick = async (tileId) => {
    if (!selectedAlliance) return;
    const { error } = await supabase.from('territories').upsert({ 
      id: tileId, 
      owner_id: selectedAlliance.id,
      last_capture_at: new Date().toISOString() 
    });
    if (error) console.error(error);
  };

  const getTileStatus = (tileId, tileName) => {
    const data = ownership[tileId];
    if (!data || !data.owner_id) return { owned: false };

    const alliance = alliances.find(a => a.id === data.owner_id);
    const protectionHours = ['Trade Post', 'Lawless Road', 'Warzone Outpost'].includes(tileName) ? 24 : 48;
    const capturedAt = new Date(data.last_capture_at).getTime();
    const projectionTime = Date.now() + (sliderHours * 3600 * 1000);
    const expiryTime = capturedAt + (protectionHours * 3600 * 1000);

    return {
      owned: true,
      color: alliance?.color || '#333',
      isVulnerable: projectionTime > expiryTime,
      allianceName: alliance?.name
    };
  };

  if (loading) return <div className="h-screen bg-[#1a1a2e] flex items-center justify-center text-white font-mono animate-pulse">INITIALIZING WARZONE...</div>;

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden select-none">
      
      {/* Mobile Toggle Button */}
      <button 
        onClick={() => setSidebarOpen(!isSidebarOpen)}
        className="md:hidden fixed top-4 right-4 z-50 bg-blue-600 p-3 rounded-full shadow-lg"
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar - Tactical Control Panel */}
      <div className={`
        fixed md:relative z-40 h-full bg-[#1e293b] border-r border-slate-700 p-6 shadow-2xl transition-all duration-300
        ${isSidebarOpen ? 'translate-x-0 w-80' : '-translate-x-full md:w-0 md:p-0 md:border-0'}
      `}>
        <div className="flex flex-col h-full gap-6">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2 tracking-tighter">
              <Shield className="text-blue-500" fill="currentColor" size={28} /> 
              958 MASTERMIND
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-blue-400 font-bold tracking-widest mt-1">
              <Zap size={10} fill="currentColor" /> SEASON 5: WILD WEST
            </div>
          </div>

          {/* Vulnerability Engine */}
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-4">
              <Clock size={14} /> Vulnerability Projection
            </label>
            <input 
              type="range" min="0" max="48" value={sliderHours} 
              onChange={(e) => setSliderHours(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between mt-2 font-mono">
              <span className="text-xs text-slate-500">NOW</span>
              <span className="text-blue-400 font-bold">+{sliderHours}h</span>
            </div>
          </div>

          {/* Alliance Selector */}
          <div className="flex-1 overflow-y-auto">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-3 block tracking-widest">Active Commands</label>
            <div className="space-y-2">
              {alliances.map(alliance => (
                <button
                  key={alliance.id}
                  onClick={() => {
                    setSelectedAlliance(alliance);
                    if(window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${
                    selectedAlliance?.id === alliance.id 
                      ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                      : 'bg-slate-800/40 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: alliance.color }} />
                    <span className="font-bold text-sm truncate w-32 text-left">{alliance.name}</span>
                  </div>
                  <ChevronRight size={14} className={selectedAlliance?.id === alliance.id ? 'text-blue-400' : 'text-slate-600'} />
                </button>
              ))}
            </div>
          </div>

          {selectedAlliance && (
            <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-lg text-[10px] text-blue-300">
              TAP TILES ON MAP TO ASSIGN TO <strong>{selectedAlliance.name}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Map Viewport */}
      <main 
        ref={containerRef}
        className="flex-1 relative bg-[#0f172a] flex items-center justify-center overflow-hidden touch-none"
      >
        {/* The 3000px Grid Container */}
        <div 
          className="relative shadow-2xl transition-transform duration-500 ease-out bg-slate-900/50"
          style={{ 
            width: CANVAS_SIZE * SCALE, 
            height: CANVAS_SIZE * SCALE,
            backgroundImage: `radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: `${50 * SCALE}px ${50 * SCALE}px`,
          }}
        >
          {tilesData.map(tile => {
            const status = getTileStatus(tile.id, tile.name);
            return (
              <div
                key={tile.id}
                onClick={() => handleTileClick(tile.id)}
                className={`absolute transition-all duration-300 group cursor-pointer
                  ${status.isVulnerable ? 'animate-pulse' : ''}
                `}
                style={{
                  left: tile.coordinates.x * SCALE,
                  top: tile.coordinates.y * SCALE,
                  width: tile.coordinates.width * SCALE,
                  height: tile.coordinates.height * SCALE,
                  backgroundColor: status.owned ? status.color : TYPE_COLORS[tile.name],
                  border: status.isVulnerable 
                    ? `${Math.max(1.5, 4 * SCALE)}px solid #ff4d4d` 
                    : `${Math.max(0.1, 0.5 * SCALE)}px solid rgba(0,0,0,0.3)`,
                  zIndex: tile.isCapitol ? 10 : 1,
                  borderRadius: Math.max(1, 2 * SCALE)
                }}
              >
                {/* Tactical Labels for Large Scale */}
                {SCALE > 0.4 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[6px] opacity-20 font-bold pointer-events-none">
                    {tile.id}
                  </span>
                )}

                {/* PC Hover Tooltip (Disabled on Mobile for better experience) */}
                <div className="hidden md:group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-slate-900 border border-slate-700 p-2 rounded shadow-2xl z-[100] pointer-events-none">
                  <div className="text-[10px] font-bold text-blue-400">{tile.id} • {tile.name}</div>
                  <div className="text-[8px] text-slate-400 uppercase">Level {tile.level}</div>
                  {status.owned && (
                    <div className="mt-1 pt-1 border-t border-slate-800 text-[9px] text-green-400 font-bold">
                       {status.allianceName}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend Overlay (Mobile Friendly) */}
        <div className="absolute bottom-4 left-4 md:left-auto md:right-4 flex gap-2 flex-wrap max-w-[200px] md:max-w-none pointer-events-none">
          {['Grand Nexus', 'Golden Palace'].map(cap => (
            <div key={cap} className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded text-[8px] border border-slate-700">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[cap] }} />
              {cap}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;