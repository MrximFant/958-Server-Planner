import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { hashPassword } from '../lib/auth';
import { Map, Users, BookOpen, Trophy, Clock, Zap, Shield, LogOut, Settings, ChevronRight, Lock, Plus, Eye, EyeOff } from 'lucide-react';

export default function ServerDashboard() {
  const { serverId }          = useParams();
  const navigate              = useNavigate();
  const { session, login, logout } = useAuth();

  const canvasRef             = useRef(null);
  const [server,   setServer] = useState(null);
  const [loading,  setLoading] = useState(true);

  // Auth modal
  const [authView,    setAuthView]    = useState(null); // null | 'admin' | 'member'
  const [authForm,    setAuthForm]    = useState({ password: '', username: '', allianceId: '' });
  const [authError,   setAuthError]   = useState('');
  const [authBusy,    setAuthBusy]    = useState(false);
  const [alliances,   setAlliances]   = useState([]);

  // Particle bg
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.4 + 0.1,
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
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx*dx + dy*dy);
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
    async function load() {
      const [{ data: srv }, { data: als }] = await Promise.all([
        supabase.from('servers').select('*').eq('id', serverId).single(),
        supabase.from('alliances').select('id, name, color').eq('server_id', serverId).order('name'),
      ]);
      setServer(srv);
      setAlliances(als ?? []);
      setLoading(false);
    }
    load();
  }, [serverId]);

  // If session is for a different server, clear it
  const activeSession = session?.serverId === serverId ? session : null;

  async function handleAdminLogin(e) {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    const hash = await hashPassword(authForm.password);
    if (hash !== server.admin_password) {
      setAuthError('Incorrect admin password.'); setAuthBusy(false); return;
    }
    login({ serverId, serverName: server.name, role: 'admin', allianceId: null, memberId: null, username: null });
    setAuthView(null); setAuthBusy(false);
  }

  async function handleOwnerLogin(e) {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    if (!authForm.allianceId) { setAuthError('Select an alliance.'); setAuthBusy(false); return; }
    const hash = await hashPassword(authForm.password);
    const { data: al } = await supabase.from('alliances')
      .select('id, name, owner_password')
      .eq('id', authForm.allianceId)
      .single();
    if (!al || hash !== al.owner_password) {
      setAuthError('Incorrect owner password.'); setAuthBusy(false); return;
    }
    login({ serverId, serverName: server.name, role: 'owner', allianceId: al.id, allianceName: al.name, memberId: null, username: null, allianceRole: null });
    setAuthView(null); setAuthBusy(false);
  }

  async function handleMemberLogin(e) {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    if (!authForm.allianceId) { setAuthError('Select an alliance.'); setAuthBusy(false); return; }
    const hash = await hashPassword(authForm.password);
    const { data: member, error } = await supabase.from('members')
      .select('*')
      .eq('server_id', serverId)
      .eq('alliance_id', authForm.allianceId)
      .eq('username', authForm.username.trim())
      .eq('password', hash)
      .single();
    if (error || !member) { setAuthError('Username or password incorrect.'); setAuthBusy(false); return; }
    const alName = alliances.find(a => a.id === member.alliance_id)?.name || '';
    login({ serverId, serverName: server.name, role: 'member', allianceId: member.alliance_id, allianceName: alName, memberId: member.id, username: member.username, allianceRole: member.alliance_role || 'member' });
    setAuthView(null); setAuthBusy(false);
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>Loading…</div>;
  if (!server) return <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4060', fontFamily: 'monospace' }}>Server not found.</div>;

  const S = styles;
  const role = activeSession?.role;

  const FEATURES = [
    { to: `/server/${serverId}/map`, icon: Map, color: '#00c8ff', glow: 'rgba(0,200,255,0.15)', border: 'rgba(0,200,255,0.3)', label: 'WAR MAP', title: 'Territory Planner', desc: 'Live map of every tile. Assign ownership, project vulnerabilities, and plan your next attack in real time.', tag: 'LIVE', locked: false },
    { to: `/server/${serverId}/alliance`, icon: Users, color: '#f0a500', glow: 'rgba(240,165,0,0.15)', border: 'rgba(240,165,0,0.3)', label: 'ALLIANCE HQ', title: 'Member Roster', desc: 'Alliance roster with squad powers, troop types, Canyon Storm & Desert Storm preferences.', tag: 'COMMAND', locked: !activeSession },
    { to: null, icon: Trophy, color: '#a040d0', glow: 'rgba(160,64,208,0.15)', border: 'rgba(160,64,208,0.3)', label: 'LEADERBOARD', title: 'Season Rankings', desc: 'Alliance influence totals, city counts and crystal gold rates.', tag: 'SOON', disabled: true },
    { to: `/server/${serverId}/rules`, icon: BookOpen, color: '#00e87a', glow: 'rgba(0,232,122,0.15)', border: 'rgba(0,232,122,0.3)', label: 'RULES', title: 'Game Guide', desc: 'Complete rulebook for territory warfare, attack windows, and capture limits.', tag: 'GUIDE', locked: false },
    { to: null, icon: Clock, color: '#ff4060', glow: 'rgba(255,64,96,0.15)', border: 'rgba(255,64,96,0.3)', label: 'SEASONS', title: 'Season History', desc: 'Past season outcomes and alliance performance trends.', tag: 'SOON', disabled: true },
  ];

  return (
    <div style={S.root}>
      <canvas ref={canvasRef} style={S.canvas} />
      <div style={S.grid} />

      {/* Top bar */}
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={() => navigate('/')}>← SERVERS</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeSession ? (
            <>
              <span style={S.sessionBadge}>
                {role === 'admin' ? '⚡ ADMIN' : role === 'owner' ? `👑 ${activeSession.allianceName}` : `👤 ${activeSession.username}`}
              </span>
              {role === 'admin' && (
                <button style={S.adminBtn} onClick={() => navigate(`/server/${serverId}/admin`)}>
                  <Settings size={12} /> ADMIN PANEL
                </button>
              )}
              <button style={S.logoutBtn} onClick={logout}>
                <LogOut size={12} /> LOG OUT
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.loginBtn} onClick={() => { setAuthView('admin'); setAuthError(''); setAuthForm({ password: '', username: '', allianceId: '' }); }}>
                <Shield size={12} /> ADMIN
              </button>
              <button style={{ ...S.loginBtn, color: '#f0a500', borderColor: 'rgba(240,165,0,0.3)' }} onClick={() => { setAuthView('owner'); setAuthError(''); setAuthForm({ password: '', username: '', allianceId: '' }); }}>
                👑 OWNER
              </button>
              <button style={S.loginBtn} onClick={() => { setAuthView('member'); setAuthError(''); setAuthForm({ password: '', username: '', allianceId: '' }); }}>
                <LogIn size={12} /> MEMBER
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero */}
      <section style={S.hero}>
        <div style={S.inviteBadge}>🔒 INVITE ONLY — AUTHORIZED PERSONNEL</div>
        <h1 style={S.h1}>SERVER {server.server_number}</h1>
        <h2 style={S.h2}>{server.name.toUpperCase()}</h2>
        <div style={S.seasonBadge}><Zap size={12} fill="currentColor" /> LAST WAR: SURVIVAL <Zap size={12} fill="currentColor" /></div>
        <p style={S.heroSub}>Your alliance's command center. Plan territory warfare, coordinate your roster, and dominate the map every season.</p>
        <div style={S.heroBtns}>
          <button style={S.btnPrimary} onClick={() => navigate(`/server/${serverId}/map`)}>ENTER WAR MAP →</button>
          {activeSession ? (
            <button style={S.btnSecondary} onClick={() => navigate(`/server/${serverId}/alliance`)}>ALLIANCE HQ</button>
          ) : (
            <button style={S.btnSecondary} onClick={() => { setAuthView('member'); setAuthError(''); setAuthForm({ password: '', username: '', allianceId: '' }); }}>MEMBER LOGIN</button>
          )}
        </div>
      </section>

      {/* Role help banner */}
      {activeSession && <RoleHelp role={role} serverId={serverId} navigate={navigate} />}

      {/* Feature cards */}
      <section style={S.cards}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={S.sectionLabel}>COMMAND CENTER</div>
          <h3 style={S.sectionTitle}>ALL TOOLS</h3>
        </div>
        <div style={S.grid2}>
          {FEATURES.map(f => <FeatureCard key={f.label} feature={f} navigate={navigate} session={activeSession} />)}
        </div>
      </section>

      <footer style={S.footer}>
        SERVER {server.server_number} · {server.name.toUpperCase()} · AUTHORIZED USE ONLY
      </footer>

      {/* Auth modal */}
      {authView && (
        <div style={S.overlay} onClick={() => setAuthView(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalTitle}>
              {authView === 'admin' ? '⚡ ADMIN LOGIN' : authView === 'owner' ? '👑 OWNER LOGIN' : '👤 MEMBER LOGIN'}
            </div>

            {authView === 'admin' && (
              <form onSubmit={handleAdminLogin}>
                <Field label="ADMIN PASSWORD" type="password" value={authForm.password} onChange={v => setAuthForm(f => ({ ...f, password: v }))} />
                {authError && <p style={S.error}>{authError}</p>}
                <button type="submit" style={S.modalBtn} disabled={authBusy}>{authBusy ? 'CHECKING…' : 'LOGIN →'}</button>
              </form>
            )}

            {authView === 'owner' && (
              <form onSubmit={handleOwnerLogin}>
                <div style={{ marginBottom: 14 }}>
                  <div style={S.label}>ALLIANCE</div>
                  <select value={authForm.allianceId} onChange={e => setAuthForm(f => ({ ...f, allianceId: e.target.value }))} style={S.select}>
                    <option value="">— Select your alliance —</option>
                    {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <Field label="OWNER PASSWORD" type="password" value={authForm.password} onChange={v => setAuthForm(f => ({ ...f, password: v }))} />
                {authError && <p style={S.error}>{authError}</p>}
                <button type="submit" style={{ ...S.modalBtn, background: '#f0a500' }} disabled={authBusy}>{authBusy ? 'CHECKING…' : 'LOGIN →'}</button>
              </form>
            )}

            {authView === 'member' && (
              <form onSubmit={handleMemberLogin}>
                <div style={{ marginBottom: 14 }}>
                  <div style={S.label}>ALLIANCE</div>
                  <select value={authForm.allianceId} onChange={e => setAuthForm(f => ({ ...f, allianceId: e.target.value }))} style={S.select}>
                    <option value="">— Select your alliance —</option>
                    {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <Field label="USERNAME" value={authForm.username} onChange={v => setAuthForm(f => ({ ...f, username: v }))} />
                <Field label="PASSWORD" type="password" value={authForm.password} onChange={v => setAuthForm(f => ({ ...f, password: v }))} />
                {authError && <p style={S.error}>{authError}</p>}
                <button type="submit" style={S.modalBtn} disabled={authBusy}>{authBusy ? 'CHECKING…' : 'LOGIN →'}</button>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');
      `}</style>
    </div>
  );
}

function Field({ label, type = 'text', value, onChange }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const S = styles;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={S.label}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value} onChange={e => onChange(e.target.value)}
          style={{ ...S.input, paddingRight: isPassword ? 38 : undefined }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: '#3a5878', cursor: 'pointer', padding: 2,
            display: 'flex', alignItems: 'center',
          }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

// Needed for member login button icon
function LogIn({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>;
}

const ROLE_HELP = {
  admin: {
    label: '⚡ SERVER ADMIN QUICK START',
    color: '#f0a500',
    steps: [
      'Go to Admin Panel (top-right button) to create and manage alliances.',
      'When creating an alliance, set an owner password and give it directly to the alliance leader.',
      'The alliance leader logs in as OWNER from this page using that password.',
      'To invite players: the owner copies the invite link from Alliance HQ → Settings → shares it with members.',
      'Players self-register via the invite link — no manual entry needed.',
      'Set the active season in Admin Panel → SERVER tab to control which map and fields are shown.',
    ],
  },
  owner: {
    label: '👑 ALLIANCE OWNER QUICK START',
    color: '#f0a500',
    steps: [
      'Go to Alliance HQ to manage your roster.',
      'In the SETTINGS tab, copy your alliance invite link and share it with your players.',
      'Players click the link, register, and appear in your ROSTER tab automatically.',
      'Promote up to 10 trusted members to Alliance Admin in the ADMINS tab — they can edit and remove members.',
      'Control who can see your roster using the visibility toggles in SETTINGS.',
      'If a member forgets their password, edit their record in the ROSTER tab to reset it.',
    ],
  },
  member: {
    label: '👤 MEMBER QUICK START',
    color: '#00c8ff',
    steps: [
      'Go to Alliance HQ to view your alliance roster and update your profile.',
      'In the MY PROFILE panel, fill in your squad powers, troop types, and event preferences.',
      'Your alliance leadership uses this data to plan Canyon Storm and Desert Storm teams.',
      'Keep your T1 power and team preference up to date before each event.',
    ],
  },
};

function RoleHelp({ role, serverId, navigate }) {
  const [open, setOpen] = useState(false);
  const help = ROLE_HELP[role];
  if (!help) return null;
  const S = styles;
  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: '0 24px 8px' }}>
      <div style={{ background: 'rgba(13,21,32,0.85)', border: `1px solid rgba(240,165,0,0.2)` }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', color: help.color, padding: '12px 18px', cursor: 'pointer', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1.5px', textAlign: 'left' }}
        >
          <span>ℹ {help.label}</span>
          <span style={{ fontSize: 10, color: '#3a5878' }}>{open ? '▲ COLLAPSE' : '▼ HOW TO GET STARTED'}</span>
        </button>
        {open && (
          <div style={{ padding: '4px 18px 16px' }}>
            <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {help.steps.map((s, i) => (
                <li key={i} style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6 }}>{s}</li>
              ))}
            </ol>
            {(role === 'admin' || role === 'owner') && (
              <button
                onClick={() => navigate(role === 'admin' ? `/server/${serverId}/admin` : `/server/${serverId}/alliance`)}
                style={{ marginTop: 14, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)', color: '#f0a500', padding: '7px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' }}
              >
                {role === 'admin' ? 'OPEN ADMIN PANEL →' : 'OPEN ALLIANCE HQ →'}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function FeatureCard({ feature: f, navigate, session }) {
  const S = styles;
  const isLocked   = f.locked && !session;
  const isDisabled = f.disabled || isLocked;
  const Icon = f.icon;
  return (
    <div
      onClick={() => !isDisabled && f.to && navigate(f.to)}
      style={{ ...S.featureCard, border: `1px solid ${isDisabled ? '#1e3550' : f.border}`, opacity: f.disabled ? 0.5 : 1, cursor: isDisabled ? 'default' : 'pointer' }}
      onMouseEnter={e => { if (!isDisabled) { e.currentTarget.style.background = f.glow; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={e => { if (!isDisabled) { e.currentTarget.style.background = 'rgba(13,21,32,0.8)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
    >
      <div style={{ position: 'absolute', top: 16, right: 16, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '2px', color: f.color, background: f.glow, border: `1px solid ${f.border}`, padding: '2px 7px' }}>
        {isLocked ? 'LOGIN' : f.tag}
      </div>
      <div style={{ width: 44, height: 44, background: f.glow, border: `1px solid ${f.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: f.color }}>
        {isLocked ? <Lock size={20} /> : <Icon size={20} />}
      </div>
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: f.color, marginBottom: 6 }}>{f.label}</div>
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 20, color: '#d0e4f4', marginBottom: 10 }}>{f.title}</div>
      <p style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>{f.desc}</p>
      {!isDisabled && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '2px', color: f.color }}>OPEN <ChevronRight size={12} /></div>}
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani', sans-serif", position: 'relative', overflowX: 'hidden' },
  canvas: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' },
  grid: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  topbar: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'rgba(8,13,20,0.9)', borderBottom: '1px solid #1e3550' },
  backBtn: { background: 'none', border: 'none', color: '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  sessionBadge: { fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: '#00c8ff', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', padding: '4px 10px' },
  adminBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)', color: '#f0a500', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  logoutBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  loginBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', padding: '6px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  hero: { position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px 60px', textAlign: 'center' },
  inviteBadge: { marginBottom: 32, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.3)', padding: '5px 16px', color: '#ff4060', fontWeight: 700, fontSize: 11, letterSpacing: '2px' },
  h1: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 'clamp(48px,10vw,96px)', lineHeight: 1, color: '#fff', letterSpacing: '-1px', textShadow: '0 0 60px rgba(0,200,255,0.4)', margin: 0 },
  h2: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 'clamp(20px,4vw,40px)', color: '#00c8ff', letterSpacing: '6px', margin: '8px 0 0', textShadow: '0 0 30px rgba(0,200,255,0.5)' },
  seasonBadge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.4)', padding: '7px 20px', margin: '24px 0', fontWeight: 700, fontSize: 13, letterSpacing: '3px', color: '#f0a500' },
  heroSub: { maxWidth: 480, color: '#7a9bb8', lineHeight: 1.7, fontSize: 15, marginBottom: 40 },
  heroBtns: { display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  btnPrimary: { background: '#00c8ff', color: '#080d14', border: 'none', padding: '14px 36px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer', clipPath: 'polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)', boxShadow: '0 0 30px rgba(0,200,255,0.3)' },
  btnSecondary: { background: 'transparent', color: '#f0a500', border: '1px solid rgba(240,165,0,0.5)', padding: '14px 36px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer' },
  cards: { position: 'relative', zIndex: 1, padding: '60px 24px 80px', maxWidth: 1200, margin: '0 auto' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 },
  featureCard: { background: 'rgba(13,21,32,0.8)', padding: '24px', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' },
  footer: { position: 'relative', zIndex: 1, borderTop: '1px solid #1e3550', padding: '24px', textAlign: 'center', fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5878', letterSpacing: '2px' },
  overlay: { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: '#0d1520', border: '1px solid rgba(0,200,255,0.3)', padding: '32px', width: '100%', maxWidth: 400 },
  modalTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 20, color: '#00c8ff', letterSpacing: '2px', marginBottom: 24 },
  modalBtn: { width: '100%', background: '#00c8ff', color: '#080d14', border: 'none', padding: '12px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer', marginTop: 4 },
  label: { fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 14px', fontFamily: "'Rajdhani',sans-serif", fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', background: '#0d1520', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 14px', fontFamily: "'Rajdhani',sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  error: { color: '#ff4060', fontSize: 12, marginBottom: 8, margin: '0 0 8px' },
};
