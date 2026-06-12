import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { hashPassword, generateInviteCode } from '../lib/auth';
import { ArrowLeft, Copy, Check, Eye, EyeOff, Trash2, Edit2, Crown, Shield, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import './AllianceHQ.css';

// ── Helpers ──────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState({ msg: '', err: false, show: false });
  const show = (msg, err = false) => {
    setToast({ msg, err, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };
  return [toast, show];
}

function tierClass(v) {
  const n = parseFloat(v) || 0;
  if (n >= 50) return 'tier-diamond';
  if (n >= 40) return 'tier-gold';
  if (n >= 30) return 'tier-silver';
  if (n > 0)   return 'tier-bronze';
  return 'tier-none';
}

// Normalise power: if stored as full int (>1000), convert to millions display
function normPower(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return null;
  return n > 1000 ? +(n / 1000000).toFixed(2) : +n.toFixed(2);
}
function displayPower(v) {
  const n = normPower(v);
  return n == null ? null : n + 'M';
}

const EMPTY_FORM = {
  inGameName: '', power1: '', power2: '', power3: '',
  hasSquad4: false, troop1: '', troop2: '', troop3: '',
  canyonTeam: '', canyonSub: false, desertTeam: '', desertSub: false,
  profession: '', garrison: 'no', quickstride: 'no',
  resistance: '', coffeeBuff: 'none', notes: '',
};

function memberToForm(m) {
  if (!m) return { ...EMPTY_FORM };
  return {
    inGameName:  m.in_game_name || '',
    power1:      m.power1 != null ? String(normPower(m.power1) ?? '') : '',
    power2:      m.power2 != null ? String(normPower(m.power2) ?? '') : '',
    power3:      m.power3 != null ? String(normPower(m.power3) ?? '') : '',
    hasSquad4:   !!m.has_squad4,
    troop1:      m.troop1 || '',
    troop2:      m.troop2 || '',
    troop3:      m.troop3 || '',
    canyonTeam:  m.canyon_team || '',
    canyonSub:   !!m.canyon_sub,
    desertTeam:  m.desert_team || '',
    desertSub:   !!m.desert_sub,
    profession:  m.profession || '',
    garrison:    m.garrison || 'no',
    quickstride: m.quickstride || 'no',
    resistance:  m.resistance != null ? String(m.resistance) : '',
    coffeeBuff:  m.coffee_buff || 'none',
    notes:       m.notes || '',
  };
}

function formToDb(form) {
  return {
    in_game_name: form.inGameName.trim() || null,
    power1:       form.power1 !== '' ? parseFloat(form.power1) : null,
    power2:       form.power2 !== '' ? parseFloat(form.power2) : null,
    power3:       form.power3 !== '' ? parseFloat(form.power3) : null,
    has_squad4:   form.hasSquad4,
    troop1:       form.troop1 || null,
    troop2:       form.troop2 || null,
    troop3:       form.troop3 || null,
    canyon_team:  form.canyonTeam || null,
    canyon_sub:   form.canyonSub,
    desert_team:  form.desertTeam || null,
    desert_sub:   form.desertSub,
    profession:   form.profession || null,
    garrison:     form.garrison,
    quickstride:  form.quickstride,
    resistance:   form.resistance !== '' ? parseInt(form.resistance) : null,
    coffee_buff:  form.coffeeBuff,
    notes:        form.notes.trim() || null,
    last_updated: new Date().toISOString(),
  };
}

// ── Shared UI pieces ─────────────────────────────────────────────

function HelpCard({ title, lines }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'rgba(0,200,255,0.03)', border: '1px solid rgba(0,200,255,0.10)', marginBottom: 16 }}>
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

function CheckBox({ checked, onChange, label, sub }) {
  return (
    <label className="check-row">
      <span className="custom-check">
        <span className={`check-mark${checked ? ' checked' : ''}`} onClick={() => onChange(!checked)} />
      </span>
      <span className="check-label">
        {label}{sub && <><br /><small>{sub}</small></>}
      </span>
    </label>
  );
}

function PwdField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="form-label" style={{ marginBottom: 5 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          className="form-control"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ paddingRight: 36 }}
        />
        <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#3a5878', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ── Member stats form ────────────────────────────────────────────

function MemberForm({ initialData, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => memberToForm(initialData));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="form-grid">
        <div className="form-group fg-full">
          <label className="form-label">IN-GAME NAME</label>
          <input className="form-control" placeholder="As shown in Last War" value={form.inGameName} onChange={e => set('inGameName', e.target.value)} />
        </div>

        <div className="section-div sd-squads">Squad Powers — enter in millions (e.g. 55.5 = 55.5M)</div>

        <div className="form-group fg-full">
          <div style={{ background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.12)', padding: '8px 12px', fontSize: 11, color: '#3a5878', lineHeight: 1.7, marginBottom: 8 }}>
            💡 Enter power as millions. Example: if your squad power is 55,432,000 → enter <strong style={{color:'#7a9bb8'}}>55.5</strong>. T1 is your primary squad. T2 and T3 are optional but help leadership plan battle assignments.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">T1 Power (M) <span className="opt">primary</span></label>
          <input type="number" className="form-control" step="0.1" min="0" max="999" placeholder="e.g. 55.5" value={form.power1} onChange={e => set('power1', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">T1 Troop Type</label>
          <select className="form-control" value={form.troop1} onChange={e => set('troop1', e.target.value)}>
            <option value="">— select —</option>
            <option value="Tank">🛡 Tank</option>
            <option value="Air">✈ Air</option>
            <option value="Missile">🚀 Missile</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">T2 Power (M) <span className="opt">optional</span></label>
          <input type="number" className="form-control" step="0.1" min="0" max="999" placeholder="e.g. 32.0" value={form.power2} onChange={e => set('power2', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">T2 Troop Type</label>
          <select className="form-control" value={form.troop2} onChange={e => set('troop2', e.target.value)}>
            <option value="">— select —</option>
            <option value="Tank">🛡 Tank</option>
            <option value="Air">✈ Air</option>
            <option value="Missile">🚀 Missile</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">T3 Power (M) <span className="opt">optional</span></label>
          <input type="number" className="form-control" step="0.1" min="0" max="999" placeholder="e.g. 18.0" value={form.power3} onChange={e => set('power3', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">T3 Troop Type</label>
          <select className="form-control" value={form.troop3} onChange={e => set('troop3', e.target.value)}>
            <option value="">— select —</option>
            <option value="Tank">🛡 Tank</option>
            <option value="Air">✈ Air</option>
            <option value="Missile">🚀 Missile</option>
          </select>
        </div>
        <div className="form-group fg-full">
          <CheckBox checked={form.hasSquad4} onChange={v => set('hasSquad4', v)} label={<b>Squad 4 unlocked</b>} sub="Check if you have a 4th squad slot available" />
        </div>

        <div className="section-div sd-events">Event Teams — Canyon Storm &amp; Desert Storm</div>

        <div className="form-group fg-full">
          <div style={{ background: 'rgba(240,165,0,0.04)', border: '1px solid rgba(240,165,0,0.12)', padding: '8px 12px', fontSize: 11, color: '#3a5878', lineHeight: 1.7, marginBottom: 8 }}>
            💡 Select which team slot you prefer for each event, or "Flexible" if you can play any time. Check "Substitute" if you're available as a backup. Leadership uses this to build balanced teams.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Canyon Storm Team</label>
          <select className="form-control" value={form.canyonTeam} onChange={e => set('canyonTeam', e.target.value)}>
            <option value="">—</option>
            <option value="A">Team A — 12:00–12:30</option>
            <option value="B">Team B — 23:00–23:30</option>
            <option value="any">Flexible</option>
          </select>
        </div>
        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
          <label className="form-label">&nbsp;</label>
          <CheckBox checked={form.canyonSub} onChange={v => set('canyonSub', v)} label="Substitute role" sub="Canyon Storm" />
        </div>
        <div className="form-group">
          <label className="form-label">Desert Storm Team</label>
          <select className="form-control" value={form.desertTeam} onChange={e => set('desertTeam', e.target.value)}>
            <option value="">—</option>
            <option value="A">Team A — 18:00–18:30</option>
            <option value="B">Team B — 09:00–09:30</option>
            <option value="any">Flexible</option>
          </select>
        </div>
        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
          <label className="form-label">&nbsp;</label>
          <CheckBox checked={form.desertSub} onChange={v => set('desertSub', v)} label="Substitute role" sub="Desert Storm" />
        </div>

        <div className="section-div sd-season">Season</div>

        <div className="form-group">
          <label className="form-label">Preferred Profession</label>
          <select className="form-control" value={form.profession} onChange={e => set('profession', e.target.value)}>
            <option value="">—</option>
            <option value="Engineer">Engineer</option>
            <option value="Warlord">Warlord</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Base Resistance</label>
          <input type="number" className="form-control" min="0" placeholder="e.g. 1250" value={form.resistance} onChange={e => set('resistance', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Garrison Core Card</label>
          <select className="form-control" value={form.garrison} onChange={e => set('garrison', e.target.value)}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Quickstride Core Card</label>
          <select className="form-control" value={form.quickstride} onChange={e => set('quickstride', e.target.value)}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="form-group fg-full">
          <label className="form-label">Coffee Buff</label>
          <select className="form-control" value={form.coffeeBuff} onChange={e => set('coffeeBuff', e.target.value)}>
            <option value="none">None</option>
            <option value="200">+200 Resistance</option>
            <option value="500">+500 Resistance</option>
          </select>
        </div>
        <div className="form-group fg-full">
          <label className="form-label">Notes</label>
          <input className="form-control" placeholder="Optional…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-primary" disabled={saving} onClick={() => onSave(formToDb(form))}>
          {saving ? 'SAVING…' : 'SAVE →'}
        </button>
        {onCancel && <button className="btn-cancel-sm" onClick={onCancel}>CANCEL</button>}
      </div>
    </div>
  );
}

// ── Panel 2: Management ──────────────────────────────────────────

function ManagementPanel({ alliance, members, isOwner, showToast, onReload }) {
  const TABS = isOwner
    ? ['ROSTER', 'ADMINS', 'PARTNERS', 'SETTINGS']
    : ['ROSTER', 'INVITE'];
  const [tab, setTab] = useState('ROSTER');
  const [editingMember, setEditingMember] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Password reset for editing a member
  const [pwdReset, setPwdReset]   = useState({ open: false, pwd: '', confirm: '', busy: false, msg: '' });

  // Settings state (owner only)
  const [rosterPublic, setRosterPublic] = useState(alliance?.roster_public ?? true);
  const [showPower, setShowPower] = useState(alliance?.roster_show_power ?? true);
  const [visibilityBusy, setVisibilityBusy] = useState(false);

  // Handshake sharing settings (owner only)
  const [handshakes,    setHandshakes]    = useState([]);   // active server handshakes
  const [hsSettings,    setHsSettings]    = useState({});   // handshake_id → ahs row
  const [hsServers,     setHsServers]     = useState({});   // server_id → { server_number, name }
  const [hsLoaded,      setHsLoaded]      = useState(false);
  const [hsToggleBusy,  setHsToggleBusy]  = useState(null);
  // Partner roster: [{server, alliances: [{...alliance, members:[]}]}]
  const [partnerRosters, setPartnerRosters] = useState([]);
  const [partnerLoaded,  setPartnerLoaded]  = useState(false);

  useEffect(() => {
    if (!isOwner || !alliance) return;
    async function loadHandshakes() {
      const { data: hs } = await supabase
        .from('server_handshakes')
        .select('*')
        .or(`initiator_server_id.eq.${alliance.server_id},target_server_id.eq.${alliance.server_id}`)
        .eq('status', 'accepted');

      const rows = hs ?? [];
      setHandshakes(rows);

      // Load per-alliance sharing settings
      if (rows.length > 0) {
        const { data: settings } = await supabase
          .from('alliance_handshake_settings')
          .select('*')
          .eq('alliance_id', alliance.id)
          .in('handshake_id', rows.map(h => h.id));

        const lookup = {};
        (settings ?? []).forEach(s => { lookup[s.handshake_id] = s; });
        setHsSettings(lookup);

        // Load partner server names
        const partnerIds = [...new Set(rows.map(h =>
          h.initiator_server_id === alliance.server_id ? h.target_server_id : h.initiator_server_id
        ).filter(Boolean))];
        if (partnerIds.length > 0) {
          const { data: srvs } = await supabase
            .from('servers').select('id, server_number, name').in('id', partnerIds);
          const srvLookup = {};
          (srvs ?? []).forEach(s => { srvLookup[s.id] = s; });
          setHsServers(srvLookup);
        }
      }
      setHsLoaded(true);

      // Load partner rosters for handshakes where partner has share_roster=true
      // and our server allows share_roster on that handshake
      const rosterHs = rows.filter(h => h.share_roster);
      if (rosterHs.length > 0) {
        const rosterList = [];
        for (const hs of rosterHs) {
          const partnerId = hs.initiator_server_id === alliance.server_id ? hs.target_server_id : hs.initiator_server_id;
          if (!partnerId) continue;

          // Check which partner alliances have opted in to share_roster for this handshake
          const { data: pAls } = await supabase
            .from('alliances').select('id, name, tag, color').eq('server_id', partnerId).order('name');
          if (!pAls?.length) continue;

          const pAlIds = pAls.map(a => a.id);
          const { data: pHsSettings } = await supabase
            .from('alliance_handshake_settings')
            .select('alliance_id, share_roster, share_player_info')
            .eq('handshake_id', hs.id)
            .in('alliance_id', pAlIds);

          const pSettingsMap = {};
          (pHsSettings ?? []).forEach(s => { pSettingsMap[s.alliance_id] = s; });

          // Only include alliances that opted in
          const sharedAlIds = pAlIds.filter(id => pSettingsMap[id]?.share_roster !== false);
          if (!sharedAlIds.length) continue;

          // Load member names (and optionally stats if share_player_info=true)
          const membersByAlliance = {};
          for (const alId of sharedAlIds) {
            const showStats = hs.share_player_info && pSettingsMap[alId]?.share_player_info === true;
            const fields = showStats
              ? 'id, username, in_game_name, power1, troop1, profession, canyon_team, desert_team'
              : 'id, username, in_game_name';
            const { data: mems } = await supabase
              .from('members').select(fields).eq('alliance_id', alId).order('username');
            membersByAlliance[alId] = { members: mems ?? [], showStats };
          }

          const pSrv = srvLookup[partnerId] ?? { server_number: '?', name: 'Partner' };
          rosterList.push({
            server: pSrv,
            alliances: pAls
              .filter(a => sharedAlIds.includes(a.id))
              .map(a => ({ ...a, ...membersByAlliance[a.id] })),
          });
        }
        setPartnerRosters(rosterList);
      }
      setPartnerLoaded(true);
    }
    loadHandshakes();
  }, [isOwner, alliance]);

  async function handleHsToggle(hs, field) {
    const current = hsSettings[hs.id];
    const newVal  = !(current?.[field] ?? (field === 'share_live_map'));
    setHsToggleBusy(hs.id + field);

    if (current) {
      const { data } = await supabase
        .from('alliance_handshake_settings')
        .update({ [field]: newVal, updated_at: new Date().toISOString() })
        .eq('id', current.id).select().single();
      if (data) setHsSettings(prev => ({ ...prev, [hs.id]: data }));
    } else {
      const { data } = await supabase
        .from('alliance_handshake_settings')
        .insert({ handshake_id: hs.id, alliance_id: alliance.id, [field]: newVal })
        .select().single();
      if (data) setHsSettings(prev => ({ ...prev, [hs.id]: data }));
    }
    setHsToggleBusy(null);
  }

  async function handleEditSave(dbData) {
    setSaving(true);
    const { error } = await supabase.from('members').update(dbData).eq('id', editingMember.id);
    setSaving(false);
    if (error) { showToast('Save failed: ' + error.message, true); return; }
    showToast('Member updated.');
    setEditingMember(null);
    setPwdReset({ open: false, pwd: '', confirm: '', busy: false, msg: '' });
    onReload();
  }

  async function handleMemberPwdReset(e) {
    e.preventDefault();
    if (!pwdReset.pwd.trim()) { setPwdReset(p => ({ ...p, msg: 'error:Password cannot be empty.' })); return; }
    if (pwdReset.pwd !== pwdReset.confirm) { setPwdReset(p => ({ ...p, msg: 'error:Passwords do not match.' })); return; }
    setPwdReset(p => ({ ...p, busy: true, msg: '' }));
    const hash = await hashPassword(pwdReset.pwd);
    const { error } = await supabase.from('members').update({ password: hash }).eq('id', editingMember.id);
    setPwdReset(p => ({ ...p, busy: false, msg: error ? 'error:' + error.message : 'ok:Password reset successfully.' }));
    if (!error) { setPwdReset(p => ({ ...p, pwd: '', confirm: '' })); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove ${name} from the alliance?`)) return;
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) { showToast('Delete failed', true); return; }
    showToast('Member removed.');
    onReload();
  }

  async function handlePromote(id) {
    const admins = members.filter(m => m.alliance_role === 'alliance_admin');
    if (admins.length >= 10) { showToast('Maximum 10 alliance admins allowed.', true); return; }
    await supabase.from('members').update({ alliance_role: 'alliance_admin' }).eq('id', id);
    showToast('Member promoted to Alliance Admin.');
    onReload();
  }

  async function handleRevoke(id) {
    await supabase.from('members').update({ alliance_role: 'member' }).eq('id', id);
    showToast('Alliance Admin role revoked.');
    onReload();
  }

  async function handleVisibilitySave() {
    setVisibilityBusy(true);
    await supabase.from('alliances').update({ roster_public: rosterPublic, roster_show_power: showPower }).eq('id', alliance.id);
    setVisibilityBusy(false);
    showToast('Visibility settings saved.');
    onReload();
  }

  async function copyInvite() {
    const url = `${window.location.origin}/join/${alliance.invite_code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inviteUrl = `${window.location.origin}/join/${alliance.invite_code}`;
  const admins = members.filter(m => m.alliance_role === 'alliance_admin');
  const regularMembers = members.filter(m => m.alliance_role !== 'alliance_admin');

  return (
    <div className="ahq-panel">
      <div className="ahq-panel-header" style={{ borderColor: 'rgba(240,165,0,0.3)', color: '#f0a500' }}>
        <Crown size={14} /> ALLIANCE MANAGEMENT
        <span className="ahq-panel-sub">{members.length} members</span>
      </div>

      <div className="ahq-tab-row" style={{ padding: '0 20px' }}>
        {TABS.map(t => (
          <button key={t} className={`ahq-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        {isOwner && tab === 'SETTINGS' && (
          <HelpCard title="ALLIANCE OWNER GUIDE" lines={[
            'Copy your alliance invite link and share it with players — they self-register and join automatically.',
            'You can promote up to 10 trusted members to Alliance Admin in the ADMINS tab.',
            'Alliance Admins can edit and remove members, but cannot change settings or promote others.',
            'Use Roster Visibility to control whether other alliances on the server can see your roster.',
            'If a member forgets their password, edit their profile in the ROSTER tab and set a new one.',
            'To change your own login password, go to MY PROFILE tab → Change My Password.',
          ]} />
        )}
        {!isOwner && tab === 'INVITE' && (
          <HelpCard title="INVITING PLAYERS" lines={[
            'Copy this link and share it directly with players you want to join the alliance.',
            'Players click the link, create a username and password, and are added automatically.',
            'Only the alliance owner can promote or remove Alliance Admins.',
          ]} />
        )}

        {/* ROSTER TAB */}
        {tab === 'ROSTER' && (
          <div>
            {editingMember ? (
              <div>
                <div className="mgmt-edit-header">
                  Editing: <strong style={{ color: '#d0e4f4' }}>{editingMember.username}</strong>
                </div>
                <MemberForm
                  initialData={editingMember}
                  onSave={handleEditSave}
                  onCancel={() => { setEditingMember(null); setPwdReset({ open: false, pwd: '', confirm: '', busy: false, msg: '' }); }}
                  saving={saving}
                />

                {/* Password reset section */}
                <div style={{ marginTop: 20, borderTop: '1px solid #1e3550', paddingTop: 16 }}>
                  {!pwdReset.open ? (
                    <button className="btn-cancel-sm" onClick={() => setPwdReset(p => ({ ...p, open: true }))}>
                      RESET PASSWORD
                    </button>
                  ) : (
                    <form onSubmit={handleMemberPwdReset}>
                      <div style={{ marginBottom: 8, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1.5px', color: '#3a5878' }}>
                        RESET MEMBER PASSWORD
                      </div>
                      <PwdField label="NEW PASSWORD" value={pwdReset.pwd} onChange={v => setPwdReset(p => ({ ...p, pwd: v }))} />
                      <PwdField label="CONFIRM PASSWORD" value={pwdReset.confirm} onChange={v => setPwdReset(p => ({ ...p, confirm: v }))} />
                      {pwdReset.msg && (
                        <p style={{ fontSize: 12, margin: '0 0 10px', color: pwdReset.msg.startsWith('ok:') ? '#00e87a' : '#ff4060' }}>
                          {pwdReset.msg.replace(/^(ok|error):/, '')}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn-primary" disabled={pwdReset.busy}>
                          {pwdReset.busy ? 'SAVING…' : 'SAVE PASSWORD →'}
                        </button>
                        <button type="button" className="btn-cancel-sm" onClick={() => setPwdReset({ open: false, pwd: '', confirm: '', busy: false, msg: '' })}>
                          CANCEL
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="mgmt-member-list">
                {members.length === 0 && <div className="ahq-empty">No members yet.</div>}
                {members.map(m => (
                  <div key={m.id} className="mgmt-member-row">
                    <div className="mgmt-member-info">
                      <div className="mgmt-member-name">
                        {m.in_game_name || m.username}
                        {m.alliance_role === 'alliance_admin' && <span className="role-chip admin-chip">ADMIN</span>}
                      </div>
                      <div className="mgmt-member-sub">
                        @{m.username}
                        {m.power1 != null && <span style={{ marginLeft: 10, color: '#f0a500' }}>T1: {m.power1}</span>}
                        {m.troop1 && <span className={`trp trp-${m.troop1}`} style={{ marginLeft: 6 }}>{m.troop1[0]}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditingMember(m)}>
                        <Edit2 size={13} />
                      </button>
                      <button className="icon-btn danger" title="Remove" onClick={() => handleDelete(m.id, m.in_game_name || m.username)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* INVITE TAB */}
        {tab === 'INVITE' && (
          <div style={{ paddingTop: 8 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>ALLIANCE INVITE LINK</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="invite-code-box">{inviteUrl}</div>
              <button className="btn-copy" onClick={copyInvite}>
                {copied ? <><Check size={13} /> COPIED</> : <><Copy size={13} /> COPY</>}
              </button>
            </div>
            <p style={{ color: '#3a5878', fontSize: 12, marginTop: 10 }}>Share this link with players you want to join your alliance.</p>
          </div>
        )}

        {/* ADMINS TAB (owner only) */}
        {tab === 'ADMINS' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>ALLIANCE ADMINS ({admins.length}/10)</div>
              <p style={{ color: '#3a5878', fontSize: 12, marginBottom: 12 }}>Alliance admins can edit and remove members. Only you can promote or revoke them.</p>
              {admins.length === 0 && <div className="ahq-empty">No alliance admins yet.</div>}
              {admins.map(m => (
                <div key={m.id} className="mgmt-member-row">
                  <div className="mgmt-member-info">
                    <div className="mgmt-member-name">
                      {m.in_game_name || m.username}
                      <span className="role-chip admin-chip">ADMIN</span>
                    </div>
                    <div className="mgmt-member-sub">@{m.username}</div>
                  </div>
                  <button className="btn-danger-sm" onClick={() => handleRevoke(m.id)}>REVOKE</button>
                </div>
              ))}
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: 6 }}>PROMOTE A MEMBER</div>
              {regularMembers.length === 0 && <div className="ahq-empty">No regular members to promote.</div>}
              {regularMembers.map(m => (
                <div key={m.id} className="mgmt-member-row">
                  <div className="mgmt-member-info">
                    <div className="mgmt-member-name">{m.in_game_name || m.username}</div>
                    <div className="mgmt-member-sub">@{m.username}</div>
                  </div>
                  <button className="btn-promote-sm" onClick={() => handlePromote(m.id)} disabled={admins.length >= 10}>PROMOTE</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PARTNERS TAB (owner only) */}
        {tab === 'PARTNERS' && (
          <div>
            <p style={{ fontSize: 12, color: '#3a5878', marginBottom: 16, lineHeight: 1.6 }}>
              Partner alliances that have opted in to share their roster with your server. Sharing is controlled by each alliance in their own Alliance HQ settings.
            </p>
            {!partnerLoaded && <p style={{ fontSize: 12, color: '#3a5878' }}>Loading…</p>}
            {partnerLoaded && partnerRosters.length === 0 && (
              <div className="ahq-empty">
                No partner rosters available. Either no handshakes are active, or partner alliances haven't enabled roster sharing yet.
              </div>
            )}
            {partnerLoaded && partnerRosters.map(pr => (
              <div key={pr.server.id} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#00c8ff', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(0,200,255,0.15)' }}>
                  S{pr.server.server_number} — {pr.server.name}
                </div>
                {pr.alliances.map(al => (
                  <div key={al.id} style={{ marginBottom: 14, border: '1px solid #1e3550', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #1e3550' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: al.color, flexShrink: 0 }} />
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#d0e4f4' }}>
                        {al.name}
                        {al.tag && <span style={{ fontSize: 10, color: '#3a5878', marginLeft: 6, fontFamily: "'Share Tech Mono',monospace" }}>{al.tag}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#3a5878', marginLeft: 'auto', fontFamily: "'Share Tech Mono',monospace" }}>
                        {al.members.length} members
                      </div>
                    </div>
                    {al.members.length === 0 && (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: '#3a5878' }}>No members listed.</div>
                    )}
                    {al.members.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderBottom: '1px solid rgba(30,53,80,0.5)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#d0e4f4' }}>{m.in_game_name || m.username}</div>
                          {m.in_game_name && <div style={{ fontSize: 10, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace" }}>@{m.username}</div>}
                        </div>
                        {al.showStats && (
                          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace", flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {m.power1 && <span style={{ color: '#7a9bb8' }}>{m.power1}B</span>}
                            {m.troop1 && <span>{m.troop1}</span>}
                            {m.profession && <span style={{ color: '#f0a500' }}>{m.profession}</span>}
                            {m.canyon_team && <span>Canyon {m.canyon_team}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS TAB (owner only) */}
        {tab === 'SETTINGS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Invite link */}
            <div className="settings-card">
              <div className="settings-label">ALLIANCE INVITE LINK</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="invite-code-box">{inviteUrl}</div>
                <button className="btn-copy" onClick={copyInvite}>
                  {copied ? <><Check size={13} /> COPIED</> : <><Copy size={13} /> COPY</>}
                </button>
              </div>
            </div>

            {/* Visibility */}
            <div className="settings-card">
              <div className="settings-label">ROSTER VISIBILITY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <CheckBox
                  checked={rosterPublic}
                  onChange={v => setRosterPublic(v)}
                  label="Roster visible to all server members"
                  sub="When off, only your alliance members can see the roster"
                />
                <CheckBox
                  checked={showPower}
                  onChange={v => setShowPower(v)}
                  label="Show T1 power in public roster"
                  sub="When off, power is hidden from non-members"
                />
              </div>
              <button className="btn-primary" disabled={visibilityBusy} onClick={handleVisibilitySave}>
                {visibilityBusy ? 'SAVING…' : 'SAVE VISIBILITY →'}
              </button>
            </div>

            {/* Handshake sharing */}
            <div className="settings-card">
              <div className="settings-label">SERVER CONNECTIONS — SHARING</div>
              <p style={{ fontSize: 12, color: '#3a5878', marginBottom: 14, lineHeight: 1.6 }}>
                Control what your alliance shares with each connected server. Your server admin must have an active handshake with that server first.
                You can only share within the limits set by your server admin.
              </p>

              {!hsLoaded && <p style={{ fontSize: 12, color: '#3a5878' }}>Loading…</p>}

              {hsLoaded && handshakes.length === 0 && (
                <p style={{ fontSize: 12, color: '#3a5878' }}>
                  No active server connections. Ask your server admin to set up a handshake with another server.
                </p>
              )}

              {hsLoaded && handshakes.map(hs => {
                const partnerId  = hs.initiator_server_id === alliance.server_id ? hs.target_server_id : hs.initiator_server_id;
                const partner    = hsServers[partnerId];
                const settings   = hsSettings[hs.id];
                // Defaults: live map on, rest off — unless already saved
                const shareLive  = settings ? settings.share_live_map    : true;
                const sharePlan  = settings ? settings.share_plan_map    : false;
                const shareRost  = settings ? settings.share_roster      : false;
                const shareStats = settings ? settings.share_player_info : false;

                function HsToggle({ field, label, value, serverAllows }) {
                  const busy = hsToggleBusy === hs.id + field;
                  if (!serverAllows) {
                    return (
                      <div style={{ padding: '4px 10px', fontSize: 10, color: '#2a4058', border: '1px solid #1e3550', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, letterSpacing: '1px' }}>
                        ✕ {label} <span style={{ fontWeight: 400 }}>(not permitted by server)</span>
                      </div>
                    );
                  }
                  return (
                    <button
                      onClick={() => handleHsToggle(hs, field)}
                      disabled={busy}
                      style={{
                        padding: '4px 10px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                        fontSize: 10, letterSpacing: '1px', cursor: busy ? 'default' : 'pointer',
                        background: value ? 'rgba(0,232,122,0.08)' : 'transparent',
                        border: `1px solid ${value ? 'rgba(0,232,122,0.35)' : '#1e3550'}`,
                        color: value ? '#00e87a' : '#3a5878',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {value ? '✓' : '○'} {label}
                    </button>
                  );
                }

                return (
                  <div key={hs.id} style={{ marginBottom: 16, padding: '12px', border: '1px solid #1e3550', background: 'rgba(0,200,255,0.02)' }}>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#d0e4f4', marginBottom: 4 }}>
                      {partner ? `Server ${partner.server_number} — ${partner.name}` : 'Partner server'}
                    </div>
                    <p style={{ fontSize: 11, color: '#3a5878', marginBottom: 10 }}>What to share with this server's members:</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <HsToggle field="share_live_map"    label="LIVE MAP"      value={shareLive}  serverAllows={hs.share_map} />
                      <HsToggle field="share_plan_map"    label="PLAN MAP"      value={sharePlan}  serverAllows={hs.share_map} />
                      <HsToggle field="share_roster"      label="ROSTER NAMES"  value={shareRost}  serverAllows={hs.share_roster} />
                      <HsToggle field="share_player_info" label="PLAYER STATS"  value={shareStats} serverAllows={hs.share_player_info} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel 3: My Profile ──────────────────────────────────────────

function MyProfilePanel({ memberId, members, showToast, onReload }) {
  const [saving, setSaving] = useState(false);
  const [pwdForm, setPwdForm] = useState({ open: false, current: '', next: '', confirm: '', busy: false, msg: '' });
  const member = members.find(m => m.id === memberId) || null;

  async function handleSave(dbData) {
    setSaving(true);
    const { error } = await supabase.from('members').update(dbData).eq('id', memberId);
    setSaving(false);
    if (error) { showToast('Save failed: ' + error.message, true); return; }
    showToast('Profile saved!');
    onReload();
  }

  async function handlePwdChange(e) {
    e.preventDefault();
    if (!pwdForm.current.trim()) { setPwdForm(p => ({ ...p, msg: 'error:Enter your current password.' })); return; }
    if (!pwdForm.next.trim())    { setPwdForm(p => ({ ...p, msg: 'error:Enter a new password.' })); return; }
    if (pwdForm.next !== pwdForm.confirm) { setPwdForm(p => ({ ...p, msg: 'error:Passwords do not match.' })); return; }
    setPwdForm(p => ({ ...p, busy: true, msg: '' }));
    const currentHash = await hashPassword(pwdForm.current);
    if (currentHash !== member.password) {
      setPwdForm(p => ({ ...p, busy: false, msg: 'error:Current password is incorrect.' })); return;
    }
    const newHash = await hashPassword(pwdForm.next);
    const { error } = await supabase.from('members').update({ password: newHash }).eq('id', memberId);
    if (error) { setPwdForm(p => ({ ...p, busy: false, msg: 'error:' + error.message })); return; }
    setPwdForm({ open: false, current: '', next: '', confirm: '', busy: false, msg: '' });
    showToast('Password changed successfully.');
    onReload();
  }

  return (
    <div className="ahq-panel">
      <div className="ahq-panel-header" style={{ borderColor: 'rgba(0,200,255,0.3)', color: '#00c8ff' }}>
        <span>👤 MY PROFILE</span>
        {member?.in_game_name && <span style={{ fontSize: 12, color: '#7a9bb8', fontWeight: 400, marginLeft: 8 }}>{member.in_game_name}</span>}
      </div>
      <div style={{ padding: '16px 20px 20px' }}>
          <HelpCard title="ABOUT YOUR PROFILE" lines={[
            'Power: Enter in millions. If your in-game power shows 55,432,000 → type 55.5. T1 is your main squad, T2 and T3 are optional.',
            'Troop Type: Select Tank, Air, or Missile for each squad. This helps leadership assign the right players to each battle.',
            'Canyon Storm / Desert Storm: Pick Team A or Team B based on the time slot you can make. Check "Sub" if you can fill in when someone is absent.',
            'Garrison & Quickstride: Select "yes" if you have this building fully built. Important for territory defense planning.',
            'Resistance: Enter your base resistance stat (without coffee buff — that is a separate field).',
            'Coffee Buff: Select the resistance bonus from your coffee buff if you use one regularly.',
            'Notes: Any extra info for leadership — e.g. schedule constraints, special roles, availability.',
          ]} />
          <MemberForm
            initialData={member}
            onSave={handleSave}
            saving={saving}
          />

          {/* Change own password */}
          <div style={{ marginTop: 20, borderTop: '1px solid #1e3550', paddingTop: 16 }}>
            {!pwdForm.open ? (
              <button className="btn-cancel-sm" onClick={() => setPwdForm(p => ({ ...p, open: true }))}>
                CHANGE MY PASSWORD
              </button>
            ) : (
              <form onSubmit={handlePwdChange}>
                <div style={{ marginBottom: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '1.5px', color: '#3a5878' }}>
                  CHANGE PASSWORD
                </div>
                <PwdField label="CURRENT PASSWORD" value={pwdForm.current} onChange={v => setPwdForm(p => ({ ...p, current: v }))} />
                <PwdField label="NEW PASSWORD"     value={pwdForm.next}    onChange={v => setPwdForm(p => ({ ...p, next: v }))} />
                <PwdField label="CONFIRM PASSWORD" value={pwdForm.confirm} onChange={v => setPwdForm(p => ({ ...p, confirm: v }))} />
                {pwdForm.msg && (
                  <p style={{ fontSize: 12, margin: '0 0 10px', color: pwdForm.msg.startsWith('ok:') ? '#00e87a' : '#ff4060' }}>
                    {pwdForm.msg.replace(/^(ok|error):/, '')}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" disabled={pwdForm.busy}>
                    {pwdForm.busy ? 'SAVING…' : 'UPDATE PASSWORD →'}
                  </button>
                  <button type="button" className="btn-cancel-sm"
                    onClick={() => setPwdForm({ open: false, current: '', next: '', confirm: '', busy: false, msg: '' })}>
                    CANCEL
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
    </div>
  );
}

// ── Train Week Summary ──────────────────────────────────────────

function TrainWeekSummary({ allianceId, serverId, navigate, canManage }) {
  const [schedule, setSchedule] = useState(null);
  const [slots,    setSlots]    = useState([]);
  const [members,  setMembers]  = useState({});
  const [loading,  setLoading]  = useState(true);

  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  useEffect(() => {
    async function load() {
      const { data: sched } = await supabase
        .from('train_schedules').select('*').eq('alliance_id', allianceId).maybeSingle();
      if (!sched) { setLoading(false); return; }
      setSchedule(sched);

      const { data: slotRows } = await supabase
        .from('train_slots').select('*').eq('schedule_id', sched.id);
      setSlots(slotRows ?? []);

      const memberIds = [...new Set((slotRows ?? []).map(s => s.member_id).filter(Boolean))];
      if (memberIds.length > 0) {
        const { data: mems } = await supabase
          .from('members').select('id, username, in_game_name').in('id', memberIds);
        const map = {};
        (mems ?? []).forEach(m => { map[m.id] = m; });
        setMembers(map);
      }
      setLoading(false);
    }
    load();
  }, [allianceId]);

  if (loading) return null;

  const slotMap = {};
  slots.forEach(s => { slotMap[`${s.day_of_week}-${s.role}`] = s; });

  const hasAny = slots.some(s => s.member_id);

  return (
    <div className="ahq-panel">
      <div className="ahq-panel-header" style={{ borderColor: 'rgba(240,165,0,0.3)', color: '#f0a500' }}>
        <span>🚂 TRAIN SCHEDULE — {schedule?.week_label ?? 'Current Week'}</span>
        {canManage && (
          <button className="btn-secondary-sm" onClick={() => navigate(`/server/${serverId}/train`)}>
            EDIT →
          </button>
        )}
      </div>
      <div style={{ padding: '12px 20px 16px' }}>
        {!schedule || !hasAny ? (
          <div style={{ fontSize: 12, color: '#3a5878', padding: '12px 0' }}>
            No train schedule set yet.
            {canManage && <span> Click EDIT → to set up the week's rotation.</span>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ width: 80, padding: '4px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', borderBottom: '1px solid #1e3550' }}></th>
                  {DAYS.map(d => (
                    <th key={d} style={{ padding: '4px 6px', textAlign: 'center', fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#d0e4f4', borderBottom: '1px solid #1e3550' }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { role: 'driver', label: '🚂 DRIVER', color: '#f0a500' },
                  { role: 'vip',    label: '⭐ VIP',    color: '#c87aff' },
                ].map(({ role, label, color }) => (
                  <tr key={role}>
                    <td style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{label}</td>
                    {DAYS.map((_, d) => {
                      const slot = slotMap[`${d}-${role}`];
                      const m = slot?.member_id ? members[slot.member_id] : null;
                      return (
                        <td key={d} style={{ padding: '4px 3px', textAlign: 'center' }}>
                          <div style={{
                            padding: '4px 6px', minHeight: 32,
                            background: m ? `${color}0d` : 'transparent',
                            border: `1px solid ${m ? `${color}30` : '#1e3550'}`,
                            fontSize: 10, fontWeight: 700, color: m ? color : '#2a4058',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {m ? (m.in_game_name || m.username) : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WorldClock ───────────────────────────────────────────────────

function WorldClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function pad(n) { return String(n).padStart(2, '0'); }
  // Game server runs at UTC-2 (fixed, no DST)
  const SERVER_OFFSET_HOURS = -2;
  function fmt(d) {
    const s = new Date(d.getTime() + SERVER_OFFSET_HOURS * 3600000);
    return `${s.getUTCFullYear()}-${pad(s.getUTCMonth()+1)}-${pad(s.getUTCDate())} ${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:${pad(s.getUTCSeconds())}`;
  }
  function fmtLocal(d) {
    return d.toLocaleString(undefined, { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false });
  }

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220, background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)', padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>🌐</span>
        <div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 2 }}>SERVER TIME (UTC-2)</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 16, color: '#00c8ff', letterSpacing: '1px' }}>{fmt(now)}</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 220, background: 'rgba(0,200,255,0.02)', border: '1px solid #1e3550', padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>🕐</span>
        <div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '2px', color: '#3a5878', marginBottom: 2 }}>LOCAL TIME</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 16, color: '#d0e4f4', letterSpacing: '1px' }}>{fmtLocal(now)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Panel 4: Roster View ─────────────────────────────────────────

function RosterView({ members, alliance, myMemberId, showPower }) {
  const [search, setSearch] = useState('');
  const [filterTroop, setFilterTroop] = useState('');
  const [filterCanyon, setFilterCanyon] = useState('');
  const [filterDesert, setFilterDesert] = useState('');
  const [sortField, setSortField] = useState('power1');
  const [sortDir, setSortDir] = useState(-1);

  function handleSort(f) {
    if (sortField === f) setSortDir(d => d * -1);
    else { setSortField(f); setSortDir(-1); }
  }

  const filtered = [...members].filter(p => {
    if (search && !(p.in_game_name || '').toLowerCase().includes(search.toLowerCase()) &&
        !p.username.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTroop && p.troop1 !== filterTroop) return false;
    if (filterCanyon && p.canyon_team !== filterCanyon) return false;
    if (filterDesert && p.desert_team !== filterDesert) return false;
    return true;
  }).sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (!isNaN(parseFloat(av)) && av != null) return ((parseFloat(av) || 0) - (parseFloat(bv) || 0)) * sortDir;
    return String(av || '').localeCompare(String(bv || '')) * sortDir;
  });

  const maxP = Math.max(...members.map(p => normPower(p.power1) || 0), 1);

  function PwrCell({ pow, troop }) {
    if (!pow || pow == 0) return <td><span style={{ color: 'var(--text3)' }}>—</span></td>;
    return (
      <td>
        <div className={`pwr-badge ${tierClass(pow)}`}>
          <div className="pwr-bar-wrap">
            <span className="pwr-val">{(normPower(pow) ?? 0).toFixed(1)}M</span>
            <div className="pwr-track"><div className="pwr-fill" style={{ width: `${Math.round(((normPower(pow) ?? 0) / maxP) * 100)}%` }} /></div>
          </div>
          {troop && <span className={`trp trp-${troop}`}>{troop[0]}</span>}
        </div>
      </td>
    );
  }

  return (
    <div className="ahq-panel">
      <div className="ahq-panel-header" style={{ borderColor: `${alliance.color}50`, color: alliance.color }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: alliance.color, display: 'inline-block' }} />
          {alliance.name.toUpperCase()} — ROSTER
        </span>
        <span className="ahq-panel-sub">{members.length} members</span>
      </div>

      <div style={{ padding: '12px 20px 0' }}>
        {/* Troop type legend */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: '1.5px', color: '#3a5878', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>TROOP TYPE:</span>
          {[['Tank','🛡'],['Missile','🚀'],['Air','✈']].map(([t,icon]) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className={`trp trp-${t}`}>{t[0]}</span>
              <span style={{ fontSize: 11, color: '#7a9bb8' }}>{icon} {t}</span>
            </span>
          ))}
          <span style={{ marginLeft: 8, fontSize: 9, color: '#3a5878', fontFamily: "'Rajdhani',sans-serif" }}>— row tint matches primary troop type</span>
        </div>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <div className="ahq-controls">
          <input className="ahq-search" placeholder="Search name…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="ahq-sel" value={filterTroop} onChange={e => setFilterTroop(e.target.value)}>
            <option value="">All T1 Squads</option>
            <option value="Tank">🛡 Tank</option>
            <option value="Missile">🚀 Missile</option>
            <option value="Air">✈ Air</option>
          </select>
          <select className="ahq-sel" value={filterCanyon} onChange={e => setFilterCanyon(e.target.value)}>
            <option value="">All Canyon</option>
            <option value="A">Canyon Team A</option>
            <option value="B">Canyon Team B</option>
            <option value="any">Canyon Flexible</option>
          </select>
          <select className="ahq-sel" value={filterDesert} onChange={e => setFilterDesert(e.target.value)}>
            <option value="">All Desert</option>
            <option value="A">Desert Team A</option>
            <option value="B">Desert Team B</option>
            <option value="any">Desert Flexible</option>
          </select>
          {(filterTroop || filterCanyon || filterDesert || search) && (
            <button className="btn-cancel-sm" onClick={() => { setSearch(''); setFilterTroop(''); setFilterCanyon(''); setFilterDesert(''); }}>
              CLEAR
            </button>
          )}
        </div>
        <div className="ahq-table-wrap">
          <table className="ahq-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('in_game_name')}>Player ↕</th>
                {showPower && <th onClick={() => handleSort('power1')}>T1 Power ↕</th>}
                {showPower && <th onClick={() => handleSort('power2')}>T2 Power ↕</th>}
                {showPower && <th onClick={() => handleSort('power3')}>T3 Power ↕</th>}
                <th className="nosort">Canyon</th>
                <th className="nosort">Desert</th>
                <th className="nosort">Profession</th>
                <th onClick={() => handleSort('resistance')}>Resist ↕</th>
                <th className="nosort">Garrison</th>
                <th className="nosort">Quickstride</th>
                <th className="nosort">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="no-data"><td colSpan={11}>No members found.</td></tr>
              ) : filtered.map(p => {
                const coffee = p.coffee_buff === 'none' || !p.coffee_buff ? 0 : parseInt(p.coffee_buff) || 0;
                const totalRes = (parseInt(p.resistance) || 0) + coffee;
                const isMe = p.id === myMemberId;
                const troopClass = p.troop1 ? `row-${p.troop1.toLowerCase()}` : '';
                return (
                  <tr key={p.id} className={`${isMe ? 'me-row' : ''} ${troopClass}`}>
                    <td>
                      <span className="player-name">{p.in_game_name || p.username}</span>
                      {isMe && <span className="me-badge">ME</span>}
                      {p.alliance_role === 'alliance_admin' && <span className="role-chip admin-chip" style={{ marginLeft: 4 }}>ADMIN</span>}
                    </td>
                    {showPower ? <PwrCell pow={p.power1} troop={p.troop1} /> : null}
                    {showPower ? <PwrCell pow={p.power2} troop={p.troop2} /> : null}
                    {showPower ? <PwrCell pow={p.power3} troop={p.troop3} /> : null}
                    <td>
                      {p.canyon_team && p.canyon_team !== 'any'
                        ? <span className={`team-badge team-${p.canyon_team}`}>{p.canyon_team === 'A' ? 'Team A' : 'Team B'}{p.canyon_sub && <span className="sub-tag">SUB</span>}</span>
                        : <span className="team-badge">Flex</span>}
                    </td>
                    <td>
                      {p.desert_team && p.desert_team !== 'any'
                        ? <span className={`team-badge team-${p.desert_team}`}>{p.desert_team === 'A' ? 'Team A' : 'Team B'}{p.desert_sub && <span className="sub-tag">SUB</span>}</span>
                        : <span className="team-badge">Flex</span>}
                    </td>
                    <td>{p.profession ? <span className={`prof-chip prof-${p.profession}`}>{p.profession}</span> : '—'}</td>
                    <td>{totalRes > 0 ? <span className="resist-cell">{totalRes.toLocaleString()}</span> : <span className="resist-muted">—</span>}</td>
                    <td><span className={p.garrison === 'yes' ? 'dot dot-yes' : 'dot dot-no'} />{p.garrison === 'yes' ? 'Yes' : 'No'}</td>
                    <td><span className={p.quickstride === 'yes' ? 'dot dot-yes' : 'dot dot-no'} />{p.quickstride === 'yes' ? 'Yes' : 'No'}</td>
                    <td><span className="notes-cell" title={p.notes || ''}>{p.notes || ''}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Events View (Canyon & Desert wishlists) ───────────────────────

function EventsView({ members, alliance, myMemberId, showPower }) {
  const [tab, setTab] = useState('canyon');
  const [filterTroop, setFilterTroop] = useState('');

  function renderWishlist(type) {
    const tField  = type === 'canyon' ? 'canyon_team' : 'desert_team';
    const subField = type === 'canyon' ? 'canyon_sub'  : 'desert_sub';
    const isCan = type === 'canyon';
    const sorted = [...members]
      .filter(p => !filterTroop || p.troop1 === filterTroop)
      .sort((a, b) => (parseFloat(b.power1) || 0) - (parseFloat(a.power1) || 0));
    const cats = [
      { label: 'Team A', dot: 'dot-l-green',  time: isCan ? '12:00–12:30 (Server Time)' : '18:00–18:30 (Server Time)', filter: p => p[tField] === 'A' && !p[subField] },
      { label: 'Team B', dot: 'dot-l-orange', time: isCan ? '23:00–23:30 (Server Time)' : '09:00–09:30 (Server Time)', filter: p => p[tField] === 'B' && !p[subField] },
      { label: 'Substitutes', dot: 'dot-l-warn', time: '', filter: p => !!p[subField] },
      { label: 'Flexible',    dot: 'dot-l-gray', time: '', filter: p => p[tField] === 'any' && !p[subField] },
    ];
    return (
      <div className="teams-grid">
        {cats.map(cat => {
          const list = sorted.filter(cat.filter);
          return (
            <div className="team-box" key={cat.label}>
              <div className="team-box-header">
                <div className={`dot-l ${cat.dot}`} />
                {cat.label}
                {cat.time && <span className="team-time">{cat.time}</span>}
                <span className="team-count">{list.length}</span>
              </div>
              <div className="team-body">
                {list.length === 0
                  ? <div className="team-empty">No entries</div>
                  : list.map(p => (
                    <div className="team-player" key={p.id}>
                      <span className="tp-name">
                        {p.in_game_name || p.username}
                        {p.id === myMemberId && <span className="me-badge" style={{ marginLeft: 5 }}>ME</span>}
                      </span>
                      {p.troop1 && <span className={`trp trp-${p.troop1}`}>{p.troop1[0]}</span>}
                      {showPower && p.power1 != null && <span className="tp-pwr">{(normPower(p.power1) ?? 0).toFixed(1)}M</span>}
                    </div>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="ahq-panel">
      <div className="ahq-panel-header" style={{ borderColor: 'rgba(0,232,122,0.3)', color: '#00e87a' }}>
        <span>⚔️ EVENTS</span>
        <span className="ahq-panel-sub">{members.length} members</span>
      </div>
      <div className="ahq-tab-row" style={{ padding: '0 20px' }}>
        {['canyon', 'desert'].map(t => (
          <button key={t} className={`ahq-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'canyon' ? '🏔 CANYON STORM' : '🏜 DESERT STORM'}
          </button>
        ))}
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div className="ahq-controls" style={{ marginBottom: 14 }}>
          <select className="ahq-sel" value={filterTroop} onChange={e => setFilterTroop(e.target.value)}>
            <option value="">All T1 Squads</option>
            <option value="Tank">🛡 Tank</option>
            <option value="Missile">🚀 Missile</option>
            <option value="Air">✈ Air</option>
          </select>
          {filterTroop && <button className="btn-cancel-sm" onClick={() => setFilterTroop('')}>CLEAR</button>}
        </div>
        {renderWishlist(tab)}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>
      Loading…
    </div>
  );
}

export default function AllianceHQ() {
  const { serverId } = useParams();
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();
  const { session }  = useAuth();
  const [toast, showToast] = useToast();

  const activeSession    = session?.serverId === serverId ? session : null;
  const role             = activeSession?.role;
  const isAdmin          = role === 'admin';
  const allianceRole     = activeSession?.allianceRole;
  const isOwner          = allianceRole === 'owner';
  const canManage        = isAdmin || isOwner || allianceRole === 'alliance_admin';

  const [server,          setServer]          = useState(null);
  const [alliance,        setAlliance]        = useState(null);
  const [members,         setMembers]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const initialTab = searchParams.get('tab') || 'home';
  const [mainTab, setMainTab] = useState(initialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const effectiveAllianceId = activeSession?.allianceId;

  useEffect(() => {
    if (!activeSession) { navigate(`/server/${serverId}`); return; }

    async function init() {
      const { data: srv } = await supabase.from('servers').select('id, server_number, name').eq('id', serverId).single();
      setServer(srv);
      setLoading(false);
    }
    init();
  }, [serverId, activeSession, navigate]);

  const loadAlliance = useCallback(async () => {
    if (!effectiveAllianceId) return;
    setLoading(true);
    const [{ data: al }, { data: mbs }] = await Promise.all([
      supabase.from('alliances').select('*').eq('id', effectiveAllianceId).single(),
      supabase.from('members').select('*').eq('alliance_id', effectiveAllianceId).order('in_game_name'),
    ]);
    setAlliance(al);
    setMembers(mbs ?? []);
    setLoading(false);
  }, [effectiveAllianceId]);

  useEffect(() => { loadAlliance(); }, [loadAlliance]);

  if (!activeSession) return null;
  if (loading) return <LoadingScreen />;

  const showRoster = canManage || alliance?.roster_public !== false || (role === 'member' && activeSession?.allianceId === effectiveAllianceId);
  const showPowerInRoster = canManage || alliance?.roster_show_power !== false;

  // Build nav items for sidebar
  const sidebarNavItems = [
    { id: 'home',    label: 'HOME',       icon: '🏠', show: true },
    { id: 'events',  label: 'EVENTS',     icon: '⚔️', show: true },
    { id: 'profile', label: 'MY PROFILE', icon: '👤', show: !!activeSession?.memberId },
    { id: 'manage',  label: 'MANAGE',     icon: '⚙️', show: canManage },
  ].filter(t => t.show);

  return (
    <div className="ahq-root">
      {/* Topbar */}
      <div className="ahq-topbar">
        <button className="ahq-hamburger" onClick={() => setMobileOpen(o => !o)} aria-label="Menu">
          ☰
        </button>
        <button className="ahq-back-btn" onClick={() => navigate(`/server/${serverId}`)}>
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> BACK
        </button>
        <div className="ahq-topbar-center">
          {alliance
            ? <span style={{ color: alliance.color }}>⚔ {alliance.name.toUpperCase()}</span>
            : <span>ALLIANCE HQ</span>}
        </div>
        <div className="ahq-topbar-right">
          {isAdmin                                     && <span className="ahq-role-badge role-admin">⚡ SERVER ADMIN</span>}
          {!isAdmin && isOwner                         && <span className="ahq-role-badge role-owner">👑 ALLIANCE OWNER</span>}
          {!isAdmin && !isOwner && allianceRole === 'alliance_admin' && <span className="ahq-role-badge role-alladmin">🛡 ALLIANCE ADMIN</span>}
          {!isAdmin && !isOwner && allianceRole === 'member'         && <span className="ahq-role-badge role-member">👤 {activeSession.username}</span>}
        </div>
      </div>

      {/* Sidebar */}
      <nav className={`ahq-sidebar${sidebarCollapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="ahq-sidebar-nav">
          {sidebarNavItems.map(item => (
            <button
              key={item.id}
              className={`ahq-sidebar-nav-item${mainTab === item.id ? ' active' : ''}`}
              onClick={() => { setMainTab(item.id); setMobileOpen(false); }}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="snav-icon">{item.icon}</span>
              <span className="snav-label">{item.label}</span>
            </button>
          ))}

          {/* Extra links */}
          {effectiveAllianceId && (
            <>
              <div className="ahq-sidebar-divider" />
              <button
                className="ahq-sidebar-nav-item"
                onClick={() => { navigate(`/server/${serverId}/map`); setMobileOpen(false); }}
                title={sidebarCollapsed ? 'MAP' : undefined}
              >
                <span className="snav-icon">🗺</span>
                <span className="snav-label">MAP <span style={{ fontSize: 9, color: '#f0a500', marginLeft: 4 }}>WIP</span></span>
              </button>
            </>
          )}
          {(canManage) && (
            <button
              className="ahq-sidebar-nav-item"
              onClick={() => { navigate(`/server/${serverId}/train`); setMobileOpen(false); }}
              title={sidebarCollapsed ? 'TRAIN PLANNER' : undefined}
            >
              <span className="snav-icon">🚂</span>
              <span className="snav-label">TRAIN PLANNER</span>
            </button>
          )}
          {(isAdmin || role === 'helper') && (
            <button
              className="ahq-sidebar-nav-item"
              onClick={() => { navigate(`/server/${serverId}/admin`); setMobileOpen(false); }}
              title={sidebarCollapsed ? 'SERVER ADMIN' : undefined}
            >
              <span className="snav-icon">⚡</span>
              <span className="snav-label">SERVER ADMIN</span>
            </button>
          )}
        </div>
        <div className="ahq-sidebar-collapse-btn">
          <button onClick={() => setSidebarCollapsed(c => !c)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>
      </nav>

      <div className={`ahq-toast${toast.show ? ' show' : ''}${toast.err ? ' err' : ''}`}>{toast.msg}</div>

      <main className={`ahq-main${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>

        {/* 🏠 HOME — Train schedule + Roster */}
        {(!effectiveAllianceId || mainTab === 'home') && (
          <>
            {effectiveAllianceId && alliance ? (
              <>
                <WorldClock />
                <TrainWeekSummary allianceId={effectiveAllianceId} serverId={serverId} navigate={navigate} canManage={canManage} />
                {showRoster ? (
                  <RosterView
                    members={members}
                    alliance={alliance}
                    myMemberId={activeSession?.memberId}
                    showPower={showPowerInRoster}
                  />
                ) : (
                  <div className="ahq-panel" style={{ textAlign: 'center', padding: 40, color: '#3a5878' }}>
                    🔒 This alliance's roster is private.
                  </div>
                )}
              </>
            ) : (
              <div className="ahq-panel" style={{ textAlign: 'center', padding: 48, color: '#3a5878' }}>
                No alliance assigned to your account. Ask your server admin to assign you to an alliance.
              </div>
            )}
          </>
        )}

        {/* ⚔️ EVENTS — Canyon & Desert wishlists */}
        {effectiveAllianceId && alliance && mainTab === 'events' && (
          showRoster ? (
            <EventsView
              members={members}
              alliance={alliance}
              myMemberId={activeSession?.memberId}
              showPower={showPowerInRoster}
            />
          ) : (
            <div className="ahq-panel" style={{ textAlign: 'center', padding: 40, color: '#3a5878' }}>
              🔒 This alliance's roster is private.
            </div>
          )
        )}

        {/* 👤 MY PROFILE */}
        {mainTab === 'profile' && activeSession?.memberId && (
          <>
            {searchParams.get('welcome') === '1' && (
              <div style={{ margin: '16px 24px 0', padding: '14px 18px', background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '1px' }}>
                🎉 WELCOME! Fill in your stats below so your alliance leaders can plan events around you.
              </div>
            )}
            <MyProfilePanel
              memberId={activeSession.memberId}
              members={members}
              showToast={showToast}
              onReload={loadAlliance}
            />
          </>
        )}

        {/* ⚙️ MANAGE */}
        {mainTab === 'manage' && canManage && effectiveAllianceId && alliance && (
          <ManagementPanel
            alliance={alliance}
            members={members}
            isOwner={isOwner}
            showToast={showToast}
            onReload={loadAlliance}
          />
        )}

      </main>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@400;600&display=swap');`}</style>
    </div>
  );
}
