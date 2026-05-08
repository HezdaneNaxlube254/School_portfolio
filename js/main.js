const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
const filterButtons = document.querySelectorAll('.filter-btn');
const projectGrid = document.getElementById('projectGrid');
const projectCards = [...document.querySelectorAll('.project-card')];
const revealItems = document.querySelectorAll('[data-reveal]');
const statItems = document.querySelectorAll('.stat-value');
const sections = document.querySelectorAll('main section[id]');

const toggleNav = () => {
  const expanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!expanded));
  siteNav.classList.toggle('open');
};

navToggle.addEventListener('click', toggleNav);

window.addEventListener('click', (event) => {
  if (!siteNav.contains(event.target) && !navToggle.contains(event.target)) {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('scroll', () => {
  const header = document.querySelector('.site-header');
  if (window.scrollY > 80) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.2 });

revealItems.forEach((item) => revealObserver.observe(item));

const statsObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      statItems.forEach((item) => {
        const target = parseInt(item.dataset.target, 10);
        const startValue = 0;
        const duration = 1500;
        let startTime = null;

        const step = (timestamp) => {
          if (!startTime) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          const value = Math.floor(progress * target);
          item.textContent = target === 100 ? `${value}%` : String(value);
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else if (target === 100) {
            item.textContent = '100%';
          }
        };

        window.requestAnimationFrame(step);
      });
      observer.disconnect();
    }
  });
}, { threshold: 0.4 });

const statsStrip = document.querySelector('.stats-strip');
if (statsStrip) {
  statsObserver.observe(statsStrip);
}

const sortProjects = (cards) => cards.sort((a, b) => {
  return Number(a.dataset.tier) - Number(b.dataset.tier);
});

const applyFilter = (filter) => {
  const matching = filter === 'all'
    ? [...projectCards]
    : projectCards.filter((card) => card.dataset.category === filter);
  const sorted = sortProjects(matching);
  projectGrid.innerHTML = '';
  sorted.forEach((card) => projectGrid.appendChild(card));
};

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((btn) => {
      btn.classList.toggle('active', btn === button);
      btn.setAttribute('aria-selected', String(btn === button));
    });
    applyFilter(button.dataset.filter);
  });
});

projectCards.forEach((card) => {
  const img = card.querySelector('img');
  const frame = card.querySelector('.project-media');
  img.addEventListener('load', () => {
    frame.classList.remove('error');
  });
  img.addEventListener('error', () => {
    frame.classList.add('error');
  });
});

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const navLink = document.querySelector(`.site-nav a[href="#${entry.target.id}"]`);
    if (entry.isIntersecting && navLink) {
      navLinks.forEach((link) => link.classList.remove('active-section'));
      navLink.classList.add('active-section');
    }
  });
}, { threshold: 0.55 });

sections.forEach((section) => sectionObserver.observe(section));

const successForm = document.querySelector('.contact-form');
if (successForm && window.location.search.includes('?sent=1')) {
  successForm.innerHTML = `
    <div class="form-success">
      <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
      <h2>Message Received!</h2>
      <p>We'll be in touch within 24 hours.</p>
    </div>
  `;
}

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Update footer year dynamically
document.getElementById('year').textContent = new Date().getFullYear();
