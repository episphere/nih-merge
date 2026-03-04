/**
 * Reusable popup & dropdown utilities.
 * Both append to document.body to avoid overflow clipping,
 * and use @floating-ui/dom for robust positioning.
 */

import { computePosition, flip, shift, offset } from '@floating-ui/dom';

export interface PopupOptions {
  title?: string;
}

export interface PopupHandle {
  el: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
}

export function createPopup(
  anchorEl: HTMLElement,
  contentEl: HTMLElement,
  options: PopupOptions = {},
): PopupHandle {
  const el = document.createElement('div');
  el.className = 'epi-popup';

  if (options.title) {
    const header = document.createElement('div');
    header.className = 'epi-popup__header';

    const titleEl = document.createElement('span');
    titleEl.className = 'epi-popup__title';
    titleEl.textContent = options.title;
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'epi-popup__close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);

    el.appendChild(header);
  }

  const body = document.createElement('div');
  body.className = 'epi-popup__body';
  body.appendChild(contentEl);
  el.appendChild(body);

  document.body.appendChild(el);

  async function position() {
    const { x, y } = await computePosition(anchorEl, el, {
      placement: 'bottom-start',
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    });
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function open() {
    el.classList.add('epi-popup--open');
    position();
    // Defer so the opening click doesn't immediately close
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', onClickOutside);
    });
  }

  function close() {
    el.classList.remove('epi-popup--open');
    document.removeEventListener('mousedown', onClickOutside);
  }

  function toggle() {
    if (el.classList.contains('epi-popup--open')) {
      close();
    } else {
      open();
    }
  }

  function onClickOutside(e: MouseEvent) {
    if (!el.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
      close();
    }
  }

  function destroy() {
    close();
    el.remove();
  }

  return { el, open, close, toggle, destroy };
}

// --- Dropdown ---

export interface DropdownItem {
  label: string;
  onClick(): void;
}

export type DropdownEntry = DropdownItem | 'separator';

export interface DropdownHandle {
  el: HTMLElement;
  destroy(): void;
}

export function createDropdown(
  anchorEl: HTMLElement,
  items: DropdownEntry[],
): DropdownHandle {
  const el = document.createElement('ul');
  el.className = 'epi-dropdown';

  for (const item of items) {
    if (item === 'separator') {
      const li = document.createElement('li');
      li.className = 'epi-dropdown__separator';
      li.setAttribute('role', 'separator');
      el.appendChild(li);
      continue;
    }
    const li = document.createElement('li');
    li.className = 'epi-dropdown__item';
    li.textContent = item.label;
    li.addEventListener('click', () => {
      item.onClick();
      close();
    });
    el.appendChild(li);
  }

  document.body.appendChild(el);

  async function position() {
    const { x, y } = await computePosition(anchorEl, el, {
      placement: 'bottom-end',
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    });
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function open() {
    el.classList.add('epi-dropdown--open');
    position();
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', onClickOutside);
    });
  }

  function close() {
    el.classList.remove('epi-dropdown--open');
    document.removeEventListener('mousedown', onClickOutside);
  }

  function toggle() {
    if (el.classList.contains('epi-dropdown--open')) {
      close();
    } else {
      open();
    }
  }

  function onClickOutside(e: MouseEvent) {
    if (!el.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
      close();
    }
  }

  anchorEl.addEventListener('click', toggle);

  function destroy() {
    close();
    anchorEl.removeEventListener('click', toggle);
    el.remove();
  }

  return { el, destroy };
}
