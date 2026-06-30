const { CHARS, fmt, fmtShort, fmtClock, computeTimer } = window.TimerCore;

let settings = null;
let prevRemaining = null;
let notifiedKey = null;
let ctrl = null;
let lastRaf = null;
let curBeh = 'idle';
let lookX = 0, lookY = 0;

const $ = (id) => document.getElementById(id);

async function boot() {
  settings = await window.timerAPI.getState();
  ctrl = window.Character3D.create($('charCanvas'));
  window.timerAPI.onStateChanged((s) => { settings = s; syncControls(); tick(); });
  wire();
  syncControls();
  tick();
  setInterval(tick, 1000);
  requestAnimationFrame(raf);
}

// drives the live 3D character animation
function raf(ts) {
  if (lastRaf == null) lastRaf = ts;
  const dt = ts - lastRaf;
  lastRaf = ts;
  const calm = settings && settings.calm;
  const realistic = settings && settings.realistic;
  const canvas = $('charCanvas'), photo = $('charPhoto');
  if (realistic) {
    if (canvas.style.display !== 'none') canvas.style.display = 'none';
    if (photo.style.display !== 'block') photo.style.display = 'block';
    const src = `assets/real-${settings ? settings.char : 'hamster'}.png`;
    if (photo.getAttribute('src') !== src) photo.setAttribute('src', src);
    const breathe = calm ? 1 : 1 + Math.sin(ts / 1400) * 0.015;
    const lx = calm ? 0 : lookX, ly = calm ? 0 : lookY;
    photo.style.transform = `perspective(500px) rotateY(${(lx * 16).toFixed(1)}deg) rotateX(${(-ly * 12).toFixed(1)}deg) scale(${breathe.toFixed(3)})`;
  } else {
    if (canvas.style.display === 'none') canvas.style.display = 'block';
    if (photo.style.display === 'block') photo.style.display = 'none';
    if (ctrl) {
      ctrl.setState({ behavior: calm ? 'idle' : curBeh, dir: 1, lookX: calm ? 0 : lookX, lookY: calm ? 0 : lookY });
      ctrl.frame(dt);
    }
  }
  lookX *= 0.94; lookY *= 0.94; // ease back to front when not hovering the widget
  requestAnimationFrame(raf);
}

function wire() {
  document.querySelectorAll('[data-shift]').forEach((b) => {
    b.addEventListener('click', () => window.timerAPI.setState({ shift: b.dataset.shift }));
  });
  $('charToggle').addEventListener('click', () => {
    window.timerAPI.setState({ char: settings.char === 'hamster' ? 'rabbit' : 'hamster' });
  });
  $('ot30').addEventListener('click', () => addOvertime(30));
  $('ot60').addEventListener('click', () => addOvertime(60));
  $('otAdd').addEventListener('click', () => {
    const v = parseInt($('otInput').value, 10);
    if (!Number.isNaN(v) && v !== 0) { addOvertime(v); $('otInput').value = ''; }
  });
  $('otReset').addEventListener('click', () => window.timerAPI.setState({ overtime: { minutes: 0 } }));
  $('petBtn').addEventListener('click', () => window.timerAPI.setState({ pet: !settings.pet }));
  $('calmBtn').addEventListener('click', () => window.timerAPI.setState({ calm: !settings.calm }));
  $('photoBtn').addEventListener('click', () => window.timerAPI.setState({ realistic: !settings.realistic }));
  $('onTopBtn').addEventListener('click', () => window.timerAPI.setState({ onTop: !settings.onTop }));
  $('hideBtn').addEventListener('click', () => window.timerAPI.hideWindow());
  window.addEventListener('mousemove', (e) => {
    const r = $('charCanvas').getBoundingClientRect();
    lookX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 160));
    lookY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 140));
  });
}

function currentOt() {
  return (settings.overtime && settings.overtime.minutes) || 0;
}

function addOvertime(min) {
  window.timerAPI.setState({ overtime: { minutes: Math.max(0, currentOt() + min) } });
}

function syncControls() {
  document.querySelectorAll('[data-shift]').forEach((b) =>
    b.classList.toggle('active', b.dataset.shift === settings.shift));
  const c = CHARS[settings.char];
  $('charToggle').textContent = `${c.emoji} ${c.name}`;
  $('petBtn').classList.toggle('active', !!settings.pet);
  $('calmBtn').classList.toggle('active', !!settings.calm);
  $('photoBtn').classList.toggle('active', !!settings.realistic);
  $('onTopBtn').classList.toggle('active', !!settings.onTop);
  const ot = currentOt();
  $('otDisplay').textContent = ot > 0 ? `현재 +${ot}분` : '야근 없음';
}

function tick() {
  if (!settings) return;
  const now = new Date();
  const t = computeTimer(settings, now);
  const c = CHARS[settings.char];

  // ----- countdown text -----
  if (t.remainingSec > 0) {
    $('clock').textContent = fmt(t.remainingSec);
    $('statusLabel').textContent = t.phase === 'soon' ? '🏃 곧 퇴근!' : '🏠 퇴근까지';
    $('subline').textContent = t.otMin > 0
      ? `정시 ${fmtClock(t.baseEnd)} · 야근 +${t.otMin}분 → ${fmtClock(t.target)}`
      : `퇴근 예정 ${fmtClock(t.target)}`;
  } else {
    $('clock').textContent = '+' + fmt(-t.remainingSec);
    $('statusLabel').textContent = t.phase === 'celebrate' ? '🎉 퇴근!' : '💤 추가 근무 중';
    $('subline').textContent = `예정 ${fmtClock(t.target)} 경과 · 오늘도 고생하셨어요`;
  }
  $('clock').classList.toggle('soon', t.phase === 'soon');
  $('clock').classList.toggle('done', t.remainingSec <= 0);

  // ----- character + progress -----
  $('progressFill').style.width = (t.progress * 100).toFixed(1) + '%';
  const left = 3 + t.progress * 82;
  $('char').style.left = left + '%';
  $('statusEmoji').style.left = left + '%';
  let beh = 'idle';
  if (t.remainingSec <= 0) beh = t.phase === 'celebrate' ? 'happy' : 'sleep';
  else if (t.phase === 'soon') beh = 'happy';
  curBeh = beh;
  if (ctrl) ctrl.setCharacter(settings.char);
  $('statusEmoji').textContent =
    t.phase === 'celebrate' ? '🎉' : t.phase === 'overtime' ? '💤' : t.phase === 'soon' ? '💨' : '';

  // ----- menu-bar tray -----
  const trayTxt = t.remainingSec > 0 ? fmtShort(t.remainingSec) : '+' + fmtShort(-t.remainingSec);
  window.timerAPI.updateTray(` ${c.emoji} ${trayTxt}`);

  // ----- fire a notification the moment we cross the clock-out target -----
  const key = `${now.toDateString()}@${Math.floor(t.target.getTime() / 1000)}`;
  if (prevRemaining !== null && prevRemaining > 0 && t.remainingSec <= 0 && notifiedKey !== key) {
    notifiedKey = key;
    window.timerAPI.notify({
      title: '🎉 퇴근 시간이에요!',
      body: '오늘도 고생 많으셨어요. 조심히 들어가세요!',
    });
  }
  prevRemaining = t.remainingSec;
}

document.addEventListener('DOMContentLoaded', boot);
