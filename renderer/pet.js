const { fmtShort, computeTimer } = window.TimerCore;

const stage = document.getElementById('stage');
// idle/walk/react are SHARED by every pet (one decode set). nap is PER-PET (each pet naps
// on its own schedule, so it needs its own playhead).
const vidEls = {
  idle: document.getElementById('petVideoIdle'),
  walk: document.getElementById('petVideoWalk'),
  react: document.getElementById('petVideoReact'),
};
const VIDEO_SET = {
  hamster: {
    idle: 'assets/real-hamster-idle.mp4',
    walk: 'assets/real-hamster-walk.mp4',
    react: 'assets/real-hamster-react.mp4',
    nap: 'assets/real-hamster-nap.mp4',
  },
  // rabbit & shrimp: realistic still images (real-rabbit.png / real-shrimp.png)
};
const setDisplay = (el, d) => { if (el.style.display !== d) el.style.display = d; };

let settings = null;
let phase = 'work';
let bubbleText = '';
let curVideoChar = null;   // which char's srcs are loaded into the video elements
let lastTs = null;

const MAX_PETS = 3;
const SPEED_WALK = 32;   // calmer roam
const SPEED_FAST = 88;   // excited pace near clock-out
const GRAVITY = 2600;
const MARGIN = 80;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// nap clip phase timestamps (seconds): stand→sit (0..T1), doze loop [T1,T2], wake→stand (T2..DUR)
const NAP_T1 = 2.0;
const NAP_T2 = 5.6;
const NAP_DUR = 7.8;

let pets = [];

// ---- one pet ------------------------------------------------------------
function makePet(i) {
  const el = document.createElement('div');
  el.className = 'pet';
  const c3d = document.createElement('canvas'); c3d.width = 220; c3d.height = 220;
  const photo = document.createElement('img'); photo.className = 'photo'; photo.alt = ''; photo.draggable = false;
  const vidC = document.createElement('canvas'); vidC.className = 'vid'; vidC.width = 248; vidC.height = 280;
  el.append(c3d, photo, vidC);
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  const napVid = document.createElement('video'); napVid.muted = true; napVid.playsInline = true; napVid.style.display = 'none';
  stage.append(el, bubble, napVid);

  const startX = MARGIN + (window.innerWidth - MARGIN * 2) * (i + 0.5) / MAX_PETS;
  return {
    el, bubble, c3d, photo, vidC, napVid,
    ctrl: window.Character3D.create(c3d),
    vctrl: null,
    active: false,
    x: startX, targetX: startX, dir: i % 2 ? -1 : 1,
    beh: 'walk', behUntil: 0,
    napPhase: null, dozeUntil: 0,
    petY: 0, vy: 0,
    overPet: false, dragging: false, dragMoved: false, dragOffX: 0, dragGrab: 0, downX: 0, downY: 0,
    reactUntil: 0, swing: 0, lastX: startX, lookX: 0, lookY: 0, lean: 0,
  };
}

function pickTarget(p) { p.targetX = MARGIN + Math.random() * (window.innerWidth - MARGIN * 2); }

// Doze-heavy: mostly nap / stand, rarely roam (it's for a work desk — too much motion is distracting).
function nextBehavior(p, ts) {
  const r = Math.random();
  if (r < 0.60) startNap(p, ts);                                                    // 60% nap
  else if (r < 0.85) { p.beh = 'idle'; p.behUntil = ts + 2000 + Math.random() * 3500; if (Math.random() < 0.5) p.dir *= -1; }  // 25% stand
  else { p.beh = 'walk'; pickTarget(p); }                                           // 15% short roam
}

function startNap(p, ts) {
  p.beh = 'sleep';
  p.napPhase = 'in';
  p.dozeUntil = ts + 12000 + Math.random() * 20000;   // doze 12–32s (long, cozy)
  if (p.napVid && p.napVid.getAttribute('src')) {
    try { p.napVid.currentTime = 0; p.napVid.play().catch(() => {}); } catch (e) { /* ignore */ }
  }
}

function endNap(p, next) {
  p.napPhase = null;
  p.beh = next || 'idle';
  if (next === 'walk') pickTarget(p); else p.behUntil = (lastTs || 0) + 1500 + Math.random() * 2500;
  try { p.napVid.pause(); } catch (e) { /* ignore */ }
}

function walkMove(p, dt, speed) {
  const dx = p.targetX - p.x;
  if (Math.abs(dx) < 4) return true;
  p.dir = dx > 0 ? 1 : -1;
  p.x += p.dir * speed * dt;
  return false;
}

