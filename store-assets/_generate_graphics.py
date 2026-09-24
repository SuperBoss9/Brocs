#!/usr/bin/env python3
"""Generate Chrome Web Store graphics for Brocs (exact pixel sizes, no alpha)."""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent

# Shared product palette
NAVY = (18, 36, 64)
NAVY_DEEP = (12, 26, 48)
BLUE = (36, 99, 180)
BLUE_SOFT = (70, 130, 210)
ACCENT = (16, 110, 64)  # direct / status green
PROXY_BLUE = (18, 70, 150)
AUTO_ORANGE = (130, 55, 8)
WHITE = (255, 255, 255)
OFF_WHITE = (245, 247, 250)
GRAY = (120, 130, 145)
DARK = (28, 32, 40)
TOOLBAR = (48, 50, 56)
TOOLBAR_LIGHT = (232, 234, 237)
PAGE_BG = (252, 252, 253)
LINE = (210, 214, 220)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates += [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\calibrib.ttf",
        ]
    candidates += [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_brocs_mark(draw, cx, cy, size, bg=ACCENT):
    """Simple product mark: rounded square + bold B + small link dots."""
    half = size // 2
    rounded_rect(
        draw,
        (cx - half, cy - half, cx + half, cy + half),
        radius=max(4, size // 6),
        fill=bg,
    )
    f = font(int(size * 0.58), bold=True)
    text = "B"
    bbox = draw.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - size * 0.03),
        text,
        font=f,
        fill=WHITE,
    )


