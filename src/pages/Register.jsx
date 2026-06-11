import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { hashPassword } from '../lib/auth';
import { Zap, Shield, CheckCircle, Eye, EyeOff } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

export default function Register() {
  const { serverId, allianceId } = useParams();
  const navigate                 = useNavigate();
  const [searchParams]           = useSearchParams();
  const isOwnerInvite            = searchParams.get('role') === 'owner';
  const ownerCode                = searchParams.get('ownerCode');
  const { session, login }       = useAuth();
  const [server,   setServer]   = useState(null);
  const [alliance, setAlliance] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [step,     setStep]     = useState('form'); // form | success

  const [form, setForm] = useState({
    username:        '',
    password:        '',
    confirmPassword: '',
    inGameName:      '',
  });
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);


  useEffect(() => {
    async function load() {
      const [{ data: srv }, { data: al }] = await Promise.all([
        supabase.from('servers').select('id, server_number, name').eq('id', serverId).single(),
        supabase.from('alliances').select('id, name, color, tag').eq('id', allianceId).eq('server_id', serverId).single(),
      ]);
      if (!srv || !al) { navigate('/'); return; }
      setServer(srv);
      setAlliance(al);
      setLoading(false);
    }
    load();
  }, [serverId, allianceId, navigate]);

  // Already logged in to this server → just go to dashboard
  useEffect(() => {
    if (session?.serverId === serverId) navigate(`/server/${serverId}`);
  }, [session, serverId, navigate]);

  async function handleRegister(e) {
    e.preventDefault();
    setError('');

    if (!form.username.trim())        { setError('Username is required.'); return; }
    if (form.username.length < 3)     { setError('Username must be at least 3 characters.'); return; }
    if (!form.password)               { setError('Password is required.'); return; }
    if (form.password.length < 4)     { setError('Password must be at least 4 characters.'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }

    setBusy(true);

    // Check username not already taken on this server
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('server_id', serverId)
      .eq('username', form.username.trim())
      .single();

    if (existing) { setError('That username is already taken on this server.'); setBusy(false); return; }

    const hash = await hashPassword(form.password);
    const insertData = {
      server_id:    serverId,
      alliance_id:  allianceId,
      username:     form.username.trim(),
      password:     hash,
      in_game_name: form.inGameName.trim() || form.username.trim(),
    };
    if (isOwnerInvite) insertData.alliance_role = 'owner';

    const { data: member, error: err } = await supabase.from('members').insert(insertData).select().single();

    if (err) { setError(err.message); setBusy(false); return; }

    // Burn the owner invite code (one-time use)
    if (isOwnerInvite && ownerCode) {
      await supabase.from('alliances').update({ owner_invite_code: null }).eq('owner_invite_code', ownerCode);
    }

    // Auto-login
    login({
      serverId,
      serverName:   server.name,
      role:         'member',
      allianceId,
      allianceName: alliance.name,
      memberId:     member.id,
      username:     member.username,
      allianceRole: isOwnerInvite ? 'owner' : 'member',
    });

    setStep('success');
    setBusy(false);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>
      Loading…
    </div>
  );

  const S = styles;

  return (
    <div style={S.root}>
      <ParticleBackground />
      <div style={S.gridBg} />

      <div style={S.center}>
        {step === 'form' ? (
          <>
            {/* Header */}
            <div style={S.serverBadge}>
              <Zap size={10} fill="currentColor" />
              SERVER {server.server_number} — {server.name.toUpperCase()}
              <Zap size={10} fill="currentColor" />
            </div>

            <h1 style={S.title}>{isOwnerInvite ? 'JOIN AS OWNER' : 'JOIN ALLIANCE'}</h1>

            {/* Alliance card */}
            <div style={{ ...S.allianceCard, borderColor: alliance.color }}>
              <div style={{ ...S.allianceDot, background: alliance.color }} />
              <div>
                <div style={S.allianceName}>{alliance.name}</div>
                {alliance.tag && <div style={S.allianceTag}>{alliance.tag}</div>}
              </div>
              <div style={{ ...S.invitedBadge, color: alliance.color, borderColor: alliance.color, background: `${alliance.color}18` }}>
                INVITED
              </div>
            </div>

            <p style={S.sub}>{isOwnerInvite ? 'Create your Alliance Owner account. Your username and password are how you\'ll log in from now on — choose something you\'ll remember.' : 'Create your account to join. Your username must be unique on this server.'}</p>

            <form style={S.form} onSubmit={handleRegister}>
              <Field
                label="USERNAME"
                placeholder="Your unique login name"
                value={form.username}
                onChange={v => setForm(f => ({ ...f, username: v }))}
              />
              <Field
                label="IN-GAME NAME (optional)"
                placeholder="Your name as it appears in Last War"
                value={form.inGameName}
                onChange={v => setForm(f => ({ ...f, inGameName: v }))}
              />
              <div style={S.row2} className="reg-row2">
                <Field
                  label="PASSWORD"
                  type="password"
                  placeholder="Min 4 characters"
                  value={form.password}
                  onChange={v => setForm(f => ({ ...f, password: v }))}
                />
                <Field
                  label="CONFIRM PASSWORD"
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={v => setForm(f => ({ ...f, confirmPassword: v }))}
                />
              </div>
              {error && <p style={S.error}>{error}</p>}
              <button type="submit" style={{ ...S.btn, background: alliance.color }} disabled={busy}>
                {busy ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT & JOIN →'}
              </button>
            </form>

            <button style={S.backLink} onClick={() => navigate(`/server/${serverId}`)}>
              Already have an account? Log in instead
            </button>
          </>
        ) : (
          /* Success screen */
          <div style={S.successCard}>
            <CheckCircle size={48} style={{ color: '#00e87a', marginBottom: 16 }} />
            <div style={S.successTitle}>WELCOME TO {alliance.name.toUpperCase()}!</div>
            <p style={S.successSub}>
              Your account <strong style={{ color: '#d0e4f4' }}>{form.username}</strong> has been created
              and you're now logged in as {isOwnerInvite ? <><strong style={{ color: '#f0a500' }}>Alliance Owner</strong> of</> : 'a member of'} <strong style={{ color: alliance.color }}>{alliance.name}</strong>.
            </p>
            <button
              style={{ ...S.btn, background: '#00c8ff', marginTop: 8 }}
              onClick={() => navigate(`/server/${serverId}`)}
            >
              GO TO SERVER DASHBOARD →
            </button>
          </div>
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`}</style>
    </div>
  );
}

function Field({ label, placeholder = '', type = 'text', value, onChange }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550',
            color: '#d0e4f4', padding: '10px 14px', paddingRight: isPassword ? 40 : 14,
            fontFamily: "'Rajdhani',sans-serif", fontSize: 15, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
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

const styles = {
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 24px 40px', position: 'relative', overflowY: 'auto' },
  canvas: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' },
  gridBg: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  center: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 480 },
  serverBadge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', padding: '5px 16px', color: '#00c8ff', fontWeight: 700, fontSize: 11, letterSpacing: '2px', marginBottom: 20 },
  title: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 'clamp(32px,7vw,56px)', color: '#fff', letterSpacing: '-1px', margin: '0 0 20px', textShadow: '0 0 40px rgba(0,200,255,0.3)' },
  allianceCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(13,21,32,0.9)', border: '1px solid', padding: '14px 18px', marginBottom: 20 },
  allianceDot: { width: 16, height: 16, borderRadius: '50%', flexShrink: 0 },
  allianceName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: '#d0e4f4' },
  allianceTag: { fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: '#7a9bb8', marginTop: 2 },
  invitedBadge: { marginLeft: 'auto', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '2px', border: '1px solid', padding: '3px 10px', flexShrink: 0 },
  sub: { color: '#7a9bb8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 },
  form: { background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3550', padding: '24px' },
  row2: { display: 'flex', gap: 12 },
  btn: { width: '100%', color: '#080d14', border: 'none', padding: '13px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px', cursor: 'pointer', marginTop: 4 },
  error: { color: '#ff4060', fontSize: 12, margin: '0 0 10px' },
  backLink: { display: 'block', textAlign: 'center', marginTop: 16, background: 'none', border: 'none', color: '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontSize: 12, cursor: 'pointer', textDecoration: 'underline' },
  successCard: { background: 'rgba(13,21,32,0.9)', border: '1px solid rgba(0,232,122,0.3)', padding: '40px', textAlign: 'center' },
  successTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 24, color: '#00e87a', letterSpacing: '2px', marginBottom: 16 },
  successSub: { color: '#7a9bb8', fontSize: 14, lineHeight: 1.7, marginBottom: 8 },
};
