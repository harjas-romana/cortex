/* ==========================================================
 *  CORTEX — Command Center  ·  Popup Controller
 * ========================================================== */

/* ----------------------------------------------------------
 *  ██  BRANDING CONFIG — change your name here
 * ---------------------------------------------------------- */
const BRAND = {
  ownerName: 'YOUR NAME',       // ← PUT YOUR NAME HERE
  extensionName: 'CORTEX',
  tagline: 'COMMAND CENTER',
  version: '2.0.0'
};
/* ---------------------------------------------------------- */

/* ----------------------------------------------------------
 *  ██  HDR PRESETS
 * ---------------------------------------------------------- */
const HDR_PRESETS = {
  cinematic: {
    toneMap: 'aces', intensity: 65, shadows: 12, highlights: -8,
    clarity: 30, temp: 3, vibrance: 22, bloom: 6
  },
  vivid: {
    toneMap: 'filmic', intensity: 80, shadows: 8, highlights: -3,
    clarity: 50, temp: 0, vibrance: 45, bloom: 12
  },
  natural: {
    toneMap: 'reinhard', intensity: 45, shadows: 5, highlights: -5,
    clarity: 18, temp: 0, vibrance: 12, bloom: 2
  },
  neon: {
    toneMap: 'filmic', intensity: 100, shadows: 15, highlights: 5,
    clarity: 70, temp: -5, vibrance: 65, bloom: 20
  }
};

/* ----------------------------------------------------------
 *  ██  DEFAULT STATE
 * ---------------------------------------------------------- */
const DEFAULTS = {
  activeModule: 'hdr',

  hdr: {
    enabled: false,
    mode: 'simulated',
    toneMap: 'aces',
    intensity: 65,
    shadows: 12,
    highlights: -8,
    clarity: 30,
    temp: 3,
    vibrance: 22,
    bloom: 6,
    xdrPeak: 150,
    preset: 'cinematic'
  },

  aura: {
    enabled: false,
    intensity: 70,
    blur: 60,
    spread: 40,
    smooth: 50,
    sides: 'all'
  },

  phantom: {
    enabled: false,
    type: 'particles',
    length: 20,
    size: 3,
    opacity: 70,
    fade: 50
  },

  ghost: {
    enabled: false,
    trackers: true,
    utm: true,
    webrtc: true,
    fingerprint: true,
    cookies: false,
    stats: { trackers: 0, cookies: 0, utm: 0 }
  },

  zenith: {
    enabled: false,
    clock24: true,
    greeting: true,
    quote: true,
    date: true,
    bg: 'solid',
    clockStyle: 'minimal'
  },

  nightfall: {
    enabled: false,
    mode: 'intelligent',
    brightness: 92,
    contrast: 105,
    warmth: 10,
    excludeImg: true,
    perSite: true
  }
};

/* ----------------------------------------------------------
 *  ██  STATE
 * ---------------------------------------------------------- */
let S = JSON.parse(JSON.stringify(DEFAULTS));

/* ----------------------------------------------------------
 *  ██  HELPERS
 * ---------------------------------------------------------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/* ----------------------------------------------------------
 *  ██  SLIDER FILL RENDERING
 * ---------------------------------------------------------- */
function fillSlider(el) {
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  const val = parseFloat(el.value);
  const pct = ((val - min) / (max - min)) * 100;

  if (el.classList.contains('center')) {
    const center = ((0 - min) / (max - min)) * 100;
    if (pct >= center) {
      el.style.background =
        `linear-gradient(to right, #1a1a1a ${center}%, #fff ${center}%, #fff ${pct}%, #1a1a1a ${pct}%)`;
    } else {
      el.style.background =
        `linear-gradient(to right, #1a1a1a ${pct}%, #fff ${pct}%, #fff ${center}%, #1a1a1a ${center}%)`;
    }
  } else {
    el.style.background =
      `linear-gradient(to right, #fff ${pct}%, #1a1a1a ${pct}%)`;
  }
}

function fillAllSliders() {
  $$('.slider').forEach(el => fillSlider(el));
}

