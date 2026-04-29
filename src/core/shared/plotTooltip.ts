/**
 * Tooltip for Observable Plot marks (bars, dots, etc.).
 * Shows a key-value table of the hovered data point's properties.
 *
 * Observable Plot 0.6 binds array indices to each mark element's __data__,
 * so we need the original data array to look up the row.
 */

import { createTooltip, type TooltipHandle } from './tooltip';

export interface PlotTooltipField {
  label: string;
  value: (row: Record<string, unknown>) => string;
}

export interface PlotTooltipOptions {
  /** When set, tooltip activates within this radius (px) of the nearest mark center. */
  proximity?: number;
}

export interface PlotTooltipHandle {
  /** Attach tooltip hover to marks rendered in `container`. */
  bind(
    container: HTMLElement,
    markSelector: string,
    data: Record<string, unknown>[],
    fields: PlotTooltipField[],
    options?: PlotTooltipOptions,
  ): void;
  destroy(): void;
}

export function createPlotTooltip(): PlotTooltipHandle {
  const tooltip: TooltipHandle = createTooltip();

  const table = document.createElement('table');
  table.className = 'epi-tooltip__table';
  tooltip.contentEl.appendChild(table);

  // Track listeners so we can clean up on re-bind
  let cleanupListeners: (() => void) | null = null;

  function showRow(row: Record<string, unknown>, fields: PlotTooltipField[], x: number, y: number) {
    table.innerHTML = '';
    for (const field of fields) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.className = 'epi-tooltip__table-label';
      th.textContent = field.label;
      const td = document.createElement('td');
      td.className = 'epi-tooltip__table-value';
      td.textContent = field.value(row);
      tr.append(th, td);
      table.appendChild(tr);
    }
    tooltip.show(x, y);
  }

  function bind(
    container: HTMLElement,
    markSelector: string,
    data: Record<string, unknown>[],
    fields: PlotTooltipField[],
    options?: PlotTooltipOptions,
  ) {
    // Clean up previous listeners
    if (cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }

    const elements = container.querySelectorAll<SVGElement>(markSelector);

    if (options?.proximity != null) {
      bindProximity(container, elements, data, fields, options.proximity);
    } else {
      bindDirect(elements, data, fields);
    }
  }

  function bindDirect(
    elements: NodeListOf<SVGElement>,
    data: Record<string, unknown>[],
    fields: PlotTooltipField[],
  ) {
    const abortController = new AbortController();
    const { signal } = abortController;

    for (const el of elements) {
      const idx = (el as unknown as { __data__?: number }).__data__;
      if (typeof idx !== 'number' || idx < 0 || idx >= data.length) continue;

      el.addEventListener('mousemove', (e: MouseEvent) => {
        showRow(data[idx], fields, e.clientX, e.clientY);
      }, { signal });

      el.addEventListener('mouseleave', () => {
        tooltip.hide();
      }, { signal });
    }

    cleanupListeners = () => abortController.abort();
  }

  const ACTIVE_CLASS = 'epi-dot--active';

  function bindProximity(
    container: HTMLElement,
    elements: NodeListOf<SVGElement>,
    data: Record<string, unknown>[],
    fields: PlotTooltipField[],
    proximity: number,
  ) {
    // Cache element centers, data indices, and DOM references
    interface DotInfo { cx: number; cy: number; idx: number; el: SVGElement }
    const dots: DotInfo[] = [];

    for (const el of elements) {
      const idx = (el as unknown as { __data__?: number }).__data__;
      if (typeof idx !== 'number' || idx < 0 || idx >= data.length) continue;

      let cx: number, cy: number;
      if (el instanceof SVGCircleElement) {
        cx = el.cx.baseVal.value;
        cy = el.cy.baseVal.value;
      } else {
        const bbox = (el as unknown as SVGGraphicsElement).getBBox();
        cx = bbox.x + bbox.width / 2;
        cy = bbox.y + bbox.height / 2;
      }
      dots.push({ cx, cy, idx, el });
    }

    // Find the SVG element for coordinate conversion
    const svg = container.querySelector('svg');
    if (!svg) return;

    const abortController = new AbortController();
    const { signal } = abortController;

    const proximitySquared = proximity * proximity;
    let activeDot: DotInfo | null = null;

    function deactivate() {
      if (activeDot) {
        activeDot.el.classList.remove(ACTIVE_CLASS);
        activeDot = null;
      }
    }

    svg.addEventListener('mousemove', (e: MouseEvent) => {
      // Convert client coordinates to SVG coordinates
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgX = (e.clientX - ctm.e) / ctm.a;
      const svgY = (e.clientY - ctm.f) / ctm.d;

      // Find nearest dot
      let bestDist = Infinity;
      let bestDot: DotInfo | null = null;
      for (const dot of dots) {
        const dx = dot.cx - svgX;
        const dy = dot.cy - svgY;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestDot = dot;
        }
      }

      if (bestDot && bestDist <= proximitySquared) {
        if (activeDot !== bestDot) {
          deactivate();
          activeDot = bestDot;
          activeDot.el.classList.add(ACTIVE_CLASS);
        }
        showRow(data[bestDot.idx], fields, e.clientX, e.clientY);
      } else {
        deactivate();
        tooltip.hide();
      }
    }, { signal });

    svg.addEventListener('mouseleave', () => {
      deactivate();
      tooltip.hide();
    }, { signal });

    cleanupListeners = () => {
      deactivate();
      abortController.abort();
    };
  }

  function destroy() {
    if (cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }
    tooltip.destroy();
  }

  return { bind, destroy };
}
