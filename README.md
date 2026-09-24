# Browser Connection Status (Brocs)

**Brocs** is a Manifest V3 browser extension that shows the **main document** connection of the current tab in real time:

- IPv4 or IPv6
- HTTP/1.0, HTTP/1.1, HTTP/2, or HTTP/3
- Browser proxy configuration mode (direct / fixed proxy / auto)
- Remote IP of the main frame (when the browser reports it)

**Version:** `0.1.0`

Primary target: **Yandex Browser** and other Chromium-compatible browsers.

Brocs works **fully offline**. It does not call external APIs and does not use Native Messaging, packet capture, or DevTools Protocol.

> Brocs does not transmit browsing or network information anywhere.

---

## What you see on the toolbar button

Brocs draws status **on the toolbar icon** (no popup in v0.1.0). The native corner badge is unused so the text can be larger and centered.

### Status text (IP + HTTP)

| Text | Meaning |
|------:|---------|
| `6H3` | IPv6 + HTTP/3 |
| `4H2` | IPv4 + HTTP/2 |
| `6H11` | IPv6 + HTTP/1.1 |
| `4H11` | IPv4 + HTTP/1.1 |
| `4H10` | IPv4 + HTTP/1.0 |
| `6H10` | IPv6 + HTTP/1.0 |
| `?H3` | Unknown IP + HTTP/3 |
| `4H?` | IPv4 + unknown HTTP |
| `?` | Unknown |
| `...` | Loading / navigating |
| `-` | Network info unavailable (special pages) |

Short HTTP labels:

| Full | Short |
|------|------:|
| HTTP/1.0 | `H10` |
| HTTP/1.1 | `H11` |
| HTTP/2 | `H2` |
| HTTP/3 | `H3` |
| Unknown | `H?` |

### Icon background color (proxy mode)

| Color | Meaning |
|-------|---------|
| Green | Direct (`direct`) |
| Blue | Fixed proxy (`fixed_servers`) |
| Orange | Auto / PAC / system / auto-detect |
| Gray | Unknown / unavailable |

Example: green icon with centered **6H3** → IPv6, HTTP/3, direct connection.

Hover the toolbar button for a per-tab tooltip with host, remote IP, HTTP version, transport (QUIC for HTTP/3), proxy mode, and status code.

---

## Important: main frame only

Brocs analyzes only requests with `type === "main_frame"` (the main HTML document).

Subresources (images, scripts, CDN, iframes, analytics) are ignored on purpose.

If the HTML document is IPv6 + HTTP/3 but an image is IPv4 + HTTP/2, Brocs shows **IPv6 / HTTP/3**.

---

## Proxy limitations (MVP)

Brocs **reads** `chrome.proxy.settings` and never changes them.

| Mode | Shown as | Note |
|------|----------|------|
| `direct` | `DIRECT` / green icon | Clear direct mode |
| `fixed_servers` | `PROXY` / blue icon | Fixed proxy is configured; tooltip may list servers |
| `pac_script` | `AUTO` / orange icon | PAC configured; **actual per-request route is unknown** |
| `auto_detect` | `AUTO` / orange icon | Auto-detect mode |
| `system` | `AUTO` / orange icon | System proxy mode |

Brocs does **not**:

- evaluate PAC scripts
- claim that a given main-frame request used a specific proxy hop
- compare IPs or call “what is my IP” services

For PAC/system/auto, **AUTO** is the correct MVP answer.

---

## Permissions

```json
"permissions": ["webRequest", "proxy", "storage"],
"host_permissions": ["http://*/*", "https://*/*"]
```

| Permission | Why |
|------------|-----|
| `webRequest` | Read main-frame remote IP / status (`onResponseStarted`) |
| `proxy` | Read browser proxy configuration (get only) |
| `storage` | Persist per-tab state across service worker restarts (`session`) |
| host permissions | Observe HTTP/HTTPS main-frame navigations and inject the content script |

Brocs does **not** use `webRequestBlocking` and does not modify pages or proxy settings.

