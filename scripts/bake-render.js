// Builds cute clay-style 3D characters from primitives and renders them to
// transparent PNGs with soft studio lighting — one image per (animal, pose).
// Poses: idle, happy, sleep, grab.  Runs in an Electron renderer with
// nodeIntegration so it can require('three') and write files directly.
const THREE = require('three');
const fs = require('fs');
const path = require('path');

const SIZE = 768;
const OUT_DIR = path.join(__dirname, '..', 'renderer', 'assets');
const POSES = ['idle', 'happy', 'sleep', 'grab'];

function makeRenderer() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(SIZE, SIZE);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  return r;
}

function mat(color, rough = 0.62, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: 0, ...extra });
}

function ball(group, r, pos, scale, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 56, 56), material);
  m.position.set(pos[0], pos[1], pos[2]);
  const s = scale || [1, 1, 1];
  m.scale.set(s[0], s[1], s[2]);
  group.add(m);
  return m;
}

function eyesOpen(group, xs, y, z, r, wide) {
  const eyeMat = mat(0x2a211d, 0.12);
  const whiteMat = mat(0xffffff, 0.18);
  for (const x of xs) {
    ball(group, r, [x, y, z], [1, wide ? 1.0 : 1.1, 1], eyeMat);
    ball(group, r * 0.42, [x + 0.06, y + 0.1, z + 0.12], [1, 1, 1], whiteMat);   // big sparkle
    ball(group, r * 0.2, [x - 0.07, y - 0.05, z + 0.12], [1, 1, 1], whiteMat);   // small sparkle
  }
}

// Closed eyes: up=true => happy "^ ^"; up=false => sleepy "‿ ‿".
function eyesArc(group, xs, y, z, up) {
  const m = mat(0x2a211d, 0.3);
  for (const x of xs) {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 10, 22, Math.PI), m);
    e.position.set(x, y, z);
    e.rotation.z = up ? 0 : Math.PI;
    e.scale.set(1, 0.7, 1);
    group.add(e);
  }
}

function addSmile(group, y, z, color, w = 0.13) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(w, 0.03, 12, 28, Math.PI), mat(color, 0.4));
  m.position.set(0, y, z);
  m.rotation.z = Math.PI;
  m.scale.set(1, 0.66, 1);
  group.add(m);
}

// pose-driven facial features + limb placement, shared by both animals.
function addFace(g, pose, cfg) {
  if (pose === 'sleep') eyesArc(g, cfg.eyeX, cfg.eyeY, cfg.eyeZ, false);
  else if (pose === 'happy') eyesArc(g, cfg.eyeX, cfg.eyeY + 0.02, cfg.eyeZ, true);
  else if (pose === 'grab') eyesOpen(g, cfg.eyeX, cfg.eyeY + 0.04, cfg.eyeZ, cfg.eyeR + 0.03, true);
  else eyesOpen(g, cfg.eyeX, cfg.eyeY, cfg.eyeZ, cfg.eyeR, false);

  // mouth
  if (pose === 'grab') ball(g, 0.07, [0, cfg.mouthY, cfg.noseZ], [1, 1.25, 1], mat(0x7a4a3c, 0.4)); // surprised "o"
  else if (pose === 'happy') addSmile(g, cfg.mouthY, cfg.mouthZ, cfg.mouthC, 0.16);
  else if (pose === 'sleep') addSmile(g, cfg.mouthY, cfg.mouthZ, cfg.mouthC, 0.07);
  else addSmile(g, cfg.mouthY, cfg.mouthZ, cfg.mouthC, 0.12);
}

function armPositions(pose) {
  if (pose === 'happy') return [[-0.64, 0.42, 0.42], [0.64, 0.42, 0.42]];
  if (pose === 'grab') return [[-0.84, 0.08, 0.3], [0.84, 0.08, 0.3]];
  if (pose === 'sleep') return [[-0.3, -0.62, 0.55], [0.3, -0.62, 0.55]];
  return [[-0.52, -0.62, 0.52], [0.52, -0.62, 0.52]];
}

function footPositions(pose, baseZ) {
  if (pose === 'grab') return [[-0.46, -0.95, baseZ - 0.05], [0.46, -0.95, baseZ - 0.05]];
  return [[-0.34, -0.95, baseZ], [0.34, -0.95, baseZ]];
}

function applyPoseTransform(g, pose) {
  if (pose === 'grab') { g.rotation.z = 0.16; g.scale.set(1, 1.06, 1); }
  else if (pose === 'sleep') { g.rotation.z = 0.1; }
}

