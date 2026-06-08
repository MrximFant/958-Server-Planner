import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { hashPassword, generateInviteCode } from '../lib/auth';
import { Server, Plus, LogIn, Zap, Key, Eye, EyeOff, ChevronDown, ChevronUp, Info } from 'lucide-react';

const DISCORD_WEBHOOK = import.meta.env.VITE_DISCORD_WEBHOOK;
const DISCORD_INVITE  = import.meta.env.VITE_DISCORD_INVITE;

const SEASON_LABELS = {
  0: 'Pre-Season',
  1: 'Season 1', 2: 'Season 2', 3: 'Season 3',
  4: 'Season 4',  5: 'Season 5',  6: 'Season 6',
};

async function sendDiscordNotification(r) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '📋 New Server Request',
          color: 0xf0a500,
          fields: [
            { name: 'Server Number', value: r.server_number, inline: true },
            { name: 'Workspace Name', value: r.name, inline: true },
            { name: 'Contact (Discord)', value: r.contact_name, inline: true },
            { name: 'Message', value: r.message || '—' },
          ],
          footer: { text: 'Review at /superadmin' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (_) { /* non-critical */ }
}

export default function ServerSelect() {
  const navigate  = useNavigate();
  const canvasRef = useRef(null);
  const [servers,  setServers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState('list'); // list | request | activate | how

  // Request form
  const [reqForm,    setReqForm]    = useState({ serverNumber: '', name: '', contactName: '', message: '' });
  const [reqBusy,    setReqBusy]    = useState(false);
  const [reqError,   setReqError]   = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);

  // Activate form
  const [actCode,    setActCode]    = useState('');
  const [actPwd,     setActPwd]     = useState('');
  const [actConfirm, setActConfirm] = useState('');
  const [actBusy,    setActBusy]    = useState(false);
  const [actError,   setActError]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);

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
    supabase
      .from('servers')
      .select('id, server_number, name, current_season, created_at')
      .order('server_number', { ascending: true })
      .then(({ data }) => { setServers(data ?? []); setLoading(false); });
  }, []);

  async function handleRequest(e) {
    e.preventDefault();
    setReqError('');
    const { serverNumber, name, contactName } = reqForm;
    if (!serverNumber.trim() || !name.trim() || !contactName.trim()) {
      setReqError('Server number, workspace name, and your Discord handle are required.'); return;
    }
    setReqBusy(true);
    const { data, error } = await supabase.from('server_requests').insert({
      server_number: serverNumber.trim(),
      name:          name.trim(),
      contact_name:  contactName.trim(),
      message:       reqForm.message.trim() || null,
    }).select().single();
    if (error) { setReqError(error.message); setReqBusy(false); return; }
    await sendDiscordNotification(data);
    setReqBusy(false);
    setReqSuccess(true);
  }

  async function handleActivate(e) {
    e.preventDefault();
    setActError('');
    const code = actCode.trim().toUpperCase();
    if (!code) { setActError('Enter your activation code.'); return; }
    if (!actPwd.trim()) { setActError('Set an admin password.'); return; }
    if (actPwd !== actConfirm) { setActError('Passwords do not match.'); return; }

    setActBusy(true);

    const { data: req, error: fetchErr } = await supabase
      .from('server_requests')
      .select('*')
      .eq('activation_code', code)
      .single();

    if (fetchErr || !req) {
      setActError('Activation code not found.'); setActBusy(false); return;
    }
    if (req.status !== 'approved') {
      setActError(`This request has status: ${req.status}. Contact the platform admin.`); setActBusy(false); return;
    }
    if (req.activation_used) {
      setActError('This activation code has already been used.'); setActBusy(false); return;
    }

    const hash = await hashPassword(actPwd);
    const { data: server, error: createErr } = await supabase.from('servers').insert({
      server_number:  req.server_number,
      name:           req.name,
      admin_password: hash,
      invite_code:    generateInviteCode(),
    }).select().single();

    if (createErr) { setActError(createErr.message); setActBusy(false); return; }

    await supabase.from('server_requests').update({ activation_used: true }).eq('id', req.id);

    setActBusy(false);
    navigate(`/server/${server.id}`);
  }

  const S = styles;

  return (
    <div style={S.root}>
      <canvas ref={canvasRef} style={S.canvas} />
      <div style={S.grid} />

      <div style={S.center}>
        <div style={S.badge}>
          <Zap size={10} fill="currentColor" />
          LAST WAR ALLIANCE PLANNER
          <Zap size={10} fill="currentColor" />
        </div>
        <h1 style={S.title}>SELECT SERVER</h1>
        <p style={S.sub}>Choose your game server workspace or set up a new one.</p>

        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(view === 'list'     ? S.tabActive : {}) }} onClick={() => setView('list')}>
            <LogIn size={14} /> SERVERS
          </button>
          <button style={{ ...S.tab, ...(view === 'how'      ? S.tabActive : {}) }} onClick={() => setView('how')}>
            <Info size={14} /> HOW IT WORKS
          </button>
          <button style={{ ...S.tab, ...(view === 'request'  ? S.tabActive : {}) }} onClick={() => { setView('request'); setReqSuccess(false); setReqError(''); }}>
            <Plus size={14} /> REQUEST ACCESS
          </button>
          <button style={{ ...S.tab, ...(view === 'activate' ? S.tabActive : {}) }} onClick={() => { setView('activate'); setActError(''); }}>
            <Key size={14} /> ACTIVATE
          </button>
        </div>

        {/* SERVER LIST */}
        {view === 'list' && (
          <div style={S.card}>
            {loading && <p style={S.dim}>Loading servers…</p>}
            {!loading && servers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={S.dim}>No servers yet.</p>
                <button style={{ ...S.btn, marginTop: 12 }} onClick={() => setView('request')}>
                  REQUEST A SERVER →
                </button>
              </div>
            )}
            {servers.map(s => (
              <button key={s.id} style={S.serverRow} onClick={() => navigate(`/server/${s.id}`)}>
                <div style={S.serverIcon}><Server size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={S.serverName}>Server {s.server_number} — {s.name}</div>
                  <div style={S.serverSub}>
                    {SEASON_LABELS[s.current_season ?? 0] ?? `Season ${s.current_season}`}
                    {' · '}
                    Since {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={S.seasonBadge}>
                  S{s.current_season ?? 0}
                </div>
              </button>
            ))}
            {!loading && servers.length > 0 && (
              <p style={{ color: '#3a5878', fontSize: 11, marginTop: 16, textAlign: 'center' }}>
                Click a server to view its dashboard. Log in with your alliance credentials once inside.
              </p>
            )}
          </div>
        )}

        {/* HOW IT WORKS */}
        {view === 'how' && (
          <div style={S.card}>
            <div style={S.howTitle}>FOR MEMBERS</div>
            <div style={S.howSteps}>
              <HowStep n="1" title="Find your server above" text="Click your server number in the SERVERS list to open its dashboard." />
              <HowStep n="2" title="Log in via your alliance" text="On the server dashboard, select your alliance and log in with your member credentials." />
              <HowStep n="3" title="Join via invite link" text="First time? You need your alliance's invite link — ask your R5 or alliance leader for it." />
            </div>

            <div style={{ ...S.howTitle, marginTop: 24 }}>FOR ALLIANCE LEADERS (R5)</div>
            <div style={S.howSteps}>
              <HowStep n="1" title="Get your server set up" text="A server workspace must be requested and approved first (see REQUEST ACCESS)." />
              <HowStep n="2" title="Create your alliance" text="The server admin creates alliances from the admin panel. You'll receive an alliance invite link." />
              <HowStep n="3" title="Invite your members" text="Share your alliance invite link with your members so they can register and log in." />
            </div>

            <div style={{ ...S.howTitle, marginTop: 24 }}>FOR SERVER ADMINS</div>
            <div style={S.howSteps}>
              <HowStep n="1" title="Request a workspace" text="Submit a request with your Discord handle as your contact name. The platform admin will verify you." />
              <HowStep n="2" title="Activate with your code" text="Once approved, you'll receive an activation code via Discord. Use the ACTIVATE tab to create your server." />
              <HowStep n="3" title="Set up alliances" text="After activation, log into the admin panel at /server/[id]/admin to create alliances and invite R5 leaders." />
            </div>

            <button style={{ ...S.btn, marginTop: 20 }} onClick={() => setView('request')}>
              REQUEST A SERVER →
            </button>
          </div>
        )}

        {/* REQUEST ACCESS */}
        {view === 'request' && (
          <div style={S.card}>
            {reqSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: '#00e87a', marginBottom: 8 }}>REQUEST SUBMITTED</div>
                <p style={{ color: '#7a9bb8', fontSize: 13, lineHeight: 1.6 }}>
                  Your request has been received. The platform admin will review it and send you an activation code via Discord.
                </p>
                {DISCORD_INVITE && (
                  <div style={{ margin: '18px 0', background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.3)', padding: '14px 16px' }}>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1.5px', color: '#8891f2', marginBottom: 8 }}>
                      JOIN DISCORD TO RECEIVE YOUR CODE
                    </div>
                    <p style={{ color: '#7a9bb8', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
                      The activation code will be sent to you via Discord. Join the server and the admin will reach out.
                    </p>
                    <a
                      href={DISCORD_INVITE}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#5865f2', color: '#fff', padding: '9px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '1px', textDecoration: 'none' }}
                    >
                      JOIN DISCORD →
                    </a>
                  </div>
                )}
                <button style={{ ...S.btn, marginTop: 8, background: 'transparent', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)' }}
                  onClick={() => { setView('activate'); setReqSuccess(false); }}>
                  I HAVE MY CODE — ACTIVATE →
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequest}>
                <p style={{ color: '#7a9bb8', fontSize: 12, marginBottom: 6, lineHeight: 1.6 }}>
                  Servers are approved by the platform admin. Fill in your details and your request will be reviewed shortly.
                </p>
                <div style={{ background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.25)', padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#f0a500', lineHeight: 1.6 }}>
                  <strong>Important:</strong> Use your <strong>Discord handle</strong> as your contact name. The platform admin will verify your identity via Discord before approving.
                </div>
                <Field label="SERVER NUMBER" placeholder="e.g. 958"
                  value={reqForm.serverNumber} onChange={v => setReqForm(f => ({ ...f, serverNumber: v }))} />
                <Field label="WORKSPACE NAME" placeholder="e.g. 958 Mastermind"
                  value={reqForm.name} onChange={v => setReqForm(f => ({ ...f, name: v }))} />
                <Field label="YOUR DISCORD HANDLE" placeholder="e.g. YourName#1234 or @yourname"
                  value={reqForm.contactName} onChange={v => setReqForm(f => ({ ...f, contactName: v }))} />
                <div style={{ marginBottom: 16 }}>
                  <div style={S.label}>MESSAGE (optional)</div>
                  <textarea
                    placeholder="Briefly describe your server and why you need a workspace…"
                    value={reqForm.message}
                    onChange={e => setReqForm(f => ({ ...f, message: e.target.value }))}
                    rows={3}
                    style={{ ...S.input, resize: 'vertical', lineHeight: 1.5 }}
                  />
                </div>
                {reqError && <p style={S.error}>{reqError}</p>}
                <button type="submit" style={S.btn} disabled={reqBusy}>
                  {reqBusy ? 'SUBMITTING…' : 'SUBMIT REQUEST →'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ACTIVATE */}
        {view === 'activate' && (
          <form style={S.card} onSubmit={handleActivate}>
            <p style={{ color: '#7a9bb8', fontSize: 12, marginBottom: 18, lineHeight: 1.6 }}>
              Enter the activation code you received from the platform admin, then set your admin password to create your server.
            </p>
            <Field label="ACTIVATION CODE" placeholder="e.g. A3F7K2P9"
              value={actCode} onChange={v => setActCode(v.toUpperCase())}
              style={{ fontFamily: "'Share Tech Mono',monospace", letterSpacing: '4px' }}
            />
            <PwdField label="SET ADMIN PASSWORD" value={actPwd} onChange={setActPwd}
              show={showPwd} onToggle={() => setShowPwd(s => !s)} />
            <PwdField label="CONFIRM PASSWORD" value={actConfirm} onChange={setActConfirm}
              show={showPwd} onToggle={() => setShowPwd(s => !s)} />
            {actError && <p style={S.error}>{actError}</p>}
            <button type="submit" style={S.btn} disabled={actBusy}>
              {actBusy ? 'CREATING…' : 'CREATE SERVER →'}
            </button>
          </form>
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`}</style>
    </div>
  );
}

function HowStep({ n, title, text }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div style={{ width: 24, height: 24, background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', color: '#00c8ff', fontFamily: "'Share Tech Mono',monospace", fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        {n}
      </div>
      <div>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#d0e4f4', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#7a9bb8', lineHeight: 1.6 }}>{text}</div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, type = 'text', value, onChange, style: extraStyle }) {
  const S = styles;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.label}>{label}</div>
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...S.input, ...extraStyle }}
      />
    </div>
  );
}

function PwdField({ label, value, onChange, show, onToggle }) {
  const S = styles;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.label}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value} onChange={e => onChange(e.target.value)}
          style={{ ...S.input, paddingRight: 38 }}
        />
        <button type="button" onClick={onToggle} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: '#3a5878', cursor: 'pointer',
          display: 'flex', alignItems: 'center', padding: 2,
        }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative' },
  canvas: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' },
  grid: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  center: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 540, textAlign: 'center' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', padding: '5px 16px', color: '#00c8ff', fontWeight: 700, fontSize: 11, letterSpacing: '2px', marginBottom: 24 },
  title: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(36px, 8vw, 64px)', color: '#fff', letterSpacing: '-1px', margin: '0 0 8px', textShadow: '0 0 40px rgba(0,200,255,0.4)' },
  sub: { color: '#7a9bb8', fontSize: 14, marginBottom: 32 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', flexWrap: 'wrap' },
  tab: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(13,21,32,0.6)', border: '1px solid #1e3550', color: '#7a9bb8', padding: '8px 18px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.2s' },
  tabActive: { border: '1px solid rgba(0,200,255,0.5)', color: '#00c8ff', background: 'rgba(0,200,255,0.08)' },
  card: { background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3550', padding: '24px', textAlign: 'left' },
  serverRow: { width: '100%', display: 'flex', alignItems: 'center', gap: 16, background: 'transparent', border: 'none', borderBottom: '1px solid #1a2d42', padding: '14px 0', cursor: 'pointer', color: '#d0e4f4', textAlign: 'left' },
  serverIcon: { width: 40, height: 40, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8ff', flexShrink: 0 },
  serverName: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#d0e4f4' },
  serverSub: { fontSize: 11, color: '#3a5878', fontFamily: "'Share Tech Mono', monospace", marginTop: 2 },
  seasonBadge: { background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', color: '#00c8ff', fontFamily: "'Share Tech Mono',monospace", fontSize: 11, padding: '3px 8px', flexShrink: 0 },
  howTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 12 },
  howSteps: { borderLeft: '1px solid #1e3550', paddingLeft: 16 },
  label: { fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 14px', fontFamily: "'Rajdhani', sans-serif", fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', background: '#00c8ff', color: '#080d14', border: 'none', padding: '13px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer', marginTop: 4 },
  error: { color: '#ff4060', fontSize: 12, marginBottom: 8 },
  dim: { color: '#3a5878', fontSize: 13, textAlign: 'center', padding: '16px 0' },
};
