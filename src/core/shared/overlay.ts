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
  /** Resize panel width to fit the content (capped at 98vw). */
  sizeToFit(): void;
  /** Register a callback invoked on close (before DOM removal). */
  onClose(cb: () => void): void;
  /** Hide contentEl and show a loading spinner in the panel. */
  showLoading(): void;
  /** Remove the loading spinner and reveal contentEl. */
  hideLoading(): void;
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

  function sizeToFit() {
    // Sum column header widths — the actual content columns
    const colHeaders = contentEl.querySelectorAll('.dt-col-header');
    if (colHeaders.length === 0) return;

    let columnsWidth = 0;
    for (const col of colHeaders) {
      columnsWidth += (col as HTMLElement).offsetWidth;
    }

    // Add-column "+" button (28px) + scrollbar gutter (var(--dt-scrollbar-width), default 17px)
    const addColBtn = contentEl.querySelector('.dt-add-column-btn');
    const addColWidth = addColBtn ? (addColBtn as HTMLElement).offsetWidth : 0;
    const gutter = contentEl.querySelector('.dt-scrollbar-gutter');
    const gutterWidth = gutter ? (gutter as HTMLElement).offsetWidth : 0;

    // dt-root border
    const dtRoot = contentEl.querySelector('.dt-root');
    const dtBorder = dtRoot ? parseFloat(getComputedStyle(dtRoot).borderLeftWidth) * 2 : 0;

    const tableWidth = columnsWidth + addColWidth + gutterWidth + dtBorder;

    // Overlay body padding + panel border
    const bodyStyle = getComputedStyle(contentEl);
    const bodyPadding = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
    const panelBorder = parseFloat(getComputedStyle(panel).borderLeftWidth) * 2;
    const needed = Math.ceil(tableWidth + bodyPadding + panelBorder);

    const maxPx = window.innerWidth * 0.98;
    panel.style.width = Math.min(needed, maxPx) + 'px';
    panel.style.maxWidth = '98vw';
  }

  function onCloseHandler(cb: () => void) {
    closeCallbacks.push(cb);
  }

  let spinnerEl: HTMLElement | null = null;

  function showLoading() {
    contentEl.style.display = 'none';
    if (!spinnerEl) {
      spinnerEl = document.createElement('div');
      spinnerEl.className = 'epi-overlay__spinner';
      const msg = document.createElement('span');
      msg.className = 'epi-overlay__spinner-msg';
      msg.textContent = 'Loading tabular view';
      spinnerEl.appendChild(msg);
    }
    panel.appendChild(spinnerEl);
  }

  function hideLoading() {
    if (spinnerEl && spinnerEl.parentNode) {
      spinnerEl.remove();
    }
    contentEl.style.display = '';
  }

  return { el, contentEl, subtitleEl, toolbarEl, open, close, destroy, sizeToFit, onClose: onCloseHandler, showLoading, hideLoading };
}
