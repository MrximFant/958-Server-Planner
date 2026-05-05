import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import './AllianceHQ.css';

// ── DB mapping helpers ───────────────────────────────────────
const fromDB = (r) => ({
  id: r.id, name: r.name,
  power1: r.power1 || 0, power2: r.power2 || 0, power3: r.power3 || 0,
  hasSquad4:  r.has_squad4  || 'no',
  troop1: r.troop1 || '', troop2: r.troop2 || '', troop3: r.troop3 || '',
  canyonTeam: r.canyon_team || 'any', canyonSub:  r.canyon_sub  || 'no',
  desertTeam: r.desert_team || 'any', desertSub:  r.desert_sub  || 'no',
  profession: r.profession  || '',
  garrison:   r.garrison    || 'no',
  quickstride: r.quickstride || 'no',
  resistance: r.resistance  || 0,
  coffeeBuff: r.coffee_buff  || 'none',
  notes: r.notes || '',
});

const toDB = (p) => ({
  id: p.id, name: p.name,
  power1: p.power1, power2: p.power2, power3: p.power3,
  has_squad4:  p.hasSquad4,
  troop1: p.troop1, troop2: p.troop2, troop3: p.troop3,
  canyon_team: p.canyonTeam, canyon_sub: p.canyonSub,
  desert_team: p.desertTeam, desert_sub: p.desertSub,
  profession: p.profession, garrison: p.garrison, quickstride: p.quickstride,
  resistance: p.resistance, coffee_buff: p.coffeeBuff,
  notes: p.notes, last_updated: new Date().toISOString(),
});

// ── UI helpers ───────────────────────────────────────────────
function tierClass(v) {
  const n = parseFloat(v) || 0;
  if (n >= 50) return 'tier-diamond';
  if (n >= 40) return 'tier-gold';
  if (n >= 30) return 'tier-silver';
  if (n >  0)  return 'tier-bronze';
  return 'tier-none';
}


function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// Optional Discord notification (put webhook URL in .env as VITE_DISCORD_WEBHOOK)
async function notifyDiscord(player, action) {
  const url = import.meta.env.VITE_DISCORD_WEBHOOK;
  if (!url) return;
  const coffee = player.coffeeBuff !== 'none' ? parseInt(player.coffeeBuff) : 0;
  const totalRes = (parseInt(player.resistance) || 0) + coffee;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ title: `⚔️ ${action}: ${player.name}`, color: 5814783,
        fields: [
          { name: 'S1',         value: `${player.power1} (${player.troop1})`, inline: true },
          { name: 'Canyon',     value: `Team ${player.canyonTeam}${player.canyonSub==='yes'?' (Sub)':''}`, inline: true },
          { name: 'Desert',     value: `Team ${player.desertTeam}${player.desertSub==='yes'?' (Sub)':''}`, inline: true },
          { name: 'Resistance', value: `${totalRes}`, inline: true },
        ],
        footer: { text: '958 Alliance HQ' }, timestamp: new Date().toISOString(),
      }]}),
    });
  } catch(e) { console.warn('Discord webhook failed', e); }
}

// ── CheckBox component ───────────────────────────────────────
function CheckBox({ checked, onChange, label, subLabel }) {
  return (
    <label className="check-row">
      <span className="custom-check">
        <span className={`check-mark${checked ? ' checked' : ''}`} onClick={() => onChange(!checked)} />
      </span>
      <span className="check-label">
        {label} {subLabel && <><br /><small>{subLabel}</small></>}
      </span>
    </label>
  );
}

