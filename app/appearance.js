import { el, toast } from './ui.js';
const preference = matchMedia('(prefers-color-scheme: dark)');
let choice = 'system';
try {
    const stored = localStorage.getItem('stillroll:appearance');
    if (stored === 'light' || stored === 'dark')
        choice = stored;
}
catch { }
function apply() {
    const theme = choice === 'system' ? preference.matches ? 'dark' : 'light' : choice;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141816' : '#f6f7f3');
    for (const control of document.querySelectorAll('.theme-switch'))
        updateSwitch(control, theme);
}
function updateSwitch(control, theme) {
    const dark = theme === 'dark';
    control.setAttribute('aria-checked', String(dark));
    control.setAttribute('aria-label', 'Dark mode');
    control.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}
export function getAppearance() { return choice; }
export function setAppearance(value) {
    choice = value;
    apply();
    try {
        localStorage.setItem('stillroll:appearance', value);
    }
    catch {
        toast('Appearance changed for this session. This browser could not retain the preference.');
    }
}
export function appearanceButton() {
    const control = el('button', { type: 'button', class: 'theme-switch', role: 'switch', onclick: () => {
            const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
            setAppearance(current === 'dark' ? 'light' : 'dark');
        } }, el('span', { class: 'theme-switch-icon', 'aria-hidden': 'true', text: '☀' }), el('span', { class: 'theme-switch-track', 'aria-hidden': 'true' }, el('span', { class: 'theme-switch-thumb' })), el('span', { class: 'theme-switch-icon moon', 'aria-hidden': 'true', text: '☾' }));
    updateSwitch(control, document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    return control;
}
export function initAppearance() { apply(); }
preference.addEventListener('change', () => { if (choice === 'system')
    apply(); });
window.addEventListener('storage', event => { if (event.key !== 'stillroll:appearance')
    return; choice = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system'; apply(); });
apply();
