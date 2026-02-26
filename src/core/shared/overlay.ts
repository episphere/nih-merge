/**
 * Reusable full-screen overlay with centered panel.
 */

export interface OverlayOptions {
  title?: string;
}

export interface OverlayHandle {
  el: HTMLElement;
  contentEl: HTMLElement;
  open(): void;
  close(): void;
  destroy(): void;
}

export function createOverlay(options: OverlayOptions = {}): OverlayHandle {
  const el = document.createElement('div');
  el.className = 'epi-overlay';

  const panel = document.createElement('div');
  panel.className = 'epi-overlay__panel';

  const header = document.createElement('div');
  header.className = 'epi-overlay__header';

  const titleEl = document.createElement('span');
  titleEl.className = 'epi-overlay__title';
  titleEl.textContent = options.title ?? '';
  header.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'epi-overlay__close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', close);
  header.appendChild(closeBtn);

  const contentEl = document.createElement('div');
  contentEl.className = 'epi-overlay__body';

  panel.appendChild(header);
  panel.appendChild(contentEl);
  el.appendChild(panel);
  document.body.appendChild(el);

  // Close on backdrop click
  el.addEventListener('mousedown', (e) => {
    if (e.target === el) close();
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function open() {
    el.classList.add('epi-overlay--open');
    document.addEventListener('keydown', onKeyDown);
  }

  function close() {
    el.classList.remove('epi-overlay--open');
    document.removeEventListener('keydown', onKeyDown);
  }

  function destroy() {
    close();
    el.remove();
  }

  return { el, contentEl, open, close, destroy };
}
