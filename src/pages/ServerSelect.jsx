import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { hashPassword, generateInviteCode } from '../lib/auth';
import { Server, Plus, LogIn, Zap, Key, Eye, EyeOff, ChevronDown, ChevronUp, Info } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

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
  const [servers,  setServers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState('how'); // list | request | activate | how

  // Request form
  const [reqForm,    setReqForm]    = useState({ serverNumber: '', name: '', contactName: '', discordUserId: '', message: '' });
  const [reqBusy,    setReqBusy]    = useState(false);
  const [reqError,   setReqError]   = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);

  // Activate form
  const [actCode,     setActCode]    = useState('');
  const [actUsername, setActUsername] = useState('');
  const [actPwd,      setActPwd]     = useState('');
  const [actConfirm,  setActConfirm] = useState('');
  const [actBusy,     setActBusy]    = useState(false);
  const [actError,    setActError]   = useState('');
  const [showPwd,     setShowPwd]    = useState(false);


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
    const { serverNumber, name, contactName, discordUserId } = reqForm;
    if (!serverNumber.trim() || !name.trim() || !contactName.trim()) {
      setReqError('Server number, workspace name, and your Discord handle are required.'); return;
    }
    setReqBusy(true);
    const { data, error } = await supabase.from('server_requests').insert({
      server_number:   serverNumber.trim(),
      name:            name.trim(),
      contact_name:    contactName.trim(),
      discord_user_id: discordUserId.trim() || null,
      message:         reqForm.message.trim() || null,
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
    if (!actUsername.trim()) { setActError('Enter a username for your admin account.'); return; }
    if (!actPwd.trim()) { setActError('Set a password.'); return; }
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

    // Create admin member account so admin can log in with username+password
    await supabase.from('members').insert({
      server_id:   server.id,
      alliance_id: null,
      username:    actUsername.trim(),
      password:    hash,
      server_role: 'admin',
    });

    await supabase.from('server_requests').update({ activation_used: true }).eq('id', req.id);

    setActBusy(false);
    navigate(`/server/${server.id}`);
  }

  const S = styles;

  return (
    <div style={S.root}>
      <ParticleBackground />
      <div style={S.grid} />

      <div style={S.center} className="ss-center">
        <div style={S.badge}>
          <Zap size={10} fill="currentColor" />
          LAST WAR ALLIANCE PLANNER
          <Zap size={10} fill="currentColor" />
        </div>
        <h1 style={S.title}>SELECT SERVER</h1>
        <p style={S.sub}>Choose your game server workspace or set up a new one.</p>

        <div style={S.tabs} className="ss-tabs">
          <button style={{ ...S.tab, ...(view === 'how' ? S.tabActiveHow : {}) }} className="ss-tab" onClick={() => setView('how')}>
            <Info size={14} /> HOW IT WORKS
          </button>
          <button style={{ ...S.tab, ...(view === 'list' ? S.tabActive : {}) }} className="ss-tab" onClick={() => setView('list')}>
            <LogIn size={14} /> ENTER SERVER
          </button>
          <button style={{ ...S.tab, ...(view === 'request' ? S.tabActive : {}) }} className="ss-tab" onClick={() => { setView('request'); setReqSuccess(false); setReqError(''); }}>
            <Plus size={14} /> REQUEST A SERVER
          </button>
          <button style={{ ...S.tab, ...(view === 'activate' ? S.tabActive : {}) }} className="ss-tab" onClick={() => { setView('activate'); setActError(''); }}>
            <Key size={14} /> ACTIVATE A SERVER
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
                Click your server to open its dashboard, then log in with your username and password.
              </p>
            )}
          </div>
        )}

        {/* HOW IT WORKS */}
        {view === 'how' && (
          <div style={S.cardHow}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: '#f0a500', letterSpacing: '2px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={16} /> HOW IT WORKS
            </div>
            <div style={S.howTitle}>FOR MEMBERS</div>
            <div style={S.howSteps}>
              <HowStep n="1" title="Find your server" text="Click your server number in the list above to open its dashboard." />
              <HowStep n="2" title="Log in" text="Click LOGIN and enter your username and password. First time? You need an invite link — ask your Alliance Owner (R5) for it." />
              <HowStep n="3" title="Register via invite link" text="Click your invite link, choose a username and password, and you're in. You only need to do this once." />
            </div>

            <div style={{ ...S.howTitle, marginTop: 24 }}>FOR ALLIANCE OWNERS (R5)</div>
            <div style={S.howSteps}>
              <HowStep n="1" title="Receive your owner invite" text="Your server admin sends you a one-time Owner Invite link. Click it to create your account — you'll automatically get owner access to your alliance." />
              <HowStep n="2" title="Share your member invite" text="In Alliance HQ → Manage → Settings, copy your Member Invite link and share it with your players so they can register." />
              <HowStep n="3" title="Manage your roster" text="Use Alliance HQ to view your roster, manage your team, set up train rotations, and plan event assignments." />
            </div>

            <div style={{ ...S.howTitle, marginTop: 24 }}>FOR SERVER ADMINS</div>
            <div style={S.howSteps}>
              <HowStep n="1" title="Request a server workspace" text="Fill in the REQUEST A SERVER form with your Discord handle and User ID. The platform admin will review and approve your request." />
              <HowStep n="2" title="Activate your server" text="Once approved, you'll receive an activation code via Discord DM. Use ACTIVATE A SERVER to create your workspace and admin account." />
              <HowStep n="3" title="Set up your alliances" text="In the Admin Panel, create each alliance and send the one-time Owner Invite link to each R5 leader. They register themselves — no shared passwords needed." />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button style={{ ...S.btn, flex: 1 }} onClick={() => setView('list')}>
                ENTER SERVER →
              </button>
              <button style={{ ...S.btn, flex: 1, background: 'transparent', color: '#f0a500', border: '1px solid rgba(240,165,0,0.4)' }} onClick={() => { setView('request'); setReqSuccess(false); }}>
                REQUEST A SERVER →
              </button>
            </div>
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
                  Each server workspace is manually approved by the platform admin. Fill in your details below and you'll receive an activation code via Discord DM once approved — usually within 24 hours.
                </p>
                <div style={{ background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.25)', padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#f0a500', lineHeight: 1.6 }}>
                  <strong>Important:</strong> Your Discord User ID is required so your activation code can be sent to you automatically via Discord DM. Without it, you may need to wait for manual contact.
                </div>
                <Field label="SERVER NUMBER" placeholder="e.g. 958"
                  value={reqForm.serverNumber} onChange={v => setReqForm(f => ({ ...f, serverNumber: v }))} />
                <Field label="WORKSPACE NAME" placeholder="e.g. 958 Mastermind"
                  value={reqForm.name} onChange={v => setReqForm(f => ({ ...f, name: v }))} />
                <Field label="YOUR DISCORD HANDLE" placeholder="e.g. @yourname"
                  value={reqForm.contactName} onChange={v => setReqForm(f => ({ ...f, contactName: v }))} />
                <Field label="YOUR DISCORD USER ID" placeholder="e.g. 123456789012345678"
                  value={reqForm.discordUserId} onChange={v => setReqForm(f => ({ ...f, discordUserId: v }))} />
                <div style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)', padding: '14px 16px', marginBottom: 16, borderRadius: 0 }}>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1.5px', color: '#00c8ff', marginBottom: 10 }}>
                    💡 HOW TO FIND YOUR DISCORD USER ID
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      ['1', 'Open Discord → Settings (gear icon, bottom-left)'],
                      ['2', 'Go to Advanced → turn on Developer Mode'],
                      ['3', 'Click your own username or avatar anywhere → Copy User ID'],
                    ].map(([n, text]) => (
                      <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 22, height: 22, background: 'rgba(0,200,255,0.12)', border: '1px solid rgba(0,200,255,0.3)', color: '#00c8ff', fontFamily: "'Share Tech Mono',monospace", fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
                        <div style={{ fontSize: 13, color: '#7a9bb8', lineHeight: 1.5 }}>{text}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: '#3a5878', lineHeight: 1.5 }}>
                    You can turn Developer Mode off straight after — it only adds a "Copy ID" option to right-click menus and doesn't change anything else.
                  </div>
                </div>
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
              Enter the activation code you received, then create your admin account. You'll use this username and password to log in as server admin.
            </p>
            <Field label="ACTIVATION CODE" placeholder="e.g. A3F7K2P9"
              value={actCode} onChange={v => setActCode(v.toUpperCase())}
              style={{ fontFamily: "'Share Tech Mono',monospace", letterSpacing: '4px' }}
            />
            <Field label="ADMIN USERNAME" placeholder="Your login name (e.g. ServerAdmin958)"
              value={actUsername} onChange={v => setActUsername(v)}
            />
            <PwdField label="SET PASSWORD" value={actPwd} onChange={setActPwd}
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
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '48px 24px 60px', position: 'relative', overflowY: 'auto' },
  grid: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  center: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 540, textAlign: 'center' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', padding: '5px 16px', color: '#00c8ff', fontWeight: 700, fontSize: 11, letterSpacing: '2px', marginBottom: 24 },
  title: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(36px, 8vw, 64px)', color: '#fff', letterSpacing: '-1px', margin: '0 0 8px', textShadow: '0 0 40px rgba(0,200,255,0.4)' },
  sub: { color: '#7a9bb8', fontSize: 14, marginBottom: 32 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', flexWrap: 'wrap' },
  tab: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(13,21,32,0.6)', border: '1px solid #1e3550', color: '#7a9bb8', padding: '8px 18px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.2s' },
  tabActive: { border: '1px solid rgba(0,200,255,0.5)', color: '#00c8ff', background: 'rgba(0,200,255,0.08)' },
  tabActiveHow: { border: '1px solid rgba(240,165,0,0.6)', color: '#f0a500', background: 'rgba(240,165,0,0.1)' },
  card: { background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3550', padding: '24px', textAlign: 'left' },
  cardHow: { background: 'rgba(13,21,32,0.9)', border: '1px solid rgba(240,165,0,0.35)', padding: '24px', textAlign: 'left', boxShadow: '0 0 24px rgba(240,165,0,0.07)' },
  serverRow: { width: '100%', display: 'flex', alignItems: 'center', gap: 16, background: 'transparent', border: 'none', borderBottom: '1px solid #1a2d42', padding: '14px 0', cursor: 'pointer', color: '#d0e4f4', textAlign: 'left' },
  serverIcon: { width: 40, height: 40, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8ff', flexShrink: 0 },
  serverName: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#d0e4f4' },
  serverSub: { fontSize: 11, color: '#3a5878', fontFamily: "'Share Tech Mono', monospace", marginTop: 2 },
  seasonBadge: { background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', color: '#00c8ff', fontFamily: "'Share Tech Mono',monospace", fontSize: 11, padding: '3px 8px', flexShrink: 0 },
  howTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '2px', color: '#f0a500', marginBottom: 12, marginTop: 4, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', padding: '5px 10px', display: 'inline-block' },
  howSteps: { borderLeft: '2px solid rgba(240,165,0,0.2)', paddingLeft: 16, marginBottom: 8 },
  label: { fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 14px', fontFamily: "'Rajdhani', sans-serif", fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', background: '#00c8ff', color: '#080d14', border: 'none', padding: '13px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer', marginTop: 4 },
  error: { color: '#ff4060', fontSize: 12, marginBottom: 8 },
  dim: { color: '#3a5878', fontSize: 13, textAlign: 'center', padding: '16px 0' },
};
