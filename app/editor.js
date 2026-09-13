import { fontFallbacks, retryFonts } from './fonts.js';
import { FONT_LABELS } from './model.js';
import { tileOrigin, worldSize, ownerSlide } from './model.js';
import { PhotoFlow } from './photo-flow.js';
import { isPhotoSlot, isFilledSlot, photoSlots, templateRecipe } from './slots.js';
import { UNIT, uid, clone, designHeight, newPhoto, newText, newShape, baseNode, defaultGrade, resizeProject, duplicateSlide, removeSlide, moveSlide, validateProject } from './model.js';
import { History, contains, corners, bounds, snapPosition, clamp } from './geometry.js';
import { allProjectAssets, prepareResources, mediaLibrary, allProjectMedia, importMedia, blobURL, clearMediaCache, cancelProcessing } from './media.js';
import { renderScene, sceneCanvas, visibleNodes, nodesForSlide, layoutText, textLines, clearRenderCache } from './render.js';
import { saveProject, probeStorage } from './storage.js';
import { ASSETS } from './assets.js';
import { GRADES } from './grading.js';
import { el, button, icon, field, numberField, colorField, select, range, dialog, closeDialog, toast, empty, sourceURL } from './ui.js';
import { exportImages, portableProject, projectCredits, download, zipImages, canShare, shareFiles, prefersNativeSave, saveOutput, exportVideo, videoMime, planningCalendar, slug } from './export.js';
export class Editor {
    root;
    onHome;
    project;
    history;
    selected = new Set();
    activeSlide = 0;
    scale = 1;
    panX = 0;
    panY = 0;
    hand = false;
    layoutMode = false;
    showSeams = true;
    photoFlow;
    saveWarning;
    committedRevision = -1;
    saveQueue = Promise.resolve(true);
    boundUnload = (e) => { if (!this.isSaved) {
        e.preventDefault();
        e.returnValue = '';
    } };
    get isSaved() { return this.committedRevision === this.saveEpoch; }
    before = false;
    shell;
    stage;
    canvas;
    overlay;
    inspector;
    library;
    activeLibraryTool = 'photos';
    strip;
    status;
    undoButton;
    redoButton;
    zoomLabel;
    resources = new Map();
    epoch = 0;
    disposed = false;
    resourceTimer = 0;
    saveTimer = 0;
    saveEpoch = 0;
    storageWarningShown = false;
    drag;
    pendingTapId;
    pinch;
    pointers = new Map();
    guides = [];
    resizeObserver;
    urls = new Map();
    importTarget;
    importFill = false;
    boundsBefore;
    boundKey;
    viewWidth = 0;
    viewHeight = 0;
    constructor(root, p, onHome) {
        this.root = root;
        this.onHome = onHome;
        this.project = validateProject(p);
        this.history = new History(this.project);
        this.boundKey = e => this.key(e);
        this.photoFlow = new PhotoFlow({ project: () => this.project, commit: () => this.commit(), redraw: () => this.draw(), activeSlide: () => this.activeSlide, focus: id => { this.selected = new Set([id]); this.selectionBar(); this.draw(); } });
        this.build();
        window.addEventListener('beforeunload', this.boundUnload);
        document.addEventListener('keydown', this.boundKey);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.stage);
        this.resize();
        this.refresh();
        this.scheduleSave();
        void probeStorage().catch(error => { if (!this.disposed && !this.isSaved) {
            this.saveWarning.hidden = false;
            this.saveWarning.title = error.message;
        } });
    }
    get selection() { return this.project.nodes.filter(n => this.selected.has(n.id)); }
    get first() { return this.selection[0]; }
    get origin() { return tileOrigin(this.project, this.activeSlide); }
    get mobile() { return window.innerWidth < 960; }
    build() {
        this.root.replaceChildren();
        document.body.classList.add('editing');
        this.status = el('span', { class: 'save-status', text: 'Saving', role: 'status' });
        this.undoButton = button('Undo', 'undo', () => this.undo(), 'ghost', 'icon-only');
        this.redoButton = button('Redo', 'redo', () => this.redo(), 'ghost', 'icon-only');
        const title = el('input', { class: 'project-title', 'aria-label': 'Project name', maxlength: 150, value: this.project.name, onchange: (e) => { this.project.name = e.target.value.trim() || 'Untitled project'; this.commit(); } });
        const header = el('header', { class: 'editor-header glass' }, el('div', { class: 'editor-back' }, button('Exit editor', 'back', () => this.leave(), 'ghost', 'editor-exit'), el('span', { class: 'wordmark small', text: 'stillroll' })), el('div', { class: 'project-heading' }, title, this.status), el('div', { class: 'header-actions' }, this.undoButton, this.redoButton, button('Preview', 'eye', () => this.preview(), 'secondary', 'preview-button'), button('Export', 'export', () => this.exportSheet(), 'primary')));
        this.library = el('aside', { class: 'library-panel', 'aria-label': 'Creative library' });
        this.inspector = el('aside', { class: 'inspector-panel', 'aria-label': 'Selected layer settings' });
        this.stage = el('div', { class: 'stage', 'aria-label': 'Carousel canvas' });
        this.canvas = el('canvas', { class: 'art-canvas', 'aria-hidden': 'true' });
        this.overlay = el('canvas', { class: 'interaction-canvas', tabindex: 0, role: 'application', 'aria-label': 'Photo editor. Tap a photo to replace it. Drag to pan. Turn on Layout mode to move and resize layers. Photo frames are also listed in Photos.' });
        this.stage.append(this.canvas, this.overlay);
        this.zoomLabel = el('span', { class: 'zoom-label', text: '100%' });
        const bar = el('div', { class: 'canvas-topbar' }, el('span', { class: 'canvas-caption', text: 'Tap a photo to replace it' }), el('div', { class: 'view-controls' }, button('Zoom out', 'minus', () => this.zoom(.82), 'ghost', 'icon-only'), this.zoomLabel, button('Zoom in', 'plus', () => this.zoom(1.22), 'ghost', 'icon-only'), button('Fit slide', 'fit', () => this.fit(), 'ghost', 'icon-only'), button('See all slides', 'grid', () => this.overview(), 'ghost', 'icon-only')));
        this.strip = el('nav', { class: 'slide-strip', 'aria-label': 'Slides' });
        const rail = el('nav', { class: 'tool-rail glass', 'aria-label': 'Editing tools' });
        for (const [label, id, ic] of [['Photos', 'photos', 'photo'], ['Text', 'text', 'text'], ['Elements', 'assets', 'stickers'], ['Looks', 'looks', 'looks'], ['Layers', 'layers', 'layers'], ['Canvas', 'format', 'grid']])
            rail.append(button(label, ic, () => this.tool(id), 'ghost', 'tool-button'));
        const stagecol = el('main', { class: 'canvas-column' }, bar, this.stage, el('div', { class: 'canvas-footer' }, button('Previous slide', 'back', () => this.goSlide(this.activeSlide - 1), 'ghost', 'icon-only'), this.strip, button('Next slide', 'next', () => this.goSlide(this.activeSlide + 1), 'ghost', 'icon-only')), el('div', { class: 'selection-bar' }, button('Hand / canvas pan', 'pan', () => { this.hand = !this.hand; this.overlay.style.cursor = this.hand ? 'grab' : 'default'; this.selectionBar(); }, 'ghost', 'pan-button'), el('span', { class: 'selection-hint', text: 'Tap a layer to edit. Drag to arrange.' }), button('Edit selection', 'pen', () => this.tool('inspect'), 'secondary', 'edit-selection')), rail);
        const layout = button('Layout mode', 'layers', () => { this.layoutMode = !this.layoutMode; layout.setAttribute('aria-pressed', String(this.layoutMode)); this.updateInspector(); this.selectionBar(); this.draw(); }, 'secondary', 'layout-mode');
        layout.setAttribute('aria-pressed', 'false');
        bar.prepend(layout);
        const seams = button('Seam guides', 'grid', () => { this.showSeams = !this.showSeams; seams.setAttribute('aria-pressed', String(this.showSeams)); this.draw(); }, 'ghost', 'icon-only');
        seams.setAttribute('aria-pressed', 'true');
        bar.querySelector('.view-controls').append(seams);
        this.saveWarning = el('div', { class: 'persistent-save-warning', role: 'alert', hidden: true }, el('span', { text: 'Drafts can’t be saved in this browser. Download a project backup before closing.' }), button('Download project backup', 'save', () => this.backup(), 'secondary'));
        const fontNote = el('div', { class: 'font-warning', hidden: true, role: 'status' }, el('span', { text: 'Some artwork fonts could not load. Preview and export use the visible fallback.' }), button('Retry fonts', 'reset', () => { retryFonts(); return this.loadResources(); }, 'ghost'));
        this.shell = el('div', { class: 'editor-shell' }, header, this.saveWarning, fontNote, el('div', { class: 'editor-workspace' }, this.library, stagecol, this.inspector));
        this.root.append(this.shell);
        this.library.replaceChildren(this.photosPanel());
        this.bindCanvas();
        const file = document.getElementById('media-input');
        file.onchange = () => void this.receiveFiles(Array.from(file.files || []));
        this.stage.addEventListener('dragover', e => { e.preventDefault(); this.stage.classList.add('drop-active'); });
        this.stage.addEventListener('dragleave', () => this.stage.classList.remove('drop-active'));
        this.stage.addEventListener('drop', e => { e.preventDefault(); this.stage.classList.remove('drop-active'); this.importFill = false; void this.receiveFiles(Array.from(e.dataTransfer?.files || [])); });
    }
    pixelRatio() { return Math.min(this.mobile ? 1.5 : 2, devicePixelRatio || 1); }
    resize() {
        if (this.disposed)
            return;
        const rect = this.stage.getBoundingClientRect(), was = this.viewWidth > 0, widthChanged = Math.abs(rect.width - this.viewWidth) > 30;
        this.viewWidth = rect.width;
        this.viewHeight = rect.height;
        const dpr = this.pixelRatio();
        for (const c of [this.canvas, this.overlay]) {
            c.width = Math.max(1, Math.round(rect.width * dpr));
            c.height = Math.max(1, Math.round(rect.height * dpr));
        }
        if (!was || widthChanged)
            this.fit();
        else {
            this.panY = (rect.height - designHeight(this.project) * this.scale) / 2 - this.origin.y * this.scale;
            this.panX = (rect.width - UNIT * this.scale) / 2 - this.origin.x * this.scale;
            this.draw();
        }
        this.loadResources();
    }
    fit() { const h = designHeight(this.project); this.scale = Math.max(.12, Math.min((this.viewWidth - 42) / UNIT, (this.viewHeight - 42) / h, 1.45)); this.panX = (this.viewWidth - UNIT * this.scale) / 2 - this.origin.x * this.scale; this.panY = (this.viewHeight - h * this.scale) / 2 - this.origin.y * this.scale; this.draw(); this.loadResources(); }
    overview() { const size = worldSize(this.project); this.scale = Math.max(.015, Math.min((this.viewWidth - 38) / size.w, (this.viewHeight - 42) / size.h)); this.panX = (this.viewWidth - size.w * this.scale) / 2; this.panY = (this.viewHeight - size.h * this.scale) / 2; this.draw(); this.loadResources(); }
    zoom(factor) { const old = this.scale; this.scale = clamp(this.scale * factor, .015, 4); const r = this.scale / old; this.panX = this.viewWidth / 2 - (this.viewWidth / 2 - this.panX) * r; this.panY = this.viewHeight / 2 - (this.viewHeight / 2 - this.panY) * r; this.draw(); this.queueResources(); }
    goSlide(i) { this.activeSlide = clamp(i, 0, this.project.slides.length - 1); this.panX = (this.viewWidth - UNIT * this.scale) / 2 - this.origin.x * this.scale; this.panY = (this.viewHeight - designHeight(this.project) * this.scale) / 2 - this.origin.y * this.scale; this.draw(); this.renderStrip(); this.updateLibrary(); this.queueResources(); }
    queueResources() { clearTimeout(this.resourceTimer); this.resourceTimer = window.setTimeout(() => this.loadResources(), 100); }
    async loadResources() {
        const token = ++this.epoch;
        try {
            const left = -this.panX / this.scale, right = (this.viewWidth - this.panX) / this.scale;
            const margin = this.mobile ? 30 : 100;
            const res = await prepareResources(visibleNodes(this.project, left - margin, right + margin, -this.panY / this.scale - margin, (this.viewHeight - this.panY) / this.scale + margin), { scale: this.scale * this.pixelRatio(), before: this.before });
            if (token !== this.epoch || this.disposed)
                return;
            this.resources = res;
            const fontNote = this.shell.querySelector('.font-warning');
            if (fontNote)
                fontNote.hidden = !fontFallbacks().length;
            this.draw();
        }
        catch (e) {
            if (token === this.epoch && !this.disposed) {
                toast(e.message, 'error');
                this.status.textContent = 'Some media needs attention';
            }
        }
    }
    draw() {
        if (this.disposed)
            return;
        const dpr = this.pixelRatio(), ctx = this.canvas.getContext('2d');
        renderScene(ctx, this.project, this.resources, { scale: this.scale * dpr, offsetX: this.panX * dpr, offsetY: this.panY * dpr });
        const ui = this.overlay.getContext('2d');
        ui.setTransform(dpr, 0, 0, dpr, 0, 0);
        ui.clearRect(0, 0, this.viewWidth, this.viewHeight);
        const h = designHeight(this.project), style = getComputedStyle(document.documentElement);
        const accent = style.getPropertyValue('--green').trim() || '#28543c';
        const foreground = style.getPropertyValue('--ink').trim() || '#17271d';
        const surface = style.getPropertyValue('--surface').trim() || '#ffffff';
        ui.save();
        for (let i = 0; i < this.project.slides.length; i++) {
            if (!this.showSeams && i !== this.activeSlide)
                continue;
            const origin = tileOrigin(this.project, i);
            const x = this.panX + origin.x * this.scale, y = this.panY + origin.y * this.scale;
            ui.strokeStyle = i === this.activeSlide ? accent : style.getPropertyValue('--control-line');
            ui.lineWidth = i === this.activeSlide ? 2 : 1;
            ui.strokeRect(x, y, UNIT * this.scale, h * this.scale);
        }
        ui.restore();
        if (!this.layoutMode && !this.hand && this.scale > .15) {
            for (const n of photoSlots(this.project)) {
                if (isFilledSlot(n) && !this.selected.has(n.id))
                    continue;
                const pts = corners(n).map(p => this.toScreen(p));
                const left = Math.max(0, Math.min(...pts.map(p => p.x))), right = Math.min(this.viewWidth, Math.max(...pts.map(p => p.x)));
                const top = Math.max(0, Math.min(...pts.map(p => p.y))), bottom = Math.min(this.viewHeight, Math.max(...pts.map(p => p.y)));
                if (right - left < 55 || bottom - top < 55)
                    continue;
                const x = (left + right) / 2, y = (top + bottom) / 2;
                ui.save();
                ui.fillStyle = surface;
                ui.strokeStyle = foreground;
                ui.lineWidth = 1;
                ui.beginPath();
                ui.arc(x, y, 14, 0, Math.PI * 2);
                ui.fill();
                ui.stroke();
                ui.fillStyle = foreground;
                ui.font = '18px sans-serif';
                ui.textAlign = 'center';
                ui.textBaseline = 'middle';
                ui.fillText(isFilledSlot(n) ? '↺' : '+', x, y);
                ui.restore();
            }
        }
        for (const n of this.selection) {
            const pts = corners(n).map(p => this.toScreen(p));
            ui.save();
            ui.strokeStyle = '#41624d';
            ui.lineWidth = 1.5;
            ui.beginPath();
            pts.forEach((p, i) => i ? ui.lineTo(p.x, p.y) : ui.moveTo(p.x, p.y));
            ui.closePath();
            ui.stroke();
            if (this.layoutMode && this.selection.length === 1 && !n.locked) {
                for (const p of pts) {
                    ui.fillStyle = '#ffffff';
                    ui.strokeStyle = '#41624d';
                    ui.beginPath();
                    ui.roundRect(p.x - 5, p.y - 5, 10, 10, 3);
                    ui.fill();
                    ui.stroke();
                }
                const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, angle = n.rotation * Math.PI / 180, rot = { x: top.x + Math.sin(angle) * 27, y: top.y - Math.cos(angle) * 27 };
                ui.beginPath();
                ui.moveTo(top.x, top.y);
                ui.lineTo(rot.x, rot.y);
                ui.stroke();
                ui.beginPath();
                ui.arc(rot.x, rot.y, 6, 0, Math.PI * 2);
                ui.fill();
                ui.stroke();
            }
            ui.restore();
        }
        ui.strokeStyle = '#cb7855';
        ui.lineWidth = 1;
        ui.setLineDash([4, 4]);
        for (const g of this.guides) {
            ui.beginPath();
            if (g.axis === 'x') {
                const x = this.panX + g.value * this.scale;
                ui.moveTo(x, 0);
                ui.lineTo(x, this.viewHeight);
            }
            else {
                const y = this.panY + g.value * this.scale;
                ui.moveTo(0, y);
                ui.lineTo(this.viewWidth, y);
            }
            ui.stroke();
        }
        ui.setLineDash([]);
        this.zoomLabel.textContent = Math.round(this.scale * 100) + '%';
    }
    toScreen(p) { return { x: p.x * this.scale + this.panX, y: p.y * this.scale + this.panY }; }
    toLogical(p) { return { x: (p.x - this.panX) / this.scale, y: (p.y - this.panY) / this.scale }; }
    eventPoint(e) { const r = this.overlay.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    bindCanvas() {
        this.overlay.addEventListener('click', e => {
            const id = this.pendingTapId;
            this.pendingTapId = undefined;
            if (!id || this.disposed)
                return;
            e.preventDefault();
            const n = this.project.nodes.find(node => node.id === id);
            if (n && isPhotoSlot(n))
                this.photoFlow.show(id);
            else if (n?.kind === 'text')
                this.editText(n);
        });
        this.overlay.addEventListener('pointerdown', e => this.down(e));
        this.overlay.addEventListener('pointermove', e => this.move(e));
        this.overlay.addEventListener('pointerup', e => this.up(e));
        this.overlay.addEventListener('pointercancel', e => this.up(e));
        this.overlay.addEventListener('dblclick', () => {
            if (this.first?.kind === 'text')
                this.editText(this.first);
        });
        this.overlay.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey)
                this.zoom(e.deltaY > 0 ? .94 : 1.06);
            else {
                this.panX -= e.deltaX;
                this.panY -= e.deltaY;
                this.draw();
                this.queueResources();
            }
        }, { passive: false });
    }
    down(e) {
        if (e.button !== 0 && e.button !== 1)
            return;
        e.preventDefault();
        this.pendingTapId = undefined;
        this.overlay.focus({ preventScroll: true });
        this.overlay.setPointerCapture(e.pointerId);
        const screen = this.eventPoint(e);
        this.pointers.set(e.pointerId, screen);
        if (this.pointers.size === 2) {
            const [a, b] = Array.from(this.pointers.values());
            this.pinch = { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale: this.scale, pan: { x: this.panX, y: this.panY }, nodes: clone(this.selection.filter(n => !n.locked)), object: this.layoutMode && !this.hand && this.selection.length > 0, box: bounds(this.selection) };
            this.drag = undefined;
            return;
        }
        const p = this.toLogical(screen);
        if (!this.layoutMode && !this.hand && e.button === 0) {
            const hit = [...this.project.nodes].reverse().find(n => n.opacity > 0 && (isPhotoSlot(n) || n.kind === 'text') && contains(n, p, 3 / this.scale));
            this.selected = new Set(hit ? [hit.id] : []);
            this.drag = { type: 'tap', tapId: hit?.id, start: p, screen, nodes: [], pan: { x: this.panX, y: this.panY } };
            this.selectionBar();
            this.draw();
            return;
        }
        let action = 'move', corner;
        const n = this.first;
        if (this.layoutMode && n && !n.locked && this.selection.length === 1) {
            const pts = corners(n).map(p => this.toScreen(p));
            corner = pts.findIndex(pt => Math.hypot(pt.x - screen.x, pt.y - screen.y) < 14);
            if (corner >= 0)
                action = 'resize';
            else {
                corner = undefined;
                const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, a = n.rotation * Math.PI / 180;
                if (Math.hypot(screen.x - top.x - Math.sin(a) * 27, screen.y - top.y + Math.cos(a) * 27) < 15)
                    action = 'rotate';
            }
        }
        if (this.hand || e.button === 1)
            action = 'pan';
        else if (action === 'move') {
            const hit = [...this.project.nodes].reverse().find(n => !n.locked && n.opacity > 0 && contains(n, p, 3 / this.scale));
            if (hit) {
                if (!this.selected.has(hit.id)) {
                    if (!e.shiftKey)
                        this.selected.clear();
                    if (hit.groupId)
                        this.project.nodes.filter(n => n.groupId === hit.groupId).forEach(n => this.selected.add(n.id));
                    else
                        this.selected.add(hit.id);
                }
            }
            else {
                this.selected.clear();
                action = 'pan';
            }
        }
        this.drag = { type: action, start: p, screen, nodes: clone(this.selection.filter(n => !n.locked)), pan: { x: this.panX, y: this.panY }, corner, angle: n ? Math.atan2(p.y - (n.y + n.h / 2), p.x - (n.x + n.w / 2)) : 0 };
        this.updateInspector();
        this.selectionBar();
        this.draw();
    }
    move(e) {
        if (!this.pointers.has(e.pointerId))
            return;
        const screen = this.eventPoint(e);
        this.pointers.set(e.pointerId, screen);
        if (this.pinch && this.pointers.size >= 2) {
            const [a, b] = Array.from(this.pointers.values()), g = this.pinch, center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r = clamp(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, g.distance), .2, 5);
            if (g.object && g.nodes.length) {
                const angle = (Math.atan2(b.y - a.y, b.x - a.x) - g.angle) * 180 / Math.PI, cx = g.box.x + g.box.w / 2, cy = g.box.y + g.box.h / 2, rad = angle * Math.PI / 180;
                for (const orig of g.nodes) {
                    const n = this.project.nodes.find(n => n.id === orig.id);
                    const dx = (orig.x + orig.w / 2 - cx) * r, dy = (orig.y + orig.h / 2 - cy) * r;
                    n.w = Math.max(8, orig.w * r);
                    n.h = Math.max(8, orig.h * r);
                    n.x = cx + dx * Math.cos(rad) - dy * Math.sin(rad) - n.w / 2 + (center.x - g.center.x) / this.scale;
                    n.y = cy + dx * Math.sin(rad) + dy * Math.cos(rad) - n.h / 2 + (center.y - g.center.y) / this.scale;
                    n.rotation = orig.rotation + angle;
                    if (n.kind === 'text' && orig.kind === 'text')
                        n.fontSize = clamp(orig.fontSize * r, 6, 360);
                }
            }
            else {
                this.scale = clamp(g.scale * r, .015, 4);
                const rr = this.scale / g.scale;
                this.panX = center.x - (g.center.x - g.pan.x) * rr;
                this.panY = center.y - (g.center.y - g.pan.y) * rr;
            }
            this.draw();
            return;
        }
        const d = this.drag;
        if (!d)
            return;
        const p = this.toLogical(screen), dx = p.x - d.start.x, dy = p.y - d.start.y;
        if (d.type === 'tap') {
            if (Math.hypot(screen.x - d.screen.x, screen.y - d.screen.y) > 7 || d.changed) {
                d.changed = true;
                this.panX = d.pan.x + screen.x - d.screen.x;
                this.panY = d.pan.y + screen.y - d.screen.y;
                this.draw();
                this.queueResources();
            }
            return;
        }
        if (d.type === 'pan') {
            this.panX = d.pan.x + screen.x - d.screen.x;
            this.panY = d.pan.y + screen.y - d.screen.y;
            this.draw();
            return;
        }
        if (Math.hypot(screen.x - d.screen.x, screen.y - d.screen.y) < 2 && !d.changed)
            return;
        d.changed = true;
        if (d.type === 'move') {
            let sx = 0, sy = 0;
            for (const orig of d.nodes) {
                const n = this.project.nodes.find(n => n.id === orig.id);
                n.x = orig.x + dx;
                n.y = orig.y + dy;
            }
            if (d.nodes.length === 1 && !e.altKey) {
                const n = this.first;
                const snap = snapPosition(n, this.project.nodes.filter(n => !this.selected.has(n.id)), designHeight(this.project), 5 / this.scale, tileOrigin(this.project, ownerSlide(this.project, n)).y);
                sx = snap.x - n.x;
                sy = snap.y - n.y;
                this.guides = snap.guides;
            }
            for (const n of this.selection) {
                if (n.locked)
                    continue;
                n.x += sx;
                n.y += sy;
            }
        }
        else if (d.type === 'resize' && d.nodes[0]) {
            const orig = d.nodes[0], n = this.project.nodes.find(n => n.id === orig.id), c = d.corner || 0, opposite = (c + 2) % 4, anchor = corners(orig)[opposite], rad = orig.rotation * Math.PI / 180;
            const wx = p.x - anchor.x, wy = p.y - anchor.y;
            let width = Math.max(12, Math.abs(wx * Math.cos(rad) + wy * Math.sin(rad))), height = Math.max(12, Math.abs(-wx * Math.sin(rad) + wy * Math.cos(rad)));
            if (e.shiftKey) {
                const r = width / orig.w;
                height = orig.h * r;
            }
            const signX = c === 0 || c === 3 ? -1 : 1, signY = c < 2 ? -1 : 1;
            const cx = anchor.x + (signX * width * Math.cos(rad) - signY * height * Math.sin(rad)) / 2, cy = anchor.y + (signX * width * Math.sin(rad) + signY * height * Math.cos(rad)) / 2;
            n.x = cx - width / 2;
            n.y = cy - height / 2;
            n.w = width;
            n.h = height;
            if (n.kind === 'text' && orig.kind === 'text')
                n.fontSize = clamp(orig.fontSize * width / orig.w, 6, 360);
        }
        else if (d.type === 'rotate' && d.nodes[0]) {
            const o = d.nodes[0], n = this.project.nodes.find(n => n.id === o.id);
            let a = o.rotation + (Math.atan2(p.y - o.y - o.h / 2, p.x - o.x - o.w / 2) - (d.angle || 0)) * 180 / Math.PI;
            if (e.shiftKey || Math.abs(a / 15 - Math.round(a / 15)) < .12)
                a = Math.round(a / 15) * 15;
            n.rotation = a;
        }
        this.draw();
    }
    up(e) {
        this.pointers.delete(e.pointerId);
        if (this.pinch) {
            if (this.pointers.size < 2) {
                if (this.pinch.object)
                    this.commit();
                this.pinch = undefined;
                this.drag = undefined;
                this.queueResources();
            }
        }
        else if (this.drag) {
            if (this.drag.type === 'tap') {
                if (!this.drag.changed && this.drag.tapId && e.type === 'pointerup') {
                    this.pendingTapId = this.drag.tapId;
                }
                else if (this.drag.changed) {
                    this.activeSlide = clamp(Math.floor(this.toLogical({ x: this.viewWidth / 2, y: this.viewHeight / 2 }).x / UNIT), 0, this.project.slides.length - 1);
                    this.renderStrip();
                }
            }
            else if (this.drag.changed)
                this.commit();
            this.drag = undefined;
            this.queueResources();
        }
        this.guides = [];
        this.draw();
        this.updateInspector();
    }
    commit() {
        if (this.disposed)
            return;
        this.project.updated = Date.now();
        this.history.push(this.project);
        this.refresh(false);
        this.scheduleSave();
        this.queueResources();
    }
    refresh(load = true) {
        this.undoButton.disabled = !this.history.canUndo;
        this.redoButton.disabled = !this.history.canRedo;
        this.selected = new Set([...this.selected].filter(id => this.project.nodes.some(n => n.id === id)));
        this.activeSlide = Math.min(this.activeSlide, this.project.slides.length - 1);
        this.renderStrip();
        this.updateInspector();
        this.selectionBar();
        this.draw();
        if (load)
            this.loadResources();
    }
    applyHistory(p) {
        if (!p)
            return;
        this.project = p;
        this.refresh();
        this.scheduleSave();
        void probeStorage().catch(error => { if (!this.disposed && !this.isSaved) {
            this.saveWarning.hidden = false;
            this.saveWarning.title = error.message;
        } });
    }
    undo() { this.applyHistory(this.history.undo()); }
    redo() { this.applyHistory(this.history.redo()); }
    scheduleSave() {
        clearTimeout(this.saveTimer);
        this.saveEpoch++;
        this.status.textContent = 'Saving';
        this.status.dataset.state = 'saving';
        this.saveTimer = window.setTimeout(() => void this.save(), 650);
    }
    async save(asTemplate = false) {
        if (asTemplate) {
            const recipe = templateRecipe(this.project), media = await allProjectMedia(recipe.nodes), assets = await allProjectAssets(recipe.nodes);
            const resources = await prepareResources(nodesForSlide(recipe, 0), { scale: .7 });
            const canvas = sceneCanvas(recipe, resources, 0, 252), thumbnail = canvas.toDataURL('image/jpeg', .8);
            canvas.width = canvas.height = 0;
            await saveProject(recipe, media, thumbnail, true, assets);
            toast('Saved as a layout recipe. Editable photo slots are empty; fixed artwork is retained.', 'success');
            return true;
        }
        clearTimeout(this.saveTimer);
        const seq = this.saveEpoch, snapshot = clone(this.project);
        const write = async () => {
            if (this.disposed)
                return false;
            try {
                const media = await allProjectMedia(snapshot.nodes, snapshot.mediaIds || []);
                let thumbnail = '';
                try {
                    const resources = await prepareResources(nodesForSlide(snapshot, 0), { scale: .7 });
                    const canvas = sceneCanvas(snapshot, resources, 0, 252);
                    thumbnail = canvas.toDataURL('image/jpeg', .8);
                    canvas.width = canvas.height = 0;
                }
                catch { /* A missing preview must not block the document's atomic save. */ }
                if (this.disposed)
                    return false;
                await saveProject(snapshot, media, thumbnail, asTemplate, await allProjectAssets(snapshot.nodes));
                if (seq === this.saveEpoch && !this.disposed) {
                    this.committedRevision = seq;
                    this.status.textContent = 'Saved on this device';
                    this.status.dataset.state = 'saved';
                    this.saveWarning.hidden = true;
                }
                if (asTemplate && !this.disposed)
                    toast('Saved as a reusable project on this device.', 'success');
                return seq === this.saveEpoch;
            }
            catch (error) {
                if (!this.disposed) {
                    this.status.textContent = 'Not saved';
                    this.status.dataset.state = 'error';
                    this.saveWarning.hidden = false;
                    this.saveWarning.title = error.message;
                }
                return false;
            }
        };
        this.saveQueue = this.saveQueue.catch(() => false).then(write);
        return this.saveQueue;
    }
    renderStrip() {
        this.strip.replaceChildren();
        this.project.slides.forEach((s, i) => this.strip.append(button(String(i + 1), undefined, () => this.goSlide(i), i === this.activeSlide ? 'primary' : 'ghost', 'slide-tab')));
        const plus = button('Add slide', 'plus', () => {
            if (this.project.slides.length >= 20) {
                toast('A story can contain up to 20 slides.');
                return;
            }
            this.project.slides.push({ id: uid(), name: `Slide ${this.project.slides.length + 1}`, background: this.project.slides[this.activeSlide].background, texture: this.project.slides[this.activeSlide].texture });
            this.activeSlide = this.project.slides.length - 1;
            this.commit();
            this.goSlide(this.activeSlide);
        }, 'ghost', 'icon-only');
        this.strip.append(plus);
    }
    selectionBar() {
        const hint = this.shell.querySelector('.selection-hint');
        if (hint)
            hint.textContent = this.hand ? 'Hand mode · drag or pinch the canvas' : this.selection.length ? this.layoutMode ? `${this.selection.length === 1 ? this.first.name : this.selection.length + ' layers'} · drag to move` : 'Tap a photo or text to edit · drag to pan' : this.layoutMode ? 'Layout mode · select and arrange layers' : 'Tap a photo to replace it · drag to pan';
        this.shell.querySelector('.pan-button')?.classList.toggle('is-active', this.hand);
        const edit = this.shell.querySelector('.edit-selection');
        if (edit)
            edit.disabled = !this.selection.length;
    }
    updateInspector() {
        if (!this.inspector)
            return;
        const active = document.activeElement, label = active && this.inspector.contains(active) ? active.getAttribute('aria-label') : null;
        this.inspector.replaceChildren(this.inspectionPanel());
        if (label)
            Array.from(this.inspector.querySelectorAll('input,select,button,textarea')).find(n => n.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
        this.updateLibrary();
    }
    updateLibrary() {
        if (this.mobile || !this.library || !['photos', 'looks', 'layers', 'format'].includes(this.activeLibraryTool))
            return;
        const active = document.activeElement;
        const label = active && this.library.contains(active) ? active.getAttribute('aria-label') : null;
        const scroll = this.library.scrollTop;
        this.library.replaceChildren(this.activeLibraryTool === 'photos' ? this.photosPanel() : this.activeLibraryTool === 'looks' ? this.looksPanel() : this.activeLibraryTool === 'layers' ? this.layersPanel() : this.formatPanel());
        this.library.scrollTop = scroll;
        if (label)
            Array.from(this.library.querySelectorAll('input,select,button,textarea')).find(n => n.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
    }
    tool(tool) {
        const content = tool === 'photos' ? this.photosPanel() : tool === 'text' ? this.textPanel() : tool === 'assets' ? this.assetsPanel() : tool === 'looks' ? this.looksPanel() : tool === 'layers' ? this.layersPanel() : tool === 'format' ? this.formatPanel() : this.inspectionPanel();
        if (this.mobile || tool === 'inspect')
            dialog(({ photos: 'Photos', text: 'Text', assets: 'Elements', looks: 'Looks', layers: 'Layers', format: 'Canvas', inspect: 'Edit layer' })[tool], content);
        else {
            this.activeLibraryTool = tool;
            this.library.replaceChildren(content);
        }
    }
    requestImport(target, fill = false) { this.importTarget = target; this.importFill = fill; const input = document.getElementById('media-input'); input.value = ''; input.multiple = !target; input.click(); }
    async receiveFiles(files) {
        if (!files.length)
            return;
        if (files.length > 50 || files.reduce((sum, file) => sum + file.size, 0) > 250000000) {
            toast('Add up to 50 files and 250 MB per batch to keep this device responsive.', 'error');
            return;
        }
        const replaceable = this.importTarget ? 1 : this.importFill ? photoSlots(this.project).length : 0;
        if (this.project.nodes.length + Math.max(0, files.length - replaceable) > 500) {
            toast('This import would exceed the 500-layer limit. Remove some layers first.', 'error');
            return;
        }
        const valid = [];
        toast(`Opening ${files.length === 1 ? 'your photo' : files.length + ' files'} locally…`);
        for (const file of files) {
            try {
                valid.push(await importMedia(file));
            }
            catch (e) {
                toast(e.message, 'error');
            }
        }
        if (!valid.length)
            return;
        let slots = [];
        if (this.importTarget) {
            const n = this.project.nodes.find(n => n.id === this.importTarget);
            if (n && (n.kind === 'photo' || n.kind === 'video'))
                slots = [n];
        }
        else if (this.importFill)
            slots = photoSlots(this.project);
        for (let i = 0; i < valid.length; i++) {
            const m = valid[i], slot = slots[i];
            if (slot) {
                slot.assetId = m.id;
                slot.kind = m.kind;
                slot.slotState = 'filled';
                slot.crop = { x: .5, y: .5, zoom: 1 };
                if (m.kind === 'video')
                    slot.grade = defaultGrade();
                this.selected = new Set([slot.id]);
            }
            else {
                const w = 230, h = clamp(w * m.height / m.width, 100, 330), n = newPhoto(m.id, this.origin.x + 48 + (i % 4) * 9, this.origin.y + Math.max(25, (designHeight(this.project) - h) / 2) + (i % 4) * 8, w, h);
                n.kind = m.kind;
                if (this.project.nodes.length >= 500)
                    throw new Error('This project has reached its 500-layer limit.');
                this.project.nodes.push(n);
                this.selected = new Set([n.id]);
            }
        }
        this.project.mediaIds = [...new Set([...(this.project.mediaIds || []), ...valid.map(m => m.id)])];
        this.project.mediaIds = [...new Set([...(this.project.mediaIds || []), ...valid.map(media => media.id)])];
        this.importTarget = undefined;
        this.importFill = false;
        this.commit();
        if (document.getElementById('sheet').open)
            closeDialog();
        toast(`${valid.length} ${valid.length === 1 ? 'file' : 'files'} added. Your originals stay on this device.`, 'success');
    }
    mediaURL(m) {
        if (m.src)
            return sourceURL(m.src);
        let url = this.urls.get(m.id);
        if (!url && m.blob) {
            url = blobURL(m.renderBlob || m.blob);
            this.urls.set(m.id, url);
        }
        return url || '';
    }
    photosPanel() {
        const slots = photoSlots(this.project), ids = new Set([...(this.project.mediaIds || []), ...slots.map(n => n.assetId)]);
        const body = el('div', { class: 'panel-content' }, el('h2', { text: 'Photos' }), el('p', { class: 'muted', text: 'Tap a photo on the canvas to replace it without moving its frame.' }), button('Fill all photo slots', 'images', () => this.photoFlow.batch(), 'primary', 'full'), button('Fill this slide', 'images', () => this.photoFlow.batch(this.activeSlide), 'secondary', 'full'), button('Add a free photo or video', 'plus', () => this.requestImport(), 'ghost', 'full'));
        const frames = el('div', { class: 'frame-buttons' });
        slots.forEach((slot, i) => frames.append(button(`${i + 1}. ${slot.name} · ${isFilledSlot(slot) ? 'filled' : 'add photo'}`, 'photo', () => this.photoFlow.show(slot.id), 'secondary', 'full')));
        body.append(el('h3', { class: 'panel-section-title', text: `Photo frames · ${slots.length}` }), frames);
        const grid = el('div', { class: 'photo-library' });
        for (const media of [...mediaLibrary.values()].filter(m => m.kind === 'photo' && ids.has(m.id))) {
            const tile = button(`Add ${media.name} as a new layer`, undefined, () => {
                if (this.project.nodes.length >= 500)
                    throw new Error('This project has reached its 500-layer limit.');
                const node = newPhoto(media.id, this.origin.x + 45, this.origin.y + 75, 270, Math.min(310, 270 * media.height / media.width));
                this.project.nodes.push(node);
                this.selected = new Set([node.id]);
                this.commit();
                if (this.mobile)
                    closeDialog();
            }, 'plain', 'photo-tile');
            tile.replaceChildren(el('img', { src: this.mediaURL(media), alt: media.name, loading: 'lazy' }));
            grid.append(tile);
        }
        body.append(el('h3', { class: 'panel-section-title', text: 'Project photos' }), grid, el('p', { class: 'hint', text: 'Original files stay on this device. Fixed thematic artwork is not included in batch fill.' }));
        return body;
    }
    textPanel() {
        const body = el('div', { class: 'panel-content' }, el('div', { class: 'panel-eyebrow', text: 'WORDS WORTH KEEPING' }), el('h2', { text: 'Say something.' }));
        for (const [label, font, size, weight] of [['A little poetry.', 'serif', 38, 400], ['MAKE A STATEMENT', 'sans', 32, 800], ['a note to self', 'hand', 30, 400], ['THE SMALL PRINT', 'mono', 11, 400]]) {
            const btn = button(label, undefined, () => {
                const n = newText(label, this.origin.x + 28, this.origin.y + 55, 300, size);
                n.font = font;
                n.weight = weight;
                if (this.project.nodes.length >= 500)
                    throw new Error('This project has reached its 500-layer limit.');
                this.project.nodes.push(n);
                this.selected = new Set([n.id]);
                this.commit();
                this.editText(n);
            }, 'secondary', 'text-style ' + font);
            body.append(btn);
        }
        body.append(el('p', { class: 'hint', text: 'Native system fonts. Font appearance can vary between devices; preview and export match on the device you use.' }));
        return body;
    }
    editText(n) {
        const draft = el('textarea', { class: 'input text-editor', rows: 5, maxlength: 5000, 'aria-label': 'Text content', value: n.text });
        const body = el('div', {}, field('Your words', draft), el('p', { class: 'hint', text: 'Line breaks are preserved. Copy wraps and shrinks gently; a warning appears when the text box needs more space.' }), button('Apply text', 'check', () => {
            n.text = draft.value;
            this.commit();
            closeDialog();
            if (layoutText(this.canvas.getContext('2d'), n).overflow)
                toast('Some words do not fit. Open Edit selection → Fit box to words, or reduce the type size.', 'error');
        }, 'primary', 'full'));
        dialog('Edit your words', body);
        draft.focus();
        draft.select();
    }
    elementURL(asset) { if (!asset.blob)
        return sourceURL(asset.src); let url = this.urls.get(asset.id); if (!url) {
        url = blobURL(asset.blob);
        this.urls.set(asset.id, url);
    } return url; }
    assetsPanel() {
        const body = el('div', { class: 'panel-content' }, el('div', { class: 'panel-eyebrow', text: '170 ORIGINAL DETAILS' }), el('h2', { text: 'Make it a little you.' }));
        const search = el('input', { class: 'input', type: 'search', placeholder: 'Tape, flowers, tickets…', 'aria-label': 'Search creative elements' }), group = select('All collections', ['All collections', ...new Set(ASSETS.map(a => a.collection))], () => render());
        const grid = el('div', { class: 'asset-grid' });
        const render = () => {
            const q = search.value.toLowerCase(), items = ASSETS.filter(a => (group.value === 'All collections' || a.collection === group.value) && [a.name, a.collection, ...a.tags].join(' ').toLowerCase().includes(q));
            grid.replaceChildren();
            for (const a of items) {
                const btn = button(a.name, undefined, () => {
                    const n = { ...baseNode('sticker', this.origin.x + 110, this.origin.y + 140, 140, 140), kind: 'sticker', assetId: a.id, name: a.name };
                    if (this.project.nodes.length >= 500)
                        throw new Error('This project has reached its 500-layer limit.');
                    this.project.nodes.push(n);
                    this.selected = new Set([n.id]);
                    this.commit();
                    if (this.mobile)
                        closeDialog();
                }, 'plain', 'asset-tile');
                btn.replaceChildren(el('img', { src: this.elementURL(a), alt: a.name, loading: 'lazy' }));
                grid.append(btn);
            }
            if (!items.length)
                grid.append(empty('Nothing here yet', 'Try a broader search.'));
        };
        search.addEventListener('input', render);
        body.append(search, group, el('div', { class: 'shape-buttons' }, button('Rectangle', 'grid', () => this.addShape('rect'), 'secondary'), button('Circle', undefined, () => this.addShape('ellipse'), 'secondary'), button('Gradient', undefined, () => this.addShape('gradient'), 'secondary')), grid);
        render();
        return body;
    }
    addShape(kind) {
        const n = newShape(this.origin.x + 80, this.origin.y + 120, 200, 200, '#d8bd8d');
        if (kind === 'ellipse')
            n.shape = 'ellipse';
        if (kind === 'gradient')
            n.gradient = { to: '#e8e5d4', angle: 90 };
        if (this.project.nodes.length >= 500)
            throw new Error('This project has reached its 500-layer limit.');
        this.project.nodes.push(n);
        this.selected = new Set([n.id]);
        this.commit();
        if (this.mobile)
            closeDialog();
    }
    looksPanel() {
        const photo = this.first;
        const body = el('div', { class: 'panel-content' }, el('div', { class: 'panel-eyebrow', text: 'REAL COLOUR. ALL LOCAL.' }), el('h2', { text: 'A different light.' }));
        if (!photo || (photo.kind !== 'photo' && photo.kind !== 'video')) {
            body.append(empty('Start with a photo', 'Select a photo on your canvas, then open Looks.', 'looks'));
            return body;
        }
        if (photo.kind === 'video') {
            body.append(el('p', { class: 'muted', text: 'Video layers keep their original colour. Still-photo grading is not applied to exported video.' }));
            return body;
        }
        body.append(el('p', { class: 'hint', text: 'Choose a look; see the actual processed result on your canvas.' }));
        const grid = el('div', { class: 'grade-grid' });
        for (const g of GRADES) {
            const b = button(g.name, undefined, () => { photo.grade.preset = g.id; this.commit(); grid.querySelectorAll('button').forEach(n => n.classList.remove('is-active')); b.classList.add('is-active'); }, 'secondary', 'grade-tile ' + (photo.grade.preset === g.id ? 'is-active' : ''));
            b.append(el('small', { text: g.family }));
            b.title = g.description;
            grid.append(b);
        }
        body.append(grid, range('Intensity', photo.grade.intensity, 0, 100, 1, v => { photo.grade.intensity = v; this.queueResources(); }, () => this.commit(), '%'), button(this.before ? 'Show edited' : 'Compare before grades', 'eye', () => { this.before = !this.before; this.loadResources(); this.tool('looks'); }, 'secondary', 'full'));
        for (const [key, label, min, max] of [['exposure', 'Exposure', -2, 2], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100], ['warmth', 'Warmth', -100, 100], ['fade', 'Fade', 0, 100], ['grain', 'Grain', 0, 100], ['vignette', 'Vignette', 0, 100]])
            body.append(range(label, photo.grade[key], min, max, key === 'exposure' ? .05 : 1, v => { photo.grade[key] = v; this.queueResources(); }, () => this.commit(), key === 'exposure' ? ' EV' : ''));
        body.append(button('Apply look to all photos', 'check', () => {
            for (const n of this.project.nodes)
                if (n.kind === 'photo' && isPhotoSlot(n))
                    n.grade = clone(photo.grade);
            this.commit();
            toast('Look applied to editable photo slots. Thematic artwork is unchanged.', 'success');
        }, 'primary', 'full'), button('Reset photo grade', 'reset', () => { photo.grade = defaultGrade(); this.commit(); this.tool('looks'); }, 'ghost', 'full'));
        return body;
    }
    layersPanel() {
        const body = el('div', { class: 'panel-content' }, el('h2', { text: 'In good order.' }), el('p', { class: 'hint', text: 'Frontmost layers are at the top. Check several layers to group them.' }));
        const list = el('div', { class: 'layer-list' });
        for (const n of [...this.project.nodes].reverse()) {
            const cb = el('input', { type: 'checkbox', checked: this.selected.has(n.id), 'aria-label': 'Select ' + n.name, onchange: (e) => { e.target.checked ? this.selected.add(n.id) : this.selected.delete(n.id); this.updateInspector(); this.draw(); this.selectionBar(); } });
            const row = el('div', { class: 'layer-row' }, cb, icon(n.kind === 'text' ? 'text' : n.kind === 'sticker' ? 'stickers' : n.kind === 'shape' ? 'grid' : n.kind === 'video' ? 'film' : 'photo'), button(n.kind === 'text' ? n.text.slice(0, 34) || 'Empty text' : n.name, undefined, () => {
                this.selected = new Set([n.id]);
                this.goSlide(ownerSlide(this.project, n));
                this.updateInspector();
                this.draw();
                this.selectionBar();
                if (this.mobile) {
                    closeDialog();
                    this.tool('inspect');
                }
                else
                    this.tool('layers');
            }, 'plain', 'layer-name'), button(n.locked ? 'Unlock layer' : 'Lock layer', n.locked ? 'lock' : 'unlock', () => { n.locked = !n.locked; this.commit(); this.tool('layers'); }, 'ghost', 'icon-only'));
            list.append(row);
        }
        if (!this.project.nodes.length)
            list.append(empty('A fresh page', 'Add a photo, a line of text, or an element.'));
        body.append(list, el('div', { class: 'actions' }, button('Group', 'group', () => this.group(), 'secondary'), button('Ungroup', 'ungroup', () => this.ungroup(), 'secondary')));
        return body;
    }
    group() {
        if (this.selection.length < 2) {
            toast('Select two or more layers in Layers first.');
            return;
        }
        const id = uid();
        this.selection.forEach(n => n.groupId = id);
        this.commit();
        toast('Layers grouped. Select any member to move them together.', 'success');
    }
    ungroup() {
        const groups = new Set(this.selection.map(n => n.groupId));
        for (const n of this.project.nodes)
            if (n.groupId && groups.has(n.groupId))
                delete n.groupId;
        this.commit();
        toast('Layers ungrouped.');
    }
    duplicate() {
        const nodes = this.selection;
        if (!nodes.length)
            return;
        if (this.project.nodes.length + nodes.length > 500) {
            toast('This project has reached its 500-layer limit.', 'error');
            return;
        }
        const groupMap = new Map();
        const copies = nodes.map(n => {
            const copy = clone(n);
            copy.id = uid();
            copy.x += 12;
            copy.y += 12;
            if (copy.groupId) {
                if (!groupMap.has(copy.groupId))
                    groupMap.set(copy.groupId, uid());
                copy.groupId = groupMap.get(copy.groupId);
            }
            return copy;
        });
        this.project.nodes.push(...copies);
        this.selected = new Set(copies.map(n => n.id));
        this.commit();
    }
    deleteSelected() { this.project.nodes = this.project.nodes.filter(n => !this.selected.has(n.id) || n.locked); this.selected.clear(); this.commit(); }
    reorder(direction) {
        const ids = this.selected;
        if (direction > 0) {
            for (let i = this.project.nodes.length - 2; i >= 0; i--)
                if (ids.has(this.project.nodes[i].id) && !ids.has(this.project.nodes[i + 1].id))
                    [this.project.nodes[i], this.project.nodes[i + 1]] = [this.project.nodes[i + 1], this.project.nodes[i]];
        }
        else {
            for (let i = 1; i < this.project.nodes.length; i++)
                if (ids.has(this.project.nodes[i].id) && !ids.has(this.project.nodes[i - 1].id))
                    [this.project.nodes[i], this.project.nodes[i - 1]] = [this.project.nodes[i - 1], this.project.nodes[i]];
        }
        this.commit();
    }
    inspectionPanel() {
        const n = this.first, body = el('div', { class: 'panel-content' });
        if (n && isPhotoSlot(n) && !this.layoutMode && this.selection.length === 1) {
            body.append(el('h2', { text: 'Photo frame' }), el('p', { class: 'muted', text: 'Replace the photo without changing the frame.' }), button('Upload photo', 'upload', () => this.photoFlow.upload(n.id), 'primary', 'full'), button('Take photo', 'camera', () => this.photoFlow.camera(n.id), 'secondary', 'full'), button('Photo options', 'photo', () => this.photoFlow.show(n.id), 'secondary', 'full'), button('Adjust crop', 'crop', () => this.photoFlow.crop(n.id), 'secondary', 'full'), button('Edit frame layout', 'layers', () => this.shell.querySelector('.layout-mode')?.click(), 'ghost', 'full'));
            return body;
        }
        if (!n) {
            body.append(el('div', { class: 'panel-eyebrow', text: 'STILLROLL' }), el('h2', { text: 'Editor' }), empty('Select something', 'Tap a photo, word, or element to see its controls.', 'move'), el('div', { class: 'editor-tip' }, icon('pan'), el('p', { text: 'Tap a photo to fill its frame. Use Layout mode for moving and resizing. Drag or pinch to navigate the canvas.' })), button('Save editable project', 'save', () => this.backup(), 'secondary', 'full'), button('Save as my template', 'heart', () => this.save(true), 'ghost', 'full'));
            return body;
        }
        body.append(el('div', { class: 'panel-eyebrow', text: this.selection.length > 1 ? `${this.selection.length} SELECTED LAYERS` : n.kind.toUpperCase() }), el('h2', { text: this.selection.length > 1 ? 'Better together.' : n.kind === 'text' ? 'A few good words.' : n.kind === 'photo' ? 'In the frame.' : n.kind === 'video' ? 'In motion.' : 'The little details.' }));
        const actions = el('div', { class: 'compact-actions' }, button('Duplicate', 'copy', () => this.duplicate(), 'secondary', 'icon-only'), button('Move forward', 'arrowUp', () => this.reorder(1), 'secondary', 'icon-only'), button('Move backward', 'arrowDown', () => this.reorder(-1), 'secondary', 'icon-only'), button(n.locked ? 'Unlock' : 'Lock', n.locked ? 'lock' : 'unlock', () => {
            const locked = !n.locked;
            for (const node of this.selection)
                node.locked = locked;
            this.commit();
            if (this.mobile)
                this.tool('inspect');
        }, 'secondary', 'icon-only'), button('Delete', 'trash', () => {
            this.deleteSelected();
            if (this.mobile)
                closeDialog();
        }, 'ghost', 'icon-only'));
        body.append(actions);
        if (this.selection.length > 1) {
            body.append(button('Group selected layers', 'group', () => this.group(), 'primary', 'full'), button('Ungroup', 'ungroup', () => this.ungroup(), 'secondary', 'full'));
            return body;
        }
        const patch = (key, value) => { n[key] = value; this.commit(); };
        const geometry = el('div', { class: 'field-grid' }, numberField('X', n.x, -7200, 7200, v => patch('x', v)), numberField('Y', n.y, -3840, 3840, v => patch('y', v)), numberField('Width', n.w, 8, 7200, v => patch('w', v)), numberField('Height', n.h, 8, 7200, v => patch('h', v)));
        body.append(geometry, range('Rotation', Math.round(n.rotation), -180, 180, 1, v => { n.rotation = v; this.draw(); }, () => this.commit(), '°'), range('Opacity', Math.round(n.opacity * 100), 0, 100, 1, v => { n.opacity = v / 100; this.draw(); }, () => this.commit(), '%'));
        body.append(el('div', { class: 'compact-actions' }, button('Align left', 'alignLeft', () => { n.x = Math.floor((n.x + n.w / 2) / UNIT) * UNIT + 24; this.commit(); }, 'secondary', 'icon-only'), button('Center horizontally', 'alignCenter', () => { n.x = Math.floor((n.x + n.w / 2) / UNIT) * UNIT + (UNIT - n.w) / 2; this.commit(); }, 'secondary', 'icon-only'), button('Align right', 'alignRight', () => { n.x = (Math.floor((n.x + n.w / 2) / UNIT) + 1) * UNIT - n.w - 24; this.commit(); }, 'secondary', 'icon-only')));
        if (n.kind === 'text') {
            if (layoutText(this.canvas.getContext('2d'), n).overflow)
                body.append(el('p', { class: 'notice', text: 'Some words extend beyond this text box. Make more space before exporting.' }));
            body.append(button('Fit box to words', 'fit', () => {
                n.h = Math.ceil(textLines(this.canvas.getContext('2d'), n).length * n.fontSize * n.lineHeight + 2);
                this.commit();
                if (this.mobile)
                    this.tool('inspect');
            }, 'secondary', 'full'));
            body.append(button('Edit words', 'text', () => this.editText(n), 'primary', 'full'), field('Font', select(n.font, Object.entries(FONT_LABELS), v => patch('font', v))), el('div', { class: 'field-grid' }, numberField('Size', n.fontSize, 6, 360, v => patch('fontSize', v)), field('Weight', select(String(n.weight), [['400', 'Regular'], ['600', 'Semibold'], ['800', 'Bold']], v => patch('weight', Number(v))))), field('Alignment', select(n.align, ['left', 'center', 'right'], v => patch('align', v))), colorField('Text colour', n.color, v => patch('color', v)), range('Line height', n.lineHeight, .75, 2, .05, v => { n.lineHeight = v; this.draw(); }, () => this.commit()), range('Letter spacing', n.letterSpacing, -2, 15, .25, v => { n.letterSpacing = v; this.draw(); }, () => this.commit()), button(n.italic ? 'Roman type' : 'Italic type', undefined, () => patch('italic', !n.italic), 'secondary', 'full'));
        }
        if (n.kind === 'photo' || n.kind === 'video') {
            body.append(button('Replace photo / video', 'photo', () => this.requestImport(n.id), 'primary', 'full'), field('Frame shape', select(n.mask, ['rectangle', 'rounded', 'circle', 'arch', 'torn', 'diamond'], v => patch('mask', v))), el('div', { class: 'panel-section-title', text: 'Crop without losing your original' }), range('Zoom into photo', n.crop.zoom, 1, 8, .05, v => { n.crop.zoom = v; this.draw(); }, () => this.commit()), range('Horizontal crop', Math.round(n.crop.x * 100), 0, 100, 1, v => { n.crop.x = v / 100; this.draw(); }, () => this.commit(), '%'), range('Vertical crop', Math.round(n.crop.y * 100), 0, 100, 1, v => { n.crop.y = v / 100; this.draw(); }, () => this.commit(), '%'), button('Flip horizontally', undefined, () => patch('flipX', !n.flipX), 'secondary', 'full'), button('Flip vertically', undefined, () => patch('flipY', !n.flipY), 'secondary', 'full'), range('Frame width', n.borderWidth, 0, 24, 1, v => { n.borderWidth = v; this.draw(); }, () => this.commit()), colorField('Frame colour', n.border, v => patch('border', v)), range('Soft shadow', n.shadow, 0, 60, 1, v => { n.shadow = v; this.draw(); }, () => this.commit()));
            if (n.kind === 'photo') {
                body.append(button('Colour & looks', 'looks', () => this.tool('looks'), 'secondary', 'full'), button('Erase a flat background', 'magic', () => this.cutoutSheet(n), 'ghost', 'full'));
            }
            else
                body.append(numberField('Poster / start time (sec)', n.videoStart || 0, 0, 300, v => { n.videoStart = v; clearMediaCache(); this.commit(); }), el('p', { class: 'hint', text: 'Canvas and image exports show this poster frame. Export → Video records actual motion, muted, in the foreground.' }));
        }
        if (n.kind === 'shape') {
            body.append(colorField('Fill', n.fill, v => patch('fill', v)), numberField('Corner radius', n.radius, 0, 180, v => patch('radius', v)), range('Outline width', n.strokeWidth, 0, 20, 1, v => { n.strokeWidth = v; this.draw(); }, () => this.commit()), colorField('Outline', n.stroke, v => patch('stroke', v)));
            if (n.gradient)
                body.append(colorField('Gradient end', n.gradient.to, v => { n.gradient.to = v; this.commit(); }), range('Gradient direction', n.gradient.angle, 0, 360, 1, v => { n.gradient.angle = v; this.draw(); }, () => this.commit(), '°'));
        }
        body.append(button('Clear selection', 'close', () => {
            this.selected.clear();
            this.refresh(false);
            if (this.mobile)
                closeDialog();
        }, 'ghost', 'full'));
        return body;
    }
    cutoutSheet(n) { n.cutout ??= { color: '#ffffff', tolerance: 12, softness: 8, enabled: false }; const cut = n.cutout; const body = el('div', {}, el('p', { class: 'muted', text: 'Remove a single flat colour, such as a studio-white or green background. This is a local colour eraser, not AI subject detection. Similar colours inside your subject can also disappear.' }), colorField('Colour to erase', cut.color, v => { cut.color = v; cut.enabled = true; this.queueResources(); }), range('Tolerance', cut.tolerance, 0, 100, 1, v => { cut.tolerance = v; cut.enabled = true; this.queueResources(); }, () => this.commit()), range('Soft edge', cut.softness, 1, 50, 1, v => { cut.softness = v; this.queueResources(); }, () => this.commit()), button(cut.enabled ? 'Disable colour eraser' : 'Enable colour eraser', 'magic', () => { cut.enabled = !cut.enabled; this.commit(); this.cutoutSheet(n); }, 'primary', 'full'), button('Done', 'check', () => { this.commit(); closeDialog(); }, 'secondary', 'full')); dialog('Erase a flat background', body); }
    formatPanel() {
        const p = this.project, s = p.slides[this.activeSlide], body = el('div', { class: 'panel-content' }, el('h2', { text: 'Room for your story.' }), field('Format', select(`${p.width}:${p.height}`, [['1080:1350', 'Portrait · 4:5'], ['1080:1080', 'Square · 1:1'], ['1080:1920', 'Story · 9:16'], [`${p.width}:${p.height}`, `Current · ${p.width} × ${p.height}`]], v => { const [w, h] = v.split(':').map(Number); resizeProject(p, w, h); this.commit(); this.fit(); })));
        const width = el('input', { type: 'number', min: 320, max: 2160, value: p.width, class: 'input' }), height = el('input', { type: 'number', min: 320, max: 3840, value: p.height, class: 'input' });
        body.append(el('div', { class: 'field-grid' }, field('Custom width', width), field('Custom height', height)), button('Apply custom dimensions', 'check', () => {
            const copy = clone(p);
            resizeProject(copy, Number(width.value), Number(height.value));
            this.project = copy;
            this.commit();
            this.fit();
            if (this.mobile)
                closeDialog();
        }, 'secondary', 'full'), el('div', { class: 'panel-section-title', text: `Slide ${this.activeSlide + 1}` }), colorField('Background', s.background, v => { s.background = v; this.commit(); }), field('Paper treatment', select(s.texture, ['none', 'paper', 'grid', 'linen'], v => { s.texture = v; this.commit(); })), button('Use background on all slides', 'check', () => { p.slides.forEach(sl => { sl.background = s.background; sl.texture = s.texture; }); this.commit(); }, 'secondary', 'full'), button('Duplicate this slide', 'copy', () => {
            duplicateSlide(p, this.activeSlide);
            this.commit();
            this.goSlide(this.activeSlide + 1);
            if (this.mobile)
                closeDialog();
        }, 'secondary', 'full'), button('Remove this slide', 'trash', () => {
            if (p.slides.length <= 1) {
                toast('Keep at least one slide.');
                return;
            }
            removeSlide(p, this.activeSlide);
            this.activeSlide = Math.min(this.activeSlide, p.slides.length - 1);
            this.commit();
            this.fit();
            if (this.mobile)
                closeDialog();
        }, 'ghost', 'full'), el('div', { class: 'field-grid' }, ...[-1, 1].map(delta => { const b = button(delta < 0 ? 'Move slide earlier' : 'Move slide later', delta < 0 ? 'back' : 'next', () => { const target = this.activeSlide + delta; moveSlide(this.project, this.activeSlide, target); this.activeSlide = target; this.commit(); this.goSlide(target); if (this.mobile)
            closeDialog(); }, 'secondary'); b.disabled = this.activeSlide + delta < 0 || this.activeSlide + delta >= p.slides.length; return b; })), el('p', { class: 'hint', text: 'Moving and removing slides uses each layer’s center. Crossing artwork stays whole, so preview the new joins. Undo is always available.' }), el('div', { class: 'panel-section-title', text: 'Keep it editable' }), button('Download project backup', 'save', () => this.backup(), 'primary', 'full'), button('Save as my template', 'heart', () => this.save(true), 'secondary', 'full'), button('Download layout recipe', 'download', async () => { const recipe = templateRecipe(this.project); download(await portableProject(recipe), slug(recipe.name) + '.stillroll'); }, 'secondary', 'full'), button('Plan a post', 'calendar', () => this.plan(), 'ghost', 'full'));
        return body;
    }
    async backup() { toast('Packing your original media and editable layers…'); const blob = await portableProject(this.project); download(blob, slug(this.project.name) + '.stillroll'); toast('Project backup prepared. Keep it somewhere safe.', 'success'); }
    plan() { const date = el('input', { class: 'input', type: 'datetime-local', value: this.project.planDate || '' }), notes = el('textarea', { class: 'input', rows: 4, value: this.project.notes, placeholder: 'Caption, tags, or a little note to yourself…' }); dialog('A little plan', el('div', {}, el('p', { class: 'muted', text: 'A downloadable calendar reminder for manual posting. Stillroll does not schedule or automatically publish to Instagram or TikTok.' }), field('When', date), field('Caption / notes', notes), button('Save notes & calendar reminder', 'calendar', () => { const blob = planningCalendar({ ...this.project, notes: notes.value }, date.value); this.project.notes = notes.value; this.project.planDate = date.value; this.commit(); download(blob, slug(this.project.name) + '.ics'); closeDialog(); }, 'primary', 'full'))); }
    async preview() {
        const body = el('div', {}, el('p', { class: 'muted', text: 'Swipe through the actual composition. No glass, guides, or selection handles are included.' }), el('div', { class: 'preview-loading', text: 'Preparing your story…' }));
        dialog('Preview', body, 'overlay', true);
        const abort = new AbortController();
        const d = document.getElementById('overlay');
        d.addEventListener('close', () => abort.abort(), { once: true });
        const files = await exportImages(this.project, { format: 'jpeg', quality: .88, width: 540, signal: abort.signal });
        if (!d.open)
            return;
        body.querySelector('.preview-loading')?.remove();
        const reel = el('div', { class: 'preview-reel' }), urls = [];
        for (const f of files) {
            const url = blobURL(f.blob);
            urls.push(url);
            reel.append(el('figure', {}, el('img', { src: url, alt: `Slide ${f.slide + 1} of ${files.length}` }), el('figcaption', { text: `${String(f.slide + 1).padStart(2, '0')} / ${String(files.length).padStart(2, '0')}` })));
        }
        body.append(reel, button('Export this story', 'export', () => { closeDialog('overlay'); this.exportSheet(); }, 'primary', 'full'));
        d.addEventListener('close', () => urls.forEach(URL.revokeObjectURL), { once: true });
    }
    exportSheet() {
        this.before = false;
        this.loadResources();
        const body = el('div', { class: 'export-content' }, el('p', { class: 'muted', text: 'Your story, ready for the camera roll. Full size, in order, with no watermark.' }));
        body.append(el('p', { class: 'hint', text: 'Sharing the sample photos? Some require credit. Photo credits are available with your output and included in image ZIPs.' }));
        let format = 'jpeg', quality = .94, width = this.project.width;
        const status = el('p', { class: 'hint', role: 'status' }), progress = el('progress', { max: 1, value: 0, 'aria-label': 'Export progress' });
        progress.hidden = true;
        let controller;
        let working = false;
        const settings = el('div', {}, field('Image format', select(format, [['jpeg', 'JPEG · smaller files'], ['png', 'PNG · lossless'], ['webp', 'WebP · compact']], v => format = v)), field('Output width', select(String(width), [...new Set([720, 1080, this.project.width, 2160])].filter(v => v * v * this.project.height / this.project.width <= 8294400).map(v => [String(v), `${v} × ${Math.round(v * this.project.height / this.project.width)} px`]), v => width = Number(v))), range('JPEG / WebP quality', 94, 60, 100, 1, v => quality = v / 100, undefined, '%'));
        const cancel = button('Cancel export', 'close', () => { controller?.abort(); cancelProcessing(); }, 'ghost', 'full');
        cancel.hidden = true;
        const run = button(`Prepare ${this.project.slides.length} images`, 'export', async () => {
            if (working)
                return;
            working = true;
            run.disabled = true;
            controller = new AbortController();
            progress.hidden = false;
            cancel.hidden = false;
            try {
                const files = await exportImages(clone(this.project), { format, quality, width, signal: controller.signal, progress: (n, label) => { progress.value = n; status.textContent = label; } });
                if (!d.open)
                    return;
                settings.hidden = true;
                run.hidden = true;
                cancel.hidden = true;
                progress.hidden = true;
                this.outputResults(body, files, d);
            }
            catch (e) {
                status.textContent = e.message;
            }
            finally {
                working = false;
                run.disabled = false;
                cancel.hidden = true;
            }
        }, 'primary', 'full');
        body.append(settings, progress, status, run, cancel);
        const videoNodes = this.project.nodes.filter(n => n.kind === 'video');
        if (videoNodes.length) {
            const mime = videoMime();
            const video = el('details', { class: 'video-settings' }, el('summary', { text: 'Export motion on the current slide' }), el('p', { class: 'hint', text: mime ? 'Real muted video recording. Keep this tab visible. Colour grades on still photos remain; video layers keep original colour. Format: ' + (mime.includes('mp4') ? 'MP4' : 'WebM (not accepted by every social app).') : 'This browser cannot record canvas video. Still-image export remains available.' }));
            let duration = 5;
            video.append(range('Duration', 5, 1, 15, 1, v => duration = v, undefined, ' sec'));
            const vb = button('Record current slide', 'film', async () => {
                if (working)
                    return;
                working = true;
                vb.disabled = true;
                controller = new AbortController();
                progress.hidden = false;
                cancel.hidden = false;
                try {
                    const file = await exportVideo(clone(this.project), this.activeSlide, duration, Math.min(1080, width), controller.signal, n => { progress.value = n; status.textContent = 'Recording · keep this tab open'; });
                    if (d.open) {
                        this.outputResults(body, [file], d);
                        status.textContent = 'Video ready';
                    }
                }
                finally {
                    working = false;
                    vb.disabled = false;
                    progress.hidden = true;
                    cancel.hidden = true;
                }
            }, 'secondary', 'full');
            vb.disabled = !mime;
            video.append(vb);
            body.append(video);
        }
        const d = dialog('Export', body, 'overlay');
        d.addEventListener('close', () => { controller?.abort(); cancelProcessing(); }, { once: true });
    }
    outputResults(body, files, d) {
        const nativeSave = files.some(f => prefersNativeSave([f]));
        const readyCopy = `${files.length} ${files[0].blob.type.startsWith('video') ? 'video' : 'images'} ready. ${nativeSave ? 'Tap Save to Photos, then choose Save Image or Save Video in the share sheet.' : 'Choose where to save.'}`;
        const result = el('div', { class: 'export-results' }, el('div', { class: 'success-note' }, icon('check'), el('span', { text: readyCopy })));
        const reel = el('div', { class: 'export-reel' }), urls = [];
        for (const f of files) {
            const url = blobURL(f.blob);
            urls.push(url);
            const video = f.blob.type.startsWith('video'), mobileSave = prefersNativeSave([f]), media = video ? el('video', { src: url, controls: true, playsinline: true, muted: true }) : el('img', { src: url, alt: 'Exported slide ' + (f.slide + 1) });
            const saveLabel = mobileSave ? `Save ${video ? 'video' : 'slide ' + (f.slide + 1)} to Photos` : `Save ${video ? 'video' : 'slide ' + (f.slide + 1)}`;
            reel.append(el('div', { class: 'export-item' }, media, button(saveLabel, mobileSave ? 'share' : 'download', async () => {
                if (mobileSave)
                    toast(`Choose ${video ? 'Save Video' : 'Save Image'} in the share sheet.`);
                await saveOutput(f);
            }, 'primary', 'full'), el('small', { class: 'muted', text: `${Math.round(f.blob.size / 1024)} KB` })));
        }
        result.append(reel);
        if (canShare(files))
            result.append(button('Share images', 'share', async () => {
                try {
                    await shareFiles(files);
                    toast('Share sheet completed. Check your chosen destination to confirm saving.');
                }
                catch (e) {
                    if (e.name !== 'AbortError')
                        throw e;
                }
            }, 'secondary', 'full'));
        if (files.length > 1)
            result.append(button('Download all as ZIP', 'folder', async () => { const zip = await zipImages(files, undefined, await projectCredits(this.project)); download(zip, slug(this.project.name) + '.zip'); }, 'secondary', 'full'));
        result.append(button('Photo credits', 'info', async () => { const copy = await projectCredits(this.project); const area = el('textarea', { class: 'input', rows: 9, readonly: true, value: copy, 'aria-label': 'Photo credits to include when sharing' }); dialog('Credit where it’s due', el('div', {}, el('p', { class: 'hint', text: 'Credit CC BY sample photos when you share them, or replace them with your own. ZIPs include these credits.' }), area, button('Select credits for copying', 'copy', () => { area.focus(); area.select(); }, 'secondary', 'full'))); }, 'ghost', 'full'), el('p', { class: 'hint', text: nativeSave ? 'The share sheet is required because mobile browsers cannot silently write to Photos. Confirm Save Image or Save Video before closing it.' : 'Saving and sharing depend on your browser. A completed share sheet does not confirm that files reached Photos or Instagram.' }), button('Keep editing', 'back', () => closeDialog('overlay'), 'ghost', 'full'));
        body.append(result);
        d.addEventListener('close', () => urls.forEach(URL.revokeObjectURL), { once: true });
    }
    key(e) {
        const tag = e.target?.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.querySelector('dialog[open]'))
            return;
        const cmd = e.metaKey || e.ctrlKey;
        if (cmd && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            e.shiftKey ? this.redo() : this.undo();
            return;
        }
        if (cmd && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.redo();
            return;
        }
        if (cmd && e.key.toLowerCase() === 's') {
            e.preventDefault();
            void this.backup();
            return;
        }
        if (cmd && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            this.duplicate();
            return;
        }
        if (e.key === 'Escape') {
            this.selected.clear();
            this.hand = false;
            this.refresh(false);
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selected.size) {
                e.preventDefault();
                this.deleteSelected();
            }
            return;
        }
        if (e.key === 'Enter' && this.first?.kind === 'text') {
            this.editText(this.first);
            return;
        }
        if (e.key.toLowerCase() === 'h') {
            this.hand = !this.hand;
            this.selectionBar();
            return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && this.selection.length) {
            e.preventDefault();
            const d = e.shiftKey ? 10 : 1;
            for (const n of this.selection.filter(n => !n.locked)) {
                if (e.key === 'ArrowLeft')
                    n.x -= d;
                if (e.key === 'ArrowRight')
                    n.x += d;
                if (e.key === 'ArrowUp')
                    n.y -= d;
                if (e.key === 'ArrowDown')
                    n.y += d;
            }
            this.commit();
        }
    }
    async leave() {
        clearTimeout(this.saveTimer);
        const saved = await this.save();
        const leave = () => { this.destroy(); this.onHome(); };
        if (saved) {
            leave();
            return;
        }
        dialog('Keep your story safe', el('div', {}, el('p', { class: 'notice', text: 'This project is not saved locally. Download an editable backup before leaving, or your edits will be lost.' }), button('Download editable backup', 'save', () => this.backup(), 'primary', 'full'), button('Keep editing', 'back', () => closeDialog(), 'secondary', 'full'), button('Leave without local saving', undefined, () => { closeDialog(); leave(); }, 'ghost', 'full')));
    }
    destroy() { this.disposed = true; this.photoFlow.dispose(); window.removeEventListener('beforeunload', this.boundUnload); this.epoch++; clearTimeout(this.saveTimer); clearTimeout(this.resourceTimer); this.resizeObserver?.disconnect(); document.removeEventListener('keydown', this.boundKey); document.body.classList.remove('editing'); this.urls.forEach(URL.revokeObjectURL); this.urls.clear(); this.canvas.width = this.canvas.height = this.overlay.width = this.overlay.height = 1; this.resources.clear(); clearMediaCache(); clearRenderCache(); }
}
