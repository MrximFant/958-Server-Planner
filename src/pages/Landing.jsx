import { useNavigate } from 'react-router-dom';
import { Zap, LogIn, Plus, Key, ChevronRight } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={S.root}>
      <ParticleBackground />
      <div style={S.gridBg} />

      {/* ── TOP BADGE ── */}
      <div style={S.topBadge}>
        <Zap size={10} fill="currentColor" />
        LAST WAR: SURVIVAL — ALLIANCE PLANNER
        <Zap size={10} fill="currentColor" />
      </div>

      {/* ── TITLE BLOCK ── */}
      <div style={S.titleBlock}>
        <h1 style={S.h1}>958</h1>
        <h2 style={S.h2}>MASTERMIND</h2>
        <div style={S.seasonBadge}>
          <Zap size={11} fill="currentColor" />
          SEASON 5 · WILD WEST
          <Zap size={11} fill="currentColor" />
        </div>
      </div>

      {/* ── MAIN CONTENT — two columns ── */}
      <div style={S.body} className="land-body">
        {/* LEFT — always-visible help */}
        <div style={S.helpPanel}>
          <div style={S.helpTitle}>HOW TO GET STARTED</div>

          <HelpSection color="#00c8ff" label="FOR MEMBERS">
            <HelpStep n="1" title="Find your server">
              Click <strong style={{ color: '#d0e4f4' }}>Enter Server</strong> on the right and select your server number from the list.
            </HelpStep>
            <HelpStep n="2" title="Log in">
              On the server page, click <strong style={{ color: '#d0e4f4' }}>LOGIN</strong> and enter the username and password you registered with.
            </HelpStep>
            <HelpStep n="3" title="First time? Get an invite link">
              You need an invite link to create your account. Ask your Alliance Owner (R5) — they can find it in Alliance HQ → Settings.
            </HelpStep>
          </HelpSection>

          <HelpSection color="#f0a500" label="FOR ALLIANCE OWNERS (R5)">
            <HelpStep n="1" title="Accept your owner invite">
              Your server admin will send you a one-time Owner Invite link. Click it to create your account. You automatically receive full owner access to your alliance.
            </HelpStep>
            <HelpStep n="2" title="Invite your members">
              Go to Alliance HQ → Manage → Settings, copy the <strong style={{ color: '#d0e4f4' }}>Member Invite</strong> link and share it with your players. They register themselves — no manual entry needed.
            </HelpStep>
            <HelpStep n="3" title="Manage your alliance">
              Use Alliance HQ to view your roster, set up train rotations, and plan Canyon Storm and Desert Storm event teams.
            </HelpStep>
          </HelpSection>

          <HelpSection color="#00e87a" label="FOR SERVER ADMINS">
            <HelpStep n="1" title="Request a workspace">
              Click <strong style={{ color: '#d0e4f4' }}>Request Server</strong> → fill in your server number, workspace name, and Discord handle. The platform admin will review and approve it — usually within 24 hours.
            </HelpStep>
            <HelpStep n="2" title="Activate your server">
              Once approved, you receive an activation code via Discord. Click <strong style={{ color: '#d0e4f4' }}>Activate Server</strong> and enter the code to create your workspace and admin account.
            </HelpStep>
            <HelpStep n="3" title="Set up alliances">
              In the Admin Panel, create each alliance and send the one-time Owner Invite link to each R5. They register themselves — no shared passwords.
            </HelpStep>
          </HelpSection>
        </div>

        {/* RIGHT — action buttons */}
        <div style={S.btnPanel}>
          <div style={S.btnPanelTitle}>GET STARTED</div>
          <p style={S.btnPanelSub}>
            Choose what you need below. Already have an account? Enter your server and log in directly.
          </p>

          <ActionBtn
            icon={<LogIn size={22} />}
            color="#00c8ff"
            title="Enter Server"
            desc="Find your server and log in with your username and password."
            onClick={() => navigate('/servers?tab=list')}
          />
          <ActionBtn
            icon={<Plus size={22} />}
            color="#f0a500"
            title="Request Server"
            desc="Server admins: submit a request to get your own workspace approved."
            onClick={() => navigate('/servers?tab=request')}
          />
          <ActionBtn
            icon={<Key size={22} />}
            color="#00e87a"
            title="Activate Server"
            desc="Already approved? Enter your activation code to create your workspace."
            onClick={() => navigate('/servers?tab=activate')}
          />

          <div style={S.securityNote}>
            🔒 INVITE ONLY — AUTHORIZED PERSONNEL ONLY
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={S.footer}>
        958 MASTERMIND · SEASON 5: WILD WEST · AUTHORIZED USE ONLY
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@400;600&display=swap');
        .land-body { display: flex; gap: 40px; align-items: flex-start; }
        @media (max-width: 860px) {
          .land-body { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}

function HelpSection({ color, label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'inline-block', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '2px', color, background: `${color}12`, border: `1px solid ${color}35`, padding: '3px 10px', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ borderLeft: `2px solid ${color}30`, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function HelpStep({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ width: 20, height: 20, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', fontFamily: "'Share Tech Mono',monospace", fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        {n}
      </div>
      <div>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#d0e4f4', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#7a9bb8', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, color, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', background: 'rgba(13,21,32,0.85)', border: `1px solid ${color}40`, padding: '18px 20px', cursor: 'pointer', textAlign: 'left', marginBottom: 12, transition: 'all 0.18s', display: 'flex', alignItems: 'center', gap: 16 }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}10`; e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateX(3px)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(13,21,32,0.85)'; e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.transform = 'translateX(0)'; }}
    >
      <div style={{ width: 48, height: 48, background: `${color}12`, border: `1px solid ${color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: '#ffffff', letterSpacing: '0.5px', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#7a9bb8', lineHeight: 1.5 }}>{desc}</div>
      </div>
      <ChevronRight size={18} style={{ color, flexShrink: 0 }} />
    </button>
  );
}

const S = {
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", position: 'relative', overflowX: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px 0' },
  gridBg: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.02) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  topBadge: { position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.2)', padding: '5px 18px', color: '#00c8ff', fontWeight: 700, fontSize: 11, letterSpacing: '2px', marginBottom: 32 },
  titleBlock: { position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 48 },
  h1: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 'clamp(56px,11vw,108px)', lineHeight: 1, color: '#ffffff', letterSpacing: '-2px', textShadow: '0 0 60px rgba(0,200,255,0.45), 0 0 120px rgba(0,200,255,0.15)', margin: '0 0 4px' },
  h2: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 'clamp(22px,4.5vw,44px)', color: '#00c8ff', letterSpacing: '10px', textTransform: 'uppercase', margin: '0 0 20px', textShadow: '0 0 30px rgba(0,200,255,0.5)' },
  seasonBadge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(240,165,0,0.09)', border: '1px solid rgba(240,165,0,0.35)', padding: '7px 22px', fontWeight: 700, fontSize: 13, letterSpacing: '3px', color: '#f0a500' },
  body: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 1100, marginBottom: 60 },
  helpPanel: { flex: '1 1 0', background: 'rgba(13,21,32,0.75)', border: '1px solid #1e3550', padding: '28px 28px 20px' },
  helpTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '3px', color: '#3a5878', marginBottom: 24, paddingBottom: 12, borderBottom: '1px solid #1e3550' },
  btnPanel: { flex: '0 0 380px', display: 'flex', flexDirection: 'column' },
  btnPanelTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '3px', color: '#3a5878', marginBottom: 10, paddingBottom: 12, borderBottom: '1px solid #1e3550' },
  btnPanelSub: { fontSize: 14, color: '#7a9bb8', lineHeight: 1.65, marginBottom: 24, marginTop: 4 },
  securityNote: { marginTop: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#2a4058', letterSpacing: '1px', textAlign: 'center', padding: '10px 0' },
  footer: { position: 'relative', zIndex: 1, width: '100%', borderTop: '1px solid #1e3550', padding: '20px 24px', textAlign: 'center', fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#2a4058', letterSpacing: '2px', marginTop: 'auto' },
};
