import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Map, Users, BookOpen, Trophy, Clock, Zap, Shield, ChevronRight } from 'lucide-react';

const FEATURES = [
  {
    to: '/map',
    icon: Map,
    color: '#00c8ff',
    glow: 'rgba(0,200,255,0.15)',
    border: 'rgba(0,200,255,0.3)',
    label: 'WAR MAP',
    title: 'Territory Planner',
    desc: 'Live map of every bank and city. Assign ownership, project vulnerabilities, and plan your next attack in real time.',
    tag: 'LIVE',
  },
  {
    to: '/alliance',
    icon: Users,
    color: '#f0a500',
    glow: 'rgba(240,165,0,0.15)',
    border: 'rgba(240,165,0,0.3)',
    label: 'ALLIANCE HQ',
    title: 'Member Roster',
    desc: 'Full alliance roster with squad powers, troop types, Canyon Storm & Desert Storm preferences and season professions.',
    tag: 'COMMAND',
  },
  {
    to: '/rules',
    icon: BookOpen,
    color: '#00e87a',
    glow: 'rgba(0,232,122,0.15)',
    border: 'rgba(0,232,122,0.3)',
    label: 'RULES',
    title: 'Game Guide',
    desc: 'Complete rulebook for territory warfare. Banks, cities, attack windows, capture limits and connection rules.',
    tag: 'GUIDE',
  },
  {
    to: null,
    icon: Trophy,
    color: '#a040d0',
    glow: 'rgba(160,64,208,0.15)',
    border: 'rgba(160,64,208,0.3)',
    label: 'LEADERBOARD',
    title: 'Alliance Rankings',
    desc: 'Season standings, influence totals, city counts and crystal gold rates across all alliances on the server.',
    tag: 'SOON',
    disabled: true,
  },
  {
    to: null,
    icon: Clock,
    color: '#ff4060',
    glow: 'rgba(255,64,96,0.15)',
    border: 'rgba(255,64,96,0.3)',
    label: 'SEASONS',
    title: 'Season History',
    desc: 'Past season outcomes, territory snapshots and alliance performance trends across every server season.',
    tag: 'SOON',
    disabled: true,
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  // Animated particle background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.4 + 0.1,
    }));

    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${p.a})`;
        ctx.fill();
      });
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,200,255,${0.06 * (1 - dist/120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    const onResize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080d14',
      color: '#d0e4f4',
      fontFamily: "'Exo 2', sans-serif",
      overflowX: 'hidden',
      position: 'relative',
    }}>
      {/* Animated canvas bg */}
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

      {/* Grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px), linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)',
        backgroundSize: '44px 44px',
      }} />

      {/* ── HERO ── */}
      <section style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px 60px',
        textAlign: 'center',
      }}>
        {/* Invite-only badge */}
        <div style={{
          marginBottom: 32,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.3)',
          padding: '5px 16px', color: '#ff4060',
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
          fontSize: 11, letterSpacing: '2px',
        }}>
          🔒 INVITE ONLY — AUTHORIZED PERSONNEL
        </div>

        {/* Main title */}
        <div style={{ marginBottom: 12 }}>
          <h1 style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            fontSize: 'clamp(48px, 10vw, 96px)',
            lineHeight: 1,
            color: '#fff',
            letterSpacing: '-1px',
            textShadow: '0 0 60px rgba(0,200,255,0.4), 0 0 120px rgba(0,200,255,0.15)',
            margin: 0,
          }}>
            958
          </h1>
          <h2 style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            fontSize: 'clamp(28px, 5vw, 52px)',
            color: '#00c8ff',
            letterSpacing: '8px',
            textTransform: 'uppercase',
            margin: '8px 0 0',
            textShadow: '0 0 30px rgba(0,200,255,0.5)',
          }}>
            MASTERMIND
          </h2>
        </div>

        {/* Season badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.4)',
          padding: '7px 20px', marginBottom: 40,
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
          fontSize: 13, letterSpacing: '3px', color: '#f0a500',
        }}>
          <Zap size={12} fill="currentColor" />
          SEASON 5 · WILD WEST
          <Zap size={12} fill="currentColor" />
        </div>

        <p style={{
          maxWidth: 480, color: '#7a9bb8', lineHeight: 1.7,
          fontSize: 15, marginBottom: 48,
        }}>
          Your alliance's command center. Plan territory warfare, coordinate your roster,
          and dominate the map every season.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 80 }}>
          <button
            onClick={() => navigate('/map')}
            style={{
              background: '#00c8ff', color: '#080d14',
              border: 'none', padding: '14px 36px',
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 14, letterSpacing: '2px', textTransform: 'uppercase',
              cursor: 'pointer',
              clipPath: 'polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)',
              transition: 'all 0.2s',
              boxShadow: '0 0 30px rgba(0,200,255,0.3)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff'}
            onMouseLeave={e => e.currentTarget.style.background = '#00c8ff'}
          >
            ENTER WAR MAP →
          </button>
          <button
            onClick={() => navigate('/alliance')}
            style={{
              background: 'transparent', color: '#f0a500',
              border: '1px solid rgba(240,165,0,0.5)', padding: '14px 36px',
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 14, letterSpacing: '2px', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,165,0,0.1)'; e.currentTarget.style.borderColor = '#f0a500'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.5)'; }}
          >
            ALLIANCE HQ
          </button>
        </div>

        {/* Scroll hint */}
        <div style={{ color: '#3a5878', fontSize: 11, letterSpacing: '2px', animation: 'bounce 2s infinite' }}>
          ↓ ALL TOOLS
        </div>
      </section>

      {/* ── FEATURE CARDS ── */}
      <section style={{
        position: 'relative', zIndex: 1,
        padding: '60px 24px 80px',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{
          textAlign: 'center', marginBottom: 48,
        }}>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            fontSize: 11, letterSpacing: '3px', color: '#3a5878',
            textTransform: 'uppercase', marginBottom: 10,
          }}>COMMAND CENTER</div>
          <h3 style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            fontSize: 28, color: '#d0e4f4', letterSpacing: '1px', margin: 0,
          }}>ALL TOOLS</h3>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {FEATURES.map(f => (
            <FeatureCard key={f.label} feature={f} navigate={navigate} />
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        position: 'relative', zIndex: 1,
        borderTop: '1px solid #1e3550',
        padding: '24px',
        textAlign: 'center',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color: '#3a5878', letterSpacing: '2px',
      }}>
        958 MASTERMIND · SEASON 5: WILD WEST · AUTHORIZED USE ONLY
      </footer>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(6px); opacity: 1; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@400;600&display=swap');
      `}</style>
    </div>
  );
}

