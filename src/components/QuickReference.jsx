import { useState } from 'react';

const ALL_ITEMS = {
  serverAdmin: [
    { q: 'New player wants to join',     a: 'Share invite link',       tab: 'manage' },
    { q: 'Player forgot password',        a: 'Reset in Roster',         tab: 'manage' },
    { q: 'Promote a player to officer',   a: 'Manage → Admins',         tab: 'manage' },
    { q: 'Player switched alliance',      a: 'Admin → Members',         admin: 'members' },
    { q: 'New season starting',           a: 'Admin → Server',          admin: 'server' },
    { q: 'Set up Canyon/Desert times',    a: 'Events → Admin Manager',  tab: 'events' },
    { q: 'Add or remove an alliance',     a: 'Admin → Alliances',       admin: 'alliances' },
  ],
  allianceAdmin: [
    { q: 'New player wants to join',     a: 'Share invite link',       tab: 'manage' },
    { q: 'Player forgot password',        a: 'Reset in Roster',         tab: 'manage' },
    { q: 'Promote a player to officer',   a: 'Manage → Admins',         tab: 'manage' },
    { q: 'Set up Canyon/Desert times',    a: 'Events → Admin Manager',  tab: 'events' },
  ],
  member: [
    { q: 'Update my in-game stats',       a: 'My Profile',              tab: 'profile' },
    { q: 'See the event schedule',        a: 'Events tab',              tab: 'events' },
    { q: 'View the train rotation',       a: 'Train Planner',           train: true },
  ],
};

export default function QuickReference({ serverId, navigate, role }) {
  const [open, setOpen] = useState(false);

  // role: 'admin' | 'helper' | 'owner' | 'alliance_admin' | 'member'
  let items;
  if (role === 'admin' || role === 'helper') {
    items = ALL_ITEMS.serverAdmin;
  } else if (role === 'owner' || role === 'alliance_admin') {
    items = ALL_ITEMS.allianceAdmin;
  } else {
    items = ALL_ITEMS.member;
  }

  function handleClick(item) {
    if (item.admin) return navigate('/server/' + serverId + '/admin?tab=' + item.admin);
    if (item.train) return navigate('/server/' + serverId + '/train');
    if (item.tab)   return navigate('/server/' + serverId + '/alliance?tab=' + item.tab);
  }

  return (
    <div style={{ marginBottom: 16, fontFamily: "'Rajdhani', sans-serif" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,200,0,0.05)',
          border: '1px solid rgba(255,200,0,0.15)',
          borderRadius: open ? '8px 8px 0 0' : 8,
          padding: '12px 16px',
          cursor: 'pointer',
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '1.5px',
          color: '#ffd700',
        }}
      >
        <span>⚡ QUICK REFERENCE — WHAT TO DO WHEN…</span>
        <span style={{ fontSize: 12, color: '#a08030', marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ border: '1px solid rgba(255,200,0,0.15)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                background: 'rgba(20,14,0,0.5)',
              }}
            >
              <span style={{ fontSize: 13, color: '#8a9aaa', flex: 1 }}>{item.q}</span>
              <button
                onClick={() => handleClick(item)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffd700',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  flexShrink: 0,
                  marginLeft: 12,
                }}
              >
                {item.a} →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
