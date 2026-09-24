/**
 * HTTP protocol normalization from PerformanceNavigationTiming.nextHopProtocol.
 */

export const HTTP_VERSION = Object.freeze({
  H10: "1.0",
  H11: "1.1",
  H2: "2",
  H3: "3",
  UNKNOWN: null
});

export const TRANSPORT = Object.freeze({
  QUIC: "QUIC",
  NONE: null
});

/**
 * Normalize a raw nextHopProtocol value.
 * @param {string|null|undefined} rawProtocol
 * @returns {{
 *   rawProtocol: string|null,
 *   httpVersion: string|null,
 *   httpLabel: string,
 *   badgeHttp: string,
 *   transport: string|null
 * }}
 */
export function normalizeProtocol(rawProtocol) {
  if (rawProtocol == null || rawProtocol === "") {
    return {
      rawProtocol: null,
      httpVersion: HTTP_VERSION.UNKNOWN,
      httpLabel: "Unknown",
      badgeHttp: "H?",
      transport: TRANSPORT.NONE
    };
  }

  const raw = String(rawProtocol).trim();
  const lower = raw.toLowerCase();

  if (lower === "http/1.0") {
    return pack(raw, HTTP_VERSION.H10, "HTTP/1.0", "H10", TRANSPORT.NONE);
  }
  if (lower === "http/1.1") {
    return pack(raw, HTTP_VERSION.H11, "HTTP/1.1", "H11", TRANSPORT.NONE);
  }
  if (lower === "h2" || lower === "h2c") {
    return pack(raw, HTTP_VERSION.H2, "HTTP/2", "H2", TRANSPORT.NONE);
  }
  if (lower === "h3" || lower.startsWith("h3-") || lower.startsWith("h3/")) {
    return pack(raw, HTTP_VERSION.H3, "HTTP/3", "H3", TRANSPORT.QUIC);
  }

  return {
    rawProtocol: raw,
    httpVersion: HTTP_VERSION.UNKNOWN,
    httpLabel: `Unknown (${raw})`,
    badgeHttp: "H?",
    transport: TRANSPORT.NONE
  };
}

function pack(rawProtocol, httpVersion, httpLabel, badgeHttp, transport) {
  return {
    rawProtocol,
    httpVersion,
    httpLabel,
    badgeHttp,
    transport
  };
}
