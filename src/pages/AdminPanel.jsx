import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { hashPassword, generateInviteCode } from '../lib/auth';
import { Plus, Trash2, Copy, Check, ArrowLeft, Users, Shield, Link, Settings, Edit2, X, Eye, EyeOff } from 'lucide-react';

const TABS = ['ALLIANCES', 'MEMBERS', 'SERVER'];

export default function AdminPanel() {
  const { serverId } = useParams();
  const navigate     = useNavigate();
  const { session }  = useAuth();

  const [tab,        setTab]       = useState('ALLIANCES');
  const [server,     setServer]    = useState(null);
  const [alliances,  setAlliances] = useState([]);
  const [members,    setMembers]   = useState([]);
  const [loading,    setLoading]   = useState(true);

  // Guard — must be admin for this server
  useEffect(() => {
    if (!session || session.serverId !== serverId || session.role !== 'admin') {
      navigate(`/server/${serverId}`);
    }
  }, [session, serverId, navigate]);

  useEffect(() => {
    async function load() {
      const [{ data: srv }, { data: als }, { data: mbs }] = await Promise.all([
        supabase.from('servers').select('*').eq('id', serverId).single(),
        supabase.from('alliances').select('*').eq('server_id', serverId).order('name'),
        supabase.from('members').select('*, alliances(name)').eq('server_id', serverId).order('username'),
      ]);
      setServer(srv);
      setAlliances(als ?? []);
      setMembers(mbs ?? []);
      setLoading(false);
    }
    load();
  }, [serverId]);

  if (loading) return <LoadingScreen />;
  if (!server)  return <LoadingScreen error />;

  const S = styles;

  return (
    <div style={S.root}>
      <div style={S.gridBg} />

      {/* Top bar */}
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={() => navigate(`/server/${serverId}`)}>
          <ArrowLeft size={14} /> BACK TO SERVER
        </button>
        <div style={S.topTitle}>
          <Shield size={14} style={{ color: '#00c8ff' }} />
          ADMIN PANEL — SERVER {server.server_number}
        </div>
      </div>

      <div style={S.layout}>
        {/* Sidebar tabs */}
        <div style={S.sidebar}>
          {TABS.map(t => (
            <button key={t} style={{ ...S.sideTab, ...(tab === t ? S.sideTabActive : {}) }} onClick={() => setTab(t)}>
              {t === 'ALLIANCES' && <Users size={14} />}
              {t === 'MEMBERS'   && <Shield size={14} />}
              {t === 'SERVER'    && <Settings size={14} />}
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={S.content}>
          {tab === 'ALLIANCES' && (
            <AlliancesTab
              serverId={serverId}
              alliances={alliances}
              setAlliances={setAlliances}
            />
          )}
          {tab === 'MEMBERS' && (
            <MembersTab
              members={members}
              setMembers={setMembers}
              alliances={alliances}
              serverId={serverId}
            />
          )}
          {tab === 'SERVER' && (
            <ServerTab server={server} setServer={setServer} serverId={serverId} />
          )}
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`}</style>
    </div>
  );
}

// ── Alliances Tab ─────────────────────────────────────────────
function AlliancesTab({ serverId, alliances, setAlliances }) {
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState({ name: '', tag: '', color: '#00c8ff', ownerPassword: '' });
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(null);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', tag: '', color: '#00c8ff', ownerPassword: '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({ name: a.name, tag: a.tag ?? '', color: a.color, ownerPassword: '' });
    setError('');
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    if (!form.name.trim()) { setError('Name is required.'); setBusy(false); return; }

    if (editing) {
      const update = { name: form.name.trim(), tag: form.tag.trim(), color: form.color };
      if (form.ownerPassword.trim()) update.owner_password = await hashPassword(form.ownerPassword);
      const { error: err } = await supabase.from('alliances').update(update).eq('id', editing.id);
      if (err) { setError(err.message); setBusy(false); return; }
      setAlliances(prev => prev.map(a => a.id === editing.id ? { ...a, ...update } : a));
    } else {
      if (!form.ownerPassword.trim()) { setError('Owner password is required.'); setBusy(false); return; }
      const hash = await hashPassword(form.ownerPassword);
      const { data, error: err } = await supabase.from('alliances').insert({
        server_id: serverId, name: form.name.trim(), tag: form.tag.trim(),
        color: form.color, owner_password: hash, invite_code: generateInviteCode(),
      }).select().single();
      if (err) { setError(err.message); setBusy(false); return; }
      setAlliances(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setShowForm(false); setBusy(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this alliance and all its members?')) return;
    await supabase.from('alliances').delete().eq('id', id);
    setAlliances(prev => prev.filter(a => a.id !== id));
  }

  async function copyInviteLink(code) {
    const url = `${window.location.origin}/join/${code}`;
    await navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const S = styles;

  return (
    <div>
      <div style={S.tabHeader}>
        <div>
          <div style={S.tabTitle}>ALLIANCES</div>
          <div style={S.tabSub}>{alliances.length} alliances on this server</div>
        </div>
        <button style={S.addBtn} onClick={openCreate}><Plus size={14} /> NEW ALLIANCE</button>
      </div>

      {showForm && (
        <form style={S.formCard} onSubmit={handleSave}>
          <div style={S.formTitle}>{editing ? 'EDIT ALLIANCE' : 'CREATE ALLIANCE'}</div>
          <div style={S.formRow}>
            <Field label="NAME" placeholder="e.g. Iron Legion" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <Field label="TAG (optional)" placeholder="e.g. [IL]" value={form.tag} onChange={v => setForm(f => ({ ...f, tag: v }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={S.label}>COLOR</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                style={{ width: 44, height: 36, background: 'none', border: '1px solid #1e3550', cursor: 'pointer', padding: 2 }} />
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#7a9bb8' }}>{form.color}</span>
            </div>
          </div>
          <Field label={editing ? 'NEW OWNER PASSWORD (leave blank to keep)' : 'OWNER PASSWORD'} type="password"
            placeholder={editing ? 'Leave blank to keep current' : 'Share with alliance owner'}
            value={form.ownerPassword} onChange={v => setForm(f => ({ ...f, ownerPassword: v }))} />
          {error && <p style={S.error}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={S.saveBtn} disabled={busy}>{busy ? 'SAVING…' : 'SAVE →'}</button>
            <button type="button" style={S.cancelBtn} onClick={() => setShowForm(false)}>CANCEL</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alliances.length === 0 && <div style={S.empty}>No alliances yet. Create one above.</div>}
        {alliances.map(a => (
          <div key={a.id} style={S.row}>
            <div style={{ ...S.colorDot, background: a.color }} />
            <div style={{ flex: 1 }}>
              <div style={S.rowTitle}>{a.name} {a.tag && <span style={S.tag}>{a.tag}</span>}</div>
              <div style={S.rowSub}>Invite: <span style={{ fontFamily: "'Share Tech Mono',monospace" }}>{window.location.origin}/join/{a.invite_code}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <IconBtn title="Copy invite link" onClick={() => copyInviteLink(a.invite_code)}>
                {copied === a.invite_code ? <Check size={14} style={{ color: '#00e87a' }} /> : <Copy size={14} />}
              </IconBtn>
              <IconBtn title="Edit" onClick={() => openEdit(a)}><Edit2 size={14} /></IconBtn>
              <IconBtn title="Delete" danger onClick={() => handleDelete(a.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────
function MembersTab({ members, setMembers, alliances, serverId }) {
  const [filter, setFilter] = useState('');

  async function handleDelete(id) {
    if (!confirm('Remove this member?')) return;
    await supabase.from('members').delete().eq('id', id);
    setMembers(prev => prev.filter(m => m.id !== id));
  }

  async function handleReassign(memberId, newAllianceId) {
    await supabase.from('members').update({ alliance_id: newAllianceId || null }).eq('id', memberId);
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, alliance_id: newAllianceId, alliances: alliances.find(a => a.id === newAllianceId) }
      : m
    ));
  }

  const filtered = members.filter(m =>
    m.username.toLowerCase().includes(filter.toLowerCase()) ||
    (m.in_game_name ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  const S = styles;

  return (
    <div>
      <div style={S.tabHeader}>
        <div>
          <div style={S.tabTitle}>MEMBERS</div>
          <div style={S.tabSub}>{members.length} members on this server</div>
        </div>
      </div>
      <input
        placeholder="Search by username or in-game name…"
        value={filter} onChange={e => setFilter(e.target.value)}
        style={{ ...S.searchInput, marginBottom: 16 }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 && <div style={S.empty}>No members found.</div>}
        {filtered.map(m => (
          <div key={m.id} style={S.row}>
            <div style={{ flex: 1 }}>
              <div style={S.rowTitle}>
                {m.username}
                {m.in_game_name && m.in_game_name !== m.username &&
                  <span style={S.tag}>{m.in_game_name}</span>}
              </div>
              <div style={S.rowSub}>
                Alliance:&nbsp;
                <select
                  value={m.alliance_id ?? ''}
                  onChange={e => handleReassign(m.id, e.target.value)}
                  style={S.inlineSelect}
                >
                  <option value="">— No alliance —</option>
                  {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <IconBtn title="Remove member" danger onClick={() => handleDelete(m.id)}>
              <Trash2 size={14} />
            </IconBtn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Server Tab ────────────────────────────────────────────────
function ServerTab({ server, setServer, serverId }) {
  const navigate    = useNavigate();
  const { logout }  = useAuth();
  const [copied,    setCopied]    = useState(false);
  const [form,      setForm]      = useState({ newPassword: '', confirmPassword: '' });
  const [busy,      setBusy]      = useState(false);
  const [msg,       setMsg]       = useState('');
  const [error,     setError]     = useState('');

  // Delete server state
  const [deleteStep,    setDeleteStep]    = useState(0); // 0=idle 1=confirm 2=type
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy,    setDeleteBusy]    = useState(false);
  const [deleteError,   setDeleteError]   = useState('');

  async function handleDeleteServer() {
    if (deleteConfirm !== 'DELETE') { setDeleteError('Type DELETE exactly.'); return; }
    setDeleteBusy(true);
    const { error: err } = await supabase.from('servers').delete().eq('id', serverId);
    if (err) { setDeleteError(err.message); setDeleteBusy(false); return; }
    logout();
    navigate('/');
  }

  async function copyServerInvite() {
    const url = `${window.location.origin}/join/${server.invite_code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setError(''); setMsg('');
    if (!form.newPassword.trim()) { setError('Password cannot be empty.'); return; }
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const hash = await hashPassword(form.newPassword);
    const { error: err } = await supabase.from('servers').update({ admin_password: hash }).eq('id', serverId);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setMsg('Admin password updated.');
    setForm({ newPassword: '', confirmPassword: '' });
  }

  const S = styles;

  return (
    <div>
      <div style={S.tabHeader}>
        <div>
          <div style={S.tabTitle}>SERVER SETTINGS</div>
          <div style={S.tabSub}>Server {server.server_number} — {server.name}</div>
        </div>
      </div>

      {/* Server invite link */}
      <div style={S.settingsCard}>
        <div style={S.settingsLabel}>SERVER INVITE LINK</div>
        <div style={S.settingsSub}>Share this with anyone you want to join this server workspace.</div>
        <div style={S.inviteRow}>
          <div style={S.inviteCode}>{window.location.origin}/join/{server.invite_code}</div>
          <button style={S.copyBtn} onClick={copyServerInvite}>
            {copied ? <><Check size={13} /> COPIED</> : <><Copy size={13} /> COPY</>}
          </button>
        </div>
      </div>

      {/* Change admin password */}
      <div style={S.settingsCard}>
        <div style={S.settingsLabel}>CHANGE ADMIN PASSWORD</div>
        <div style={S.settingsSub}>Update the shared admin password. All admins will need the new password.</div>
        <form onSubmit={handlePasswordChange}>
          <Field label="NEW PASSWORD" type="password" value={form.newPassword} onChange={v => setForm(f => ({ ...f, newPassword: v }))} />
          <Field label="CONFIRM PASSWORD" type="password" value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
          {error && <p style={S.error}>{error}</p>}
          {msg   && <p style={{ color: '#00e87a', fontSize: 12, marginBottom: 8 }}>{msg}</p>}
          <button type="submit" style={S.saveBtn} disabled={busy}>{busy ? 'SAVING…' : 'UPDATE PASSWORD →'}</button>
        </form>
      </div>

      {/* Delete server */}
      <div style={{ ...S.settingsCard, borderColor: 'rgba(255,64,96,0.25)', marginTop: 32 }}>
        <div style={{ ...S.settingsLabel, color: '#ff4060' }}>DANGER ZONE</div>
        <div style={S.settingsSub}>Permanently delete this server and all its data. This cannot be undone.</div>

        {deleteStep === 0 && (
          <button
            style={{ background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.4)', color: '#ff4060', padding: '9px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' }}
            onClick={() => { setDeleteStep(1); setDeleteError(''); }}
          >
            DELETE THIS SERVER
          </button>
        )}

        {deleteStep === 1 && (
          <div>
            <p style={{ color: '#ff4060', fontSize: 13, marginBottom: 16 }}>
              Are you sure? This will delete <strong>all alliances, members, territories and settings</strong> for Server {server.server_number}.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ background: 'rgba(255,64,96,0.12)', border: '1px solid #ff4060', color: '#ff4060', padding: '9px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' }}
                onClick={() => { setDeleteStep(2); setDeleteError(''); setDeleteConfirm(''); }}
              >
                YES, CONTINUE
              </button>
              <button style={S.cancelBtn} onClick={() => setDeleteStep(0)}>CANCEL</button>
            </div>
          </div>
        )}

        {deleteStep === 2 && (
          <div>
            <p style={{ color: '#ff4060', fontSize: 13, marginBottom: 12 }}>
              Type <strong style={{ fontFamily: "'Share Tech Mono',monospace" }}>DELETE</strong> to confirm permanent deletion.
            </p>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE here"
              style={{ ...S.input, marginBottom: 12, borderColor: 'rgba(255,64,96,0.4)', maxWidth: 280 }}
            />
            {deleteError && <p style={S.error}>{deleteError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ background: '#ff4060', color: '#fff', border: 'none', padding: '9px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: deleteBusy ? 'default' : 'pointer', opacity: deleteBusy ? 0.6 : 1 }}
                onClick={handleDeleteServer}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'DELETING…' : 'PERMANENTLY DELETE →'}
              </button>
              <button style={S.cancelBtn} onClick={() => { setDeleteStep(0); setDeleteConfirm(''); setDeleteError(''); }}>CANCEL</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────
function Field({ label, placeholder = '', type = 'text', value, onChange }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <div style={styles.label}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...styles.input, paddingRight: isPassword ? 38 : undefined }}
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

function IconBtn({ children, onClick, title, danger }) {
  return (
    <button title={title} onClick={onClick} style={{
      background: 'none', border: '1px solid #1e3550', color: danger ? '#ff4060' : '#7a9bb8',
      width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = danger ? '#ff4060' : '#00c8ff'; e.currentTarget.style.color = danger ? '#ff4060' : '#00c8ff'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e3550'; e.currentTarget.style.color = danger ? '#ff4060' : '#7a9bb8'; }}
    >{children}</button>
  );
}

function LoadingScreen({ error }) {
  return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: error ? '#ff4060' : '#3a5878', fontFamily: 'monospace' }}>
      {error ? 'Server not found.' : 'Loading…'}
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani',sans-serif", position: 'relative' },
  gridBg: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' },
  topbar: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'rgba(8,13,20,0.95)', borderBottom: '1px solid #1e3550' },
  backBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' },
  topTitle: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '2px', color: '#00c8ff' },
  layout: { position: 'relative', zIndex: 1, display: 'flex', minHeight: 'calc(100vh - 56px)' },
  sidebar: { width: 180, borderRight: '1px solid #1e3550', padding: '24px 0', flexShrink: 0 },
  sideTab: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', borderLeft: '3px solid transparent', color: '#7a9bb8', padding: '12px 20px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1.5px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' },
  sideTabActive: { color: '#00c8ff', borderLeftColor: '#00c8ff', background: 'rgba(0,200,255,0.05)' },
  content: { flex: 1, padding: '32px', maxWidth: 800 },
  tabHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  tabTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 22, color: '#d0e4f4', letterSpacing: '1px' },
  tabSub: { fontSize: 12, color: '#3a5878', marginTop: 2 },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.3)', color: '#00c8ff', padding: '8px 16px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 },
  formCard: { background: 'rgba(13,21,32,0.9)', border: '1px solid rgba(0,200,255,0.2)', padding: '20px', marginBottom: 20 },
  formTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#00c8ff', letterSpacing: '2px', marginBottom: 16 },
  formRow: { display: 'flex', gap: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(13,21,32,0.7)', border: '1px solid #1e3550', padding: '12px 16px' },
  colorDot: { width: 14, height: 14, borderRadius: '50%', flexShrink: 0 },
  rowTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: '#d0e4f4', display: 'flex', alignItems: 'center', gap: 8 },
  rowSub: { fontSize: 11, color: '#3a5878', marginTop: 3, fontFamily: "'Share Tech Mono',monospace", wordBreak: 'break-all' },
  tag: { fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#7a9bb8', background: 'rgba(0,200,255,0.06)', border: '1px solid #1e3550', padding: '1px 5px' },
  label: { fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '9px 12px', fontFamily: "'Rajdhani',sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  inlineSelect: { background: '#0d1520', border: '1px solid #1e3550', color: '#7a9bb8', padding: '2px 6px', fontFamily: "'Rajdhani',sans-serif", fontSize: 11, outline: 'none' },
  searchInput: { width: '100%', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', color: '#d0e4f4', padding: '9px 12px', fontFamily: "'Rajdhani',sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  saveBtn: { background: '#00c8ff', color: '#080d14', border: 'none', padding: '10px 24px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '1px', cursor: 'pointer' },
  cancelBtn: { background: 'none', color: '#7a9bb8', border: '1px solid #1e3550', padding: '10px 24px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '1px', cursor: 'pointer' },
  error: { color: '#ff4060', fontSize: 12, margin: '0 0 10px' },
  empty: { color: '#3a5878', fontSize: 13, padding: '24px 0', textAlign: 'center' },
  settingsCard: { background: 'rgba(13,21,32,0.7)', border: '1px solid #1e3550', padding: '20px', marginBottom: 16 },
  settingsLabel: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, color: '#00c8ff', letterSpacing: '2px', marginBottom: 6 },
  settingsSub: { fontSize: 12, color: '#3a5878', marginBottom: 16 },
  inviteRow: { display: 'flex', alignItems: 'center', gap: 10 },
  inviteCode: { flex: 1, fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#7a9bb8', background: 'rgba(0,200,255,0.04)', border: '1px solid #1e3550', padding: '9px 12px', wordBreak: 'break-all' },
  copyBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.3)', color: '#00c8ff', padding: '9px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer', flexShrink: 0 },
};
