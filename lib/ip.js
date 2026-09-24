/**
 * IP family classification for Brocs.
 * Uses only the remote IP reported by chrome.webRequest — no DNS lookups.
 */

export const IP_VERSION = Object.freeze({
  V4: 4,
  V6: 6,
  UNKNOWN: null
});

export const IP_LABEL = Object.freeze({
  4: "IPv4",
  6: "IPv6",
  UNKNOWN: "Unknown"
});

/**
 * Classify a remote IP string as IPv4 or IPv6.
 * @param {string|null|undefined} ip
 * @returns {4|6|null}
 */
export function classifyIp(ip) {
  if (!ip || typeof ip !== "string") {
    return IP_VERSION.UNKNOWN;
  }

  const trimmed = ip.trim();
  if (!trimmed) {
    return IP_VERSION.UNKNOWN;
  }

  // IPv4-mapped IPv6 (:ffff:a.b.c.d) — treat as IPv4 for badge purposes.
  if (/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.test(trimmed)) {
    return IP_VERSION.V4;
  }

  if (trimmed.includes(":")) {
    return IP_VERSION.V6;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) {
    return IP_VERSION.V4;
  }

  return IP_VERSION.UNKNOWN;
}

/**
 * Human-readable IP family label.
 * @param {4|6|null|undefined} ipVersion
 * @returns {string}
 */
export function ipVersionLabel(ipVersion) {
  if (ipVersion === IP_VERSION.V4) {
    return IP_LABEL[4];
  }
  if (ipVersion === IP_VERSION.V6) {
    return IP_LABEL[6];
  }
  return IP_LABEL.UNKNOWN;
}

/**
 * Single-character badge prefix for IP family.
 * @param {4|6|null|undefined} ipVersion
 * @returns {"4"|"6"|"?"}
 */
export function ipBadgeChar(ipVersion) {
  if (ipVersion === IP_VERSION.V4) {
    return "4";
  }
  if (ipVersion === IP_VERSION.V6) {
    return "6";
  }
  return "?";
}
