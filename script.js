// Nav border on scroll
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

document.getElementById('year').textContent = new Date().getFullYear();

// Project cards, rendered from projects.js
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
document.querySelectorAll('[data-project-group]').forEach((grid) => {
  grid.innerHTML = (window.PROJECTS || [])
    .filter((p) => p.group === grid.dataset.projectGroup)
    .map((p) => `
      <a class="card card--link" href="project.html?id=${encodeURIComponent(p.id)}">
        <div class="card__thumb${p.thumb ? '' : ' card__thumb--empty'}">
          ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : `<span>${esc(p.api)}</span>`}
        </div>
        <div class="card__top">
          <span class="card__kind">${esc(p.kind)}</span>
          <span class="card__api">${esc(p.api)}</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.summary)}</p>
        <ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </a>`)
    .join('');
});

// Reveal sections as they enter the viewport
const revealTargets = document.querySelectorAll('.job, .card, .skill, .edu__item');
revealTargets.forEach((el) => el.classList.add('reveal'));
const revealObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }
}, { threshold: 0.12 });
revealTargets.forEach((el) => revealObserver.observe(el));

// Hero: 2D lighting with a 1D radial shadow map. The pointer is the light source.
// Pass 1 marches one ray per angle from the light and stores the distance to the
// first occluder in a 1024x1 texture. Pass 2 lights each pixel by comparing its
// distance to the light against that map, blurred by distance for soft penumbras.
(function heroShader() {
  const canvas = document.getElementById('hero-canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ANGLES = 1024;

  const vert = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  // Scene shared by both passes. Units: 1.0 = canvas height, origin at centre.
  const common = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uLight;
    const float MAXD = 3.0;
    const float TAU = 6.2831853;

    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float sdCircle(vec2 p, float r) { return length(p) - r; }
    float sdBox(vec2 p, vec2 b) {
      vec2 d = abs(p) - b;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }
    float sdTri(vec2 p, float r) {
      const float k = 1.7320508;
      p.x = abs(p.x) - r;
      p.y = p.y + r / k;
      if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
      p.x -= clamp(p.x, -2.0 * r, 0.0);
      return -length(p) * sign(p.y);
    }

    float sceneSDF(vec2 p);
    float map(vec2 p) {
      // Push the scene right on wide screens so copy sits over open floor;
      // shrink it on portrait screens so it still fits across the width
      float aspect = uRes.x / uRes.y;
      p.x -= clamp((aspect - 1.0) * 0.6, 0.0, 0.45);
      float s = clamp(aspect * 1.2, 0.55, 1.0);
      return sceneSDF(p / s) * s;
    }

    float sceneSDF(vec2 p) {
      float t = uTime;

      float d = sdBox(rot(t * 0.25) * (p - vec2(-0.04, 0.16)), vec2(0.085));

      // Ring with a rotating gap that sweeps a beam of light around
      vec2 rp = rot(t * 0.4) * (p - vec2(0.24, -0.14));
      float ring = abs(length(rp) - 0.12) - 0.016;
      ring = max(ring, -sdBox(rp - vec2(0.12, 0.0), vec2(0.04, 0.035)));
      d = min(d, ring);

      d = min(d, sdTri(rot(-t * 0.3) * (p - vec2(0.3, 0.27)), 0.055));
      d = min(d, sdCircle(p - vec2(-0.26, -0.17 + sin(t * 0.6) * 0.03), 0.065));

      // Drifting pillars cast long thin shadows
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        vec2 c = vec2(sin(fi * 2.4 + t * 0.07) * 0.42, cos(fi * 1.7 + t * 0.09) * 0.36);
        d = min(d, sdCircle(p - c, 0.012 + 0.006 * fract(fi * 0.618)));
      }
      return d;
    }
  `;

  const shadowFrag = common + `
    void main() {
      float a = (gl_FragCoord.x / ${ANGLES}.0) * TAU - 3.14159265;
      vec2 dir = vec2(cos(a), sin(a));
      float t = 0.0;
      if (map(uLight) > 0.0) {
        for (int i = 0; i < 96; i++) {
          float d = map(uLight + dir * t);
          if (d < 0.0004) break;
          t += d;
          if (t > MAXD) { t = MAXD; break; }
        }
      }
      // Pack the normalised distance into two 8-bit channels
      vec2 enc = fract(vec2(1.0, 255.0) * min(t / MAXD, 0.99999));
      enc.x -= enc.y / 255.0;
      gl_FragColor = vec4(enc, 0.0, 1.0);
    }
  `;

  const lightFrag = common + `
    uniform sampler2D uShadow;
    uniform vec3 uColor;

    float occluderAt(float u) {
      vec4 s = texture2D(uShadow, vec2(u, 0.5));
      return dot(s.rg, vec2(1.0, 1.0 / 255.0)) * MAXD;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      vec2 d = q - uLight;
      float r = length(d);
      float u = atan(d.y, d.x) / TAU + 0.5;
      float sd = map(q);

      // Let the first face an occluder presents to the light catch it
      float rr = sd < 0.0 ? r - 0.022 : r;

      // Gaussian PCF along the angle; wider further out for soft penumbras
      float blur = 0.0006 + 0.0035 * r;
      float lit = 0.0;
      lit += occluderAt(u - 4.0 * blur) > rr ? 0.05 : 0.0;
      lit += occluderAt(u - 3.0 * blur) > rr ? 0.09 : 0.0;
      lit += occluderAt(u - 2.0 * blur) > rr ? 0.12 : 0.0;
      lit += occluderAt(u - 1.0 * blur) > rr ? 0.15 : 0.0;
      lit += occluderAt(u)              > rr ? 0.18 : 0.0;
      lit += occluderAt(u + 1.0 * blur) > rr ? 0.15 : 0.0;
      lit += occluderAt(u + 2.0 * blur) > rr ? 0.12 : 0.0;
      lit += occluderAt(u + 3.0 * blur) > rr ? 0.09 : 0.0;
      lit += occluderAt(u + 4.0 * blur) > rr ? 0.05 : 0.0;

      float falloff = 1.0 / (1.0 + r * r * 16.0);
      vec3 bg = vec3(0.043, 0.051, 0.063);

      // Floor: dot grid that only reads where the light lands
      vec2 g = fract(q * 28.0) - 0.5;
      float dots = smoothstep(0.11, 0.05, length(g));
      vec3 col = bg + uColor * lit * falloff * (0.5 + 0.9 * dots) + dots * 0.012;

      // Occluders: dark bodies, faint teal outline, rim lit on the facing side
      float px = 1.5 / uRes.y;
      if (sd < px) {
        vec2 e = vec2(0.001, 0.0);
        vec2 n = normalize(vec2(map(q + e.xy) - map(q - e.xy), map(q + e.yx) - map(q - e.yx)));
        float facing = max(dot(n, -normalize(d)), 0.0);
        float rim = lit * falloff * facing * smoothstep(-0.022, 0.0, sd);
        float edge = smoothstep(0.004, 0.0, abs(sd + 0.002));
        vec3 body = vec3(0.07, 0.08, 0.10) + uColor * rim * 2.2 + vec3(0.31, 0.82, 0.77) * edge * 0.18;
        col = mix(col, body, smoothstep(px, -px, sd));
      }

      // Light bulb glow
      col += uColor * exp(-r * r * 900.0) * 1.2 + exp(-r * r * 9000.0);

      col = 1.0 - exp(-col);
      col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(fragSrc) {
    const vs = compile(gl.VERTEX_SHADER, vert);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    const u = {};
    for (const name of ['uRes', 'uTime', 'uLight', 'uShadow', 'uColor']) {
      u[name] = gl.getUniformLocation(prog, name);
    }
    return { prog, u };
  }

  const shadowPass = program(shadowFrag);
  const lightPass = program(lightFrag);
  if (!shadowPass || !lightPass) return;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // 1D shadow map: one texel per angle. Packed values can't be filtered, so NEAREST.
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ANGLES, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Light follows the pointer over the hero; when idle it wanders on its own
  const light = { x: -0.3, y: 0.1, tx: -0.3, ty: 0.1, lastMove: -Infinity };
  function pointerToScene(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return;
    light.tx = (cx - 0.5 * rect.width) / rect.height;
    light.ty = (0.5 * rect.height - cy) / rect.height;
    light.lastMove = performance.now();
  }
  window.addEventListener('pointermove', pointerToScene, { passive: true });
  window.addEventListener('pointerdown', pointerToScene, { passive: true });

  // Click empty hero space to swap between the two accent colours
  const colors = [[1.0, 0.54, 0.24], [0.31, 0.82, 0.77]];
  let colorIndex = 0;
  const color = colors[0].slice();
  canvas.parentElement.addEventListener('click', (e) => {
    if (!e.target.closest('a, button')) colorIndex = (colorIndex + 1) % colors.length;
  });

  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !reducedMotion) requestAnimationFrame(frame);
  }).observe(canvas);

  const start = performance.now();
  function draw(time) {
    resize();
    if (performance.now() - light.lastMove > 2500) {
      const aspect = canvas.width / canvas.height;
      light.tx = Math.sin(time * 0.23) * 0.3 * aspect + 0.15;
      light.ty = Math.sin(time * 0.37) * 0.25;
    }
    const k = reducedMotion ? 1 : 0.12;
    light.x += (light.tx - light.x) * k;
    light.y += (light.ty - light.y) * k;
    const target = colors[colorIndex];
    for (let i = 0; i < 3; i++) color[i] += (target[i] - color[i]) * 0.08;

    gl.useProgram(shadowPass.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, ANGLES, 1);
    gl.uniform2f(shadowPass.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(shadowPass.u.uTime, time);
    gl.uniform2f(shadowPass.u.uLight, light.x, light.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(lightPass.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(lightPass.u.uShadow, 0);
    gl.uniform2f(lightPass.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(lightPass.u.uTime, time);
    gl.uniform2f(lightPass.u.uLight, light.x, light.y);
    gl.uniform3fv(lightPass.u.uColor, color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    if (!visible) return;
    draw((now - start) / 1000);
    requestAnimationFrame(frame);
  }

  if (reducedMotion) {
    // Static scene, but the light still tracks the pointer on demand
    const redraw = () => draw(2.0);
    redraw();
    window.addEventListener('resize', redraw);
    window.addEventListener('pointermove', redraw, { passive: true });
  } else {
    requestAnimationFrame(frame);
  }
})();
