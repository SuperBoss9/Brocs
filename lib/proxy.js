/**
 * Read-only proxy mode classification for Brocs.
 * Does not evaluate PAC or claim per-request routing for AUTO modes.
 */

export const PROXY_STATUS = Object.freeze({
  DIRECT: "direct",
  PROXY: "proxy",
  AUTO: "auto",
  UNKNOWN: "unknown"
});

export const PROXY_BADGE = Object.freeze({
  [PROXY_STATUS.DIRECT]: "D",
  [PROXY_STATUS.PROXY]: "P",
  [PROXY_STATUS.AUTO]: "A",
  [PROXY_STATUS.UNKNOWN]: "?"
});

export const PROXY_DISPLAY = Object.freeze({
  [PROXY_STATUS.DIRECT]: "DIRECT",
  [PROXY_STATUS.PROXY]: "PROXY",
  [PROXY_STATUS.AUTO]: "AUTO",
  [PROXY_STATUS.UNKNOWN]: "?"
});

/**
 * Parse chrome.proxy.settings.get() result into Brocs proxy state.
 * @param {chrome.types.ChromeSettingGetResultDetails|null|undefined} details
 * @returns {{
 *   proxyStatus: string,
 *   proxyMode: string|null,
 *   proxyDisplay: string,
 *   proxyIconKey: string,
 *   proxyDetails: string[]
 * }}
 */
export function parseProxySettings(details) {
  if (!details || !details.value || typeof details.value !== "object") {
    return unknownProxy();
  }

  const value = details.value;
  const mode = typeof value.mode === "string" ? value.mode : null;

  switch (mode) {
    case "direct":
      return {
        proxyStatus: PROXY_STATUS.DIRECT,
        proxyMode: "direct",
        proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.DIRECT],
        proxyIconKey: "direct",
        proxyDetails: []
      };

    case "fixed_servers":
      return {
        proxyStatus: PROXY_STATUS.PROXY,
        proxyMode: "fixed_servers",
        proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.PROXY],
        proxyIconKey: "proxy",
        proxyDetails: describeFixedServers(value.rules)
      };

    case "pac_script":
      return {
        proxyStatus: PROXY_STATUS.AUTO,
        proxyMode: "PAC",
        proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.AUTO],
        proxyIconKey: "auto",
        proxyDetails: ["Actual per-request proxy route: unknown"]
      };

    case "auto_detect":
      return {
        proxyStatus: PROXY_STATUS.AUTO,
        proxyMode: "auto_detect",
        proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.AUTO],
        proxyIconKey: "auto",
        proxyDetails: []
      };

    case "system":
      return {
        proxyStatus: PROXY_STATUS.AUTO,
        proxyMode: "system",
        proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.AUTO],
        proxyIconKey: "auto",
        proxyDetails: []
      };

    default:
      return {
        proxyStatus: PROXY_STATUS.UNKNOWN,
        proxyMode: mode,
        proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.UNKNOWN],
        proxyIconKey: "unknown",
        proxyDetails: []
      };
  }
}

/**
 * @param {chrome.proxy.ProxyRules|undefined} rules
 * @returns {string[]}
 */
function describeFixedServers(rules) {
  if (!rules || typeof rules !== "object") {
    return [];
  }

  const lines = [];
  const keys = [
    ["singleProxy", "Server"],
    ["proxyForHttp", "HTTP"],
    ["proxyForHttps", "HTTPS"],
    ["proxyForFtp", "FTP"],
    ["fallbackProxy", "Fallback"]
  ];

  for (const [key, label] of keys) {
    const server = formatProxyServer(rules[key]);
    if (server) {
      lines.push(`${label}: ${server}`);
    }
  }

  return lines;
}

/**
 * @param {chrome.proxy.ProxyServer|undefined} server
 * @returns {string|null}
 */
function formatProxyServer(server) {
  if (!server || typeof server !== "object" || !server.host) {
    return null;
  }

  const scheme = (server.scheme || "http").toUpperCase();
  const port = server.port != null ? `:${server.port}` : "";
  return `${scheme} ${server.host}${port}`;
}

function unknownProxy() {
  return {
    proxyStatus: PROXY_STATUS.UNKNOWN,
    proxyMode: null,
    proxyDisplay: PROXY_DISPLAY[PROXY_STATUS.UNKNOWN],
    proxyIconKey: "unknown",
    proxyDetails: []
  };
}
