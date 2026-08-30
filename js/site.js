/* ===========================================================================
   GRAYSON DESIGN PARTNERS — 2027
   Motion has one job here: hierarchy and storytelling. Everything below is
   transform/opacity only, observer-driven, and switched off for anyone who
   asks for reduced motion.
   ======================================================================== */
(function () {
  'use strict';
  var root  = document.documentElement;
  var rmq   = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = rmq.matches;
  rmq.addEventListener && rmq.addEventListener('change', function (e) { reduce = e.matches; });

  var raf = window.requestAnimationFrame.bind(window);

  /* ---- 1. entry ------------------------------------------------------- */
  raf(function () { raf(function () { root.classList.add('is-ready'); }); });

  /* ---- 1b. the headline always fits its column, at every width --------- */
  var heroType = document.querySelector('.hero__type');
  function fitHero() {
    if (!heroType) return;
    heroType.style.setProperty('--fit', '1');
    var avail = heroType.clientWidth, max = 0;
    heroType.querySelectorAll('.ln > span').forEach(function (s) {
      max = Math.max(max, s.scrollWidth);
    });
    var target = avail * 0.98;              // always keep a little air at the edge
    if (max > target && max > 0) {
      heroType.style.setProperty('--fit', (target / max).toFixed(4));
    }
  }
  /* The image band spans both lines, so its loop distance depends on how tall
     those two lines actually are. Measure it rather than hard-coding pixels. */
  var fillbox = document.getElementById('fillbox');
  var STRIP_W = 4160, STRIP_H = 720;
  function fitBand() {
    if (!fillbox) return;
    var zoom = parseFloat(getComputedStyle(fillbox).getPropertyValue('--fillzoom')) || 100;
    var bandH = fillbox.getBoundingClientRect().height * (zoom / 100);
    // exact, not rounded — a rounded loop distance shows a seam on the wrap
    fillbox.style.setProperty('--driftX', (STRIP_W * bandH / STRIP_H).toFixed(2) + 'px');
  }

  function reflowHero() { fitHero(); fitBand(); }
  reflowHero();
  window.addEventListener('resize', reflowHero);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reflowHero);

  /* ---- 3. aperture menu ----------------------------------------------- */
  var menu = document.getElementById('menu');
  var trig = document.getElementById('trigger');
  var lbl  = document.getElementById('triggerLabel');
  var links = menu ? menu.querySelectorAll('a') : [];
  var lastFocus = null;

  function setMenu(open) {
    if (!menu) return;
    menu.dataset.open = open ? 'true' : 'false';
    trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    lbl.textContent = open ? 'Close' : 'Menu';
    document.body.style.overflow = open ? 'hidden' : '';
    envLock = open;
    if (open) { chrome.dataset.env = 'ink'; } else { syncChromeEnv(); }
    if (open) { lastFocus = document.activeElement; setTimeout(function () { links[0] && links[0].focus(); }, 420); }
    else if (lastFocus) { lastFocus.focus(); }
  }
  trig && trig.addEventListener('click', function () { setMenu(menu.dataset.open !== 'true'); });

  document.addEventListener('keydown', function (e) {
    if (!menu || menu.dataset.open !== 'true') return;
    if (e.key === 'Escape') { setMenu(false); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(links, function (n) { return n.offsetParent !== null; });
    f.push(trig);
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  menu && menu.querySelectorAll('.menu__link').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });
  menu && menu.querySelectorAll('.menu__foot a').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });

  /* ---- 4. chrome: stuck state + environment sync ----------------------- */
  var chrome = document.getElementById('chrome');
  var nowEl  = document.getElementById('now');
  var envs   = document.querySelectorAll('main [data-env], footer[data-env]');
  var labels = { work: 'Selected work', arc: 'Capabilities', studio: 'The studio', contact: 'Say hello' };
  // the slot carries the section you're in, and nothing at all before that

  function onScroll() {
    chrome && chrome.classList.toggle('is-stuck', window.scrollY > 40);
  }

  /* The header is fixed at the top of the viewport, but the page environment is
     decided by whatever sits at the viewport's middle. At a section boundary the
     two disagree — and a light environment's ink lands on a dark ground. So the
     header carries its own environment, read from whatever is actually behind
     the header strip. */
  var envLock = false;
  function syncChromeEnv() {
    if (!chrome || envLock) return;
    var y = chrome.offsetHeight * 0.5, found = 'ink';
    for (var i = 0; i < envs.length; i++) {
      var r = envs[i].getBoundingClientRect();
      if (r.top <= y && r.bottom > y) found = envs[i].dataset.env || 'ink';
    }
    if (chrome.dataset.env !== found) chrome.dataset.env = found;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if ('IntersectionObserver' in window && envs.length) {
    var envObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        root.dataset.env = en.target.dataset.env || 'ink';
        syncChromeEnv();
        if (nowEl) {
          var id = en.target.id || (en.target.closest('[id]') || {}).id;
          var label = labels[id] || '';
          nowEl.textContent = label;
          nowEl.classList.toggle('is-on', !!label);
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    envs.forEach(function (s) { envObs.observe(s); });
  }

  /* ---- 5. reveals ------------------------------------------------------ */
  var revealables = document.querySelectorAll('[data-rise],[data-mask],[data-scale]');
  if (!('IntersectionObserver' in window) || reduce) {
    revealables.forEach(function (n) { n.classList.add('is-in'); });
  } else {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        if (en.target.__rev) en.target.__rev.forEach(function (n) { n.classList.add('is-in'); });
        revObs.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    // Chromium excludes targets that their own clip-path collapses to nothing,
    // so a [data-mask] element is watched through its parent instead.
    revealables.forEach(function (n) {
      if (n.hasAttribute('data-mask') && n.parentElement) {
        var host = n.parentElement;
        (host.__rev = host.__rev || []).push(n);
        if (!host.__watched) { host.__watched = 1; revObs.observe(host); }
      } else { revObs.observe(n); }
    });
  }

  /* ---- 6. scroll-linked progress (scrub + capability arc) -------------- */
  var scrub = document.getElementById('scrub-rv');
  var arcOuter = document.getElementById('arcOuter');
  var arcTrack = document.getElementById('arcTrack');
  var arcSun = document.getElementById('arcSun');
  var shift = 0;

  function measure() {
    if (!arcTrack) return;
    shift = Math.max(0, arcTrack.scrollWidth - window.innerWidth + 40);
    arcOuter.style.setProperty('--arc-shift', shift + 'px');
  }

  function clamp(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  var ticking = false;
  function frame() {
    ticking = false;
    if (scrub) {
      var r = scrub.getBoundingClientRect();
      var p = clamp((window.innerHeight * 0.85 - r.top) / (r.height * 0.9));
      scrub.style.setProperty('--p', p.toFixed(3));
    }
    syncChromeEnv();
    if (arcOuter && !reduce && window.innerWidth >= 900) {
      var a = arcOuter.getBoundingClientRect();
      var q = clamp(-a.top / (a.height - window.innerHeight));
      arcOuter.style.setProperty('--p', q.toFixed(4));
      if (arcSun) arcSun.style.left = (q * 100).toFixed(2) + '%';
    }
  }
  function queue() { if (!ticking) { ticking = true; raf(frame); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', function () { measure(); queue(); });
  measure(); queue();

  /* ---- 7b. the archive lightbox --------------------------------------- */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var tiles   = Array.prototype.slice.call(document.querySelectorAll('.tile'));
    var lbLabel = document.getElementById('lbLabel');
    var lbCount = document.getElementById('lbCount');
    var lbPrev  = document.getElementById('lbPrev');
    var lbNext  = document.getElementById('lbNext');
    var lbClose = document.getElementById('lbClose');
    var lbImg   = document.getElementById('lbImg');
    var at = 0, opener = null;

    /* every numbered slot opens its own collection; a slot without one
       still opens the placeholder frame */
    var SETS = {
      'papal-ar-2025': {
        title: 'Papal Foundation — Annual Report 2025',
        images: ['img/PF2501.jpg', 'img/PF2502.jpg', 'img/PF2503.jpg', 'img/PF2504.jpg', 'img/PF2505.jpg']
      },
      'papal-ar-2024': {
        title: 'Papal Foundation — Annual Report 2024',
        images: ['img/PF2401.webp', 'img/PF2402.webp', 'img/PF2403.webp']
      },
      'papal-ar-2023': {
        title: 'Papal Foundation — Annual Report 2023',
        images: ['img/PFAR02_1080p.webp', 'img/PFAR01_1080p.webp']
      },
      'papal-ar-2022': {
        title: 'Papal Foundation — Annual Report 2022',
        images: ['img/PFAR22_01_1080p.webp', 'img/PFAR22_02_1080p.webp']
      },
      'ceo-summit-2025': {
        title: 'LSA — CEO Summit 2025',
        images: ['img/ceo01.webp', 'img/ceo02.webp', 'img/ceo03.webp', 'img/ceo04.webp', 'img/ceo05.webp', 'img/ceo06.webp', 'img/ceo07.webp', 'img/ceo08.webp', 'img/ceo09.webp', 'img/ceo10.webp', 'img/ceo11.webp', 'img/ceo12.webp']
      },
      'lsa-mission-deck': {
        title: 'LSA — Mission Deck',
        images: ['img/LSA_Mission1.webp', 'img/LSA_Mission2.webp', 'img/LSA_Mission3.webp', 'img/LSA_Mission4.webp', 'img/LSA_Mission5.webp', 'img/LSA_Mission7.webp', 'img/LSA_Mission8.webp', 'img/LSA_Mission9.webp']
      },
      'ui-millennials': {
        title: 'Urban Institute — Millennials Deck',
        images: ['img/ui2_01.webp', 'img/ui2_02.webp', 'img/ui2_03.webp', 'img/ui2_04.webp', 'img/ui2_05.webp', 'img/ui2_06.webp', 'img/ui2_07.webp', 'img/ui2_08.webp', 'img/ui2_09.webp', 'img/ui2_10.webp', 'img/ui2_11.webp', 'img/ui2_12.webp', 'img/ui2_13.webp', 'img/ui2_14.webp', 'img/ui2_15.webp', 'img/ui2_16.webp', 'img/ui2_17.webp', 'img/ui2_18.webp', 'img/ui2_19.webp', 'img/ui2_20.webp', 'img/ui2_21.webp', 'img/ui2_22.webp', 'img/ui2_23.webp', 'img/ui2_24.webp', 'img/ui2_25.webp']
      },
      'logo-identity': {
        title: 'Brand Development',
        images: ['img/LogoOHM10.webp', 'img/LogoOHM.webp', 'img/AF_Logo_Orange.webp', 'img/BDA_Logo.webp', 'img/FPlogo.webp', 'img/LogoACK.webp', 'img/LogoBS.webp', 'img/LogoFAF.webp', 'img/LogoGs.webp', 'img/LogoHP.webp', 'img/LogoMFA.webp', 'img/LogoMFA10.webp', 'img/LogoMMB01.webp', 'img/LogoTRS.webp', 'img/LogoTRUM.webp', 'img/LogoTTB.webp', 'img/LogoTTS.webp', 'img/MarTQue.webp', 'img/VA_Blend_onBG.webp', 'img/WoofBakeryLogo.webp', 'img/lb01.webp', 'img/lb02.webp', 'img/lb03.webp', 'img/lb04.webp', 'img/lb05.webp', 'img/lb06.webp', 'img/lb14.webp', 'img/lb15.webp', 'img/lb17.webp', 'img/lb19.webp', 'img/lb20.webp', 'img/lb21.webp', 'img/lb22.webp', 'img/lb23.webp']
      },
      'trummers': {
        title: 'Trummer\'s — An American Bistro',
        images: ['img/TRM02.webp', 'img/TRM01.webp', 'img/TRM03.webp', 'img/TRM04.webp', 'img/TRM05.webp', 'img/TRM06.webp', 'img/TOM-Sign.webp', 'img/TOM-Awning.webp', 'img/Black_Friday_Trummers.webp', 'img/TOMJailbirdMenu_Lyt_2_Page_1.webp', 'img/TOMJailbirdMenu_Lyt_2_Page_2.webp', 'img/TOMTiki_Menu_Page_1.webp', 'img/TOMTiki_Menu_Page_2.webp', 'img/TOM_10YR_Ann.webp', 'img/TOM_BnB_NYE.webp', 'img/TOM_Dinner_Page_1.webp', 'img/TOM_Dinner_Page_2.webp', 'img/TRM_OysterRoast_Flyer.webp']
      }
    };
    var cur = null;   // { set, i } while a collection is open

    function paint() {
      if (cur) {
        lbImg.src = cur.set.images[cur.i];
        lbImg.alt = cur.set.title;
        lbLabel.textContent = cur.set.title;
        lbCount.textContent = (cur.i + 1) + ' / ' + cur.set.images.length;
      } else {
        var n = String(at + 1);
        lbLabel.textContent = 'Archive ' + (n.length < 2 ? '0' + n : n);
        lbCount.textContent = (at + 1) + ' / ' + tiles.length;
      }
      lb.classList.toggle('is-img', !!cur);
    }
    function openSet(key) {
      cur = (key && SETS[key]) ? { set: SETS[key], i: 0 } : null;
      if (cur) {
        // warm the set so the click-through has no loading beats
        cur.set.images.forEach(function (src) { var im = new Image(); im.src = src; });
      }
      opener = document.activeElement;
      paint();
      lb.hidden = false;
      raf(function () { lb.classList.add('is-open'); });
      document.body.style.overflow = 'hidden';
      lbClose.focus();
    }
    function openLb(i) {
      at = (i + tiles.length) % tiles.length;
      openSet(tiles[at].dataset.set);
    }
    function closeLb() {
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(function () { lb.hidden = true; }, 260);
      if (opener) opener.focus();
    }
    function go(step) {
      if (cur) { cur.i = (cur.i + step + cur.set.images.length) % cur.set.images.length; }
      else    { at   = (at   + step + tiles.length) % tiles.length; }
      paint();
    }

    tiles.forEach(function (t, i) { t.addEventListener('click', function () { openLb(i); }); });
    /* in-page collections (figures, cards) open their set directly */
    Array.prototype.forEach.call(document.querySelectorAll('[data-set]'), function (el) {
      if (el.classList.contains('tile')) return;          // tiles are bound above
      el.addEventListener('click', function () { openSet(el.dataset.set); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSet(el.dataset.set); }
      });
    });
    lbPrev.addEventListener('click', function () { go(-1); });
    lbNext.addEventListener('click', function () { go(1); });
    lbClose.addEventListener('click', closeLb);
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape')     { closeLb(); }
      if (e.key === 'ArrowLeft')  { go(-1); }
      if (e.key === 'ArrowRight') { go(1); }
      if (e.key === 'Tab') {                       // keep focus inside
        var f = [lbClose, lbPrev, lbNext];
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
  }

  /* ---- 7c. contact modal ------------------------------------------------ */
  var cm = document.getElementById('contactModal');
  if (cm) {
    var cmForm   = document.getElementById('cmForm');
    var cmSent   = document.getElementById('cmSent');
    var cmClose  = document.getElementById('cmClose');
    var cmWash   = cm.querySelector('.cm__wash');
    var cmOpener = null;

    function setCm(open) {
      if (open) {
        cmOpener = document.activeElement;
        cm.hidden = false;
        raf(function () { cm.classList.add('is-open'); });
        document.body.style.overflow = 'hidden';
        var cmT = document.getElementById('cmTime');
        if (cmT) cmT.value = Date.now();
        setTimeout(function () { cmForm.querySelector('input').focus(); }, 160);
      } else {
        cm.classList.remove('is-open');
        document.body.style.overflow = '';
        if (cmOpener) { cmOpener.focus(); cmOpener = null; }
        setTimeout(function () {
          if (cm.classList.contains('is-open')) return;   // reopened mid-fade
          cm.hidden = true;
          cmSent.hidden = true;
          cmForm.style.display = '';
          cmForm.reset();
        }, 300);
      }
    }

    var cmOpenBtn = document.getElementById('cmOpen');
    cmOpenBtn && cmOpenBtn.addEventListener('click', function () { setCm(true); });
    cmClose.addEventListener('click', function () { setCm(false); });
    cmWash.addEventListener('click', function () { setCm(false); });

    document.addEventListener('keydown', function (e) {
      if (cm.hidden) return;
      if (e.key === 'Escape') { setCm(false); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(
        cm.querySelectorAll('button, input, select, textarea'),
        function (n) { return !n.disabled && n.offsetParent !== null; }
      );
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    cmForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = cmForm.querySelector('.cm__send');
      var flash = function (text) {
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = text;
        setTimeout(function () { btn.disabled = false; btn.textContent = 'Send Message'; }, 4000);
      };
      if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }
      fetch('php/contact.php', { method: 'POST', body: new FormData(cmForm) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.success) {
            cmForm.style.display = 'none';
            cmSent.hidden = false;
            setTimeout(function () { setCm(false); }, 3000);
          } else {
            flash(d.error || 'Error \u2014 try again');
          }
        })
        .catch(function () { flash('Error \u2014 try again'); });
    });
  }

  /* ---- 8. sunfield: the aperture behind the contact block -------------- */
  var cvs = document.getElementById('sunfield');
  if (cvs && !reduce) {
    var ctx = cvs.getContext('2d'), w = 0, h = 0, dpr = 1, live = false, t0 = 0;
    var mx = 0.5, my = 0.5;
    // rays start at the mark's edge, so none of them show inside its open centre
    var markEl = document.querySelector('.contact__sun'), markR = 0;
    function measureMark() {
      markR = markEl ? markEl.getBoundingClientRect().width / 2 : 0;
    }

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cvs.clientWidth; h = cvs.clientHeight;
      cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size(); measureMark();
    window.addEventListener('resize', function () { size(); measureMark(); });
    cvs.parentElement.addEventListener('mousemove', function (e) {
      var r = cvs.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width; my = (e.clientY - r.top) / r.height;
    }, { passive: true });

    var RAYS = 84;
    function draw(ts) {
      if (!live) return;
      if (!w || !h) { size(); measureMark(); }
      if (!w || !h) { raf(draw); return; }
      var t = (ts - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      var ox = w * 0.74, oy = h * 0.5;
      var base = Math.min(w, h) * 0.34;
      var px = mx * w, py = my * h;
      var span = Math.max(w, h) * 0.6;
      var d = span > 0 ? Math.min(1, Math.hypot(px - ox, py - oy) / span) : 1;
      var pull = 1 - d;
      // the rays begin just off the mark — a quarter of the clearing they had
      var r0 = markR ? markR * 1.43 : base * 0.16;

      for (var i = 0; i < RAYS; i++) {
        var ang = (i / RAYS) * Math.PI * 2 + t * 0.045;
        var wave = Math.sin(i * 0.7 + t * 0.9) * 0.5 + 0.5;
        var len = r0 + base * (0.52 + wave * 0.48 + pull * 0.30);
        var x1 = ox + Math.cos(ang) * r0;
        var y1 = oy + Math.sin(ang) * r0;
        var x2 = ox + Math.cos(ang) * len;
        var y2 = oy + Math.sin(ang) * len;
        var g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, 'rgba(232,110,52,' + (0.30 + pull * 0.30).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(147,149,152,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      raf(draw);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !live) { size(); measureMark(); live = true; t0 = performance.now(); raf(draw); }
          else if (!e.isIntersecting) { live = false; }
        });
      }, { threshold: 0.02 }).observe(cvs);
    }
  }

  /* ---- 9. ember drift: Rural Voices suns float and bounce ------------- */
  var ember = document.querySelector('.ember-field');
  if (ember && !reduce) {
    var eSuns = ember.querySelectorAll('svg');
    var eW = 0, eH = 0, eRun = false, eLast = 0;
    var movers = [];

    function eMeasure(init) {
      var r = ember.getBoundingClientRect();
      eW = r.width; eH = r.height;
      movers.forEach(function (m) {
        m.w = eW * m.s / 100; m.h = m.w;   // width:var(--s) is % of field; aspect-ratio 1
        if (init) { m.x = eW * m.xp / 100; m.y = eH * m.yp / 100; }
        m.x = Math.max(0, Math.min(m.x, Math.max(0, eW - m.w)));
        m.y = Math.max(0, Math.min(m.y, Math.max(0, eH - m.h)));
        m.el.style.translate = m.x + 'px ' + m.y + 'px';
      });
    }

    for (var ei = 0; ei < eSuns.length; ei++) {
      var eEl = eSuns[ei];
      eEl.classList.add('drift');   // css drops bob, keeps the slow spin
      movers.push({
        el: eEl,
        s:  parseFloat(eEl.style.getPropertyValue('--s')) || 10,
        xp: parseFloat(eEl.style.getPropertyValue('--x')) || 0,
        yp: parseFloat(eEl.style.getPropertyValue('--y')) || 0,
        x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0
      });
      eEl.style.left = '0px'; eEl.style.top = '0px';
    }
    eMeasure(true);
    movers.forEach(function (m) {
      var eSp = 8 + Math.random() * 12;   // px per second — calm, not busy
      var eAn = Math.random() * Math.PI * 2;
      m.vx = Math.cos(eAn) * eSp; m.vy = Math.sin(eAn) * eSp;
    });

    function eStep(ts) {
      if (!eRun || reduce) { eRun = false; return; }
      var dt = Math.min((ts - eLast) / 1000, 0.05);
      eLast = ts;
      for (var ej = 0; ej < movers.length; ej++) {
        var m = movers[ej];
        m.x += m.vx * dt; m.y += m.vy * dt;
        var mX = Math.max(0, eW - m.w), mY = Math.max(0, eH - m.h);
        if (m.x <= 0)       { m.x = 0;  m.vx = Math.abs(m.vx); }
        else if (m.x >= mX) { m.x = mX; m.vx = -Math.abs(m.vx); }
        if (m.y <= 0)       { m.y = 0;  m.vy = Math.abs(m.vy); }
        else if (m.y >= mY) { m.y = mY; m.vy = -Math.abs(m.vy); }
        m.el.style.translate = m.x + 'px ' + m.y + 'px';
      }
      raf(eStep);
    }

    window.addEventListener('resize', function () { eMeasure(false); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !eRun && !reduce) { eMeasure(); eRun = true; eLast = performance.now(); raf(eStep); }
          else if (!e.isIntersecting) { eRun = false; }
        });
      }, { rootMargin: '120px' }).observe(ember);
    } else { eRun = true; eLast = performance.now(); raf(eStep); }
  }
})();
