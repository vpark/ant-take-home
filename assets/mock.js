// Restores the interactions the live docs get from their JavaScript bundle, and guards every exit from the mock.
(() => {
  const LIVE_DOCS = 'https://platform.claude.com/docs/en/home';
  // The same page can be served as /tool, /tool.html, or /tool/ (static hosts such as GitHub Pages).
  const pagePath = (pathname) => pathname.replace(/(\/index)?\.html$/, '').replace(/\/$/, '');
  // Controls that work inside the mock; every other button opens the leave dialog.
  const markLive = (el) => el?.setAttribute('data-mock-live', '');

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
  };
  const flash = (button) => {
    button.setAttribute('data-mock-copied', '');
    setTimeout(() => button.removeAttribute('data-mock-copied'), 1500);
  };

  // Choosing a language switches every code group on the page, as on the live docs.
  const groups = [...document.querySelectorAll('[class~="group/codegroup"]')];
  const selectLanguage = (label) => groups.forEach((group) => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const index = tabs.findIndex((tab) => tab.textContent.trim() === label);
    if (index < 0) return;
    tabs.forEach((tab, i) => {
      tab.toggleAttribute('data-active', i === index);
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    group.querySelectorAll('[role="tabpanel"]').forEach((panel, i) => { panel.hidden = i !== index; });
  });
  groups.forEach((group) => group.querySelectorAll('[role="tab"]').forEach((tab) => {
    markLive(tab);
    tab.addEventListener('click', () => selectLanguage(tab.textContent.trim()));
  }));

  document.querySelectorAll('button[aria-label="Copy code"]').forEach((button) => {
    markLive(button);
    button.addEventListener('click', () => {
      const scope = button.closest('[class~="group/codegroup"]') || button.closest('[class~="bg-surface-2"]');
      const pre = scope.querySelector('[role="tabpanel"]:not([hidden]) pre') || scope.querySelector('pre');
      copyText(pre.innerText); flash(button);
    });
  });

  document.querySelectorAll('button[aria-label="Copy link to clipboard"]').forEach((button) => {
    markLive(button);
    button.addEventListener('click', () => {
      const heading = button.closest('h2, h3');
      history.replaceState(null, '', '#' + heading.id);
      copyText(location.href); flash(button);
    });
  });

  const markdown = document.getElementById('mock-page-markdown')?.textContent ?? '';
  // Button labels start with an icon-font glyph from the Unicode private use area.
  const label = (el) => el.textContent.replace(/[\uE000-\uF8FF]/g, '').trim();
  document.querySelectorAll('button').forEach((button) => {
    if (label(button) !== 'Copy page') return;
    markLive(button);
    button.addEventListener('click', () => {
      copyText(markdown);
      const text = [...button.querySelectorAll('span')].map((span) => span.lastChild).find((node) => node?.nodeType === 3 && node.textContent.trim() === 'Copy page');
      if (!text) return;
      text.textContent = 'Copied';
      setTimeout(() => { text.textContent = 'Copy page'; }, 1500);
    });
  });

  // Highlight the section being read in the right-hand table of contents.
  const toc = document.querySelector('nav[aria-label="Table of contents"] ul');
  if (toc) {
    const links = [...toc.querySelectorAll('a')];
    const marker = toc.querySelector('div.absolute');
    const headings = links.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))));
    const update = () => {
      let current = 0;
      headings.forEach((heading, i) => { if (heading && heading.getBoundingClientRect().top < 160) current = i; });
      links.forEach((link, i) => {
        link.classList.toggle('text-primary', i === current);
        link.classList.toggle('font-medium', i === current);
        link.classList.toggle('text-muted', i !== current);
      });
      const item = links[current]?.parentElement;
      if (item && marker) { marker.style.top = item.offsetTop + 'px'; marker.style.height = item.offsetHeight + 'px'; }
    };
    document.addEventListener('scroll', update, { capture: true, passive: true });
    update();
  }

  // Open the sidebar at the Tools section so File search tool sits near the top.
  const sidebar = document.querySelector('aside[class*="w-66"]');
  const scrollSidebar = () => {
    const target = sidebar?.querySelector('[data-mock-scroll-to]');
    const scroller = target?.closest('.overflow-y-auto');
    if (!scroller) return;
    scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
  };
  scrollSidebar();

  const menu = document.querySelector('button[aria-label="Open navigation menu"]');
  markLive(menu);
  // The phone menu reports its state to assistive technology and closes with Escape.
  menu?.setAttribute('aria-expanded', 'false');
  const setNav = (open) => {
    document.documentElement.classList.toggle('mock-nav-open', open);
    menu?.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(scrollSidebar);
  };
  menu?.addEventListener('click', () => setNav(!document.documentElement.classList.contains('mock-nav-open')));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !document.documentElement.classList.contains('mock-nav-open')) return;
    setNav(false);
    menu?.focus();
  });

  // Leaving the mock: links to other pages and controls that belong to the live site ask first.
  const dialog = document.createElement('dialog');
  dialog.className = 'mock-dialog';
  dialog.setAttribute('aria-labelledby', 'mock-dialog-title');
  dialog.innerHTML = '<form method="dialog">'
    + '<p class="mock-dialog-tag">Take-home proposal</p>'
    + '<h2 id="mock-dialog-title"></h2>'
    + '<p class="mock-dialog-body"></p>'
    + '<p class="mock-dialog-url"></p>'
    + '<div class="mock-dialog-actions">'
    + '<button class="mock-dialog-stay" value="stay">Stay on proposal</button>'
    + '<a class="mock-dialog-go" target="_blank" rel="noopener noreferrer"></a>'
    + '</div></form>';
  document.body.append(dialog);
  const go = dialog.querySelector('.mock-dialog-go');
  go.addEventListener('click', () => setTimeout(() => dialog.close(), 0));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  const confirmLeave = (href, kind) => {
    const url = new URL(href);
    const onClaudeDocs = url.hostname === 'platform.claude.com';
    dialog.querySelector('h2').textContent = kind === 'control' ? 'This part of the docs isn\u2019t in the mock' : 'Leave the proposal?';
    dialog.querySelector('.mock-dialog-body').textContent = kind === 'control'
      ? 'You\u2019re looking at a take-home assignment proposal. Only the File search tool page is mocked; search, Ask Docs, and the other site controls belong to the live Claude docs.'
      : 'You\u2019re looking at a take-home assignment proposal, not Anthropic\u2019s documentation. This link opens the actual page' + (onClaudeDocs ? ' on the live Claude docs.' : '.');
    dialog.querySelector('.mock-dialog-url').textContent = url.host + url.pathname.replace(/\/$/, '') + url.hash;
    go.href = url.href;
    go.textContent = (kind === 'control' ? 'Open Claude docs' : 'Open actual page') + ' \u2197';
    setNav(false);
    dialog.showModal();
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('.mock-dialog')) return;
    const link = event.target.closest('a[href]');
    if (link) {
      const url = new URL(link.getAttribute('href'), location.href);
      if (url.origin === location.origin && pagePath(url.pathname) === pagePath(location.pathname)) {
        setNav(false);
        return;
      }
      // Links marked as part of the take-home package (such as Back to the proposal) navigate normally.
      if (url.origin === location.origin && link.hasAttribute('data-mock-internal')) {
        setNav(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      confirmLeave(url.href, 'link');
      return;
    }
    const control = event.target.closest('button, [role="button"], [role="switch"], input, label');
    if (control && !control.closest('[data-mock-live]')) {
      event.preventDefault();
      event.stopPropagation();
      confirmLeave(LIVE_DOCS, 'control');
    }
  }, true);

  // Wordmark: backspace all of "Claude Platform Docs", let the Claude spark think while a verb pair swaps,
  // then type "Claude Platform" and, slowly, "Mocks". Plays on every load once the tab is visible.
  const wordmarks = [...document.querySelectorAll('.mock-wordmark')];
  const sparks = [...document.querySelectorAll('.mock-spark')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORIGINAL = 'Claude Platform Docs';
  // Real Claude Code spinner verbs; successive loads in a tab alternate between the pairs.
  const VERB_PAIRS = [['Cogitating', 'Percolating'], ['Reticulating', 'Recombobulating']];
  const pair = (() => {
    try {
      const n = Number(sessionStorage.getItem('mock-verb-pair') || 0);
      sessionStorage.setItem('mock-verb-pair', String(n + 1));
      return VERB_PAIRS[n % VERB_PAIRS.length];
    } catch { return VERB_PAIRS[0]; }
  })();
  const setWord = (text) => wordmarks.forEach((mark) => { mark.querySelector('.mock-typed').textContent = text; });
  const setState = (state) => wordmarks.forEach((mark) => {
    mark.classList.remove('mock-typing', 'mock-thinking', 'mock-typed-done');
    if (state) mark.classList.add(state);
  });
  const setVerb = (text, motion = '') => wordmarks.forEach((mark) => {
    const verb = mark.querySelector('.mock-verb');
    verb.textContent = text + '\u2026';
    verb.className = 'mock-verb' + (motion ? ' ' + motion : '');
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const type = async (text, speed) => {
    const start = wordmarks[0].querySelector('.mock-typed').textContent;
    for (let i = 1; i <= text.length; i += 1) {
      setWord(start + text.slice(0, i));
      await wait(speed + Math.random() * speed * 0.6);
    }
  };

  // Spark thinking motion: rays pull in to stubs and grow back every 1.3 seconds, the spark breathes slightly behind
  // them and turns once every 6 seconds. The returned function eases back to the resting logo.
  const sparkThink = () => {
    if (reduceMotion || !sparks.length) return async () => {};
    const pose = { r: 75, deg: 0, k: 1 };
    const draw = () => sparks.forEach((spark) => {
      spark.querySelector('.mock-spark-mask').setAttribute('r', pose.r.toFixed(2));
      spark.style.transform = 'rotate(' + pose.deg.toFixed(2) + 'deg) scale(' + pose.k.toFixed(3) + ')';
    });
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = (now - started) / 1000;
      const inward = (1 - Math.cos(t * 2 * Math.PI / 1.3)) / 2;
      pose.r = 62 - 33 * inward;
      pose.k = 1 + 0.07 * Math.sin(t * 2 * Math.PI / 1.3 - 0.9);
      pose.deg = (t * 60) % 360;
      draw();
      frame = requestAnimationFrame(tick);
    });
    return () => new Promise((resolve) => {
      cancelAnimationFrame(frame);
      const from = { ...pose };
      const toDeg = from.deg < 20 ? 0 : 360;
      const begin = performance.now();
      requestAnimationFrame(function settle(now) {
        const x = Math.min(1, (now - begin) / 1000);
        const e = 1 - Math.pow(1 - x, 3);
        pose.r = from.r + (75 - from.r) * e;
        pose.deg = from.deg + (toDeg - from.deg) * e;
        pose.k = from.k + (1 - from.k) * e;
        draw();
        if (x < 1) requestAnimationFrame(settle);
        else { sparks.forEach((spark) => { spark.style.transform = ''; }); resolve(); }
      });
    });
  };

  const play = async () => {
    await wait(1000);
    setState('mock-typing');
    for (let word = ORIGINAL; word; ) {
      word = word.slice(0, -1);
      setWord(word);
      await wait(55);
    }
    await wait(250);
    setVerb(pair[0]);
    setState('mock-thinking');
    const stopThinking = sparkThink();
    await wait(1800);
    setVerb(pair[0], 'out');
    await wait(280);
    setVerb(pair[1], 'in');
    await wait(1800);
    setState('mock-typing');
    await type('Claude Platform ', 50);
    await wait(380);
    const settling = stopThinking();
    await type('Mocks', 170);
    await settling;
    setState('mock-typed-done');
  };
  if (wordmarks.length && document.visibilityState === 'visible') play();
  else if (wordmarks.length) {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      play();
    };
    document.addEventListener('visibilitychange', onVisible);
  }
})();
