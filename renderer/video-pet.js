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

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        mapA: { value: first },
        mapB: { value: first },
        blend: { value: 1 },
        crop: { value: new THREE.Vector4(opts.cropX ?? 0.18, opts.cropY ?? 0.24, opts.cropW ?? 0.64, opts.cropH ?? 0.54) },
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

    function frame() {
      const now = (typeof performance !== 'undefined' ? performance.now() : 0);
      if (lastT === null) lastT = now;
      const dt = (now - lastT) / 1000; lastT = now;
      if (blend < 1) { blend = Math.min(1, blend + dt / 0.15); mat.uniforms.blend.value = blend; }
      renderer.render(scene, cam);
    }
    function resize(w, h) { canvas.width = w; canvas.height = h; renderer.setSize(w, h, false); }
    function setCrop(x, y, w, h) { mat.uniforms.crop.value.set(x, y, w, h); }

    return { frame, resize, setBehavior, setCrop, material: mat };
  }

  global.VideoPet = { create };
})(window);
