/** Native-DOM adaptation of shadcn button variants and accessible glass primitives.
 * Native dialog/range/select are deliberate dependency-availability/accessibility exceptions.
 * See docs/REUSE.md and THIRD_PARTY_NOTICES.md. */
import { ICONS } from './vendor/icons.js';
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false)
            continue;
        if (key === 'class')
            node.className = String(value);
        else if (key === 'text')
            node.textContent = String(value);
        else if (key.startsWith('on') && typeof value === 'function')
            node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'value' && 'value' in node)
            node.value = String(value);
        else if (key === 'checked' && 'checked' in node)
            node.checked = !!value;
        else
            node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const c of children) {
        if (c !== undefined && c !== null && c !== false)
            node.append(c);
    }
    return node;
}
export function icon(name, size = 18) { const aliases = { upload: 'export', camera: 'photo', replace: 'reset', left: 'back', right: 'next', music: 'play', settings: 'looks', star: 'heart' }; const data = ICONS[name] || ICONS[aliases[name]] || ICONS.info; const span = el('span', { class: 'icon', 'aria-hidden': 'true' }); span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${data[0]} ${data[1]}" fill="currentColor" focusable="false"><path d="${data[2]}"></path></svg>`; return span; }
export function button(label, name, action, variant = 'ghost', className = '') {
    return el('button', { type: 'button', class: `btn btn-${variant} ${className}`, 'aria-label': label, title: label, onclick: (event) => {
            try {
                const result = action();
                if (result instanceof Promise) {
                    const target = event.currentTarget;
                    target.disabled = true;
                    target.setAttribute('aria-busy', 'true');
                    result.catch(e => { if (e.name !== 'AbortError')
                        toast(e.message, 'error'); }).finally(() => { target.disabled = false; target.removeAttribute('aria-busy'); });
                }
            }
            catch (e) {
                toast(e.message, 'error');
            }
        } }, name ? icon(name) : null, el('span', { class: 'btn-label', text: label }));
}
export function toast(message, type = 'info') {
    let root = document.getElementById('toast-root');
    if (!root) {
        root = el('div', { id: 'toast-root', role: 'status', 'aria-live': 'polite' });
        document.body.append(root);
    }
    const n = el('div', { class: 'toast ' + type }, icon(type === 'error' ? 'warning' : type === 'success' ? 'check' : 'info'), el('span', { text: message }));
    root.append(n);
    setTimeout(() => n.remove(), 6500);
}
const dialogFocus = new Map();
const dialogCleanup = new Map();
function cleanDialog(kind) { const clean = dialogCleanup.get(kind); dialogCleanup.delete(kind); clean?.forEach(fn => { try {
    fn();
}
catch { } }); }
export function onDialogDispose(clean, kind = 'sheet') { dialogCleanup.set(kind, [...(dialogCleanup.get(kind) || []), clean]); }
export function closeDialog(kind = 'sheet') {
    const d = document.getElementById(kind);
    cleanDialog(kind);
    d.close();
    dialogFocus.get(kind)?.focus({ preventScroll: true });
}
export function dialog(title, content, kind = 'sheet', wide = false) {
    const d = document.getElementById(kind);
    cleanDialog(kind);
    if (!d.open)
        dialogFocus.set(kind, document.activeElement);
    d.className = `dialog ${wide ? 'dialog-wide' : ''}`;
    d.replaceChildren(el('div', { class: 'dialog-header' }, el('h2', { id: kind + '-title', text: title }), button('Close', 'close', () => closeDialog(kind), 'ghost', 'icon-only')), el('div', { class: 'dialog-body' }, content));
    d.oncancel = () => { cleanDialog(kind); dialogFocus.get(kind)?.focus({ preventScroll: true }); };
    d.onclose = () => { if (!d.open)
        cleanDialog(kind); };
    if (!d.open)
        d.showModal();
    return d;
}
export function field(label, input, hint) {
    if (!input.hasAttribute('aria-label'))
        input.setAttribute('aria-label', label);
    return el('label', { class: 'field' }, el('span', { class: 'field-label', text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
}
export function select(value, options, change) {
    const n = el('select', { class: 'input', onchange: (e) => change(e.target.value) });
    for (const o of options) {
        const [v, l] = typeof o === 'string' ? [o, o] : o;
        n.append(el('option', { value: v, text: l }));
    }
    n.value = value;
    return n;
}
export function range(label, value, min, max, step, onInput, onCommit, suffix = '') { const output = el('output', { text: value + suffix }), input = el('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: (e) => { const v = Number(e.target.value); output.textContent = v + suffix; onInput(v); }, onchange: () => onCommit?.() }); return el('label', { class: 'range-field' }, el('span', { class: 'range-label' }, el('span', { text: label }), output), input); }
export function numberField(label, value, min, max, change, step = 1) {
    return field(label, el('input', { class: 'input', type: 'number', value: Math.round(value * 100) / 100, min, max, step, onchange: (e) => {
            const input = e.target;
            const n = Number(input.value);
            if (Number.isFinite(n))
                change(Math.min(max, Math.max(min, n)));
            else
                input.value = String(value);
        } }));
}
export function colorField(label, value, change) { return field(label, el('input', { class: 'color-input', type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff', 'aria-label': label, onchange: (e) => change(e.target.value) })); }
export function empty(title, copy, name = 'photo') { return el('div', { class: 'empty-state' }, icon(name, 28), el('h3', { text: title }), el('p', { text: copy })); }
export function sourceURL(src) { return globalThis.__STILLROLL_ASSETS__?.[src] || src; }
export const tick = () => new Promise(r => requestAnimationFrame(() => r()));
export function confirmAction(title, copy, label, action) { const body = el('div', {}, el('p', { class: 'muted', text: copy }), el('div', { class: 'actions' }, button('Keep it', undefined, () => closeDialog(), 'secondary'), button(label, 'trash', () => { closeDialog(); return action(); }, 'danger'))); dialog(title, body); }
