/* ==========================================================
 *  CORTEX ZENITH — New Tab Dashboard
 *  Clock · Greeting · Quote · Search · Shortcuts
 *  Background: Solid / Gradient / Mesh
 * ========================================================== */

(() => {
  'use strict';

  /* ----------------------------------------------------------
   *  ██  BRANDING — change your name here
   * ---------------------------------------------------------- */
  const BRAND = {
    ownerName: 'YOUR NAME',        // ← PUT YOUR NAME HERE
    version: '2.0.0'
  };
  /* ---------------------------------------------------------- */

  /* ----------------------------------------------------------
   *  ██  QUOTES DATABASE
   * ---------------------------------------------------------- */
  const QUOTES = [
    { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
    { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
    { text: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
    { text: 'Design is not just what it looks like and feels like. Design is how it works.', author: 'Steve Jobs' },
    { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
    { text: 'Move fast and break things. Unless you are breaking stuff, you are not moving fast enough.', author: 'Mark Zuckerberg' },
    { text: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
    { text: 'The people who are crazy enough to think they can change the world are the ones who do.', author: 'Apple' },
    { text: 'First, solve the problem. Then, write the code.', author: 'John Johnson' },
    { text: 'Code is like humor. When you have to explain it, it\'s bad.', author: 'Cory House' },
    { text: 'Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.', author: 'Antoine de Saint-Exupéry' },
    { text: 'The details are not the details. They make the design.', author: 'Charles Eames' },
    { text: 'Have the courage to follow your heart and intuition.', author: 'Steve Jobs' },
    { text: 'Any sufficiently advanced technology is indistinguishable from magic.', author: 'Arthur C. Clarke' },
    { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
    { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
    { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
    { text: 'Think different.', author: 'Apple' },
    { text: 'Less is more.', author: 'Ludwig Mies van der Rohe' },
    { text: 'Make it simple, but significant.', author: 'Don Draper' },
    { text: 'The only limit to our realization of tomorrow is our doubts of today.', author: 'Franklin D. Roosevelt' },
    { text: 'Creativity is intelligence having fun.', author: 'Albert Einstein' },
    { text: 'Everything you can imagine is real.', author: 'Pablo Picasso' },
    { text: 'Your time is limited. Don\'t waste it living someone else\'s life.', author: 'Steve Jobs' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
    { text: 'Somewhere, something incredible is waiting to be known.', author: 'Carl Sagan' },
    { text: 'If you want to go fast, go alone. If you want to go far, go together.', author: 'African Proverb' },
    { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
    { text: 'What we think, we become.', author: 'Buddha' }
  ];

  /* ----------------------------------------------------------
   *  ██  DEFAULT ZENITH CONFIG
   * ---------------------------------------------------------- */
  const DEFAULTS = {
    enabled: true,
    clock24: true,
    greeting: true,
    quote: true,
    date: true,
    bg: 'solid',
    clockStyle: 'minimal'
  };

  let config = { ...DEFAULTS };
  let clockInterval = null;

  /* ----------------------------------------------------------
   *  ██  DOM REFS
   * ---------------------------------------------------------- */
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  /* ----------------------------------------------------------
   *  ██  INIT
   * ---------------------------------------------------------- */
  async function init() {
    // Apply branding
    $('#zen-owner').textContent = BRAND.ownerName;

    // Load config from storage
    try {
      const data = await chrome.storage.local.get('cortex');
      if (data.cortex?.zenith) {
        config = { ...DEFAULTS, ...data.cortex.zenith };
      }
    } catch (_) {}

    renderDate();
    renderGreeting();
    renderClock();
    renderQuote();
    renderBackground();
    renderStats();
    bindSearch();
    startClock();

    // Listen for config changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.cortex) {
        const newState = changes.cortex.newValue;
        if (newState?.zenith) {
          const oldStyle = config.clockStyle;
          const oldBg = config.bg;
          config = { ...DEFAULTS, ...newState.zenith };

          renderDate();
          renderGreeting();
          renderQuote();
          if (config.clockStyle !== oldStyle) renderClock();
          if (config.bg !== oldBg) renderBackground();
        }
      }
    });
  }

  /* ----------------------------------------------------------
   *  ██  CLOCK
   * ---------------------------------------------------------- */
  function renderClock() {
    const clock = $('#zen-clock');
    // Remove old style classes
    clock.className = 'zen-clock';
    clock.classList.add(`style-${config.clockStyle}`);
    updateClock();
  }

  function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  }

  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    let ampm = '';

    if (!config.clock24) {
      ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
    }

    $('#zen-hours').textContent = hours.toString().padStart(2, '0');
    $('#zen-minutes').textContent = minutes.toString().padStart(2, '0');
    $('#zen-seconds').textContent = seconds.toString().padStart(2, '0');

    const ampmEl = $('#zen-ampm');
    if (config.clock24) {
      ampmEl.textContent = '';
      ampmEl.style.display = 'none';
    } else {
      ampmEl.textContent = ampm;
      ampmEl.style.display = '';
    }

    // Colon blink (CSS handles animation, but we sync opacity)
    const colon = $('#zen-colon');
    colon.style.opacity = seconds % 2 === 0 ? '1' : '0.15';
  }

  /* ----------------------------------------------------------
   *  ██  DATE
   * ---------------------------------------------------------- */
  function renderDate() {
    const wrap = $('#zen-date-wrap');
    if (!config.date) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const dateNum = now.getDate();
    const year = now.getFullYear();

    // Ordinal suffix
    const suffix = (d) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    $('#zen-day').textContent = dayName;
    $('#zen-date').textContent = `${monthName} ${dateNum}${suffix(dateNum)}, ${year}`;
  }

  /* ----------------------------------------------------------
   *  ██  GREETING
   * ---------------------------------------------------------- */
  function renderGreeting() {
    const wrap = $('#zen-greeting-wrap');
    if (!config.greeting) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    const hour = new Date().getHours();
    let greeting;

    if (hour >= 5 && hour < 12) {
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      greeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      greeting = 'Good evening';
    } else {
      greeting = 'Night owl mode';
    }

    $('#zen-greeting').textContent = `${greeting}, ${BRAND.ownerName}`;
  }

  /* ----------------------------------------------------------
   *  ██  DAILY QUOTE
   * ---------------------------------------------------------- */
  function renderQuote() {
    const wrap = $('#zen-quote-wrap');
    if (!config.quote) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    // Pick quote based on day of year (changes daily)
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const index = dayOfYear % QUOTES.length;
    const q = QUOTES[index];

    $('#zen-quote').textContent = q.text;
    $('#zen-author').textContent = q.author;
  }

  /* ----------------------------------------------------------
   *  ██  SEARCH
   * ---------------------------------------------------------- */
  function bindSearch() {
    const input = $('#zen-search');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (!val) return;

        // Check if it's a URL
        if (isURL(val)) {
          let url = val;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          window.location.href = url;
        } else {
          // Google search
          window.location.href = `https://www.google.com/search?q=${encodeURIComponent(val)}`;
        }
      }
    });

    // Auto-focus on any keypress
    document.addEventListener('keydown', (e) => {
      if (e.target === input) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        input.focus();
      }
    });
  }

  function isURL(str) {
    return /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(str) ||
           str.includes('localhost') || str.includes(':');
  }

  /* ----------------------------------------------------------
   *  ██  BACKGROUND RENDERER
   * ---------------------------------------------------------- */
  function renderBackground() {
    const canvas = $('#bg-canvas');
    const ctx = canvas.getContext('2d');

    // Reset
    document.body.className = '';
    canvas.classList.remove('visible');

    if (config.bg === 'solid') {
      // Pure black — no canvas needed
      canvas.style.display = 'none';
      document.body.classList.add('bg-solid');
      return;
    }

    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (config.bg === 'gradient') {
      document.body.classList.add('bg-gradient');
      renderGradientBg(ctx, canvas.width, canvas.height);
    } else if (config.bg === 'mesh') {
      document.body.classList.add('bg-mesh');
      renderMeshBg(ctx, canvas.width, canvas.height);
    }

    // Fade in
    requestAnimationFrame(() => canvas.classList.add('visible'));

    // Handle resize
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (config.bg === 'gradient') renderGradientBg(ctx, canvas.width, canvas.height);
      if (config.bg === 'mesh') renderMeshBg(ctx, canvas.width, canvas.height);
    });
  }

  /* --- Gradient background --- */
  function renderGradientBg(ctx, w, h) {
    // Subtle dark gradient with very dim highlights
    const grad = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h));
    grad.addColorStop(0, 'rgba(30, 30, 30, 1)');
    grad.addColorStop(0.4, 'rgba(15, 15, 15, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Second subtle radial
    const grad2 = ctx.createRadialGradient(w * 0.8, h * 0.7, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    grad2.addColorStop(0, 'rgba(25, 25, 30, 0.5)');
    grad2.addColorStop(0.5, 'rgba(10, 10, 12, 0.3)');
    grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);
  }

  /* --- Mesh background (animated) --- */
  function renderMeshBg(ctx, w, h) {
    // Create mesh gradient with multiple soft circles
    const points = [];
    const count = 5;

    for (let i = 0; i < count; i++) {
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.max(w, h) * (0.3 + Math.random() * 0.3),
        hue: Math.random() * 360,
        lightness: 6 + Math.random() * 6
      });
    }

    function drawMesh() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      points.forEach(p => {
        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce
        if (p.x < -100 || p.x > w + 100) p.vx *= -1;
        if (p.y < -100 || p.y > h + 100) p.vy *= -1;

        // Slowly shift hue
        p.hue = (p.hue + 0.02) % 360;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `hsla(0, 0%, ${p.lightness}%, 0.4)`);
        grad.addColorStop(0.5, `hsla(0, 0%, ${p.lightness * 0.5}%, 0.15)`);
        grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      meshRAF = requestAnimationFrame(drawMesh);
    }

    // Cancel previous mesh loop if any
    if (window._cortexMeshRAF) cancelAnimationFrame(window._cortexMeshRAF);
    let meshRAF;
    drawMesh();
    window._cortexMeshRAF = meshRAF;
  }

  /* ----------------------------------------------------------
   *  ██  STATS BAR
   * ---------------------------------------------------------- */
  function renderStats() {
    // Active CORTEX modules
    chrome.storage.local.get('cortex', data => {
      const state = data?.cortex;
      if (!state) return;

      const modules = ['hdr', 'aura', 'phantom', 'ghost', 'nightfall'];
      const active = modules.filter(m => state[m]?.enabled);

      const statCortex = $('#zen-stat-cortex');
      if (active.length === 0) {
        statCortex.textContent = 'ALL MODULES IDLE';
      } else {
        statCortex.textContent = `${active.map(m => m.toUpperCase()).join(' · ')} ACTIVE`;
      }
    });

    // Session time
    const startTime = Date.now();
    const statTime = $('#zen-stat-time');

    setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;

      if (mins > 0) {
        statTime.textContent = `SESSION ${mins}m ${secs.toString().padStart(2, '0')}s`;
      } else {
        statTime.textContent = `SESSION ${secs}s`;
      }
    }, 1000);
  }

  /* ----------------------------------------------------------
   *  ██  KEYBOARD SHORTCUTS
   * ---------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    // ESC clears search
    if (e.key === 'Escape') {
      const input = $('#zen-search');
      input.value = '';
      input.blur();
    }

    // Cmd/Ctrl + K focuses search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      $('#zen-search').focus();
    }
  });

  /* ----------------------------------------------------------
   *  ██  BOOT
   * ---------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();