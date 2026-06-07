import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { generateInviteCode, hashPassword } from '../lib/auth';
import { Copy, Check, Shield, RefreshCw, Search } from 'lucide-react';

const SUPER_PASSWORD = import.meta.env.VITE_SUPERADMIN_PASSWORD;

function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => chars[b % chars.length])
    .join('');
}

function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from(crypto.getRandomValues(new Uint8Array(14)))
    .map(b => chars[b % chars.length])
    .join('');
}

export default function SuperAdmin() {
  const [authed,        setAuthed]        = useState(false);
  const [pwd,           setPwd]           = useState('');
  const [pwdErr,        setPwdErr]        = useState('');
  const [tab,           setTab]           = useState('requests'); // requests | servers

  // Requests state
  const [requests,      setRequests]      = useState([]);
  const [reqLoading,    setReqLoading]    = useState(false);
  const [copied,        setCopied]        = useState(null);
  const [rejectNote,    setRejectNote]    = useState({});
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [rejectOpen,    setRejectOpen]    = useState({});

  // Servers state
  const [servers,       setServers]       = useState([]);
  const [memberCounts,  setMemberCounts]  = useState({});
  const [srvLoading,    setSrvLoading]    = useState(false);
  const [srvSearch,     setSrvSearch]     = useState('');
  const [srvSort,       setSrvSort]       = useState('number'); // number | members | date
  const [resetResult,   setResetResult]   = useState({});
  const [resetBusy,     setResetBusy]     = useState({});
  const [deleteStep,    setDeleteStep]    = useState({}); // { [id]: 0|1|2 }
  const [deleteTyped,   setDeleteTyped]   = useState({});
  const [deleteBusy,    setDeleteBusy]    = useState({});

  function handleLogin(e) {
    e.preventDefault();
    if (!SUPER_PASSWORD) { setPwdErr('VITE_SUPERADMIN_PASSWORD is not set.'); return; }
    if (pwd !== SUPER_PASSWORD) { setPwdErr('Incorrect password.'); return; }
    setAuthed(true);
  }

  useEffect(() => {
    if (!authed) return;
    loadRequests();
    loadServers();
  }, [authed]);

  async function loadRequests() {
    setReqLoading(true);
    const { data } = await supabase
      .from('server_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRequests(data ?? []);
    setReqLoading(false);
  }

  async function loadServers() {
    setSrvLoading(true);
    const [{ data: srvData }, { data: mbData }] = await Promise.all([
      supabase.from('servers').select('id, server_number, name, created_at'),
      supabase.from('members').select('server_id'),
    ]);
    setServers(srvData ?? []);
    const counts = {};
    (mbData ?? []).forEach(m => { counts[m.server_id] = (counts[m.server_id] || 0) + 1; });
    setMemberCounts(counts);
    setSrvLoading(false);
  }

  async function handleDeleteServer(id) {
    setDeleteBusy(b => ({ ...b, [id]: true }));
    await supabase.from('servers').delete().eq('id', id);
    setDeleteBusy(b => ({ ...b, [id]: false }));
    setDeleteStep(s => { const n = { ...s }; delete n[id]; return n; });
    setDeleteTyped(t => { const n = { ...t }; delete n[id]; return n; });
    setResetResult(r => { const n = { ...r }; delete n[id]; return n; });
    loadServers();
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

  async function handleResetPassword(server) {
    setResetBusy(b => ({ ...b, [server.id]: true }));
    const newPwd = generateRandomPassword();
    const hash = await hashPassword(newPwd);
    const { error } = await supabase.from('servers').update({ admin_password: hash }).eq('id', server.id);
    setResetBusy(b => ({ ...b, [server.id]: false }));
    if (error) return;
    setResetResult(r => ({ ...r, [server.id]: { password: newPwd, copied: false } }));
  }

  async function copyText(text, serverId) {
    await navigator.clipboard.writeText(text);
    if (serverId) {
      setResetResult(r => ({ ...r, [serverId]: { ...r[serverId], copied: true } }));
      setTimeout(() => setResetResult(r => ({ ...r, [serverId]: { ...r[serverId], copied: false } })), 2500);
    } else {
      setCopied(text);
      setTimeout(() => setCopied(null), 2500);
    }
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const approved = requests.filter(r => r.status === 'approved');
  const other    = requests.filter(r => r.status !== 'pending' && r.status !== 'approved');

  const filteredServers = servers
    .filter(s =>
      s.server_number.includes(srvSearch) ||
      s.name.toLowerCase().includes(srvSearch.toLowerCase())
    )
    .sort((a, b) => {
      if (srvSort === 'members') return (memberCounts[b.id] || 0) - (memberCounts[a.id] || 0);
      if (srvSort === 'date')    return new Date(b.created_at) - new Date(a.created_at);
      return a.server_number.localeCompare(b.server_number, undefined, { numeric: true });
    });

  const S = styles;

  if (!authed) {
    return (
      <div style={S.root}>
        <div style={S.box}>
          <div style={S.logo}><Shield size={18} style={{ color: '#ff4060' }} /> SUPER ADMIN</div>
          <p style={{ color: '#3a5878', fontSize: 12, marginBottom: 20 }}>
            Restricted access. Platform owner only.
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
      <div style={{ ...S.box, maxWidth: 820 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={S.logo}><Shield size={16} style={{ color: '#ff4060' }} /> SUPER ADMIN</div>
          <button style={S.ghostBtn} onClick={() => { loadRequests(); loadServers(); }}>
            <RefreshCw size={13} /> REFRESH
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            style={{ ...S.tabBtn, ...(tab === 'requests' ? S.tabBtnActive : {}) }}
            onClick={() => setTab('requests')}
          >
            REQUESTS {pending.length > 0 && <span style={S.badge}>{pending.length}</span>}
          </button>
          <button
            style={{ ...S.tabBtn, ...(tab === 'servers' ? S.tabBtnActive : {}) }}
            onClick={() => setTab('servers')}
          >
            SERVERS {servers.length > 0 && <span style={{ ...S.badge, background: 'rgba(0,200,255,0.15)', color: '#00c8ff' }}>{servers.length}</span>}
          </button>
        </div>

        {/* ── REQUESTS TAB ── */}
        {tab === 'requests' && (
          <div>
            {reqLoading && <p style={{ color: '#3a5878', fontSize: 13 }}>Loading…</p>}

            {pending.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={S.sectionHead}>PENDING — {pending.length}</div>
                {pending.map(r => (
                  <div key={r.id} style={{ ...S.card, borderColor: 'rgba(240,165,0,0.25)' }}>
                    <RequestInfo r={r} statusColor="#f0a500" />
                    <div style={{ marginTop: 14 }}>
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

            {approved.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={S.sectionHead}>APPROVED</div>
                {approved.map(r => (
                  <div key={r.id} style={{ ...S.card, borderColor: 'rgba(0,232,122,0.2)' }}>
                    <RequestInfo r={r} statusColor="#00e87a" />
                    <div style={{ marginTop: 14 }}>
                      {r.activation_used ? (
                        <span style={{ color: '#00e87a', fontSize: 12, fontFamily: "'Share Tech Mono',monospace" }}>
                          ✓ Activation used — server created
                        </span>
                      ) : (
                        <>
                          <div style={S.codeLabel}>ACTIVATION CODE — share with requester</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <div style={S.codeBox}>{r.activation_code}</div>
                            <button style={S.copyBtn} onClick={() => copyText(r.activation_code)}>
                              {copied === r.activation_code ? <><Check size={13} /> COPIED</> : <><Copy size={13} /> COPY</>}
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

            {other.length > 0 && (
              <section>
                <div style={S.sectionHead}>HISTORY</div>
                {other.map(r => (
                  <div key={r.id} style={S.card}>
                    <RequestInfo r={r} statusColor={r.status === 'rejected' ? '#ff4060' : '#3a5878'} />
                    {r.rejection_note && (
                      <div style={{ marginTop: 8, color: '#3a5878', fontSize: 12 }}>Note: {r.rejection_note}</div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {!reqLoading && requests.length === 0 && (
              <p style={{ color: '#3a5878', fontSize: 13, textAlign: 'center', padding: 40 }}>
                No requests yet.
              </p>
            )}
          </div>
        )}

        {/* ── SERVERS TAB ── */}
        {tab === 'servers' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#3a5878', pointerEvents: 'none' }} />
                <input
                  placeholder="Search by number or name…"
                  value={srvSearch}
                  onChange={e => setSrvSearch(e.target.value)}
                  style={{ ...S.input, paddingLeft: 34, marginBottom: 0 }}
                />
              </div>
              <select
                value={srvSort}
                onChange={e => setSrvSort(e.target.value)}
                style={{ background: '#0d1520', border: '1px solid #1e3550', color: '#7a9bb8', padding: '10px 12px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, outline: 'none' }}
              >
                <option value="number">Sort: Server #</option>
                <option value="members">Sort: Most Members</option>
                <option value="date">Sort: Newest</option>
              </select>
            </div>

            {srvLoading && <p style={{ color: '#3a5878', fontSize: 13 }}>Loading…</p>}
            {filteredServers.length === 0 && !srvLoading && (
              <p style={{ color: '#3a5878', fontSize: 13, textAlign: 'center', padding: 32 }}>
                {srvSearch ? 'No servers match your search.' : 'No servers yet.'}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredServers.map(s => {
                const result  = resetResult[s.id];
                const busy    = resetBusy[s.id];
                const count   = memberCounts[s.id] || 0;
                const dStep   = deleteStep[s.id] || 0;
                const dTyped  = deleteTyped[s.id] || '';
                const dBusy   = deleteBusy[s.id] || false;
                return (
                  <div key={s.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16, color: '#d0e4f4' }}>
                          Server {s.server_number} — {s.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace", marginTop: 3, display: 'flex', gap: 12 }}>
                          <span>Created {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span style={{ color: count > 0 ? '#00c8ff' : '#3a5878' }}>👥 {count} member{count !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {dStep === 0 && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!result && (
                            <button style={S.resetBtn} onClick={() => handleResetPassword(s)} disabled={busy}>
                              {busy ? 'RESETTING…' : 'RESET PWD'}
                            </button>
                          )}
                          <button style={S.deleteBtn} onClick={() => setDeleteStep(d => ({ ...d, [s.id]: 1 }))}>
                            DELETE
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Password reset result */}
                    {result && dStep === 0 && (
                      <div style={{ marginTop: 12, background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.2)', padding: '12px 14px' }}>
                        <div style={S.codeLabel}>NEW ADMIN PASSWORD — copy and send to the server admin</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                          <div style={{ ...S.codeBox, fontSize: 15, letterSpacing: '3px', padding: '8px 14px' }}>
                            {result.password}
                          </div>
                          <button style={S.copyBtn} onClick={() => copyText(result.password, s.id)}>
                            {result.copied ? <><Check size={13} /> COPIED</> : <><Copy size={13} /> COPY</>}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button style={S.ghostBtn} onClick={() => handleResetPassword(s)}>GENERATE ANOTHER</button>
                          <button style={{ ...S.ghostBtn, color: '#ff4060', borderColor: 'rgba(255,64,96,0.3)' }}
                            onClick={() => setResetResult(r => { const n = { ...r }; delete n[s.id]; return n; })}>
                            DISMISS
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delete flow */}
                    {dStep === 1 && (
                      <div style={{ marginTop: 12, background: 'rgba(255,64,96,0.04)', border: '1px solid rgba(255,64,96,0.2)', padding: '12px 14px' }}>
                        <p style={{ color: '#ff4060', fontSize: 13, marginBottom: 10 }}>
                          This will permanently delete <strong>Server {s.server_number}</strong> and all its alliances, members, and data. This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={S.rejectBtn} onClick={() => setDeleteStep(d => ({ ...d, [s.id]: 2 }))}>YES, CONTINUE</button>
                          <button style={S.ghostBtn} onClick={() => setDeleteStep(d => ({ ...d, [s.id]: 0 }))}>CANCEL</button>
                        </div>
                      </div>
                    )}
                    {dStep === 2 && (
                      <div style={{ marginTop: 12, background: 'rgba(255,64,96,0.04)', border: '1px solid rgba(255,64,96,0.3)', padding: '12px 14px' }}>
                        <p style={{ color: '#ff4060', fontSize: 12, marginBottom: 8 }}>
                          Type <strong style={{ fontFamily: "'Share Tech Mono',monospace" }}>DELETE</strong> to confirm.
                        </p>
                        <input
                          value={dTyped}
                          onChange={e => setDeleteTyped(t => ({ ...t, [s.id]: e.target.value }))}
                          placeholder="Type DELETE"
                          style={{ ...S.input, marginBottom: 10, maxWidth: 200, borderColor: 'rgba(255,64,96,0.4)' }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            style={{ ...S.rejectBtn, background: dTyped === 'DELETE' ? '#ff4060' : 'rgba(255,64,96,0.07)', color: '#fff', opacity: dBusy ? 0.6 : 1 }}
                            disabled={dTyped !== 'DELETE' || dBusy}
                            onClick={() => handleDeleteServer(s.id)}
                          >
                            {dBusy ? 'DELETING…' : 'PERMANENTLY DELETE →'}
                          </button>
                          <button style={S.ghostBtn} onClick={() => { setDeleteStep(d => ({ ...d, [s.id]: 0 })); setDeleteTyped(t => ({ ...t, [s.id]: '' })); }}>CANCEL</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <style>{FONT}</style>
    </div>
  );
}

function RequestInfo({ r, statusColor }) {
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
  resetBtn:  { background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)', color: '#f0a500', padding: '8px 16px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 },
  deleteBtn: { background: 'rgba(255,64,96,0.07)', border: '1px solid rgba(255,64,96,0.3)', color: '#ff4060', padding: '8px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #1e3550', color: '#3a5878', padding: '8px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1px', cursor: 'pointer' },
  card: { background: 'rgba(8,13,20,0.8)', border: '1px solid #1e3550', padding: '16px', marginBottom: 8 },
  tabBtn: { background: 'none', border: '1px solid #1e3550', color: '#3a5878', padding: '8px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  tabBtnActive: { borderColor: 'rgba(255,64,96,0.4)', color: '#ff4060', background: 'rgba(255,64,96,0.05)' },
  badge: { background: 'rgba(240,165,0,0.2)', color: '#f0a500', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 2 },
  sectionHead: { fontWeight: 700, fontSize: 11, letterSpacing: '2px', color: '#3a5878', marginBottom: 12, borderBottom: '1px solid #1e3550', paddingBottom: 6 },
  codeLabel: { fontSize: 10, letterSpacing: '1.5px', color: '#3a5878', fontWeight: 700, marginBottom: 8 },
  codeBox: { fontFamily: "'Share Tech Mono',monospace", fontSize: 22, letterSpacing: '8px', color: '#00e87a', background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', padding: '10px 18px' },
  copyBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.25)', color: '#00c8ff', padding: '9px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 },
  error: { color: '#ff4060', fontSize: 12, margin: '0 0 10px' },
};