function pat(p) {
  p.reactUntil = (lastTs || 0) + 2200;
  p.vy = 520;
  if (p.beh === 'sleep') { p.napPhase = null; try { p.napVid.pause(); } catch (e) {} p.beh = 'idle'; }
  if (vidEls.react && vidEls.react.getAttribute('src')) {
    try { vidEls.react.currentTime = 0; vidEls.react.play().catch(() => {}); } catch (e) { /* ignore */ }
  }
}

// ---- how many pets are shown --------------------------------------------
function applyCount(n) {
  const count = clamp(n || 1, 1, MAX_PETS);
  pets.forEach((p, i) => {
    const on = i < count;
    if (on && !p.active) {
      p.x = MARGIN + (window.innerWidth - MARGIN * 2) * (i + 0.5) / MAX_PETS;
      p.lastX = p.x; p.petY = 0; p.vy = 0; p.beh = 'walk'; p.napPhase = null; pickTarget(p);
    }
    p.active = on;
    setDisplay(p.el, on ? 'block' : 'none');
    if (!on) { setDisplay(p.bubble, 'none'); try { p.napVid.pause(); } catch (e) {} }
  });
}

// ---- mouse interaction (shared across pets) -----------------------------
function petHitTest(p, cx, cy) {
  const r = p.el.getBoundingClientRect();
  const pad = 6;
  return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
}

let lastInteractive = null;
function setInteractive(v) {
  if (v === lastInteractive) return;
  lastInteractive = v;
  window.timerAPI.petInteractive(v);
}

function setupMouse() {
  window.addEventListener('mousemove', (e) => {
    let dragged = null;
    for (const p of pets) {
      if (!p.active) continue;
      const charCenterY = window.innerHeight - (8 + p.petY + 74);
      p.lookX = clamp((e.clientX - p.x) / 480, -1, 1);
      p.lookY = clamp((e.clientY - charCenterY) / 380, -1, 1);
      if (p.dragging) dragged = p;
    }
    if (dragged) {
      if (Math.hypot(e.clientX - dragged.downX, e.clientY - dragged.downY) > 4) dragged.dragMoved = true;
      dragged.x = Math.min(window.innerWidth - MARGIN, Math.max(MARGIN, e.clientX - dragged.dragOffX));
      dragged.petY = Math.max(0, (window.innerHeight - e.clientY) + dragged.dragGrab - 8);
      setInteractive(true);
      return;
    }
    let anyOver = false;
    for (const p of pets) {
      if (!p.active) continue;
      const over = petHitTest(p, e.clientX, e.clientY);
      if (over !== p.overPet) { p.overPet = over; p.el.style.cursor = over ? 'grab' : 'default'; }
      if (over) anyOver = true;
    }
    setInteractive(anyOver);
  });

  window.addEventListener('mousedown', (e) => {
    let target = null;
    for (const p of pets) { if (p.active && petHitTest(p, e.clientX, e.clientY)) target = p; }  // topmost wins
    if (!target) return;
    // grabbing a napping pet wakes it
    if (target.beh === 'sleep') { target.napPhase = null; try { target.napVid.pause(); } catch (err) {} target.beh = 'idle'; }
    target.dragging = true;
    target.dragMoved = false;
    target.downX = e.clientX;
    target.downY = e.clientY;
    target.dragOffX = e.clientX - target.x;
    target.dragGrab = (8 + target.petY) - (window.innerHeight - e.clientY);
    target.el.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    for (const p of pets) {
      if (!p.dragging) continue;
      p.dragging = false;
      p.el.style.cursor = p.overPet ? 'grab' : 'default';
      if (!p.dragMoved) pat(p);
      else { p.vy = 0; p.beh = 'walk'; pickTarget(p); }
    }
  });
}

// ---- timer bubble text (shared) -----------------------------------------
function updateTimer() {
  if (!settings) return;
  const t = computeTimer(settings, new Date());
  phase = t.phase;
  if (settings.char === 'shrimp') {
    if (t.remainingSec > 0) {
      bubbleText = phase === 'soon'
        ? `곧 퇴근이새우~! ${fmtShort(t.remainingSec)}`
        : `퇴근까지 ${fmtShort(t.remainingSec)} 남았새우~`;
    } else {
      bubbleText = phase === 'celebrate' ? '🦐 퇴근이새우~!' : `+${fmtShort(-t.remainingSec)} 야근이새우...`;
    }
  } else {
    const txt = t.remainingSec > 0 ? `퇴근까지 ${fmtShort(t.remainingSec)}` : `+${fmtShort(-t.remainingSec)} 추가근무`;
    const prefix = phase === 'celebrate' ? '🎉 ' : phase === 'overtime' ? '💤 ' : '';
    bubbleText = prefix + txt;
  }
}

