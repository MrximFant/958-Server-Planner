import { useEffect, useRef } from 'react';

// Shared particle background used across all pages.
// Features: dense star field, slow drifting particles, connection lines, occasional flares.
export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    // Regular drifting particles
    const particles = Array.from({ length: 120 }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r:  Math.random() * 1.4 + 0.3,
      a:  Math.random() * 0.45 + 0.08,
    }));

    // Flare state — one flare at a time
    let flare = null;
    let flareTimer = Math.random() * 180 + 120; // frames until next flare

    function spawnFlare() {
      const p = particles[Math.floor(Math.random() * particles.length)];
      flare = { x: p.x, y: p.y, r: 0, maxR: Math.random() * 60 + 40, alpha: 0, phase: 'in' };
    }

    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Draw flare first (behind particles)
      if (flare) {
        if (flare.phase === 'in') {
          flare.r     += flare.maxR / 40;
          flare.alpha += 0.025;
          if (flare.r >= flare.maxR) flare.phase = 'out';
        } else {
          flare.r     += flare.maxR / 80;
          flare.alpha -= 0.018;
          if (flare.alpha <= 0) flare = null;
        }
        if (flare) {
          const grd = ctx.createRadialGradient(flare.x, flare.y, 0, flare.x, flare.y, flare.r);
          grd.addColorStop(0,   `rgba(0,220,255,${Math.min(flare.alpha, 0.35)})`);
          grd.addColorStop(0.4, `rgba(0,200,255,${Math.min(flare.alpha * 0.5, 0.12)})`);
          grd.addColorStop(1,   'rgba(0,200,255,0)');
          ctx.beginPath();
          ctx.arc(flare.x, flare.y, flare.r, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }
      }

      // Flare spawn timer
      flareTimer--;
      if (flareTimer <= 0 && !flare) {
        spawnFlare();
        flareTimer = Math.random() * 240 + 160;
      }

      // Draw connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,200,255,${0.05 * (1 - d / 100)})`;
            ctx.lineWidth = 0.4;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${p.a})`;
        ctx.fill();
      });

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
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  );
}
