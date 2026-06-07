import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { generateInviteCode } from '../lib/auth';
import { Copy, Check, Shield, RefreshCw } from 'lucide-react';

const SUPER_PASSWORD = import.meta.env.VITE_SUPERADMIN_PASSWORD;

function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => chars[b % chars.length])
    .join('');
}

export default function SuperAdmin() {
  const [authed,        setAuthed]        = useState(false);
  const [pwd,           setPwd]           = useState('');
  const [pwdErr,        setPwdErr]        = useState('');
  const [requests,      setRequests]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [copied,        setCopied]        = useState(null);
  const [rejectNote,    setRejectNote]    = useState({});
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [rejectOpen,    setRejectOpen]    = useState({});

  function handleLogin(e) {
    e.preventDefault();
    if (!SUPER_PASSWORD) { setPwdErr('VITE_SUPERADMIN_PASSWORD is not set.'); return; }
    if (pwd !== SUPER_PASSWORD) { setPwdErr('Incorrect password.'); return; }
    setAuthed(true);
  }

  useEffect(() => { if (authed) loadRequests(); }, [authed]);

  async function loadRequests() {
    setLoading(true);
    const { data } = await supabase
      .from('server_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRequests(data ?? []);
    setLoading(false);
  }

  async function handleApprove(r) {
    const code = generateActivationCode();
    await supabase.from('server_requests').update({
      status: 'approved',
      activation_code: code,
      reviewed_at: new Date().toISOString(),
    }).eq('id', r.id);
    loadRequests();
  }

  async function handleReject(r) {
    await supabase.from('server_requests').update({
      status: 'rejected',
      rejection_note: rejectNote[r.id] || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', r.id);
    setRejectNote(n => ({ ...n, [r.id]: '' }));
    setRejectOpen(o => ({ ...o, [r.id]: false }));
    loadRequests();
  }

  async function handleRevoke(id) {
    await supabase.from('server_requests').update({
      status: 'revoked',
      activation_code: null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    setRevokeConfirm(null);
    loadRequests();
  }

  async function copyCode(code) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2500);
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const approved = requests.filter(r => r.status === 'approved');
  const other    = requests.filter(r => r.status !== 'pending' && r.status !== 'approved');

  const S = styles;

  if (!authed) {
    return (
      <div style={S.root}>
        <div style={S.box}>
          <div style={S.logo}><Shield size={18} style={{ color: '#ff4060' }} /> SUPER ADMIN</div>
          <p style={{ color: '#3a5878', fontSize: 12, marginBottom: 20 }}>
            Restricted access. This page is for the platform owner only.
          </p>
          <form onSubmit={handleLogin}>
            <div style={S.label}>PASSWORD</div>
            <input
              type="password" value={pwd}
              onChange={e => { setPwd(e.target.value); setPwdErr(''); }}
              style={S.input} placeholder="Super admin password" autoFocus
            />
            {pwdErr && <p style={S.error}>{pwdErr}</p>}
            <button type="submit" style={S.primaryBtn}>ENTER →</button>
          </form>
          {!SUPER_PASSWORD && (
            <p style={{ color: '#f0a500', fontSize: 11, marginTop: 14, lineHeight: 1.6 }}>
              ⚠ Set VITE_SUPERADMIN_PASSWORD in Vercel environment variables and redeploy.
            </p>
          )}
        </div>
        <style>{FONT}</style>
      </div>
    );
  }

  return (
    <div style={{ ...S.root, alignItems: 'flex-start' }}>
      <div style={{ ...S.box, maxWidth: 780 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div style={S.logo}><Shield size={16} style={{ color: '#ff4060' }} /> SERVER REQUESTS</div>
          <button style={S.ghostBtn} onClick={loadRequests}>
            <RefreshCw size={13} /> REFRESH
          </button>
        </div>

        {loading && <p style={{ color: '#3a5878', fontSize: 13 }}>Loading…</p>}

        {/* PENDING */}
        {pending.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={S.sectionHead}>PENDING — {pending.length}</div>
            {pending.map(r => (
              <div key={r.id} style={{ ...S.card, borderColor: 'rgba(240,165,0,0.25)' }}>
                <RequestInfo r={r} statusColor="#f0a500" />
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rejectOpen[r.id] ? (
                    <div>
                      <input
                        placeholder="Rejection reason (optional)"
                        value={rejectNote[r.id] || ''}
                        onChange={e => setRejectNote(n => ({ ...n, [r.id]: e.target.value }))}
                        style={{ ...S.input, fontSize: 12, marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={S.rejectBtn} onClick={() => handleReject(r)}>CONFIRM REJECT</button>
                        <button style={S.ghostBtn} onClick={() => setRejectOpen(o => ({ ...o, [r.id]: false }))}>CANCEL</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={S.approveBtn} onClick={() => handleApprove(r)}>✓ APPROVE</button>
                      <button style={S.rejectBtn} onClick={() => setRejectOpen(o => ({ ...o, [r.id]: true }))}>✕ REJECT</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* APPROVED */}
        {approved.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={S.sectionHead}>APPROVED</div>
            {approved.map(r => (
              <div key={r.id} style={{ ...S.card, borderColor: 'rgba(0,232,122,0.2)' }}>
                <RequestInfo r={r} statusColor="#00e87a" />
                <div style={{ marginTop: 14 }}>
                  {r.activation_used ? (
                    <span style={{ color: '#00e87a', fontSize: 12, fontFamily: "'Share Tech Mono',monospace" }}>
                      ✓ Activation used — server has been created
                    </span>
                  ) : (
                    <>
                      <div style={S.codeLabel}>ACTIVATION CODE — copy and send to requester</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={S.codeBox}>{r.activation_code}</div>
                        <button style={S.copyBtn} onClick={() => copyCode(r.activation_code)}>
                          {copied === r.activation_code
                            ? <><Check size={13} /> COPIED</>
                            : <><Copy size={13} /> COPY</>}
                        </button>
                      </div>
                      {revokeConfirm === r.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#ff4060', fontSize: 11 }}>Revoke this approval?</span>
                          <button style={S.rejectBtn} onClick={() => handleRevoke(r.id)}>YES, REVOKE</button>
                          <button style={S.ghostBtn} onClick={() => setRevokeConfirm(null)}>CANCEL</button>
                        </div>
                      ) : (
                        <button style={S.ghostBtn} onClick={() => setRevokeConfirm(r.id)}>REVOKE APPROVAL</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* REJECTED / REVOKED */}
        {other.length > 0 && (
          <section>
            <div style={S.sectionHead}>HISTORY</div>
            {other.map(r => (
              <div key={r.id} style={S.card}>
                <RequestInfo r={r} statusColor={r.status === 'rejected' ? '#ff4060' : '#3a5878'} />
                {r.rejection_note && (
                  <div style={{ marginTop: 8, color: '#3a5878', fontSize: 12 }}>
                    Note: {r.rejection_note}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {!loading && requests.length === 0 && (
          <p style={{ color: '#3a5878', fontSize: 13, textAlign: 'center', padding: 40 }}>
            No requests yet. They'll appear here when someone submits one.
          </p>
        )}
      </div>
      <style>{FONT}</style>
    </div>
  );
}

function RequestInfo({ r, statusColor }) {
  const S = styles;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 17, color: '#d0e4f4' }}>
          Server {r.server_number} — {r.name}
        </div>
        <div style={{ fontSize: 12, color: '#7a9bb8', marginTop: 3 }}>
          From: <strong style={{ color: '#d0e4f4' }}>{r.contact_name}</strong>
          &nbsp;·&nbsp;
          {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        {r.message && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#7a9bb8', fontStyle: 'italic', borderLeft: '2px solid #1e3550', paddingLeft: 10, lineHeight: 1.6 }}>
            "{r.message}"
          </div>
        )}
      </div>
      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '1.5px', color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}40`, padding: '3px 9px', flexShrink: 0 }}>
        {r.status.toUpperCase()}
      </span>
    </div>
  );
}

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const styles = {
  root: { minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4', backgroundImage: 'linear-gradient(rgba(0,200,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.018) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  box: { width: '100%', maxWidth: 440, background: 'rgba(13,21,32,0.97)', border: '1px solid #1e3550', padding: '32px' },
  logo: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, letterSpacing: '2px', color: '#ff4060', marginBottom: 4 },
  label: { fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6, display: 'block' },
  input: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '10px 12px', fontFamily: "'Rajdhani',sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  primaryBtn: { width: '100%', background: '#ff4060', color: '#fff', border: 'none', padding: '12px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '1.5px', cursor: 'pointer' },
  approveBtn: { background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.35)', color: '#00e87a', padding: '8px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  rejectBtn: { background: 'rgba(255,64,96,0.07)', border: '1px solid rgba(255,64,96,0.35)', color: '#ff4060', padding: '8px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #1e3550', color: '#3a5878', padding: '8px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  card: { background: 'rgba(8,13,20,0.8)', border: '1px solid #1e3550', padding: '16px', marginBottom: 10 },
  sectionHead: { fontWeight: 700, fontSize: 11, letterSpacing: '2px', color: '#3a5878', marginBottom: 12, borderBottom: '1px solid #1e3550', paddingBottom: 6 },
  codeLabel: { fontSize: 10, letterSpacing: '1.5px', color: '#3a5878', fontWeight: 700, marginBottom: 8 },
  codeBox: { fontFamily: "'Share Tech Mono',monospace", fontSize: 22, letterSpacing: '8px', color: '#00e87a', background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', padding: '10px 18px' },
  copyBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', padding: '9px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 },
  error: { color: '#ff4060', fontSize: 12, margin: '0 0 10px' },
};