// ---- per-pet frame step -------------------------------------------------
function stepPet(p, dt, ts, f) {
  const { calm, realistic, char, videoMode } = f;
  const reacting = ts < p.reactUntil;

  // excited / quiet modes shouldn't nap
  if (p.beh === 'sleep' && (calm || phase === 'celebrate' || phase === 'soon')) endNap(p, 'idle');

  setDisplay(p.c3d, !realistic ? 'block' : 'none');
  setDisplay(p.photo, (realistic && !videoMode) ? 'block' : 'none');
  setDisplay(p.vidC, videoMode ? 'block' : 'none');
  if (realistic && !videoMode) {
    const src = `assets/real-${char}.png`;
    if (p.photo.getAttribute('src') !== src) p.photo.setAttribute('src', src);
  }
  if (videoMode && !p.vctrl) {
    const map = { idle: vidEls.idle, walk: vidEls.walk, react: vidEls.react };
    if (p.napVid.getAttribute('src')) map.nap = p.napVid;
    p.vctrl = window.VideoPet.create(p.vidC, map);
  }

  // live 3D character (skipped in realistic mode)
  if (!realistic && p.ctrl) {
    let behavior = 'idle';
    if (p.dragging) behavior = 'grab';
    else if (reacting) behavior = 'happy';
    else if (calm) behavior = 'idle';
    else if (phase === 'celebrate') behavior = 'happy';
    else if (p.beh === 'sleep' || phase === 'overtime') behavior = 'sleep';
    else if (phase === 'soon' || p.beh === 'walk') behavior = 'walk';
    p.ctrl.setCharacter(char);
    p.ctrl.setState({ behavior, dir: p.dir, lookX: p.lookX, lookY: p.lookY });
    p.ctrl.frame(dt * 1000);
  }

  // motion (realistic pet stays put; only drag / pat / celebrate / roam hops)
  let hopY = 0;
  if (p.dragging) {
    // mouse-driven
  } else if (p.petY > 0 || p.vy !== 0) {
    p.vy -= GRAVITY * dt; p.petY += p.vy * dt;
    if (p.petY <= 0) { p.petY = 0; p.vy = 0; }
  } else if (reacting) {
    hopY = Math.abs(Math.sin(ts / 110)) * 14;
  } else if (p.beh === 'sleep') {
    // nap state machine: fall asleep -> doze loop -> wake. drives the nap clip's playhead.
    stepNap(p, ts, videoMode);
    hopY = 0;
  } else if (realistic && !videoMode) {
    hopY = (!calm && phase === 'celebrate') ? Math.abs(Math.sin(ts / 160)) * 16 : 0;
  } else if (calm) {
    hopY = 0;
  } else if (phase === 'celebrate') {
    hopY = Math.abs(Math.sin(ts / 140)) * 26;
  } else if (phase === 'soon') {
    if (walkMove(p, dt, SPEED_FAST)) pickTarget(p);
    hopY = Math.abs(Math.sin(ts / 90)) * 14;
  } else if (phase === 'overtime') {
    hopY = Math.sin(ts / 700) * 2;
  } else if (p.beh === 'walk') {
    if (walkMove(p, dt, SPEED_WALK)) nextBehavior(p, ts);
    hopY = Math.abs(Math.sin(ts / 150)) * 9;
  } else if (p.beh === 'idle') {
    hopY = Math.abs(Math.sin(ts / 320)) * 2;
    if (Math.random() < 0.003) p.vy = 200;
    if (ts >= p.behUntil) nextBehavior(p, ts);
  }

  const lift = p.petY + hopY;
  const vx = p.x - p.lastX; p.lastX = p.x;
  if (p.dragging) p.swing += (clamp(-vx * 1.2, -18, 18) - p.swing) * 0.22; else p.swing *= 0.86;
  const leanTarget = (p.dragging || realistic) ? 0 : clamp(vx * 0.4, -5, 5);
  p.lean += (leanTarget - p.lean) * 0.18;

  p.el.style.left = p.x + 'px';
  p.el.style.bottom = '8px';
  p.el.style.transformOrigin = p.dragging ? '50% 14%' : '50% 92%';
  p.el.style.transform = `translate(-50%, ${-lift}px) rotate(${(p.lean + p.swing).toFixed(2)}deg)`;

  // photoreal: behavior-driven live video (or still) + parallax tilt
  if (realistic) {
    const breathe = 1 + Math.sin(ts / 1400) * 0.015;
    const tilt = `perspective(600px) rotateY(${(p.lookX * 18).toFixed(1)}deg) rotateX(${(-p.lookY * 14).toFixed(1)}deg)`;
    if (videoMode) {
      let vbeh = 'idle';
      if (reacting) vbeh = 'react';
      else if (p.beh === 'sleep') vbeh = 'nap';
      else if (!calm && (phase === 'celebrate' || phase === 'soon' || p.beh === 'walk')) vbeh = 'walk';
      if (p.vctrl) { p.vctrl.setBehavior(vbeh); p.vctrl.frame(); }
      const flip = (vbeh === 'walk' && p.dir < 0) ? -1 : 1;
      p.vidC.style.transform = `${tilt} scale(${(flip * breathe).toFixed(3)}, ${breathe.toFixed(3)})`;
    } else {
      p.photo.style.transform = `${tilt} scale(${breathe.toFixed(3)})`;
    }
  }

  const showText = (p.overPet && !p.dragging) || reacting;
  if (showText) {
    p.bubble.textContent = reacting ? (settings && settings.char === 'shrimp' ? '🦐 간지러새우~' : '💕 헤헤') : bubbleText;
    p.bubble.style.display = 'block';
    p.bubble.style.left = p.x + 'px';
    p.bubble.style.bottom = (150 + lift) + 'px';
  } else {
    p.bubble.style.display = 'none';
  }
}

