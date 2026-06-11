/* ============================================================
   GRAYSON DESIGN PARTNERS — 2026 Main JS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── NAV SCROLL STATE ─────────────────────────────────── */
  const nav = document.getElementById('mainNav');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── MOBILE MENU ─────────────────────────────────────── */
  const toggle   = document.getElementById('navToggle');
  const menu     = document.getElementById('mobileMenu');
  const closeBtn = document.getElementById('mobileClose');
  const mobileLinks = menu.querySelectorAll('.mobile-link');

  const openMenu  = () => { menu.classList.add('open'); document.body.style.overflow = 'hidden'; };
  const closeMenu = () => { menu.classList.remove('open'); document.body.style.overflow = ''; };

  toggle.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  mobileLinks.forEach(a => a.addEventListener('click', closeMenu));

  /* ── SCROLL REVEAL ───────────────────────────────────── */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('visible'));
  }

  /* ── PORTFOLIO FILTER ────────────────────────────────── */
  const filterBtns = document.querySelectorAll('.pf');
  const pgItems    = document.querySelectorAll('.pg-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      pgItems.forEach(item => {
        const match = filter === 'all' || item.dataset.cat === filter;
        item.classList.toggle('hidden', !match);
      });
    });
  });

  /* ── CONTACT FORM ────────────────────────────────────── */
  const form    = document.getElementById('contactForm');
  const success = document.getElementById('formSuccess');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.btn-submit');
      btn.textContent = 'Sending…';
      btn.disabled = true;

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          form.reset();
          success.hidden = false;
          setTimeout(() => { success.hidden = true; }, 6000);
        } else {
          alert('There was a problem sending your message. Please try again.');
        }
      } catch {
        alert('There was a problem sending your message. Please check your connection.');
      } finally {
        btn.textContent = 'Send Message';
        btn.disabled = false;
      }
    });
  }

  /* ── SMOOTH HASH SCROLL ──────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ── TICKER DUPLICATE for seamless loop ─────────────── */
  const ticker = document.querySelector('.ticker-track');
  if (ticker) {
    ticker.innerHTML += ticker.innerHTML;
  }

  /* ── LIGHTBOX FACTORY ───────────────────────────────── */
  function initLightbox({ triggerId, overlayId, closeId, prevId, nextId, imgId, counterId, dotsId, images }) {
    const trigger  = document.getElementById(triggerId);
    const overlay  = document.getElementById(overlayId);
    const lbClose  = document.getElementById(closeId);
    const lbPrev   = document.getElementById(prevId);
    const lbNext   = document.getElementById(nextId);
    const lbImg    = document.getElementById(imgId);
    const lbCounter= document.getElementById(counterId);
    const lbDots   = document.getElementById(dotsId);
    if (!trigger || !overlay) return;

    let current = 0;

    images.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'lb-dot';
      dot.setAttribute('aria-label', `Go to image ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      lbDots.appendChild(dot);
    });
    const dots = lbDots.querySelectorAll('.lb-dot');

    function goTo(index) {
      current = (index + images.length) % images.length;
      lbImg.classList.remove('lb-loaded');
      lbCounter.textContent = `${current + 1} / ${images.length}`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
      const img = new Image();
      img.onload = () => { lbImg.src = images[current]; lbImg.classList.add('lb-loaded'); };
      img.src = images[current];
    }

    function openLightbox() {
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => overlay.classList.add('lb-visible'));
      goTo(0);
    }
    function closeLightbox() {
      overlay.classList.remove('lb-visible');
      document.body.style.overflow = '';
      setTimeout(() => { overlay.hidden = true; }, 300);
    }

    trigger.addEventListener('click', openLightbox);
    lbClose.addEventListener('click', closeLightbox);
    lbPrev.addEventListener('click', () => goTo(current - 1));
    lbNext.addEventListener('click', () => goTo(current + 1));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeLightbox(); });
    document.addEventListener('keydown', e => {
      if (overlay.hidden) return;
      if (e.key === 'ArrowRight') goTo(current + 1);
      if (e.key === 'ArrowLeft')  goTo(current - 1);
      if (e.key === 'Escape')     closeLightbox();
    });
    let touchStartX = 0;
    overlay.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) diff > 0 ? goTo(current + 1) : goTo(current - 1);
    }, { passive: true });
  }

  /* ── LOGO LIGHTBOX ───────────────────────────────────── */
  initLightbox({
    triggerId: 'logoGalleryTrigger',
    overlayId: 'lbOverlay',
    closeId:   'lbClose',
    prevId:    'lbPrev',
    nextId:    'lbNext',
    imgId:     'lbImg',
    counterId: 'lbCounter',
    dotsId:    'lbDots',
    images: [
      'images/logos/LogoOHM10.jpg',
      'images/logos/LogoOHM.jpg',
      'images/logos/AF_Logo_Orange.jpg',
      'images/logos/BDA_Logo.jpg',
      'images/logos/FPlogo.png',
      'images/logos/LogoACK.jpg',
      'images/logos/LogoBS.jpg',
      'images/logos/LogoFAF.jpg',
      'images/logos/LogoGs.jpg',
      'images/logos/LogoHP.jpg',
      'images/logos/LogoMFA.jpg',
      'images/logos/LogoMFA10.jpg',
      'images/logos/LogoMMB01.jpg',
      'images/logos/LogoTRS.jpg',
      'images/logos/LogoTRUM.jpg',
      'images/logos/LogoTTB.jpg',
      'images/logos/LogoTTS.jpg',
      'images/logos/MarTQue.jpg',
      'images/logos/VA_Blend_onBG.jpg',
      'images/logos/WoofBakeryLogo.jpg',
      // Behance Branding/Logos/Identity gallery
      'images/logos_b/lb01.jpg',
      'images/logos_b/lb02.jpg',
      'images/logos_b/lb03.jpg',
      'images/logos_b/lb04.jpg',
      'images/logos_b/lb05.jpg',
      'images/logos_b/lb06.jpg',
      'images/logos_b/lb07.jpg',
      'images/logos_b/lb08.jpg',
      'images/logos_b/lb10.jpg',
      'images/logos_b/lb11.jpg',
      'images/logos_b/lb14.jpg',
      'images/logos_b/lb15.jpg',
      'images/logos_b/lb17.jpg',
      'images/logos_b/lb18.jpg',
      'images/logos_b/lb19.jpg',
      'images/logos_b/lb20.jpg',
      'images/logos_b/lb21.jpg',
      'images/logos_b/lb22.jpg',
      'images/logos_b/lb23.jpg',
      'images/logos_b/lb24.jpg',
      'images/logos_b/lb26.jpg',
    ]
  });

  initLightbox({
    triggerId: 'ui2GalleryTrigger',
    overlayId: 'lbUi2Overlay',
    closeId:   'lbUi2Close',
    prevId:    'lbUi2Prev',
    nextId:    'lbUi2Next',
    imgId:     'lbUi2Img',
    counterId: 'lbUi2Counter',
    dotsId:    'lbUi2Dots',
    images: Array.from({length: 25}, (_, i) => `images/ui2/ui2_${String(i+1).padStart(2,'0')}.png`)
  });

  initLightbox({
    triggerId: 'ceoGalleryTrigger',
    overlayId: 'lbCeoOverlay',
    closeId:   'lbCeoClose',
    prevId:    'lbCeoPrev',
    nextId:    'lbCeoNext',
    imgId:     'lbCeoImg',
    counterId: 'lbCeoCounter',
    dotsId:    'lbCeoDots',
    images: [
      'images/ceo/ceo01.webp',
      'images/ceo/ceo02.webp',
      'images/ceo/ceo03.webp',
      'images/ceo/ceo04.webp',
      'images/ceo/ceo05.webp',
      'images/ceo/ceo06.webp',
      'images/ceo/ceo07.webp',
      'images/ceo/ceo08.webp',
      'images/ceo/ceo09.webp',
      'images/ceo/ceo10.webp',
      'images/ceo/ceo11.webp',
      'images/ceo/ceo12.webp',
    ]
  });

  initLightbox({
    triggerId: 'pfGalleryTrigger',
    overlayId: 'lbPfOverlay',
    closeId:   'lbPfClose',
    prevId:    'lbPfPrev',
    nextId:    'lbPfNext',
    imgId:     'lbPfImg',
    counterId: 'lbPfCounter',
    dotsId:    'lbPfDots',
    images: [
      'images/PFAR01_1080p.jpg',
      'images/PFAR02_1080p.jpg',
      'images/PFAR22_01_1080p.jpg',
      'images/PFAR22_02_1080p.jpg',
      'images/PF_SSP_1080p.jpg',
    ]
  });

  initLightbox({
    triggerId: 'lsaDeckTrigger',
    overlayId: 'lbLsaOverlay',
    closeId:   'lbLsaClose',
    prevId:    'lbLsaPrev',
    nextId:    'lbLsaNext',
    imgId:     'lbLsaImg',
    counterId: 'lbLsaCounter',
    dotsId:    'lbLsaDots',
    images: [
      'images/L24/LSA_Mission1.png',
      'images/L24/LSA_Mission2.png',
      'images/L24/LSA_Mission3.png',
      'images/L24/LSA_Mission4.png',
      'images/L24/LSA_Mission5.png',
      'images/L24/LSA_Mission7.png',
      'images/L24/LSA_Mission8.png',
      'images/L24/LSA_Mission9.png',
    ]
  });

  initLightbox({
    triggerId: 'foodGalleryTrigger',
    overlayId: 'lbFoodOverlay',
    closeId:   'lbFoodClose',
    prevId:    'lbFoodPrev',
    nextId:    'lbFoodNext',
    imgId:     'lbFoodImg',
    counterId: 'lbFoodCounter',
    dotsId:    'lbFoodDots',
    images: [
      'images/food/TOM-Sign.jpg',
      'images/food/TOM-Awning.jpg',
      'images/food/Black_Friday_Trummers.jpg',
      'images/food/TOMJailbirdMenu_Lyt_2_Page_1.jpg',
      'images/food/TOMJailbirdMenu_Lyt_2_Page_2.jpg',
      'images/food/TOMTiki_Menu_Page_1.jpg',
      'images/food/TOMTiki_Menu_Page_2.jpg',
      'images/food/TOM_10YR_Ann.jpg',
      'images/food/TOM_BnB_NYE.jpg',
      'images/food/TOM_Dinner_Page_1.jpg',
      'images/food/TOM_Dinner_Page_2.jpg',
      'images/food/TRM_OysterRoast_Flyer.jpg',
    ]
  });

});
