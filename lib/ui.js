/**
 * Badge and tooltip formatting for the Brocs action button.
 */

import { ipVersionLabel, ipBadgeChar } from "./ip.js";
import { PROXY_STATUS } from "./proxy.js";

export const BADGE = Object.freeze({
  LOADING: "...",
  UNAVAILABLE: "-",
  UNKNOWN: "?"
});

/**
 * Build badge text (max 4 characters).
 * @param {object} state
 * @returns {string}
 */
export function buildBadgeText(state) {
  if (state.unavailable) {
    return BADGE.UNAVAILABLE;
  }

  const hasIpHint =
    state.ipVersion === 4 || state.ipVersion === 6 || state.remoteIp != null;
  const hasHttpHint = state.httpVersion != null || state.rawProtocol;

  if (!hasIpHint && !hasHttpHint) {
    return state.loading ? BADGE.LOADING : BADGE.UNKNOWN;
  }

  const ipChar = ipBadgeChar(state.ipVersion);
  const httpPart = state.badgeHttp || "H?";
  const combined = `${ipChar}${httpPart}`;
  return combined.length <= 4 ? combined : combined.slice(0, 4);
}

/**
 * Build per-tab tooltip title.
 * @param {object} state
 * @returns {string}
 */
export function buildTooltip(state) {
  if (state.unavailable) {
    return "Brocs — network information unavailable for this page";
  }

  const lines = ["Brocs — Browser Connection Status", ""];

  if (state.host) {
    lines.push(`Host: ${state.host}`);
  }

  if (state.remoteIp) {
    lines.push(`Remote IP: ${state.remoteIp}`);
  } else if (!state.loading) {
    lines.push("Remote IP: Unknown");
  }

  lines.push(`IP: ${ipVersionLabel(state.ipVersion)}`);
  lines.push(`HTTP: ${state.httpLabel || "Unknown"}`);

  if (state.transport) {
    lines.push(`Transport: ${state.transport}`);
  }

  lines.push(`Proxy: ${state.proxyDisplay || "?"}`);

  if (state.proxyMode && state.proxyStatus !== PROXY_STATUS.DIRECT) {
    lines.push(`Proxy mode: ${state.proxyMode}`);
  }

  if (Array.isArray(state.proxyDetails)) {
    for (const detail of state.proxyDetails) {
      lines.push(detail);
    }
  }

  if (state.statusCode != null) {
    lines.push(`Status: ${state.statusCode}`);
  }

  if (state.fromCache) {
    lines.push("Cache: yes");
  }

  if (state.loading && !state.remoteIp && state.httpVersion == null) {
    lines.push("Status: loading…");
  }

  return lines.join("\n");
}