// falling asleep -> doze loop -> wake, then back to idle. Works with or without the nap video.
function stepNap(p, ts, videoMode) {
  const nv = p.napVid;
  const hasVid = videoMode && nv && nv.getAttribute('src');
  const ct = hasVid ? nv.currentTime : 0;
  if (p.napPhase === 'in') {
    if (!hasVid || ct >= NAP_T1) p.napPhase = 'doze';
  } else if (p.napPhase === 'doze') {
    if (hasVid && (ct >= NAP_T2 || ct < NAP_T1 - 0.15)) { try { nv.currentTime = NAP_T1; } catch (e) { /* ignore */ } }
    if (ts >= p.dozeUntil) {
      p.napPhase = 'out';
      if (hasVid) { try { nv.currentTime = NAP_T2; nv.play().catch(() => {}); } catch (e) { /* ignore */ } }
    }
  } else if (p.napPhase === 'out') {
    if (!hasVid || ct >= NAP_DUR) endNap(p, Math.random() < 0.3 ? 'walk' : 'idle');
  } else {
    p.napPhase = 'in';
  }
}

// ---- main loop ----------------------------------------------------------
function loop(ts) {
  if (lastTs === null) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  const calm = settings && settings.calm;
  const realistic = settings && settings.realistic;
  const char = settings ? settings.char : 'hamster';
  const vset = realistic ? VIDEO_SET[char] : null;
  const videoMode = !!vset;

  // load the behaviour videos when the character changes
  if (videoMode && curVideoChar !== char) {
    curVideoChar = char;
    for (const k of ['idle', 'walk', 'react']) {
      const src = vset[k] || vset.idle;
      if (vidEls[k].getAttribute('src') !== src) { vidEls[k].src = src; vidEls[k].play().catch(() => {}); }
    }
    for (const p of pets) {
      if (vset.nap && p.napVid.getAttribute('src') !== vset.nap) p.napVid.src = vset.nap;
      p.vctrl = null;   // rebind chroma-key to the new textures
    }
  }
  if (!videoMode) curVideoChar = null;

  const f = { calm, realistic, char, videoMode };
  for (const p of pets) { if (p.active) stepPet(p, dt, ts, f); }
  requestAnimationFrame(loop);
}

async function boot() {
  settings = await window.timerAPI.getState();
  for (let i = 0; i < MAX_PETS; i++) pets.push(makePet(i));
  applyCount(settings.petCount);
  window.timerAPI.onStateChanged((s) => {
    const prev = settings ? (settings.petCount || 1) : 1;
    settings = s;
    if ((s.petCount || 1) !== prev) applyCount(s.petCount);
  });
  setupMouse();
  requestAnimationFrame(loop);
  setInterval(updateTimer, 1000);
  updateTimer();
}

document.addEventListener('DOMContentLoaded', boot);
