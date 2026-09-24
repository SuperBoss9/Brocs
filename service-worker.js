/**
 * Brocs service worker — merges main-frame network signals into per-tab UI.
 */

import { classifyIp, ipVersionLabel } from "./lib/ip.js";
import { normalizeProtocol } from "./lib/protocol.js";
import { parseProxySettings, PROXY_STATUS } from "./lib/proxy.js";
import { buildBadgeText, buildTooltip } from "./lib/ui.js";
import { renderStatusIcons } from "./lib/icon.js";

const DEBUG = false;

const STORAGE_KEY = "tabStates";

const MSG = Object.freeze({
  PROTOCOL: "brocs.protocol"
});

const RESTRICTED_SCHEMES = [
  "browser:",
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "file:",
  "devtools:",
  "view-source:"
];

/** @type {Map<number, object>} */
const tabStates = new Map();

/** @type {object|null} */
let cachedProxy = null;

let persistTimer = null;
let statesHydrated = false;

function log(...args) {
  if (DEBUG) {
    console.debug("[Brocs]", ...args);
  }
}

function createEmptyState(tabId) {
  return {
    tabId,
    url: null,
    host: null,
    remoteIp: null,
    ipVersion: null,
    rawProtocol: null,
    httpVersion: null,
    httpLabel: "Unknown",
    badgeHttp: "H?",
    transport: null,
    proxyStatus: PROXY_STATUS.UNKNOWN,
    proxyMode: null,
    proxyDisplay: "?",
    proxyIconKey: "unknown",
    proxyDetails: [],
    statusCode: null,
    fromCache: false,
    loading: false,
    unavailable: false,
    updatedAt: Date.now()
  };
}

function isRestrictedUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }
  const lower = url.toLowerCase();
  return RESTRICTED_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

function hostFromUrl(url) {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

function sameDocument(urlA, urlB) {
  if (!urlA || !urlB) {
    return false;
  }
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return urlA === urlB;
  }
}

async function ensureLoaded() {
  if (statesHydrated) {
    return;
  }
  statesHydrated = true;
  try {
    const data = await chrome.storage.session.get(STORAGE_KEY);
    const stored = data[STORAGE_KEY];
    if (stored && typeof stored === "object") {
      for (const [key, value] of Object.entries(stored)) {
        const tabId = Number(key);
        if (Number.isFinite(tabId) && value && typeof value === "object") {
          tabStates.set(tabId, value);
        }
      }
      log("restored tab states:", tabStates.size);
    }
  } catch (error) {
    log("storage restore failed", error);
  }
}

function schedulePersist() {
  if (persistTimer != null) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStates();
  }, 100);
}

async function persistStates() {
  const obj = {};
  for (const [tabId, state] of tabStates.entries()) {
    obj[String(tabId)] = state;
  }
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: obj });
  } catch (error) {
    log("storage persist failed", error);
  }
}

function getState(tabId) {
  let state = tabStates.get(tabId);
  if (!state) {
    state = createEmptyState(tabId);
    tabStates.set(tabId, state);
  }
  return state;
}

function resetState(tabId, { loading = true, unavailable = false } = {}) {
  const state = createEmptyState(tabId);
  state.loading = loading;
  state.unavailable = unavailable;
  tabStates.set(tabId, state);
  schedulePersist();
  return state;
}

/**
 * Update action icon, badge, and tooltip for a tab.
 * @param {number} tabId
 * @param {object} [state]
 */
async function updateActionUi(tabId, state) {
  const current = state || tabStates.get(tabId) || createEmptyState(tabId);
  const statusText = buildBadgeText(current);
  const title = buildTooltip(current);

  try {
    const imageData = renderStatusIcons(statusText, current.proxyIconKey);
    await chrome.action.setIcon({ tabId, imageData });
  } catch (error) {
    log("setIcon failed", tabId, error);
  }

  // Status is drawn on the icon; keep the native corner badge empty.
  try {
    await chrome.action.setBadgeText({ tabId, text: "" });
  } catch (error) {
    log("clearBadge failed", tabId, error);
  }

  try {
    await chrome.action.setTitle({ tabId, title });
  } catch (error) {
    log("setTitle failed", tabId, error);
  }
}

async function refreshProxyInto(state) {
  const proxy = await getProxySnapshot();
  state.proxyStatus = proxy.proxyStatus;
  state.proxyMode = proxy.proxyMode;
  state.proxyDisplay = proxy.proxyDisplay;
  state.proxyIconKey = proxy.proxyIconKey;
  state.proxyDetails = proxy.proxyDetails;
  state.updatedAt = Date.now();
}

async function getProxySnapshot() {
  if (cachedProxy) {
    return cachedProxy;
  }
  try {
    const details = await chrome.proxy.settings.get({});
    cachedProxy = parseProxySettings(details);
    log("proxy mode:", cachedProxy.proxyMode || cachedProxy.proxyStatus);
    return cachedProxy;
  } catch (error) {
    log("proxy.settings.get failed", error);
    cachedProxy = parseProxySettings(null);
    return cachedProxy;
  }
}

function invalidateProxyCache() {
  cachedProxy = null;
}

