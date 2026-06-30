// Plays green-screen video(s) with real-time chroma key (transparent) via a
// Three.js full-screen quad + fragment shader. Supports multiple behavior clips
// (idle/walk/react) that can be swapped live. Requires three.
(function (global) {
  const THREE = require('three');

  function create(canvas, videos, opts) {
    opts = opts || {};
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // videos: a single <video> or a map { idle, walk, react, ... }
    const map = (typeof HTMLVideoElement !== 'undefined' && videos instanceof HTMLVideoElement) ? { idle: videos } : videos;
    const tex = {};
    for (const k in map) {
      tex[k] = new THREE.VideoTexture(map[k]);
      tex[k].colorSpace = THREE.SRGBColorSpace;
    }

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        map: { value: tex.idle || tex[Object.keys(tex)[0]] },
        crop: { value: new THREE.Vector4(opts.cropX ?? 0.06, opts.cropY ?? 0.04, opts.cropW ?? 0.88, opts.cropH ?? 0.88) },
        thr: { value: opts.thr ?? 0.16 },
        soft: { value: opts.soft ?? 0.09 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D map; uniform vec4 crop; uniform float thr; uniform float soft;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec2 uv = vec2(crop.x + vUv.x*crop.z, crop.y + vUv.y*crop.w);',
        '  vec4 c = texture2D(map, uv);',
        '  float greenness = c.g - max(c.r, c.b);',
        '  float a = 1.0 - smoothstep(thr - soft, thr + soft, greenness);',
        '  c.g = min(c.g, max(c.r, c.b) + 0.015);',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(c.rgb, a);',
        '}',
      ].join('\n'),
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const cam = new THREE.Camera();

    let cur = null;
    function setBehavior(name) {
      if (!tex[name]) name = 'idle';
      if (!tex[name] || name === cur) return;
      cur = name;
      mat.uniforms.map.value = tex[name];
      if (map[name]) map[name].play().catch(() => {});
    }

    function frame() { renderer.render(scene, cam); }
    function resize(w, h) { canvas.width = w; canvas.height = h; renderer.setSize(w, h, false); }
    function setCrop(x, y, w, h) { mat.uniforms.crop.value.set(x, y, w, h); }

    return { frame, resize, setBehavior, setCrop, material: mat };
  }

  global.VideoPet = { create };
})(window);
