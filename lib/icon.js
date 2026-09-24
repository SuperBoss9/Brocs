/**
 * Dynamic action icons: proxy mode = background color only (no letters).
 * Status is two centered lines (IP + HTTP), high-contrast, wide tracking.
 */

export const PROXY_COLORS = Object.freeze({
  // Darker fills so white glyphs stay readable.
  direct: [16, 110, 64, 255],
  proxy: [18, 70, 150, 255],
  auto: [130, 55, 8, 255],
  unknown: [45, 45, 45, 255]
});

const ICON_SIZES = [16, 32];
const FONT_FAMILY = 'Arial Black, Arial, "Segoe UI", sans-serif';

/**
 * @param {string} proxyIconKey
 * @returns {number[]}
 */
export function colorForProxyKey(proxyIconKey) {
  return PROXY_COLORS[proxyIconKey] || PROXY_COLORS.unknown;
}

/**
 * Split status like "4H3" / "6H11" into [ip, http] lines.
 * @param {string} statusText
 * @returns {string[]}
 */
export function splitStatusLines(statusText) {
  const text = statusText && String(statusText).length > 0 ? String(statusText) : "?";

  const match = /^([46?])(H\d{1,2}|H\?)$/.exec(text);
  if (match) {
    return [match[1], match[2]];
  }

  if (text.length >= 2 && /^[46?]H/.test(text)) {
    return [text[0], text.slice(1)];
  }

  return [text];
}

/**
 * @param {string} statusText
 * @param {string} proxyIconKey
 * @returns {{16: ImageData, 32: ImageData}}
 */
export function renderStatusIcons(statusText, proxyIconKey) {
  const lines = splitStatusLines(statusText);
  const rgba = colorForProxyKey(proxyIconKey);
  const imageData = {};

  for (const size of ICON_SIZES) {
    imageData[size] = drawIcon(size, lines, rgba);
  }

  return imageData;
}

/**
 * @param {number} size
 * @param {string[]} lines
 * @param {number[]} rgba
 * @returns {ImageData}
 */
function drawIcon(size, lines, rgba) {
  // Draw at 2× then downscale for thicker, sharper glyphs in the toolbar.
  const scale = 2;
  const src = size * scale;
  const canvas = new OffscreenCanvas(src, src);
  const ctx = canvas.getContext("2d", { alpha: true });

  ctx.clearRect(0, 0, src, src);
  ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})`;
  ctx.fillRect(0, 0, src, src);

  const tracking = Math.max(1, Math.round(src * 0.045));
  const pad = Math.max(0, Math.round(src * 0.015));
  const maxWidth = src - pad * 2;
  const gap = lines.length > 1 ? Math.max(0, Math.round(src * 0.015)) : 0;
  const lineBudget = (src - pad * 2 - gap * (lines.length - 1)) / lines.length;

  const fontSize = fitFontSizeForLines(ctx, lines, maxWidth, lineBudget, tracking);
  const strokeWidth = Math.max(1.25, src / 18);

  setFont(ctx, fontSize);

  const metricsList = lines.map((line) => {
    const block = measureSpaced(ctx, line, tracking);
    return {
      line,
      width: block.width,
      ascent: block.ascent,
      descent: block.descent
    };
  });

  const lineHeights = metricsList.map((m) => m.ascent + m.descent);
  const blockHeight =
    lineHeights.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);

  let yTop = (src - blockHeight) / 2;

  for (let i = 0; i < metricsList.length; i++) {
    const m = metricsList[i];
    const centerX = src / 2;
    const baseline = yTop + m.ascent;
    drawSpacedText(ctx, m.line, centerX, baseline, tracking, strokeWidth);
    yTop += lineHeights[i] + gap;
  }

  return downscaleImageData(ctx.getImageData(0, 0, src, src), size);
}

/**
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} fontSize
 */
function setFont(ctx, fontSize) {
  ctx.font = `900 ${fontSize}px ${FONT_FAMILY}`;
}

/**
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} tracking
 * @returns {{width: number, ascent: number, descent: number}}
 */
function measureSpaced(ctx, text, tracking) {
  const chars = Array.from(text);
  let width = 0;
  let ascent = 0;
  let descent = 0;

  for (let i = 0; i < chars.length; i++) {
    const m = ctx.measureText(chars[i]);
    width += m.width;
    if (i < chars.length - 1) {
      width += tracking;
    }
    ascent = Math.max(ascent, m.actualBoundingBoxAscent ?? 0);
    descent = Math.max(descent, m.actualBoundingBoxDescent ?? 0);
  }

  if (ascent === 0 && descent === 0) {
    const fallback = ctx.measureText(text);
    ascent = fallback.actualBoundingBoxAscent ?? parseFloat(ctx.font) * 0.85;
    descent = fallback.actualBoundingBoxDescent ?? parseFloat(ctx.font) * 0.15;
  }

  return { width, ascent, descent };
}

/**
 * Draw each glyph with tracking; dark stroke + white fill for contrast.
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} centerX
 * @param {number} baseline
 * @param {number} tracking
 * @param {number} strokeWidth
 */
function drawSpacedText(ctx, text, centerX, baseline, tracking, strokeWidth) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total =
    widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);

  let x = centerX - total / 2;

  ctx.lineJoin = "round";
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (let i = 0; i < chars.length; i++) {
    ctx.strokeText(chars[i], x, baseline);
    ctx.fillText(chars[i], x, baseline);
    x += widths[i] + tracking;
  }
}

/**
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {number} maxWidth
 * @param {number} lineBudget
 * @param {number} tracking
 * @returns {number}
 */
function fitFontSizeForLines(ctx, lines, maxWidth, lineBudget, tracking) {
  // Push glyphs close to the full line budget (slightly overshoot OK visually).
  let size = Math.floor(lineBudget * 1.08);
  const min = Math.max(12, Math.floor(lineBudget * 0.72));
  const heightLimit = lineBudget * 1.06;

  while (size >= min) {
    setFont(ctx, size);
    let fits = true;

    for (const line of lines) {
      const m = measureSpaced(ctx, line, tracking);
      const height = m.ascent + m.descent;
      if (m.width > maxWidth || height > heightLimit) {
        fits = false;
        break;
      }
    }

    if (fits) {
      return size;
    }
    size -= 1;
  }

  return min;
}

/**
 * Box-average downscale for crisper toolbar icons.
 * @param {ImageData} src
 * @param {number} targetSize
 * @returns {ImageData}
 */
function downscaleImageData(src, targetSize) {
  const scale = src.width / targetSize;
  const out = new ImageData(targetSize, targetSize);

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      const x0 = Math.floor(x * scale);
      const y0 = Math.floor(y * scale);
      const x1 = Math.floor((x + 1) * scale);
      const y1 = Math.floor((y + 1) * scale);

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          count += 1;
        }
      }

      const o = (y * targetSize + x) * 4;
      out.data[o] = Math.round(r / count);
      out.data[o + 1] = Math.round(g / count);
      out.data[o + 2] = Math.round(b / count);
      out.data[o + 3] = Math.round(a / count);
    }
  }

  return out;
}
