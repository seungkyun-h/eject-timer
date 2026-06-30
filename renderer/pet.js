const { fmtShort, computeTimer } = window.TimerCore;

const petEl = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');
const canvasEl = document.getElementById('petCanvas');
const photoEl = document.getElementById('petPhoto');
const vidCanvasEl = document.getElementById('petVideoCanvas');
const vidEls = {
  idle: document.getElementById('petVideoIdle'),
  walk: document.getElementById('petVideoWalk'),
  react: document.getElementById('petVideoReact'),
};
const VIDEO_SET = {
  hamster: { idle: 'assets/real-hamster.mp4', walk: 'assets/real-hamster-walk.mp4', react: 'assets/real-hamster-react.mp4' },
  rabbit: { idle: 'assets/real-rabbit.mp4' },
};
const setDisplay = (el, d) => { if (el.style.display !== d) el.style.display = d; };
let ctrl = null;
let vctrl = null;
let curVideoChar = null;

let settings = null;
let phase = 'work';
let bubbleText = '';

// horizontal motion / behavior
let x = window.innerWidth * 0.5;
let targetX = x;
let dir = 1;
let beh = 'walk';   // 'walk' | 'idle' | 'sleep'
let behUntil = 0;

// vertical motion (pick-up / drop physics)
let petY = 0;
let vy = 0;

// interaction
let overPet = false;
let dragging = false;
let dragMoved = false;
let dragOffX = 0;
let dragGrab = 0;
let downX = 0;
let downY = 0;
let reactUntil = 0;
let swing = 0;      // degrees, for the "held & swinging" feel
let lastX = x;
let lookX = 0, lookY = 0;   // cursor direction, for head/eye tracking

let lastTs = null;

const SPEED_WALK = 60;
const SPEED_FAST = 150;
const GRAVITY = 2600;
const MARGIN = 80;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let lean = 0;       // body lean toward walk direction
let prevLift = 0;   // for squash/stretch from vertical speed

function pickTarget() {
  targetX = MARGIN + Math.random() * (window.innerWidth - MARGIN * 2);
}

function nextBehavior(ts) {
  const r = Math.random();
  if (r < 0.55) { beh = 'walk'; pickTarget(); }
  else if (r < 0.82) { beh = 'idle'; behUntil = ts + 1000 + Math.random() * 2200; if (Math.random() < 0.5) dir *= -1; }
  else { beh = 'sleep'; behUntil = ts + 4000 + Math.random() * 5000; }
}

async function boot() {
  settings = await window.timerAPI.getState();
  ctrl = window.Character3D.create(document.getElementById('petCanvas'));
  window.timerAPI.onStateChanged((s) => { settings = s; });
  pickTarget();
  setupMouse();
  requestAnimationFrame(loop);
  setInterval(updateTimer, 1000);
  updateTimer();
}

// ---- mouse interaction ---------------------------------------------------
function isOverPet(cx, cy) {
  const r = petEl.getBoundingClientRect();
  const pad = 6;
  return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
}

function setupMouse() {
  window.addEventListener('mousemove', (e) => {
    // head/eyes track the cursor anywhere on the screen
    const charCenterY = window.innerHeight - (8 + petY + 55);
    lookX = clamp((e.clientX - x) / 480, -1, 1);
    lookY = clamp((e.clientY - charCenterY) / 380, -1, 1);

    if (dragging) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) dragMoved = true;
      x = Math.min(window.innerWidth - MARGIN, Math.max(MARGIN, e.clientX - dragOffX));
      petY = Math.max(0, (window.innerHeight - e.clientY) + dragGrab - 8);
      return;
    }
    const over = isOverPet(e.clientX, e.clientY);
    if (over !== overPet) {
      overPet = over;
      petEl.style.cursor = over ? 'grab' : 'default';
      window.timerAPI.petInteractive(over);
    }
  });

  window.addEventListener('mousedown', (e) => {
    if (!isOverPet(e.clientX, e.clientY)) return;
    dragging = true;
    dragMoved = false;
    downX = e.clientX;
    downY = e.clientY;
    dragOffX = e.clientX - x;
    dragGrab = (8 + petY) - (window.innerHeight - e.clientY);
    petEl.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    petEl.style.cursor = overPet ? 'grab' : 'default';
    if (!dragMoved) {
      pat();
    } else {
      vy = 0;            // dropped — fall back to the floor
      beh = 'walk';
      pickTarget();
    }
  });
}

