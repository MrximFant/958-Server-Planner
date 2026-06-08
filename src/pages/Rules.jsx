import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const SECTIONS = [
  {
    title: 'SERVER STRUCTURE',
    color: '#00c8ff',
    items: [
      { h: 'Seasons', b: 'Each server runs seasons 1–6. Between seasons the map resets and tile ownership starts fresh. Season 0 is pre-season / setup.' },
      { h: 'Alliances', b: 'Each server hosts multiple alliances. An alliance is the main unit of play — members belong to exactly one alliance per server.' },
      { h: 'Roles', b: 'Server Admin manages the server. Alliance Owner and Alliance Admins (up to 10) manage their alliance. Server Helpers assist the admin with member management.' },
    ],
  },
  {
    title: 'TERRITORY & OWNERSHIP',
    color: '#00e87a',
    items: [
      { h: 'Claiming tiles', b: 'Alliance owners and alliance admins mark tiles as claimed on the Live map. The map reflects real in-game territory as of your last update.' },
      { h: 'Tile levels & buffs', b: 'Tiles have a level (Lv1–Lv5) and may carry a resource or combat buff (e.g. +10% Oil, +5% Infantry ATK). Higher-level tiles grant stronger buffs.' },
      { h: 'Server time', b: 'Capture windows and protection timers run on server time (UTC). Check the in-game clock for exact reset times.' },
    ],
  },
  {
    title: 'THE WAR MAP',
    color: '#f0a500',
    items: [
      { h: 'Live map', b: 'Shows actual current territory ownership. Public servers allow anyone to view it; private servers require login.' },
      { h: 'Planning map', b: 'Private per-alliance layer. Only your alliance (and the server admin) can see your planned targets. Use it to coordinate attacks before committing.' },
      { h: 'Map sharing', b: 'When two servers establish a handshake, they can share live map and/or plan map data. Each alliance controls whether it opts in to share with the partner server.' },
    ],
  },
  {
    title: 'SERVER HANDSHAKES',
    color: '#c87aff',
    items: [
      { h: 'What is a handshake?', b: 'A handshake is a mutual agreement between two servers to share data. The initiating admin generates an invite code; the partner admin accepts it.' },
      { h: 'Sharing caps', b: 'The server admin sets the maximum scope: live map, roster names, or player stats. Alliances can opt in within that scope — they cannot share more than the server allows.' },
      { h: 'Revoking access', b: 'Either server admin can revoke a handshake at any time. Revoked handshakes immediately stop sharing data in the partner server\'s map view.' },
    ],
  },
  {
    title: 'MEMBER ACCOUNTS',
    color: '#3a9bff',
    items: [
      { h: 'Registration', b: 'Members join via an alliance invite link. They choose a username and password (stored as SHA-256 — never sent in plain text).' },
      { h: 'Profile data', b: 'Members can fill in their in-game name, power, troop types, garrison, profession, and availability for Canyon / Desert events.' },
      { h: 'Alliance admins', b: 'An alliance can have up to 10 members promoted to Alliance Admin. They can edit the live map on behalf of the alliance.' },
    ],
  },
  {
    title: 'ETIQUETTE & FAIR PLAY',
    color: '#ff6080',
    items: [
      { h: 'Keep the map accurate', b: 'Update territory ownership promptly after battles. An outdated map hurts your own alliance\'s planning.' },
      { h: 'Handshake trust', b: 'Only share data with servers you have a genuine alliance or non-aggression pact with. Sharing your plan map exposes your attack intent.' },
      { h: 'Dispute resolution', b: 'Tile disputes should be resolved in your alliance\'s Discord. The planner is a coordination tool, not an arbitration system.' },
    ],
  },
];

export default function RulesPage() {
  const navigate = useNavigate();
  const { serverId } = useParams();

  return (
    <div style={{ minHeight: '100vh', background: '#080d14', fontFamily: "'Rajdhani',sans-serif", color: '#d0e4f4' }}>
      <style>{FONT}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e3550', padding: '0 24px', height: 48, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(8,13,20,0.97)' }}>
        {serverId && (
          <button
            onClick={() => navigate(`/server/${serverId}`)}
            style={{ background: 'none', border: '1px solid #1e3550', color: '#7a9bb8', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '3px', color: '#00c8ff' }}>RULES & GUIDE</div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        <p style={{ fontSize: 13, color: '#3a5878', lineHeight: 1.7, marginBottom: 40 }}>
          This planner is a coordination tool for Last War alliances. The rules below describe how the platform works — not the in-game rules (which vary by server agreement).
        </p>

        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '3px', color: section.color, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${section.color}30` }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {section.items.map(item => (
                <div key={item.h} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#d0e4f4', minWidth: 160, flexShrink: 0, paddingTop: 1 }}>
                    {item.h}
                  </div>
                  <div style={{ fontSize: 13, color: '#7a9bb8', lineHeight: 1.7 }}>
                    {item.b}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ padding: '16px 20px', border: '1px solid #1e3550', background: 'rgba(0,200,255,0.03)', fontSize: 12, color: '#3a5878', lineHeight: 1.7 }}>
          <strong style={{ color: '#7a9bb8' }}>Need help?</strong> Contact your server admin or reach out via Discord.
          Rules and features are updated regularly — check back after each season reset.
        </div>
      </div>
    </div>
  );
}
