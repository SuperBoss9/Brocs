/**
 * Brocs content script — reads nextHopProtocol for the main document only.
 */

(() => {
  const DEBUG = false;
  const MSG_TYPE = "brocs.protocol";

  function log(...args) {
    if (DEBUG) {
      console.debug("[Brocs]", ...args);
    }
  }

  function readProtocol() {
    try {
      const entries = performance.getEntriesByType("navigation");
      const navigation = entries && entries.length > 0 ? entries[0] : null;
      return navigation?.nextHopProtocol ?? null;
    } catch {
      return null;
    }
  }

  function sendProtocol(rawProtocol) {
    try {
      chrome.runtime.sendMessage(
        {
          type: MSG_TYPE,
          rawProtocol,
          url: location.href
        },
        () => {
          // Swallow lastError for restricted / closed contexts.
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // Ignore — page may be closing or extension reloading.
    }
  }

  function report() {
    const rawProtocol = readProtocol();
    log("protocol:", rawProtocol || "(none)");
    sendProtocol(rawProtocol);
  }

  function scheduleReports() {
    report();

    // Navigation timing may populate slightly after document_start.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", report, { once: true });
    }
    window.addEventListener("load", report, { once: true });

    // One short retry for late nextHopProtocol population.
    setTimeout(report, 0);
    setTimeout(report, 250);
  }

  scheduleReports();
})();
