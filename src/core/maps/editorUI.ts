import { createOverlay, type OverlayHandle } from '../shared/overlay';

let active: OverlayHandle | null = null;
let nextFormId = 0;

export function openMapDialog(title: string): OverlayHandle {
  active?.close();
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = createOverlay({ title, maxWidth: '680px' });
  active = overlay;
  const panel = overlay.contentEl.parentElement!;
  panel.classList.add('map-editor');
  panel.style.height = 'auto';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  const trap = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    // Portaled combo-box options keep focus on their input inside this panel.
    const nodes = [...panel.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex="0"]')]
      .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled);
    if (!nodes.length) return;
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)!.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
  };
  panel.addEventListener('keydown', trap);
  overlay.onClose(() => {
    panel.removeEventListener('keydown', trap);
    overlay.el.remove();
    if (active === overlay) active = null;
    if (previousFocus?.isConnected) previousFocus.focus();
  });
  overlay.open();
  requestAnimationFrame(() => panel.querySelector<HTMLElement>('button, select, input')?.focus());
  return overlay;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function selectControl(label: string, options: readonly (readonly [string, string])[], value: string) {
  const group = element('div', 'usa-form-group');
  const select = element('select', 'usa-select');
  select.id = `map-form-${++nextFormId}`;
  const labelEl = element('label', 'usa-label', label);
  labelEl.htmlFor = select.id;
  options.forEach(([key, text]) => select.add(new Option(text, key)));
  select.value = value;
  group.append(labelEl, select);
  return { group, select };
}

export function button(text: string, onClick: () => void, secondary = false) {
  const btn = element('button', secondary ? 'usa-button usa-button--outline' : 'usa-button', text);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

export function actions(cancel: () => void, apply: () => void, label = 'Apply') {
  const row = element('div', 'map-editor__actions');
  row.append(button('Cancel', cancel, true), button(label, apply));
  return row;
}
