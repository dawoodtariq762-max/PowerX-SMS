/* ============================================================================
   WHIZZ — UI interaction layer (whizz-ui.js v1)
   ---------------------------------------------------------------------------
   Loaded AFTER galaxy.js and after the page's own inline scripts (defer), so it
   can decorate existing globals without the shared files being edited.

   Purpose: smooth, controlled open/close motion for menus and dropdowns.
   It changes TIMING AND APPEARANCE ONLY — every trigger, callback, selected
   value and DOM contract stays exactly as it was.
   ========================================================================== */
(function () {
  'use strict';

  var OPEN_MS = 260;  // submenu expand
  var OUT_MS  = 140;  // dropdown close

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ------------------------------------------------------------------ *
   * 1. Sidebar collapsible submenus
   *
   *    The original toggled a class whose CSS animated max-height to a
   *    fixed 200px/500px. Because the real content is ~150px tall, the
   *    visible part of the animation finished in the first third of the
   *    duration, which reads as an instant jump.
   *
   *    We now animate to the measured height via a custom property, so the
   *    motion maps 1:1 to what the user actually sees.
   * ------------------------------------------------------------------ */
  function setSubHeight(sub, px) {
    sub.style.setProperty('--wz-sub-h', px + 'px');
  }

  function openSub(sub) {
    sub.classList.add('open');
    setSubHeight(sub, sub.scrollHeight);
  }

  function closeSub(sub) {
    // pin to the current height first so the transition has a start value
    setSubHeight(sub, sub.scrollHeight);
    void sub.offsetHeight; // force reflow
    sub.classList.remove('open');
    setSubHeight(sub, 0);
  }

  window.toggleSub = function (subId, pId) {
    var sub = document.getElementById(subId);
    var parent = pId ? document.getElementById(pId) : null;
    if (!sub) return;

    var opening = !sub.classList.contains('open');

    if (parent) parent.classList.toggle('open', opening);

    if (reduced()) {
      sub.classList.toggle('open', opening);
      setSubHeight(sub, opening ? sub.scrollHeight : 0);
      return;
    }

    if (opening) openSub(sub); else closeSub(sub);
  };

  // keep open submenus correctly sized if the viewport changes
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      document.querySelectorAll('.rsub.open, .subnav.open, .nav-sub.open').forEach(function (s) {
        s.style.setProperty('--wz-sub-h', s.scrollHeight + 'px');
      });
    }, 150);
  });

  /* ------------------------------------------------------------------ *
   * 2. Searchable dropdowns (.sd-menu from galaxy.js)
   *
   *    The shared component shows/hides with a hard
   *    `menu.style.display = 'flex' | 'none'` — no animation at all.
   *
   *    We watch the inline style instead of patching the shared file:
   *      opening -> add .wz-in  (CSS keyframe fade + slide down)
   *      closing -> add .wz-out (CSS keeps it painted for OUT_MS, then it
   *                 disappears because the inline display:none is already set)
   *
   *    Because we never rewrite `style.display`, galaxy.js's own open/closed
   *    checks keep reading the true state — no double-toggle, no stuck menus.
   * ------------------------------------------------------------------ */
  function decorateMenu(menu) {
    if (menu.__wzWatched) return;
    menu.__wzWatched = true;

    var wrap = menu.closest('.sd-wrap, .searchable-dropdown') || menu.parentElement;
    var visible = !!(menu.style.display && menu.style.display !== 'none');
    var outTimer = null;

    new MutationObserver(function () {
      var nowVisible = !!(menu.style.display && menu.style.display !== 'none');
      if (nowVisible === visible) return;
      visible = nowVisible;

      if (reduced()) {
        menu.classList.remove('wz-in', 'wz-out');
        if (wrap) wrap.classList.toggle('wz-open', nowVisible);
        return;
      }

      clearTimeout(outTimer);

      if (nowVisible) {
        menu.classList.remove('wz-out');
        menu.classList.add('wz-in');
        if (wrap) wrap.classList.add('wz-open');
      } else {
        menu.classList.remove('wz-in');
        menu.classList.add('wz-out');      // CSS re-shows it just for the fade-out
        if (wrap) wrap.classList.remove('wz-open');
        outTimer = setTimeout(function () { menu.classList.remove('wz-out'); }, OUT_MS);
      }
    }).observe(menu, { attributes: true, attributeFilter: ['style'] });
  }

  function scanMenus(root) {
    (root || document).querySelectorAll('.sd-menu').forEach(decorateMenu);
  }

  /* dropdowns are rendered on demand, so watch for new ones */
  function watchForMenus() {
    scanMenus();
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('sd-menu')) decorateMenu(n);
          else if (n.querySelectorAll) scanMenus(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------ *
   * 3. Collapsible group chevrons
   *    Adds a chevron to submenu parents that don't already have one, so the
   *    open/closed state is readable. Purely decorative.
   * ------------------------------------------------------------------ */
  function addChevrons() {
    document.querySelectorAll('[onclick*="toggleSub"]').forEach(function (el) {
      if (el.querySelector('.chev, .wz-chev')) return;
      var c = document.createElement('span');
      c.className = 'wz-chev';
      c.setAttribute('aria-hidden', 'true');
      c.textContent = '\u203A';
      c.style.cssText = 'margin-left:auto;font-size:15px;line-height:1;opacity:.7';
      el.appendChild(c);
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Sync initial submenu state (an already-open group must start sized)
   * ------------------------------------------------------------------ */
  function syncInitialSubs() {
    document.querySelectorAll('.rsub, .subnav, .nav-sub').forEach(function (s) {
      s.style.setProperty('--wz-sub-h', s.classList.contains('open') ? s.scrollHeight + 'px' : '0px');
    });
  }

  /* ------------------------------------------------------------------ *
   * 5. Dashboard quick-link tiles
   *    A tile simply forwards the click to the matching sidebar entry, so
   *    routing, active-state and group expansion all run through the panel's
   *    OWN existing handlers. No duplicated navigation logic.
   * ------------------------------------------------------------------ */
  function navigateTo(page) {
    if (!page) return;
    var nav = document.querySelector(
      '.ritem[data-page="' + page + '"], .rsubitem[data-page="' + page + '"],' +
      '.nav-item[data-page="' + page + '"], .sub-item[data-page="' + page + '"],' +
      '.tab[data-page="' + page + '"]'
    );
    if (nav) { nav.click(); return; }
    if (typeof window.showPage === 'function') window.showPage(page);
  }

  function bindTiles() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-goto]') : null;
      if (t) navigateTo(t.getAttribute('data-goto'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target.closest ? e.target.closest('[data-goto]') : null;
      if (t) { e.preventDefault(); navigateTo(t.getAttribute('data-goto')); }
    });
  }

  function init() {
    addChevrons();
    syncInitialSubs();
    watchForMenus();
    bindTiles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
