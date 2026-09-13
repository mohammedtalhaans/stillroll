import { isHEIC, decodeHEIC } from './heic.js';
import { ensureFonts } from './fonts.js';
import { uid, defaultGrade } from './model.js';
import { DEMO } from './demo.js';
import { ASSETS } from './assets.js';
import { loadMedia, loadAsset } from './storage.js';
import { processPixels } from './grading.js';
export const mediaLibrary = new Map(DEMO.map(m => [m.id, m]));
export const imageFromURL = (src, signal) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    const clear = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); image.onload = image.onerror = null; };
    const cancel = () => { clear(); image.src = ''; reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { clear(); image.src = ''; reject(new Error('An image took too long to load. Check the site files or try a smaller image.')); }, 20000);
    image.onload = () => { clear(); resolve(image); };
    image.onerror = () => { clear(); reject(new Error('This image could not be decoded. Try a JPEG or PNG copy.')); };
    if (signal?.aborted) {
        cancel();
        return;
    }
    signal?.addEventListener('abort', cancel, { once: true });
    image.src = globalThis.__STILLROLL_ASSETS__?.[src] || src;
});
export const blobURL = (b) => URL.createObjectURL(b);
export const canvasBlob = (c, type = 'image/png', quality = .94) => new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('The browser could not finish this image. Try a smaller export.')), type, quality));
export async function getMedia(id) {
    let m = mediaLibrary.get(id);
    if (!m) {
        m = await loadMedia(id);
        if (m)
            mediaLibrary.set(id, m);
    }
    if (!m)
        throw new Error('A photo is missing from local storage. Replace it, or import a portable project backup.');
    return m;
}
export function sanitizeSVG(text) {
    if (text.length > 2000000)
        throw new Error('This SVG is too large.');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.tagName.toLowerCase() !== 'svg')
        throw new Error('This SVG is not valid.');
    for (const e of Array.from(doc.querySelectorAll('script,foreignObject,iframe,object,embed,audio,video,animate,animateTransform,set,style,link')))
        e.remove();
    for (const el of Array.from(doc.querySelectorAll('*'))) {
        for (const a of Array.from(el.attributes)) {
            if (/^on/i.test(a.name) || a.name === 'style' || /href$/i.test(a.name) && !a.value.startsWith('#') || /url\(\s*[^#]/i.test(a.value))
                el.removeAttribute(a.name);
        }
    }
    const root = doc.documentElement;
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!root.getAttribute('viewBox'))
        root.setAttribute('viewBox', `0 0 ${parseFloat(root.getAttribute('width') || '512')} ${parseFloat(root.getAttribute('height') || '512')}`);
    return new XMLSerializer().serializeToString(root);
}
export async function inspectImage(blob) {
    const src = blobURL(blob);
    try {
        const im = await imageFromURL(src);
        if (!im.naturalWidth || !im.naturalHeight || im.naturalWidth * im.naturalHeight > 64000000)
            throw new Error('This photo is larger than 64 megapixels. Please use a smaller copy.');
        return { width: im.naturalWidth, height: im.naturalHeight };
    }
    finally {
        URL.revokeObjectURL(src);
    }
}
export async function importMedia(file, signal) {
    if (signal?.aborted)
        throw new DOMException('Cancelled', 'AbortError');
    if (file.size > 100000000)
        throw new Error(`${file.name}: please choose a file smaller than 100 MB.`);
    const video = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    let blob = file;
    if (video) {
        const src = blobURL(blob);
        try {
            const v = await loadVideo(src);
            if (v.videoWidth * v.videoHeight > 64000000) {
                v.src = '';
                throw new Error('This video exceeds the 64-megapixel frame limit.');
            }
            const m = { id: uid(), name: file.name, kind: 'video', mime: file.type || 'video/mp4', blob, width: v.videoWidth, height: v.videoHeight, duration: v.duration };
            v.src = '';
            mediaLibrary.set(m.id, m);
            return m;
        }
        finally {
            URL.revokeObjectURL(src);
        }
    }
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name))
        blob = new Blob([sanitizeSVG(await file.text())], { type: 'image/svg+xml' });
    try {
        let dims;
        if (isHEIC(file)) {
            try {
                dims = await nativeWorkingPNG(blob, signal);
            }
            catch (error) {
                if (error.name === 'AbortError')
                    throw error;
                dims = await decodeHEIC(blob, signal);
            }
        }
        else
            dims = await inspectImage(blob);
        if (signal?.aborted)
            throw new DOMException('Cancelled', 'AbortError');
        const m = { id: uid(), name: file.name, kind: 'photo', mime: isHEIC(file) ? file.type || 'image/heic' : blob.type || file.type || 'image/jpeg', blob, ...dims };
        mediaLibrary.set(m.id, m);
        return m;
    }
    catch (error) {
        if (isHEIC(file) && error.name !== 'AbortError')
            throw new Error(`${file.name}: ${error.message} You can also export a JPEG/PNG copy from Photos. Nothing was uploaded.`);
        throw error;
    }
}
export async function loadVideo(src) { return new Promise((resolve, reject) => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; const timeout = setTimeout(() => { v.src = ''; reject(new Error('This video could not be opened. Try an H.264 MP4 or a smaller WebM.')); }, 15000); v.onloadeddata = () => { clearTimeout(timeout); resolve(v); }; v.onerror = () => { clearTimeout(timeout); reject(new Error('This video codec is not supported in this browser. Try an H.264 MP4.')); }; v.src = src; v.load(); }); }
export async function seekVideo(v, time) {
    const target = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration - .025 : time, time));
    if (Math.abs(v.currentTime - target) < .015 && v.readyState >= 2)
        return;
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => { cleanup(); reject(new Error('Video seeking was interrupted.')); }, 5000); const cleanup = () => { clearTimeout(timeout); v.removeEventListener('seeked', done); v.removeEventListener('error', bad); }; const done = () => { cleanup(); resolve(); }, bad = () => { cleanup(); reject(new Error('Video decoding failed.')); }; v.addEventListener('seeked', done, { once: true }); v.addEventListener('error', bad, { once: true }); v.currentTime = target; });
}
class PixelWorker {
    worker;
    jobs = new Map();
    seq = 0;
    failed = false;
    async run(pixels, width, height, settings) {
        if (globalThis.__STILLROLL_OFFLINE__ || this.failed || typeof Worker === 'undefined')
            return processPixels(pixels, width, height, settings);
        if (!this.worker) {
            try {
                this.worker = new Worker(new URL('./grade-worker.js', import.meta.url), { type: 'module' });
                this.worker.onmessage = e => {
                    const j = this.jobs.get(e.data.id);
                    if (j) {
                        this.jobs.delete(e.data.id);
                        e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(new Uint8ClampedArray(e.data.buffer));
                    }
                };
                this.worker.onerror = () => {
                    this.failed = true;
                    for (const j of this.jobs.values())
                        j.reject(new Error('The local processing worker was interrupted. Please retry.'));
                    this.jobs.clear();
                    this.worker?.terminate();
                    this.worker = undefined;
                };
            }
            catch {
                this.failed = true;
                return processPixels(pixels, width, height, settings);
            }
        }
        const id = ++this.seq;
        return new Promise((resolve, reject) => { this.jobs.set(id, { resolve, reject }); this.worker.postMessage({ id, buffer: pixels.buffer, width, height, settings }, [pixels.buffer]); });
    }
    cancel() {
        this.worker?.terminate();
        this.worker = undefined;
        for (const j of this.jobs.values())
            j.reject(new DOMException('Cancelled', 'AbortError'));
        this.jobs.clear();
    }
}
const worker = new PixelWorker();
export const cancelProcessing = () => worker.cancel();
const cache = new Map();
let cachedPixels = 0;
function keep(key, image) {
    const pixels = image.width * image.height;
    cachedPixels -= cache.get(key)?.pixels || 0;
    cache.set(key, { image, pixels });
    cachedPixels += pixels;
    while (cachedPixels > 12000000 && cache.size > 1) {
        const k = cache.keys().next().value;
        cachedPixels -= cache.get(k).pixels;
        cache.delete(k);
    }
    return image;
}
export function clearMediaCache() { cache.clear(); cachedPixels = 0; }
async function rasterPhoto(n, exporting, scale, before, signal) {
    const m = await getMedia(n.assetId);
    const fitted = n.fit === 'fit' ? Math.min(n.w / m.width, n.h / m.height) : Math.max(n.w / m.width, n.h / m.height);
    const needed = Math.max(m.width, m.height) * fitted * scale * n.crop.zoom;
    const maxEdge = exporting ? Math.min(8192, Math.max(768, Math.ceil(needed / 128) * 128)) : Math.min(1280, Math.max(640, Math.ceil(needed / 128) * 128));
    const settings = before ? defaultGrade() : n.grade;
    const key = JSON.stringify([m.id, Math.ceil(maxEdge / 128) * 128, settings, n.cutout, n.videoStart || 0]);
    const existing = cache.get(key);
    if (existing) {
        cache.delete(key);
        cache.set(key, existing);
        return existing.image;
    }
    if (signal?.aborted)
        throw new DOMException('Cancelled', 'AbortError');
    let src = m.src;
    let revoke = false;
    if (m.blob) {
        src = blobURL(m.renderBlob || m.blob);
        revoke = true;
    }
    if (!src)
        throw new Error('Photo source is unavailable.');
    let im;
    try {
        im = m.kind === 'video' ? await loadVideo(src) : await imageFromURL(src, signal);
    }
    catch (e) {
        if (revoke)
            URL.revokeObjectURL(src);
        throw e;
    }
    if (im instanceof HTMLVideoElement)
        await seekVideo(im, n.videoStart || 0);
    const ratio = Math.min(1, maxEdge / Math.max(m.width, m.height), Math.sqrt((exporting ? 16000000 : 1800000) / (m.width * m.height)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(m.width * ratio));
    c.height = Math.max(1, Math.round(m.height * ratio));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0, c.width, c.height);
    if (im instanceof HTMLVideoElement) {
        im.pause();
        im.src = '';
    }
    else
        im.src = '';
    if (revoke)
        URL.revokeObjectURL(src);
    if (m.kind === 'photo' && !before) {
        let image = ctx.getImageData(0, 0, c.width, c.height);
        const result = await worker.run(image.data, c.width, c.height, settings).catch(error => { if (error.name === 'AbortError')
            throw error; return processPixels(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, settings); });
        if (signal?.aborted)
            throw new DOMException('Cancelled', 'AbortError');
        image = new ImageData(new Uint8ClampedArray(result), c.width, c.height);
        ctx.putImageData(image, 0, 0);
    }
    if (n.cutout?.enabled) {
        const cut = n.cutout, img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
        const hex = cut.color.replace('#', '');
        const kr = parseInt(hex.slice(0, 2), 16), kg = parseInt(hex.slice(2, 4), 16), kb = parseInt(hex.slice(4, 6), 16);
        const tolerance = cut.tolerance * 2.55, soft = Math.max(1, cut.softness * 2.55);
        for (let i = 0; i < d.length; i += 4) {
            const dist = Math.sqrt(((d[i] - kr) ** 2 + (d[i + 1] - kg) ** 2 + (d[i + 2] - kb) ** 2) / 3);
            d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, (dist - tolerance) / soft)));
        }
        ctx.putImageData(img, 0, 0);
    }
    if (n.cutout?.strokes?.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = ctx.lineJoin = 'round';
        for (const s of n.cutout.strokes) {
            ctx.lineWidth = s.size * c.width;
            ctx.beginPath();
            s.points.forEach(([x, y], i) => { i ? ctx.lineTo(x * c.width, y * c.height) : ctx.moveTo(x * c.width, y * c.height); });
            ctx.stroke();
        }
        ctx.restore();
    }
    return keep(key, c);
}
export async function prepareResources(nodes, options = {}) {
    await ensureFonts(nodes);
    if (options.signal?.aborted)
        throw new DOMException('Cancelled', 'AbortError');
    const map = new Map();
    const drawable = nodes.filter(n => (n.kind === 'photo' || n.kind === 'video' || n.kind === 'sticker') && !!n.assetId);
    let i = 0;
    for (const n of drawable) {
        if (options.signal?.aborted)
            throw new DOMException('Cancelled', 'AbortError');
        if (n.kind === 'photo' || n.kind === 'video')
            map.set(n.id, await rasterPhoto(n, !!options.exporting, options.scale || 1, !!options.before, options.signal));
        else if (n.kind === 'sticker') {
            const a = await getAsset(n.assetId);
            if (!a)
                throw new Error('A creative element is missing. Import a compatible project or remove that layer.');
            const edge = Math.min(2048, Math.max(256, Math.ceil(Math.max(n.w, n.h) * (options.scale || 1) / 128) * 128)), key = 'sticker:' + a.id + ':' + edge;
            let image = cache.get(key)?.image;
            if (!image) {
                const temporary = a.blob ? blobURL(a.blob) : undefined;
                let svg;
                try {
                    svg = await imageFromURL(temporary || a.src, options.signal);
                }
                finally {
                    if (temporary)
                        URL.revokeObjectURL(temporary);
                }
                const raster = document.createElement('canvas');
                const ratio = Math.min(edge / Math.max(svg.naturalWidth, svg.naturalHeight), Math.sqrt(4000000 / (svg.naturalWidth * svg.naturalHeight)));
                raster.width = Math.max(1, Math.round(svg.naturalWidth * ratio));
                raster.height = Math.max(1, Math.round(svg.naturalHeight * ratio));
                raster.getContext('2d').drawImage(svg, 0, 0, raster.width, raster.height);
                svg.src = '';
                image = keep(key, raster);
            }
            map.set(n.id, image);
        }
        options.onProgress?.(++i / drawable.length);
    }
    return map;
}
export async function mediaBlob(m) {
    if (m.blob)
        return m.blob;
    if (m.src) {
        const data = globalThis.__STILLROLL_ASSETS__?.[m.src];
        if (data) {
            const raw = atob(data.split(',')[1]);
            return new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type: m.mime });
        }
        const r = await fetch(m.src);
        if (!r.ok)
            throw new Error(`The sample asset ${m.name} could not be loaded.`);
        return r.blob();
    }
    throw new Error('Missing media source.');
}
export async function allProjectMedia(nodes, libraryIds = []) { const ids = [...new Set([...libraryIds, ...nodes.filter((n) => n.kind === 'photo' || n.kind === 'video').map(n => n.assetId)].filter(Boolean))]; return Promise.all(ids.map(getMedia)); }
export async function getAsset(id) {
    let asset = ASSETS.find(item => item.id === id);
    if (!asset) {
        asset = await loadAsset(id);
        if (asset)
            ASSETS.push(asset);
    }
    if (!asset)
        throw new Error('A creative element is missing. Restore a project backup or remove that layer.');
    return asset;
}
export async function allProjectAssets(nodes) {
    return Promise.all([...new Set(nodes.flatMap(node => node.kind === 'sticker' ? [node.assetId] : []))].map(getAsset));
}
export async function creativeBlob(asset) {
    if (asset.blob)
        return asset.blob;
    const embedded = globalThis.__STILLROLL_ASSETS__?.[asset.src];
    const response = await fetch(embedded || asset.src);
    if (!response.ok)
        throw new Error(`The element ${asset.name} could not load.`);
    return response.blob();
}
async function nativeWorkingPNG(blob, signal) {
    const url = blobURL(blob), canvas = document.createElement('canvas');
    try {
        const image = await imageFromURL(url, signal);
        const width = image.naturalWidth, height = image.naturalHeight;
        if (!width || !height || width * height > 64000000)
            throw new Error('This photo exceeds the 64-megapixel limit.');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        const renderBlob = await canvasBlob(canvas, 'image/png');
        image.src = '';
        if (signal?.aborted)
            throw new DOMException('Cancelled', 'AbortError');
        return { width, height, renderBlob };
    }
    finally {
        canvas.width = canvas.height = 0;
        URL.revokeObjectURL(url);
    }
}
