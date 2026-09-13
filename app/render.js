import { UNIT, designHeight, tileOrigin, worldSize, FONTS } from './model.js';
import { corners } from './geometry.js';
const patterns = new Map();
function paperPattern(type) {
    let c = patterns.get(type);
    if (c)
        return c;
    c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (type === 'paper') {
        let seed = 90210;
        for (let i = 0; i < 6000; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const x = (seed >>> 16) % 128;
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const y = (seed >>> 16) % 128;
            ctx.fillStyle = `rgba(71,57,36,${.015 + (seed % 30) / 1200})`;
            ctx.fillRect(x, y, seed % 2 + 1, 1);
        }
    }
    else if (type === 'linen') {
        ctx.strokeStyle = 'rgba(83,72,45,.035)';
        ctx.lineWidth = .45;
        for (let i = 0; i < 128; i += 3) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 128);
            ctx.moveTo(0, i);
            ctx.lineTo(128, i);
            ctx.stroke();
        }
    }
    patterns.set(type, c);
    return c;
}
export function maskPath(w, h, mask, radius = 8, customPath) {
    const p = new Path2D();
    switch (mask) {
        case 'custom':
            if (customPath) {
                p.addPath(new Path2D(customPath), new DOMMatrix().scale(w / 100, h / 100));
                break;
            }
            p.rect(0, 0, w, h);
            break;
        case 'cup':
            p.moveTo(w * .08, 0);
            p.lineTo(w * .92, 0);
            p.lineTo(w * .78, h * .9);
            p.quadraticCurveTo(w * .5, h * 1.08, w * .22, h * .9);
            p.closePath();
            break;
        case 'airplane':
            p.roundRect(0, 0, w, h, [w * .45, w * .45, w * .32, w * .32]);
            break;
        case 'ticket':
            p.moveTo(0, 0);
            p.lineTo(w, 0);
            p.lineTo(w, h * .42);
            p.ellipse(w, h / 2, w * .055, h * .08, 0, -Math.PI / 2, Math.PI / 2, true);
            p.lineTo(w, h);
            p.lineTo(0, h);
            p.lineTo(0, h * .58);
            p.ellipse(0, h / 2, w * .055, h * .08, 0, Math.PI / 2, -Math.PI / 2, true);
            p.closePath();
            break;
        case 'disc':
            p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            p.moveTo(w * .56, h / 2);
            p.ellipse(w / 2, h / 2, w * .06, h * .06, 0, 0, Math.PI * 2, true);
            break;
        case 'circle':
            p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            break;
        case 'rounded':
            p.roundRect(0, 0, w, h, Math.min(radius, w / 2, h / 2));
            break;
        case 'arch': {
            const r = Math.min(w / 2, h);
            p.moveTo(0, h);
            p.lineTo(0, r);
            p.bezierCurveTo(0, -r * .333, w, -r * .333, w, r);
            p.lineTo(w, h);
            p.closePath();
            break;
        }
        case 'diamond':
            p.moveTo(w / 2, 0);
            p.lineTo(w, h / 2);
            p.lineTo(w / 2, h);
            p.lineTo(0, h / 2);
            p.closePath();
            break;
        case 'torn': {
            p.moveTo(0, 3);
            for (let x = 0, i = 0; x <= w; x += w / 28, i++)
                p.lineTo(x, Math.sin(i * 4.38) * 2.5 + 3);
            p.lineTo(w, h - 3);
            for (let x = w, i = 0; x >= 0; x -= w / 28, i++)
                p.lineTo(x, h - 3 + Math.sin(i * 3.33) * 2.5);
            p.closePath();
            break;
        }
        default: p.rect(0, 0, w, h);
    }
    return p;
}
function fontString(n, size = n.fontSize) { return `${n.italic ? 'italic ' : ''}${n.weight} ${size}px ${FONTS[n.font]}`; }
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined;
const graphemes = (text) => segmenter ? Array.from(segmenter.segment(text), s => s.segment) : Array.from(text);
function textWidth(ctx, text, spacing) { return ctx.measureText(text).width + Math.max(0, graphemes(text).length - 1) * spacing; }
export function textLines(ctx, n, size = n.fontSize) {
    if (n.noWrap)
        return n.text.split('\n');
    ctx.font = fontString(n, size);
    const lines = [];
    for (const para of n.text.split('\n')) {
        if (!para) {
            lines.push('');
            continue;
        }
        let line = '';
        const chunks = para.match(/\S+\s*/gu) || [para];
        for (const chunk of chunks) {
            if (textWidth(ctx, line + chunk, n.letterSpacing) <= n.w || !line) {
                line += chunk;
                if (textWidth(ctx, line, n.letterSpacing) > n.w) {
                    let small = '';
                    for (const ch of graphemes(line)) {
                        if (textWidth(ctx, small + ch, n.letterSpacing) > n.w && small) {
                            lines.push(small);
                            small = ch;
                        }
                        else
                            small += ch;
                    }
                    line = small;
                }
            }
            else {
                lines.push(line.trimEnd());
                line = chunk;
            }
        }
        lines.push(line.trimEnd());
    }
    return lines;
}
export function layoutText(ctx, n) {
    let size = n.fontSize, lines = textLines(ctx, n, size);
    while (lines.length * size * n.lineHeight > n.h && size > Math.max(8, n.fontSize * .6)) {
        size -= .5;
        lines = textLines(ctx, n, size);
    }
    return { size, lines, requiredHeight: lines.length * size * n.lineHeight, overflow: lines.length * size * n.lineHeight > n.h + 1 };
}
function drawText(ctx, n) {
    const { size, lines } = layoutText(ctx, n);
    ctx.font = fontString(n, size);
    ctx.fillStyle = n.color;
    ctx.textBaseline = n.baselineShift === undefined ? 'top' : 'alphabetic';
    ctx.textAlign = 'left';
    const spacing = n.letterSpacing;
    for (let i = 0; i < lines.length; i++) {
        const text = lines[i], width = textWidth(ctx, text, spacing), x = n.align === 'center' ? (n.w - width) / 2 : n.align === 'right' ? n.w - width : 0, y = i * size * n.lineHeight + (n.baselineShift || 0);
        if (y >= n.h + size * .2)
            break;
        if (!spacing)
            ctx.fillText(text, x, y);
        else if (typeof ctx.letterSpacing === 'string') {
            const spaced = ctx;
            spaced.letterSpacing = spacing + 'px';
            ctx.fillText(text, x, y);
            spaced.letterSpacing = '0px';
        }
        else {
            let px = x;
            for (const char of graphemes(text)) {
                ctx.fillText(char, px, y);
                px += ctx.measureText(char).width + spacing;
            }
        }
    }
}
export function renderPhotoFrame(ctx, n, image) {
    const path = maskPath(n.w, n.h, n.mask, n.w * .04, n.maskPath);
    if (n.shadow > 0) {
        ctx.save();
        ctx.shadowColor = `rgba(28,25,20,${n.shadow * .004})`;
        const transform = ctx.getTransform(), scale = Math.hypot(transform.a, transform.b);
        ctx.shadowBlur = n.shadow * .25 * scale;
        ctx.shadowOffsetY = n.shadow * .13 * scale;
        ctx.fillStyle = n.border || '#ffffff';
        ctx.fill(path);
        ctx.restore();
    }
    if (n.borderWidth) {
        ctx.save();
        ctx.strokeStyle = n.border;
        ctx.lineWidth = n.borderWidth * 2;
        ctx.stroke(path);
        ctx.restore();
    }
    ctx.save();
    ctx.clip(path);
    if (n.matColor) {
        ctx.fillStyle = n.matColor;
        ctx.fillRect(0, 0, n.w, n.h);
    }
    if (image) {
        const i = image, iw = i.videoWidth || i.naturalWidth || i.width, ih = i.videoHeight || i.naturalHeight || i.height;
        const factor = (n.fit === 'fit' ? Math.min(n.w / iw, n.h / ih) : Math.max(n.w / iw, n.h / ih)) * n.crop.zoom;
        const w = iw * factor, h = ih * factor;
        ctx.save();
        if (n.flipX) {
            ctx.translate(n.w, 0);
            ctx.scale(-1, 1);
        }
        if (n.flipY) {
            ctx.translate(0, n.h);
            ctx.scale(1, -1);
        }
        ctx.drawImage(image, (n.w - w) * n.crop.x, (n.h - h) * n.crop.y, w, h);
        ctx.restore();
    }
    else {
        ctx.fillStyle = n.matColor || '#e6e3d8';
        ctx.fillRect(0, 0, n.w, n.h);
    }
    ctx.restore();
}
function drawShape(ctx, n) {
    ctx.fillStyle = n.fill;
    ctx.strokeStyle = n.stroke;
    ctx.lineWidth = n.strokeWidth;
    if (n.gradient) {
        const a = n.gradient.angle * Math.PI / 180;
        const g = ctx.createLinearGradient(n.w / 2 - Math.cos(a) * n.w / 2, n.h / 2 - Math.sin(a) * n.h / 2, n.w / 2 + Math.cos(a) * n.w / 2, n.h / 2 + Math.sin(a) * n.h / 2);
        g.addColorStop(0, n.fill);
        g.addColorStop(1, n.gradient.to);
        ctx.fillStyle = g;
    }
    if (n.shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(n.w, n.h);
        ctx.stroke();
        return;
    }
    let path;
    if (n.shape === 'ellipse')
        path = maskPath(n.w, n.h, 'circle');
    else if (n.shape === 'path' && n.path) {
        ctx.save();
        ctx.scale(n.w / 128, n.h / 128);
        path = new Path2D(n.path);
        ctx.fill(path);
        if (n.strokeWidth)
            ctx.stroke(path);
        ctx.restore();
        return;
    }
    else
        path = maskPath(n.w, n.h, n.radius ? 'rounded' : 'rectangle', n.radius);
    ctx.fill(path);
    if (n.strokeWidth)
        ctx.stroke(path);
}
export function visibleNodes(p, left = 0, right = worldSize(p).w, top = 0, bottom = worldSize(p).h) {
    return p.nodes.filter(n => { const pts = corners(n); return Math.max(...pts.map(v => v.x)) >= left - 30 && Math.min(...pts.map(v => v.x)) <= right + 30 && Math.max(...pts.map(v => v.y)) >= top - 30 && Math.min(...pts.map(v => v.y)) <= bottom + 30; });
}
export function nodesForSlide(p, slide) { const o = tileOrigin(p, slide); return visibleNodes(p, o.x, o.x + UNIT, o.y, o.y + designHeight(p)); }
const layerCache = new Map();
const sourceIds = new WeakMap();
let sourceSequence = 0, layerPixels = 0;
export function clearRenderCache() { layerCache.clear(); layerPixels = 0; }
function drawLocalNode(ctx, n, res) {
    if (n.kind === 'photo' || n.kind === 'video')
        renderPhotoFrame(ctx, n, res.get(n.id));
    else if (n.kind === 'text')
        drawText(ctx, n);
    else if (n.kind === 'shape')
        drawShape(ctx, n);
    else {
        const image = res.get(n.id);
        if (image)
            ctx.drawImage(image, 0, 0, n.w, n.h);
    }
}
/** Keep subpixel ink and mask edges anchored when a slide cuts across a layer. */
function layerRaster(n, res, scale) {
    const image = res.get(n.id);
    if (image && !sourceIds.has(image))
        sourceIds.set(image, ++sourceSequence);
    const frameTime = image instanceof HTMLVideoElement ? image.currentTime : 0;
    const key = JSON.stringify([n, scale, image ? sourceIds.get(image) : 0, frameTime, n.kind === 'text' ? document.fonts.size : 0]);
    const existing = layerCache.get(key);
    if (existing) {
        layerCache.delete(key);
        layerCache.set(key, existing);
        return existing;
    }
    const points = corners(n);
    const padding = Math.ceil((n.kind === 'photo' || n.kind === 'video' ? n.borderWidth + n.shadow * .8 + 4 : n.kind === 'text' ? n.fontSize * .6 + 4 : n.kind === 'shape' ? n.strokeWidth + 4 : 4) * scale);
    const left = Math.floor(Math.min(...points.map(p => p.x)) * scale) - padding;
    const top = Math.floor(Math.min(...points.map(p => p.y)) * scale) - padding;
    const width = Math.ceil(Math.max(...points.map(p => p.x)) * scale) + padding - left;
    const height = Math.ceil(Math.max(...points.map(p => p.y)) * scale) + padding - top;
    // Oversized freeform layers stay on the existing bounded-resource path.
    if (width * height > 16000000 || width > 16384 || height > 16384)
        return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    ctx.translate((n.x + n.w / 2) * scale - left, (n.y + n.h / 2) * scale - top);
    ctx.rotate(n.rotation * Math.PI / 180);
    ctx.scale(scale, scale);
    ctx.translate(-n.w / 2, -n.h / 2);
    drawLocalNode(ctx, n, res);
    const result = { canvas, left, top, pixels: canvas.width * canvas.height };
    layerCache.set(key, result);
    layerPixels += result.pixels;
    while (layerPixels > 8000000 && layerCache.size > 1) {
        const first = layerCache.keys().next().value;
        layerPixels -= layerCache.get(first).pixels;
        layerCache.delete(first);
    }
    return result;
}
/** Shared renderer. No DOM UI, glass material, selection handles, or watermark enters this pipeline. */
export function renderScene(ctx, p, res, o) {
    const h = designHeight(p), origin = tileOrigin(p, o.slide || 0), size = worldSize(p);
    const left = o.slide === undefined ? 0 : origin.x, right = o.slide === undefined ? size.w : left + UNIT;
    const top = o.slide === undefined ? 0 : origin.y, bottom = o.slide === undefined ? size.h : top + h;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.translate(o.offsetX || 0, o.offsetY || 0);
    ctx.scale(o.scale, o.scale);
    if (o.slide !== undefined)
        ctx.translate(-left, -top);
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    for (let i = 0; i < p.slides.length; i++) {
        const origin = tileOrigin(p, i);
        if (origin.x + UNIT < left || origin.x > right || origin.y + h < top || origin.y > bottom)
            continue;
        const s = p.slides[i];
        if (!o.transparent) {
            ctx.fillStyle = s.background;
            ctx.fillRect(origin.x, origin.y, UNIT, h);
        }
        if (s.texture === 'grid') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(origin.x, origin.y, UNIT, h);
            ctx.clip();
            ctx.strokeStyle = 'rgba(83,89,66,.09)';
            ctx.lineWidth = .55;
            for (let x = Math.ceil(origin.x / 18) * 18; x <= origin.x + UNIT; x += 18) {
                ctx.beginPath();
                ctx.moveTo(x, origin.y);
                ctx.lineTo(x, origin.y + h);
                ctx.stroke();
            }
            for (let y = Math.ceil(origin.y / 18) * 18; y <= origin.y + h; y += 18) {
                ctx.beginPath();
                ctx.moveTo(origin.x, y);
                ctx.lineTo(origin.x + UNIT, y);
                ctx.stroke();
            }
            ctx.restore();
        }
        else if (s.texture !== 'none') {
            ctx.fillStyle = ctx.createPattern(paperPattern(s.texture), 'repeat');
            ctx.fillRect(origin.x, origin.y, UNIT, h);
        }
    }
    for (const n of visibleNodes(p, left, right, top, bottom)) {
        if (n.opacity <= 0)
            continue;
        ctx.save();
        ctx.globalAlpha = n.opacity;
        const raster = layerRaster(n, res, o.scale);
        if (raster) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(raster.canvas, raster.left + (o.offsetX || 0) - (o.slide === undefined ? 0 : left * o.scale), raster.top + (o.offsetY || 0) - (o.slide === undefined ? 0 : top * o.scale));
            ctx.restore();
            continue;
        }
        ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
        ctx.rotate(n.rotation * Math.PI / 180);
        ctx.translate(-n.w / 2, -n.h / 2);
        if (n.kind === 'photo' || n.kind === 'video')
            renderPhotoFrame(ctx, n, res.get(n.id));
        else if (n.kind === 'text')
            drawText(ctx, n);
        else if (n.kind === 'shape')
            drawShape(ctx, n);
        else {
            const im = res.get(n.id);
            if (im)
                ctx.drawImage(im, 0, 0, n.w, n.h);
        }
        ctx.restore();
    }
    ctx.restore();
}
export function sceneCanvas(p, res, slide = 0, width = p.width) { const c = document.createElement('canvas'); c.width = Math.round(width); c.height = Math.round(width * p.height / p.width); renderScene(c.getContext('2d'), p, res, { scale: width / UNIT, slide }); return c; }