function pat() {
  reactUntil = (lastTs || 0) + 2200;
  vy = 520;
  if (vidEls.react && vidEls.react.getAttribute('src')) {
    try { vidEls.react.currentTime = 0; vidEls.react.play().catch(() => {}); } catch (e) { /* ignore */ }
  }
}

// ---- timer bubble (only shown on hover) ----------------------------------
function updateTimer() {
  if (!settings) return;
  const t = computeTimer(settings, new Date());
  phase = t.phase;
  if (settings.char === 'shrimp') {
    // 유쾌한 새우 말투 (~새우)
    if (t.remainingSec > 0) {
      bubbleText = phase === 'soon'
        ? `곧 퇴근이새우~! ${fmtShort(t.remainingSec)}`
        : `퇴근까지 ${fmtShort(t.remainingSec)} 남았새우~`;
    } else {
      bubbleText = phase === 'celebrate'
        ? '🦐 퇴근이새우~!'
        : `+${fmtShort(-t.remainingSec)} 야근이새우...`;
    }
  } else {
    const txt = t.remainingSec > 0
      ? `퇴근까지 ${fmtShort(t.remainingSec)}`
      : `+${fmtShort(-t.remainingSec)} 추가근무`;
    const prefix = phase === 'celebrate' ? '🎉 ' : phase === 'overtime' ? '💤 ' : '';
    bubbleText = prefix + txt;
  }
}

