/**
 * Reusable full-screen overlay with centered panel.
 */

export interface OverlayOptions {
  title?: string;
  maxWidth?: string;
}

export interface OverlayHandle {
  el: HTMLElement;
  contentEl: HTMLElement;
  subtitleEl: HTMLElement;
  toolbarEl: HTMLElement;
  open(): void;
  close(): void;
  destroy(): void;
  /** Register a callback invoked on close (before DOM removal). */
  onClose(cb: () => void): void;
}

export function createOverlay(options: OverlayOptions = {}): OverlayHandle {
  const el = document.createElement('div');
  el.className = 'epi-overlay';

  const panel = document.createElement('div');
  panel.className = 'epi-overlay__panel';

  const header = document.createElement('div');
  header.className = 'epi-overlay__header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'epi-overlay__header-left';

  const titleEl = document.createElement('span');
  titleEl.className = 'epi-overlay__title';
  titleEl.textContent = options.title ?? '';
  headerLeft.appendChild(titleEl);

  const subtitleEl = document.createElement('span');
  subtitleEl.className = 'epi-overlay__subtitle';
  headerLeft.appendChild(subtitleEl);

  header.appendChild(headerLeft);

  const headerRight = document.createElement('div');
  headerRight.className = 'epi-overlay__header-right';

  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'epi-overlay__toolbar';
  headerRight.appendChild(toolbarEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'epi-overlay__close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', close);
  headerRight.appendChild(closeBtn);

  header.appendChild(headerRight);

  const contentEl = document.createElement('div');
  contentEl.className = 'epi-overlay__body';

  if (options.maxWidth) {
    panel.style.maxWidth = options.maxWidth;
  }

  panel.appendChild(header);
  panel.appendChild(contentEl);
  el.appendChild(panel);
  document.body.appendChild(el);

  // Close on backdrop click
  el.addEventListener('mousedown', (e) => {
    if (e.target === el) close();
  });

  const closeCallbacks: (() => void)[] = [];

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function open() {
    el.classList.add('epi-overlay--open');
    document.addEventListener('keydown', onKeyDown);
  }

  function close() {
    for (const cb of closeCallbacks) cb();
    el.classList.remove('epi-overlay--open');
    document.removeEventListener('keydown', onKeyDown);
  }

  function destroy() {
    close();
    el.remove();
  }

  function onCloseHandler(cb: () => void) {
    closeCallbacks.push(cb);
  }

  return { el, contentEl, subtitleEl, toolbarEl, open, close, destroy, onClose: onCloseHandler };
}
