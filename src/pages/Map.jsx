import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import tilesData from '../data/territories.json';
import { Shield, Clock, Menu, X, Settings, ChevronRight, Zap, ZoomIn, ZoomOut, Lock } from 'lucide-react';
import Navbar from '../components/Navbar';

const TYPE_COLORS = { /* ... keep your existing colors ... */ };

const SAFE_TIME_OPTIONS = [
  { label: '04:00 - 05:00 (Early)', value: '04:00' },
  { label: '12:00 - 13:00 (Mid)', value: '12:00' },
  { label: '20:00 - 21:00 (Late/CEST Midnight)', value: '20:00' },
];

export default function Map() {
  // --- States ---
  const [ownership, setOwnership] = useState({});
  const [alliances, setAlliances] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation & UI
  const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [zoom, setZoom] = useState(0.4);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  // Selection & Editing
  const [selectedAlliance, setSelectedAlliance] = useState(null);
  const [editingAlliance, setEditingAlliance] = useState(null);
  const [sliderHours, setSliderHours] = useState(0);

  const containerRef = useRef(null);
  const CANVAS_SIZE = 3000;

  // --- Auth Logic ---
  const handleAdminLogin = () => {
    if (adminPassword === "YOUR_ADMIN_PASSWORD") { // Change this to your secret
      setIsAdmin(true);
      setShowAdminLogin(false);
    } else {
      alert("Access Denied");
    }
  };

  // --- Alliance Management ---
  const updateAllianceData = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('alliances')
      .update({
        name: editingAlliance.name,
        color: editingAlliance.color,
        server: editingAlliance.server,
        safe_time: editingAlliance.safe_time
      })
      .eq('id', editingAlliance.id);

    if (!error) {
      setAlliances(alliances.map(a => a.id === editingAlliance.id ? editingAlliance : a));
      setEditingAlliance(null);
    }
  };

  // --- Initial Load & Realtime ---
  useEffect(() => {
    fetchInitialData();
    const channel = supabase.channel('live-map').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'territories' },
      (payload) => setOwnership(prev => ({ ...prev, [payload.new.id]: payload.new }))
    ).subscribe();
    return () => supabase.removeChannel(channel);
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

  // --- Tile Status Logic ---
  const getTileStatus = (tileId, tileName) => {
    const data = ownership[tileId];
    if (!data || !data.owner_id) return { owned: false };
    const alliance = alliances.find(a => a.id === data.owner_id);
    return {
      owned: true,
      color: alliance?.color || '#333',
      allianceName: alliance?.name,
    };
  };

  if (loading) return <div className="h-screen bg-[#0f172a] flex items-center justify-center text-blue-400 font-mono italic">BOOTING WAR ROOM...</div>;

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden">
      <Navbar />

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Lock size={20}/> Admin Access</h2>
            <input 
              type="password" 
              className="w-full bg-slate-900 border border-slate-600 p-3 rounded-lg mb-4"
              placeholder="Enter Access Key..."
              onChange={(e) => setAdminPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleAdminLogin} className="flex-1 bg-blue-600 p-3 rounded-lg font-bold">Login</button>
              <button onClick={() => setShowAdminLogin(false)} className="flex-1 bg-slate-700 p-3 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-[#1e293b] border-r border-slate-700 transition-all duration-300 relative z-50 flex flex-col pt-16`}>
        <div className="p-6 flex flex-col h-full gap-4 overflow-y-auto">
          <div className="flex justify-between items-center">
            <h1 className="font-black text-lg">958 COMMAND</h1>
            {!isAdmin && (
              <button onClick={() => setShowAdminLogin(true)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">
                <Settings size={18} />
              </button>
            )}
          </div>

          {/* Admin Alliance Editor */}
          {isAdmin && editingAlliance && (
            <form onSubmit={updateAllianceData} className="bg-blue-600/10 border border-blue-500/50 p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-blue-400 uppercase">Edit Alliance</h3>
              <input 
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm"
                value={editingAlliance.name}
                onChange={e => setEditingAlliance({...editingAlliance, name: e.target.value})}
              />
              <div className="flex gap-2">
                <input 
                  type="color" className="h-9 w-12 bg-transparent cursor-pointer"
                  value={editingAlliance.color}
                  onChange={e => setEditingAlliance({...editingAlliance, color: e.target.value})}
                />
                <input 
                  placeholder="Server #" className="flex-1 bg-slate-900 border border-slate-700 p-2 rounded text-sm"
                  value={editingAlliance.server || ""}
                  onChange={e => setEditingAlliance({...editingAlliance, server: e.target.value})}
                />
              </div>
              <select 
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm text-white"
                value={editingAlliance.safe_time}
                onChange={e => setEditingAlliance({...editingAlliance, safe_time: e.target.value})}
              >
                <option value="">Select Safe Time</option>
                {SAFE_TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <button type="submit" className="w-full bg-blue-600 text-white text-xs font-bold p-2 rounded">SAVE CHANGES</button>
            </form>
          )}

          {/* Alliance List */}
          <div className="space-y-2">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Database</label>
             {alliances.map(a => (
               <div key={a.id} className="group relative">
                 <button
                   onClick={() => setSelectedAlliance(a)}
                   className={`w-full p-3 rounded-lg flex items-center gap-3 border transition-all ${selectedAlliance?.id === a.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-800/40'}`}
                 >
                   <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                   <div className="text-left">
                     <div className="text-sm font-bold truncate">{a.name}</div>
                     <div className="text-[10px] text-slate-500">S:{a.server || '??'} | Safe: {a.safe_time || 'None'}</div>
                   </div>
                 </button>
                 {isAdmin && (
                   <button 
                    onClick={() => setEditingAlliance(a)}
                    className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 bg-slate-700 p-1.5 rounded"
                   >
                     <Settings size={12} />
                   </button>
                 )}
               </div>
             ))}
          </div>
        </div>
      </aside>

      {/* Map Content */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0f1e]">
        {/* Controls Overlay */}
        <div className="absolute top-20 right-6 z-30 flex flex-col gap-2">
          <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 2))} className="bg-slate-800 p-3 rounded-xl border border-slate-700 hover:bg-slate-700 shadow-xl">
            <ZoomIn size={20} />
          </button>
          <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.1))} className="bg-slate-800 p-3 rounded-xl border border-slate-700 hover:bg-slate-700 shadow-xl">
            <ZoomOut size={20} />
          </button>
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="bg-blue-600 p-3 rounded-xl shadow-xl">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Scalable Map Area */}
        <div 
          className="w-full h-full flex items-center justify-center transition-transform duration-200"
          style={{ cursor: 'grab' }}
        >
          <div 
            style={{ 
              transform: `scale(${zoom})`,
              width: CANVAS_SIZE, 
              height: CANVAS_SIZE,
              position: 'relative',
              transformOrigin: 'center center'
            }}
            className="bg-slate-900 shadow-[0_0_100px_rgba(0,0,0,0.5)] transition-all ease-out"
          >
            {tilesData.map(tile => {
              const status = getTileStatus(tile.id, tile.name);
              return (
                <div
                  key={tile.id}
                  onClick={async () => {
                    if (isAdmin && selectedAlliance) {
                      await supabase.from('territories').upsert({
                        id: tile.id,
                        owner_id: selectedAlliance.id,
                        last_capture_at: new Date().toISOString()
                      });
                    }
                  }}
                  className="absolute border border-black/20 hover:brightness-125 transition-all"
                  style={{
                    left: tile.coordinates.x,
                    top: tile.coordinates.y,
                    width: tile.coordinates.width,
                    height: tile.coordinates.height,
                    backgroundColor: status.owned ? status.color : '#2d3748',
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold opacity-10 pointer-events-none">
                    {tile.id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}