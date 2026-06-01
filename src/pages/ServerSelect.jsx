import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { hashPassword, generateInviteCode } from '../lib/auth';
import { Server, Plus, LogIn, Zap } from 'lucide-react';

export default function ServerSelect() {
  const navigate   = useNavigate();
  const canvasRef  = useRef(null);
  const [servers,  setServers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState('list'); // list | create
  const [form,     setForm]     = useState({ serverNumber: '', name: '', adminPassword: '' });
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState('');

  // Particle background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.4 + 0.1,
    }));
    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${p.a})`; ctx.fill();
      });
      for (let i = 0; i < particles.length; i++)
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,200,255,${0.06*(1-d/120)})`;
            ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);

  useEffect(() => {
    supabase.from('servers').select('id, server_number, name, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setServers(data ?? []); setLoading(false); });
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!form.serverNumber.trim() || !form.name.trim() || !form.adminPassword.trim()) {
      setError('All fields are required.'); return;
    }
    setCreating(true);
    const hash = await hashPassword(form.adminPassword);
    const { data, error: err } = await supabase.from('servers').insert({
      server_number: form.serverNumber.trim(),
      name:          form.name.trim(),
      admin_password: hash,
      invite_code:   generateInviteCode(),
    }).select().single();
    setCreating(false);
    if (err) { setError(err.message); return; }
    navigate(`/server/${data.id}`);
  }

  const S = styles;

  return (
    <div style={S.root}>
      <canvas ref={canvasRef} style={S.canvas} />
      <div style={S.grid} />

      <div style={S.center}>
        {/* Header */}
        <div style={S.badge}>
          <Zap size={10} fill="currentColor" />
          LAST WAR ALLIANCE PLANNER
          <Zap size={10} fill="currentColor" />
        </div>
        <h1 style={S.title}>SELECT SERVER</h1>
        <p style={S.sub}>Choose your game server or create a new workspace.</p>

        {/* Tabs */}
        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(view === 'list' ? S.tabActive : {}) }} onClick={() => setView('list')}>
            <LogIn size={14} /> JOIN SERVER
          </button>
          <button style={{ ...S.tab, ...(view === 'create' ? S.tabActive : {}) }} onClick={() => setView('create')}>
            <Plus size={14} /> CREATE SERVER
          </button>
        </div>

        {/* Server list */}
        {view === 'list' && (
          <div style={S.card}>
            {loading && <p style={S.dim}>Loading servers…</p>}
            {!loading && servers.length === 0 && (
              <p style={S.dim}>No servers yet. Create the first one.</p>
            )}
            {servers.map(s => (
              <button key={s.id} style={S.serverRow} onClick={() => navigate(`/server/${s.id}`)}>
                <div style={S.serverIcon}><Server size={18} /></div>
                <div>
                  <div style={S.serverName}>Server {s.server_number} — {s.name}</div>
                  <div style={S.serverSub}>Created {new Date(s.created_at).toLocaleDateString()}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create form */}
        {view === 'create' && (
          <form style={S.card} onSubmit={handleCreate}>
            <Field label="SERVER NUMBER" placeholder="e.g. 958"
              value={form.serverNumber} onChange={v => setForm(f => ({ ...f, serverNumber: v }))} />
            <Field label="WORKSPACE NAME" placeholder="e.g. 958 Mastermind"
              value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <Field label="ADMIN PASSWORD" placeholder="Share this with your co-admins"
              type="password" value={form.adminPassword} onChange={v => setForm(f => ({ ...f, adminPassword: v }))} />
            {error && <p style={S.error}>{error}</p>}
            <button type="submit" style={S.btn} disabled={creating}>
              {creating ? 'CREATING…' : 'CREATE SERVER →'}
            </button>
          </form>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');
      `}</style>
    </div>
  );
}

function Field({ label, placeholder, type = 'text', value, onChange }) {
  const S = styles;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.label}>{label}</div>
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)}
        style={S.input}
      />
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative' },
  canvas: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' },
  grid: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  center: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 520, textAlign: 'center' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', padding: '5px 16px', color: '#00c8ff', fontWeight: 700, fontSize: 11, letterSpacing: '2px', marginBottom: 24 },
  title: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(36px, 8vw, 64px)', color: '#fff', letterSpacing: '-1px', margin: '0 0 8px', textShadow: '0 0 40px rgba(0,200,255,0.4)' },
  sub: { color: '#7a9bb8', fontSize: 14, marginBottom: 32 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' },
  tab: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(13,21,32,0.6)', border: '1px solid #1e3550', color: '#7a9bb8', padding: '8px 20px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.2s' },
  tabActive: { border: '1px solid rgba(0,200,255,0.5)', color: '#00c8ff', background: 'rgba(0,200,255,0.08)' },
  card: { background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3550', padding: '24px', textAlign: 'left' },
  serverRow: { width: '100%', display: 'flex', alignItems: 'center', gap: 16, background: 'transparent', border: 'none', borderBottom: '1px solid #1a2d42', padding: '14px 0', cursor: 'pointer', transition: 'all 0.15s', color: '#d0e4f4', textAlign: 'left' },
  serverIcon: { width: 40, height: 40, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8ff', flexShrink: 0 },
  serverName: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#d0e4f4' },
  serverSub: { fontSize: 11, color: '#3a5878', fontFamily: "'Share Tech Mono', monospace", marginTop: 2 },
  label: { fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 14px', fontFamily: "'Rajdhani', sans-serif", fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', background: '#00c8ff', color: '#080d14', border: 'none', padding: '13px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer', marginTop: 8 },
  error: { color: '#ff4060', fontSize: 12, marginBottom: 8 },
  dim: { color: '#3a5878', fontSize: 13, textAlign: 'center', padding: '16px 0' },
};
