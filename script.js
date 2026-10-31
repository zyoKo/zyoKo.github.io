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

// Hero: raymarched signed-distance-field scene with soft shadows and AO
(function heroShader() {
  const canvas = document.getElementById('hero-canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const vert = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const frag = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;

    float sdSphere(vec3 p, float r) { return length(p) - r; }
    float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
    float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

    // x = distance, y = material id
    vec2 map(vec3 p) {
      float t = uTime;
      vec3 q = p - vec3(0.0, 1.0, 0.0);
      q.xz *= rot(t * 0.3);
      q.xy *= rot(0.5);
      float tor = sdTorus(q, vec2(0.9, 0.22));
      float s1 = sdSphere(p - vec3(sin(t * 0.7) * 1.1, 1.0 + sin(t * 0.9) * 0.35, cos(t * 0.7) * 1.1), 0.42);
      float s2 = sdSphere(p - vec3(cos(t * 0.5) * 0.6, 1.0 + cos(t * 1.1) * 0.5, sin(t * 0.5) * 0.6), 0.32);
      float blob = smin(tor, smin(s1, s2, 0.35), 0.35);
      float ground = p.y;
      return ground < blob ? vec2(ground, 0.0) : vec2(blob, 1.0);
    }

    vec3 normal(vec3 p) {
      vec2 e = vec2(0.001, 0.0);
      return normalize(vec3(
        map(p + e.xyy).x - map(p - e.xyy).x,
        map(p + e.yxy).x - map(p - e.yxy).x,
        map(p + e.yyx).x - map(p - e.yyx).x));
    }

    float softShadow(vec3 ro, vec3 rd) {
      float res = 1.0, t = 0.02;
      for (int i = 0; i < 32; i++) {
        float h = map(ro + rd * t).x;
        res = min(res, 10.0 * h / t);
        t += clamp(h, 0.02, 0.25);
        if (res < 0.002 || t > 6.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }

    float ambientOcclusion(vec3 p, vec3 n) {
      float occ = 0.0, w = 1.0;
      for (int i = 1; i <= 5; i++) {
        float h = 0.03 * float(i) + 0.02;
        occ += (h - map(p + n * h).x) * w;
        w *= 0.7;
      }
      return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      // Push the scene to the right on wide screens so copy sits over empty space
      float wide = clamp((uRes.x / uRes.y - 1.0) * 0.6, 0.0, 0.45);
      uv.x -= wide;

      float yaw = 0.6 + uMouse.x * 0.4;
      vec3 ro = vec3(6.5 * sin(yaw), 2.6 + uMouse.y * 0.6, 6.5 * cos(yaw));
      vec3 ta = vec3(0.0, 0.9, 0.0);
      vec3 ww = normalize(ta - ro);
      vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
      vec3 vv = cross(uu, ww);
      vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

      vec3 bg = vec3(0.043, 0.051, 0.063);
      vec3 col = bg;

      float t = 0.0;
      vec2 hit = vec2(-1.0);
      for (int i = 0; i < 90; i++) {
        vec2 h = map(ro + rd * t);
        if (h.x < 0.001) { hit = vec2(t, h.y); break; }
        t += h.x;
        if (t > 20.0) break;
      }

      if (hit.x > 0.0) {
        vec3 p = ro + rd * hit.x;
        vec3 n = normal(p);
        vec3 l = normalize(vec3(-0.6, 0.8, 0.4));
        vec3 h = normalize(l - rd);
        float dif = clamp(dot(n, l), 0.0, 1.0) * softShadow(p + n * 0.01, l);
        float ao = ambientOcclusion(p, n);
        float fre = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 4.0);

        vec3 albedo;
        float spec = 0.0;
        if (hit.y < 0.5) {
          // Ground: faint grid
          vec2 g = abs(fract(p.xz * 2.0) - 0.5);
          float line = smoothstep(0.47, 0.5, max(g.x, g.y));
          albedo = mix(vec3(0.08, 0.09, 0.11), vec3(0.18, 0.5, 0.48), line * 0.35);
        } else {
          albedo = vec3(1.0, 0.45, 0.16);
          spec = pow(clamp(dot(n, h), 0.0, 1.0), 48.0) * dif;
        }

        vec3 lin = vec3(0.0);
        lin += 1.6 * dif * vec3(1.0, 0.92, 0.82);
        lin += 0.35 * ao * vec3(0.35, 0.55, 0.7) * (0.5 + 0.5 * n.y);
        lin += 0.6 * fre * ao * vec3(0.31, 0.82, 0.77) * hit.y;
        col = albedo * lin + spec * vec3(1.0);

        col = mix(col, bg, 1.0 - exp(-0.006 * hit.x * hit.x));
      }

      col = pow(col, vec3(0.4545));
      col *= 1.0 - 0.35 * dot(uv, uv);
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

  const vs = compile(gl.VERTEX_SHADER, vert);
  const fs = compile(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  // Render below native resolution; raymarching is fill-rate bound
  const scale = Math.min(window.devicePixelRatio || 1, 1) * 0.6;
  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !reducedMotion) requestAnimationFrame(frame);
  }).observe(canvas);

  const start = performance.now();
  function draw(time) {
    resize();
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    if (!visible) return;
    draw((now - start) / 1000);
    requestAnimationFrame(frame);
  }

  if (reducedMotion) {
    draw(2.0);
    window.addEventListener('resize', () => draw(2.0));
  } else {
    requestAnimationFrame(frame);
  }
})();