/* ----------------------------------------------------------
 *  ██  INIT
 * ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  applyBranding();
  await loadState();
  renderAll();
  bindNav();
  bindHDR();
  bindAura();
  bindPhantom();
  bindGhost();
  bindZenith();
  bindRadar();
  bindNightfall();
  queryPage();
  fillAllSliders();
});

/* ----------------------------------------------------------
 *  ██  BRANDING
 * ---------------------------------------------------------- */
function applyBranding() {
  $('#owner-name').textContent = BRAND.ownerName;
  $('#foot-ver').textContent = `v${BRAND.version}`;
}

/* ----------------------------------------------------------
 *  ██  STATE LOAD / SAVE
 * ---------------------------------------------------------- */
async function loadState() {
  return new Promise(resolve => {
    chrome.storage.local.get('cortex', data => {
      if (data.cortex) {
        S = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), data.cortex);
      }
      resolve();
    });
  });
}

async function saveState() {
  await chrome.storage.local.set({ cortex: S });
}

/* ----------------------------------------------------------
 *  ██  PUSH STATE TO CONTENT SCRIPT + BACKGROUND
 * ---------------------------------------------------------- */
async function pushState(moduleKey) {
  await saveState();

  try {
    chrome.runtime.sendMessage({
      type: 'CORTEX_STATE',
      state: S,
      module: moduleKey
    });
  } catch (_) {}

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'CORTEX_APPLY',
        state: S,
        module: moduleKey
      });
    }
  } catch (_) {}

  renderFooter();
}

/* ----------------------------------------------------------
 *  ██  RENDER ALL UI
 * ---------------------------------------------------------- */
function renderAll() {
  renderNav();
  renderHDR();
  renderAura();
  renderPhantom();
  renderGhost();
  renderZenith();
  renderNightfall();
  renderFooter();
}

/* ----------------------------------------------------------
 *  ██  NAVIGATION
 * ---------------------------------------------------------- */
function renderNav() {
  $$('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === S.activeModule);
  });

  // Show/hide panels
  $$('.panel').forEach(p => {
    p.classList.toggle('active', p.dataset.panel === S.activeModule);
  });

  // Module-enabled dots
  const modules = ['hdr', 'aura', 'phantom', 'ghost', 'zenith', 'nightfall'];
  modules.forEach(m => {
    const dot = $(`#dot-${m}`);
    if (dot) dot.classList.toggle('on', !!S[m]?.enabled);
  });
}

function bindNav() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeModule = btn.dataset.module;
      renderNav();
      saveState();
    });
  });
}

/* ----------------------------------------------------------
 *  ██  FOOTER STATUS
 * ---------------------------------------------------------- */
function renderFooter() {
  const modules = ['hdr', 'aura', 'phantom', 'ghost', 'zenith', 'nightfall'];
  const active = modules.filter(m => S[m]?.enabled);

  const dot = $('#foot-dot');
  const txt = $('#foot-text');

  if (active.length === 0) {
    dot.classList.remove('on');
    txt.textContent = 'ALL SYSTEMS IDLE';
  } else {
    dot.classList.add('on');
    const labels = active.map(m => m.toUpperCase());
    txt.textContent = `${labels.join(' · ')} · ACTIVE`;
  }
}

/* ==========================================================
 *  ██  MODULE: HDR
 * ========================================================== */
