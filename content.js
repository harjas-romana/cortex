/* ==========================================================
 *  CORTEX — Content Script Engine
 *
 *  Modules:
 *    HDR       – SVG tone-map pipeline (ACES/Reinhard/Filmic)
 *    AURA      – Ambilight video glow
 *    PHANTOM   – Cursor particle trails
 *    GHOST     – Privacy & fingerprint shield
 *    RADAR     – Page tech x-ray
 *    NIGHTFALL – Intelligent dark mode
 *
 * ========================================================== */

(() => {
  'use strict';

  /* ========================================================
   *  ██  GLOBAL STATE
   * ======================================================== */
  let STATE = null;
  const FRAME_ID = 'cortex-' + Math.random().toString(36).slice(2, 8);

  /* ========================================================
   *  ██  MODULE: HDR DISPLAY ENGINE
   *
   *  Architecture:
   *    1. Generate SVG filter with computed tone curve
   *    2. Apply filter to all <video> elements
   *    3. Handle XDR native mode separately (CSS brightness)
   *
   *  Tone curves are calculated per-channel using:
   *    - ACES filmic (Stephen Hill approximation)
   *    - Reinhard (extended)
   *    - Filmic (Hable / Uncharted 2)
   *
   *  Then modulated by shadow lift, highlight compress,
   *  clarity (unsharp mask), color temp, vibrance & bloom.
   * ======================================================== */

  const HDR = {
    SVG_ID: 'cortex-hdr-svg',
    FILTER_ID: 'cortex-hdr-filter',
    STYLE_ID: 'cortex-hdr-styles',
    CLASS: 'cortex-hdr-active',
    observer: null,
    ytInterval: null,

    /* --- Tone mapping functions --- */
    curves: {
      aces(x) {
        // ACES filmic (Stephen Hill)
        const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        const raw = (x * (a * x + b)) / (x * (c * x + d) + e);
        return raw / 0.8020; // normalise so f(1)=1
      },
      reinhard(x) {
        // Extended Reinhard with Lwhite control
        const Lw = 1.8;
        return (x * (1 + x / (Lw * Lw))) / (1 + x);
      },
      filmic(x) {
        // Hable / Uncharted 2
        const A = 0.22, B = 0.30, C = 0.10, D = 0.20, E = 0.01, F = 0.30;
        const hable = t => ((t * (A * t + C * B) + D * E) / (t * (A * t + B) + D * F)) - E / F;
        const whiteScale = 1.0 / hable(11.2);
        return hable(x * 6.0) * whiteScale;
      }
    },

    /* --- Build tone-curve table for feComponentTransfer --- */
    buildToneTable(type, shadows, highlights, intensity, points = 33) {
      const fn = this.curves[type] || this.curves.aces;
      const factor = Math.max(0, Math.min(1, intensity / 100));
      const table = [];

      for (let i = 0; i < points; i++) {
        const x = i / (points - 1);

        // Base curve (blend identity → curve by intensity)
        let curved = fn(x);
        curved = Math.min(1.0, Math.max(0, curved));
        let y = x + (curved - x) * factor;

        // Shadow lift — quadratic falloff, targets x < 0.35
        const sAmt = (shadows / 100) * 0.20;
        if (x < 0.35) {
          const w = 1 - x / 0.35;
          y += sAmt * (w * w) * factor;
        }

        // Highlight adjustment — targets x > 0.65
        const hAmt = (highlights / 100) * 0.15;
        if (x > 0.65) {
          const w = (x - 0.65) / 0.35;
          y += hAmt * (w * w) * factor;
        }

        table.push(Math.min(1, Math.max(0, y)).toFixed(5));
      }

      return table.join(' ');
    },

    /* --- Generate full SVG filter XML --- */
    buildFilterSVG(h) {
      const factor = h.intensity / 100;
      const toneTable = this.buildToneTable(
        h.toneMap, h.shadows, h.highlights, h.intensity
      );

      // Color temperature matrix
      // warm > 0: boost R, reduce B | cool < 0: reduce R, boost B
      const tNorm = (h.temp || 0) / 50; // -1 to +1
      const rScale = (1 + tNorm * 0.18).toFixed(4);
      const gScale = (1 + tNorm * 0.02).toFixed(4);
      const bScale = (1 - tNorm * 0.18).toFixed(4);

      // Vibrance → saturate value
      const saturate = (1 + (h.vibrance / 100) * 0.55 * factor).toFixed(4);

      // Clarity → unsharp mask strength
      const clarityAmt = (h.clarity / 100) * 0.6 * factor;
      const clK2 = (1 + clarityAmt).toFixed(4); // sharpen factor
      const clK3 = (-clarityAmt).toFixed(4);     // blur subtract

      // Bloom → gaussian deviation & blend amount
      const bloomRadius = Math.max(0, h.bloom * 0.3 * factor);
      const bloomGain = Math.min(1, (h.bloom / 100) * 0.6 * factor);

      // Bloom threshold: only keep bright areas above ~0.55
      const bloomSlope = 2.5;
      const bloomIntercept = -1.3;

      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"
             style="position:absolute;pointer-events:none" id="${this.SVG_ID}">
          <defs>
            <filter id="${this.FILTER_ID}"
                    color-interpolation-filters="sRGB"
                    x="-5%" y="-5%" width="110%" height="110%">

              <!-- PASS 1 — Tone mapping curve (shadow lift + highlight compress + S-curve) -->
              <feComponentTransfer in="SourceGraphic" result="toned">
                <feFuncR type="table" tableValues="${toneTable}"/>
                <feFuncG type="table" tableValues="${toneTable}"/>
                <feFuncB type="table" tableValues="${toneTable}"/>
              </feComponentTransfer>

              <!-- PASS 2 — Color temperature shift -->
              <feColorMatrix in="toned" type="matrix" result="temped"
                values="${rScale} 0 0 0 0
                        0 ${gScale} 0 0 0
                        0 0 ${bScale} 0 0
                        0 0 0 1 0"/>

              <!-- PASS 3 — Vibrance / saturation -->
              <feColorMatrix in="temped" type="saturate"
                values="${saturate}" result="vibrant"/>

              <!-- PASS 4 — Clarity (unsharp mask) -->
              <feGaussianBlur in="vibrant" stdDeviation="1.8" result="clarBlur"/>
              <feComposite in="vibrant" in2="clarBlur"
                operator="arithmetic"
                k1="0" k2="${clK2}" k3="${clK3}" k4="0"
                result="clarified"/>

              ${bloomRadius > 0.3 ? `
              <!-- PASS 5 — Bloom (bright-pass → blur → screen blend) -->
              <feGaussianBlur in="clarified"
                stdDeviation="${(bloomRadius * 2).toFixed(1)}"
                result="bloomSoft"/>
              <feComponentTransfer in="bloomSoft" result="brightPass">
                <feFuncR type="linear" slope="${bloomSlope}" intercept="${bloomIntercept}"/>
                <feFuncG type="linear" slope="${bloomSlope}" intercept="${bloomIntercept}"/>
                <feFuncB type="linear" slope="${bloomSlope}" intercept="${bloomIntercept}"/>
              </feComponentTransfer>
              <feGaussianBlur in="brightPass"
                stdDeviation="${(bloomRadius * 4).toFixed(1)}"
                result="bloomFinal"/>
              <feBlend in="clarified" in2="bloomFinal" mode="screen"
                result="bloomed"/>
              ` : `
              <!-- Bloom disabled — pass through -->
              <feComposite in="clarified" in2="clarified"
                operator="over" result="bloomed"/>
              `}

            </filter>
          </defs>
        </svg>`;
    },

    /* --- Inject or update SVG filter in DOM --- */
    injectFilter(h) {
      let existing = document.getElementById(this.SVG_ID);
      if (existing) existing.remove();

      const wrapper = document.createElement('div');
      wrapper.innerHTML = this.buildFilterSVG(h);
      const svg = wrapper.firstElementChild;
      (document.body || document.documentElement).appendChild(svg);
    },

    /* --- Build CSS for video elements --- */
    buildCSS(h) {
      if (!h.enabled) {
        return `video.${this.CLASS} { filter: none !important; }`;
      }

      if (h.mode === 'xdr') {
        // XDR Native — brightness > 1.0 triggers macOS EDR on XDR panels
        const peak = h.xdrPeak / 100;
        const intensity = h.intensity / 100;
        const xdrBright = 1.0 + (peak - 1.0) * intensity;
        const xdrContrast = 1.0 + 0.08 * intensity;
        const xdrSat = 1.0 + 0.05 * intensity;
        return `
          video.${this.CLASS} {
            filter: brightness(${xdrBright.toFixed(3)})
                    contrast(${xdrContrast.toFixed(3)})
                    saturate(${xdrSat.toFixed(3)}) !important;
          }`;
      }

      // Simulated — use SVG filter pipeline
      return `
        video.${this.CLASS} {
          filter: url(#${this.FILTER_ID}) !important;
        }`;
    },

    /* --- Apply styles --- */
    applyStyles(h) {
      let el = document.getElementById(this.STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = this.STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = this.buildCSS(h);
    },

    /* --- Tag / untag videos --- */
    tagVideos(enabled) {
      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        if (enabled) {
          v.classList.add(this.CLASS);
        } else {
          v.classList.remove(this.CLASS);
        }
      });
      return videos.length;
    },

    /* --- Flash badge overlay --- */
    flashBadge(video, mode) {
      const parent = video.parentElement;
      if (!parent) return;

      const old = parent.querySelector('.cortex-hdr-badge');
      if (old) old.remove();

      const badge = document.createElement('div');
      badge.className = 'cortex-hdr-badge';
      badge.textContent = mode === 'xdr' ? 'XDR' : 'HDR';
      Object.assign(badge.style, {
        position: 'absolute', top: '12px', right: '12px',
        padding: '4px 10px', background: 'rgba(0,0,0,0.75)',
        color: '#fff', fontFamily: '"DM Sans",system-ui,sans-serif',
        fontSize: '10px', fontWeight: '700', letterSpacing: '2px',
        borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)',
        zIndex: '2147483647', pointerEvents: 'none',
        opacity: '1', transition: 'opacity 0.6s ease',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
      });

      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(badge);
      setTimeout(() => { badge.style.opacity = '0'; }, 2000);
      setTimeout(() => { badge.remove(); }, 2800);
    },

    /* --- MutationObserver for dynamic videos --- */
    startObserver() {
      if (this.observer) return;
      this.observer = new MutationObserver(muts => {
        let found = false;
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (node.nodeName === 'VIDEO') { found = true; break; }
            if (node.querySelectorAll) {
              if (node.querySelectorAll('video').length) { found = true; break; }
            }
          }
          if (found) break;
        }
        if (found && STATE?.hdr?.enabled) this.tagVideos(true);
      });
      this.observer.observe(document.documentElement, { childList: true, subtree: true });
    },

    /* --- YouTube SPA handling --- */
    watchYouTube() {
      if (!location.hostname.includes('youtube.com')) return;
      const retag = () => { setTimeout(() => this.tagVideos(STATE?.hdr?.enabled), 600); };
      document.addEventListener('yt-navigate-finish', retag);
      window.addEventListener('popstate', retag);
    },

    /* --- Main apply --- */
    apply(h) {
      if (h.mode === 'simulated' && h.enabled) {
        this.injectFilter(h);
      }
      this.applyStyles(h);
      const count = this.tagVideos(h.enabled);
      if (h.enabled) {
        document.querySelectorAll('video').forEach(v => this.flashBadge(v, h.mode));
      }
      return count;
    },

    init() {
      this.startObserver();
      this.watchYouTube();
      setInterval(() => {
        if (STATE?.hdr?.enabled) this.tagVideos(true);
      }, 4000);
    }
  };


  /* ========================================================
   *  ██  MODULE: AURA — Ambilight Video Glow
   *
   *  Creates a glowing light bleed around video elements
   *  by sampling edge colors from video frames.
   *  Falls back to animated ambient glow if CORS blocks
   *  pixel reading.
   * ======================================================== */

  const AURA = {
    STYLE_ID: 'cortex-aura-styles',
    CLASS: 'cortex-aura-active',
    WRAP_CLASS: 'cortex-aura-wrap',
    GLOW_CLASS: 'cortex-aura-glow',
    canvasPool: new Map(),
    rafId: null,
    lastUpdate: 0,

    /* --- Wrap video in a container, add glow element --- */
    wrapVideo(video) {
      if (video.parentElement?.classList.contains(this.WRAP_CLASS)) return;
      if (video.closest(`.${this.WRAP_CLASS}`)) return;

      const wrap = document.createElement('div');
      wrap.className = this.WRAP_CLASS;
      Object.assign(wrap.style, {
        position: 'relative',
        display: 'inline-block',
        width: video.offsetWidth ? video.offsetWidth + 'px' : '100%'
      });

      const glow = document.createElement('div');
      glow.className = this.GLOW_CLASS;

      video.parentElement.insertBefore(wrap, video);
      wrap.appendChild(glow);
      wrap.appendChild(video);
    },

    /* --- Sample edge colors from video via canvas --- */
    sampleColors(video) {
      let canvas = this.canvasPool.get(video);
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 9;
        this.canvasPool.set(video, canvas);
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      try {
        ctx.drawImage(video, 0, 0, 16, 9);
        const d = ctx.getImageData(0, 0, 16, 9).data;

        // Sample edges: top, bottom, left, right
        const sample = (indices) => {
          let r = 0, g = 0, b = 0, n = indices.length;
          indices.forEach(i => { r += d[i]; g += d[i + 1]; b += d[i + 2]; });
          return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        };

        // Top row pixels
        const topIdx = [];
        for (let x = 0; x < 16; x++) topIdx.push(x * 4);
        // Bottom row pixels
        const botIdx = [];
        for (let x = 0; x < 16; x++) botIdx.push((8 * 16 + x) * 4);
        // Left column pixels
        const leftIdx = [];
        for (let y = 0; y < 9; y++) leftIdx.push((y * 16) * 4);
        // Right column pixels
        const rightIdx = [];
        for (let y = 0; y < 9; y++) rightIdx.push((y * 16 + 15) * 4);

        return {
          top: sample(topIdx),
          bottom: sample(botIdx),
          left: sample(leftIdx),
          right: sample(rightIdx),
          success: true
        };
      } catch (e) {
        // CORS — fall back
        return { success: false };
      }
    },

    /* --- Apply glow to a single video --- */
    updateGlow(video, auraState) {
      const glow = video.parentElement?.querySelector(`.${this.GLOW_CLASS}`);
      if (!glow) return;

      const intensity = auraState.intensity / 100;
      const blur = auraState.blur;
      const spread = auraState.spread;

      const colors = this.sampleColors(video);

      if (colors.success) {
        const { top, bottom, left, right } = colors;
        const sides = auraState.sides;

        const shadows = [];
        const a = (intensity * 0.6).toFixed(2);
        const a2 = (intensity * 0.3).toFixed(2);

        if (sides === 'all' || sides === 'topbot') {
          shadows.push(`0 -${spread}px ${blur}px ${spread / 2}px rgba(${top[0]},${top[1]},${top[2]},${a})`);
          shadows.push(`0 ${spread}px ${blur}px ${spread / 2}px rgba(${bottom[0]},${bottom[1]},${bottom[2]},${a})`);
        }
        if (sides === 'all' || sides === 'sides') {
          shadows.push(`-${spread}px 0 ${blur}px ${spread / 2}px rgba(${left[0]},${left[1]},${left[2]},${a})`);
          shadows.push(`${spread}px 0 ${blur}px ${spread / 2}px rgba(${right[0]},${right[1]},${right[2]},${a})`);
        }
        // Outer diffuse layer
        const avg = [
          Math.round((top[0] + bottom[0] + left[0] + right[0]) / 4),
          Math.round((top[1] + bottom[1] + left[1] + right[1]) / 4),
          Math.round((top[2] + bottom[2] + left[2] + right[2]) / 4)
        ];
        shadows.push(`0 0 ${blur * 2}px ${spread}px rgba(${avg[0]},${avg[1]},${avg[2]},${a2})`);

        video.style.boxShadow = shadows.join(', ');

      } else {
        // CORS fallback — animated ambient glow
        const t = Date.now() / 3000;
        const hue1 = (Math.sin(t) * 30 + 220) | 0;
        const hue2 = (Math.sin(t + 2) * 30 + 30) | 0;
        const a = (intensity * 0.4).toFixed(2);

        video.style.boxShadow = `
          0 0 ${blur}px ${spread}px hsla(${hue1},40%,55%,${a}),
          0 0 ${blur * 2}px ${spread * 1.5}px hsla(${hue2},40%,50%,${(intensity * 0.15).toFixed(2)})
        `;
      }

      // Smooth transition
      video.style.transition = `box-shadow ${auraState.smooth / 100 * 0.8 + 0.1}s ease`;
    },

    /* --- Animation loop --- */
    startLoop() {
      if (this.rafId) return;

      const tick = () => {
        this.rafId = requestAnimationFrame(tick);
        const now = Date.now();
        if (now - this.lastUpdate < 80) return; // ~12fps sampling
        this.lastUpdate = now;

        if (!STATE?.aura?.enabled) return;

        document.querySelectorAll('video').forEach(v => {
          if (v.readyState >= 2 && !v.paused) {
            this.updateGlow(v, STATE.aura);
          }
        });
      };
      tick();
    },

    stopLoop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    },

    /* --- Apply / remove --- */
    apply(a) {
      if (a.enabled) {
        document.querySelectorAll('video').forEach(v => this.wrapVideo(v));
        this.startLoop();
      } else {
        this.stopLoop();
        document.querySelectorAll('video').forEach(v => {
          v.style.boxShadow = '';
          v.style.transition = '';
        });
      }
    },

    init() {
      // Watch for new videos
      new MutationObserver(() => {
        if (STATE?.aura?.enabled) {
          document.querySelectorAll('video').forEach(v => this.wrapVideo(v));
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  };


  /* ========================================================
   *  ██  MODULE: PHANTOM — Cursor Particle Trails
   *
   *  Full-viewport canvas overlay with pointer-events: none.
   *  Supports 4 trail types:
   *    particles — dots that drift and fade
   *    glow      — soft radial circles
   *    trail     — connected ribbon
   *    stars     — twinkling star shapes
   * ======================================================== */

  const PHANTOM = {
    CANVAS_ID: 'cortex-phantom-canvas',
    canvas: null,
    ctx: null,
    particles: [],
    mouse: { x: -100, y: -100 },
    prevMouse: { x: -100, y: -100 },
    rafId: null,
    tracking: false,

    createCanvas() {
      if (this.canvas) return;
      this.canvas = document.createElement('canvas');
      this.canvas.id = this.CANVAS_ID;
      Object.assign(this.canvas.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: '2147483646',
        opacity: '1'
      });
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      document.documentElement.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      window.addEventListener('resize', () => {
        if (this.canvas) {
          this.canvas.width = window.innerWidth;
          this.canvas.height = window.innerHeight;
        }
      });
    },

    removeCanvas() {
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
        this.ctx = null;
      }
    },

    startTracking() {
      if (this.tracking) return;
      this.tracking = true;
      document.addEventListener('mousemove', this._onMove);
    },

    stopTracking() {
      this.tracking = false;
      document.removeEventListener('mousemove', this._onMove);
    },

    _onMove(e) {
      PHANTOM.prevMouse.x = PHANTOM.mouse.x;
      PHANTOM.prevMouse.y = PHANTOM.mouse.y;
      PHANTOM.mouse.x = e.clientX;
      PHANTOM.mouse.y = e.clientY;

      if (!STATE?.phantom?.enabled) return;
      const p = STATE.phantom;

      // Spawn particles
      const speed = Math.hypot(
        PHANTOM.mouse.x - PHANTOM.prevMouse.x,
        PHANTOM.mouse.y - PHANTOM.prevMouse.y
      );

      const count = Math.min(3, Math.max(1, Math.ceil(speed / 15)));
      for (let i = 0; i < count; i++) {
        PHANTOM.particles.push({
          x: e.clientX + (Math.random() - 0.5) * 4,
          y: e.clientY + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5 - 0.3,
          life: 1.0,
          size: p.size * (0.6 + Math.random() * 0.8),
          rotation: Math.random() * Math.PI * 2
        });
      }

      // Cap particle count
      const maxParts = p.length * 8;
      if (PHANTOM.particles.length > maxParts) {
        PHANTOM.particles = PHANTOM.particles.slice(-maxParts);
      }
    },

    /* --- Render functions per type --- */
    renderParticles(ctx, parts, opacity) {
      parts.forEach(p => {
        const alpha = p.life * (opacity / 100);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.fill();
      });
    },

    renderGlow(ctx, parts, opacity) {
      parts.forEach(p => {
        const alpha = p.life * (opacity / 100) * 0.5;
        const r = p.size * 4;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });
    },

    renderTrail(ctx, parts, opacity) {
      if (parts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(parts[0].x, parts[0].y);
      for (let i = 1; i < parts.length; i++) {
        const prev = parts[i - 1];
        const curr = parts[i];
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${(opacity / 100 * 0.7).toFixed(3)})`;
      ctx.lineWidth = parts[0]?.size * 1.5 || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    },

    renderStars(ctx, parts, opacity) {
      parts.forEach(p => {
        const alpha = p.life * (opacity / 100);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation + p.life * 2);
        ctx.beginPath();
        const spikes = 4;
        const outerR = p.size * 2.5;
        const innerR = p.size * 0.8;
        for (let s = 0; s < spikes * 2; s++) {
          const r = s % 2 === 0 ? outerR : innerR;
          const angle = (s / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          const sx = Math.cos(angle) * r;
          const sy = Math.sin(angle) * r;
          s === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.fill();
        ctx.restore();
      });
    },

    /* --- Animation loop --- */
    startLoop() {
      if (this.rafId) return;
      const tick = () => {
        this.rafId = requestAnimationFrame(tick);
        if (!this.ctx || !STATE?.phantom?.enabled) return;

        const p = STATE.phantom;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Decay
        const fadeRate = (p.fade / 100) * 0.04 + 0.005;
        this.particles.forEach(pt => {
          pt.life -= fadeRate;
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.02; // subtle gravity
        });
        this.particles = this.particles.filter(pt => pt.life > 0);

        // Render
        switch (p.type) {
          case 'glow':      this.renderGlow(ctx, this.particles, p.opacity); break;
          case 'trail':     this.renderTrail(ctx, this.particles, p.opacity); break;
          case 'stars':     this.renderStars(ctx, this.particles, p.opacity); break;
          default:          this.renderParticles(ctx, this.particles, p.opacity); break;
        }
      };
      tick();
    },

    stopLoop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    },

    apply(p) {
      if (p.enabled) {
        this.createCanvas();
        this.startTracking();
        this.startLoop();
      } else {
        this.stopLoop();
        this.stopTracking();
        this.removeCanvas();
        this.particles = [];
      }
    },

    init() {
      // Bind _onMove context
      this._onMove = this._onMove.bind ? this._onMove.bind(this) : this._onMove;
    }
  };


  /* ========================================================
   *  ██  MODULE: GHOST MODE — Privacy Shield
   *
   *  Content-script–side protections:
   *    - Canvas fingerprint noise injection
   *    - WebGL renderer/vendor spoofing
   *    - WebRTC IP leak prevention
   *    - UTM parameter stripping
   *    - Known tracker script removal
   * ======================================================== */

  const GHOST = {
    applied: false,

    /* --- Canvas fingerprint noise --- */
    protectCanvas() {
      if (this._canvasPatched) return;
      this._canvasPatched = true;

      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

      // Inject subtle noise into canvas reads
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] ^= 1;     // tiny R noise
              imageData.data[i + 1] ^= 1; // tiny G noise
            }
            ctx.putImageData(imageData, 0, 0);
          } catch (e) { /* tainted canvas */ }
        }
        return origToDataURL.apply(this, args);
      };

      HTMLCanvasElement.prototype.toBlob = function (cb, ...args) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] ^= 1;
            }
            ctx.putImageData(imageData, 0, 0);
          } catch (e) { /* tainted */ }
        }
        return origToBlob.call(this, cb, ...args);
      };
    },

    /* --- WebRTC leak prevention --- */
    protectWebRTC() {
      if (this._webrtcPatched) return;
      this._webrtcPatched = true;

      // Block RTCPeerConnection from leaking local IPs
      const origRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!origRTC) return;

      const OrigRTC = origRTC;
      window.RTCPeerConnection = function (config, constraints) {
        // Force all ICE through relay (TURN) only — prevents local IP leak
        if (config && config.iceServers) {
          config.iceTransportPolicy = 'relay';
        }
        return new OrigRTC(config, constraints);
      };
      window.RTCPeerConnection.prototype = OrigRTC.prototype;

      if (window.webkitRTCPeerConnection) {
        window.webkitRTCPeerConnection = window.RTCPeerConnection;
      }
    },

    /* --- WebGL fingerprint spoofing --- */
    protectWebGL() {
      if (this._webglPatched) return;
      this._webglPatched = true;

      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
        // UNMASKED_VENDOR_WEBGL
        if (param === 0x9245) return 'Generic GPU Vendor';
        // UNMASKED_RENDERER_WEBGL
        if (param === 0x9246) return 'Generic GPU Renderer';
        return origGetParam.call(this, param);
      };

      if (typeof WebGL2RenderingContext !== 'undefined') {
        const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (param) {
          if (param === 0x9245) return 'Generic GPU Vendor';
          if (param === 0x9246) return 'Generic GPU Renderer';
          return origGetParam2.call(this, param);
        };
      }
    },

    /* --- Strip UTM parameters --- */
    stripUTM() {
      const url = new URL(window.location.href);
      const utmParams = ['utm_source', 'utm_medium', 'utm_campaign',
        'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid',
        'mc_cid', 'mc_eid', 'msclkid', 'twclid'];
      let changed = false;

      utmParams.forEach(p => {
        if (url.searchParams.has(p)) {
          url.searchParams.delete(p);
          changed = true;
        }
      });

      if (changed) {
        window.history.replaceState({}, '', url.toString());
        try {
          chrome.runtime.sendMessage({ type: 'GHOST_STAT_UPDATE', stat: 'utm', count: 1 });
        } catch (_) {}
      }
    },

    /* --- Remove known tracking scripts --- */
    removeTrackers() {
      const trackerDomains = [
        'google-analytics.com', 'googletagmanager.com',
        'facebook.net', 'connect.facebook.net',
        'doubleclick.net', 'hotjar.com',
        'mixpanel.com', 'segment.com',
        'fullstory.com', 'mouseflow.com',
        'clarity.ms', 'mc.yandex.ru'
      ];

      let count = 0;
      document.querySelectorAll('script[src], iframe[src]').forEach(el => {
        const src = el.getAttribute('src') || '';
        if (trackerDomains.some(d => src.includes(d))) {
          el.remove();
          count++;
        }
      });

      if (count > 0) {
        try {
          chrome.runtime.sendMessage({
            type: 'GHOST_STAT_UPDATE', stat: 'trackers', count
          });
        } catch (_) {}
      }

      return count;
    },

    /* --- Apply all protections --- */
    apply(g) {
      if (g.enabled) {
        if (g.fingerprint) { this.protectCanvas(); this.protectWebGL(); }
        if (g.webrtc)      this.protectWebRTC();
        if (g.utm)         this.stripUTM();
        if (g.trackers)    this.removeTrackers();
        this.applied = true;
      }
    },

    init() {
      // Observe DOM for dynamically injected trackers
      new MutationObserver(() => {
        if (STATE?.ghost?.enabled && STATE?.ghost?.trackers) {
          this.removeTrackers();
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  };


  /* ========================================================
   *  ██  MODULE: RADAR — Page Tech X-Ray
   *
   *  Detects: frameworks, fonts, colors, meta info, perf.
   *  Triggered on-demand via message from popup.
   * ======================================================== */

  const RADAR = {

    scan() {
      return {
        frameworks: this.detectFrameworks(),
        fonts:      this.detectFonts(),
        colors:     this.extractColors(),
        meta:       this.extractMeta(),
        performance: this.measurePerf()
      };
    },

    detectFrameworks() {
      const found = [];
      const w = window;
      const d = document;

      // React
      if (d.querySelector('[data-reactroot]') || d.querySelector('[data-reactid]') ||
          w.__REACT_DEVTOOLS_GLOBAL_HOOK__ || d.querySelector('#__next')) {
        found.push({ name: 'React', highlight: true });
      }

      // Next.js
      if (w.__NEXT_DATA__ || d.querySelector('#__next')) {
        found.push({ name: 'Next.js', highlight: true });
      }

      // Vue
      if (w.__VUE__ || d.querySelector('[data-v-]') ||
          w.__vue_app__ || d.querySelector('#__nuxt')) {
        found.push({ name: 'Vue.js', highlight: true });
      }

      // Nuxt
      if (w.__NUXT__ || d.querySelector('#__nuxt')) {
        found.push({ name: 'Nuxt', highlight: false });
      }

      // Angular
      if (w.ng || d.querySelector('[ng-version]') ||
          d.querySelector('[_nghost]') || d.querySelector('app-root')) {
        found.push({ name: 'Angular', highlight: true });
      }

      // Svelte
      if (d.querySelector('[class*="svelte-"]')) {
        found.push({ name: 'Svelte', highlight: true });
      }

      // jQuery
      if (w.jQuery || w.$?.fn?.jquery) {
        const ver = w.jQuery?.fn?.jquery || w.$?.fn?.jquery || '';
        found.push({ name: `jQuery ${ver}`, highlight: false });
      }

      // Tailwind
      const allClasses = Array.from(d.querySelectorAll('[class]'))
        .slice(0, 200)
        .flatMap(el => Array.from(el.classList));
      const twPattern = /^(flex|grid|p-|m-|text-|bg-|w-|h-|rounded|shadow|border-|gap-)/;
      const twMatches = allClasses.filter(c => twPattern.test(c));
      if (twMatches.length > 15) {
        found.push({ name: 'Tailwind CSS', highlight: false });
      }

      // Bootstrap
      if (d.querySelector('.container .row .col') ||
          d.querySelector('[class*="btn-primary"]') ||
          d.querySelector('.navbar')) {
        const bs = d.querySelector('link[href*="bootstrap"]');
        found.push({ name: 'Bootstrap', highlight: false });
      }

      // WordPress
      if (d.querySelector('meta[name="generator"][content*="WordPress"]') ||
          d.querySelector('link[href*="wp-content"]')) {
        found.push({ name: 'WordPress', highlight: false });
      }

      // Webflow
      if (d.querySelector('html[data-wf-site]') || w.Webflow) {
        found.push({ name: 'Webflow', highlight: false });
      }

      // GSAP
      if (w.gsap || w.TweenMax || w.TweenLite) {
        found.push({ name: 'GSAP', highlight: false });
      }

      // Three.js
      if (w.THREE) {
        found.push({ name: 'Three.js', highlight: false });
      }

      return found;
    },

    detectFonts() {
      const fontSet = new Set();
      const elements = document.querySelectorAll('body, body *');
      const sampled = Array.from(elements).slice(0, 300);

      sampled.forEach(el => {
        const family = getComputedStyle(el).fontFamily;
        family.split(',').forEach(f => {
          const cleaned = f.trim().replace(/['"]/g, '');
          if (cleaned && !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
            'system-ui', '-apple-system', 'BlinkMacSystemFont'].includes(cleaned)) {
            fontSet.add(cleaned);
          }
        });
      });

      return Array.from(fontSet).slice(0, 12);
    },

    extractColors() {
      const colorMap = {};
      const elements = document.querySelectorAll('body, body *');
      const sampled = Array.from(elements).slice(0, 200);

      sampled.forEach(el => {
        const style = getComputedStyle(el);
        [style.backgroundColor, style.color, style.borderColor].forEach(c => {
          if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return;
          const hex = this.rgbToHex(c);
          if (hex && hex !== '#000000' && hex !== '#ffffff') {
            colorMap[hex] = (colorMap[hex] || 0) + 1;
          }
        });
      });

      return Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([hex]) => hex);
    },

    rgbToHex(rgb) {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const [, r, g, b] = match.map(Number);
      return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    },

    extractMeta() {
      const meta = {};
      const title = document.title;
      if (title) meta['Title'] = title.slice(0, 60);

      const desc = document.querySelector('meta[name="description"]');
      if (desc) meta['Description'] = (desc.content || '').slice(0, 80);

      const charset = document.characterSet;
      if (charset) meta['Charset'] = charset;

      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) meta['Viewport'] = (viewport.content || '').slice(0, 60);

      const lang = document.documentElement.lang;
      if (lang) meta['Language'] = lang;

      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) meta['Canonical'] = (canonical.href || '').slice(0, 60);

      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) meta['OG Title'] = (ogTitle.content || '').slice(0, 50);

      // Count elements
      meta['DOM Nodes'] = document.querySelectorAll('*').length.toLocaleString();
      meta['Scripts'] = document.querySelectorAll('script').length.toString();
      meta['Stylesheets'] = document.querySelectorAll('link[rel="stylesheet"]').length.toString();
      meta['Images'] = document.querySelectorAll('img').length.toString();

      return meta;
    },

    measurePerf() {
      const perf = {};

      if (window.performance) {
        const timing = performance.timing || {};
        const nav = performance.getEntriesByType('navigation')[0];

        if (nav) {
          perf['DOM Load'] = Math.round(nav.domContentLoadedEventEnd - nav.startTime) + 'ms';
          perf['Full Load'] = Math.round(nav.loadEventEnd - nav.startTime) + 'ms';
          perf['TTFB'] = Math.round(nav.responseStart - nav.startTime) + 'ms';
          perf['DOM Interactive'] = Math.round(nav.domInteractive - nav.startTime) + 'ms';
        } else if (timing.navigationStart) {
          perf['DOM Load'] = Math.round(
            (timing.domContentLoadedEventEnd || 0) - timing.navigationStart
          ) + 'ms';
          perf['Full Load'] = Math.round(
            (timing.loadEventEnd || 0) - timing.navigationStart
          ) + 'ms';
        }

        // Resource count & size
        const resources = performance.getEntriesByType('resource');
        perf['Resources'] = resources.length.toString();
        const totalSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        perf['Transfer Size'] = (totalSize / 1024).toFixed(0) + ' KB';
      }

      // Connection
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn) {
        if (conn.effectiveType) perf['Connection'] = conn.effectiveType.toUpperCase();
        if (conn.downlink) perf['Bandwidth'] = conn.downlink + ' Mbps';
      }

      return perf;
    }
  };


  /* ========================================================
   *  ██  MODULE: NIGHTFALL — Intelligent Dark Mode
   *
   *  Two algorithms:
   *    intelligent — CSS filter with smart media exclusion
   *    invert      — full inversion + hue-rotate correction
   *
   *  Both preserve images, video, canvas, SVG.
   * ======================================================== */

  const NIGHTFALL = {
    STYLE_ID: 'cortex-nightfall-styles',
    applied: false,

    buildCSS(n) {
      if (!n.enabled) return '';

      const brightness = (n.brightness / 100).toFixed(3);
      const contrast = (n.contrast / 100).toFixed(3);
      const warmth = n.warmth / 100;
      const sepia = (warmth * 0.3).toFixed(3);

      const mediaSelectors = n.excludeImg
        ? `img, video, canvas, svg, picture, [style*="background-image"],
           iframe, embed, object, .emoji, [role="img"]`
        : `video, canvas`;

      if (n.mode === 'intelligent') {
        return `
          /* NIGHTFALL — Intelligent Dark Mode */
          html {
            filter: invert(0.92) hue-rotate(180deg)
                    brightness(${brightness})
                    contrast(${contrast})
                    sepia(${sepia}) !important;
            background-color: #111 !important;
          }

          /* Un-invert media to preserve original appearance */
          ${mediaSelectors} {
            filter: invert(1) hue-rotate(180deg) !important;
          }

          /* Fix specific elements */
          [style*="background-image"] {
            filter: invert(1) hue-rotate(180deg) brightness(1.1) !important;
          }

          /* Reduce harshness on already-dark elements */
          [data-theme="dark"],
          [data-mode="dark"],
          .dark-theme,
          .dark-mode,
          .theme-dark {
            filter: none !important;
          }

          /* Smooth transition */
          * {
            transition: background-color 0.15s ease, color 0.15s ease !important;
          }
        `;
      }

      // Invert mode — simpler, more aggressive
      return `
        /* NIGHTFALL — Invert Mode */
        html {
          filter: invert(1) hue-rotate(180deg)
                  brightness(${brightness})
                  contrast(${contrast})
                  sepia(${sepia}) !important;
        }

        ${mediaSelectors} {
          filter: invert(1) hue-rotate(180deg) !important;
        }
      `;
    },

    apply(n) {
      let el = document.getElementById(this.STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = this.STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }

      el.textContent = this.buildCSS(n);
      this.applied = n.enabled;
    },

    init() {
      // Nothing special needed
    }
  };


  /* ========================================================
   *  ██  DISPLAY DETECTION
   * ======================================================== */

  function detectDisplay() {
    return {
      hdr: window.matchMedia('(dynamic-range: high)').matches,
      p3: window.matchMedia('(color-gamut: p3)').matches,
      rec2020: window.matchMedia('(color-gamut: rec2020)').matches
    };
  }


  /* ========================================================
   *  ██  MESSAGE HANDLER
   * ======================================================== */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    /* Apply state from popup or background */
    if (msg.type === 'CORTEX_APPLY') {
      STATE = msg.state;

      const m = msg.module;
      // Apply specific module or all
      if (!m || m === 'hdr')       HDR.apply(STATE.hdr);
      if (!m || m === 'aura')      AURA.apply(STATE.aura);
      if (!m || m === 'phantom')   PHANTOM.apply(STATE.phantom);
      if (!m || m === 'ghost')     GHOST.apply(STATE.ghost);
      if (!m || m === 'nightfall') NIGHTFALL.apply(STATE.nightfall);

      const videoCount = document.querySelectorAll('video').length;
      sendResponse({ ok: true, videoCount });
      return true;
    }

    /* Status query from popup */
    if (msg.type === 'CORTEX_STATUS') {
      const videoCount = document.querySelectorAll('video').length;
      const display = detectDisplay();
      sendResponse({
        videoCount,
        display,
        currentState: STATE,
        ghostStats: STATE?.ghost?.stats
      });
      return true;
    }

    /* Radar scan */
    if (msg.type === 'CORTEX_RADAR_SCAN') {
      try {
        const results = RADAR.scan();
        sendResponse(results);
      } catch (e) {
        sendResponse({ error: e.message });
      }
      return true;
    }

    /* Ping */
    if (msg.type === 'PING') {
      sendResponse({ ok: true, frame: FRAME_ID });
      return true;
    }

    return true;
  });


  /* ========================================================
   *  ██  INITIALIZATION
   * ======================================================== */

  function init() {
    // Load stored state and apply
    chrome.storage.local.get('cortex', data => {
      STATE = data.cortex || null;
      if (!STATE) return;

      // Init all modules
      HDR.init();
      AURA.init();
      PHANTOM.init();
      GHOST.init();
      NIGHTFALL.init();

      // Apply enabled modules
      if (STATE.hdr?.enabled)       HDR.apply(STATE.hdr);
      if (STATE.aura?.enabled)      AURA.apply(STATE.aura);
      if (STATE.phantom?.enabled)   PHANTOM.apply(STATE.phantom);
      if (STATE.ghost?.enabled)     GHOST.apply(STATE.ghost);
      if (STATE.nightfall?.enabled) NIGHTFALL.apply(STATE.nightfall);
    });
  }

  // Wait for DOM
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();