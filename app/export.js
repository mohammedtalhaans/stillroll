import { ASSETS } from './assets.js';
import { isHEIC, decodeHEIC } from './heic.js';
import { validateProject, uid, UNIT } from './model.js';
import { allProjectAssets, creativeBlob, inspectImage, sanitizeSVG, prepareResources, allProjectMedia, mediaBlob, mediaLibrary, canvasBlob, blobURL, loadVideo, seekVideo } from './media.js';
import { sceneCanvas, nodesForSlide, renderScene } from './render.js';
export function slug(text) { return text.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'stillroll-story'; }
export function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 120000); }
export async function exportImages(p, o) {
    validateProject(p);
    const files = [];
    if (!Number.isFinite(o.width) || !Number.isFinite(o.quality) || o.quality < 0 || o.quality > 1 || !['png', 'jpeg', 'webp'].includes(o.format))
        throw new Error('Choose a supported image format and quality.');
    if (o.width < 320 || o.width > 2160 || o.width * o.width * p.height / p.width > 8294400)
        throw new Error('Please export at 320–2160 px wide and no more than 8 megapixels per slide.');
    for (let i = 0; i < p.slides.length; i++) {
        if (o.signal?.aborted)
            throw new DOMException('Export cancelled. Your project is safe.', 'AbortError');
        o.progress?.(i / p.slides.length, `Rendering slide ${i + 1} of ${p.slides.length}`);
        await new Promise(r => setTimeout(r, 0));
        const nodes = nodesForSlide(p, i);
        const res = await prepareResources(nodes, { exporting: true, scale: o.width / UNIT, signal: o.signal });
        const c = sceneCanvas(p, res, i, o.width);
        const blob = await canvasBlob(c, 'image/' + o.format, o.quality);
        c.width = c.height = 1;
        files.push({ name: `${slug(p.name)}-${String(i + 1).padStart(2, '0')}.${o.format === 'jpeg' ? 'jpg' : o.format}`, blob, slide: i });
    }
    o.progress?.(1, 'Ready to save');
    return files;
}
let zipPromise;
export async function zipLibrary() {
    if (window.JSZip)
        return window.JSZip;
    if (!zipPromise)
        zipPromise = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = './vendor/jszip-3.10.1.min.js'; script.onload = () => resolve(window.JSZip); script.onerror = () => { zipPromise = undefined; reject(new Error('The ZIP tool could not load. You can still save images individually.')); }; document.head.append(script); });
    return zipPromise;
}
export async function zipImages(files, progress, credits) {
    const Zip = await zipLibrary(), zip = new Zip();
    for (const f of files)
        zip.file(f.name, f.blob);
    if (credits)
        zip.file('PHOTO-CREDITS.txt', credits);
    return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => progress?.(m.percent / 100));
}
export async function projectCredits(p) { const media = await allProjectMedia(p.nodes); const rows = media.filter(m => m.credit || m.creator).map(m => `${m.name} — ${m.creator || m.credit}\nLicense: ${m.license || 'See source'}${m.license === 'CC-BY-2.0' ? ' (https://creativecommons.org/licenses/by/2.0/)' : ''}\nSource: ${m.source || 'Original work'}\nChanges: ${m.modifications || 'None'}; may be cropped, framed and colour graded in this story.`); return 'PHOTO CREDITS — ' + p.name + '\n\n' + (rows.length ? rows.join('\n\n') : 'No bundled sample photos are used in this project. You are responsible for permission to use your own media.') + '\n\nOriginal Stillroll template and creative SVG source: MIT. Public-domain imagery does not imply creator or agency endorsement.\n'; }
export async function portableProject(input) {
    const p = validateProject(input), media = await allProjectMedia(p.nodes, p.recipe ? [] : p.mediaIds || []), assets = await allProjectAssets(p.nodes);
    const Zip = await zipLibrary(), zip = new Zip();
    let bytes = 0;
    const metadata = [], assetMetadata = [];
    const add = async (path, blob) => { bytes += blob.size; if (bytes > 500000000)
        throw new Error('This project backup exceeds 500 MB. Make a smaller project before packing.'); zip.file(path, await blob.arrayBuffer()); };
    for (const [index, m] of media.entries()) {
        const blob = await mediaBlob(m), path = `media/${index}.original`;
        const { blob: original, renderBlob, src, ...meta } = m;
        await add(path, blob);
        const renderPath = renderBlob ? `media/${index}.render` : undefined;
        if (renderBlob)
            await add(renderPath, renderBlob);
        metadata.push({ ...meta, path, mime: blob.type || m.mime, renderPath, renderMime: renderBlob?.type });
    }
    for (const [index, asset] of assets.entries()) {
        const blob = await creativeBlob(asset), path = `assets/${index}.image`;
        const { blob: original, src, ...meta } = asset;
        await add(path, blob);
        assetMetadata.push({ ...meta, path, mime: blob.type || asset.mime || 'image/svg+xml' });
    }
    zip.file('project.json', JSON.stringify({ format: 'stillroll-project', version: 2, project: p, media: metadata, assets: assetMetadata }));
    zip.file('PHOTO-CREDITS.txt', await projectCredits(p));
    zip.file('README.txt', 'Open this .stillroll file using Import project. Version 2 includes original photos, safe working copies where needed, and the actual creative-element bytes. A layout recipe clears editable photo slots but retains fixed thematic artwork.');
    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
const archivePath = (path, prefix) => typeof path === 'string' && new RegExp('^' + prefix + '/[a-zA-Z0-9_.-]+$').test(path) && !path.includes('..');
export async function importProject(file) {
    if (!file.size || file.size > 550000000)
        throw new Error('Choose a Stillroll backup smaller than 550 MB.');
    const Zip = await zipLibrary(), zip = await Zip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files);
    if (entries.length > 2200)
        throw new Error('The project archive contains too many files.');
    let expanded = 0;
    for (const entry of entries) {
        const size = Number(entry?._data?.uncompressedSize || 0);
        expanded += size;
        if (!Number.isFinite(size) || size < 0 || size > 120000000 || expanded > 500000000)
            throw new Error('The expanded project archive is too large.');
    }
    const read = async (name) => {
        const entry = zip.file(name);
        if (!entry)
            throw new Error('This archive is not a complete Stillroll project.');
        if (Number(entry._data?.uncompressedSize || 0) > 8000000)
            throw new Error('The project metadata is too large.');
        return JSON.parse(await entry.async('string'));
    };
    const data = await read('project.json');
    if (data.format !== 'stillroll-project' || ![1, 2].includes(data.version))
        throw new Error('This project backup version is not supported.');
    const p = validateProject(data.project), metadata = data.media;
    if (!Array.isArray(metadata) || metadata.length > 1000)
        throw new Error('The photo manifest is invalid.');
    const ids = new Map(), pendingMedia = [], pendingAssets = [], assetIds = new Map();
    const safeString = (value, max = 500) => typeof value === 'string' && value.length <= max;
    for (const meta of metadata) {
        if (!meta || !safeString(meta.id, 150) || !meta.id || ids.has(meta.id) || !safeString(meta.name) || !safeString(meta.mime, 120) || !['photo', 'video'].includes(meta.kind) || !meta.mime.startsWith(meta.kind === 'video' ? 'video/' : 'image/') || !Number.isFinite(meta.width) || !Number.isFinite(meta.height) || meta.width < 1 || meta.height < 1 || meta.width * meta.height > 64000000 || !archivePath(meta.path, 'media'))
            throw new Error('A photo record in the backup is invalid.');
        const entry = zip.file(meta.path);
        if (!entry)
            throw new Error('An original photo is missing from this backup.');
        const blob = new Blob([await entry.async('uint8array')], { type: meta.mime });
        let renderBlob;
        if (meta.renderPath) {
            if (!archivePath(meta.renderPath, 'media') || !zip.file(meta.renderPath) || !safeString(meta.renderMime, 120) || !meta.renderMime.startsWith('image/'))
                throw new Error('A working photo is missing or invalid.');
            renderBlob = new Blob([await zip.file(meta.renderPath).async('uint8array')], { type: meta.renderMime });
        }
        if (meta.kind === 'photo' && meta.mime === 'image/svg+xml')
            renderBlob = new Blob([sanitizeSVG(await blob.text())], { type: 'image/svg+xml' });
        if (renderBlob?.type === 'image/svg+xml')
            renderBlob = new Blob([sanitizeSVG(await renderBlob.text())], { type: 'image/svg+xml' });
        const id = uid();
        ids.set(meta.id, id);
        const m = { id, name: meta.name, kind: meta.kind, mime: meta.mime, width: meta.width, height: meta.height, blob, ...(renderBlob ? { renderBlob } : {}) };
        for (const key of ['credit', 'creator', 'license', 'source', 'modifications'])
            if (safeString(meta[key], 10000))
                m[key] = meta[key];
        for (const key of ['reviewRequired', 'generated'])
            if (typeof meta[key] === 'boolean')
                m[key] = meta[key];
        if (meta.kind === 'video' && Number.isFinite(meta.duration) && meta.duration > 0 && meta.duration <= 86400)
            m.duration = meta.duration;
        if (meta.kind === 'photo') {
            let dimensions;
            try {
                dimensions = await inspectImage(renderBlob || blob);
            }
            catch (error) {
                if (!isHEIC({ name: meta.name, type: meta.mime }))
                    throw error;
                const decoded = await decodeHEIC(blob);
                m.renderBlob = decoded.renderBlob;
                dimensions = decoded;
            }
            m.width = dimensions.width;
            m.height = dimensions.height;
        }
        pendingMedia.push(m);
    }
    const assetMetadata = data.version === 2 ? data.assets : [];
    if (!Array.isArray(assetMetadata) || assetMetadata.length > 500)
        throw new Error('The creative-element manifest is invalid.');
    for (const meta of assetMetadata) {
        if (!meta || !safeString(meta.id, 150) || !meta.id || assetIds.has(meta.id) || !safeString(meta.name) || !safeString(meta.mime, 120) || !meta.mime.startsWith('image/') || !archivePath(meta.path, 'assets') || !zip.file(meta.path))
            throw new Error('A creative element in the backup is invalid.');
        let blob = new Blob([await zip.file(meta.path).async('uint8array')], { type: meta.mime });
        if (meta.mime === 'image/svg+xml')
            blob = new Blob([sanitizeSVG(await blob.text())], { type: 'image/svg+xml' });
        await inspectImage(blob);
        const id = uid();
        assetIds.set(meta.id, id);
        const asset = { id, name: meta.name, collection: safeString(meta.collection) ? meta.collection : 'Project elements', tags: Array.isArray(meta.tags) ? meta.tags.filter((v) => safeString(v, 100)).slice(0, 50) : [], src: '', blob, mime: blob.type, creator: safeString(meta.creator) ? meta.creator : 'User-provided element', license: safeString(meta.license) ? meta.license : 'User-provided; terms not verified', original: meta.original === true };
        for (const key of ['source', 'modifications'])
            if (safeString(meta[key], 10000))
                asset[key] = meta[key];
        for (const key of ['reviewRequired', 'generated'])
            if (typeof meta[key] === 'boolean')
                asset[key] = meta[key];
        pendingAssets.push(asset);
    }
    for (const node of p.nodes) {
        if (node.kind === 'photo' || node.kind === 'video') {
            if (node.assetId && !ids.has(node.assetId))
                throw new Error('A referenced photo is missing from this project.');
            if (node.assetId)
                node.assetId = ids.get(node.assetId);
            if (node.demoAssetId && ids.has(node.demoAssetId))
                node.demoAssetId = ids.get(node.demoAssetId);
        }
        if (node.kind === 'sticker') {
            if (assetIds.has(node.assetId))
                node.assetId = assetIds.get(node.assetId);
            else if (!ASSETS.some(asset => asset.id === node.assetId))
                throw new Error('A legacy creative element is unavailable. Restore this backup with its original compatible Stillroll asset library.');
        }
    }
    if (p.mediaIds)
        p.mediaIds = p.mediaIds.map(id => { if (!ids.has(id))
            throw new Error('A project-library photo is missing from this backup.'); return ids.get(id); });
    p.id = uid();
    p.updated = Date.now();
    const restored = validateProject(p);
    for (const media of pendingMedia)
        mediaLibrary.set(media.id, media);
    ASSETS.push(...pendingAssets);
    return restored;
}
export function nativeFiles(files) { return files.map(f => new File([f.blob], f.name, { type: f.blob.type })); }
export function canShare(files) {
    try {
        return !!navigator.canShare?.({ files: nativeFiles(files) });
    }
    catch {
        return false;
    }
}
export function prefersNativeSave(files) {
    try {
        const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches;
        return touchDevice && canShare(files);
    }
    catch {
        return false;
    }
}
export async function shareFiles(files) {
    if (!canShare(files))
        throw new Error('File sharing is unavailable here. Save the images individually instead.');
    await navigator.share({ files: nativeFiles(files) });
}
export async function saveOutput(file) {
    if (prefersNativeSave([file])) {
        await shareFiles([file]);
        return 'shared';
    }
    download(file.blob, file.name);
    return 'downloaded';
}
export function videoMime() {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream)
        return '';
    return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
}
/** Foreground, muted video rendering. Actual capture, not a static "video preview". */
export async function exportVideo(p, slide, duration, width, signal, progress) {
    validateProject(p);
    if (!Number.isInteger(slide) || !p.slides[slide] || !Number.isFinite(duration) || duration < 1 || duration > 15 || !Number.isFinite(width) || width < 320 || width > 1080 || width * width * p.height / p.width > 8294400)
        throw new Error('Choose an existing slide, 1–15 seconds and 320–1080 px video width.');
    const mime = videoMime();
    if (!mime)
        throw new Error('Video recording is not supported in this browser. Export still images instead.');
    const nodes = nodesForSlide(p, slide);
    const res = await prepareResources(nodes, { exporting: true, scale: width / UNIT, signal });
    const videos = [];
    const c = sceneCanvas(p, res, slide, width), ctx = c.getContext('2d');
    let recorder, stream;
    try {
        for (const n of nodes) {
            if (n.kind !== 'video')
                continue;
            const { getMedia } = await import('./media.js');
            const m = await getMedia(n.assetId), url = blobURL(await mediaBlob(m));
            const video = await loadVideo(url);
            await seekVideo(video, n.videoStart || 0);
            video.loop = true;
            videos.push({ node: n, video, url });
            res.set(n.id, video);
        }
        stream = c.captureStream(30);
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
        const chunks = [];
        const done = new Promise((resolve, reject) => {
            recorder.ondataavailable = e => {
                if (e.data.size)
                    chunks.push(e.data);
            };
            recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }));
            recorder.onerror = () => reject(new Error('Recording was interrupted. Keep this tab open and try again.'));
        });
        for (const v of videos)
            await v.video.play();
        recorder.start(200);
        const start = performance.now();
        await new Promise((resolve, reject) => {
            function frame() {
                if (signal.aborted) {
                    reject(new DOMException('Video export cancelled.', 'AbortError'));
                    return;
                }
                if (document.visibilityState === 'hidden') {
                    reject(new Error('The tab was hidden. Keep Stillroll in the foreground while recording.'));
                    return;
                }
                renderScene(ctx, p, res, { scale: width / UNIT, slide });
                const elapsed = performance.now() - start;
                progress(Math.min(1, elapsed / (duration * 1000)));
                if (elapsed >= duration * 1000)
                    resolve();
                else
                    requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        });
        recorder.stop();
        const blob = await done;
        if (blob.size < 1000)
            throw new Error('The recording was empty. Please try again.');
        return { name: `${slug(p.name)}-${String(slide + 1).padStart(2, '0')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, blob, slide };
    }
    finally {
        if (recorder && recorder.state !== 'inactive')
            recorder.stop();
        stream?.getTracks().forEach(t => t.stop());
        for (const v of videos) {
            v.video.pause();
            v.video.src = '';
            URL.revokeObjectURL(v.url);
        }
        c.width = c.height = 1;
    }
}
export function planningCalendar(p, date) {
    const start = new Date(date);
    if (!Number.isFinite(start.getTime()))
        throw new Error('Choose a date and time.');
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
    return new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Stillroll//Local planning//EN\r\nBEGIN:VEVENT\r\nUID:${p.id}@stillroll.local\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(start)}\r\nSUMMARY:${escape('Post: ' + p.name)}\r\nDESCRIPTION:${escape('Manual posting reminder. Stillroll does not automatically publish.\n' + p.notes)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`], { type: 'text/calendar' });
}