async function markUnavailable(tabId) {
  const state = resetState(tabId, { loading: false, unavailable: true });
  state.proxyIconKey = "unknown";
  state.proxyDisplay = "?";
  state.proxyStatus = PROXY_STATUS.UNKNOWN;
  await updateActionUi(tabId, state);
  schedulePersist();
}

async function beginNavigation(tabId, url) {
  if (isRestrictedUrl(url)) {
    await markUnavailable(tabId);
    return;
  }

  const state = resetState(tabId, { loading: true, unavailable: false });
  if (url) {
    state.url = url;
    state.host = hostFromUrl(url);
  }
  await refreshProxyInto(state);
  await updateActionUi(tabId, state);
  log("navigation reset", tabId, url || "(no url)");
}

async function applyMainFrameResponse(details) {
  if (details.type !== "main_frame" || details.tabId < 0) {
    return;
  }

  await ensureLoaded();

  if (isRestrictedUrl(details.url)) {
    await markUnavailable(details.tabId);
    return;
  }

  const state = getState(details.tabId);
  state.unavailable = false;
  state.loading = false;
  state.url = details.url || state.url;
  state.host = hostFromUrl(state.url) || state.host;
  state.statusCode = details.statusCode ?? state.statusCode;
  state.fromCache = Boolean(details.fromCache);

  if (details.ip) {
    state.remoteIp = details.ip;
    state.ipVersion = classifyIp(details.ip);
    log("main_frame response", details.tabId);
    log(`${ipVersionLabel(state.ipVersion)}:`, details.ip);
  } else {
    // Do not keep a previous site's IP.
    state.remoteIp = null;
    state.ipVersion = null;
    log(
      "main_frame response without ip",
      details.tabId,
      "cache:",
      state.fromCache
    );
  }

  await refreshProxyInto(state);
  await updateActionUi(details.tabId, state);
  schedulePersist();
}

async function applyProtocolMessage(sender, payload) {
  const tabId = sender?.tab?.id;
  if (tabId == null || tabId < 0) {
    return;
  }

  await ensureLoaded();
  const state = getState(tabId);

  if (state.unavailable) {
    return;
  }

  const senderUrl = sender.tab?.url || payload?.url || null;
  if (senderUrl && state.url && !sameDocument(senderUrl, state.url)) {
    log("ignore stale protocol message", tabId);
    return;
  }

  const normalized = normalizeProtocol(payload?.rawProtocol);
  state.rawProtocol = normalized.rawProtocol;
  state.httpVersion = normalized.httpVersion;
  state.httpLabel = normalized.httpLabel;
  state.badgeHttp = normalized.badgeHttp;
  state.transport = normalized.transport;
  state.loading = false;
  state.updatedAt = Date.now();

  if (senderUrl) {
    state.url = senderUrl;
    state.host = hostFromUrl(senderUrl) || state.host;
  }

  log("protocol:", normalized.rawProtocol || "(none)");

  await refreshProxyInto(state);
  await updateActionUi(tabId, state);
  schedulePersist();
}

async function syncActiveTab(tabId) {
  await ensureLoaded();

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }

  const url = tab.url || tab.pendingUrl || null;

  if (isRestrictedUrl(url)) {
    await markUnavailable(tabId);
    return;
  }

  // Privileged pages often omit url without a matching host permission.
  if (!url) {
    await markUnavailable(tabId);
    return;
  }

  if (!/^https?:/i.test(url)) {
    await markUnavailable(tabId);
    return;
  }

  let state = tabStates.get(tabId);
  if (!state) {
    state = createEmptyState(tabId);
    state.url = url;
    state.host = hostFromUrl(url);
    state.loading = true;
    tabStates.set(tabId, state);
    await refreshProxyInto(state);
    schedulePersist();
  }

  await updateActionUi(tabId, state);
}

// --- Event listeners ---

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== "main_frame" || details.tabId < 0) {
      return;
    }
    beginNavigation(details.tabId, details.url);
  },
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }
);

chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    applyMainFrameResponse(details);
  },
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== MSG.PROTOCOL) {
    return;
  }
  applyProtocolMessage(sender, message).then(() => {
    sendResponse({ ok: true });
  });
  return true;
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  syncActiveTab(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  schedulePersist();
  log("tab removed", tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url || null;

  if (url && isRestrictedUrl(url)) {
    markUnavailable(tabId);
    return;
  }

  if (changeInfo.status === "loading" && url && /^https?:/i.test(url)) {
    const existing = tabStates.get(tabId);
    if (!existing || existing.url !== url) {
      beginNavigation(tabId, url);
    }
  }
});

if (chrome.proxy?.settings?.onChange) {
  chrome.proxy.settings.onChange.addListener(() => {
    invalidateProxyCache();
    log("proxy settings changed");
    for (const [tabId, state] of tabStates.entries()) {
      if (state.unavailable) {
        continue;
      }
      refreshProxyInto(state).then(() => updateActionUi(tabId, state));
    }
    schedulePersist();
  });
}

chrome.runtime.onStartup.addListener(() => {
  ensureLoaded();
});

chrome.runtime.onInstalled.addListener(() => {
  ensureLoaded().then(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id != null) {
        await syncActiveTab(tab.id);
      }
    }
  });
});

log("service worker started");
