# Chrome Web Store assets for Brocs

This folder is a ready-to-upload **Store Pack** for the Chrome Web Store product listing.

Graphics are original mockups that match Brocs UI conventions (status chip + tooltip). They use neutral hosts (`example.com`, `intranet.example`) and do not include third-party brand marks.

---

## Files

| File | Size | Chrome Web Store field |
|------|------|-------------------------|
| `store-icon-128.png` | **128×128** | Store icon (**required**) |
| `screenshot-01.png` | **1280×800** | Screenshot #1 (**required**) |
| `screenshot-02.png` | **1280×800** | Screenshot #2 (recommended) |
| `promo-small-440x280.png` | **440×280** | Small promo tile (optional) |
| `marquee-1400x560.png` | **1400×560** | Marquee promo image (optional) |
| `summary-en.txt` | text | **Summary** (English) |
| `description-en.txt` | text | **Description** (English) |
| `privacy-short-en.txt` | text | Privacy / single-purpose notes |
| `permissions-justification-en.txt` | text | Permission justification fields |
| `summary-ru.txt` | text | Summary (Russian, optional) |
| `description-ru.txt` | text | Description (Russian, optional) |
| `_generate_graphics.py` | script | Regenerates PNG assets (dev helper; **do not upload**) |

All store images are **RGB PNG without alpha**.

---

## What to upload (checklist)

### Required

1. **Store icon** → `store-icon-128.png`
2. **Screenshot** → at least `screenshot-01.png` (also upload `screenshot-02.png`)
3. **Summary** → paste contents of `summary-en.txt`
4. **Description** → paste contents of `description-en.txt`

### Strongly recommended

5. **Small promo tile** → `promo-small-440x280.png`
6. **Privacy explanation** → use `privacy-short-en.txt` where the dashboard asks about data use / remote code / privacy practices
7. **Permission justifications** → copy sections from `permissions-justification-en.txt`

### Optional

8. **Marquee** → `marquee-1400x560.png` (large promo; not always shown)
9. Russian listing texts → `summary-ru.txt`, `description-ru.txt`

### Do **not** upload to the store listing

- `_generate_graphics.py`
- Extension package ZIP (that goes to the **Package** step, from `dist\brocs-*.zip`, not this folder)

---

## Screenshot content

| Screenshot | Scenario |
|------------|----------|
| `screenshot-01.png` | `example.com`, status **6H3**, direct (green), tooltip with IPv6 + HTTP/3 + QUIC |
| `screenshot-02.png` | `intranet.example`, status **4H2**, proxy (blue), tooltip with IPv4 + HTTP/2 + fixed_servers |

These are realistic product mockups for the listing. After publishing, you may replace them with captures from a live browser if desired.

---

## Regenerate graphics

From the repo root (requires Python + Pillow):

```powershell
python store-assets\_generate_graphics.py
```

---

## Related

Extension package for the store **Package** upload:

```powershell
.\build-release.ps1
```

→ `dist\brocs-{version}.zip`