function renderHDR() {
  const h = S.hdr;

  // Toggle
  $('#hdr-enabled').checked = h.enabled;
  const body = $('#hdr-body');
  body.classList.toggle('off', !h.enabled);

  // Mode
  $$('[data-hdr-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.hdrMode === h.mode));

  // Show/hide sim vs xdr controls
  const isSim = h.mode === 'simulated';
  $$('.hdr-sim-only').forEach(el => {
    el.classList.toggle('hide', !isSim);
    if (isSim) el.style.display = '';
  });
  $$('.hdr-xdr-only').forEach(el => {
    el.classList.toggle('hide', isSim);
    el.style.display = isSim ? 'none' : '';
  });

  // Tone map
  $$('[data-hdr-tone]').forEach(b =>
    b.classList.toggle('active', b.dataset.hdrTone === h.toneMap));

  // Sliders
  setSlider('hdr-intensity',  h.intensity,     v => `${v}%`);
  setSlider('hdr-shadows',    h.shadows,       v => v > 0 ? `+${v}` : `${v}`);
  setSlider('hdr-highlights', h.highlights,    v => v > 0 ? `+${v}` : `${v}`);
  setSlider('hdr-clarity',    h.clarity,       v => `${v}%`);
  setSlider('hdr-temp',       h.temp,          v => v > 0 ? `+${v}` : v === 0 ? '0' : `${v}`);
  setSlider('hdr-vibrance',   h.vibrance,      v => `${v}%`);
  setSlider('hdr-bloom',      h.bloom,         v => `${v}%`);
  setSlider('hdr-xdr-peak',   h.xdrPeak,       v => `${v}%`);

  // Nits estimation
  const nits = Math.round(500 * (h.xdrPeak / 100));
  const hint = $('#hdr-nits-hint');
  if (hint) hint.textContent = `≈ ${nits} nits`;

  // Presets
  $$('[data-hdr-preset]').forEach(b =>
    b.classList.toggle('active', b.dataset.hdrPreset === h.preset));
}

function bindHDR() {
  // Toggle
  $('#hdr-enabled').addEventListener('change', e => {
    S.hdr.enabled = e.target.checked;
    renderHDR();
    renderNav();
    pushState('hdr');
  });

  // Mode
  $$('[data-hdr-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.hdr.mode = btn.dataset.hdrMode;
      renderHDR();
      fillAllSliders();
      pushState('hdr');
    });
  });

  // Tone map
  $$('[data-hdr-tone]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.hdr.toneMap = btn.dataset.hdrTone;
      S.hdr.preset = 'custom';
      renderHDR();
      pushState('hdr');
    });
  });

  // Sliders
  const hdrSliders = [
    { id: 'hdr-intensity',   key: 'intensity',   fmt: v => `${v}%` },
    { id: 'hdr-shadows',     key: 'shadows',     fmt: v => v > 0 ? `+${v}` : `${v}` },
    { id: 'hdr-highlights',  key: 'highlights',  fmt: v => v > 0 ? `+${v}` : `${v}` },
    { id: 'hdr-clarity',     key: 'clarity',     fmt: v => `${v}%` },
    { id: 'hdr-temp',        key: 'temp',        fmt: v => v > 0 ? `+${v}` : v === 0 ? '0' : `${v}` },
    { id: 'hdr-vibrance',    key: 'vibrance',    fmt: v => `${v}%` },
    { id: 'hdr-bloom',       key: 'bloom',       fmt: v => `${v}%` },
    { id: 'hdr-xdr-peak',    key: 'xdrPeak',     fmt: v => `${v}%` }
  ];

  hdrSliders.forEach(({ id, key, fmt }) => {
    const el = $(`#${id}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseInt(el.value, 10);
      S.hdr[key] = v;
      $(`#${id}-v`).textContent = fmt(v);
      fillSlider(el);
      S.hdr.preset = 'custom';
      $$('[data-hdr-preset]').forEach(b => b.classList.remove('active'));

      if (key === 'xdrPeak') {
        const nits = Math.round(500 * (v / 100));
        const hint = $('#hdr-nits-hint');
        if (hint) hint.textContent = `≈ ${nits} nits`;
      }
      debouncedPush('hdr');
    });
  });

  // Presets
  $$('[data-hdr-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.hdrPreset;
      if (!HDR_PRESETS[p]) return;
      S.hdr = { ...S.hdr, ...HDR_PRESETS[p], preset: p };
      renderHDR();
      fillAllSliders();
      pushState('hdr');
    });
  });
}

/* ==========================================================
 *  ██  MODULE: AURA
 * ========================================================== */
