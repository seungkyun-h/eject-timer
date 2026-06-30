// Shared, DOM-free timer logic used by BOTH the widget window and the pet overlay.
// Exposed on window.TimerCore (plain <script>, no module system).
(function (global) {
  // 고정시차출근제 — 시차별 근무 시간
  const SHIFTS = {
    A: { key: 'A', label: '시차 A', start: '08:30', end: '18:00' },
    B: { key: 'B', label: '시차 B', start: '07:30', end: '17:00' },
    C: { key: 'C', label: '시차 C', start: '09:30', end: '19:00' },
  };

  const CHARS = {
    hamster: {
      key: 'hamster', emoji: '🐹', name: '햄찌',
      fallback: 'assets/hamster-3d.png',
      art: {
        idle: 'assets/hamster-idle.png',
        happy: 'assets/hamster-happy.png',
        sleep: 'assets/hamster-sleep.png',
        grab: 'assets/hamster-grab.png',
      },
    },
    rabbit: {
      key: 'rabbit', emoji: '🐰', name: '토토',
      fallback: 'assets/rabbit-3d.png',
      art: {
        idle: 'assets/rabbit-idle.png',
        happy: 'assets/rabbit-happy.png',
        sleep: 'assets/rabbit-sleep.png',
        grab: 'assets/rabbit-grab.png',
      },
    },
  };

  // Resolve a pose to an image src (falls back to idle, then to the bundled 3D render).
  function artSrc(char, pose) {
    const a = char && char.art;
    if (a && typeof a === 'object') return a[pose] || a.idle || char.fallback;
    return a || char.fallback;
  }

  // Render a character pose into `el` as an <img>, with onerror fallback to the
  // 3D render (so missing AI-generated poses degrade gracefully). CSP-safe: no
  // inline handlers. Skips work when the pose hasn't changed.
  function makeFace(el, char, pose) {
    const src = artSrc(char, pose);
    const key = char.key + '|' + pose + '|' + src;
    if (el.dataset.face === key) return;
    el.dataset.face = key;
    el.textContent = '';
    const img = document.createElement('img');
    img.className = 'art';
    img.draggable = false;
    img.alt = '';
    img.onerror = () => { img.onerror = null; if (char.fallback) img.src = char.fallback; };
    img.src = src;
    el.appendChild(img);
  }

  function timeToday(hhmm, base) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(base.getTime());
    d.setHours(h, m, 0, 0);
    return d;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
  }

  function fmtShort(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}`;
  }

  function fmtClock(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // The single source of truth for "where are we in the workday".
  // phase: 'work' | 'soon' (<=10min) | 'celebrate' (<=2min past) | 'overtime'
  function computeTimer(settings, now) {
    const shift = SHIFTS[settings.shift] || SHIFTS.A;
    const start = timeToday(shift.start, now);
    const baseEnd = timeToday(shift.end, now);
    const otMin = (settings.overtime && settings.overtime.minutes) || 0;
    const target = new Date(baseEnd.getTime() + otMin * 60000);

    const remainingSec = (target.getTime() - now.getTime()) / 1000;
    const span = target.getTime() - start.getTime();
    const progress = clamp01(span > 0 ? (now.getTime() - start.getTime()) / span : 0);

    let phase;
    if (remainingSec <= 0) phase = -remainingSec <= 120 ? 'celebrate' : 'overtime';
    else if (remainingSec <= 600) phase = 'soon';
    else phase = 'work';

    return { shift, start, baseEnd, target, remainingSec, progress, otMin, phase };
  }

  global.TimerCore = { SHIFTS, CHARS, timeToday, fmt, fmtShort, fmtClock, computeTimer, artSrc, makeFace };
})(typeof window !== 'undefined' ? window : globalThis);

// Allow `require()` from Node for unit testing (no-op in the browser/renderer).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).TimerCore;
}
