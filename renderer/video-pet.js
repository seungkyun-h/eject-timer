// Plays green-screen behavior clips (idle/walk/react) with real-time chroma key
// (transparent) and a short crossfade between behaviors. Three.js full-screen
// quad + fragment shader. Requires three.
(function (global) {
  const THREE = require('three');

  function create(canvas, videos, opts) {
    opts = opts || {};
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const map = (typeof HTMLVideoElement !== 'undefined' && videos instanceof HTMLVideoElement) ? { idle: videos } : videos;
    const tex = {};
    for (const k in map) { tex[k] = new THREE.VideoTexture(map[k]); tex[k].colorSpace = THREE.SRGBColorSpace; }
    const first = tex.idle || tex[Object.keys(tex)[0]];

    // These source clips slowly zoom/drift in after ~2s and pop hard at the native loop seam.
    // Loop only a stable full-body sub-window so the framing stays put and the loop stays smooth.
    // (react is excluded — it's a one-shot poke reaction that plays from its own start.)
    const win = opts.window === null ? null : (opts.window || [0.55, 1.95]);
    const winBehaviors = opts.windowBehaviors || ['idle', 'walk'];
    function clampWindows() {
      if (!win) return;
      for (const k of winBehaviors) {
        const v = map[k];
        if (!v || !v.duration) continue;
        const end = Math.min(win[1], v.duration - 0.05);
        if (v.currentTime >= end || v.currentTime < win[0] - 0.02) {
          try { v.currentTime = win[0]; } catch (e) { /* ignore seek race */ }
        }
      }
    }

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        mapA: { value: first },
        mapB: { value: first },
        blend: { value: 1 },
        crop: { value: new THREE.Vector4(opts.cropX ?? 0.14, opts.cropY ?? 0.20, opts.cropW ?? 0.71, opts.cropH ?? 0.45) },
        thr: { value: opts.thr ?? 0.4 },
        soft: { value: opts.soft ?? 0.06 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D mapA; uniform sampler2D mapB; uniform float blend;',
        'uniform vec4 crop; uniform float thr; uniform float soft;',
        'varying vec2 vUv;',
        'vec4 keyed(sampler2D m, vec2 uv){',
        '  vec4 c = texture2D(m, uv);',
        '  float gf = c.g / (c.r + c.g + c.b + 0.001);',  // green fraction: robust to brightness gradient
        '  float a = 1.0 - smoothstep(thr, thr + soft, gf);',
        '  c.g = min(c.g, max(c.r, c.b) + 0.02);',          // despill
        '  return vec4(c.rgb, a);',
        '}',
        'void main(){',
        '  vec2 uv = vec2(crop.x + vUv.x*crop.z, crop.y + vUv.y*crop.w);',
        '  vec4 c = mix(keyed(mapB, uv), keyed(mapA, uv), blend);',
        '  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));',
        '  float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));',
        '  float sat = (mx - mn) / (mx + 0.001);',
        '  float gf = c.g / (c.r + c.g + c.b + 0.001);',
        '  float warm = step(c.g, c.r);',                        // red >= green
        // (A) the baked under-belly contact-shadow is a greenish-grey bounce (gf~0.36, r~=g) that the
        //     main colour key misses; all warm fur is gf<=0.32. In the lower-centre erase mid-bright
        //     greenish pixels — protecting warm fur (low gf), the bright belly (high lum) and the dark feet (low lum).
        '  float greenish = smoothstep(0.328, 0.352, gf);',      // gf>~0.33 = floor (warm fur is <=0.32)
        '  float notDark = smoothstep(0.18, 0.26, lum) * (1.0 - smoothstep(0.72, 0.82, lum));', // skip dark feet + bright belly
        '  float lowMid = (1.0 - smoothstep(0.12, 0.54, vUv.y)) * (1.0 - smoothstep(0.34, 0.50, abs(vUv.x - 0.5)));',
        '  c.a *= 1.0 - greenish * notDark * lowMid;',
        // (B) very bottom band: keep only vivid warm fur (feet) or the bright belly; erase warm-grey floor.
        '  float satHi = step(0.24, sat);',
        '  float bright = smoothstep(0.66, 0.80, lum);',
        '  float keep = max(warm * satHi, bright);',
        '  float bottom = 1.0 - smoothstep(0.0, 0.18, vUv.y);',
        '  c.a *= 1.0 - bottom * (1.0 - keep);',
        // (C) the lower body is a narrow centred column; anything outside it down low is floor.
        '  float side = smoothstep(0.18, 0.30, abs(vUv.x - 0.5));',
        '  float low = 1.0 - smoothstep(0.28, 0.52, vUv.y);',
        '  c.a *= 1.0 - low * side;',
        '  if (c.a < 0.01) discard;',
        '  gl_FragColor = c;',
        '}',
      ].join('\n'),
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const cam = new THREE.Camera();

    let cur = 'idle';
    let blend = 1;
    let lastT = null;

    function setBehavior(name) {
      if (!tex[name]) name = 'idle';
      if (!tex[name] || name === cur) return;
      cur = name;
      mat.uniforms.mapB.value = mat.uniforms.mapA.value;
      mat.uniforms.mapA.value = tex[name];
      blend = 0; mat.uniforms.blend.value = 0;
      if (map[name]) map[name].play().catch(() => {});
    }

    const FADE = opts.fade ?? 0.4;   // longer, eased crossfade so behavior swaps dissolve smoothly
    function frame() {
      const now = (typeof performance !== 'undefined' ? performance.now() : 0);
      if (lastT === null) lastT = now;
      const dt = (now - lastT) / 1000; lastT = now;
      clampWindows();
      if (blend < 1) {
        blend = Math.min(1, blend + dt / FADE);
        mat.uniforms.blend.value = blend * blend * (3 - 2 * blend);   // smoothstep ease
      }
      renderer.render(scene, cam);
    }
    function resize(w, h) { canvas.width = w; canvas.height = h; renderer.setSize(w, h, false); }
    function setCrop(x, y, w, h) { mat.uniforms.crop.value.set(x, y, w, h); }

    return { frame, resize, setBehavior, setCrop, material: mat };
  }

  global.VideoPet = { create };
})(window);
