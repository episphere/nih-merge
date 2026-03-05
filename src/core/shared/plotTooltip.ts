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

export interface PlotTooltipHandle {
  /** Attach tooltip hover to marks rendered in `container`. */
  bind(
    container: HTMLElement,
    markSelector: string,
    data: Record<string, unknown>[],
    fields: PlotTooltipField[],
  ): void;
  destroy(): void;
}

export function createPlotTooltip(): PlotTooltipHandle {
  const tooltip: TooltipHandle = createTooltip();

  const table = document.createElement('table');
  table.className = 'epi-tooltip__table';
  tooltip.contentEl.appendChild(table);

  function bind(
    container: HTMLElement,
    markSelector: string,
    data: Record<string, unknown>[],
    fields: PlotTooltipField[],
  ) {
    const elements = container.querySelectorAll<SVGElement>(markSelector);

    for (const el of elements) {
      const idx = (el as unknown as { __data__?: number }).__data__;
      if (typeof idx !== 'number' || idx < 0 || idx >= data.length) continue;

      el.addEventListener('mousemove', (e: MouseEvent) => {
        const row = data[idx];
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
        tooltip.show(e.clientX, e.clientY);
      });

      el.addEventListener('mouseleave', () => {
        tooltip.hide();
      });
    }
  }

  function destroy() {
    tooltip.destroy();
  }

  return { bind, destroy };
}
