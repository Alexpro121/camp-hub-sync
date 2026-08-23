import { useEffect, useRef, useState } from 'react';

type ThemeName = 'deep-night' | 'dawn' | 'morning' | 'day' | 'golden-hour' | 'dusk';

const resolveKyivTheme = (): ThemeName => {
  const kyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const t = kyiv.getHours() + kyiv.getMinutes() / 60;
  if (t < 4.5) return 'deep-night';
  if (t < 7.5) return 'dawn';
  if (t < 11.5) return 'morning';
  if (t < 16.5) return 'day';
  if (t < 19.5) return 'golden-hour';
  return 'dusk';
};

/**
 * Living Carpathian landscape: auto day-cycle themes (Kyiv time), canvas sky
 * (stars, meteors, eagles, embers) and 4 parallax mountain layers.
 */
const MountainLandscape = () => {
  const [theme, setTheme] = useState<ThemeName>(() => resolveKyivTheme());
  const themeRef = useRef<ThemeName>(theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);

  themeRef.current = theme;

  // 1. Kyiv day-cycle theme
  useEffect(() => {
    const apply = () => {
      const next = resolveKyivTheme();
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    apply();
    const id = window.setInterval(apply, 60000);
    return () => window.clearInterval(id);
  }, []);

  // 2. Canvas engine
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const starColors = ['#FFFFFF', '#FFE4C4', '#BAE6FD', '#FED7AA'];
    const starCount = width < 768 ? 65 : 130;
    const stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.65),
      size: Math.random() * 1.5 + 0.5,
      color: starColors[Math.floor(Math.random() * starColors.length)],
      baseAlpha: Math.random() * 0.7 + 0.2,
      twinkleSpeed: Math.random() * 0.03 + 0.01,
      phase: Math.random() * Math.PI * 2,
    }));

    type Meteor = { x: number; y: number; length: number; speed: number; angle: number; alpha: number; thickness: number };
    let meteors: Meteor[] = [];
    const meteorTimer = window.setInterval(() => {
      const t = themeRef.current;
      if (t !== 'deep-night' && t !== 'dusk' && t !== 'golden-hour') return;
      meteors.push({
        x: Math.random() * (width * 0.6) + width * 0.3,
        y: Math.random() * (height * 0.3),
        length: Math.random() * 90 + 60,
        speed: Math.random() * 8 + 12,
        angle: -Math.PI / 4.8,
        alpha: 1,
        thickness: Math.random() * 1.5 + 1,
      });
    }, 4500);

    const birds = [
      { x: -50, y: height * 0.22, speed: 1.2, scale: 0.8, flap: 0 },
      { x: -120, y: height * 0.3, speed: 0.95, scale: 0.6, flap: 1.5 },
    ];

    const emberCount = width < 768 ? 20 : 35;
    const embers = Array.from({ length: emberCount }, () => ({
      x: Math.random() * width,
      y: height + Math.random() * 30,
      size: Math.random() * 2 + 0.8,
      speedY: Math.random() * 0.75 + 0.3,
      speedX: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.7 + 0.3,
      fade: Math.random() * 0.003 + 0.002,
    }));

    const pointer = { x: -1000, y: -1000 };
    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      const p = parallaxRef.current;
      if (p) {
        const dx = (e.clientX / window.innerWidth - 0.5) * -14;
        const dy = (e.clientY / window.innerHeight - 0.5) * -8;
        p.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      }
    };
    const isTouch = 'ontouchstart' in window;
    if (!isTouch) window.addEventListener('mousemove', onMove);

    let raf = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const t = themeRef.current;
      const isNight = t === 'deep-night' || t === 'dusk';
      const isDay = t === 'day' || t === 'morning' || t === 'dawn';

      stars.forEach((s) => {
        s.phase += s.twinkleSpeed;
        const alpha = Math.max(0.1, s.baseAlpha + Math.sin(s.phase) * 0.3);
        const mult = isNight ? 1 : t === 'golden-hour' ? 0.5 : 0.15;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = alpha * mult;
        ctx.fill();
      });

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += Math.cos(m.angle) * m.speed;
        m.y -= Math.sin(m.angle) * m.speed;
        m.alpha -= 0.015;
        if (m.alpha <= 0 || m.x < -100 || m.y > height) { meteors.splice(i, 1); continue; }
        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y + Math.sin(m.angle) * m.length;
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,255,255,${m.alpha})`);
        grad.addColorStop(0.3, `rgba(250,90,21,${m.alpha * 0.8})`);
        grad.addColorStop(1, 'rgba(250,90,21,0)');
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = m.thickness;
        ctx.globalAlpha = m.alpha;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.thickness * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }

      if (isDay) {
        birds.forEach((b) => {
          b.x += b.speed;
          b.flap += 0.08;
          const wingY = Math.sin(b.flap) * 3 * b.scale;
          if (b.x > width + 80) {
            b.x = -80;
            b.y = Math.random() * (height * 0.25) + height * 0.15;
          }
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(b.scale, b.scale);
          ctx.fillStyle = 'rgba(8, 12, 22, 0.4)';
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(-12, -8 + wingY, -24, -2 + wingY);
          ctx.quadraticCurveTo(-12, -2, 0, 3);
          ctx.quadraticCurveTo(12, -2, 24, -2 + wingY);
          ctx.quadraticCurveTo(12, -8 + wingY, 0, 0);
          ctx.fill();
          ctx.restore();
        });
      }

      embers.forEach((p) => {
        p.y -= p.speedY;
        p.x += p.speedX + Math.sin(p.y * 0.01) * 0.25;
        p.alpha -= p.fade;
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80 && dist > 0) p.x -= (dx / dist) * 1.2;
        if (p.alpha <= 0 || p.y < 0) {
          p.x = Math.random() * width;
          p.y = height + Math.random() * 20;
          p.alpha = Math.random() * 0.7 + 0.3;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(250, 90, 21, ${p.alpha})`;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(meteorTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  const isNight = theme === 'deep-night' || theme === 'dusk';

  return (
    <div
      ref={parallaxRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none transition-transform duration-500 ease-out"
      style={{ backgroundColor: 'var(--bg-base)' }}
      aria-hidden
    >
      {/* Celestial body */}
      <div className="absolute top-[8%] sm:top-[12%] right-[10%] sm:right-[22%] w-14 sm:w-24 h-14 sm:h-24 rounded-full transition-all duration-1000 flex items-center justify-center">
        <div
          className={`absolute inset-0 rounded-full blur-2xl animate-pulse ${
            isNight
              ? 'bg-gradient-to-br from-slate-200 to-slate-500 opacity-40'
              : 'bg-gradient-to-br from-amber-400 to-[#FA5A15] opacity-75'
          }`}
        />
        <div
          className={`relative w-8 sm:w-14 h-8 sm:h-14 rounded-full shadow-2xl overflow-hidden ${
            isNight
              ? 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500'
              : 'bg-gradient-to-br from-white via-orange-100 to-amber-400'
          }`}
        >
          {isNight && (
            <>
              <span className="absolute left-[22%] top-[28%] w-2 h-2 rounded-full bg-slate-400/60" />
              <span className="absolute left-[58%] top-[55%] w-3 h-3 rounded-full bg-slate-400/50" />
            </>
          )}
        </div>
      </div>

      {/* Sky glow */}
      <div className="sky-glow absolute -top-24 sm:-top-36 left-1/2 -translate-x-1/2 w-[450px] sm:w-[950px] h-[400px] sm:h-[750px] bg-gradient-to-b from-[var(--sky-glow-from)] via-[var(--sky-glow-to)] to-transparent rounded-full blur-[90px] sm:blur-[160px] transition-all duration-1000" />

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-[1]" />

      {/* Mountains */}
      <div className="absolute inset-x-0 bottom-0 h-[65vh] sm:h-[72vh] max-h-[720px] flex items-end z-[2]">
        <svg
          className="absolute inset-x-0 bottom-0 w-full h-full opacity-75 transition-colors duration-1000"
          viewBox="0 0 1440 480"
          preserveAspectRatio="none"
          style={{ color: 'var(--mountain-far)' }}
          fill="currentColor"
        >
          <path d="M0,480 L0,320 C220,240 420,330 660,210 C900,90 1140,260 1440,190 L1440,480 Z" />
          <path
            d="M0,320 C220,240 420,330 660,210 C900,90 1140,260 1440,190"
            fill="none"
            stroke="var(--rim-light)"
            strokeWidth="1.5"
            opacity="0.6"
          />
        </svg>

        <div className="fog-1 absolute inset-x-[-15%] bottom-[20%] h-36 bg-gradient-to-t from-[var(--sky-glow-from)] via-transparent to-transparent blur-3xl opacity-40" />

        <svg
          className="absolute inset-x-0 bottom-0 w-full h-full opacity-90 transition-colors duration-1000"
          viewBox="0 0 1440 440"
          preserveAspectRatio="none"
          style={{ color: 'var(--mountain-mid)' }}
          fill="currentColor"
        >
          <path d="M0,440 L0,280 C260,190 500,290 740,170 C980,70 1200,250 1440,180 L1440,440 Z" />
          <path
            d="M0,280 C260,190 500,290 740,170 C980,70 1200,250 1440,180"
            fill="none"
            stroke="var(--rim-light)"
            strokeWidth="1.2"
            opacity="0.4"
          />
        </svg>

        <div className="fog-2 absolute inset-x-[-15%] bottom-[10%] h-32 bg-gradient-to-t from-[var(--bg-base)] via-[var(--mountain-mid)] to-transparent blur-2xl opacity-60" />

        <svg
          className="relative w-full h-full transition-colors duration-1000"
          viewBox="0 0 1440 380"
          preserveAspectRatio="none"
          style={{ color: 'var(--mountain-near)' }}
          fill="currentColor"
        >
          <path d="M0,380 L0,230 C120,200 180,220 260,260 L270,252 L275,260 L290,248 L296,258 L310,242 L318,256 L330,240 L338,254 C420,280 500,210 620,170 L628,160 L634,170 L646,155 L654,168 L668,148 L676,165 L690,142 L698,160 C820,120 940,210 1080,160 L1090,150 L1096,160 L1110,145 L1118,158 L1130,140 L1138,155 C1260,170 1340,220 1440,180 L1440,380 Z" />
        </svg>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(3,4,8,0.75)_100%)] z-[3]" />
    </div>
  );
};

export default MountainLandscape;
