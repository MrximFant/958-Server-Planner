import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
    power1:      m.power1 != null ? String(m.power1) : '',
    power2:      m.power2 != null ? String(m.power2) : '',
    power3:      m.power3 != null ? String(m.power3) : '',
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

        <div className="section-div sd-squads">Squad Powers</div>

        <div className="form-group">
          <label className="form-label">T1 Power</label>
          <input type="number" className="form-control" step="0.01" min="0" value={form.power1} onChange={e => set('power1', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">T1 Troop Type</label>
          <select className="form-control" value={form.troop1} onChange={e => set('troop1', e.target.value)}>
            <option value="">—</option>
            <option value="Tank">Tank</option>
            <option value="Air">Air</option>
            <option value="Missile">Missile</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">T2 Power <span className="opt">(opt)</span></label>
          <input type="number" className="form-control" step="0.01" min="0" value={form.power2} onChange={e => set('power2', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">T2 Troop Type</label>
          <select className="form-control" value={form.troop2} onChange={e => set('troop2', e.target.value)}>
            <option value="">—</option>
            <option value="Tank">Tank</option>
            <option value="Air">Air</option>
            <option value="Missile">Missile</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">T3 Power <span className="opt">(opt)</span></label>
          <input type="number" className="form-control" step="0.01" min="0" value={form.power3} onChange={e => set('power3', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">T3 Troop Type</label>
          <select className="form-control" value={form.troop3} onChange={e => set('troop3', e.target.value)}>
            <option value="">—</option>
            <option value="Tank">Tank</option>
            <option value="Air">Air</option>
            <option value="Missile">Missile</option>
          </select>
        </div>
        <div className="form-group fg-full">
          <CheckBox checked={form.hasSquad4} onChange={v => set('hasSquad4', v)} label={<b>Squad 4 unlocked</b>} />
        </div>

        <div className="section-div sd-events">Event Wishes</div>

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
    ? ['ROSTER', 'ADMINS', 'SETTINGS']
    : ['ROSTER', 'INVITE'];
  const [tab, setTab] = useState('ROSTER');
  const [editingMember, setEditingMember] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Settings state (owner only)
  const [pwdForm, setPwdForm] = useState({ newPwd: '', confirmPwd: '' });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [rosterPublic, setRosterPublic] = useState(alliance?.roster_public ?? true);
  const [showPower, setShowPower] = useState(alliance?.roster_show_power ?? true);
  const [visibilityBusy, setVisibilityBusy] = useState(false);

  async function handleEditSave(dbData) {
    setSaving(true);
    const { error } = await supabase.from('members').update(dbData).eq('id', editingMember.id);
    setSaving(false);
    if (error) { showToast('Save failed: ' + error.message, true); return; }
    showToast('Member updated.');
    setEditingMember(null);
    onReload();
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

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwdMsg('');
    if (!pwdForm.newPwd.trim()) { setPwdMsg('error:Password cannot be empty.'); return; }
    if (pwdForm.newPwd !== pwdForm.confirmPwd) { setPwdMsg('error:Passwords do not match.'); return; }
    setPwdBusy(true);
    const hash = await hashPassword(pwdForm.newPwd);
    const { error } = await supabase.from('alliances').update({ owner_password: hash }).eq('id', alliance.id);
    setPwdBusy(false);
    if (error) { setPwdMsg('error:' + error.message); return; }
    setPwdMsg('ok:Password updated.');
    setPwdForm({ newPwd: '', confirmPwd: '' });
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
            'Your owner password can be changed below — share the new one with anyone who needs access.',
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
                  onCancel={() => setEditingMember(null)}
                  saving={saving}
                />
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

            {/* Change owner password */}
            <div className="settings-card">
              <div className="settings-label">CHANGE OWNER PASSWORD</div>
              <form onSubmit={handlePasswordChange}>
                <PwdField label="NEW PASSWORD" value={pwdForm.newPwd} onChange={v => setPwdForm(f => ({ ...f, newPwd: v }))} />
                <PwdField label="CONFIRM PASSWORD" value={pwdForm.confirmPwd} onChange={v => setPwdForm(f => ({ ...f, confirmPwd: v }))} />
                {pwdMsg && (
                  <p style={{ fontSize: 12, margin: '0 0 10px', color: pwdMsg.startsWith('ok:') ? '#00e87a' : '#ff4060' }}>
                    {pwdMsg.replace(/^(ok|error):/, '')}
                  </p>
                )}
                <button type="submit" className="btn-primary" disabled={pwdBusy}>
                  {pwdBusy ? 'SAVING…' : 'UPDATE PASSWORD →'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel 3: My Profile ──────────────────────────────────────────

function MyProfilePanel({ memberId, members, showToast, onReload }) {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const member = members.find(m => m.id === memberId) || null;

  async function handleSave(dbData) {
    setSaving(true);
    const { error } = await supabase.from('members').update(dbData).eq('id', memberId);
    setSaving(false);
    if (error) { showToast('Save failed: ' + error.message, true); return; }
    showToast('Profile saved!');
    onReload();
  }

  return (
    <div className="ahq-panel">
      <div
        className="ahq-panel-header"
        style={{ cursor: 'pointer', borderColor: 'rgba(0,200,255,0.3)', color: '#00c8ff' }}
        onClick={() => setOpen(o => !o)}
      >
        <span>👤 MY PROFILE</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {member?.in_game_name && <span style={{ fontSize: 12, color: '#7a9bb8', fontWeight: 400 }}>{member.in_game_name}</span>}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </div>
      {open && (
        <div style={{ padding: '16px 20px 20px' }}>
          <HelpCard title="ABOUT YOUR PROFILE" lines={[
            'Keep your T1 power and troop type up to date — alliance leaders use this for Canyon Storm and Desert Storm planning.',
            'Set your Canyon and Desert Storm team preference so the owner can build balanced teams.',
            'Resistance and coffee buff affect your total resistance shown to leadership.',
            'Only you can edit this panel. Your alliance owner or admin can also edit your stats if needed.',
          ]} />
          <MemberForm
            initialData={member}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}

// ── Panel 4: Roster View ─────────────────────────────────────────

function RosterView({ members, alliance, myMemberId, showPower }) {
  const [tab, setTab] = useState('roster');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('power1');
  const [sortDir, setSortDir] = useState(-1);

  function handleSort(f) {
    if (sortField === f) setSortDir(d => d * -1);
    else { setSortField(f); setSortDir(-1); }
  }

  const filtered = [...members].filter(p => {
    if (!search) return true;
    return (p.in_game_name || '').toLowerCase().includes(search.toLowerCase()) ||
           p.username.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (!isNaN(parseFloat(av)) && av != null) return ((parseFloat(av) || 0) - (parseFloat(bv) || 0)) * sortDir;
    return String(av || '').localeCompare(String(bv || '')) * sortDir;
  });

  const maxP = Math.max(...members.map(p => parseFloat(p.power1) || 0), 1);

  function PwrCell({ pow, troop }) {
    if (!pow || pow == 0) return <td><span style={{ color: 'var(--text3)' }}>—</span></td>;
    return (
      <td>
        <div className={`pwr-badge ${tierClass(pow)}`}>
          <div className="pwr-bar-wrap">
            <span className="pwr-val">{parseFloat(pow).toFixed(1)}</span>
            <div className="pwr-track"><div className="pwr-fill" style={{ width: `${Math.round((parseFloat(pow) / maxP) * 100)}%` }} /></div>
          </div>
          {troop && <span className={`trp trp-${troop}`}>{troop[0]}</span>}
        </div>
      </td>
    );
  }

  function renderWishlist(type) {
    const tField  = type === 'canyon' ? 'canyon_team' : 'desert_team';
    const subField = type === 'canyon' ? 'canyon_sub'  : 'desert_sub';
    const isCan = type === 'canyon';
    const sorted = [...members].sort((a, b) => (parseFloat(b.power1) || 0) - (parseFloat(a.power1) || 0));
    const cats = [
      { label: 'Team A', dot: 'dot-l-green',  time: isCan ? '12:00–12:30' : '18:00–18:30', filter: p => p[tField] === 'A' && !p[subField] },
      { label: 'Team B', dot: 'dot-l-orange', time: isCan ? '23:00–23:30' : '09:00–09:30', filter: p => p[tField] === 'B' && !p[subField] },
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
                      {showPower && p.power1 != null && <span className="tp-pwr">{parseFloat(p.power1).toFixed(1)}</span>}
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
      <div className="ahq-panel-header" style={{ borderColor: `${alliance.color}50`, color: alliance.color }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: alliance.color, display: 'inline-block' }} />
          {alliance.name.toUpperCase()} — ROSTER
        </span>
        <span className="ahq-panel-sub">{members.length} members</span>
      </div>

      <div className="ahq-tab-row" style={{ padding: '0 20px' }}>
        {['roster', 'canyon', 'desert'].map(t => (
          <button key={t} className={`ahq-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'roster' ? 'ROSTER' : t === 'canyon' ? 'CANYON WISHLIST' : 'DESERT WISHLIST'}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        {tab === 'roster' && (
          <>
            <div className="ahq-controls">
              <input className="ahq-search" placeholder="Search name…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="ahq-table-wrap">
              <table className="ahq-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('in_game_name')}>Player ↕</th>
                    {showPower && <th onClick={() => handleSort('power1')}>T1 Power ↕</th>}
                    <th className="nosort">T1 Troop</th>
                    {showPower && <th onClick={() => handleSort('power2')}>T2 ↕</th>}
                    {showPower && <th onClick={() => handleSort('power3')}>T3 ↕</th>}
                    <th className="nosort">Canyon</th>
                    <th className="nosort">Desert</th>
                    <th className="nosort">Profession</th>
                    <th onClick={() => handleSort('resistance')}>Resist ↕</th>
                    <th className="nosort">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr className="no-data"><td colSpan={10}>No members found.</td></tr>
                  ) : filtered.map(p => {
                    const coffee = p.coffee_buff === 'none' || !p.coffee_buff ? 0 : parseInt(p.coffee_buff) || 0;
                    const totalRes = (parseInt(p.resistance) || 0) + coffee;
                    const isMe = p.id === myMemberId;
                    return (
                      <tr key={p.id} className={isMe ? 'me-row' : ''}>
                        <td>
                          <span className="player-name">{p.in_game_name || p.username}</span>
                          {isMe && <span className="me-badge">ME</span>}
                          {p.alliance_role === 'alliance_admin' && <span className="role-chip admin-chip" style={{ marginLeft: 4 }}>ADMIN</span>}
                        </td>
                        {showPower ? <PwrCell pow={p.power1} troop={p.troop1} /> : null}
                        <td>{p.troop1 ? <span className={`trp trp-${p.troop1}`}>{p.troop1}</span> : '—'}</td>
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
                        <td><span className="notes-cell" title={p.notes || ''}>{p.notes || ''}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(tab === 'canyon' || tab === 'desert') && renderWishlist(tab)}
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
  const { session }  = useAuth();
  const [toast, showToast] = useToast();

  const activeSession    = session?.serverId === serverId ? session : null;
  const role             = activeSession?.role;
  const isAdmin          = role === 'admin';
  const isOwner          = role === 'owner';
  const allianceRole     = activeSession?.allianceRole;
  const canManage        = isOwner || allianceRole === 'alliance_admin';

  const [server,          setServer]          = useState(null);
  const [alliance,        setAlliance]        = useState(null);
  const [alliances,       setAlliances]       = useState([]);
  const [members,         setMembers]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [viewAllianceId,  setViewAllianceId]  = useState(null);

  const effectiveAllianceId = isAdmin ? viewAllianceId : activeSession?.allianceId;

  useEffect(() => {
    if (!activeSession) { navigate(`/server/${serverId}`); return; }

    async function init() {
      const { data: srv } = await supabase.from('servers').select('id, server_number, name').eq('id', serverId).single();
      setServer(srv);
      if (isAdmin) {
        const { data: als } = await supabase.from('alliances').select('id, name, color').eq('server_id', serverId).order('name');
        setAlliances(als ?? []);
      }
      setLoading(false);
    }
    init();
  }, [serverId, isAdmin, activeSession, navigate]);

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

  return (
    <div className="ahq-root">
      {/* Topbar */}
      <div className="ahq-topbar">
        <button className="ahq-back-btn" onClick={() => navigate(`/server/${serverId}`)}>
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> BACK
        </button>
        <div className="ahq-topbar-center">
          {alliance
            ? <span style={{ color: alliance.color }}>⚔ {alliance.name.toUpperCase()}</span>
            : <span>ALLIANCE HQ</span>}
        </div>
        <div className="ahq-topbar-right">
          {isAdmin          && <span className="ahq-role-badge role-admin">⚡ ADMIN</span>}
          {isOwner          && <span className="ahq-role-badge role-owner">👑 OWNER</span>}
          {!isAdmin && !isOwner && allianceRole === 'alliance_admin' && <span className="ahq-role-badge role-alladmin">🛡 ALLIANCE ADMIN</span>}
          {!isAdmin && !isOwner && allianceRole === 'member'         && <span className="ahq-role-badge role-member">👤 {activeSession.username}</span>}
        </div>
      </div>

      <div className={`ahq-toast${toast.show ? ' show' : ''}${toast.err ? ' err' : ''}`}>{toast.msg}</div>

      <main className="ahq-main">
        {/* Panel 1 — Admin alliance picker */}
        {isAdmin && (
          <div className="ahq-panel">
            <div className="ahq-panel-header" style={{ borderColor: 'rgba(240,165,0,0.3)', color: '#f0a500' }}>
              <span>⚡ SERVER ADMIN VIEW</span>
              <button className="btn-secondary-sm" onClick={() => navigate(`/server/${serverId}/admin`)}>
                ADMIN PANEL →
              </button>
            </div>
            <div style={{ padding: '14px 20px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>SELECT ALLIANCE</label>
              <select
                className="ahq-sel"
                value={viewAllianceId || ''}
                onChange={e => setViewAllianceId(e.target.value || null)}
                style={{ minWidth: 240 }}
              >
                <option value="">— Pick an alliance —</option>
                {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>

              {alliance && members.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: alliance.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, color: alliance.color }}>{alliance.name}</span>
                    <span style={{ fontSize: 12, color: '#3a5878' }}>— {members.length} member{members.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {members.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,200,255,0.03)', border: '1px solid #1a2d42', fontSize: 13 }}>
                        <span style={{ color: '#d0e4f4', fontWeight: 600 }}>{m.in_game_name || m.username}</span>
                        {m.in_game_name && m.in_game_name !== m.username && (
                          <span style={{ color: '#3a5878', fontSize: 11, fontFamily: "'Share Tech Mono',monospace" }}>@{m.username}</span>
                        )}
                        {m.alliance_role === 'alliance_admin' && <span className="role-chip admin-chip">ADMIN</span>}
                      </div>
                    ))}
                  </div>
                  <p style={{ color: '#3a5878', fontSize: 11, marginTop: 10 }}>Player stats are managed by the alliance owner and admins.</p>
                </div>
              )}

              {alliance && members.length === 0 && (
                <p style={{ color: '#3a5878', fontSize: 13, marginTop: 16 }}>No members in this alliance yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Panel 2 — Alliance Management */}
        {canManage && effectiveAllianceId && alliance && (
          <ManagementPanel
            alliance={alliance}
            members={members}
            isOwner={isOwner}
            showToast={showToast}
            onReload={loadAlliance}
          />
        )}

        {/* Panel 3 — My Profile */}
        {activeSession?.memberId && (
          <MyProfilePanel
            memberId={activeSession.memberId}
            members={members}
            showToast={showToast}
            onReload={loadAlliance}
          />
        )}

        {/* Panel 4 — Roster View */}
        {alliance && (showRoster ? (
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
        ))}

        {!effectiveAllianceId && !isAdmin && (
          <div className="ahq-panel" style={{ textAlign: 'center', padding: 48, color: '#3a5878' }}>
            No alliance assigned to your account.
          </div>
        )}
      </main>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@400;600&display=swap');`}</style>
    </div>
  );
}
