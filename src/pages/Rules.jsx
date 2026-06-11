import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');`;

const SECTIONS = [
  {
    title: 'ROLES & PERMISSIONS',
    color: '#00c8ff',
    items: [
      { h: 'Server Admin', b: 'Manages the server workspace. Creates alliances, manages all members, controls season settings, and handles server handshakes. Logs in with their own username and password.' },
      { h: 'Alliance Owner (R5)', b: 'The leader of an alliance. Manages their alliance roster, promotes officers, sets up train rotations, and shares invite links with members. Gets in via a one-time Owner Invite link from the server admin.' },
      { h: 'Alliance Admin (Officer)', b: 'Up to 10 members per alliance can be promoted to Alliance Admin by the Alliance Owner. They can edit member profiles and manage the roster. Join the same way as regular members — via the Member Invite link.' },
      { h: 'Server Helper', b: 'Promoted by the server admin. Can view all members across all alliances and reassign them between alliances. Cannot change server settings or manage alliances.' },
      { h: 'Member', b: 'Regular player. Joins via the Member Invite link shared by their Alliance Owner. Logs in with their own username and password. Can view the roster and update their own profile.' },
    ],
  },
  {
    title: 'SERVER STRUCTURE',
    color: '#3a9bff',
    items: [
      { h: 'Seasons', b: 'Each server runs seasons 1–6. Between seasons the map resets and tile ownership starts fresh. Season 0 is pre-season / setup. The server admin sets the active season in the Admin Panel.' },
      { h: 'Alliances', b: 'Each server hosts multiple alliances. An alliance is the main unit of play — every member belongs to exactly one alliance per server.' },
      { h: 'Logging in', b: 'Everyone logs in with a personal username and password. There are no shared passwords. If you forget your password, ask your Alliance Owner or an Alliance Admin to reset it for you.' },
    ],
  },
  {
    title: 'THE WAR MAP',
    color: '#f0a500',
    items: [
      { h: 'Live map', b: 'Shows actual current territory ownership. Public servers allow anyone to view it; private servers require login. Alliance Owners and Alliance Admins update tile ownership after battles.' },
      { h: 'Planning map', b: 'A private per-alliance layer only visible to your own alliance. Use it to mark attack targets and coordinate before committing on the live map.' },
      { h: 'Map sharing', b: 'When two servers establish a handshake, they can share live map and/or planning map data. Each alliance controls its own opt-in — you can share your live map without sharing your plan map.' },
    ],
  },
  {
    title: 'SERVER HANDSHAKES',
    color: '#c87aff',
    items: [
      { h: 'What is a handshake?', b: 'A mutual agreement between two server admins to share data. One admin generates an invite code and sends it to the other admin via Discord. The receiving admin accepts it to activate the connection.' },
      { h: 'Sharing caps', b: 'The server admin sets the maximum scope of sharing: live map, roster names, or player stats. Alliance Owners then decide individually whether to opt in — they can never share more than the server cap allows.' },
      { h: 'Revoking access', b: 'Either server admin can revoke a handshake at any time. Shared data immediately disappears from the partner server\'s map view.' },
    ],
  },
  {
    title: 'MEMBER ACCOUNTS',
    color: '#00e87a',
    items: [
      { h: 'Registration', b: 'Members join via the Member Invite link from their Alliance Owner. They choose a username (unique on this server) and a password. Passwords are stored as SHA-256 hashes — never in plain text.' },
      { h: 'Profile data', b: 'Members fill in their in-game name, squad powers (in millions), troop types, garrison, profession, and event availability for Canyon Storm and Desert Storm. Keep this up to date so leadership can build accurate teams.' },
      { h: 'Password reset', b: 'If you forget your password, ask your Alliance Owner or an Alliance Admin. They can reset it from the MANAGE → ROSTER tab in Alliance HQ.' },
    ],
  },
  {
    title: 'ETIQUETTE & FAIR PLAY',
    color: '#ff6080',
    items: [
      { h: 'Keep the map accurate', b: 'Update territory ownership promptly after battles. An outdated map misleads your own alliance\'s planning as much as the enemy\'s.' },
      { h: 'Handshake trust', b: 'Only establish handshakes with servers you have a genuine alliance or non-aggression agreement with. Sharing your planning map exposes your attack intent to the partner server.' },
      { h: 'Dispute resolution', b: 'Tile disputes and in-game conflicts should be resolved in your alliance\'s Discord. This planner is a coordination tool, not an arbitration system.' },
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
