# CORTEX

Yo. This is the README for the `CORTEX` Chrome extension — a weirdly cool browser command center with an HDR glow engine, ambilight vibes, cursor trails, privacy mode, a custom new tab dashboard, page radar, and smart dark mode.

It’s built to feel like a slick utility hub instead of a boring settings page. If you just want to get it running, skip to the install section. If you want the full breakdown, this thing has all the sauce.

---

## What this thing is

`CORTEX` is a browser extension that lives in your toolbar and also hijacks the new tab page with a custom dashboard.

It does a bunch of stuff:

- HDR-style video tonemapping on pages
- Ambilight glow around videos
- particle cursor trails for the vibe
- privacy shield mode
- page radar / tech x-ray
- an upgraded new tab with clock, greeting, quote, search, and background themes
- intelligent dark mode for websites
- keyboard shortcuts to toggle modules fast

Basically it’s a `command center` for browser look, feel, and privacy.

---

## What’s inside

### 1) Popup controller (`popup.html`, `popup.js`)

This is the main UI you open from the toolbar.

Modules in the popup:

- `HDR` — HDR display engine for web/video tone mapping
- `AURA` — ambilight-style glow effects
- `PHANTOM` — cursor particle trails
- `GHOST` — privacy/fingerprint shield controls
- `ZNTH` — new tab customization settings
- `RADAR` — page technology scanner
- `NIGHT` — dark mode / night mode controls

The popup UI has these controls:

- toggles for each module
- sliders for intensity, shadows, bloom, blur, etc.
- preset buttons for HDR
- module nav and status indicator

It stores state in `chrome.storage.local` and pushes updates to tabs and the background worker.

### 2) Content script (`content.js`)

This is the engine that injects effects into the currently loaded web pages.

It handles:

- HDR filter building and applying using SVG filters
- video tone mapping using ACES / Reinhard / Filmic curves
- bloom, clarity, vibrance, color temp, and XDR peak adjustments
- ambient glow / ambilight for media
- particle trails / ghost-like cursor effect
- privacy blockers and anti-fingerprint heuristics
- radar scanning for page tech info
- smart dark mode injection

It listens for messages from the popup/background and updates behavior on the fly.

### 3) Background service worker (`background.js`)

That thing keeps the badge synced and routes messages.

It does:

- install defaults when the extension loads
- show badge number based on active modules
- sync state to all tabs when something changes
- respond to keyboard commands
- handle toggle hotkeys for quick module switching

---

## Core features

### HDR display mode

- simulated HDR with tone map curves (`aces`, `reinhard`, `filmic`)
- XDR native mode option
- sliders for intensity, shadows, highlights, clarity, temp, vibrance, bloom
- presets: `cinematic`, `vivid`, `natural`, `neon`

### Aura

- ambient glow effect around video or page content
- intensity / blur / spread / smooth controls
- choose side settings for glow

### Phantom

- cursor particle trail mode
- length, size, opacity, fade controls
- type options for different visuals

### Ghost

- privacy shield toggles
- tracker blocking stats
- fingerprint / UTM / WebRTC / cookie toggles
- basic stealth mode behavior

### Zenith

- new tab replacement dashboard
- clock with 24h toggle
- greeting, quote, date display
- custom backgrounds
- search input and shortcuts

### Radar

- page tech radar / scan feature
- shows page framework and tech details
- UI lives in the popup panel

### Nightfall

- intelligent auto dark mode
- brightness / contrast / warmth controls
- exclude images toggle
- per-site mode support

---

## Keyboard shortcuts

This extension has built-in commands defined in `manifest.json`.

- `Alt+C` — toggle all modules
- `Alt+H` — toggle HDR
- `Alt+N` — toggle Nightfall dark mode
- `Alt+G` — toggle Ghost privacy mode

> On macOS the same keys are used.

---

## Install / load it locally

If you want to run this locally in Chrome/Edge:

1. open `chrome://extensions`
2. enable `Developer mode`
3. click `Load unpacked`
4. pick the `cortex-ch-extension` folder

Then pin the extension and open the popup to start messing with it.

---

## File breakdown

- `manifest.json` — extension config, permissions, hotkeys, new tab override
- `popup.html` / `popup.css` / `popup.js` — toolbar UI + module controls
- `newtab.html` / `newtab.css` / `newtab.js` — custom new tab dashboard
- `content.js` — page injection engine for effects and dark mode
- `background.js` — service worker, badge, commands, cross-tab sync
- `icons/` — extension icons

---

## Quick usage notes

- open the extension popup to enable modules
- use sliders and presets for HDR tuning
- turn on `NIGHT` for smart dark mode on websites
- enable `GHOST` for the browser privacy shield
- `ZNTH` is the new tab page config; it replaces the default Chrome new tab
- `RADAR` is for inspecting page tech
- press `Alt+C` to kill or revive all effects fast

---

## Notes / dev vibes

- state is saved in `chrome.storage.local` under `cortex`
- popup sends `CORTEX_STATE` and `CORTEX_APPLY` messages
- background broadcasts state changes to all tabs
- the content script identifies itself and injects filters dynamically
- you can customize owner name / branding text inside `popup.js`, `newtab.js`, and `background.js`

If you want to change the branding, look for `BRAND.ownerName` and `BRAND.extensionName` in the JS files.

---

## TL;DR

`CORTEX` is a chrome extension that turns your browser into a lowkey futuristic toolkit: HDR filter control, glow effects, privacy shield, page radar, and a custom new tab dashboard, all wrapped in a popup command center.

Use it if you want browser mods that feel like a hacky studio rig instead of a plain extension.
