/** All artwork is expressed in logical design units: 360 units per slide. */
export const UNIT = 360;
export const SCHEMA = 2;
/** Curated platform families; no font binaries are distributed. */
export const FONTS = {
    atelierSerif: "'EB Garamond', Georgia, 'Times New Roman', serif",
    atelierDisplay: "'Noto Serif Display', 'Bodoni MT', Didot, Georgia, serif",
    atelierScript: "Z003, 'URW Chancery L', 'Apple Chancery', 'Segoe Print', cursive",
    atelierSans: "'Liberation Sans', Arial, sans-serif",
    atelierMono: "'Liberation Mono', 'Courier New', monospace",
    atelierJapanese: "'Noto Serif CJK JP', 'Noto Serif CJK SC', serif",
    playfair: '"Stillroll Playfair Display", Georgia, serif',
    bodoni: '"Stillroll Bodoni Moda", Didot, Georgia, serif',
    cormorant: '"Stillroll Cormorant Garamond", Baskerville, Georgia, serif',
    anton: '"Stillroll Anton", Impact, "Arial Narrow", sans-serif',
    outfit: '"Stillroll Outfit", "Avenir Next", sans-serif',
    plex: '"Stillroll IBM Plex Mono", Consolas, monospace',
    caveat: '"Stillroll Caveat", "Bradley Hand", cursive',
    kalam: '"Stillroll Kalam", "Segoe Print", cursive',
    spacegrotesk: '"Stillroll Space Grotesk", "Segoe UI", sans-serif',
    bitter: '"Stillroll Bitter", Rockwell, Georgia, serif',
    pressstart: '"Stillroll Press Start 2P", "Courier New", monospace',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Nimbus Sans", sans-serif',
    serif: 'Georgia, "Bitstream Charter", "Times New Roman", serif',
    mono: '"SFMono-Regular", "Courier 10 Pitch", Consolas, "Liberation Mono", monospace',
    hand: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
    display: 'Didot, "Bodoni MT", "Nimbus Roman", "Times New Roman", serif',
    book: 'Baskerville, "Palatino Linotype", "URW Bookman", "Book Antiqua", serif',
    condensed: 'Impact, "Arial Narrow", "Nimbus Sans Narrow", "DejaVu Sans", sans-serif',
    rounded: '"Avenir Next", Quicksand, "Century Gothic", "URW Gothic", sans-serif',
    slab: 'Rockwell, "American Typewriter", "DejaVu Serif", Georgia, serif',
    script: '"Snell Roundhand", "Segoe Script", Z003, cursive'
};
export const FONT_LABELS = { atelierSerif: "Atelier serif", atelierDisplay: "Atelier display", atelierScript: "Atelier script", atelierSans: "Atelier sans", atelierMono: "Atelier mono", atelierJapanese: "Atelier Japanese", playfair: 'Playfair Display', bodoni: 'Bodoni Moda', cormorant: 'Cormorant Garamond', anton: 'Anton', outfit: 'Outfit', plex: 'IBM Plex Mono', caveat: 'Caveat', kalam: 'Kalam', spacegrotesk: 'Space Grotesk', bitter: 'Bitter', pressstart: 'Press Start 2P', sans: 'System sans', serif: 'Editorial serif', mono: 'Typewriter', hand: 'Handwritten', display: 'Modern display', book: 'Book serif', condensed: 'Condensed poster', rounded: 'Geometric rounded', slab: 'Slab editorial', script: 'Calligraphic' };
export const defaultGrade = () => ({ preset: 'original', intensity: 100, exposure: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0, vignette: 0, fade: 0 });
export const uid = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const clone = (v) => JSON.parse(JSON.stringify(v));
export const designHeight = (p) => UNIT * p.height / p.width;
export const baseNode = (kind, x = 24, y = 24, w = 140, h = 160) => ({ id: uid(), name: kind[0].toUpperCase() + kind.slice(1), kind, role: kind === 'photo' || kind === 'video' ? 'slot' : kind === 'text' ? 'text' : 'decoration', x, y, w, h, rotation: 0, opacity: 1, locked: false });
export function blankProject(width = 1080, height = 1350, count = 3) { return { schema: 2, output: count === 1 ? 'single' : 'carousel', id: uid(), name: 'Untitled project', created: Date.now(), updated: Date.now(), width, height, slides: Array.from({ length: count }, (_, i) => ({ id: uid(), name: `Slide ${i + 1}`, background: '#f4f0e8', texture: 'none' })), nodes: [], notes: '' }; }
export const newPhoto = (assetId, x = 24, y = 72, w = 240, h = 280) => ({ ...baseNode('photo', x, y, w, h), kind: 'photo', role: 'slot', fit: 'fill', slotState: assetId ? (assetId.startsWith('demo-') ? 'demo' : 'filled') : 'empty', assetId, crop: { x: .5, y: .5, zoom: 1 }, mask: 'rectangle', grade: defaultGrade(), border: '#ffffff', borderWidth: 0, shadow: 0 });
export const newText = (text = 'A little moment.', x = 30, y = 40, w = 280, size = 32) => ({ ...baseNode('text', x, y, w, size * 2.6), kind: 'text', text, font: 'serif', fontSize: size, weight: 400, italic: false, align: 'left', lineHeight: 1.15, letterSpacing: 0, color: '#262a23' });
export const newShape = (x, y, w, h, fill) => ({ ...baseNode('shape', x, y, w, h), kind: 'shape', shape: 'rect', fill, stroke: 'transparent', strokeWidth: 0, radius: 0 });
export function validateProject(input) {
    if (!input || typeof input !== 'object')
        throw new Error('This is not a Stillroll project.');
    const p = input;
    if (p.schema !== 1 && p.schema !== SCHEMA)
        throw new Error('This project uses an unsupported file version.');
    if (!Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width < 320 || p.width > 2160 || p.height < 320 || p.height > 3840 || p.width * p.height > 8294400)
        throw new Error('Choose dimensions from 320 to 2160 pixels wide and up to 3840 pixels tall (8 megapixels maximum).');
    if (!Array.isArray(p.slides) || p.slides.length < 1 || p.slides.length > 20 || !Array.isArray(p.nodes) || p.nodes.length > 500)
        throw new Error('A project can contain 1–20 slides and at most 500 layers.');
    if (typeof p.name !== 'string' || p.name.length > 150 || typeof p.id !== 'string')
        throw new Error('The project header is invalid.');
    if (typeof p.notes !== 'string' || p.notes.length > 20000 || !Number.isFinite(p.created) || !Number.isFinite(p.updated))
        throw new Error('The project details are invalid.');
    if (p.output !== undefined && !['carousel', 'story', 'grid', 'single'].includes(p.output))
        throw new Error('The output mode is invalid.');
    if (p.gridColumns !== undefined && (!Number.isInteger(p.gridColumns) || p.gridColumns < 1 || p.gridColumns > 4))
        throw new Error('A profile grid supports one to four columns.');
    if (p.templateRevision !== undefined && (!Number.isInteger(p.templateRevision) || p.templateRevision < 1))
        throw new Error('The template revision is invalid.');
    if (p.mediaIds !== undefined && (!Array.isArray(p.mediaIds) || p.mediaIds.length > 500 || p.mediaIds.some(id => typeof id !== 'string' || id.length > 150)))
        throw new Error('The project photo library is invalid.');
    if (p.recipe !== undefined && typeof p.recipe !== 'boolean')
        throw new Error('The recipe marker is invalid.');
    const validColor = (s) => typeof s === 'string' && s.length <= 100 && !/[<>;]|url\(/i.test(s);
    const slideIds = new Set();
    for (const slide of p.slides) {
        if (!slide || typeof slide.id !== 'string' || slideIds.has(slide.id) || typeof slide.name !== 'string' || slide.name.length > 150 || !validColor(slide.background) || !['none', 'paper', 'grid', 'linen'].includes(slide.texture))
            throw new Error('The slide settings are invalid.');
        slideIds.add(slide.id);
    }
    const ids = new Set();
    for (const n of p.nodes) {
        if (!n || !['photo', 'video', 'text', 'shape', 'sticker'].includes(n.kind) || typeof n.id !== 'string' || ids.has(n.id))
            throw new Error('The project contains an invalid or duplicate layer.');
        ids.add(n.id);
        if (n.role !== undefined && !['slot', 'artwork', 'decoration', 'text'].includes(n.role))
            throw new Error('The layer role is invalid.');
        if (n.role === 'slot' && n.kind !== 'photo' && n.kind !== 'video')
            throw new Error('Only photo and video frames can be photo slots.');
        if (typeof n.name !== 'string' || n.name.length > 300 || typeof n.locked !== 'boolean')
            throw new Error('The layer details are invalid.');
        for (const k of ['x', 'y', 'w', 'h', 'rotation', 'opacity'])
            if (!Number.isFinite(n[k]) || Math.abs(n[k]) > 1e6)
                throw new Error('The project contains invalid geometry.');
        if (n.w <= 0 || n.h <= 0 || n.opacity < 0 || n.opacity > 1)
            throw new Error('The project contains invalid layer dimensions.');
        if (n.kind === 'text' && ((n.baselineShift !== undefined && (!Number.isFinite(n.baselineShift) || Math.abs(n.baselineShift) > 1000)) || (n.noWrap !== undefined && typeof n.noWrap !== 'boolean')))
            throw new Error('Invalid text layout.');
        if (n.kind === 'text' && (typeof n.text !== 'string' || n.text.length > 5000 || !Object.hasOwn(FONTS, n.font) || !Number.isFinite(n.fontSize) || n.fontSize < 1 || n.fontSize > 360))
            throw new Error('The project contains invalid text.');
        if ((n.kind === 'photo' || n.kind === 'video') && (typeof n.assetId !== 'string' || !n.crop || !Number.isFinite(n.crop.zoom) || n.crop.zoom < 1 || n.crop.zoom > 8 || !['rectangle', 'rounded', 'circle', 'arch', 'torn', 'diamond', 'cup', 'ticket', 'airplane', 'disc', 'custom'].includes(n.mask)))
            throw new Error('The photo settings are invalid.');
        if (n.kind === 'text' && (!['left', 'center', 'right'].includes(n.align) || !Number.isFinite(n.lineHeight) || n.lineHeight < .5 || n.lineHeight > 5 || !Number.isFinite(n.letterSpacing) || Math.abs(n.letterSpacing) > 100 || !Number.isFinite(n.weight) || n.weight < 100 || n.weight > 1000 || !validColor(n.color)))
            throw new Error('The text style is invalid.');
        if (n.kind === 'photo' || n.kind === 'video') {
            if (n.assetId.length > 150 || (n.fit !== undefined && !['fill', 'fit'].includes(n.fit)) || (n.slotState !== undefined && !['empty', 'demo', 'filled'].includes(n.slotState)))
                throw new Error('The photo slot is invalid.');
            if (n.maskPath !== undefined && (typeof n.maskPath !== 'string' || n.maskPath.length > 50000 || /[^MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]/.test(n.maskPath)))
                throw new Error('The photo mask is invalid.');
            if (n.matColor !== undefined && !validColor(n.matColor))
                throw new Error('The photo mat is invalid.');
            if (!Number.isFinite(n.crop.x) || !Number.isFinite(n.crop.y) || n.crop.x < 0 || n.crop.x > 1 || n.crop.y < 0 || n.crop.y > 1 || !n.grade || typeof n.grade.preset !== 'string')
                throw new Error('The crop or colour settings are invalid.');
            for (const key of ['intensity', 'exposure', 'contrast', 'saturation', 'warmth', 'grain', 'vignette', 'fade']) {
                const value = n.grade[key];
                if (!Number.isFinite(value) || Math.abs(value) > 100 || (key === 'intensity' && value < 0) || (key === 'exposure' && Math.abs(value) > 8))
                    throw new Error('The photo adjustments are invalid.');
            }
            if (n.grade.bloom !== undefined && (!Number.isFinite(n.grade.bloom) || n.grade.bloom < 0 || n.grade.bloom > 100))
                throw new Error('The bloom setting is invalid.');
            if (!Number.isFinite(n.borderWidth) || n.borderWidth < 0 || n.borderWidth > 100 || !Number.isFinite(n.shadow) || n.shadow < 0 || n.shadow > 100 || !validColor(n.border) || (n.videoStart !== undefined && (!Number.isFinite(n.videoStart) || n.videoStart < 0 || n.videoStart > 86400)))
                throw new Error('The photo frame is invalid.');
            if (n.cutout) {
                const c = n.cutout;
                if (!/^#[0-9a-f]{6}$/i.test(c.color) || !Number.isFinite(c.tolerance) || c.tolerance < 0 || c.tolerance > 100 || !Number.isFinite(c.softness) || c.softness < 0 || c.softness > 100 || typeof c.enabled !== 'boolean')
                    throw new Error('The eraser settings are invalid.');
                if (c.strokes) {
                    if (!Array.isArray(c.strokes) || c.strokes.length > 1000)
                        throw new Error('The eraser is too complex.');
                    for (const stroke of c.strokes) {
                        if (!Number.isFinite(stroke.size) || stroke.size <= 0 || stroke.size > 1 || !Array.isArray(stroke.points) || stroke.points.length > 5000 || stroke.points.some(q => !Array.isArray(q) || q.length !== 2 || q.some(v => !Number.isFinite(v) || v < 0 || v > 1)))
                            throw new Error('The eraser strokes are invalid.');
                    }
                }
            }
        }
        if (n.kind === 'sticker' && (typeof n.assetId !== 'string' || n.assetId.length > 150))
            throw new Error('The creative element is invalid.');
        if (n.kind === 'shape' && (!['rect', 'ellipse', 'line', 'path'].includes(n.shape) || !validColor(n.fill) || !validColor(n.stroke) || !Number.isFinite(n.strokeWidth) || n.strokeWidth < 0 || n.strokeWidth > 100 || !Number.isFinite(n.radius) || n.radius < 0 || n.radius > 10000 || (n.path !== undefined && (typeof n.path !== 'string' || n.path.length > 50000 || /[^MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]/.test(n.path))) || (n.gradient && (!validColor(n.gradient.to) || !Number.isFinite(n.gradient.angle)))))
            throw new Error('The shape settings are invalid.');
    }
    const migrated = clone(p);
    migrated.schema = 2;
    migrated.output ??= migrated.slides.length === 1 ? 'single' : 'carousel';
    for (const node of migrated.nodes) {
        node.role ??= node.kind === 'photo' || node.kind === 'video' ? 'slot' : node.kind === 'text' ? 'text' : 'decoration';
        if (node.kind === 'photo' || node.kind === 'video') {
            node.fit ??= 'fill';
            node.slotState ??= !node.assetId ? 'empty' : node.assetId.startsWith('demo-') ? 'demo' : 'filled';
        }
    }
    return migrated;
}
export function resizeProject(p, width, height) {
    const next = clone(p), ratio = (UNIT * height / width) / designHeight(p);
    next.width = width;
    next.height = height;
    for (const n of next.nodes) {
        n.y *= ratio;
        n.h *= ratio;
        if (n.kind === 'text')
            n.fontSize *= Math.min(1, ratio);
    }
    const valid = validateProject(next);
    Object.assign(p, valid);
    return valid;
}
/** A crossing object stays whole and belongs to the tile containing its center. */
export function duplicateSlide(p, index) {
    if (p.slides.length >= 20)
        throw new Error('This project already has 20 slides.');
    if (!Number.isInteger(index) || !p.slides[index])
        throw new Error('Choose an existing slide.');
    const origins = p.slides.map((_, i) => tileOrigin(p, i));
    const owners = p.nodes.map(n => ownerSlide(p, n));
    const originals = p.nodes.filter((_, i) => owners[i] === index);
    if (p.nodes.length + originals.length > 500)
        throw new Error('Duplicating this slide would exceed 500 layers.');
    const groupMap = new Map();
    const copies = originals.map(n => {
        const copy = clone(n);
        copy.id = uid();
        if (copy.groupId) {
            if (!groupMap.has(copy.groupId))
                groupMap.set(copy.groupId, uid());
            copy.groupId = groupMap.get(copy.groupId);
        }
        return copy;
    });
    p.slides.splice(index + 1, 0, { ...clone(p.slides[index]), id: uid(), name: `Slide ${index + 2}` });
    p.nodes.forEach((n, i) => { const owner = owners[i], origin = tileOrigin(p, owner > index ? owner + 1 : owner); n.x += origin.x - origins[owner].x; n.y += origin.y - origins[owner].y; });
    const target = tileOrigin(p, index + 1);
    for (const n of copies) {
        n.x += target.x - origins[index].x;
        n.y += target.y - origins[index].y;
    }
    p.nodes.push(...copies);
}
export function removeSlide(p, index) {
    if (p.slides.length <= 1)
        throw new Error('Keep at least one slide.');
    if (!Number.isInteger(index) || !p.slides[index])
        throw new Error('Choose an existing slide.');
    const origins = p.slides.map((_, i) => tileOrigin(p, i));
    const survivors = p.nodes.map(n => ({ n, owner: ownerSlide(p, n) })).filter(item => item.owner !== index);
    p.slides.splice(index, 1);
    for (const { n, owner } of survivors) {
        const origin = tileOrigin(p, owner > index ? owner - 1 : owner);
        n.x += origin.x - origins[owner].x;
        n.y += origin.y - origins[owner].y;
    }
    p.nodes = survivors.map(item => item.n);
}
export function moveSlide(p, from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || !p.slides[from] || !p.slides[to])
        throw new Error('Choose existing slides to reorder.');
    if (from === to)
        return;
    const ids = p.slides.map(s => s.id), origins = p.slides.map((_, i) => tileOrigin(p, i));
    const owners = p.nodes.map(n => ownerSlide(p, n));
    const [slide] = p.slides.splice(from, 1);
    p.slides.splice(to, 0, slide);
    const positions = new Map(p.slides.map((s, i) => [s.id, i]));
    p.nodes.forEach((n, i) => {
        const owner = owners[i], origin = tileOrigin(p, positions.get(ids[owner]));
        n.x += origin.x - origins[owner].x;
        n.y += origin.y - origins[owner].y;
    });
}
/** Output behavior changes tile positions, never the underlying scene representation. */
export function tileOrigin(p, slide) {
    if (p.output !== 'grid')
        return { x: slide * UNIT, y: 0 };
    const columns = p.gridColumns || 3;
    return { x: (slide % columns) * UNIT, y: Math.floor(slide / columns) * designHeight(p) };
}
export function worldSize(p) {
    return p.output === 'grid'
        ? { w: Math.min(p.gridColumns || 3, p.slides.length) * UNIT, h: Math.ceil(p.slides.length / (p.gridColumns || 3)) * designHeight(p) }
        : { w: p.slides.length * UNIT, h: designHeight(p) };
}
export function slideAtPoint(p, x, y) {
    const column = Math.max(0, Math.floor(x / UNIT));
    const raw = p.output === 'grid' ? Math.max(0, Math.floor(y / designHeight(p))) * (p.gridColumns || 3) + Math.min((p.gridColumns || 3) - 1, column) : column;
    return Math.max(0, Math.min(p.slides.length - 1, raw));
}
export const ownerSlide = (p, n) => slideAtPoint(p, n.x + n.w / 2, n.y + n.h / 2);
