/* ==========================================================================
   ANVORA GAMES — site script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initTheme();
  initNav();
  initReveal();
  initHeroParticles();
  initContactForm();
  initGameFilter();
  initYear();
});


/* ---------- Page loader ---------- */

function initLoader() {
  const loader = document.querySelector('.loader');
  if (!loader) return;

  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hide'), 350);
  });

  // Fallback in case load already fired
  setTimeout(() => loader.classList.add('hide'), 1800);
}


/* ---------- Theme toggle (dark / light) ---------- */

function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem('anvora-theme');

  if (saved) {
    root.setAttribute('data-theme', saved);
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {

      const current =
        root.getAttribute('data-theme') === 'light'
          ? 'light'
          : 'dark';

      const next = current === 'light' ? 'dark' : 'light';

      if (next === 'dark') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', 'light');
      }

      localStorage.setItem('anvora-theme', next);
    });
  });
}


/* ---------- Nav: scroll state + mobile menu ---------- */

function initNav() {
  const header = document.querySelector('.site-header');
  const burger = document.querySelector('.nav-burger');
  const mobile = document.querySelector('.nav-mobile');

  if (header) {

    const onScroll = () => {
      header.style.boxShadow =
        window.scrollY > 12
          ? '0 10px 40px -20px rgba(0,0,0,0.6)'
          : 'none';
    };

    window.addEventListener(
      'scroll',
      onScroll,
      { passive: true }
    );

    onScroll();
  }

  if (burger && mobile) {

    burger.addEventListener('click', () => {

      const open = burger.classList.toggle('open');

      mobile.classList.toggle('open', open);

      burger.setAttribute(
        'aria-expanded',
        open ? 'true' : 'false'
      );
    });

    mobile.querySelectorAll('a').forEach(a => {

      a.addEventListener('click', () => {

        burger.classList.remove('open');

        mobile.classList.remove('open');

        burger.setAttribute(
          'aria-expanded',
          'false'
        );
      });

    });
  }
}


/* ---------- Scroll reveal ---------- */

function initReveal() {

  const els = document.querySelectorAll('.reveal');

  if (!els.length) return;

  const io = new IntersectionObserver(
    (entries) => {

      entries.forEach(e => {

        if (e.isIntersecting) {

          e.target.classList.add('is-visible');

          io.unobserve(e.target);
        }

      });

    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    }
  );

  els.forEach(el => io.observe(el));
}


/* ---------- Hero particle field ---------- */

function initHeroParticles() {

  const canvas = document.querySelector('.hero-canvas');

  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  let w;
  let h;
  let particles;

  const prefersReduced =
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;


  function resize() {

    w = canvas.width =
      canvas.offsetWidth * devicePixelRatio;

    h = canvas.height =
      canvas.offsetHeight * devicePixelRatio;
  }


  function makeParticles() {

    const count = Math.min(
      90,
      Math.floor(
        (canvas.offsetWidth * canvas.offsetHeight) /
        14000
      )
    );

    particles = Array.from(
      { length: count },
      () => ({

        x: Math.random() * w,

        y: Math.random() * h,

        r:
          (Math.random() * 1.6 + 0.6) *
          devicePixelRatio,

        vx:
          (Math.random() - 0.5) *
          0.25 *
          devicePixelRatio,

        vy:
          (Math.random() - 0.5) *
          0.25 *
          devicePixelRatio,

        hue:
          Math.random() > 0.5
            ? '63,216,255'
            : '181,101,255',

        a:
          Math.random() * 0.5 + 0.25
      })
    );
  }


  function tick() {

    ctx.clearRect(
      0,
      0,
      w,
      h
    );

    particles.forEach(p => {

      p.x += p.vx;
      p.y += p.vy;


      if (p.x < 0 || p.x > w) {
        p.vx *= -1;
      }


      if (p.y < 0 || p.y > h) {
        p.vy *= -1;
      }


      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        p.r,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        `rgba(${p.hue}, ${p.a})`;

      ctx.fill();

    });


    if (!prefersReduced) {
      requestAnimationFrame(tick);
    }
  }


  resize();

  makeParticles();

  tick();


  window.addEventListener(
    'resize',
    () => {
      resize();
      makeParticles();
    },
    { passive: true }
  );
}


/* ---------- Contact form (front-end only demo) ---------- */

function initContactForm() {

  const form =
    document.querySelector('.contact-form form');

  if (!form) return;


  form.addEventListener(
    'submit',
    (e) => {

      e.preventDefault();


      const success =
        document.querySelector('.form-success');


      if (success) {

        success.classList.add('show');

        setTimeout(
          () => success.classList.remove('show'),
          5000
        );
      }


      form.reset();
    }
  );
}


/* ---------- Games page: search + category filter ---------- */

function initGameFilter() {

  const grid =
    document.querySelector('[data-game-grid]');

  if (!grid) return;


  const cards =
    Array.from(
      grid.querySelectorAll('.game-card')
    );


  const searchInputs =
    document.querySelectorAll(
      '[data-game-search]'
    );


  const chips =
    document.querySelectorAll(
      '[data-filter-chip]'
    );


  let activeCat = 'all';


  function applyFilters() {

    let query = '';


    // Find the search box containing text
    searchInputs.forEach(input => {

      if (input.value.trim() !== '') {

        query =
          input.value
            .toLowerCase()
            .trim();
      }

    });


    cards.forEach(card => {

      const name =
        (card.dataset.name || '')
          .toLowerCase();


      const cat =
        (card.dataset.category || '')
          .toLowerCase();


      const matchesQuery =
        !query ||
        name.includes(query);


      const matchesCat =
        activeCat === 'all' ||
        cat === activeCat;


      const visible =
        matchesQuery &&
        matchesCat;


      /*
       * IMPORTANT:
       * Do NOT use:
       *
       * card.style.display = ...
       *
       * Using hidden allows CSS Grid to
       * continue controlling the layout.
       */

      card.hidden = !visible;

    });
  }


  // Search
  searchInputs.forEach(input => {

    input.addEventListener(
      'input',
      applyFilters
    );

  });


  // Category buttons
  chips.forEach(chip => {

    chip.addEventListener(
      'click',
      () => {

        chips.forEach(c =>
          c.classList.remove('active')
        );


        chip.classList.add('active');


        activeCat =
          chip.dataset.filterChip ||
          'all';


        applyFilters();


        grid.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

      }
    );

  });
}


/* ---------- Footer year ---------- */

function initYear() {

  document
    .querySelectorAll('[data-year]')
    .forEach(el => {

      el.textContent =
        new Date().getFullYear();

    });
}