def draw_status_chip(draw, x, y, w, h, bg, line1, line2):
    rounded_rect(draw, (x, y, x + w, y + h), radius=max(3, h // 5), fill=bg)
    f1 = font(max(10, int(h * 0.36)), bold=True)
    f2 = font(max(9, int(h * 0.32)), bold=True)
    for i, (txt, f) in enumerate(((line1, f1), (line2, f2))):
        bbox = draw.textbbox((0, 0), txt, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        ty = y + h * (0.18 if i == 0 else 0.52)
        draw.text(
            (x + (w - tw) / 2 - bbox[0], ty - bbox[1]),
            txt,
            font=f,
            fill=WHITE,
        )


def draw_tooltip(draw, x, y, lines, width=360):
    pad = 16
    line_h = 22
    title_h = 28
    height = pad * 2 + title_h + line_h * max(0, len(lines) - 1) + 8
    # soft shadow
    rounded_rect(
        draw,
        (x + 3, y + 4, x + width + 3, y + height + 4),
        radius=10,
        fill=(190, 195, 200),
    )
    rounded_rect(
        draw,
        (x, y, x + width, y + height),
        radius=10,
        fill=WHITE,
        outline=LINE,
        width=1,
    )
    title_font = font(15, bold=True)
    body_font = font(13, bold=False)
    cy = y + pad
    for i, line in enumerate(lines):
        if i == 1 and line == "":
            cy += 6
            continue
        f = title_font if i == 0 else body_font
        color = DARK if i == 0 else (55, 62, 72)
        draw.text((x + pad, cy), line, font=f, fill=color)
        cy += title_h if i == 0 else line_h
    return height


def make_store_icon():
    size = 128
    img = Image.new("RGB", (size, size), WHITE)
    draw = ImageDraw.Draw(img)
    # soft panel
    rounded_rect(draw, (4, 4, 123, 123), radius=28, fill=NAVY)
    # mark
    draw_brocs_mark(draw, 64, 52, 58, bg=ACCENT)
    # status hint strip
    rounded_rect(draw, (22, 92, 106, 112), radius=8, fill=BLUE)
    f = font(14, bold=True)
    label = "6H3"
    bbox = draw.textbbox((0, 0), label, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - tw) / 2 - bbox[0], 94 - bbox[1]),
        label,
        font=f,
        fill=WHITE,
    )
    img.save(OUT / "store-icon-128.png", "PNG")
    print("wrote store-icon-128.png", img.size)


def make_browser_screenshot(
    path: Path,
    *,
    host: str,
    url: str,
    page_title: str,
    page_subtitle: str,
    chip_bg,
    line1: str,
    line2: str,
    tooltip_lines: list[str],
    dark_toolbar: bool = True,
):
    W, H = 1280, 800
    img = Image.new("RGB", (W, H), (55, 58, 64))
    draw = ImageDraw.Draw(img)

    # Browser window
    margin = 48
    win = (margin, 40, W - margin, H - 36)
    rounded_rect(draw, win, radius=14, fill=(36, 38, 42) if dark_toolbar else TOOLBAR_LIGHT)

    # Title bar traffic lights
    for i, c in enumerate(((255, 95, 87), (255, 189, 46), (40, 200, 64))):
        bx = win[0] + 22 + i * 22
        draw.ellipse((bx, win[1] + 16, bx + 12, win[1] + 28), fill=c)

    # Tab
    tab_y = win[1] + 42
    rounded_rect(
        draw,
        (win[0] + 16, tab_y, win[0] + 260, tab_y + 36),
        radius=8,
        fill=TOOLBAR if dark_toolbar else WHITE,
    )
    tf = font(13, bold=False)
    draw.text((win[0] + 30, tab_y + 10), page_title[:28], font=tf, fill=WHITE if dark_toolbar else DARK)

    # Toolbar / address bar row
    bar_top = tab_y + 40
    bar_bottom = bar_top + 52
    rounded_rect(
        draw,
        (win[0] + 1, bar_top, win[2] - 1, bar_bottom),
        radius=0,
        fill=TOOLBAR if dark_toolbar else (240, 242, 245),
    )

    # Address field
    addr_left = win[0] + 56
    addr_right = win[2] - 220
    rounded_rect(
        draw,
        (addr_left, bar_top + 10, addr_right, bar_top + 42),
        radius=18,
        fill=(58, 60, 66) if dark_toolbar else WHITE,
    )
    af = font(14, bold=False)
    draw.text((addr_left + 18, bar_top + 18), url, font=af, fill=(200, 205, 215) if dark_toolbar else (70, 75, 85))

    # Extension area — Brocs chip
    chip_w, chip_h = 40, 40
    chip_x = addr_right + 24
    chip_y = bar_top + 6
    draw_status_chip(draw, chip_x, chip_y, chip_w, chip_h, chip_bg, line1, line2)

    # Cursor hint (simple pointer)
    cursor_x = chip_x + chip_w // 2 + 8
    cursor_y = chip_y + chip_h + 2
    draw.polygon(
        [
            (cursor_x, cursor_y),
            (cursor_x, cursor_y + 18),
            (cursor_x + 5, cursor_y + 14),
            (cursor_x + 10, cursor_y + 22),
            (cursor_x + 13, cursor_y + 20),
            (cursor_x + 7, cursor_y + 12),
            (cursor_x + 14, cursor_y + 12),
        ],
        fill=WHITE,
        outline=DARK,
    )

    # Page content area
    page = (win[0] + 1, bar_bottom, win[2] - 1, win[3] - 1)
    draw.rectangle(page, fill=PAGE_BG)

    # Minimal page mock
    content_x = page[0] + 72
    content_y = page[1] + 64
    draw.text((content_x, content_y), host, font=font(36, bold=True), fill=NAVY)
    draw.text(
        (content_x, content_y + 56),
        page_subtitle,
        font=font(18, bold=False),
        fill=GRAY,
    )
    # decorative content lines
    for i in range(5):
        wline = 520 - i * 40
        y = content_y + 120 + i * 28
        rounded_rect(
            draw,
            (content_x, y, content_x + wline, y + 12),
            radius=4,
            fill=(230, 233, 238),
        )

    # Tooltip near Brocs
    tip_x = chip_x - 80
    tip_y = bar_bottom + 16
    if tip_x + 380 > win[2] - 20:
        tip_x = win[2] - 400
    draw_tooltip(draw, tip_x, tip_y, tooltip_lines, width=380)

    # Small caption strip
    caption = "Brocs — connection status on the toolbar"
    draw.text((content_x, page[3] - 48), caption, font=font(14, bold=False), fill=GRAY)

    img.save(path, "PNG")
    print("wrote", path.name, img.size, img.mode)


def make_promo_small():
    W, H = 440, 280
    img = Image.new("RGB", (W, H), NAVY_DEEP)
    draw = ImageDraw.Draw(img)

    # subtle diagonal panel
    draw.polygon([(220, 0), (W, 0), (W, H), (140, H)], fill=NAVY)

    draw_brocs_mark(draw, 72, 78, 72, bg=ACCENT)

    draw.text((130, 42), "Brocs", font=font(36, bold=True), fill=WHITE)
    draw.text(
        (130, 88),
        "Browser Connection Status",
        font=font(15, bold=False),
        fill=(170, 200, 255),
    )

    draw.text(
        (36, 148),
        "See IPv4/IPv6, HTTP version",
        font=font(18, bold=True),
        fill=OFF_WHITE,
    )
    draw.text(
        (36, 176),
        "and proxy mode at a glance",
        font=font(18, bold=True),
        fill=OFF_WHITE,
    )

    # status chips
    draw_status_chip(draw, 36, 216, 54, 38, ACCENT, "6", "H3")
    draw_status_chip(draw, 102, 216, 54, 38, PROXY_BLUE, "4", "H2")
    draw_status_chip(draw, 168, 216, 54, 38, AUTO_ORANGE, "6", "H11")

    labels = [("Direct", 36), ("Proxy", 102), ("Auto", 168)]
    lf = font(11, bold=False)
    for label, x in labels:
        draw.text((x + 6, 258), label, font=lf, fill=(190, 198, 210))

    img.save(OUT / "promo-small-440x280.png", "PNG")
    print("wrote promo-small-440x280.png", img.size)


def make_marquee():
    W, H = 1400, 560
    img = Image.new("RGB", (W, H), NAVY_DEEP)
    draw = ImageDraw.Draw(img)

    # soft geometric background
    draw.ellipse((-120, -80, 520, 560), fill=NAVY)
    draw.ellipse((980, 80, 1580, 680), fill=(22, 48, 88))

    draw_brocs_mark(draw, 120, 160, 110, bg=ACCENT)

    draw.text((210, 110), "Browser Connection Status", font=font(48, bold=True), fill=WHITE)
    draw.text((210, 175), "Brocs", font=font(28, bold=True), fill=BLUE_SOFT)
    draw.text(
        (210, 230),
        "IPv4/IPv6, HTTP version, proxy mode — at a glance",
        font=font(24, bold=False),
        fill=OFF_WHITE,
    )
    draw.text(
        (210, 275),
        "Local diagnostics for the current tab’s main document.",
        font=font(20, bold=False),
        fill=GRAY,
    )

    # Stylized toolbar strip
    strip_y = 360
    rounded_rect(draw, (210, strip_y, 920, strip_y + 64), radius=14, fill=(32, 40, 56))
    rounded_rect(draw, (230, strip_y + 14, 720, strip_y + 50), radius=16, fill=(48, 56, 72))
    draw.text((250, strip_y + 22), "https://example.com", font=font(16), fill=(180, 190, 205))
    draw_status_chip(draw, 750, strip_y + 10, 48, 44, ACCENT, "6", "H3")

    # Mini tooltip card
    tip_x, tip_y = 980, 130
    tip_w, tip_h = 360, 300
    rounded_rect(draw, (tip_x, tip_y, tip_x + tip_w, tip_y + tip_h), radius=16, fill=WHITE)
    lines = [
        "Brocs — Browser Connection Status",
        "",
        "Host: example.com",
        "Remote IP: 2606:2800:…:1946",
        "IP: IPv6",
        "HTTP: HTTP/3",
        "Transport: QUIC",
        "Proxy: DIRECT",
        "Status: 200",
    ]
    y = tip_y + 24
    for i, line in enumerate(lines):
        if line == "":
            y += 8
            continue
        f = font(15, bold=True) if i == 0 else font(15)
        color = DARK if i == 0 else (60, 68, 78)
        draw.text((tip_x + 24, y), line, font=f, fill=color)
        y += 28 if i == 0 else 26

    img.save(OUT / "marquee-1400x560.png", "PNG")
    print("wrote marquee-1400x560.png", img.size)


def main():
    make_store_icon()

    make_browser_screenshot(
        OUT / "screenshot-01.png",
        host="example.com",
        url="https://example.com/",
        page_title="example.com",
        page_subtitle="Neutral demo page — main document connection",
        chip_bg=ACCENT,
        line1="6",
        line2="H3",
        tooltip_lines=[
            "Brocs — Browser Connection Status",
            "",
            "Host: example.com",
            "Remote IP: 2606:2800:220:1:248:1893:25c8:1946",
            "IP: IPv6",
            "HTTP: HTTP/3",
            "Transport: QUIC",
            "Proxy: DIRECT",
            "Status: 200",
        ],
        dark_toolbar=True,
    )

    make_browser_screenshot(
        OUT / "screenshot-02.png",
        host="intranet.example",
        url="https://intranet.example/",
        page_title="intranet.example",
        page_subtitle="Corporate / proxied access scenario",
        chip_bg=PROXY_BLUE,
        line1="4",
        line2="H2",
        tooltip_lines=[
            "Brocs — Browser Connection Status",
            "",
            "Host: intranet.example",
            "Remote IP: 203.0.113.25",
            "IP: IPv4",
            "HTTP: HTTP/2",
            "Proxy: PROXY",
            "Proxy mode: fixed_servers",
            "Status: 200",
        ],
        dark_toolbar=True,
    )

    make_promo_small()
    make_marquee()

    # Verify sizes / modes
    expected = {
        "store-icon-128.png": (128, 128),
        "screenshot-01.png": (1280, 800),
        "screenshot-02.png": (1280, 800),
        "promo-small-440x280.png": (440, 280),
        "marquee-1400x560.png": (1400, 560),
    }
    for name, size in expected.items():
        im = Image.open(OUT / name)
        assert im.size == size, (name, im.size)
        assert im.mode == "RGB", (name, im.mode)
        print("OK", name, im.size, im.mode)


if __name__ == "__main__":
    main()
