import { useState } from 'react';

export default function OwnerChecklist({ alliance, members, serverId, navigate, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const owner = members.find(m => m.alliance_role === 'owner');
  const profileFilled = !!(owner && owner.in_game_name);
  const hasMembers = members.length > 1;
  const eventsConfigured = !!(alliance?.event_config && Object.values(alliance.event_config).some(v => v !== null && typeof v === 'object' && Object.values(v).some(x => x !== null)));
  const trainCreated = false; // cannot check without DB query

  const items = [
    {
      label: 'Your profile is filled in',
      done: profileFilled,
      onClick: () => navigate('/server/' + serverId + '/alliance?tab=profile'),
    },
    {
      label: 'Members have joined',
      done: hasMembers,
      onClick: () => navigate('/server/' + serverId + '/alliance?tab=manage'),
    },
    {
      label: 'Event times configured',
      done: eventsConfigured,
      onClick: () => onDismiss('events'),
    },
    {
      label: 'Train schedule created',
      done: trainCreated,
      onClick: () => navigate('/server/' + serverId + '/train'),
    },
  ];

  function handleDismiss() {
    localStorage.setItem('oc_dismissed_' + alliance?.id, '1');
    setDismissed(true);
    onDismiss && onDismiss();
  }

  return (
    <div
      style={{
        background: 'rgba(0,232,122,0.04)',
        border: '1px solid rgba(0,232,122,0.2)',
        borderRadius: 10,
        padding: 20,
        marginBottom: 16,
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#00e87a', marginBottom: 14 }}>
        ALLIANCE SETUP CHECKLIST
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <div
            key={i}
            onClick={!item.done ? item.onClick : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: item.done ? 'default' : 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!item.done) e.currentTarget.style.background = 'rgba(0,232,122,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.done ? '✅' : '⬜'}</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: item.done ? '#00e87a' : '#a0c0d8',
                textDecoration: item.done ? 'none' : 'none',
              }}
            >
              {item.label}
            </span>
            {!item.done && (
              <span style={{ fontSize: 11, color: '#3a5878', marginLeft: 'auto', fontWeight: 700 }}>→</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: '1px solid rgba(0,232,122,0.25)',
            color: '#3a5878',
            padding: '4px 12px',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '1.5px',
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          DISMISS
        </button>
      </div>
    </div>
  );
}