---

## Privacy

- No analytics / telemetry
- No external HTTP requests from the extension
- No upload of URLs, hostnames, IPs, or proxy settings
- Content script only reads `PerformanceNavigationTiming.nextHopProtocol` and sends it to the extension service worker locally

**Brocs does not transmit browsing or network information anywhere.**

---

## Install (unpacked)

### Chromium / Google Chrome / Microsoft Edge

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder (the one that contains `manifest.json`).
5. Pin **Browser Connection Status** / **Brocs** to the toolbar.

### Yandex Browser

1. Open `browser://extensions` (or use the menu → Extensions).
2. Enable **Developer mode** (Режим разработчика).
3. Click **Load unpacked** (Загрузить распакованное расширение).
4. Select this repository folder (contains `manifest.json`).
5. Pin Brocs to the toolbar if it is not visible.

After installation, open any `https://` site. Within a moment the icon should show centered text like `4H2` or `6H3`, and the background color should reflect proxy mode (green / blue / orange).

---

## Building a Chrome Web Store package

From the project root (Windows / PowerShell):

```powershell
.\build-release.ps1
```

The script:

- reads the version from `manifest.json` (no manual version in the script);
- copies only runtime extension files into `dist\brocs-{version}\`;
- creates `dist\brocs-{version}.zip` with **`manifest.json` at the ZIP root**;
- writes `dist\brocs-{version}.zip.sha256`.

Upload this file to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole):

```text
dist\brocs-0.1.0.zip
```

(version comes from `manifest.json`).

The release build does **not** modify source files, commit, tag, or publish anything. Node.js is optional (used only for `node --check` if available).

For a quick local check, unpack the ZIP and use **Load unpacked** on the extracted folder.

---

## How it works

1. **Service worker** listens to `chrome.webRequest` for `main_frame` only.
2. On navigation start, previous tab status is cleared (no stale data).
3. `details.ip` from `onResponseStarted` → IPv4 / IPv6 / Unknown.
4. **Content script** reads `performance.getEntriesByType("navigation")[0].nextHopProtocol` and messages the worker.
5. Worker reads proxy mode via `chrome.proxy.settings.get()`.
6. Worker updates per-`tabId` icon and tooltip independently as each signal arrives.

Redirects: status follows the **final** main document, not intermediate hops.

Cached responses: tooltip may show `Cache: yes`; missing IP/protocol stays `Unknown` (never reused from another site).

Special pages (`browser://`, `chrome://`, `chrome-extension://`, `about:`, `file://`, …): gray icon with `-`.

---

## Project layout

```text
Brocs/
├── manifest.json
├── service-worker.js
├── content-script.js
├── build-release.ps1
├── lib/
│   ├── ip.js
│   ├── protocol.js
│   ├── proxy.js
│   ├── ui.js
│   └── icon.js
├── icons/
│   ├── direct-16.png / direct-32.png
│   ├── proxy-16.png / proxy-32.png
│   ├── auto-16.png / auto-32.png
│   └── unknown-16.png / unknown-32.png / unknown-48.png / unknown-128.png
├── README.md
└── LICENSE
```

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest |
| `service-worker.js` | Main logic, state, action UI |
| `content-script.js` | Reads `nextHopProtocol` only |
| `build-release.ps1` | Chrome Web Store ZIP packager |
| `lib/ip.js` | IP family classification |
| `lib/protocol.js` | HTTP protocol normalization |
| `lib/proxy.js` | Proxy mode parsing (read-only) |
| `lib/ui.js` | Status text + tooltip formatting |
| `lib/icon.js` | Dynamic centered status icons |
| `icons/` | Fallback solid-color icons (no letters) |

---

## Development logging

In `service-worker.js` and `content-script.js`:

```js
const DEBUG = false;
```

Set to `true` temporarily to enable `console.debug` messages prefixed with `[Brocs]` (main-frame / extension events only).

---

## License

MIT — see [LICENSE](LICENSE).
