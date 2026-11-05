// Reloads the page once if a newer version of the site has been published
(function () {
  const meta = document.querySelector('meta[name="site-version"]');
  if (!meta) return;

  const pageVersion = meta.content;
  const KEY = `site-version-reloaded:${location.pathname}`; // Each page is cached separately
  const MIN_INTERVAL = 60 * 1000;
  let lastCheck = 0;

  async function check() {
    const now = Date.now();
    if (now - lastCheck < MIN_INTERVAL) return;
    lastCheck = now;

    let latest;
    try {
      const res = await fetch(`version.json?t=${now}`, { cache: 'no-store' });
      if (!res.ok) return;
      latest = (await res.json()).version;
    } catch (e) {
      return; // Offline or opened from disk: keep showing this copy
    }
    if (!latest || latest === pageVersion) return;

    // One attempt per version, so a stale CDN copy can't cause a reload loop
    try {
      if (sessionStorage.getItem(KEY) === latest) return;
      sessionStorage.setItem(KEY, latest);
    } catch (e) {
      return; // Without storage there's no loop guard, so don't reload
    }
    location.reload();
  }

  check();

  // Tabs left open and pages restored by the back button can also be out of date
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) check();
  });
})();