function renderAura() {
  const a = S.aura;
  $('#aura-enabled').checked = a.enabled;
  $('#aura-body').classList.toggle('off', !a.enabled);

  setSlider('aura-intensity', a.intensity, v => `${v}%`);
  setSlider('aura-blur',      a.blur,      v => `${v}px`);
  setSlider('aura-spread',    a.spread,    v => `${v}px`);
  setSlider('aura-smooth',    a.smooth,    v => `${v}%`);

  $$('[data-aura-sides]').forEach(b =>
    b.classList.toggle('active', b.dataset.auraSides === a.sides));
}

function bindAura() {
  $('#aura-enabled').addEventListener('change', e => {
    S.aura.enabled = e.target.checked;
    renderAura(); renderNav();
    pushState('aura');
  });

  bindSliders('aura', [
    { id: 'aura-intensity', key: 'intensity', fmt: v => `${v}%` },
    { id: 'aura-blur',      key: 'blur',      fmt: v => `${v}px` },
    { id: 'aura-spread',    key: 'spread',    fmt: v => `${v}px` },
    { id: 'aura-smooth',    key: 'smooth',    fmt: v => `${v}%` }
  ]);

  $$('[data-aura-sides]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.aura.sides = btn.dataset.auraSides;
      renderAura();
      pushState('aura');
    });
  });
}

/* ==========================================================
 *  ██  MODULE: PHANTOM
 * ========================================================== */
function renderPhantom() {
  const p = S.phantom;
  $('#phantom-enabled').checked = p.enabled;
  $('#phantom-body').classList.toggle('off', !p.enabled);

  $$('[data-phantom-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.phantomType === p.type));

  setSlider('phantom-length',  p.length,  v => `${v}`);
  setSlider('phantom-size',    p.size,    v => `${v}px`);
  setSlider('phantom-opacity', p.opacity, v => `${v}%`);
  setSlider('phantom-fade',    p.fade,    v => `${v}%`);
}

function bindPhantom() {
  $('#phantom-enabled').addEventListener('change', e => {
    S.phantom.enabled = e.target.checked;
    renderPhantom(); renderNav();
    pushState('phantom');
  });

  $$('[data-phantom-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.phantom.type = btn.dataset.phantomType;
      renderPhantom();
      pushState('phantom');
    });
  });

  bindSliders('phantom', [
    { id: 'phantom-length',  key: 'length',  fmt: v => `${v}` },
    { id: 'phantom-size',    key: 'size',    fmt: v => `${v}px` },
    { id: 'phantom-opacity', key: 'opacity', fmt: v => `${v}%` },
    { id: 'phantom-fade',    key: 'fade',    fmt: v => `${v}%` }
  ]);
}

/* ==========================================================
 *  ██  MODULE: GHOST MODE
 * ========================================================== */
function renderGhost() {
  const g = S.ghost;
  $('#ghost-enabled').checked = g.enabled;
  $('#ghost-body').classList.toggle('off', !g.enabled);

  $('#ghost-trackers').checked    = g.trackers;
  $('#ghost-utm').checked         = g.utm;
  $('#ghost-webrtc').checked      = g.webrtc;
  $('#ghost-fingerprint').checked = g.fingerprint;
  $('#ghost-cookies').checked     = g.cookies;

  $('#ghost-stat-trackers').textContent = formatNum(g.stats.trackers);
  $('#ghost-stat-cookies').textContent  = formatNum(g.stats.cookies);
  $('#ghost-stat-utm').textContent      = formatNum(g.stats.utm);
}

function bindGhost() {
  $('#ghost-enabled').addEventListener('change', e => {
    S.ghost.enabled = e.target.checked;
    renderGhost(); renderNav();
    pushState('ghost');
  });

  const checks = ['trackers', 'utm', 'webrtc', 'fingerprint', 'cookies'];
  checks.forEach(key => {
    $(`#ghost-${key}`).addEventListener('change', e => {
      S.ghost[key] = e.target.checked;
      pushState('ghost');
    });
  });
}

/* ==========================================================
 *  ██  MODULE: ZENITH
 * ========================================================== */
