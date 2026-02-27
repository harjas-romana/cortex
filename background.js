/* ==========================================================
 *  CORTEX — Background Service Worker
 *  Badge · Shortcuts · State Sync · Install Defaults
 * ========================================================== */

/* ----------------------------------------------------------
 *  ██  BRANDING — change your name here
 * ---------------------------------------------------------- */
const BRAND = {
  ownerName: 'YOUR NAME',
  extensionName: 'CORTEX',
  version: '2.0.0'
};
/* ---------------------------------------------------------- */

const DEFAULTS = {
  activeModule: 'hdr',
  hdr: {
    enabled: false, mode: 'simulated', toneMap: 'aces',
    intensity: 65, shadows: 12, highlights: -8,
    clarity: 30, temp: 3, vibrance: 22, bloom: 6,
    xdrPeak: 150, preset: 'cinematic'
  },
  aura: {
    enabled: false, intensity: 70, blur: 60,
    spread: 40, smooth: 50, sides: 'all'
  },
  phantom: {
    enabled: false, type: 'particles',
    length: 20, size: 3, opacity: 70, fade: 50
  },
  ghost: {
    enabled: false, trackers: true, utm: true,
    webrtc: true, fingerprint: true, cookies: false,
    stats: { trackers: 0, cookies: 0, utm: 0 }
  },
  zenith: {
    enabled: false, clock24: true, greeting: true,
    quote: true, date: true, bg: 'solid', clockStyle: 'minimal'
  },
  nightfall: {
    enabled: false, mode: 'intelligent', brightness: 92,
    contrast: 105, warmth: 10, excludeImg: true, perSite: true
  }
};

/* ----------------------------------------------------------
 *  ██  INSTALL / STARTUP
 * ---------------------------------------------------------- */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('cortex', data => {
    if (!data.cortex) {
      chrome.storage.local.set({ cortex: DEFAULTS });
    }
    updateBadge(data.cortex || DEFAULTS);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('cortex', data => {
    updateBadge(data.cortex || DEFAULTS);
  });
});

/* ----------------------------------------------------------
 *  ██  BADGE
 * ---------------------------------------------------------- */
function updateBadge(state) {
  const modules = ['hdr', 'aura', 'phantom', 'ghost', 'zenith', 'nightfall'];
  const active = modules.filter(m => state[m]?.enabled);

  if (active.length === 0) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: `${active.length}` });
    chrome.action.setBadgeBackgroundColor({ color: '#ffffff' });
    chrome.action.setBadgeTextColor({ color: '#000000' });
  }
}

/* ----------------------------------------------------------
 *  ██  MESSAGE ROUTING
 * ---------------------------------------------------------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CORTEX_STATE') {
    updateBadge(msg.state);
    broadcastToTabs(msg.state, msg.module);
    sendResponse({ ok: true });
  }

  if (msg.type === 'CORTEX_GET_STATE') {
    chrome.storage.local.get('cortex', data => {
      sendResponse({ state: data.cortex || DEFAULTS });
    });
    return true;
  }

  if (msg.type === 'GHOST_STAT_UPDATE') {
    chrome.storage.local.get('cortex', data => {
      const s = data.cortex || DEFAULTS;
      if (msg.stat && s.ghost.stats) {
        s.ghost.stats[msg.stat] = (s.ghost.stats[msg.stat] || 0) + (msg.count || 1);
        chrome.storage.local.set({ cortex: s });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  return true;
});

/* ----------------------------------------------------------
 *  ██  KEYBOARD SHORTCUTS
 * ---------------------------------------------------------- */
chrome.commands.onCommand.addListener(async (command) => {
  const data = await chrome.storage.local.get('cortex');
  const state = data.cortex || { ...DEFAULTS };

  switch (command) {
    case 'toggle-all': {
      const modules = ['hdr', 'aura', 'phantom', 'ghost', 'nightfall'];
      const anyActive = modules.some(m => state[m]?.enabled);
      modules.forEach(m => { if (state[m]) state[m].enabled = !anyActive; });
      break;
    }
    case 'toggle-hdr':
      state.hdr.enabled = !state.hdr.enabled;
      break;
    case 'toggle-nightfall':
      state.nightfall.enabled = !state.nightfall.enabled;
      break;
    case 'toggle-ghost':
      state.ghost.enabled = !state.ghost.enabled;
      break;
  }

  await chrome.storage.local.set({ cortex: state });
  updateBadge(state);
  broadcastToTabs(state);
});

/* ----------------------------------------------------------
 *  ██  BROADCAST TO ALL TABS
 * ---------------------------------------------------------- */
async function broadcastToTabs(state, moduleKey) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'CORTEX_APPLY',
        state,
        module: moduleKey
      });
    } catch (_) {}
  }
}