function FeatureCard({ feature: f, navigate }) {
  const isDisabled = f.disabled;

  return (
    <div
      onClick={() => !isDisabled && f.to && navigate(f.to)}
      style={{
        background: isDisabled ? 'rgba(13,21,32,0.4)' : `rgba(13,21,32,0.8)`,
        border: `1px solid ${isDisabled ? '#1e3550' : f.border}`,
        padding: '24px',
        cursor: isDisabled ? 'default' : 'pointer',
        transition: 'all 0.2s',
        opacity: isDisabled ? 0.5 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!isDisabled) {
          e.currentTarget.style.background = f.glow;
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = `0 8px 30px ${f.glow}`;
        }
      }}
      onMouseLeave={e => {
        if (!isDisabled) {
          e.currentTarget.style.background = 'rgba(13,21,32,0.8)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {/* Tag */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
        fontSize: 9, letterSpacing: '2px',
        color: f.color, background: f.glow,
        border: `1px solid ${f.border}`,
        padding: '2px 7px',
      }}>{f.tag}</div>

      {/* Icon */}
      <div style={{
        width: 44, height: 44, background: f.glow,
        border: `1px solid ${f.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, color: f.color,
      }}>
        <f.icon size={20} />
      </div>

      {/* Label */}
      <div style={{
        fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
        fontSize: 10, letterSpacing: '2px', color: f.color,
        marginBottom: 6, textTransform: 'uppercase',
      }}>{f.label}</div>

      {/* Title */}
      <div style={{
        fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
        fontSize: 20, color: '#d0e4f4', marginBottom: 10,
        letterSpacing: '0.5px',
      }}>{f.title}</div>

      {/* Desc */}
      <p style={{
        color: '#7a9bb8', fontSize: 13, lineHeight: 1.6,
        margin: '0 0 20px',
      }}>{f.desc}</p>

      {/* CTA */}
      {!isDisabled && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
          fontSize: 11, letterSpacing: '2px', color: f.color,
          textTransform: 'uppercase',
        }}>
          OPEN <ChevronRight size={12} />
        </div>
      )}
    </div>
  );
}