function renderZenith() {
  const z = S.zenith;
  $('#zenith-enabled').checked = z.enabled;
  $('#zenith-body').classList.toggle('off', !z.enabled);

  $('#zenith-clock24').checked  = z.clock24;
  $('#zenith-greeting').checked = z.greeting;
  $('#zenith-quote').checked    = z.quote;
  $('#zenith-date').checked     = z.date;

  $$('[data-zenith-bg]').forEach(b =>
    b.classList.toggle('active', b.dataset.zenithBg === z.bg));
  $$('[data-zenith-clock]').forEach(b =>
    b.classList.toggle('active', b.dataset.zenithClock === z.clockStyle));
}

function bindZenith() {
  $('#zenith-enabled').addEventListener('change', e => {
    S.zenith.enabled = e.target.checked;
    renderZenith(); renderNav();
    pushState('zenith');
  });

  ['clock24', 'greeting', 'quote', 'date'].forEach(key => {
    $(`#zenith-${key}`).addEventListener('change', e => {
      S.zenith[key] = e.target.checked;
      pushState('zenith');
    });
  });

  $$('[data-zenith-bg]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.zenith.bg = btn.dataset.zenithBg;
      renderZenith();
      pushState('zenith');
    });
  });

  $$('[data-zenith-clock]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.zenith.clockStyle = btn.dataset.zenithClock;
      renderZenith();
      pushState('zenith');
    });
  });
}

/* ==========================================================
 *  ██  MODULE: RADAR
 * ========================================================== */
function bindRadar() {
  $('#radar-scan').addEventListener('click', async () => {
    const btn = $('#radar-scan');
    btn.classList.add('scanning');
    btn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No tab');

      chrome.tabs.sendMessage(tab.id, { type: 'CORTEX_RADAR_SCAN' }, resp => {
        btn.classList.remove('scanning');
        btn.disabled = false;

        if (chrome.runtime.lastError || !resp) {
          showRadarError();
          return;
        }
        displayRadarResults(resp);
      });
    } catch (_) {
      btn.classList.remove('scanning');
      btn.disabled = false;
      showRadarError();
    }
  });
}

function showRadarError() {
  $('#radar-empty').style.display = 'block';
  $('#radar-results').style.display = 'none';
  $('#radar-empty').querySelector('p').innerHTML =
    'Could not connect to page.<br/>Reload and try again.';
}

function displayRadarResults(data) {
  $('#radar-empty').style.display = 'none';
  const results = $('#radar-results');
  results.style.display = 'flex';

  // Frameworks
  const fwTags = $('#rr-frameworks-tags');
  fwTags.innerHTML = '';
  (data.frameworks || []).forEach(fw => {
    const tag = document.createElement('span');
    tag.className = 'rr-tag' + (fw.highlight ? ' highlight' : '');
    tag.textContent = fw.name;
    fwTags.appendChild(tag);
  });
  if (!data.frameworks?.length) {
    fwTags.innerHTML = '<span class="rr-tag">None detected</span>';
  }

  // Fonts
  const fontTags = $('#rr-fonts-tags');
  fontTags.innerHTML = '';
  (data.fonts || []).forEach(f => {
    const tag = document.createElement('span');
    tag.className = 'rr-tag';
    tag.textContent = f;
    fontTags.appendChild(tag);
  });

  // Colors
  const swatches = $('#rr-colors-swatches');
  swatches.innerHTML = '';
  (data.colors || []).forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'rr-swatch';
    sw.style.background = c;
    sw.setAttribute('data-color', c);
    swatches.appendChild(sw);
  });

  // Meta
  const metaList = $('#rr-meta-list');
  metaList.innerHTML = '';
  Object.entries(data.meta || {}).forEach(([key, val]) => {
    metaList.innerHTML += `
      <div class="rr-meta-row">
        <span class="rr-meta-key">${key}</span>
        <span class="rr-meta-val" title="${val}">${val}</span>
      </div>`;
  });

  // Performance
  const perfList = $('#rr-perf-list');
  perfList.innerHTML = '';
  Object.entries(data.performance || {}).forEach(([key, val]) => {
    perfList.innerHTML += `
      <div class="rr-meta-row">
        <span class="rr-meta-key">${key}</span>
        <span class="rr-meta-val">${val}</span>
      </div>`;
  });
}

