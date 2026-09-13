import { blankProject, clone, uid, validateProject } from './model.js';
import { loadCatalog, loadPack, instantiateEntry, preference, savePreference, formatLabel } from './catalog.js';
import { DiscoveryIndex, emptyFilters, relatedTemplates } from './search.js';
import { el, button, icon, field, select, dialog, closeDialog, onDialogDispose, toast, empty, sourceURL, confirmAction } from './ui.js';
import { projects, deleteProject } from './storage.js';
import { appearanceButton } from './appearance.js';
import { featuredRail } from './showcase.js';
import { songsSection, safeExternal } from './songs.js';
let editor;
let catalog, index, disposeHome = () => { };
let catalogLoadError = '';
const app = document.getElementById('app');
const state = { view: 'templates', query: '', filters: emptyFilters(), shown: 24, scroll: 0, sort: 'curated' };
const favoriteIds = new Set((() => { const a = preference('favorites', []); return Array.isArray(a) ? a.filter(v => typeof v === 'string') : []; })());
let recentIds = (() => { const a = preference('recent', []); return Array.isArray(a) ? a.filter(v => typeof v === 'string').slice(0, 50) : []; })();
function brand() {
    const mark = el('span', { class: 'brand-mark', 'aria-hidden': 'true' });
    mark.innerHTML = '<svg viewBox="0 0 40 40" width="31" height="31" fill="none"><rect x="5" y="8" width="22" height="28" rx="5" stroke="currentColor" stroke-width="2" transform="rotate(-12 16 22)"/><rect x="15" y="5" width="21" height="28" rx="5" fill="var(--paper)" stroke="currentColor" stroke-width="2"/></svg>';
    return el('div', { class: 'brand' }, mark, el('span', { class: 'wordmark', text: 'stillroll' }));
}
export async function openProject(project) {
    const entry = catalog?.entries.find(t => t.id === project.templateId);
    if (entry)
        await loadPack(entry);
    const p = validateProject(project);
    editor?.destroy();
    disposeHome();
    for (const kind of ['sheet', 'overlay'])
        if (document.getElementById(kind).open)
            closeDialog(kind);
    app.replaceChildren(el('div', { class: 'boot' }, icon('images', 30), el('p', { text: 'Opening project…' })));
    const { Editor } = await import('./editor.js');
    editor = new Editor(app, p, () => { editor = undefined; void home(true); });
    window.scrollTo(0, 0);
}
async function useTemplate(entry) {
    state.scroll = window.scrollY;
    const project = await instantiateEntry(entry);
    recentIds = [entry.id, ...recentIds.filter(id => id !== entry.id)].slice(0, 50);
    savePreference('recent', recentIds);
    await openProject(project);
}
function newProject() {
    let format = '1080:1350', count = 3, output = 'carousel';
    const width = el('input', { class: 'input', type: 'number', min: 320, max: 2160, value: 1080 });
    const height = el('input', { class: 'input', type: 'number', min: 320, max: 3840, value: 1350 });
    const countInput = select('3', Array.from({ length: 20 }, (_, i) => [String(i + 1), String(i + 1)]), v => { count = Number(v); });
    const formats = select(format, [['1080:1350', 'Portrait · 4:5'], ['1080:1440', 'Portrait · 3:4'], ['1080:1080', 'Square · 1:1'], ['1080:1920', 'Story · 9:16'], ['1920:1080', 'Landscape · 16:9']], value => { format = value; [width.value, height.value] = value.split(':'); });
    const mode = select('carousel', [['carousel', 'Swipe carousel'], ['story', 'Consecutive Stories'], ['grid', 'Profile-grid mosaic'], ['single', 'Single collage']], value => {
        output = value;
        if (output === 'story') {
            width.value = '1080';
            height.value = '1920';
            formats.value = '1080:1920';
        }
        if (output === 'single') {
            count = 1;
            countInput.value = '1';
        }
        if (output === 'grid') {
            count = 9;
            countInput.value = '9';
        }
        countInput.disabled = output === 'single';
    });
    const body = el('div', {}, field('Output', mode), field('Format', formats), el('div', { class: 'field-grid' }, field('Width (px)', width), field('Height (px)', height)), field('Slides / tiles', countInput), el('p', { class: 'hint', text: 'A blank project is a freeform canvas. Finished templates have separately composed layouts; changing canvas size does not automatically redesign them.' }), button('Create project', 'plus', async () => {
        const p = blankProject(Number(width.value), Number(height.value), count);
        p.output = output;
        if (output === 'grid')
            p.gridColumns = 3;
        const valid = validateProject(p);
        state.scroll = window.scrollY;
        closeDialog();
        await openProject(valid);
    }, 'primary', 'full'));
    dialog('New project', body);
}
let refreshCards = () => { };
function favoriteButton(entry, card = false) {
    const buttonNode = button('Favorite ' + entry.name, 'heart', () => {
        favoriteIds.has(entry.id) ? favoriteIds.delete(entry.id) : favoriteIds.add(entry.id);
        if (!savePreference('favorites', [...favoriteIds]))
            toast('Favorites are available for this session, but this browser cannot remember them.');
        for (const node of document.querySelectorAll('button[data-favorite-id]'))
            if (node.dataset.favoriteId === entry.id) {
                node.setAttribute('aria-pressed', String(favoriteIds.has(entry.id)));
                node.title = favoriteIds.has(entry.id) ? 'Remove favorite' : 'Add favorite';
            }
        if (state.view === 'favorites')
            refreshCards();
    }, 'ghost', 'icon-only' + (card ? ' card-favorite' : ''));
    buttonNode.dataset.favoriteId = entry.id;
    buttonNode.setAttribute('aria-pressed', String(favoriteIds.has(entry.id)));
    buttonNode.title = favoriteIds.has(entry.id) ? 'Remove favorite' : 'Add favorite';
    return buttonNode;
}
function card(entry) {
    const article = el('article', { class: 'template-card', 'data-template-id': entry.id });
    const preview = button('Preview ' + entry.name, undefined, () => templateDetails(entry), 'plain', 'template-image');
    preview.style.background = entry.palette[0] || 'var(--subtle)';
    preview.replaceChildren(el('img', { src: sourceURL(entry.cover), alt: entry.name + ' — editable composition', loading: 'lazy', decoding: 'async', width: 360, height: 450 }), el('span', { class: 'card-format', text: `${entry.slideCount} ${entry.slideCount === 1 ? 'slide' : 'slides'} · ${formatLabel(entry)}` }));
    article.append(preview, favoriteButton(entry, true), el('div', { class: 'template-meta' }, el('div', {}, el('h3', { text: entry.name }), el('p', { text: entry.collection }), el('p', { text: `${entry.slotCount} photos · ${entry.styles[0] || 'Editorial'}` })), button('Use ' + entry.name, 'plus', () => useTemplate(entry), 'ghost', 'icon-only')));
    return article;
}
function navigate(view) { state.view = view; state.scroll = 0; void home(); }
function mainHeader() {
    const nav = el('nav', { class: 'app-nav', 'aria-label': 'Studio navigation' });
    for (const [id, label] of [['templates', 'Templates'], ['drafts', 'Drafts'], ['favorites', 'Favorites']])
        nav.append(button(label, undefined, () => navigate(id), state.view === id ? 'tab-active' : 'ghost'));
    return el('header', { class: 'app-header glass' }, brand(), nav, el('div', { class: 'header-tools' }, appearanceButton(), button('About Stillroll', 'info', () => about(), 'ghost', 'icon-only'), button('New project', 'plus', newProject, 'primary')));
}
async function home(restore = false) {
    disposeHome();
    document.body.classList.remove('editing');
    const main = el('main', { class: 'discovery', id: 'main' });
    app.replaceChildren(el('a', { class: 'skip-link', href: '#main', text: 'Skip to content' }), mainHeader(), main);
    const mobile = el('nav', { class: 'mobile-home-nav glass', 'aria-label': 'Mobile navigation' });
    for (const [id, label, ic] of [['templates', 'Templates', 'images'], ['drafts', 'Drafts', 'folder'], ['favorites', 'Favorites', 'heart']])
        mobile.append(button(label, ic, () => navigate(id), state.view === id ? 'tab-active' : 'ghost'));
    mobile.append(button('New project', 'plus', newProject, 'ghost'));
    app.append(mobile);
    if (state.view === 'drafts') {
        disposeHome = () => { };
        await drafts(main);
        return;
    }
    if (catalogLoadError)
        main.append(el('div', { class: 'notice', role: 'status' }, el('p', { text: 'The template catalog could not load. Drafts, new projects and project backups remain available.' }), button('Retry catalog', 'reset', start, 'secondary')));
    const search = el('input', { class: 'search-input', type: 'search', placeholder: 'Artist, film, occasion or style…', 'aria-label': 'Search templates', value: state.query, autocomplete: 'off' });
    const searchBox = el('div', { class: 'search-box' }, icon('search'), search);
    const filterButton = button('Filters', 'filter', () => filterSheet(() => renderCards(true)), 'secondary');
    main.append(el('div', { class: 'discovery-top' }, el('div', {}, el('h1', { text: state.view === 'favorites' ? 'Favorites' : 'Templates' }), el('p', { class: 'muted', text: `${catalog.entries.length} editable designs · local photo editing` })), el('div', { class: 'discovery-tools' }, searchBox, filterButton)));
    const rail = featuredRail(catalog.entries, entry => { void templateDetails(entry); }, useTemplate);
    if (state.view === 'templates')
        main.append(rail.element);
    const categories = el('nav', { class: 'discovery-categories', 'aria-label': 'Template categories' });
    for (const [id, label] of [['', 'All'], ['travel', 'Travel'], ['scrapbook', 'Scrapbooks'], ['analog', 'Analog'], ['editorial', 'Editorial'], ['nature', 'Nature'], ['music', 'Music'], ['wedding', 'Wedding'], ['food', 'Food']]) {
        if (id && !catalog.entries.some(entry => entry.tags.includes(id)))
            continue;
        const item = button(label, undefined, () => { state.filters.kind = id; renderCards(true); }, 'chip', state.filters.kind === id ? 'selected' : '');
        item.dataset.kind = id;
        categories.append(item);
    }
    const active = el('div', { class: 'active-filters', 'aria-label': 'Active filters' });
    const resultLabel = el('h2', { role: 'status', 'aria-live': 'polite' });
    const sort = select(state.sort, [['curated', 'Recommended'], ['recent', 'Recently used'], ['name', 'Name A–Z'], ['short', 'Fewest slides']], value => { state.sort = value; renderCards(false); });
    sort.setAttribute('aria-label', 'Sort templates');
    const grid = el('div', { class: 'template-grid' }), more = button('Load more templates', 'down', () => { state.shown += 24; renderCards(false); }, 'secondary', 'load-more');
    main.append(categories, active, el('div', { class: 'results-heading' }, resultLabel, sort), grid, more);
    function renderCards(reset = false) {
        if (reset)
            state.shown = 24;
        rail.element.hidden = !!state.query.trim() || Object.values(state.filters).some(Boolean);
        let results = index.search(state.query, state.filters).filter(entry => state.view !== 'favorites' || favoriteIds.has(entry.id));
        if (state.sort === 'name')
            results.sort((a, b) => a.name.localeCompare(b.name));
        if (state.sort === 'short')
            results.sort((a, b) => a.slideCount - b.slideCount || b.curation - a.curation);
        if (state.sort === 'recent')
            results.sort((a, b) => (recentIds.indexOf(a.id) < 0 ? 999 : recentIds.indexOf(a.id)) - (recentIds.indexOf(b.id) < 0 ? 999 : recentIds.indexOf(b.id)) || b.curation - a.curation);
        grid.replaceChildren(...results.slice(0, state.shown).map(result => card(result)));
        resultLabel.textContent = `${results.length} ${results.length === 1 ? 'template' : 'templates'}`;
        if (!results.length)
            grid.append(empty(state.view === 'favorites' && !favoriteIds.size ? 'Your favorites will appear here' : 'No matching templates', state.view === 'favorites' && !favoriteIds.size ? 'Tap the heart on a design to keep it close.' : 'Try fewer words or clear a filter.', 'search'));
        more.hidden = state.shown >= results.length;
        active.replaceChildren();
        for (const [key, value] of Object.entries(state.filters))
            if (value) {
                const label = key === 'collection' ? catalog.collections.find(c => c.id === value)?.name || value : value;
                active.append(button(label + ' · remove', 'close', () => { state.filters[key] = ''; renderCards(true); }, 'ghost'));
            }
        if (Object.values(state.filters).some(Boolean) || state.query)
            active.append(button('Clear all', undefined, () => { state.filters = emptyFilters(); state.query = ''; search.value = ''; renderCards(true); search.focus(); }, 'ghost'));
        categories.querySelectorAll('button').forEach(b => b.classList.toggle('selected', (b.dataset.kind || '') === (state.filters.kind || '')));
        const count = Object.values(state.filters).filter(Boolean).length;
        filterButton.querySelector('.btn-label').textContent = count ? `Filters · ${count}` : 'Filters';
    }
    let searchTimer = 0;
    search.addEventListener('input', () => { state.query = search.value; clearTimeout(searchTimer); searchTimer = window.setTimeout(() => renderCards(true), 65); });
    refreshCards = () => renderCards(false);
    renderCards();
    main.append(el('footer', { class: 'app-footer' }, el('span', { text: 'Photos stay on your device. An independent, open-source creative project.' }), button('About', 'info', about, 'ghost')));
    disposeHome = () => { clearTimeout(searchTimer); rail.dispose(); refreshCards = () => { }; };
    if (restore)
        requestAnimationFrame(() => window.scrollTo(0, state.scroll));
    else
        window.scrollTo(0, 0);
}
function filterSheet(apply) {
    const draft = { ...state.filters }, form = el('div', { class: 'filter-fields' });
    const unique = (key) => [...new Set(catalog.entries.flatMap(t => t[key]))].sort();
    const choose = (key, label, values) => form.append(field(label, select(draft[key] || '', [['', 'Any'], ...values], value => { draft[key] = value; })));
    choose('collection', 'Subject / collection', catalog.collections.map(c => [c.id, c.name]).sort((a, b) => a[1].localeCompare(b[1])));
    choose('occasion', 'Occasion', unique('occasions'));
    choose('style', 'Material / style', unique('styles'));
    choose('mood', 'Mood', unique('moods'));
    choose('length', 'Length', [['1-3', '1–3 slides'], ['4-6', '4–6 slides'], ['7-10', '7–10 slides'], ['11-20', '11–20 slides']]);
    choose('output', 'Output', [['carousel', 'Swipe carousel'], ['story', 'Consecutive Stories'], ['grid', 'Profile-grid mosaic'], ['single', 'Single collage']]);
    choose('ratio', 'Format', [['1:1', 'Square · 1:1'], ['4:5', 'Portrait · 4:5'], ['3:4', 'Portrait · 3:4'], ['9:16', 'Vertical · 9:16'], ['Landscape', 'Landscape']]);
    choose('photos', 'Photo slots', [['1-3', '1–3 photos'], ['4-6', '4–6 photos'], ['7-12', '7–12 photos'], ['13-60', '13+ photos']]);
    dialog('Filters', el('div', {}, form, el('div', { class: 'actions sticky-actions' }, button('Clear filters', undefined, () => { state.filters = emptyFilters(); closeDialog(); apply(); }, 'secondary'), button('Apply filters', 'check', () => { state.filters = draft; closeDialog(); apply(); }, 'primary'))));
}
async function templateDetails(entry) {
    const body = el('div', { class: 'template-detail' });
    body.append(el('div', { class: 'template-detail-head' }, el('div', {}, el('h3', { text: entry.name }), el('p', { class: 'muted', text: entry.collection })), favoriteButton(entry)));
    const output = { carousel: 'Swipe carousel', story: 'Consecutive Stories', grid: 'Profile-grid mosaic', single: 'Single collage' }[entry.output];
    body.append(el('p', { class: 'muted', text: entry.description }), el('div', { class: 'template-facts' }, ...[output, `${entry.slideCount} slides`, `${entry.slotCount} editable photos`, formatLabel(entry), ...entry.styles].map(text => el('span', { text }))));
    body.append(el('div', { class: 'detail-spread', tabindex: 0, 'aria-label': 'Full composition. Scroll horizontally to inspect every slide.' }, el('img', { src: sourceURL(entry.spread), alt: entry.name + ' — full continuous composition', width: entry.width * entry.slideCount, height: entry.height })));
    const reel = el('div', { class: 'detail-slides', 'aria-label': 'Swipeable template slides', tabindex: 0 });
    entry.slides.forEach((src, i) => reel.append(el('figure', {}, el('img', { src: sourceURL(src), alt: `${entry.name}, slide ${i + 1}`, loading: 'lazy', width: entry.width, height: entry.height }), el('figcaption', { text: `${i + 1} / ${entry.slideCount}` }))));
    body.append(reel, el('p', { class: 'hint', text: 'Tap any photo in the editor to upload, take a photo or adjust its crop. The thematic artwork stays separate.' }));
    if (entry.output === 'grid')
        body.append(el('p', { class: 'notice', text: 'This is a profile-grid mosaic, not a swipe carousel. Exported tile numbers describe reading order; post in reverse order to build the grid. Preview the profile crop in your social app.' }));
    const songSlot = el('div', {}, el('p', { class: 'hint', text: 'Loading song suggestions…' }));
    body.append(songSlot);
    const credits = el('details', { class: 'detail-section' }, el('summary', { text: 'Credits / asset details' }));
    body.append(credits);
    const related = relatedTemplates(entry, catalog.entries);
    body.append(el('section', { class: 'detail-section' }, el('h3', { text: 'Related templates' }), el('div', { class: 'related-templates' }, ...related.map(card))));
    body.append(el('div', { class: 'detail-sticky-actions' }, button('Use template', 'plus', () => useTemplate(entry), 'primary')));
    const overlay = dialog(entry.collection, body, 'overlay', true);
    let disposed = false;
    onDialogDispose(() => { disposed = true; }, 'overlay');
    void songsSection(entry, catalog.collections.find(c => c.id === entry.collectionId)).then(section => { if (!disposed)
        songSlot.replaceChildren(section); }).catch(() => { if (!disposed)
        songSlot.replaceChildren(el('p', { class: 'hint', text: 'Song suggestions could not load. Close and reopen this preview to retry.' })); });
    let creditsLoaded = false;
    credits.addEventListener('toggle', async () => {
        if (!credits.open || creditsLoaded || disposed)
            return;
        creditsLoaded = true;
        try {
            const pack = await loadPack(entry), project = pack.projects[entry.id];
            if (disposed)
                return;
            const ids = new Set(project.nodes.filter(n => n.kind === 'photo' || n.kind === 'video').map(n => n.assetId));
            const media = pack.media.filter(m => ids.has(m.id));
            for (const asset of media) {
                const item = el('div', { class: 'credit-item' }, el('strong', { text: asset.name }), el('p', { text: [asset.creator, asset.license].filter(Boolean).join(' · ') }));
                const source = safeExternal(asset.source);
                if (source)
                    item.append(el('a', { href: source, target: '_blank', rel: 'noopener noreferrer', text: 'Source / reference' }));
                if (asset.modifications)
                    item.append(el('p', { class: 'hint', text: asset.modifications }));
                credits.append(item);
            }
            credits.append(el('p', { class: 'hint', text: 'Third-party artwork retains its own rights. Original application code is separately licensed. The private release ledger records source and rights-review notes; credits are never printed over your exported photos.' }));
        }
        catch {
            creditsLoaded = false;
            credits.append(el('p', { class: 'hint', text: 'Asset details could not load. Reopen this section to retry.' }));
        }
    });
}
async function drafts(main) {
    main.append(el('div', { class: 'discovery-top' }, el('h1', { text: 'Drafts' }), button('Import project', 'folder', importPicker, 'secondary')), el('p', { class: 'notice', text: 'Saved in this browser, not in the cloud. Keep a project backup before clearing browser data.' }));
    const filter = el('input', { class: 'input', type: 'search', 'aria-label': 'Search drafts', placeholder: 'Search drafts' }), grid = el('div', { class: 'studio-grid' });
    main.append(filter, grid);
    try {
        const saved = await projects();
        if (!main.isConnected)
            return;
        const render = () => {
            grid.replaceChildren();
            const matches = saved.filter(item => item.project.name.toLowerCase().includes(filter.value.toLowerCase()));
            if (!matches.length) {
                grid.append(empty(saved.length ? 'No matching drafts' : 'No drafts yet', saved.length ? 'Try another project name.' : 'Choose a template or start a new project.', 'folder'));
                return;
            }
            for (const item of matches) {
                const project = item.project, card = el('article', { class: 'studio-card' });
                const open = button('Open ' + project.name, undefined, () => openProject(clone(project)), 'plain', 'template-image');
                open.replaceChildren(item.thumbnail ? el('img', { src: item.thumbnail, alt: project.name, loading: 'lazy' }) : el('span', { text: project.name }));
                const copy = () => { const duplicate = clone(project); duplicate.id = uid(); duplicate.name = project.name.slice(0, 140) + ' copy'; duplicate.created = duplicate.updated = Date.now(); return openProject(duplicate); };
                card.append(open, el('h2', { text: project.name }), el('p', { class: 'muted', text: `${project.slides.length} slides · ${new Date(project.updated).toLocaleDateString()}${item.asTemplate ? ' · Reusable project' : ''}` }), el('div', { class: 'actions' }, button('Duplicate', 'copy', copy, 'secondary'), button('Delete ' + project.name, 'trash', () => confirmAction('Delete draft?', 'This removes the local draft. Download a project backup first to keep an editable copy.', 'Delete draft', async () => { await deleteProject(project.id); if (state.view === 'drafts')
                    await home(); }), 'ghost', 'icon-only')));
                grid.append(card);
            }
        };
        filter.addEventListener('input', render);
        render();
    }
    catch (error) {
        if (!main.isConnected)
            return;
        grid.replaceChildren(empty('Draft storage is unavailable', 'Editing and export still work. Download a project backup before closing.', 'warning'), button('New project', 'plus', newProject, 'primary'));
    }
}
function importPicker() {
    const input = document.getElementById('project-input');
    input.value = '';
    input.click();
}
function about() {
    const body = el('div', { class: 'help-content' }, el('h3', { text: 'An independent creative project' }), el('p', { text: 'Stillroll is an educational, open-source collage editor. It is not affiliated with SCRL or the artists and franchises featured in its fan templates. Your own photos stay on your device.' }), el('h3', { text: 'Photo-first editing' }), el('p', { text: 'Tap a photo frame to upload, take a photo, choose a project photo, or adjust its crop. Drag the canvas to look around. Turn on Layout mode to move the frames themselves.' }), el('h3', { text: 'Local drafts and portable backups' }), el('p', { text: 'Your photos are processed on this device. Drafts are browser storage, not a cloud backup. Saved means a storage transaction has completed. Download an editable .stillroll backup for anything you need to keep.' }), el('h3', { text: 'Camera and downloads' }), el('p', { text: 'Live camera needs HTTPS or localhost and your permission. The phone-camera picker is a browser hint, not a guarantee. Downloads and sharing vary by browser; Safari or Chrome generally offer more capabilities than an in-app browser.' }), el('h3', { text: 'Songs and source assets' }), el('p', { text: 'Song suggestions are metadata, not bundled recordings or soundtrack licenses. Availability varies by region. Thematic source images retain their own terms; template details and the separate review ledger identify them. No credits or interface controls are printed by the renderer.' }), el('h3', { text: 'Keyboard' }), el('p', { text: 'Ctrl or Command Z: undo. Shift Z: redo. Ctrl or Command S: project backup. H: Hand mode. In Layout mode, arrow keys move the selection. Enter edits selected text. Escape clears selection.' }), button('Open-source notices', 'info', async () => {
        const embedded = globalThis.__STILLROLL_LICENSES__;
        const text = typeof embedded === 'string' ? embedded : await fetch('./third-party-notices.txt').then(response => { if (!response.ok)
            throw new Error('The notices could not load. They also accompany the source release.'); return response.text(); });
        dialog('Open-source notices', el('textarea', { class: 'input license-notices', readonly: true, rows: 18, 'aria-label': 'Software and source-media notices', value: text }), 'overlay', true);
    }, 'secondary', 'full'));
    dialog('About Stillroll', body, 'overlay');
}
document.getElementById('project-input').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file)
        return;
    try {
        const { importProject } = await import('./export.js');
        await openProject(await importProject(file));
        toast('Project restored from your backup.', 'success');
    }
    catch (error) {
        toast(error.message, 'error');
    }
};
window.__STILLROLL__ = { version: '0.2.0', get catalog() { return catalog; }, get editor() { return editor; }, openProject, loadPack, instantiateEntry, home };
window.addEventListener('unhandledrejection', event => { if (event.reason?.name !== 'AbortError')
    toast(event.reason?.message || 'The operation was interrupted. Your project remains open.', 'error'); });
async function start() {
    try {
        catalog = await loadCatalog();
        catalogLoadError = '';
        index = new DiscoveryIndex(catalog.entries);
        await home();
    }
    catch (error) {
        catalogLoadError = error.message || 'Catalog unavailable';
        catalog = { version: 2, entries: [], collections: [] };
        index = new DiscoveryIndex([]);
        await home();
    }
}
void start();
