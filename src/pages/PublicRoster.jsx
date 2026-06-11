import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@400;600&display=swap');`;

function normPower(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return null;
  return n > 1000 ? +(n / 1000000).toFixed(2) : +n.toFixed(2);
}

export default function PublicRoster() {
  const { serverId, allianceId } = useParams();
  const navigate = useNavigate();

  const [alliance, setAlliance] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: al } = await supabase
        .from('alliances')
        .select('*')
        .eq('id', allianceId)
        .single();

      if (!al || !al.roster_public) {
        setDenied(true);
        setLoading(false);
        return;
      }

      // Verify alliance belongs to the server
      if (al.server_id !== serverId) {
        setDenied(true);
        setLoading(false);
        return;
      }

      setAlliance(al);

      const { data: mems } = await supabase
        .from('members')
        .select('id, username, in_game_name, power1, troop1, canyon_team, desert_team, profession')
        .eq('alliance_id', allianceId)
        .order('in_game_name');

      setMembers(mems ?? []);
      setLoading(false);
    }
    load();
  }, [serverId, allianceId]);

  useEffect(() => {
    if (denied) {
      navigate(`/server/${serverId}`, { replace: true });
    }
  }, [denied, serverId, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a5878', fontFamily: 'monospace' }}>
        <style>{FONT}</style>
        Loading…
      </div>
    );
  }

  if (!alliance) return null;

  const showPower = alliance.roster_show_power !== false;

  return (
    <div style={{ minHeight: '100vh', background: '#080d14', color: '#d0e4f4', fontFamily: "'Rajdhani', sans-serif", position: 'relative', overflowX: 'hidden' }}>
      <style>{FONT}</style>
      <ParticleBackground />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)', backgroundSize: '44px 44px' }} />

      {/* Topbar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', background: 'rgba(8,13,20,0.95)', borderBottom: '1px solid #1e3550' }}>
        <button
          onClick={() => navigate(`/server/${serverId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#7a9bb8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' }}
        >
          <ArrowLeft size={14} /> BACK TO SERVER
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '2px' }}>
          <span style={{ color: alliance.color }}>⚔ {alliance.name.toUpperCase()}</span>
          {alliance.tag && <span style={{ color: '#3a5878', fontSize: 11, marginLeft: 10, fontFamily: "'Share Tech Mono',monospace" }}>[{alliance.tag}]</span>}
        </div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5878' }}>
          PUBLIC ROSTER
        </div>
      </div>

      {/* Main content */}
      <main style={{ position: 'relative', zIndex: 1, paddingTop: 72, padding: '72px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Alliance header card */}
        <div style={{ background: 'rgba(13,21,32,0.85)', border: `1px solid ${alliance.color}40`, padding: '24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: alliance.color, flexShrink: 0, boxShadow: `0 0 12px ${alliance.color}` }} />
          <div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 28, color: '#fff', letterSpacing: '2px' }}>
              {alliance.name.toUpperCase()}
              {alliance.tag && <span style={{ fontSize: 14, color: '#3a5878', marginLeft: 12, fontFamily: "'Share Tech Mono',monospace" }}>[{alliance.tag}]</span>}
            </div>
            <div style={{ fontSize: 13, color: '#7a9bb8', marginTop: 4, fontFamily: "'Exo 2',sans-serif" }}>
              {members.length} member{members.length !== 1 ? 's' : ''} · Public Roster
            </div>
          </div>
        </div>

        {/* Roster table */}
        <div style={{ background: '#0f1e30', border: '1px solid #1e3550', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e3550', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '2px', color: '#3a5878' }}>
            ROSTER — {members.length} MEMBERS
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Exo 2',sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0d1520', borderBottom: '1px solid #1e3550' }}>
                  <th style={TH}>Player</th>
                  {showPower && <th style={TH}>T1 Power</th>}
                  <th style={TH}>T1 Squad</th>
                  <th style={TH}>Canyon Team</th>
                  <th style={TH}>Desert Team</th>
                  <th style={TH}>Profession</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={showPower ? 6 : 5} style={{ padding: '36px', textAlign: 'center', color: '#3a5878', fontStyle: 'italic' }}>
                      No members yet.
                    </td>
                  </tr>
                ) : members.map((m, i) => (
                  <tr
                    key={m.id}
                    style={{ borderBottom: '1px solid rgba(30,53,80,0.5)', background: i % 2 === 0 ? 'transparent' : 'rgba(13,21,32,0.3)' }}
                  >
                    <td style={{ ...TD, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#d0e4f4' }}>
                      {m.in_game_name || m.username}
                      {m.in_game_name && m.username && (
                        <div style={{ fontSize: 10, color: '#3a5878', fontFamily: "'Share Tech Mono',monospace", marginTop: 1 }}>@{m.username}</div>
                      )}
                    </td>
                    {showPower && (
                      <td style={TD}>
                        {m.power1 != null && normPower(m.power1) != null
                          ? <span style={{ fontFamily: "'Share Tech Mono',monospace", color: '#f0a500', fontWeight: 700 }}>{normPower(m.power1).toFixed(1)}M</span>
                          : <span style={{ color: '#3a5878' }}>—</span>}
                      </td>
                    )}
                    <td style={TD}>
                      {m.troop1 ? (
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: '2px 6px', color: '#fff',
                          background: m.troop1 === 'Tank' ? '#e03030' : m.troop1 === 'Air' ? '#20c060' : '#2080e0',
                        }}>
                          {m.troop1}
                        </span>
                      ) : <span style={{ color: '#3a5878' }}>—</span>}
                    </td>
                    <td style={TD}>
                      {m.canyon_team
                        ? <TeamBadge team={m.canyon_team} type="canyon" />
                        : <span style={{ color: '#3a5878' }}>—</span>}
                    </td>
                    <td style={TD}>
                      {m.desert_team
                        ? <TeamBadge team={m.desert_team} type="desert" />
                        : <span style={{ color: '#3a5878' }}>—</span>}
                    </td>
                    <td style={TD}>
                      {m.profession ? (
                        <span style={{
                          fontFamily: "'Share Tech Mono',monospace", fontSize: 11, padding: '2px 7px',
                          color: m.profession === 'Warlord' ? '#f0a500' : '#00e87a',
                          background: m.profession === 'Warlord' ? 'rgba(240,165,0,0.08)' : 'rgba(0,232,122,0.06)',
                          border: `1px solid ${m.profession === 'Warlord' ? 'rgba(240,165,0,0.3)' : 'rgba(0,232,122,0.3)'}`,
                        }}>
                          {m.profession}
                        </span>
                      ) : <span style={{ color: '#3a5878' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={() => navigate(`/server/${serverId}`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', padding: '10px 24px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', cursor: 'pointer' }}
          >
            <ArrowLeft size={13} /> BACK TO SERVER DASHBOARD
          </button>
        </div>
      </main>
    </div>
  );
}

function TeamBadge({ team, type }) {
  if (team === 'any') return <span style={{ color: '#7a9bb8', fontSize: 11 }}>Flexible</span>;
  const isA = team === 'A';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 600,
      color: isA ? '#00e87a' : '#f0a500',
      background: isA ? 'rgba(0,232,122,0.05)' : 'rgba(240,165,0,0.05)',
      border: `1px solid ${isA ? 'rgba(0,232,122,0.35)' : 'rgba(240,165,0,0.35)'}`,
    }}>
      Team {team}
    </span>
  );
}

const TH = {
  padding: '9px 14px',
  textAlign: 'left',
  fontFamily: "'Rajdhani',sans-serif",
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: '1.5px',
  color: '#3a5878',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '10px 14px',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};
