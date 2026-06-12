import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { hashPassword } from '../lib/auth';
import { Users, BookOpen, Zap, Shield, LogOut, Settings, ChevronRight, ChevronDown, Lock, Plus, Eye, EyeOff } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

export default function ServerDashboard() {
  const { serverId }          = useParams();
  const navigate              = useNavigate();
  const { session, login, logout } = useAuth();

  const [server,   setServer] = useState(null);
  const [loading,  setLoading] = useState(true);

  // Auth modal
  const [authView,    setAuthView]    = useState(null); // null | 'login' | 'emergency'
  const [authForm,    setAuthForm]    = useState({ password: '', username: '' });
  const [authError,   setAuthError]   = useState('');
  const [authBusy,    setAuthBusy]    = useState(false);
  const [alliances,   setAlliances]   = useState([]);
  const [showEmergency, setShowEmergency] = useState(false); // kept for state but section removed


  useEffect(() => {
    async function load() {
      const [{ data: srv }, { data: als }] = await Promise.all([
        supabase.from('servers').select('*').eq('id', serverId).single(),
        supabase.from('alliances').select('id, name, tag, color, roster_public').eq('server_id', serverId).order('name'),
      ]);
      setServer(srv);

      if (als && als.length > 0) {
        // Load member counts for each alliance
        const counts = await Promise.all(
          als.map(a =>
            supabase.from('members').select('id', { count: 'exact', head: true }).eq('alliance_id', a.id)
          )
        );
        const withCounts = als.map((a, i) => ({ ...a, memberCount: counts[i].count ?? 0 }));
        setAlliances(withCounts);
      } else {
        setAlliances([]);
      }

      setLoading(false);
    }
    load();
  }, [serverId]);

  // If session is for a different server, clear it
  const activeSession = session?.serverId === serverId ? session : null;

  async function handleUnifiedLogin(e) {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    if (!authForm.username.trim()) { setAuthError('Username is required.'); setAuthBusy(false); return; }
    const hash = await hashPassword(authForm.password);
    const { data: member, error } = await supabase.from('members')
      .select('*, alliances(name)')
      .eq('server_id', serverId)
      .eq('username', authForm.username.trim())
      .eq('password', hash)
      .single();
    if (error || !member) { setAuthError('Username or password incorrect.'); setAuthBusy(false); return; }
    const alName = member.alliances?.name || alliances.find(a => a.id === member.alliance_id)?.name || '';
    const serverRole = member.server_role === 'admin' ? 'admin' : member.server_role === 'helper' ? 'helper' : 'member';
    login({ serverId, serverName: server.name, role: serverRole, allianceId: member.alliance_id, allianceName: alName, memberId: member.id, username: member.username, allianceRole: member.alliance_role || 'member' });
    setAuthView(null); setAuthBusy(false);
  }

  async function handleEmergencyAdminLogin(e) {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    const hash = await hashPassword(authForm.password);
    if (hash !== server.admin_password) {
      setAuthError('Incorrect admin password.'); setAuthBusy(false); return;
    }
    login({ serverId, serverName: server.name, role: 'admin', allianceId: null, memberId: null, username: 'Admin' });
    setAuthView(null); setAuthBusy(false);
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>Loading…</div>;
  if (!server) return <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4060', fontFamily: 'monospace' }}>Server not found.</div>;

  const S = styles;
  const role = activeSession?.role;

  const FEATURES = [
    { to: `/server/${serverId}/alliance`, icon: Users, color: '#f0a500', glow: 'rgba(240,165,0,0.15)', border: 'rgba(240,165,0,0.3)', label: 'ALLIANCE HQ', title: 'Member Roster & Planning', desc: 'Roster, squad powers, train rotation planner, event team assignments, and war map.', tag: 'COMMAND', locked: !activeSession },
    { to: `/server/${serverId}/rules`, icon: BookOpen, color: '#00e87a', glow: 'rgba(0,232,122,0.15)', border: 'rgba(0,232,122,0.3)', label: 'RULES & GUIDE', title: 'Platform Guide', desc: 'How the planner works — roles, territory ownership, map sharing, and member accounts.', tag: 'GUIDE', locked: false },
  ];

  return (
    <div style={S.root}>
      <ParticleBackground />
      <div style={S.grid} />

      {/* Top bar */}
      <div style={S.topbar} className="sd-topbar">
        <button style={S.backBtn} onClick={() => navigate('/')}>← SERVERS</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeSession ? (
            <>
              <span style={S.sessionBadge}>
                {role === 'admin' ? '⚡ ADMIN' : role === 'helper' ? `🔧 ${activeSession.username}` : role === 'owner' ? `👑 ${activeSession.allianceName}` : `👤 ${activeSession.username}`}
              </span>
              {(role === 'admin' || role === 'helper') && (
                <button style={S.adminBtn} onClick={() => navigate(`/server/${serverId}/admin`)}>
                  <Settings size={12} /> {role === 'helper' ? 'HELPER PANEL' : 'SERVER ADMIN'}
                </button>
              )}
              <button style={S.logoutBtn} onClick={logout}>
                <LogOut size={12} /> LOG OUT
              </button>
            </>
          ) : (
            <button style={S.loginBtn} onClick={() => { setAuthView('login'); setAuthError(''); setAuthForm({ password: '', username: '' }); setShowEmergency(false); }}>
              <LogIn size={12} /> LOGIN
            </button>
          )}
        </div>
      </div>

      {/* ── Compact hero: title only ── */}
      <section style={{ ...S.hero, minHeight: 'unset', padding: '80px 24px 40px' }}>
        <div style={S.inviteBadge}>🔒 INVITE ONLY — AUTHORIZED PERSONNEL</div>
        <h1 style={S.h1}>SERVER {server.server_number}</h1>
        <h2 style={S.h2}>{server.name.toUpperCase()}</h2>
        <div style={S.seasonBadge}><Zap size={12} fill="currentColor" /> LAST WAR: SURVIVAL <Zap size={12} fill="currentColor" /></div>
      </section>

      {/* ── Two-column layout ── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1140, margin: '0 auto', padding: '0 24px 60px' }}>
        <div className="sd-cols" style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

          {/* LEFT: Alliances + action buttons */}
          <div className="sd-left" style={{ flex: '1 1 0', minWidth: 0 }}>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {activeSession ? (
                <>
                  <button style={{ ...S.btnPrimary, flex: '1 1 160px', padding: '12px 20px', fontSize: 13 }}
                    onClick={() => navigate(`/server/${serverId}/alliance`)}>
                    <Users size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    ALLIANCE HQ →
                  </button>
                  {(role === 'admin' || role === 'helper') && (
                    <button style={{ ...S.btnPrimary, flex: '1 1 160px', padding: '12px 20px', fontSize: 13, background: 'transparent', border: '1px solid rgba(240,165,0,0.5)', color: '#f0a500' }}
                      onClick={() => navigate(`/server/${serverId}/admin`)}>
                      {role === 'helper' ? '🔧 HELPER PANEL →' : '⚡ SERVER ADMIN →'}
                    </button>
                  )}
                  <button style={{ ...S.logoutBtn, padding: '12px 16px' }} onClick={logout}>
                    <LogOut size={13} /> LOG OUT
                  </button>
                </>
              ) : (
                <button style={{ ...S.btnPrimary, flex: '1 1 200px', padding: '12px 20px', fontSize: 13 }}
                  onClick={() => { setAuthView('login'); setAuthError(''); setAuthForm({ password: '', username: '' }); setShowEmergency(false); }}>
                  🔐 LOGIN TO THIS SERVER →
                </button>
              )}
            </div>

            <SectionLabel>ALLIANCES ON THIS SERVER</SectionLabel>
            {alliances.length === 0 ? (
              <div style={{ background: 'rgba(13,21,32,0.7)', border: '1px solid #1e3550', padding: '24px', textAlign: 'center', color: '#3a5878', fontSize: 13 }}>
                No alliances yet. Set them up in Server Admin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alliances.map(al => (
                  <div key={al.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(13,21,32,0.85)', border: '1px solid rgba(30,53,80,0.8)', borderLeft: `3px solid ${al.color}`, padding: '14px 18px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: al.color, flexShrink: 0, boxShadow: `0 0 8px ${al.color}` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {al.name}
                        {al.tag && <span style={{ fontSize: 10, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace", border: '1px solid #1e3550', padding: '1px 6px' }}>{al.tag}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#4a6880', fontFamily: "'Share Tech Mono',monospace", marginTop: 3 }}>
                        {al.memberCount} member{al.memberCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {al.roster_public ? (
                      <button onClick={() => navigate(`/server/${serverId}/alliance/${al.id}/public`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${al.color}14`, border: `1px solid ${al.color}50`, color: al.color, padding: '7px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1.5px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        VIEW ROSTER →
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#2a4058', fontSize: 11, flexShrink: 0 }}>
                        <Lock size={11} />
                        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9 }}>PRIVATE</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeSession && (
              <div style={{ marginTop: 16 }}>
                <RoleHelp role={role} serverId={serverId} navigate={navigate} />
              </div>
            )}
          </div>

          {/* RIGHT: Collapsible Rules & Guide */}
          <div className="sd-right" style={{ flex: '0 0 380px', minWidth: 0 }}>
            <SectionLabel>
              RULES &amp; GUIDE
              <button onClick={() => navigate(`/server/${serverId}/rules`)}
                style={{ marginLeft: 8, background: 'none', border: 'none', color: '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '1px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                OPEN FULL PAGE →
              </button>
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {RULE_SECTIONS.map((sec, i) => (
                <CollapsibleRule key={i} section={sec} defaultOpen={i === 0} />
              ))}
            </div>
            <div className="sd-scroll-hint" style={{ display: 'none', textAlign: 'center', padding: '16px 0 0', color: '#3a5878', fontSize: 11, letterSpacing: '2px', animation: 'bounce 2s infinite' }}>
              ↓ MORE BELOW
            </div>
          </div>
        </div>
      </section>

      <footer style={S.footer}>
        SERVER {server.server_number} · {server.name.toUpperCase()} · AUTHORIZED USE ONLY
      </footer>

      {/* Auth modal */}
      {authView && (
        <div style={S.overlay} onClick={() => setAuthView(null)}>
          <div style={S.modal} className="modal-inner" onClick={e => e.stopPropagation()}>
            <div style={S.modalTitle}>🔐 LOGIN</div>

            <form onSubmit={handleUnifiedLogin}>
              <Field label="USERNAME" value={authForm.username} onChange={v => setAuthForm(f => ({ ...f, username: v }))} />
              <Field label="PASSWORD" type="password" value={authForm.password} onChange={v => setAuthForm(f => ({ ...f, password: v }))} />
              <p style={{ color: '#3a5878', fontSize: 11, marginTop: -8, marginBottom: 14 }}>
                Forgot your password? Contact your alliance owner or server admin.
              </p>
              {authError && <p style={S.error}>{authError}</p>}
              <button type="submit" style={S.modalBtn} disabled={authBusy}>{authBusy ? 'CHECKING…' : 'LOGIN →'}</button>
            </form>

          </div>
        </div>
      )}

      {/* Floating Tools button + slide-in panel */}
      <ToolsPanel
        serverId={serverId}
        navigate={navigate}
        session={activeSession}
        role={role}
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');
        @keyframes bounce { 0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(5px);opacity:1} }
        @media (max-width: 600px) {
          .sd-topbar { padding: 10px 14px !important; flex-wrap: wrap; gap: 8px; }
        }
        @media (max-width: 860px) {
          .sd-cols { flex-direction: column !important; }
          .sd-right { flex: none !important; width: 100% !important; }
          .sd-scroll-hint { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// Rules data mirrored from Rules.jsx so we can embed it inline
const RULE_SECTIONS = [
  {
    title: 'ROLES & PERMISSIONS', color: '#00c8ff',
    items: [
      { h: 'Server Admin', b: 'Manages the server workspace. Creates alliances, manages all members, controls season settings, and handles server handshakes.' },
      { h: 'Alliance Owner (R5)', b: 'Leader of an alliance. Manages roster, promotes officers, sets up train rotations, and shares invite links. Gets in via a one-time Owner Invite from the server admin.' },
      { h: 'Alliance Admin (Officer)', b: 'Up to 10 members per alliance. Can edit member profiles and manage the roster. Joins the same way as regular members via the Member Invite link.' },
      { h: 'Server Helper', b: 'Promoted by the server admin. Can view all members and reassign them between alliances. Cannot change server settings.' },
      { h: 'Member', b: 'Regular player. Joins via the Member Invite link. Logs in with their own username and password. Can view the roster and update their own profile.' },
    ],
  },
  {
    title: 'SERVER STRUCTURE', color: '#3a9bff',
    items: [
      { h: 'Seasons', b: 'Each server runs seasons 1–6. Between seasons the map resets. Season 0 is pre-season / setup. The server admin sets the active season in the Admin Panel.' },
      { h: 'Alliances', b: 'Each server hosts multiple alliances. Every member belongs to exactly one alliance per server.' },
      { h: 'Logging in', b: 'Everyone logs in with a personal username and password. There are no shared passwords. Forgot yours? Ask your Alliance Owner or an Alliance Admin to reset it.' },
    ],
  },
  {
    title: 'THE WAR MAP', color: '#f0a500',
    items: [
      { h: 'Live map', b: 'Shows current territory ownership. Public servers allow anyone to view it; private servers require login.' },
      { h: 'Planning map', b: 'A private per-alliance layer. Use it to mark attack targets and coordinate before committing on the live map.' },
      { h: 'Map sharing', b: 'When two servers set up a handshake, they can share live map and/or plan map data. Each alliance controls their own opt-in.' },
    ],
  },
  {
    title: 'SERVER HANDSHAKES', color: '#c87aff',
    items: [
      { h: 'What is a handshake?', b: 'A mutual agreement between two server admins to share data. One admin generates an invite code and sends it to the other to accept.' },
      { h: 'Sharing caps', b: 'The server admin sets the maximum scope: live map, roster names, or player stats. Alliance Owners decide individually whether to opt in.' },
      { h: 'Revoking access', b: 'Either server admin can revoke a handshake at any time. Shared data immediately disappears from the partner server.' },
    ],
  },
  {
    title: 'MEMBER ACCOUNTS', color: '#00e87a',
    items: [
      { h: 'Registration', b: 'Members join via the Member Invite link. They choose a unique username and password. Passwords are stored as SHA-256 hashes — never plain text.' },
      { h: 'Profile data', b: 'Fill in your squad powers, troop types, garrison, profession, and event availability for Canyon Storm and Desert Storm so leadership can build accurate teams.' },
      { h: 'Password reset', b: 'Ask your Alliance Owner or an Alliance Admin. They can reset it from the MANAGE → ROSTER tab in Alliance HQ.' },
    ],
  },
  {
    title: 'ETIQUETTE & FAIR PLAY', color: '#ff6080',
    items: [
      { h: 'Keep the map accurate', b: 'Update territory ownership promptly after battles. An outdated map misleads your own alliance\'s planning.' },
      { h: 'Handshake trust', b: 'Only establish handshakes with servers you have a genuine agreement with. Sharing your plan map exposes your attack intent.' },
      { h: 'Dispute resolution', b: 'Tile disputes should be resolved in your alliance\'s Discord. This planner is a coordination tool, not an arbitration system.' },
    ],
  },
];

function CollapsibleRule({ section, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ background: 'rgba(13,21,32,0.85)', border: `1px solid ${open ? section.color + '40' : '#1e3550'}`, transition: 'border-color 0.2s' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '2px', color: section.color }}>
          {section.title}
        </span>
        <ChevronDown size={14} style={{ color: '#3a5878', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {section.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 4, height: 4, background: section.color + '80', borderRadius: '50%', flexShrink: 0, marginTop: 8 }} />
              <div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, color: '#d0e4f4', marginBottom: 2 }}>{item.h}</div>
                <div style={{ fontSize: 13, color: '#8aabc8', lineHeight: 1.6 }}>{item.b}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '3px', color: '#3a5878', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
      {children}
      <div style={{ flex: 1, height: 1, background: '#1e3550' }} />
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
      'When you create an alliance, two invite links are generated: an OWNER invite (one-time) and a MEMBER invite (reusable).',
      'Send the OWNER INVITE link to each alliance\'s R5 leader. They click it, create an account, and automatically get owner access.',
      'To invite players: the owner shares the MEMBER INVITE link from Alliance HQ → Settings with their members.',
      'Players self-register via the invite link — no manual entry needed.',
      'Everyone logs in with just username + password using the LOGIN button.',
    ],
  },
  owner: {
    label: '👑 ALLIANCE OWNER QUICK START',
    color: '#f0a500',
    steps: [
      'Go to Alliance HQ to manage your roster — you\'re already logged in.',
      'In the SETTINGS tab, copy your MEMBER INVITE link and share it with your players.',
      'Players click the link, register a username and password, and appear in your ROSTER automatically.',
      'Promote up to 10 trusted members to Alliance Admin in the MANAGE → ADMINS tab.',
      'If a member forgets their password, edit their record in MANAGE → ROSTER to reset it.',
    ],
  },
  helper: {
    label: '🔧 SERVER HELPER QUICK START',
    color: '#00c8ff',
    steps: [
      'You have been promoted to Server Helper by the server admin.',
      'Open the Helper Panel (top-right button) to view all members and reassign them between alliances.',
      'Members are grouped by alliance — use the dropdown next to each member to move them.',
      'You cannot change server settings, create alliances, or manage admin passwords — contact the server admin for those.',
    ],
  },
  member: {
    label: '👤 MEMBER QUICK START',
    color: '#00c8ff',
    steps: [
      'Click ALLIANCE HQ to view your alliance roster and update your profile.',
      'Go to MY PROFILE and fill in your squad powers (in millions), troop types, and event team preferences.',
      'Your Alliance Owner and Alliance Admins use this data to plan Canyon Storm and Desert Storm teams — keep it up to date before each event.',
      'Forgot your password? Ask your Alliance Owner or an Alliance Admin to reset it for you.',
    ],
  },
};

function RoleHelp({ role, serverId, navigate }) {
  const [open, setOpen] = useState(false);
  const help = ROLE_HELP[role];
  if (!help) return null;
  const S = styles;
  return (
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
                {role === 'admin' ? 'OPEN SERVER ADMIN →' : 'OPEN ALLIANCE HQ →'}
              </button>
            )}
          </div>
        )}
      </div>
  );
}

function ToolsPanel({ serverId, navigate, session, role }) {
  const [open, setOpen] = useState(false);

  const tools = [
    { label: 'Alliance HQ', icon: Users, color: '#f0a500', to: `/server/${serverId}/alliance`, locked: !session },
    { label: 'Rules & Guide', icon: BookOpen, color: '#00e87a', to: `/server/${serverId}/rules`, locked: false },
    ...(role === 'admin' || role === 'helper'
      ? [{ label: role === 'helper' ? 'Helper Panel' : 'Server Admin', icon: Shield, color: '#00c8ff', to: `/server/${serverId}/admin`, locked: false }]
      : []),
  ];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)' }}
        />
      )}

      {/* Slide-in panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 95,
        width: 280, background: '#0a1220', borderLeft: '1px solid rgba(0,200,255,0.25)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: open ? '-8px 0 40px rgba(0,0,0,0.6)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e3550' }}>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '3px', color: '#f0a500' }}>TOOLS</div>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, fontFamily: 'monospace' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
          {tools.map(t => {
            const Icon = t.icon;
            return (
              <div
                key={t.label}
                onClick={() => { if (!t.locked) { navigate(t.to); setOpen(false); } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', marginBottom: 10,
                  background: 'rgba(13,21,32,0.8)', border: `1px solid ${t.locked ? '#1e3550' : t.color + '40'}`,
                  cursor: t.locked ? 'default' : 'pointer', transition: 'border-color 0.15s',
                  opacity: t.locked ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!t.locked) e.currentTarget.style.borderColor = t.color; }}
                onMouseLeave={e => { if (!t.locked) e.currentTarget.style.borderColor = t.color + '40'; }}
              >
                <div style={{ width: 40, height: 40, background: t.color + '18', border: `1px solid ${t.color + '40'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.locked ? '#3a5878' : t.color, flexShrink: 0 }}>
                  {t.locked ? <Lock size={18} /> : <Icon size={18} />}
                </div>
                <div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: t.locked ? '#3a5878' : '#d0e4f4' }}>{t.label}</div>
                  {t.locked && <div style={{ fontSize: 9, color: '#3a5878', letterSpacing: '1px', fontFamily: "'Rajdhani',sans-serif" }}>LOGIN REQUIRED</div>}
                </div>
                {!t.locked && <ChevronRight size={14} style={{ marginLeft: 'auto', color: t.color }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 32, right: 0, zIndex: 80,
          background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.5)',
          borderRight: 'none',
          color: '#f0a500', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '2px',
          padding: '10px 14px', cursor: 'pointer', writingMode: 'vertical-rl', textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          boxShadow: '0 0 20px rgba(240,165,0,0.2)',
        }}
        title="Quick tools"
      >
        TOOLS
      </button>
    </>
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
