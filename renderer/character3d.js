// Live, animated 3D character (Three.js) for the widget and the desktop pet.
// Exposes window.Character3D.create(canvas) -> controller.
// Requires nodeIntegration (require('three')).
(function (global) {
  const THREE = require('three');

  const PALETTES = {
    hamster: { kind: 'hamster', body: 0xE0A24C, belly: 0xF5E7CE, ear: 0xCB8B43, inner: 0xA9705C, nose: 0xB87A7A, arm: 0xCB8B43, foot: 0xF5E7CE, mouth: 0x7a5246 },
    rabbit: { kind: 'rabbit', body: 0xFAFAF7, belly: 0xFFFEFB, ear: 0xFAFAF7, inner: 0xE7A1AE, nose: 0xD98E9E, arm: 0xFAFAF7, foot: 0xFAFAF7, mouth: 0xB98A86 },
    shrimp: { kind: 'shrimp', body: 0xDE5C3C, belly: 0xF2A88E, ear: 0xBE4A2E, inner: 0xBE4A2E, nose: 0xBE4A2E, arm: 0xCB5034, foot: 0xE08468, mouth: 0x873f2f },
  };

  const mat = (c, rough = 0.62) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: rough, metalness: 0 });

  function ball(parent, r, pos, scale, material) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 40), material);
    m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  }

  function makeEye(parent, x, y, z, r) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 32), mat(0x1a1512, 0.1)); // shiny black bead
    g.add(e);
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 16, 16), mat(0xffffff, 0.2));
    s1.position.set(r * 0.45, r * 0.55, r * 0.7); // single small catchlight
    g.add(s1);
    parent.add(g);
    return g;
  }

  function makeSmile(w, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(w, 0.03, 10, 24, Math.PI), mat(color, 0.4));
    m.rotation.z = Math.PI;
    m.scale.set(1, 0.66, 1);
    return m;
  }

  function buildShrimp(p) {
    const g = new THREE.Group();
    const bodyMat = mat(p.body, 0.3);       // glossy coral
    const belly = mat(p.belly, 0.4);
    const antMat = mat(p.arm, 0.34);
    const tailMat = mat(p.foot, 0.32);
    const dummyMat = mat(p.body, 0.5);

    // ---- SIDE-PROFILE C-CURL: head front-right, abdomen arches over the back and curls down-left ----
    const body = ball(g, 0.6, [0.5, 0.5, 0.05], [1.0, 1.05, 1.0], bodyMat);    // head / carapace
    ball(g, 0.42, [0.52, 0.3, 0.4], [0.75, 0.85, 0.5], belly);                 // pale throat (camera side)

    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.78, 18), bodyMat); // rostrum saw-nose
    spike.position.set(1.0, 0.78, 0.05); spike.rotation.z = -1.05;
    g.add(spike);

    ball(g, 0.5, [0.05, 0.74, 0], [1.0, 0.96, 1.0], bodyMat);     // abdomen arching over the back
    ball(g, 0.44, [-0.45, 0.62, 0], [1.0, 0.96, 1.0], bodyMat);
    ball(g, 0.38, [-0.86, 0.3, 0], [1.0, 0.96, 1.0], bodyMat);
    ball(g, 0.32, [-1.05, -0.16, 0], [1.0, 0.96, 1.0], bodyMat);  // curling down
    ball(g, 0.26, [-1.0, -0.58, 0], [1.0, 0.96, 1.0], bodyMat);

    for (const a of [-0.25, 0.05, 0.35, 0.68]) {                  // fan tail at the curled end
      const bl = ball(g, 0.3, [-1.04, -0.88, 0], [0.52, 0.16, 0.12], tailMat);
      bl.rotation.z = a;
    }

    for (const [px, py, rot] of [[0.62, 1.04, 2.0], [0.74, 1.0, 2.25]]) { // antennae sweeping back
      const ant = ball(g, 0.5, [px, py, 0.06], [0.045, 1.4, 0.045], antMat);
      ant.rotation.z = rot;
    }
    const earL = ball(g, 0.04, [0.7, 0.9, 0.1], [1, 1, 1], dummyMat); earL.visible = false;
    const earR = ball(g, 0.04, [0.74, 0.9, 0.1], [1, 1, 1], dummyMat); earR.visible = false;

    const eyeY = 0.6, eyeZ = 0.52, eyeR = 0.17;                   // big glossy eyes facing the camera (3/4)
    const eyeL = makeEye(g, 0.4, eyeY, eyeZ, eyeR);
    const eyeR2 = makeEye(g, 0.66, eyeY - 0.02, eyeZ - 0.14, eyeR * 0.9);

    const smile = makeSmile(0.07, p.mouth);
    smile.position.set(0.56, 0.34, 0.5); g.add(smile);
    const mouthO = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), mat(0x7a4a3c, 0.4));
    mouthO.position.set(0.56, 0.33, 0.52); mouthO.scale.set(1, 1.2, 1); mouthO.visible = false; g.add(mouthO);

    const armBaseL = [0.5, 0.0, 0.32], armBaseR = [0.18, -0.12, 0.28]; // little legs hanging under
    const armL = ball(g, 0.1, armBaseL, [1, 1.4, 1], antMat);
    const armR = ball(g, 0.1, armBaseR, [1, 1.4, 1], antMat);
    const footBaseL = [-0.14, -0.24, 0.2], footBaseR = [-0.46, -0.32, 0.16];
    const footL = ball(g, 0.1, footBaseL, [1, 1.4, 1], antMat);
    const footR = ball(g, 0.1, footBaseR, [1, 1.4, 1], antMat);

    g.scale.set(0.8, 0.8, 0.8);
    g.position.x = 0.18; // recenter the curl in frame

    return {
      group: g, body, earL, earR, eyeL, eyeR: eyeR2, smile, mouthO, armL, armR, footL, footR,
      baseBodyScale: [1.0, 1.05, 1.0],
      eyeBaseL: [0.4, eyeY, eyeZ], eyeBaseR: [0.66, eyeY - 0.02, eyeZ - 0.14],
      base: { armL: armBaseL, armR: armBaseR, footL: footBaseL, footR: footBaseR },
    };
  }

  function buildModel(kind) {
    const p = PALETTES[kind] || PALETTES.hamster;
    if (kind === 'shrimp') return buildShrimp(p);
    const group = new THREE.Group();
    const bodyMat = mat(p.body, 0.85);
    const armMat = mat(p.arm, 0.85);
    const footMat = mat(p.foot, 0.85);

    // body (rounder, flatter potato shape) + belly
    const body = ball(group, 1.0, [0, 0, 0], [1.1, 0.9, 0.96], bodyMat);
    if (kind === 'hamster') {
      ball(group, 0.72, [0, -0.2, 0.5], [0.98, 0.95, 0.55], mat(p.belly, 0.85)); // cream belly/face
      ball(group, 0.38, [-0.58, -0.22, 0.42], [1, 0.95, 0.85], bodyMat);          // full cheek pouches
      ball(group, 0.38, [0.58, -0.22, 0.42], [1, 0.95, 0.85], bodyMat);
    } else {
      ball(group, 0.66, [0, -0.24, 0.5], [0.9, 0.92, 0.5], mat(p.belly, 0.85));
    }

    // ears
    let earL, earR;
    if (kind === 'hamster') {
      earL = ball(group, 0.31, [-0.58, 0.82, -0.02], [1, 1, 0.5], mat(p.ear, 0.85));
      earR = ball(group, 0.31, [0.58, 0.82, -0.02], [1, 1, 0.5], mat(p.ear, 0.85));
      ball(group, 0.16, [-0.58, 0.83, 0.14], [1, 1, 0.4], mat(p.inner, 0.6));
      ball(group, 0.16, [0.58, 0.83, 0.14], [1, 1, 0.4], mat(p.inner, 0.6));
    } else {
      earL = ball(group, 0.5, [-0.4, 1.2, -0.05], [0.5, 1.55, 0.42], bodyMat);
      earR = ball(group, 0.5, [0.4, 1.2, -0.05], [0.5, 1.55, 0.42], bodyMat);
      ball(group, 0.5, [-0.4, 1.2, 0.08], [0.28, 1.25, 0.32], mat(p.inner, 0.6));
      ball(group, 0.5, [0.4, 1.2, 0.08], [0.28, 1.25, 0.32], mat(p.inner, 0.6));
    }
    earL.geometry.translate(0, -0.3, 0); earL.position.y += 0.3; // pivot near base for sway
    earR.geometry.translate(0, -0.3, 0); earR.position.y += 0.3;

    // muzzle + small bead eyes (realistic)
    const eyeY = kind === 'hamster' ? 0.16 : 0.15;
    const eyeZ = kind === 'hamster' ? 0.92 : 0.86;
    const eyeR = kind === 'hamster' ? 0.12 : 0.13;
    if (kind === 'hamster') {
      ball(group, 0.44, [0, -0.1, 0.72], [1, 0.85, 0.7], mat(p.belly, 0.85)); // muzzle
    } else {
      ball(group, 0.37, [0, -0.06, 0.76], [1, 0.8, 0.6], bodyMat);
      ball(group, 0.2, [-0.17, -0.16, 0.92], [1, 0.92, 0.8], bodyMat);
      ball(group, 0.2, [0.17, -0.16, 0.92], [1, 0.92, 0.8], bodyMat);
    }
    ball(group, kind === 'hamster' ? 0.09 : 0.085, [0, kind === 'hamster' ? -0.06 : -0.02, kind === 'hamster' ? 1.05 : 1.04], [1, 0.85, 1], mat(p.nose, 0.5)); // small nose

    // eyes (small shiny black beads)
    const eyeL = makeEye(group, -0.3, eyeY, eyeZ, eyeR);
    const eyeR2 = makeEye(group, 0.3, eyeY, eyeZ, eyeR);

    // subtle mouth
    const smile = makeSmile(0.06, p.mouth);
    smile.position.set(0, kind === 'hamster' ? -0.22 : -0.2, kind === 'hamster' ? 1.0 : 0.98);
    group.add(smile);
    const mouthO = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 20), mat(0x6a3f33, 0.4));
    mouthO.position.set(0, kind === 'hamster' ? -0.2 : -0.18, kind === 'hamster' ? 1.04 : 1.02);
    mouthO.scale.set(1, 1.2, 1);
    mouthO.visible = false;
    group.add(mouthO);

    // arms + feet (animated)
    const armBaseL = [-0.52, -0.62, 0.52], armBaseR = [0.52, -0.62, 0.52];
    const armL = ball(group, 0.2, armBaseL, [1, 1, 1], armMat);
    const armR = ball(group, 0.2, armBaseR, [1, 1, 1], armMat);
    const footBaseL = [-0.34, -0.95, 0.3], footBaseR = [0.34, -0.95, 0.3];
    const footL = ball(group, 0.27, footBaseL, [1, 0.58, 1.2], footMat);
    const footR = ball(group, 0.27, footBaseR, [1, 0.58, 1.2], footMat);

    return {
      group, body, earL, earR, eyeL, eyeR: eyeR2, smile, mouthO,
      armL, armR, footL, footR,
      baseBodyScale: [1.06, 0.96, 0.92],
      eyeBaseL: [-0.3, eyeY, eyeZ], eyeBaseR: [0.3, eyeY, eyeZ],
      base: { armL: armBaseL, armR: armBaseR, footL: footBaseL, footR: footBaseR },
    };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clmp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8b08c, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2.5, 4, 3.5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff0e0, 0.5); fill.position.set(-3, 1, 2.5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-1, 2.5, -3); scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));

    const cam = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    cam.position.set(0, 0.5, 5.4);
    cam.lookAt(0, 0.18, 0);

    let model = null, kind = null;
    const state = { behavior: 'idle', dir: 1 };
    let t = 0, walkPhase = 0, blinkUntil = 0, nextBlink = 1.5, faceRot = 0, pitchRot = 0;

    function setCharacter(k) {
      if (k === kind) return;
      if (model) scene.remove(model.group);
      model = buildModel(k);
      scene.add(model.group);
      kind = k;
    }

    function setState(s) { Object.assign(state, s); }

    function frame(dtMs) {
      if (!model) return;
      const dt = Math.min(0.05, dtMs / 1000);
      t += dt;
      const beh = state.behavior;
      const m = model;

      // head + eyes follow the cursor, except when asleep / startled
      const tracking = beh !== 'sleep' && beh !== 'grab';
      const lookX = tracking ? (state.lookX || 0) : 0;
      const lookY = tracking ? (state.lookY || 0) : 0;
      faceRot = lerp(faceRot, clmp(lookX * 0.55, -0.6, 0.6), 0.12);
      pitchRot = lerp(pitchRot, clmp(lookY * 0.35, -0.4, 0.4), 0.12);
      m.group.rotation.y = faceRot;
      m.group.rotation.x = pitchRot;
      m.eyeL.position.set(m.eyeBaseL[0] + lookX * 0.05, m.eyeBaseL[1] - lookY * 0.04, m.eyeBaseL[2]);
      m.eyeR.position.set(m.eyeBaseR[0] + lookX * 0.05, m.eyeBaseR[1] - lookY * 0.04, m.eyeBaseR[2]);

      // base resets
      let bodyY = 0, tiltZ = 0, breathe = 1 + Math.sin(t * 2.0) * 0.02;
      let eyeScaleY = 1, wide = 1, smileVisible = true, oVisible = false;
      const aL = m.base.armL.slice(), aR = m.base.armR.slice();
      const fL = m.base.footL.slice(), fR = m.base.footR.slice();
      let earSway = Math.sin(t * 2.2) * 0.05;

      if (beh === 'walk') {
        walkPhase += dt * 7.5;
        bodyY = Math.abs(Math.sin(walkPhase)) * 0.05;                  // gentle waddle bob
        fL[2] = m.base.footL[2] + Math.sin(walkPhase) * 0.1;          // small steps
        fR[2] = m.base.footR[2] - Math.sin(walkPhase) * 0.1;
        fL[1] = m.base.footL[1] + Math.max(0, Math.sin(walkPhase)) * 0.05;
        fR[1] = m.base.footR[1] + Math.max(0, -Math.sin(walkPhase)) * 0.05;
        tiltZ = -0.03 * state.dir;
        earSway = Math.sin(walkPhase) * 0.08;
      } else if (beh === 'happy') {
        bodyY = Math.abs(Math.sin(t * 7)) * 0.1;
        aL[1] = 0.4; aL[2] = 0.42; aR[1] = 0.4; aR[2] = 0.42;
        eyeScaleY = 0.7;
        earSway = Math.sin(t * 6) * 0.12;
      } else if (beh === 'sleep') {
        eyeScaleY = 0.1; // closed
        bodyY = -0.06 + Math.sin(t * 1.3) * 0.02;
        breathe = 1 + Math.sin(t * 1.3) * 0.03;
        aL[1] = -0.62; aR[1] = -0.62; aL[0] = -0.3; aR[0] = 0.3;
      } else if (beh === 'grab') {
        wide = 1.12; tiltZ = 0.1;
        aL[0] = -0.8; aL[1] = 0.05; aR[0] = 0.8; aR[1] = 0.05;
        smileVisible = false; oVisible = true;
        earSway = Math.sin(t * 5) * 0.14;
      }

      // blink (gentle, infrequent, not while sleeping)
      if (beh !== 'sleep') {
        if (t > nextBlink) { blinkUntil = t + 0.11; nextBlink = t + 3 + Math.random() * 3.5; }
        if (t < blinkUntil) eyeScaleY = Math.min(eyeScaleY, 0.14);
      }

      // apply (smoothly)
      m.group.position.y = lerp(m.group.position.y, bodyY, 0.3);
      m.group.rotation.z = lerp(m.group.rotation.z, tiltZ, 0.2);
      const bs = m.baseBodyScale || [1.06, 0.96, 0.92];
      m.body.scale.set(bs[0], bs[1] * breathe, bs[2]);
      for (const [mesh, target] of [[m.armL, aL], [m.armR, aR], [m.footL, fL], [m.footR, fR]]) {
        mesh.position.x = lerp(mesh.position.x, target[0], 0.3);
        mesh.position.y = lerp(mesh.position.y, target[1], 0.3);
        mesh.position.z = lerp(mesh.position.z, target[2], 0.3);
      }
      const esY = lerp(m.eyeL.scale.y, eyeScaleY, 0.4);
      const esX = lerp(m.eyeL.scale.x, wide, 0.3);
      m.eyeL.scale.set(esX, esY, 1); m.eyeR.scale.set(esX, esY, 1);
      m.earL.rotation.z = earSway; m.earR.rotation.z = -earSway;
      m.smile.visible = smileVisible; m.mouthO.visible = oVisible;

      renderer.render(scene, cam);
    }

    function resize(w, h) {
      canvas.width = w; canvas.height = h;
      renderer.setSize(w, h, false);
    }

    return { setCharacter, setState, frame, resize };
  }

  global.Character3D = { create };
})(window);