// ---- main loop -----------------------------------------------------------
function loop(ts) {
  if (lastTs === null) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  const reacting = ts < reactUntil;
  const calm = settings && settings.calm;
  const realistic = settings && settings.realistic;

  // ----- render mode: live 3D / photoreal video / photoreal still -----
  const char = settings ? settings.char : 'hamster';
  const vset = realistic ? VIDEO_SET[char] : null;
  const videoMode = !!vset;
  setDisplay(canvasEl, !realistic ? 'block' : 'none');
  setDisplay(photoEl, (realistic && !videoMode) ? 'block' : 'none');
  setDisplay(vidCanvasEl, videoMode ? 'block' : 'none');
  if (realistic && !videoMode) {
    const src = `assets/real-${char}.png`;
    if (photoEl.getAttribute('src') !== src) photoEl.setAttribute('src', src);
  }
  if (videoMode && curVideoChar !== char) {
    curVideoChar = char;
    for (const k of ['idle', 'walk', 'react']) {
      const src = vset[k] || vset.idle;
      if (vidEls[k].getAttribute('src') !== src) { vidEls[k].src = src; vidEls[k].play().catch(() => {}); }
    }
    vctrl = window.VideoPet.create(vidCanvasEl, vidEls);
  }

  // ----- live 3D character (skipped in realistic mode) -----
  if (!realistic && ctrl) {
    let behavior = 'idle';
    if (dragging) behavior = 'grab';
    else if (reacting) behavior = 'happy';
    else if (calm) behavior = 'idle';
    else if (phase === 'celebrate') behavior = 'happy';
    else if (phase === 'soon' || beh === 'walk') behavior = 'walk';
    else if (phase === 'overtime' || beh === 'sleep') behavior = 'sleep';
    ctrl.setCharacter(settings ? settings.char : 'hamster');
    ctrl.setState({ behavior, dir, lookX, lookY }); // calm stops movement but keeps gaze
    ctrl.frame(dt * 1000);
  }

  // ----- motion (realistic pet stays put; only drag / pat / celebrate hops) -----
  let hopY = 0;
  if (dragging) {
    // mouse-driven; nothing else
  } else if (petY > 0 || vy !== 0) {
    vy -= GRAVITY * dt;
    petY += vy * dt;
    if (petY <= 0) { petY = 0; vy = 0; }
  } else if (reacting) {
    hopY = Math.abs(Math.sin(ts / 110)) * 14;
  } else if (realistic && !videoMode) {
    hopY = (!calm && phase === 'celebrate') ? Math.abs(Math.sin(ts / 160)) * 16 : 0;
  } else if (calm) {
    hopY = 0;                                  // stay put, only gentle 3D breathing
  } else if (phase === 'celebrate') {
    hopY = Math.abs(Math.sin(ts / 140)) * 26;
  } else if (phase === 'soon') {
    if (walkMove(dt, SPEED_FAST)) pickTarget();
    hopY = Math.abs(Math.sin(ts / 90)) * 14;
  } else if (phase === 'overtime') {
    hopY = Math.sin(ts / 700) * 2;            // dozing, gentle breathing
  } else if (beh === 'walk') {
    if (walkMove(dt, SPEED_WALK)) nextBehavior(ts);
    hopY = Math.abs(Math.sin(ts / 150)) * 9;
  } else if (beh === 'idle') {
    hopY = Math.abs(Math.sin(ts / 320)) * 2;
    if (Math.random() < 0.004) vy = 200;      // spontaneous little hop
    if (ts >= behUntil) nextBehavior(ts);
  } else if (beh === 'sleep') {
    hopY = Math.sin(ts / 650) * 2;            // breathing
    if (ts >= behUntil) { beh = 'walk'; pickTarget(); }
  }

  // ----- position + lean/swing -----
  const lift = petY + hopY;
  const vx = x - lastX;
  lastX = x;
  if (dragging) swing += (clamp(-vx * 1.2, -18, 18) - swing) * 0.22;
  else swing *= 0.86;
  const leanTarget = (dragging || realistic) ? 0 : clamp(vx * 0.4, -5, 5);
  lean += (leanTarget - lean) * 0.18;

  petEl.style.left = x + 'px';
  petEl.style.bottom = '8px';
  petEl.style.transformOrigin = dragging ? '50% 14%' : '50% 92%';
  petEl.style.transform =
    `translate(-50%, ${-lift}px) rotate(${(lean + swing).toFixed(2)}deg)`;

  // ----- photoreal: behavior-driven live video (or still) + parallax tilt -----
  if (realistic) {
    const breathe = 1 + Math.sin(ts / 1400) * 0.015;
    const tilt = `perspective(600px) rotateY(${(lookX * 18).toFixed(1)}deg) rotateX(${(-lookY * 14).toFixed(1)}deg)`;
    if (videoMode) {
      let vbeh = 'idle';
      if (reacting) vbeh = 'react';
      else if (!calm && (phase === 'celebrate' || phase === 'soon' || beh === 'walk')) vbeh = 'walk';
      if (vctrl) { vctrl.setBehavior(vbeh); vctrl.frame(); }
      const flip = (vbeh === 'walk' && dir < 0) ? -1 : 1;
      vidCanvasEl.style.transform = `${tilt} scale(${(flip * breathe).toFixed(3)}, ${breathe.toFixed(3)})`;
    } else {
      photoEl.style.transform = `${tilt} scale(${breathe.toFixed(3)})`;
    }
  }

  const showText = (overPet && !dragging) || reacting;
  if (showText) {
    bubbleEl.textContent = reacting ? (settings && settings.char === 'shrimp' ? '🦐 간지러새우~' : '💕 헤헤') : bubbleText;
    bubbleEl.style.display = 'block';
    bubbleEl.style.left = x + 'px';
    bubbleEl.style.bottom = (132 + lift) + 'px';
  } else {
    bubbleEl.style.display = 'none';
  }

  requestAnimationFrame(loop);
}

function walkMove(dt, speed) {
  const dx = targetX - x;
  if (Math.abs(dx) < 4) return true;
  dir = dx > 0 ? 1 : -1;
  x += dir * speed * dt;
  return false;
}

document.addEventListener('DOMContentLoaded', boot);