/* ==========================================================
 *  ██  MODULE: NIGHTFALL
 * ========================================================== */
function renderNightfall() {
  const n = S.nightfall;
  $('#nightfall-enabled').checked = n.enabled;
  $('#nightfall-body').classList.toggle('off', !n.enabled);

  $$('[data-night-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.nightMode === n.mode));

  setSlider('night-brightness', n.brightness, v => `${v}%`);
  setSlider('night-contrast',   n.contrast,   v => `${v}%`);
  setSlider('night-warmth',     n.warmth,     v => `${v}%`);

  $('#night-exclude-img').checked = n.excludeImg;
  $('#night-per-site').checked    = n.perSite;
}

function bindNightfall() {
  $('#nightfall-enabled').addEventListener('change', e => {
    S.nightfall.enabled = e.target.checked;
    renderNightfall(); renderNav();
    pushState('nightfall');
  });

  $$('[data-night-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.nightfall.mode = btn.dataset.nightMode;
      renderNightfall();
      pushState('nightfall');
    });
  });

  bindSliders('nightfall', [
    { id: 'night-brightness', key: 'brightness', fmt: v => `${v}%` },
    { id: 'night-contrast',   key: 'contrast',   fmt: v => `${v}%` },
    { id: 'night-warmth',     key: 'warmth',     fmt: v => `${v}%` }
  ]);

  ['exclude-img', 'per-site'].forEach(slug => {
    const key = slug === 'exclude-img' ? 'excludeImg' : 'perSite';
    $(`#night-${slug}`).addEventListener('change', e => {
      S.nightfall[key] = e.target.checked;
      pushState('nightfall');
    });
  });
}

/* ==========================================================
 *  ██  SHARED UTILITIES
 * ========================================================== */

/* Set slider value + display text + fill */
function setSlider(id, value, fmt) {
  const el = $(`#${id}`);
  const valEl = $(`#${id}-v`);
  if (el) {
    el.value = value;
    fillSlider(el);
  }
  if (valEl) valEl.textContent = fmt(value);
}

/* Bind slider array for a module */
function bindSliders(moduleKey, sliders) {
  sliders.forEach(({ id, key, fmt }) => {
    const el = $(`#${id}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseInt(el.value, 10);
      S[moduleKey][key] = v;
      $(`#${id}-v`).textContent = fmt(v);
      fillSlider(el);
      debouncedPush(moduleKey);
    });
  });
}

/* Debounce for smooth slider dragging */
let _debounceTimers = {};
function debouncedPush(moduleKey) {
  clearTimeout(_debounceTimers[moduleKey]);
  _debounceTimers[moduleKey] = setTimeout(() => pushState(moduleKey), 60);
}

/* Format number with commas */
function formatNum(n) {
  return (n || 0).toLocaleString();
}

/* ----------------------------------------------------------
 *  ██  QUERY CURRENT PAGE (display info for HDR)
 * ---------------------------------------------------------- */
async function queryPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { type: 'CORTEX_STATUS' }, resp => {
      if (chrome.runtime.lastError || !resp) {
        setDisplayInfo(false, 'NO PAGE CONNECTION');
        return;
      }

      if (resp.display?.hdr) {
        const extras = [];
        if (resp.display.p3) extras.push('P3');
        if (resp.display.rec2020) extras.push('REC.2020');
        setDisplayInfo(true, `HDR DISPLAY · ${extras.join(' · ') || 'DETECTED'}`);
      } else {
        setDisplayInfo(false, 'SDR DISPLAY — SIM MODE RECOMMENDED');
      }

      // Update ghost stats if available
      if (resp.ghostStats) {
        S.ghost.stats = resp.ghostStats;
        renderGhost();
      }
    });
  } catch (_) {
    setDisplayInfo(false, 'NO PAGE CONNECTION');
  }
}

function setDisplayInfo(isHdr, text) {
  const dot = $('#hdr-disp-dot');
  const txt = $('#hdr-disp-text');
  if (dot) dot.className = 'info-dot' + (isHdr ? ' hdr' : '');
  if (txt) txt.textContent = text;
}