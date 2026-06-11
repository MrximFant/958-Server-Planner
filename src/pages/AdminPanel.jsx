import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { hashPassword, generateInviteCode } from '../lib/auth';
import { Plus, Trash2, Copy, Check, ArrowLeft, Users, Shield, Link, Settings, Edit2, X, Eye, EyeOff, GitMerge } from 'lucide-react';

const TABS = ['ALLIANCES', 'MEMBERS', 'HANDSHAKES', 'SERVER'];

export default function AdminPanel() {
  const { serverId } = useParams();
  const navigate     = useNavigate();
  const { session }  = useAuth();

  const isHelper = session?.role === 'helper';
  const [tab,        setTab]       = useState(isHelper ? 'MEMBERS' : 'ALLIANCES');
  const [server,     setServer]    = useState(null);
  const [alliances,  setAlliances] = useState([]);
  const [members,    setMembers]   = useState([]);
  const [loading,    setLoading]   = useState(true);

  // Guard — must be admin or helper for this server
  useEffect(() => {
    if (!session || session.serverId !== serverId || (session.role !== 'admin' && session.role !== 'helper')) {
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
          {isHelper ? 'HELPER PANEL' : 'ADMIN PANEL'} — SERVER {server.server_number}
        </div>
      </div>

      <div style={S.layout} className="ap-layout">
        {/* Sidebar tabs */}
        <div style={S.sidebar} className="ap-sidebar">
          {TABS.filter(t => !isHelper || t === 'MEMBERS').map(t => (
            <button key={t} style={{ ...S.sideTab, ...(tab === t ? S.sideTabActive : {}) }} className="ap-tab" onClick={() => setTab(t)}>
              {t === 'ALLIANCES'  && <Users size={14} />}
              {t === 'MEMBERS'    && <Shield size={14} />}
              {t === 'HANDSHAKES' && <GitMerge size={14} />}
              {t === 'SERVER'     && <Settings size={14} />}
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={S.content} className="ap-content">
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
              isHelper={isHelper}
            />
          )}
          {tab === 'HANDSHAKES' && (
            <HandshakesTab serverId={serverId} serverNumber={server.server_number} />
          )}
          {tab === 'SERVER' && (
            <ServerTab server={server} setServer={setServer} serverId={serverId} />
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');
        @media (max-width: 680px) {
          .ap-layout { flex-direction: column !important; }
          .ap-sidebar { width: 100% !important; border-right: none !important; border-bottom: 1px solid #1e3550; padding: 0 !important; display: flex !important; flex-direction: row !important; overflow-x: auto; }
          .ap-tab { flex-direction: row !important; border-left: none !important; border-bottom: 3px solid transparent; padding: 12px 16px !important; white-space: nowrap; }
          .ap-content { padding: 20px 16px !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

// ── Alliances Tab ─────────────────────────────────────────────
function AlliancesTab({ serverId, alliances, setAlliances }) {
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState({ name: '', tag: '', color: '#00c8ff' });
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(null);
  const [expandedId,      setExpandedId]      = useState(null);
  const [allianceMembers, setAllianceMembers] = useState({});

  function openCreate() {
    setEditing(null);
    setForm({ name: '', tag: '', color: '#00c8ff' });
    setError('');
    setShowForm(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({ name: a.name, tag: a.tag ?? '', color: a.color });
    setError('');
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    if (!form.name.trim()) { setError('Name is required.'); setBusy(false); return; }

    if (editing) {
      const update = { name: form.name.trim(), tag: form.tag.trim(), color: form.color };
      const { error: err } = await supabase.from('alliances').update(update).eq('id', editing.id);
      if (err) { setError(err.message); setBusy(false); return; }
      setAlliances(prev => prev.map(a => a.id === editing.id ? { ...a, ...update } : a));
    } else {
      const { data, error: err } = await supabase.from('alliances').insert({
        server_id: serverId, name: form.name.trim(), tag: form.tag.trim(),
        color: form.color, owner_password: await hashPassword(generateInviteCode()),
        invite_code: generateInviteCode(),
        owner_invite_code: generateInviteCode(),
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

  async function toggleExpand(alId) {
    if (expandedId === alId) { setExpandedId(null); return; }
    setExpandedId(alId);
    if (!allianceMembers[alId]) {
      const { data } = await supabase.from('members')
        .select('id, username, in_game_name, alliance_role, server_role')
        .eq('alliance_id', alId)
        .order('in_game_name');
      setAllianceMembers(prev => ({ ...prev, [alId]: data ?? [] }));
    }
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

      <HelpCard title="HOW ALLIANCES WORK" lines={[
        'Create each alliance here — give it a name, tag, and colour.',
        'Each alliance gets two invite links: an OWNER INVITE (one-time use) for the R5 leader, and a MEMBER INVITE (reusable) for all players.',
        'Send the OWNER INVITE link to your alliance leader. They click it, create an account, and get owner permissions automatically.',
        'The owner then shares the MEMBER INVITE link with their players so they can register and log in.',
        'Everyone — including the owner — logs in with just username + password on the server dashboard.',
        'You can reassign or remove members at any time from the MEMBERS tab.',
      ]} />

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
          <div key={a.id} style={{ border: '1px solid #1e3550' }}>
            <div style={{ ...S.row, border: 'none' }}>
              <div style={{ ...S.colorDot, background: a.color }} />
              <div style={{ flex: 1 }}>
                <div style={S.rowTitle}>{a.name} {a.tag && <span style={S.tag}>{a.tag}</span>}</div>
                {a.owner_invite_code && (
                  <div style={{ ...S.rowSub, color: '#f0a500', marginBottom: 2 }}>
                    👑 Owner invite: <span style={{ fontFamily: "'Share Tech Mono',monospace" }}>{window.location.origin}/join/{a.owner_invite_code}</span>
                    {' '}
                    <button onClick={() => copyInviteLink(a.owner_invite_code)} style={{ background: 'none', border: 'none', color: '#f0a500', cursor: 'pointer', padding: '0 2px', verticalAlign: 'middle' }}>
                      {copied === a.owner_invite_code ? <Check size={11} style={{ color: '#00e87a' }} /> : <Copy size={11} />}
                    </button>
                  </div>
                )}
                <div style={S.rowSub}>
                  👥 Member invite: <span style={{ fontFamily: "'Share Tech Mono',monospace" }}>{window.location.origin}/join/{a.invite_code}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => toggleExpand(a.id)}
                  title={expandedId === a.id ? 'Collapse members' : 'Show members'}
                  style={{
                    background: expandedId === a.id ? 'rgba(0,200,255,0.08)' : 'transparent',
                    border: `1px solid ${expandedId === a.id ? 'rgba(0,200,255,0.3)' : '#1e3550'}`,
                    color: expandedId === a.id ? '#00c8ff' : '#3a5878',
                    padding: '4px 10px',
                    fontFamily: "'Rajdhani',sans-serif",
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '1px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  MEMBERS {expandedId === a.id ? '▲' : '▼'}
                </button>
                <IconBtn title="Copy member invite link" onClick={() => copyInviteLink(a.invite_code)}>
                  {copied === a.invite_code ? <Check size={14} style={{ color: '#00e87a' }} /> : <Copy size={14} />}
                </IconBtn>
                <IconBtn title="Edit" onClick={() => openEdit(a)}><Edit2 size={14} /></IconBtn>
                <IconBtn title="Delete" danger onClick={() => handleDelete(a.id)}><Trash2 size={14} /></IconBtn>
              </div>
            </div>
            {expandedId === a.id && (
              <div style={{ borderTop: '1px solid #1e3550', background: 'rgba(0,0,0,0.2)', padding: '10px 16px' }}>
                {!allianceMembers[a.id] ? (
                  <div style={{ fontSize: 12, color: '#3a5878' }}>Loading…</div>
                ) : allianceMembers[a.id].length === 0 ? (
                  <div style={{ fontSize: 12, color: '#3a5878' }}>No members yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 }}>
                      {allianceMembers[a.id].length} MEMBER{allianceMembers[a.id].length !== 1 ? 'S' : ''}
                    </div>
                    {allianceMembers[a.id].map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(13,21,32,0.5)', border: '1px solid #1e3550' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, color: '#d0e4f4' }}>
                            {m.in_game_name || m.username}
                          </span>
                          {m.in_game_name && m.in_game_name !== m.username && (
                            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5878', marginLeft: 6 }}>@{m.username}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {m.alliance_role === 'alliance_admin' && (
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '1px', color: '#f0a500', border: '1px solid rgba(240,165,0,0.4)', padding: '1px 5px' }}>ADMIN</span>
                          )}
                          {m.server_role === 'helper' && (
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '1px', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.4)', padding: '1px 5px' }}>HELPER</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────
function MembersTab({ members, setMembers, alliances, serverId, isHelper }) {
  const [filter, setFilter] = useState('');

  async function handleReassign(memberId, newAllianceId) {
    await supabase.from('members').update({ alliance_id: newAllianceId || null }).eq('id', memberId);
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, alliance_id: newAllianceId, alliances: alliances.find(a => a.id === newAllianceId) }
      : m
    ));
  }

  async function handleToggleHelper(member) {
    const newRole = member.server_role === 'helper' ? null : 'helper';
    await supabase.from('members').update({ server_role: newRole }).eq('id', member.id);
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, server_role: newRole } : m));
  }

  const filtered = members.filter(m =>
    m.username.toLowerCase().includes(filter.toLowerCase()) ||
    (m.in_game_name ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  // Group by alliance
  const grouped = alliances.map(a => ({
    alliance: a,
    members: filtered.filter(m => m.alliance_id === a.id),
  })).filter(g => g.members.length > 0);
  const unassigned = filtered.filter(m => !m.alliance_id);

  const S = styles;

  return (
    <div>
      <div style={S.tabHeader}>
        <div>
          <div style={S.tabTitle}>MEMBERS</div>
          <div style={S.tabSub}>{members.length} members on this server</div>
        </div>
      </div>

      <div style={{ background: 'rgba(240,165,0,0.05)', border: '1px solid rgba(240,165,0,0.2)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#7a9bb8', lineHeight: 1.6 }}>
        ℹ To remove a member from an alliance, ask their Alliance Owner — only the Alliance Owner and Alliance Admins can delete members from their roster.
        You can reassign a member to a different alliance using the dropdown below, or remove their alliance assignment entirely.
      </div>

      <input
        placeholder="Search by username or in-game name…"
        value={filter} onChange={e => setFilter(e.target.value)}
        style={{ ...S.searchInput, marginBottom: 20 }}
      />

      {filtered.length === 0 && <div style={S.empty}>No members found.</div>}

      {/* Grouped by alliance */}
      {grouped.map(({ alliance, members: allianceMembers }) => (
        <div key={alliance.id} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: alliance.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, color: alliance.color, letterSpacing: '1px' }}>
              {alliance.name}
            </span>
            {alliance.tag && <span style={S.tag}>{alliance.tag}</span>}
            <span style={{ fontSize: 11, color: '#3a5878', marginLeft: 'auto' }}>{allianceMembers.length} members</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allianceMembers.map(m => (
              <MemberRow key={m.id} m={m} alliances={alliances} onReassign={handleReassign} onToggleHelper={handleToggleHelper} isHelper={isHelper} S={S} />
            ))}
          </div>
        </div>
      ))}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#3a5878', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e3550' }}>
            NO ALLIANCE — {unassigned.length} members
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unassigned.map(m => (
              <MemberRow key={m.id} m={m} alliances={alliances} onReassign={handleReassign} onToggleHelper={handleToggleHelper} isHelper={isHelper} S={S} unassigned />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ m, alliances, onReassign, onToggleHelper, isHelper, S, unassigned }) {
  const isServerHelper = m.server_role === 'helper';
  return (
    <div style={S.row}>
      <div style={{ flex: 1 }}>
        <div style={S.rowTitle}>
          {m.in_game_name || m.username}
          {m.in_game_name && m.in_game_name !== m.username && <span style={S.tag}>@{m.username}</span>}
          {m.alliance_role === 'alliance_admin' && <span style={{ ...S.tag, color: '#f0a500', borderColor: 'rgba(240,165,0,0.4)' }}>ALLIANCE ADMIN</span>}
          {isServerHelper && <span style={{ ...S.tag, color: '#00c8ff', borderColor: 'rgba(0,200,255,0.4)' }}>SERVER HELPER</span>}
        </div>
        <div style={S.rowSub}>
          {unassigned ? 'Assign to:' : 'Reassign:'}&nbsp;
          <select value={m.alliance_id ?? ''} onChange={e => onReassign(m.id, e.target.value)} style={S.inlineSelect}>
            <option value="">{unassigned ? '— Select alliance —' : '— No alliance —'}</option>
            {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      {!isHelper && (
        <button
          title={isServerHelper ? 'Remove helper role' : 'Promote to server helper'}
          onClick={() => onToggleHelper(m)}
          style={{
            background: isServerHelper ? 'rgba(0,200,255,0.1)' : 'transparent',
            border: `1px solid ${isServerHelper ? 'rgba(0,200,255,0.4)' : '#1e3550'}`,
            color: isServerHelper ? '#00c8ff' : '#3a5878',
            padding: '4px 10px',
            fontFamily: "'Rajdhani',sans-serif",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '1px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {isServerHelper ? '★ HELPER' : '+ HELPER'}
        </button>
      )}
    </div>
  );
}

const SEASON_LABELS = {
  0: 'Season 0 — Pre-Season / No Active Season',
  1: 'Season 1',
  2: 'Season 2',
  3: 'Season 3',
  4: 'Season 4',
  5: 'Season 5 — Wild West',
  6: 'Season 6',
};

// ── Server Tab ────────────────────────────────────────────────
function ServerTab({ server, setServer, serverId }) {
  const [copied,    setCopied]    = useState(false);
  const [form,      setForm]      = useState({ newPassword: '', confirmPassword: '' });
  const [busy,      setBusy]      = useState(false);
  const [msg,       setMsg]       = useState('');
  const [error,     setError]     = useState('');

  // Season state
  const [season,     setSeason]    = useState(server.current_season ?? 0);
  const [seasonBusy, setSeasonBusy] = useState(false);
  const [seasonMsg,  setSeasonMsg]  = useState('');

  // Public map toggle
  const [publicMap,     setPublicMap]     = useState(server.public_map ?? false);
  const [publicMapBusy, setPublicMapBusy] = useState(false);
  const [publicMapMsg,  setPublicMapMsg]  = useState('');

  async function handlePublicMapToggle(val) {
    setPublicMapBusy(true); setPublicMapMsg('');
    const { error: err } = await supabase.from('servers').update({ public_map: val }).eq('id', serverId);
    setPublicMapBusy(false);
    if (err) { setPublicMapMsg('Error: ' + err.message); return; }
    setPublicMap(val);
    setServer(s => ({ ...s, public_map: val }));
    setPublicMapMsg(val ? 'Map is now publicly visible.' : 'Map is now private.');
    setTimeout(() => setPublicMapMsg(''), 3000);
  }

  async function handleSeasonSave() {
    setSeasonBusy(true); setSeasonMsg('');
    const { error: err } = await supabase.from('servers').update({ current_season: season }).eq('id', serverId);
    setSeasonBusy(false);
    if (err) { setSeasonMsg('Error: ' + err.message); return; }
    setServer(s => ({ ...s, current_season: season }));
    setSeasonMsg('Season updated.');
    setTimeout(() => setSeasonMsg(''), 3000);
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

      <HelpCard title="SERVER SETTINGS GUIDE" lines={[
        'The server invite link takes people directly to this server\'s dashboard — share it so members can find the right server easily.',
        'Set the active season number to match your current in-game season. This controls which fields and map layers are shown.',
        'The Emergency Admin Password is a fallback only. Normally you log in with your admin member account (username + password).',
        'Change the emergency password if you believe it has been compromised — it does not affect member logins.',
        'To delete a server permanently, contact the platform super admin.',
      ]} />

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
        <div style={S.settingsLabel}>EMERGENCY ADMIN PASSWORD</div>
        <div style={S.settingsSub}>This is the fallback password used via the hidden "Emergency Admin Access" option on the login screen. Normally you log in with your admin member account. Change this only if it has been compromised.</div>
        <form onSubmit={handlePasswordChange}>
          <Field label="NEW PASSWORD" type="password" value={form.newPassword} onChange={v => setForm(f => ({ ...f, newPassword: v }))} />
          <Field label="CONFIRM PASSWORD" type="password" value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
          {error && <p style={S.error}>{error}</p>}
          {msg   && <p style={{ color: '#00e87a', fontSize: 12, marginBottom: 8 }}>{msg}</p>}
          <button type="submit" style={S.saveBtn} disabled={busy}>{busy ? 'SAVING…' : 'UPDATE PASSWORD →'}</button>
        </form>
      </div>

      {/* Active season */}
      <div style={S.settingsCard}>
        <div style={S.settingsLabel}>ACTIVE SEASON</div>
        <div style={S.settingsSub}>
          Sets the current season for this server. This controls which map and member fields are shown across all alliances.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={season}
            onChange={e => setSeason(Number(e.target.value))}
            style={{ background: '#0d1520', border: '1px solid #1e3550', color: '#d0e4f4', padding: '9px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, outline: 'none', flex: 1, maxWidth: 360 }}
          >
            {Object.entries(SEASON_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button style={S.saveBtn} onClick={handleSeasonSave} disabled={seasonBusy}>
            {seasonBusy ? 'SAVING…' : 'SAVE →'}
          </button>
        </div>
        {seasonMsg && (
          <p style={{ color: '#00e87a', fontSize: 12, marginTop: 10, marginBottom: 0 }}>{seasonMsg}</p>
        )}
      </div>

      {/* Public map visibility */}
      <div style={S.settingsCard}>
        <div style={S.settingsLabel}>WAR MAP VISIBILITY</div>
        <div style={S.settingsSub}>
          Controls whether the war map is visible to non-logged-in visitors.
          When private, only members logged in to this server can view the map.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => handlePublicMapToggle(false)}
            disabled={publicMapBusy}
            style={{
              padding: '9px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: publicMapBusy ? 'default' : 'pointer',
              background: !publicMap ? 'rgba(255,64,96,0.12)' : 'transparent',
              border: `1px solid ${!publicMap ? 'rgba(255,64,96,0.5)' : '#1e3550'}`,
              color: !publicMap ? '#ff6080' : '#3a5878',
            }}
          >
            🔒 PRIVATE
          </button>
          <button
            onClick={() => handlePublicMapToggle(true)}
            disabled={publicMapBusy}
            style={{
              padding: '9px 18px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: publicMapBusy ? 'default' : 'pointer',
              background: publicMap ? 'rgba(0,200,255,0.08)' : 'transparent',
              border: `1px solid ${publicMap ? 'rgba(0,200,255,0.4)' : '#1e3550'}`,
              color: publicMap ? '#00c8ff' : '#3a5878',
            }}
          >
            🌐 PUBLIC
          </button>
          {publicMapMsg && <span style={{ fontSize: 12, color: '#00e87a' }}>{publicMapMsg}</span>}
        </div>
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

function HelpCard({ title, lines }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'rgba(0,200,255,0.03)', border: '1px solid rgba(0,200,255,0.12)', marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', color: '#3a5878', padding: '10px 14px', cursor: 'pointer', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1.5px', textAlign: 'left' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>ℹ {title}</span>
        <span style={{ fontSize: 10 }}>{open ? '▲ HIDE' : '▼ SHOW'}</span>
      </button>
      {open && (
        <ul style={{ margin: 0, padding: '4px 14px 12px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lines.map((l, i) => (
            <li key={i} style={{ color: '#7a9bb8', fontSize: 12, lineHeight: 1.6 }}>{l}</li>
          ))}
        </ul>
      )}
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

// ── Handshakes Tab ────────────────────────────────────────────
function HandshakesTab({ serverId, serverNumber }) {
  const [handshakes,   setHandshakes]   = useState([]);
  const [servers,      setServers]      = useState({}); // id → server row
  const [loading,      setLoading]      = useState(true);
  const [acceptCode,   setAcceptCode]   = useState('');
  const [acceptBusy,   setAcceptBusy]   = useState(false);
  const [acceptError,  setAcceptError]  = useState('');
  const [acceptMsg,    setAcceptMsg]    = useState('');
  const [initBusy,     setInitBusy]     = useState(false);
  const [newCode,      setNewCode]      = useState('');   // freshly generated code to copy
  const [copied,       setCopied]       = useState(false);
  const [toggleBusy,   setToggleBusy]   = useState(null);

  useEffect(() => {
    async function load() {
      // Load all handshakes where this server is initiator or target
      const { data: hs } = await supabase
        .from('server_handshakes')
        .select('*')
        .or(`initiator_server_id.eq.${serverId},target_server_id.eq.${serverId}`)
        .order('created_at', { ascending: false });

      const rows = hs ?? [];
      setHandshakes(rows);

      // Load partner server details for display
      const partnerIds = [...new Set(rows.map(h =>
        h.initiator_server_id === serverId ? h.target_server_id : h.initiator_server_id
      ).filter(Boolean))];

      if (partnerIds.length > 0) {
        const { data: srvs } = await supabase
          .from('servers')
          .select('id, server_number, name')
          .in('id', partnerIds);
        const lookup = {};
        (srvs ?? []).forEach(s => { lookup[s.id] = s; });
        setServers(lookup);
      }
      setLoading(false);
    }
    load();
  }, [serverId]);

  // Initiate a new handshake — generate code and insert pending row
  async function handleInitiate() {
    setInitBusy(true);
    const code = generateInviteCode();
    const { data, error } = await supabase.from('server_handshakes').insert({
      initiator_server_id: serverId,
      invite_code: code,
      status: 'pending',
      share_map: true,
      share_roster: false,
      share_player_info: false,
    }).select().single();
    setInitBusy(false);
    if (error) return;
    setHandshakes(prev => [data, ...prev]);
    setNewCode(code);
    setCopied(false);
  }

  async function copyCode(code) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  // Accept a handshake sent by another server
  async function handleAccept(e) {
    e.preventDefault();
    setAcceptError(''); setAcceptMsg('');
    const code = acceptCode.trim().toLowerCase();
    if (!code) { setAcceptError('Enter the invite code.'); return; }
    setAcceptBusy(true);

    const { data: hs, error: findErr } = await supabase
      .from('server_handshakes')
      .select('*')
      .eq('invite_code', code)
      .single();

    if (findErr || !hs) { setAcceptError('Code not found.'); setAcceptBusy(false); return; }
    if (hs.status === 'accepted') { setAcceptError('This handshake is already active.'); setAcceptBusy(false); return; }
    if (hs.status === 'revoked')  { setAcceptError('This handshake has been revoked.'); setAcceptBusy(false); return; }
    if (hs.initiator_server_id === serverId) { setAcceptError('You cannot accept your own handshake.'); setAcceptBusy(false); return; }
    if (hs.target_server_id && hs.target_server_id !== serverId) { setAcceptError('This code was already accepted by another server.'); setAcceptBusy(false); return; }

    const { data: updated, error: updErr } = await supabase
      .from('server_handshakes')
      .update({ target_server_id: serverId, status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', hs.id)
      .select().single();

    if (updErr) { setAcceptError(updErr.message); setAcceptBusy(false); return; }

    // Load initiator server details
    const { data: initSrv } = await supabase
      .from('servers').select('id, server_number, name').eq('id', hs.initiator_server_id).single();
    if (initSrv) setServers(prev => ({ ...prev, [initSrv.id]: initSrv }));

    setHandshakes(prev => [updated, ...prev.filter(h => h.id !== updated.id)]);
    setAcceptMsg('Handshake accepted! You are now connected to that server.');
    setAcceptCode('');
    setAcceptBusy(false);
  }

  // Toggle a sharing flag on a handshake
  async function handleToggle(hs, field) {
    setToggleBusy(hs.id + field);
    const newVal = !hs[field];
    const { error } = await supabase.from('server_handshakes').update({ [field]: newVal }).eq('id', hs.id);
    if (!error) setHandshakes(prev => prev.map(h => h.id === hs.id ? { ...h, [field]: newVal } : h));
    setToggleBusy(null);
  }

  // Revoke a handshake
  async function handleRevoke(hsId) {
    if (!confirm('Revoke this handshake? The partner server will lose access to any shared data.')) return;
    await supabase.from('server_handshakes').update({ status: 'revoked' }).eq('id', hsId);
    setHandshakes(prev => prev.map(h => h.id === hsId ? { ...h, status: 'revoked' } : h));
  }

  const S = styles;
  const active  = handshakes.filter(h => h.status === 'accepted');
  const pending = handshakes.filter(h => h.status === 'pending' && h.initiator_server_id === serverId);
  const revoked = handshakes.filter(h => h.status === 'revoked');

  function partnerName(hs) {
    const pid = hs.initiator_server_id === serverId ? hs.target_server_id : hs.initiator_server_id;
    const srv = servers[pid];
    if (!srv) return pid ? `Server (${pid.slice(0, 8)}…)` : '— awaiting acceptance —';
    return `Server ${srv.server_number} — ${srv.name}`;
  }

  return (
    <div>
      <div style={S.tabHeader}>
        <div>
          <div style={S.tabTitle}>SERVER HANDSHAKES</div>
          <div style={S.tabSub}>{active.length} active connection{active.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <HelpCard title="HOW HANDSHAKES WORK" lines={[
        'A handshake is a mutual agreement between two server admins to share data.',
        'To connect: click INITIATE, copy the generated code, and send it to the other server\'s admin via Discord.',
        'The other admin enters the code in their ACCEPT tab to activate the connection.',
        'Once active, you can control what each side shares: live map, planning map, roster names, or player stats.',
        'Either server can revoke the connection at any time.',
        'Alliance leaders can further fine-tune sharing from their Alliance HQ settings once a handshake is active.',
      ]} />

      {/* Initiate new handshake */}
      <div style={S.settingsCard}>
        <div style={S.settingsLabel}>INITIATE HANDSHAKE</div>
        <div style={S.settingsSub}>
          Generate a one-time code to send to another server's admin. They enter it on their side to activate the connection.
        </div>
        <button style={S.saveBtn} onClick={handleInitiate} disabled={initBusy}>
          {initBusy ? 'GENERATING…' : <><GitMerge size={13} style={{ marginRight: 6 }} />GENERATE CODE →</>}
        </button>

        {newCode && (
          <div style={{ marginTop: 16, padding: '14px', background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 8 }}>SHARE THIS CODE WITH THE OTHER SERVER ADMIN</div>
            <div style={S.inviteRow}>
              <div style={{ ...S.inviteCode, letterSpacing: '3px', fontSize: 14, color: '#00c8ff' }}>{newCode}</div>
              <button style={S.copyBtn} onClick={() => copyCode(newCode)}>
                {copied === newCode ? <><Check size={13} /> COPIED</> : <><Copy size={13} /> COPY</>}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#3a5878', marginTop: 8 }}>
              Send this code to the other server's admin via Discord. They enter it in their ACCEPT tab.
            </p>
          </div>
        )}
      </div>

      {/* Accept a handshake */}
      <div style={S.settingsCard}>
        <div style={S.settingsLabel}>ACCEPT HANDSHAKE</div>
        <div style={S.settingsSub}>Received a code from another server admin? Enter it here to activate the connection.</div>
        <form onSubmit={handleAccept}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                placeholder="Paste invite code here…"
                value={acceptCode}
                onChange={e => setAcceptCode(e.target.value)}
                style={{ ...S.input, fontFamily: "'Share Tech Mono',monospace", letterSpacing: '2px' }}
              />
            </div>
            <button type="submit" style={S.saveBtn} disabled={acceptBusy}>
              {acceptBusy ? 'CHECKING…' : 'ACCEPT →'}
            </button>
          </div>
          {acceptError && <p style={S.error}>{acceptError}</p>}
          {acceptMsg  && <p style={{ color: '#00e87a', fontSize: 12, marginTop: 8 }}>{acceptMsg}</p>}
        </form>
      </div>

      {/* Active handshakes */}
      {active.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#00e87a', marginBottom: 10 }}>
            ● ACTIVE CONNECTIONS — {active.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map(hs => (
              <HandshakeRow key={hs.id} hs={hs} partnerName={partnerName(hs)} serverId={serverId}
                onToggle={handleToggle} onRevoke={handleRevoke} toggleBusy={toggleBusy} S={S} />
            ))}
          </div>
        </div>
      )}

      {/* Pending outgoing handshakes */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#f0a500', marginBottom: 10 }}>
            ◌ PENDING — AWAITING ACCEPTANCE — {pending.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(hs => (
              <div key={hs.id} style={{ ...S.row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={S.rowTitle}>Awaiting partner</div>
                  <div style={S.rowSub}>Code: <span style={{ color: '#f0a500', letterSpacing: '2px' }}>{hs.invite_code}</span></div>
                  <div style={S.rowSub}>Initiated {new Date(hs.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={S.copyBtn} onClick={() => copyCode(hs.invite_code)}>
                    {copied === hs.invite_code ? <><Check size={12} /> COPIED</> : <><Copy size={12} /> COPY CODE</>}
                  </button>
                  <IconBtn danger title="Cancel" onClick={() => handleRevoke(hs.id)}><X size={14} /></IconBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revoked */}
      {revoked.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 10 }}>
            ✕ REVOKED — {revoked.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {revoked.map(hs => (
              <div key={hs.id} style={{ ...S.row, opacity: 0.45 }}>
                <div style={{ flex: 1 }}>
                  <div style={S.rowTitle}>{partnerName(hs)}</div>
                  <div style={S.rowSub}>Revoked · was {hs.initiator_server_id === serverId ? 'outgoing' : 'incoming'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div style={S.empty}>Loading…</div>}
      {!loading && handshakes.length === 0 && (
        <div style={S.empty}>No handshakes yet. Initiate one above to connect with another server.</div>
      )}
    </div>
  );
}

function HandshakeRow({ hs, partnerName, serverId, onToggle, onRevoke, toggleBusy, S }) {
  const isInitiator = hs.initiator_server_id === serverId;

  function Toggle({ field, label }) {
    const on   = hs[field];
    const busy = toggleBusy === hs.id + field;
    return (
      <button
        onClick={() => onToggle(hs, field)}
        disabled={busy}
        title={on ? `Sharing ${label} — click to disable` : `Not sharing ${label} — click to enable`}
        style={{
          padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
          fontSize: 10, letterSpacing: '1px', cursor: busy ? 'default' : 'pointer',
          background: on ? 'rgba(0,232,122,0.08)' : 'transparent',
          border: `1px solid ${on ? 'rgba(0,232,122,0.35)' : '#1e3550'}`,
          color: on ? '#00e87a' : '#3a5878',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {on ? '✓' : '✕'} {label}
      </button>
    );
  }

  return (
    <div style={{ background: 'rgba(13,21,32,0.7)', border: '1px solid rgba(0,232,122,0.2)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...S.rowTitle, color: '#00e87a' }}>
            {partnerName}
            <span style={{ fontSize: 10, color: '#3a5878', fontWeight: 400, marginLeft: 6 }}>
              ({isInitiator ? 'you initiated' : 'they initiated'})
            </span>
          </div>
          <div style={S.rowSub}>
            Active since {new Date(hs.accepted_at).toLocaleDateString()}
          </div>
        </div>
        <IconBtn danger title="Revoke handshake" onClick={() => onRevoke(hs.id)}><X size={14} /></IconBtn>
      </div>

      {/* Sharing toggles */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 8 }}>
          SHARING WITH PARTNER
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Toggle field="share_map"         label="LIVE MAP" />
          <Toggle field="share_roster"      label="ROSTER NAMES" />
          <Toggle field="share_player_info" label="PLAYER STATS" />
        </div>
        <p style={{ fontSize: 10, color: '#2a4058', marginTop: 8, lineHeight: 1.6 }}>
          These are the server-level caps. Alliance owners can further control sharing from Alliance HQ once connected.
        </p>
      </div>
    </div>
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
