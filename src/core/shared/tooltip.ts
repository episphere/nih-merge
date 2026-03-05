/**
 * Reusable tooltip utility.
 * Appended to document.body to avoid overflow clipping.
 * Uses a virtual reference element for mouse-following positioning.
 */

import { computePosition, flip, shift, offset } from '@floating-ui/dom';

export interface TooltipHandle {
  el: HTMLElement;
  contentEl: HTMLElement;
  show(clientX: number, clientY: number): void;
  hide(): void;
  destroy(): void;
}

export function createTooltip(): TooltipHandle {
  const el = document.createElement('div');
  el.className = 'epi-tooltip';

  const contentEl = document.createElement('div');
  contentEl.className = 'epi-tooltip__content';
  el.appendChild(contentEl);

  document.body.appendChild(el);

  function show(clientX: number, clientY: number) {
    el.classList.add('epi-tooltip--visible');

    // Virtual reference element following the cursor
    const virtualRef = {
      getBoundingClientRect() {
        return {
          x: clientX,
          y: clientY,
          width: 0,
          height: 0,
          top: clientY,
          left: clientX,
          right: clientX,
          bottom: clientY,
        };
      },
    };

    computePosition(virtualRef, el, {
      placement: 'right-start',
      middleware: [offset(12), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
  }

  function hide() {
    el.classList.remove('epi-tooltip--visible');
  }

  function destroy() {
    hide();
    el.remove();
  }

  return { el, contentEl, show, hide, destroy };
}
