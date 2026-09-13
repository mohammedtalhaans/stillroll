import { formatLabel } from './catalog.js';
import { el, button, sourceURL } from './ui.js';
export function featuredRail(entries, preview, use) {
    const items = entries.filter(t => t.featured).sort((a, b) => b.curation - a.curation);
    if (!items.length)
        items.push(...entries.slice(0, 8));
    let index = 0, pending = 0, visible = true, hover = false, focused = false, paused = false, disposed = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const root = el('section', { class: 'showcase', 'aria-label': 'Featured templates' });
    if (!items.length) {
        root.hidden = true;
        return { element: root, dispose() { } };
    }
    const art = button('Preview featured template', undefined, () => items[index] && preview(items[index]), 'plain', 'showcase-art');
    const image = el('img', { alt: '', decoding: 'async', fetchpriority: 'high' });
    art.append(image);
    const eyebrow = el('p', { class: 'eyebrow' }), title = el('h2'), meta = el('p', { class: 'muted' });
    const position = el('span', { class: 'showcase-position' });
    const primary = button('Use template', 'plus', () => items[index] && use(items[index]), 'primary');
    const previous = button('Previous featured template', 'back', () => { paused = true; void show(index - 1); }, 'ghost', 'icon-only');
    const next = button('Next featured template', 'next', () => { paused = true; void show(index + 1); }, 'ghost', 'icon-only');
    const pause = button('Pause featured rotation', 'pause', () => { paused = !paused; updatePause(); }, 'ghost', 'icon-only');
    const controls = el('div', { class: 'showcase-controls' }, previous, position, next, pause);
    root.append(art, el('div', { class: 'showcase-info' }, eyebrow, title, meta, primary, controls));
    function updatePause() {
        pause.setAttribute('aria-pressed', String(paused || motion.matches));
        pause.setAttribute('aria-label', paused ? 'Resume featured rotation' : 'Pause featured rotation');
        pause.title = paused ? 'Resume featured rotation' : 'Pause featured rotation';
        pause.hidden = motion.matches;
    }
    async function show(target) {
        if (!items.length || disposed)
            return;
        const token = ++pending, selected = (target + items.length) % items.length, entry = items[selected];
        const src = sourceURL(entry.feature || entry.spread);
        const preload = new Image();
        preload.src = src;
        try {
            await preload.decode();
        }
        catch { /* Keep the current artwork on a failed nearby preview. */
            if (image.src)
                return;
        }
        if (disposed || token !== pending)
            return;
        index = selected;
        image.src = src;
        image.alt = entry.name + ' — actual editable composition';
        art.setAttribute('aria-label', 'Preview ' + entry.name);
        art.title = 'Preview ' + entry.name;
        eyebrow.textContent = entry.collection;
        title.textContent = entry.name;
        meta.textContent = `${entry.slideCount} ${entry.slideCount === 1 ? 'slide' : 'slides'} · ${formatLabel(entry)} · ${entry.slotCount} photos`;
        position.textContent = `${index + 1} / ${items.length}`;
        updatePause();
        for (const neighbor of [1, -1]) {
            const item = items[(index + neighbor + items.length) % items.length];
            const img = new Image();
            img.src = sourceURL(item.feature || item.spread);
        }
    }
    root.addEventListener('mouseenter', () => { hover = true; });
    root.addEventListener('mouseleave', () => { hover = false; });
    root.addEventListener('focusin', () => { focused = true; });
    root.addEventListener('focusout', event => { focused = !!event.relatedTarget && root.contains(event.relatedTarget); });
    let touchX;
    art.addEventListener('touchstart', event => { touchX = event.touches[0]?.clientX; hover = true; }, { passive: true });
    art.addEventListener('touchend', event => {
        const x = event.changedTouches[0]?.clientX;
        if (x !== undefined && touchX !== undefined && Math.abs(x - touchX) > 40) {
            paused = true;
            void show(index + (x < touchX ? 1 : -1));
        }
        touchX = undefined;
        hover = false;
    }, { passive: true });
    const observer = new IntersectionObserver(values => { visible = values.some(v => v.isIntersecting); }, { threshold: .15 });
    observer.observe(root);
    const timer = window.setInterval(() => { if (!disposed && !paused && !motion.matches && !document.hidden && visible && !hover && !focused && !document.querySelector('dialog[open]'))
        void show(index + 1); }, 8500);
    motion.addEventListener('change', updatePause);
    void show(0);
    return { element: root, dispose() { disposed = true; pending++; clearInterval(timer); observer.disconnect(); motion.removeEventListener('change', updatePause); image.src = ''; } };
}
