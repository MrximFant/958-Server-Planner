import { useEffect, useRef } from 'react';

export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    // More particles, slower drift, gentle alpha pulse — no pop-in/out
    const particles = Array.from({ length: 180 }, () => {
      const baseAlpha = Math.random() * 0.35 + 0.06;
      return {
        x:  Math.random() * W,
        y:  Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r:  Math.random() * 1.3 + 0.2,
        a:  baseAlpha,
        baseA: baseAlpha,
        pulseSpeed: Math.random() * 0.008 + 0.002,
        pulsePhase: Math.random() * Math.PI * 2,
      };
    });

    let frame = 0;
    let raf;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      frame++;

      // Draw connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 90) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,200,255,${0.04 * (1 - d / 90)})`;
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }
        }
      }

      // Draw particles with gentle alpha pulse
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        // Slow sine pulse on alpha — no abrupt transitions
        p.a = p.baseA + Math.sin(frame * p.pulseSpeed + p.pulsePhase) * (p.baseA * 0.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${Math.max(0, p.a)})`;
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
