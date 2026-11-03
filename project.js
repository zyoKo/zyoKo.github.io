// Renders one project from projects.js, selected by ?id=
document.getElementById('year').textContent = new Date().getFullYear();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const projects = window.PROJECTS || [];
const id = new URLSearchParams(location.search).get('id');
const index = projects.findIndex((p) => p.id === id);
const root = document.getElementById('project');

function renderBlock(b) {
  if (b.h) return `<h2>${esc(b.h)}</h2>`;
  if (b.p) return `<p>${esc(b.p)}</p>`;
  if (b.note) return `<p class="project__note">${esc(b.note)}</p>`;
  if (b.list) return `<ul class="project__list">${b.list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`;
  if (b.figures) {
    return `<div class="figures figures--${Math.min(b.figures.length, 3)}">${b.figures.map((f) => `
      <figure>
        <a href="${esc(f.src)}"><img src="${esc(f.src)}" alt="${esc(f.caption)}" loading="lazy"></a>
        <figcaption>${esc(f.caption)}</figcaption>
      </figure>`).join('')}</div>`;
  }
  if (b.video) {
    // Thumbnail first; the YouTube player only loads (and sets cookies) on click
    return `<figure class="video">
      <button class="video__poster" data-video="${esc(b.video)}" aria-label="Play video: ${esc(b.caption || '')}">
        <img src="https://i.ytimg.com/vi/${esc(b.video)}/maxresdefault.jpg" alt="" loading="lazy"
          data-fallback="https://i.ytimg.com/vi/${esc(b.video)}/hqdefault.jpg">
        <span class="video__play" aria-hidden="true"></span>
      </button>
      ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}
    </figure>`;
  }
  if (b.table) {
    return `<table class="project__table">
      <thead><tr>${b.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  }
  return '';
}

if (index === -1) {
  root.querySelector('.project__missing').hidden = false;
} else {
  const p = projects[index];
  const prev = projects[(index - 1 + projects.length) % projects.length];
  const next = projects[(index + 1) % projects.length];
  document.title = `${p.title} — Vatsalya Yadav`;

  root.insertAdjacentHTML('beforeend', `
    <header class="project__head">
      <p class="eyebrow">// ${esc(p.kind)} · ${esc(p.api)}</p>
      <h1>${esc(p.title)}</h1>
      <p class="project__summary">${esc(p.summary)}</p>
      <ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${p.links.length ? `<div class="hero__cta project__links">${p.links.map((l, i) =>
        `<a class="btn${i === 0 ? ' btn--primary' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
    </header>
    <article class="project__body">${p.body.map(renderBlock).join('')}</article>
    <nav class="project__pager" aria-label="More projects">
      <a href="project.html?id=${encodeURIComponent(prev.id)}"><span>← Previous</span>${esc(prev.title)}</a>
      <a href="project.html?id=${encodeURIComponent(next.id)}"><span>Next →</span>${esc(next.title)}</a>
    </nav>
  `);

  // YouTube serves a 120px placeholder when a video has no HD thumbnail
  root.querySelectorAll('img[data-fallback]').forEach((img) => {
    const check = () => { if (img.naturalWidth <= 120) img.src = img.dataset.fallback; };
    if (img.complete) check(); else img.addEventListener('load', check, { once: true });
    img.addEventListener('error', () => { img.src = img.dataset.fallback; }, { once: true });
  });

  // Lightbox cycles through every figure on this project's page
  const box = document.getElementById('lightbox');
  const boxImg = box.querySelector('.lightbox__stage img');
  const figureLinks = [...root.querySelectorAll('.figures a')];
  let current = 0;
  box.classList.toggle('lightbox--single', figureLinks.length < 2);

  function showFigure(i) {
    const wrap = (n) => (n + figureLinks.length) % figureLinks.length;
    current = wrap(i);
    const link = figureLinks[current];
    boxImg.src = link.getAttribute('href');
    boxImg.alt = link.querySelector('img').alt;
    box.querySelector('.lightbox__caption').textContent = boxImg.alt;
    box.querySelector('.lightbox__count').textContent = `${current + 1} / ${figureLinks.length}`;
    // Figures are lazy-loaded, so fetch the neighbours before they're asked for
    [current - 1, current + 1].forEach((n) => { new Image().src = figureLinks[wrap(n)].getAttribute('href'); });
  }

  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.lightbox__close')) box.close();
    else if (e.target.closest('.lightbox__nav--prev')) showFigure(current - 1);
    else if (e.target.closest('.lightbox__nav--next')) showFigure(current + 1);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showFigure(current - 1);
    if (e.key === 'ArrowRight') showFigure(current + 1);
  });
  // Otherwise the last figure flashes up the next time the lightbox opens
  box.addEventListener('close', () => boxImg.removeAttribute('src'));

  root.addEventListener('click', (e) => {
    const figure = e.target.closest('.figures a');
    // Ctrl/Cmd/Shift-click still opens the image on its own
    if (figure && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault();
      showFigure(figureLinks.indexOf(figure));
      box.showModal();
      return;
    }
    const poster = e.target.closest('.video__poster');
    if (!poster) return;
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(poster.dataset.video)}?autoplay=1&rel=0`;
    frame.title = poster.getAttribute('aria-label');
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    poster.replaceWith(frame);
  });
}