function makeHamster(pose) {
  const g = new THREE.Group();
  const body = mat(0xEBAE5A);
  const cream = mat(0xFFF1DC, 0.72);
  const tan = mat(0xD9974A);
  const blush = mat(0xFF8E78, 0.5);
  const pink = mat(0xCB6A7B, 0.45);

  ball(g, 1.0, [0, 0, 0], [1.07, 0.96, 0.92], body);
  ball(g, 0.7, [0, -0.18, 0.52], [0.95, 0.95, 0.55], cream);
  ball(g, 0.36, [-0.62, 0.78, -0.04], [1, 1, 0.55], tan);
  ball(g, 0.36, [0.62, 0.78, -0.04], [1, 1, 0.55], tan);
  ball(g, 0.18, [-0.62, 0.8, 0.16], [1, 1, 0.4], pink);
  ball(g, 0.18, [0.62, 0.8, 0.16], [1, 1, 0.4], pink);
  ball(g, 0.42, [0, -0.04, 0.74], [1, 0.82, 0.7], cream);
  ball(g, 0.11, [0, 0.0, 1.08], [1, 0.82, 1], pink);            // nose
  ball(g, 0.23, [-0.47, -0.14, 0.7], [1, 0.78, 0.34], blush);
  ball(g, 0.23, [0.47, -0.14, 0.7], [1, 0.78, 0.34], blush);

  addFace(g, pose, { eyeX: [-0.3, 0.3], eyeY: 0.2, eyeZ: 0.88, eyeR: 0.17, mouthY: -0.16, mouthZ: 1.0, noseZ: 1.06, mouthC: 0x9c6a54 });
  for (const p of armPositions(pose)) ball(g, 0.2, p, [1, 1, 1], tan);
  for (const p of footPositions(pose, 0.3)) ball(g, 0.27, p, [1, 0.58, 1.2], cream);
  applyPoseTransform(g, pose);
  return g;
}

function makeRabbit(pose) {
  const g = new THREE.Group();
  const body = mat(0xFFFFFF, 0.72);
  const pink = mat(0xFF9FB0, 0.5);
  const blush = mat(0xFFA0B4, 0.5);

  ball(g, 1.0, [0, -0.05, 0], [1.03, 0.98, 0.95], body);
  ball(g, 0.68, [0, -0.24, 0.52], [0.9, 0.92, 0.5], body);
  ball(g, 0.5, [-0.4, 1.2, -0.05], [0.5, 1.58, 0.42], body);
  ball(g, 0.5, [0.4, 1.2, -0.05], [0.5, 1.58, 0.42], body);
  ball(g, 0.5, [-0.4, 1.2, 0.08], [0.28, 1.28, 0.32], pink);
  ball(g, 0.5, [0.4, 1.2, 0.08], [0.28, 1.28, 0.32], pink);
  ball(g, 0.37, [0, -0.06, 0.76], [1, 0.8, 0.6], body);
  ball(g, 0.2, [-0.17, -0.16, 0.92], [1, 0.92, 0.8], body);     // muzzle puffs
  ball(g, 0.2, [0.17, -0.16, 0.92], [1, 0.92, 0.8], body);
  ball(g, 0.1, [0, -0.02, 1.05], [1.2, 0.85, 1], pink);         // nose
  ball(g, 0.21, [-0.5, -0.16, 0.64], [1, 0.72, 0.34], blush);
  ball(g, 0.21, [0.5, -0.16, 0.64], [1, 0.72, 0.34], blush);

  addFace(g, pose, { eyeX: [-0.32, 0.32], eyeY: 0.18, eyeZ: 0.84, eyeR: 0.18, mouthY: -0.2, mouthZ: 1.0, noseZ: 1.05, mouthC: 0xB98A86 });
  for (const p of armPositions(pose)) ball(g, 0.2, p, [1, 1, 1], body);
  for (const p of footPositions(pose, 0.32)) ball(g, 0.29, p, [1, 0.55, 1.2], body);
  applyPoseTransform(g, pose);
  return g;
}

function renderChar(renderer, group, file) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8b08c, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2.5, 4, 3.5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff0e0, 0.5); fill.position.set(-3, 1, 2.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-1, 2.5, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));

  group.rotation.y = -0.16;
  group.position.y = -0.05;
  scene.add(group);

  const cam = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  cam.position.set(0, 0.5, 5.5);
  cam.lookAt(0, 0.18, 0);

  renderer.render(scene, cam);
  const b64 = renderer.domElement.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(b64, 'base64'));
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const renderer = makeRenderer();
    for (const pose of POSES) {
      renderChar(renderer, makeHamster(pose), `hamster-${pose}.png`);
      renderChar(renderer, makeRabbit(pose), `rabbit-${pose}.png`);
    }
    fs.writeFileSync(path.join(OUT_DIR, '.bake-done'), 'ok');
  } catch (e) {
    fs.writeFileSync(path.join(OUT_DIR, '.bake-error'), String((e && e.stack) || e));
  }
});
