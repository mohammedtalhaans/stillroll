import { localJSON } from './catalog.js';
import { el, button, icon, toast, dialog } from './ui.js';
export function safeExternal(url) {
    if (!url)
        return;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' ? parsed.href : undefined;
    }
    catch {
        return;
    }
}
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast('Copied.', 'success');
    }
    catch {
        const area = el('textarea', { class: 'input', readonly: true, rows: 3, value: text, 'aria-label': 'Text to copy' });
        dialog('Copy text', el('div', {}, area, el('p', { class: 'hint', text: 'Copy the selected text using your browser’s Copy command.' })));
        area.focus();
        area.select();
    }
}
export async function songsSection(entry, collection) {
    const section = el('section', { class: 'detail-section', 'aria-label': 'Song suggestions' }, el('h3', { text: 'Songs' }));
    if (!collection)
        return section;
    const pack = await localJSON(collection.songs);
    const ranked = entry.songs.map(id => pack.songs.find(song => song.id === id)).filter((s) => !!s);
    const selected = [...ranked, ...pack.songs.filter(s => !ranked.some(r => r.id === s.id))];
    const list = el('div', { class: 'song-list' });
    let expanded = false;
    const render = () => {
        list.replaceChildren();
        selected.slice(0, expanded ? selected.length : 3).forEach((song, index) => {
            const relationship = { artist: 'Artist track', soundtrack: 'Official soundtrack', editorial: 'Editorial pairing' }[song.relationship];
            const tags = [relationship, song.mood, `${song.energy} energy`, song.instrumental ? 'Instrumental' : '', song.explicit === true ? 'Explicit' : ''].filter(Boolean).join(' · ');
            const actions = el('div', { class: 'song-actions' }, button('Copy ' + song.title + ' — ' + song.artist, 'copy', () => copyText(song.title + ' — ' + song.artist), 'ghost', 'icon-only'));
            const url = safeExternal(song.url);
            if (url)
                actions.append(el('a', { class: 'btn btn-ghost icon-only', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open ' + song.title + ' on music service', title: 'Open track' }, icon('external'), el('span', { class: 'btn-label', text: 'Open track' })));
            list.append(el('article', { class: 'song-card' }, el('span', { class: 'song-number', text: String(index + 1).padStart(2, '0') }), el('div', { class: 'song-copy' }, el('h4', { text: song.title }), el('p', { text: song.artist }), el('p', { text: song.reason }), el('div', { class: 'song-tags', text: tags })), actions));
        });
        more.querySelector('.btn-label').textContent = expanded ? 'Show three picks' : `All ${selected.length} suggestions`;
        more.setAttribute('aria-label', expanded ? 'Show three song picks' : 'Show all song suggestions');
        more.setAttribute('aria-expanded', String(expanded));
    };
    const more = button('Show all song suggestions', 'down', () => { expanded = !expanded; render(); }, 'ghost', 'full');
    section.append(list);
    if (selected.length > 3)
        section.append(more);
    section.append(el('p', { class: 'hint', text: 'Suggestions only, not bundled audio or a music license. Choose music in your social app; availability varies by region. Explicit labels reflect the verified version where known.' }));
    render();
    return section;
}