// ── Toast ────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState({ msg: '', err: false, show: false });
  const showToast = (msg, err = false) => {
    setToast({ msg, err, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };
  return [toast, showToast];
}

// ════════════════════════════════════════════════════════════
export default function AllianceHQ() {
  const [players,     setPlayers]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [myId,        setMyId]        = useState(() => localStorage.getItem('allianceMyId') || null);
  const [activeTab,   setActiveTab]   = useState('roster');
  const [modalOpen,   setModalOpen]   = useState(false);
  const [sortField,   setSortField]   = useState('power1');
  const [sortDir,     setSortDir]     = useState(-1);
  const [search,      setSearch]      = useState('');
  const [fTroop,      setFTroop]      = useState('');
  const [fCanyon,     setFCanyon]     = useState('');
  const [fDesert,     setFDesert]     = useState('');
  const [fSub,        setFSub]        = useState('');
  const [toast, showToast] = useToast();

  // Profile form state
  const [form, setForm] = useState({
    name:'', power1:'', power2:'', power3:'',
    hasSquad4:'no', troop1:'', troop2:'', troop3:'',
    canyonTeam:'', canyonSub:'no', desertTeam:'', desertSub:'no',
    profession:'', resistance:'', garrison:'no', quickstride:'no',
    coffeeBuff:'none', notes:'',
  });
  const [saving, setSaving] = useState(false);

  // ── Load players ──────────────────────────────────────────
  const loadPlayers = useCallback(async () => {
    const { data, error } = await supabase.from('players').select('*').order('power1', { ascending: false });
    if (error) { showToast('Failed to load players', true); return; }
    setPlayers((data || []).map(fromDB));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlayers();
    // Realtime
    const channel = supabase.channel('alliance-hq')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadPlayers)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadPlayers]);

  useEffect(() => {
    if (!myId && !loading) setTimeout(() => openProfile(), 700);
  }, [loading]);

  // ── Filtering & sorting ───────────────────────────────────
  const filtered = [...players].filter(p => {
    if (search && !(p.name||'').toLowerCase().includes(search.toLowerCase())) return false;
    if (fTroop  && p.troop1 !== fTroop)   return false;
    if (fCanyon && p.canyonTeam !== fCanyon) return false;
    if (fDesert && p.desertTeam !== fDesert) return false;
    if (fSub === 'yes' && p.canyonSub !== 'yes' && p.desertSub !== 'yes') return false;
    return true;
  }).sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (!isNaN(parseFloat(av)) && av !== '') return (parseFloat(av) - parseFloat(bv)) * sortDir;
    return String(av||'').localeCompare(String(bv||'')) * sortDir;
  });

  function handleSort(f) {
    if (sortField === f) setSortDir(d => d * -1);
    else { setSortField(f); setSortDir(-1); }
  }

  // ── Profile modal ─────────────────────────────────────────
  function openProfile() {
    const me = players.find(p => p.id === myId);
    if (me) setForm({ ...me, power1: me.power1||'', power2: me.power2||'', power3: me.power3||'' });
    else    setForm({ name:'', power1:'', power2:'', power3:'', hasSquad4:'no', troop1:'', troop2:'', troop3:'', canyonTeam:'', canyonSub:'no', desertTeam:'', desertSub:'no', profession:'', resistance:'', garrison:'no', quickstride:'no', coffeeBuff:'none', notes:'' });
    setModalOpen(true);
  }

  async function saveProfile() {
    if (!form.name.trim())   { showToast('Name is required', true);    return; }
    if (!form.power1)        { showToast('S1 Power is required', true); return; }
    if (!form.troop1)        { showToast('S1 Troop type is required', true); return; }
    if (!form.canyonTeam)    { showToast('Canyon team is required', true); return; }
    if (!form.desertTeam)    { showToast('Desert team is required', true); return; }

    setSaving(true);
    const id = myId || uid();
    const row = toDB({ ...form, id });

    const { error } = await supabase.from('players').upsert(row);
    setSaving(false);
    if (error) { showToast('Save failed: ' + error.message, true); return; }

    localStorage.setItem('allianceMyId', id);
    setMyId(id);
    setModalOpen(false);
    showToast('Profile saved!');
    const isNew = !players.find(p => p.id === id);
    notifyDiscord({ ...form, id }, isNew ? 'New Registration' : 'Profile Updated');
    loadPlayers();
  }

  async function deletePlayer(id) {
    if (!confirm('Remove this player?')) return;
    const pin = prompt('Enter Admin PIN:');
    if (!pin) return;
    const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '060606';
    if (pin !== ADMIN_PIN) { showToast('Invalid Admin PIN', true); return; }
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) { showToast('Delete failed', true); return; }
    showToast('Player removed');
    loadPlayers();
  }

  // ── Wishlist rendering ────────────────────────────────────
  function renderWishlist(type) {
    const tField  = type === 'canyon' ? 'canyonTeam' : 'desertTeam';
    const subField = type === 'canyon' ? 'canyonSub'  : 'desertSub';
    const isCan = type === 'canyon';
    const cats = [
      { label:'Team A', dot:'dot-l-green',  time: isCan ? '12:00–12:30 Server' : '18:00–18:30 Server', filter: p => p[tField]==='A' && p[subField]!=='yes' },
      { label:'Team B', dot:'dot-l-orange', time: isCan ? '23:00–23:30 Server' : '09:00–09:30 Server', filter: p => p[tField]==='B' && p[subField]!=='yes' },
      { label:'Substitutes', dot:'dot-l-warn', time:'', filter: p => p[subField]==='yes' },
      { label:'Flexible',    dot:'dot-l-gray', time:'', filter: p => p[tField]==='any' && p[subField]!=='yes' },
    ];
    const sorted = [...players].sort((a,b)=>(parseFloat(b.power1)||0)-(parseFloat(a.power1)||0));
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
                      <span className="tp-name">{p.name}{p.id===myId && <span className="me-badge" style={{marginLeft:5}}>ME</span>}</span>
                      {p.troop1 && <span className={`trp trp-${p.troop1}`}>{p.troop1[0]}</span>}
                      <span className="tp-pwr">{parseFloat(p.power1).toFixed(1)}</span>
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

  // ── Power cell ────────────────────────────────────────────
  function PwrCell({ pow, troop, maxP }) {
    if (!pow || pow == 0) return <td><span style={{color:'var(--text3)'}}>—</span></td>;
    const pct = Math.round((parseFloat(pow) / maxP) * 100);
    return (
      <td>
        <div className={`pwr-badge ${tierClass(pow)}`}>
          <div className="pwr-bar-wrap">
            <span className="pwr-val">{parseFloat(pow).toFixed(1)}</span>
            <div className="pwr-track"><div className="pwr-fill" style={{width:`${pct}%`}} /></div>
          </div>
          {troop && <span className={`trp trp-${troop}`}>{troop[0]}</span>}
        </div>
      </td>
    );
  }

  const maxP = Math.max(...filtered.map(p => parseFloat(p.power1)||0), 1);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="ahq-root">
      <Navbar />

      {/* Toast */}
      <div className={`ahq-toast${toast.show ? ' show' : ''}${toast.err ? ' err' : ''}`}>
        {toast.msg}
      </div>

      <main className="ahq-main">
        {/* Page header */}
        <div className="ahq-page-header">
          <div className="ahq-title">⚔ Alliance HQ <span style={{fontSize:9,opacity:.35,fontWeight:400,letterSpacing:1}}>v2.0</span></div>
          <div style={{display:'flex', alignItems:'center', gap:20}}>
            <div>
              <div className="ahq-hstat-val">{players.length}</div>
              <div className="ahq-hstat-label">Members</div>
            </div>
            <button className="btn-primary" onClick={openProfile}>My Profile</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="ahq-tab-row">
          {['roster','canyon','desert'].map(tab => (
            <button key={tab} className={`ahq-tab${activeTab===tab?' active':''}`} onClick={() => setActiveTab(tab)}>
              {tab === 'roster' ? 'Roster' : tab === 'canyon' ? 'Canyon Wishlist' : 'Desert Wishlist'}
            </button>
          ))}
        </div>

        {/* ── Roster ── */}
        {activeTab === 'roster' && (
          <>
            <div className="ahq-controls">
              <input className="ahq-search" placeholder="Search player name…" value={search} onChange={e=>setSearch(e.target.value)} />
              <select className="ahq-sel" value={fTroop}  onChange={e=>setFTroop(e.target.value)}>
                <option value="">All Troops</option>
                <option value="Tank">Tank</option>
                <option value="Air">Air</option>
                <option value="Missile">Missile</option>
              </select>
              <select className="ahq-sel" value={fCanyon} onChange={e=>setFCanyon(e.target.value)}>
                <option value="">All Canyon</option>
                <option value="A">Team A (12:00)</option>
                <option value="B">Team B (23:00)</option>
                <option value="any">Flexible</option>
              </select>
              <select className="ahq-sel" value={fDesert} onChange={e=>setFDesert(e.target.value)}>
                <option value="">All Desert</option>
                <option value="A">Team A (18:00)</option>
                <option value="B">Team B (09:00)</option>
                <option value="any">Flexible</option>
              </select>
              <select className="ahq-sel" value={fSub} onChange={e=>setFSub(e.target.value)}>
                <option value="">All Roles</option>
                <option value="yes">Substitutes Only</option>
              </select>
            </div>

            <div className="ahq-table-wrap">
              <table className="ahq-table">
                <thead>
                  <tr className="ahq-col-group">
                    <th colSpan={2}></th>
                    <th colSpan={3} className="g-squads">▸ Squads</th>
                    <th colSpan={3} className="g-troops">▸ Troops</th>
                    <th colSpan={2} className="g-canyon">▸ Canyon Storm <small style={{fontWeight:400,fontSize:8}}>(Server Time)</small></th>
                    <th colSpan={2} className="g-desert">▸ Desert Storm <small style={{fontWeight:400,fontSize:8}}>(Server Time)</small></th>
                    <th colSpan={6} className="g-season">▸ Season</th>
                    <th></th>
                  </tr>
                  <tr>
                    <th onClick={() => handleSort('name')}>Player ↕</th>
                    <th className="nosort">Sq4</th>
                    <th onClick={() => handleSort('power1')}>S1 ↕</th>
                    <th onClick={() => handleSort('power2')}>S2 ↕</th>
                    <th onClick={() => handleSort('power3')}>S3 ↕</th>
                    <th className="nosort">S1</th>
                    <th className="nosort">S2</th>
                    <th className="nosort">S3</th>
                    <th onClick={() => handleSort('canyonTeam')}>Team ↕</th>
                    <th className="nosort">Sub?</th>
                    <th onClick={() => handleSort('desertTeam')}>Team ↕</th>
                    <th className="nosort">Sub?</th>
                    <th className="nosort">Profession</th>
                    <th className="nosort">Garrison</th>
                    <th className="nosort">Quickstride</th>
                    <th onClick={() => handleSort('resistance')}>Resist ↕</th>
                    <th className="nosort">Coffee</th>
                    <th className="nosort">Notes</th>
                    <th className="nosort"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="no-data"><td colSpan={19}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr className="no-data">
                      <td colSpan={19}>{players.length ? 'No players match the filters' : 'No players yet — be the first to add your profile!'}</td>
                    </tr>
                  ) : filtered.map(p => {
                    const isMe    = p.id === myId;
                    const coffee  = p.coffeeBuff === 'none' ? 0 : parseInt(p.coffeeBuff) || 0;
                    const totalRes = (parseInt(p.resistance) || 0) + coffee;
                    return (
                      <tr key={p.id} className={isMe ? 'me-row' : ''}>
                        <td>
                          <span className="player-name">{p.name || 'Unknown'}</span>
                          {isMe && <span className="me-badge">ME</span>}
                        </td>
                        <td style={{textAlign:'center'}}>
                          {p.hasSquad4==='yes' ? <span className="sq4-yes">✔</span> : <span style={{color:'var(--text3)'}}>—</span>}
                        </td>
                        <PwrCell pow={p.power1} troop={p.troop1} maxP={maxP} />
                        <PwrCell pow={p.power2} troop={p.troop2} maxP={maxP} />
                        <PwrCell pow={p.power3} troop={p.troop3} maxP={maxP} />
                        <td>{p.troop1 ? <span className={`trp trp-${p.troop1}`}>{p.troop1}</span> : '—'}</td>
                        <td>{p.troop2 ? <span className={`trp trp-${p.troop2}`}>{p.troop2}</span> : '—'}</td>
                        <td>{p.troop3 ? <span className={`trp trp-${p.troop3}`}>{p.troop3}</span> : '—'}</td>
                        <td>
                          {p.canyonTeam && p.canyonTeam !== 'any'
                            ? <span className={`team-badge team-${p.canyonTeam}`}>{p.canyonTeam === 'A' ? 'Team A' : 'Team B'}</span>
                            : <span className="team-badge">Flexible</span>}
                        </td>
                        <td>{p.canyonSub==='yes' ? <span className="sub-tag">SUB</span> : '—'}</td>
                        <td>
                          {p.desertTeam && p.desertTeam !== 'any'
                            ? <span className={`team-badge team-${p.desertTeam}`}>{p.desertTeam === 'A' ? 'Team A' : 'Team B'}</span>
                            : <span className="team-badge">Flexible</span>}
                        </td>
                        <td>{p.desertSub==='yes' ? <span className="sub-tag">SUB</span> : '—'}</td>
                        <td>{p.profession ? <span className={`prof-chip prof-${p.profession}`}>{p.profession}</span> : '—'}</td>
                        <td><span className={`dot ${p.garrison==='yes'?'dot-yes':'dot-no'}`}></span>{p.garrison==='yes'?'Yes':'No'}</td>
                        <td><span className={`dot ${p.quickstride==='yes'?'dot-yes':'dot-no'}`}></span>{p.quickstride==='yes'?'Yes':'No'}</td>
                        <td>{totalRes > 0 ? <span className="resist-cell">{totalRes.toLocaleString()}</span> : <span className="resist-muted">—</span>}</td>
                        <td>{coffee > 0 ? <span className="coffee-chip">☕+{coffee}</span> : '—'}</td>
                        <td><span className="notes-cell" title={p.notes||''}>{p.notes||''}</span></td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            {isMe && (
                              <button onClick={openProfile} style={{background:'none',border:'1px solid var(--border2)',color:'var(--text2)',padding:'3px 7px',cursor:'pointer',fontSize:11}} title="Edit">✎</button>
                            )}
                            <button onClick={() => deletePlayer(p.id)} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:14,padding:'3px 5px'}} title="Remove">✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Wishlists ── */}
        {(activeTab === 'canyon' || activeTab === 'desert') && renderWishlist(activeTab)}
      </main>

      {/* ── Profile Modal ── */}
      <div className={`ahq-modal-overlay${modalOpen ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
        <div className="ahq-modal">
          <div className="ahq-modal-header">
            <span>{players.find(p => p.id === myId) ? 'Edit My Profile' : 'Set Up My Profile'}</span>
            <button className="ahq-modal-close" onClick={() => setModalOpen(false)}>✕</button>
          </div>
          <div className="ahq-modal-body">
            <div className="form-grid">
              <div className="form-group fg-full">
                <label className="form-label">In-Game Name <span className="req">*</span></label>
                <input className="form-control" placeholder="Exactly as shown in game" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </div>

              <div className="section-div sd-squads">Squad Powers</div>
              <div className="form-group">
                <label className="form-label">S1 Power <span className="req">*</span></label>
                <input type="number" className="form-control" step="0.01" min="0" value={form.power1} onChange={e=>setForm(f=>({...f,power1:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">S1 Troop Type <span className="req">*</span></label>
                <select className="form-control" value={form.troop1} onChange={e=>setForm(f=>({...f,troop1:e.target.value}))}>
                  <option value="">Select…</option>
                  <option value="Tank">Tank</option>
                  <option value="Air">Air</option>
                  <option value="Missile">Missile</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">S2 Power <span className="opt">(optional)</span></label>
                <input type="number" className="form-control" step="0.01" min="0" value={form.power2} onChange={e=>setForm(f=>({...f,power2:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">S2 Troop Type</label>
                <select className="form-control" value={form.troop2} onChange={e=>setForm(f=>({...f,troop2:e.target.value}))}>
                  <option value="">—</option>
                  <option value="Tank">Tank</option>
                  <option value="Air">Air</option>
                  <option value="Missile">Missile</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">S3 Power <span className="opt">(optional)</span></label>
                <input type="number" className="form-control" step="0.01" min="0" value={form.power3} onChange={e=>setForm(f=>({...f,power3:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">S3 Troop Type</label>
                <select className="form-control" value={form.troop3} onChange={e=>setForm(f=>({...f,troop3:e.target.value}))}>
                  <option value="">—</option>
                  <option value="Tank">Tank</option>
                  <option value="Air">Air</option>
                  <option value="Missile">Missile</option>
                </select>
              </div>
              <div className="form-group fg-full" style={{paddingBottom:4}}>
                <CheckBox checked={form.hasSquad4==='yes'} onChange={v=>setForm(f=>({...f,hasSquad4:v?'yes':'no'}))} label={<b>I have Squad 4 unlocked</b>} />
              </div>

              <div className="section-div sd-events">Event Wishes</div>
              <div className="form-group">
                <label className="form-label">Canyon Storm Team <span className="req">*</span></label>
                <select className="form-control" value={form.canyonTeam} onChange={e=>setForm(f=>({...f,canyonTeam:e.target.value}))}>
                  <option value="">Select…</option>
                  <option value="A">Team A — 12:00–12:30 Server</option>
                  <option value="B">Team B — 23:00–23:30 Server</option>
                  <option value="any">Flexible / Anytime</option>
                </select>
                <div className="time-hint">Server Time</div>
              </div>
              <div className="form-group" style={{justifyContent:'flex-end'}}>
                <label className="form-label">&nbsp;</label>
                <CheckBox checked={form.canyonSub==='yes'} onChange={v=>setForm(f=>({...f,canyonSub:v?'yes':'no'}))} label="I prefer the substitute role" subLabel="for Canyon Storm" />
              </div>
              <div className="form-group">
                <label className="form-label">Desert Storm Team <span className="req">*</span></label>
                <select className="form-control" value={form.desertTeam} onChange={e=>setForm(f=>({...f,desertTeam:e.target.value}))}>
                  <option value="">Select…</option>
                  <option value="A">Team A — 18:00–18:30 Server</option>
                  <option value="B">Team B — 09:00–09:30 Server</option>
                  <option value="any">Flexible / Anytime</option>
                </select>
                <div className="time-hint">Server Time</div>
              </div>
              <div className="form-group" style={{justifyContent:'flex-end'}}>
                <label className="form-label">&nbsp;</label>
                <CheckBox checked={form.desertSub==='yes'} onChange={v=>setForm(f=>({...f,desertSub:v?'yes':'no'}))} label="I prefer the substitute role" subLabel="for Desert Storm" />
              </div>

              <div className="section-div sd-season">Season</div>
              <div className="form-group">
                <label className="form-label">Preferred Profession</label>
                <select className="form-control" value={form.profession} onChange={e=>setForm(f=>({...f,profession:e.target.value}))}>
                  <option value="">—</option>
                  <option value="Engineer">Engineer</option>
                  <option value="Warlord">Warlord</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Base Resistance</label>
                <input type="number" className="form-control" placeholder="e.g. 1250" min="0" step="1" value={form.resistance} onChange={e=>setForm(f=>({...f,resistance:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Garrison Core Card <small style={{color:'var(--accent)'}}>Blue</small></label>
                <select className="form-control" value={form.garrison} onChange={e=>setForm(f=>({...f,garrison:e.target.value}))}>
                  <option value="no">No</option>
                  <option value="yes">Yes — I have it</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quickstride Core Card <small style={{color:'var(--accent3)'}}>Green</small></label>
                <select className="form-control" value={form.quickstride} onChange={e=>setForm(f=>({...f,quickstride:e.target.value}))}>
                  <option value="no">No</option>
                  <option value="yes">Yes — I have it</option>
                </select>
              </div>
              <div className="form-group fg-full">
                <label className="form-label">Coffee Buff Active?</label>
                <select className="form-control" value={form.coffeeBuff} onChange={e=>setForm(f=>({...f,coffeeBuff:e.target.value}))}>
                  <option value="none">No Coffee Active</option>
                  <option value="200">Yes — +200 Resistance</option>
                  <option value="500">Yes — +500 Resistance</option>
                </select>
              </div>
              <div className="form-group fg-full">
                <label className="form-label">Notes</label>
                <input className="form-control" placeholder="Optional…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
              </div>
            </div>
          </div>
          <div className="ahq-modal-footer">
            <button className="btn-primary" disabled={saving} onClick={saveProfile} style={{width:'100%',height:46,fontSize:14}}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
