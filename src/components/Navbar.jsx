import { Link, useLocation, useParams } from 'react-router-dom';
import { Shield, Map, Users, BookOpen } from 'lucide-react';

export default function Navbar() {
  const { pathname }  = useLocation();
  const { serverId }  = useParams();

  const base = serverId ? `/server/${serverId}` : '';

  const NAV_LINKS = [
    { to: `${base}/map`,      label: 'WAR MAP',     icon: Map },
    { to: `${base}/alliance`, label: 'ALLIANCE HQ', icon: Users },
    { to: `${base}/rules`,    label: 'RULES',       icon: BookOpen },
  ];

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(8,13,20,0.97)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #1e3550', height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      <Link to={base || '/'} style={{
        fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
        fontSize: 16, color: '#00c8ff', letterSpacing: '3px',
        textDecoration: 'none', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Shield size={20} fill="currentColor" /> LW PLANNER
      </Link>

      <div style={{ display: 'flex', gap: 4 }}>
        {NAV_LINKS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link key={to} to={to} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 16px',
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 12, letterSpacing: '1.5px',
              textDecoration: 'none', textTransform: 'uppercase',
              color: active ? '#00c8ff' : '#7a9bb8',
              borderBottom: active ? '2px solid #00c8ff' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#d0e4f4'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#7a9bb8'; }}
            >
              <Icon size={12} /> {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
