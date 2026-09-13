import { clone } from './model.js';
import { importMedia, mediaLibrary, getMedia, prepareResources } from './media.js';
import { renderPhotoFrame } from './render.js';
import { isPhotoSlot, photoSlots, setSlotPhoto, swapSlotPhotos } from './slots.js';
import { el, button, dialog, closeDialog, onDialogDispose, range, toast, sourceURL } from './ui.js';
import { clamp } from './geometry.js';
export class PhotoFlow {
    host;
    disposed = false;
    urls = new Map();
    cameraStream;
    constructor(host) {
        this.host = host;
    }
    node(id) {
        const n = this.host.project().nodes.find(n => n.id === id);
        if (!n || !isPhotoSlot(n))
            throw new Error('This photo frame is no longer in the project.');
        return n;
    }
    retain(ids) {
        const p = this.host.project();
        p.mediaIds = [...new Set([...(p.mediaIds || []), ...ids])];
    }
    show(id) {
        const n = this.node(id);
        this.host.focus(id);
        const body = el('div', { class: 'slot-sheet', 'data-slot-id': id }, el('p', { class: 'muted', text: 'The frame stays in place. Only its photo changes.' }), button('Upload photo', 'upload', () => this.upload(id), 'primary', 'full'), button('Take photo', 'camera', () => this.camera(id), 'secondary', 'full'), button('Choose from project', 'photo', () => this.chooseFromProject(id), 'secondary', 'full'));
        if (n.assetId)
            body.append(el('div', { class: 'slot-actions' }, button('Adjust crop', 'crop', () => this.crop(id), 'secondary'), button('Replace photo', 'replace', () => this.upload(id), 'ghost'), button('Remove photo', 'trash', () => { setSlotPhoto(this.host.project(), id, ''); this.host.commit(); closeDialog(); }, 'ghost')));
        body.append(el('hr'), button('Fill all photo slots', 'photo', () => this.batch(), 'ghost', 'full'), button('Fill this slide', 'photo', () => this.batch(this.host.activeSlide()), 'ghost', 'full'));
        dialog(n.name || 'Photo', body);
    }
    pick(multiple = false, capture = false) {
        return new Promise(resolve => {
            const input = el('input', { type: 'file', accept: 'image/*,.heic,.heif', multiple, hidden: true, ...(capture ? { capture: 'environment' } : {}) });
            let finished = false;
            const done = (files) => { if (finished)
                return; finished = true; input.remove(); resolve(files); };
            input.onchange = () => done(Array.from(input.files || []));
            input.addEventListener('cancel', () => done([]), { once: true });
            window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length)
                done([]); }, 1200), { once: true });
            document.body.append(input);
            input.click();
        });
    }
    async upload(id, capture = false) {
        const files = await this.pick(false, capture);
        if (files[0])
            await this.insert(files[0], id);
    }
    async insert(file, id) {
        let active = true;
        const controller = new AbortController();
        dialog('Adding photo', el('div', { 'data-photo-flow': 'import' }, el('p', { role: 'status', text: 'Opening the selected photo on this device…' }), button('Cancel', undefined, () => closeDialog(), 'secondary', 'full')));
        onDialogDispose(() => { active = false; controller.abort(); });
        try {
            const media = await importMedia(file, controller.signal);
            if (this.disposed || !active) {
                mediaLibrary.delete(media.id);
                return;
            }
            this.retain([this.node(id).assetId].filter(Boolean));
            setSlotPhoto(this.host.project(), id, media.id, media.kind);
            this.retain([media.id]);
            this.host.commit();
            await this.crop(id);
        }
        catch (error) {
            if (active) {
                this.show(id);
                throw error;
            }
        }
    }
    async url(id) {
        const media = await getMedia(id);
        if (media.src && !media.blob)
            return sourceURL(media.src);
        let url = this.urls.get(id);
        if (!url && media.blob) {
            url = URL.createObjectURL(media.renderBlob || media.blob);
            this.urls.set(id, url);
        }
        return url || '';
    }
    async available() {
        const p = this.host.project();
        const ids = [...new Set([...(p.mediaIds || []), ...photoSlots(p).map(n => n.assetId)].filter(Boolean))];
        const media = await Promise.all(ids.map(id => getMedia(id).catch(() => undefined)));
        return media.filter((m) => !!m && m.kind === 'photo');
    }
    async crop(id) {
        const initial = this.node(id), draft = clone(initial);
        if (!initial.assetId)
            return this.show(id);
        let live = true, image;
        const canvas = el('canvas', { class: 'crop-preview', tabindex: 0, 'aria-label': 'Photo crop. Drag to pan; use the controls below to zoom and fit.' });
        const viewport = el('div', { class: 'crop-viewport' }, canvas);
        const status = el('p', { class: 'hint', role: 'status', text: 'Preparing photo…' });
        const draw = () => {
            if (!live)
                return;
            const n = draft, dpr = Math.min(devicePixelRatio || 1, 2);
            const scale = Math.min((viewport.clientWidth || 340) / n.w, Math.min(300, innerHeight * .35) / n.h);
            canvas.style.width = n.w * scale + 'px';
            canvas.style.height = n.h * scale + 'px';
            canvas.width = Math.max(1, Math.round(n.w * scale * dpr));
            canvas.height = Math.max(1, Math.round(n.h * scale * dpr));
            const ctx = canvas.getContext('2d');
            ctx.scale(canvas.width / n.w, canvas.height / n.h);
            renderPhotoFrame(ctx, { ...n, shadow: 0, borderWidth: 0 }, image);
            this.host.redraw();
        };
        const sync = () => {
            const n = draft;
            body.querySelectorAll('input[data-crop]').forEach(input => {
                const key = input.dataset.crop;
                input.value = String(n.crop[key] * (key === 'zoom' ? 1 : 100));
                const out = input.closest('label')?.querySelector('output');
                if (out)
                    out.textContent = input.value + (key === 'zoom' ? '×' : '%');
            });
            fit.setAttribute('aria-pressed', String(n.fit === 'fit'));
            fill.setAttribute('aria-pressed', String(n.fit !== 'fit'));
            draw();
        };
        const setFit = (value) => { const n = draft; n.fit = value; n.crop = { x: .5, y: .5, zoom: 1 }; sync(); };
        const fit = button('Fit whole photo', undefined, () => setFit('fit'), 'secondary');
        const fill = button('Fill frame', undefined, () => setFit('fill'), 'secondary');
        const control = (key, label) => {
            const zoom = key === 'zoom';
            const row = range(label, initial.crop[key] * (zoom ? 1 : 100), zoom ? 1 : 0, zoom ? 8 : 100, zoom ? .05 : 1, value => { draft.crop[key] = value / (zoom ? 1 : 100); draw(); }, undefined, zoom ? '×' : '%');
            row.querySelector('input').dataset.crop = key;
            return row;
        };
        const body = el('div', { class: 'crop-sheet', 'data-photo-flow': 'crop' }, viewport, status, el('div', { class: 'actions fit-controls' }, fit, fill), control('zoom', 'Zoom'), el('div', { class: 'field-grid' }, control('x', 'Horizontal position'), control('y', 'Vertical position')), el('div', { class: 'actions sticky-actions' }, button('Cancel', undefined, () => closeDialog(), 'secondary'), button('Done', 'check', () => { const current = this.node(id); current.crop = clone(draft.crop); current.fit = draft.fit; this.host.commit(); closeDialog(); }, 'primary')));
        dialog('Adjust crop', body);
        const observer = new ResizeObserver(draw);
        observer.observe(viewport);
        onDialogDispose(() => {
            live = false;
            observer.disconnect();
        });
        const points = new Map();
        let pinch = { distance: 0, zoom: 1 };
        canvas.onpointerdown = event => {
            canvas.setPointerCapture(event.pointerId);
            points.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (points.size === 2) {
                const [a, b] = [...points.values()];
                pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: draft.crop.zoom };
            }
        };
        canvas.onpointermove = event => {
            const previous = points.get(event.pointerId);
            if (!previous || !image)
                return;
            const n = draft;
            points.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (points.size === 2 && pinch.distance > 0) {
                const [a, b] = [...points.values()];
                n.crop.zoom = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, 1, 8);
            }
            else {
                const im = image, factor = (n.fit === 'fit' ? Math.min(n.w / im.width, n.h / im.height) : Math.max(n.w / im.width, n.h / im.height)) * n.crop.zoom;
                const scale = canvas.getBoundingClientRect().width / n.w, dx = n.w - im.width * factor, dy = n.h - im.height * factor;
                if (Math.abs(dx) > .01)
                    n.crop.x = clamp(n.crop.x + (event.clientX - previous.x) / scale / dx, 0, 1);
                if (Math.abs(dy) > .01)
                    n.crop.y = clamp(n.crop.y + (event.clientY - previous.y) / scale / dy, 0, 1);
            }
            sync();
        };
        canvas.onpointerup = canvas.onpointercancel = event => { points.delete(event.pointerId); pinch.distance = 0; };
        canvas.onkeydown = event => {
            const delta = event.shiftKey ? .1 : .02, n = draft;
            if (event.key === 'ArrowLeft')
                n.crop.x = clamp(n.crop.x + delta, 0, 1);
            else if (event.key === 'ArrowRight')
                n.crop.x = clamp(n.crop.x - delta, 0, 1);
            else if (event.key === 'ArrowUp')
                n.crop.y = clamp(n.crop.y + delta, 0, 1);
            else if (event.key === 'ArrowDown')
                n.crop.y = clamp(n.crop.y - delta, 0, 1);
            else
                return;
            event.preventDefault();
            sync();
        };
        try {
            const resources = await prepareResources([draft], { scale: 2 });
            if (!live || this.disposed)
                return;
            image = resources.get(id);
            status.textContent = 'Drag to pan. Pinch or use Zoom. The frame and its rotation stay unchanged.';
            sync();
        }
        catch (error) {
            if (live)
                status.textContent = error.message;
        }
    }
    async chooseFromProject(id) {
        const items = await this.available();
        if (this.disposed)
            return;
        const grid = el('div', { class: 'photo-library' });
        const body = el('div', { 'data-photo-flow': 'choose' }, el('p', { class: 'muted', text: items.length ? 'Choose a photo already in this project.' : 'No project photos yet. Upload your first photo.' }), grid, button('Upload photo', 'upload', () => this.upload(id), 'primary', 'full'), button('Swap with another frame', 'replace', () => this.swap(id), 'ghost', 'full'));
        dialog('Project photos', body);
        for (const media of items) {
            const tile = button(media.name, undefined, async () => { setSlotPhoto(this.host.project(), id, media.id); this.host.commit(); await this.crop(id); }, 'plain', 'photo-tile');
            tile.replaceChildren(el('img', { src: await this.url(media.id), alt: media.name, loading: 'lazy' }));
            grid.append(tile);
        }
    }
    async swap(id) {
        const list = el('div', { class: 'slot-list' });
        dialog('Swap photos', list);
        for (const slot of photoSlots(this.host.project()).filter(n => n.id !== id)) {
            const row = button(slot.name, undefined, () => { swapSlotPhotos(this.host.project(), id, slot.id); this.host.commit(); closeDialog(); }, 'secondary', 'slot-assignment');
            if (slot.assetId)
                row.prepend(el('img', { src: await this.url(slot.assetId), alt: '', loading: 'lazy' }));
            list.append(row);
        }
    }
    stopCamera() { this.cameraStream?.getTracks().forEach(track => track.stop()); this.cameraStream = undefined; }
    async camera(id) {
        const video = el('video', { class: 'camera-preview', playsinline: true, muted: true, autoplay: true, 'aria-label': 'Live camera preview' });
        const status = el('p', { class: 'muted', role: 'status', text: 'Allow camera access to take a photo. No microphone is requested.' });
        let live = true;
        const capture = button('Capture photo', 'camera', async () => {
            if (!video.videoWidth || !video.videoHeight)
                return;
            const canvas = document.createElement('canvas'), scale = Math.min(1, 4096 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('The camera image could not be captured.')), 'image/jpeg', .96));
            this.stopCamera();
            closeDialog();
            canvas.width = canvas.height = 0;
            await this.insert(new File([blob], `Camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: blob.type }), id);
        }, 'primary', 'full');
        capture.disabled = true;
        const body = el('div', { 'data-photo-flow': 'camera' }, status, video, capture, button('Upload photo instead', 'upload', () => { this.stopCamera(); return this.upload(id); }, 'secondary', 'full'), button('Open phone camera', 'camera', () => { this.stopCamera(); return this.upload(id, true); }, 'ghost', 'full'), el('p', { class: 'hint', text: 'The phone-camera picker is a browser hint; some browsers show a normal file picker instead.' }));
        dialog('Take photo', body);
        const hidden = () => { if (document.hidden) {
            this.stopCamera();
            video.srcObject = null;
            capture.disabled = true;
            status.textContent = 'Camera stopped while the app was hidden. Close this sheet and choose Take photo to restart.';
        } };
        document.addEventListener('visibilitychange', hidden);
        onDialogDispose(() => { live = false; this.stopCamera(); video.srcObject = null; document.removeEventListener('visibilitychange', hidden); });
        if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            status.textContent = 'Live camera is unavailable here. Open phone camera or upload a photo instead. Live camera requires HTTPS or localhost.';
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
            if (!live || this.disposed || document.hidden) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            this.cameraStream = stream;
            video.srcObject = stream;
            video.onloadedmetadata = () => { if (live) {
                capture.disabled = false;
                status.textContent = 'Camera ready. Your photo stays on this device.';
            } };
            await video.play();
        }
        catch (error) {
            if (!live)
                return;
            this.stopCamera();
            const name = error.name;
            status.textContent = name === 'NotAllowedError' ? 'Camera permission was not granted. Upload a photo or use the phone-camera picker instead.' : 'The camera could not be opened. Upload a photo or use the phone-camera picker instead.';
        }
    }
    async batch(slide) {
        let items = await this.available(), selected = [], emptyOnly = true, live = true, importing = false;
        const overrides = new Map(), body = el('div', { class: 'batch-sheet', 'data-photo-flow': 'batch' });
        const status = el('p', { class: 'hint', role: 'status' });
        const targets = () => photoSlots(this.host.project(), slide, emptyOnly);
        const choose = async () => {
            const files = await this.pick(true);
            if (!files.length || !live)
                return;
            importing = true;
            status.textContent = 'Importing photos…';
            const failures = [];
            if (files.length > 50 || files.reduce((sum, file) => sum + file.size, 0) > 250000000) {
                importing = false;
                throw new Error('Choose up to 50 photos and 250 MB per batch.');
            }
            for (const [index, file] of files.entries()) {
                if (!live || this.disposed)
                    break;
                status.textContent = `Importing photo ${index + 1} of ${files.length}…`;
                try {
                    const media = await importMedia(file);
                    if (live) {
                        items.push(media);
                        selected.push(media.id);
                    }
                }
                catch (error) {
                    failures.push(error.message);
                }
            }
            importing = false;
            if (live) {
                render();
                status.textContent = failures.length ? failures.join(' ') : 'Photos are ready. Arrange them, then apply.';
            }
        };
        const apply = async () => {
            if (importing)
                return;
            const assignments = targets().map((node, index) => ({ node, id: overrides.has(node.id) ? overrides.get(node.id) : selected[index] })).filter(item => !!item.id);
            if (!assignments.length) {
                status.textContent = 'Choose photos or drop a photo onto a frame first.';
                return;
            }
            const media = await Promise.all(assignments.map(item => getMedia(item.id)));
            if (!live || this.disposed)
                return;
            assignments.forEach((item, index) => setSlotPhoto(this.host.project(), item.node.id, item.id, media[index].kind));
            this.retain([...selected, ...assignments.map(item => item.id)]);
            this.host.commit();
            closeDialog();
            toast(`${assignments.length} photo frames filled. Undo restores the whole batch.`, 'success');
        };
        const render = () => {
            const slots = targets(), tray = el('div', { class: 'assignment-tray' }), library = el('div', { class: 'batch-library photo-library' });
            const onlyEmpty = el('input', { type: 'checkbox', checked: emptyOnly, onchange: () => { emptyOnly = onlyEmpty.checked; render(); } });
            body.replaceChildren(el('p', { class: 'muted', text: `${slots.length} editable frames ${slide === undefined ? 'across this project' : 'on this slide'}. Thematic artwork is protected.` }), el('label', { class: 'check-field' }, onlyEmpty, el('span', { text: 'Empty and demo slots only' })), button('Add photos to tray', 'upload', choose, 'secondary', 'full'), status, el('h3', { text: `Assignment order · ${selected.length} photos` }), tray, el('h3', { text: 'Project photos' }), library);
            const thumb = (id, label) => {
                const img = el('img', { alt: label, loading: 'lazy' });
                this.url(id).then(url => { if (live)
                    img.src = url; }).catch(() => { });
                return img;
            };
            selected.forEach((id, index) => {
                const name = items.find(m => m.id === id)?.name || `Photo ${index + 1}`;
                const card = el('div', { class: 'tray-item', draggable: true, ondragstart: (event) => event.dataTransfer?.setData('application/x-stillroll-media', id) }, thumb(id, name), el('span', { class: 'hint', text: String(index + 1) }));
                const move = (delta) => { const target = index + delta; if (target < 0 || target >= selected.length)
                    return; [selected[index], selected[target]] = [selected[target], selected[index]]; render(); };
                card.append(el('div', { class: 'actions' }, button(`Move photo ${index + 1} earlier`, 'left', () => move(-1), 'ghost', 'icon-only'), button(`Move photo ${index + 1} later`, 'right', () => move(1), 'ghost', 'icon-only'), button(`Remove photo ${index + 1} from tray`, 'close', () => { selected.splice(index, 1); render(); }, 'ghost', 'icon-only')));
                tray.append(card);
            });
            items.forEach(media => {
                const tile = button(media.name, undefined, () => { selected = selected.includes(media.id) ? selected.filter(id => id !== media.id) : [...selected, media.id]; render(); }, 'plain', 'photo-tile');
                tile.setAttribute('aria-pressed', String(selected.includes(media.id)));
                tile.replaceChildren(thumb(media.id, media.name));
                library.append(tile);
            });
            const list = el('div', { class: 'slot-list' });
            body.append(el('h3', { text: 'Frame assignments' }), list);
            slots.forEach((slot, index) => {
                const assigned = overrides.has(slot.id) ? overrides.get(slot.id) : selected[index] || '';
                const choice = el('select', { class: 'input', 'aria-label': `Photo for frame ${index + 1}`, onchange: () => { overrides.set(slot.id, choice.value); render(); } }, el('option', { value: '', text: 'Keep current photo' }));
                items.forEach(media => choice.append(el('option', { value: media.id, text: media.name })));
                choice.value = assigned;
                const row = el('div', { class: 'slot-assignment', 'data-slot-id': slot.id, ondragover: (event) => event.preventDefault(), ondrop: (event) => {
                        event.preventDefault();
                        const id = event.dataTransfer?.getData('application/x-stillroll-media');
                        if (id && items.some(m => m.id === id)) {
                            overrides.set(slot.id, id);
                            render();
                        }
                    } }, assigned || slot.assetId ? thumb(assigned || slot.assetId, '') : el('span', { class: 'empty-slot-thumb', text: '+' }), el('div', {}, el('p', { text: `${index + 1}. ${slot.name}` }), choice));
                list.append(row);
            });
            const applyButton = button('Apply photo assignments', 'check', apply, 'primary');
            applyButton.disabled = importing || !slots.length || (!selected.length && ![...overrides.values()].some(Boolean));
            body.append(el('p', { class: 'hint', text: 'Drag tray photos onto frames, use the frame menus, or change tray order. An explicit frame assignment overrides tray order. All changes apply as one undoable action.' }), el('div', { class: 'actions sticky-actions' }, button('Cancel', undefined, () => closeDialog(), 'secondary'), applyButton));
        };
        dialog(slide === undefined ? 'Fill all photo slots' : `Fill slide ${slide + 1}`, body);
        onDialogDispose(() => { live = false; });
        render();
    }
    dispose() {
        this.disposed = true;
        this.stopCamera();
        if (document.querySelector('#sheet[open] [data-photo-flow]'))
            closeDialog();
        for (const url of this.urls.values())
            URL.revokeObjectURL(url);
        this.urls.clear();
    }
}
