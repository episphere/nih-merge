/**
 * Shared data table renderer — builds a sortable HTML table
 * with optional frozen (sticky) columns.
 */

export interface TableColumn {
  field: string;
  title: string;
  frozen?: boolean;
}

export function renderDataTable(
  container: HTMLElement,
  data: Record<string, unknown>[],
  columns: TableColumn[],
): void {
  container.innerHTML = '';

  if (data.length === 0) {
    container.innerHTML = '<p class="padding-3">No data available.</p>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'epi-data-table';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  let sortField: string | null = null;
  let sortAsc = true;

  // Identify frozen column indices and last frozen index
  const frozenIndices: number[] = [];
  let lastFrozenIdx = -1;
  for (let i = 0; i < columns.length; i++) {
    if (columns[i].frozen) {
      frozenIndices.push(i);
      lastFrozenIdx = i;
    }
  }

  const ths: HTMLTableCellElement[] = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const th = document.createElement('th');
    th.textContent = col.title;
    th.dataset.field = col.field;
    if (col.frozen) {
      th.classList.add('frozen');
      if (i === lastFrozenIdx) th.classList.add('frozen-last');
    }
    th.addEventListener('click', () => {
      if (sortField === col.field) {
        sortAsc = !sortAsc;
      } else {
        sortField = col.field;
        sortAsc = true;
      }
      sortAndRender();
      updateSortIndicators();
    });
    headerRow.appendChild(th);
    ths.push(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);

  let sortedData = [...data];

  function sortAndRender() {
    if (sortField) {
      const field = sortField;
      sortedData.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortAsc ? aVal - bVal : bVal - aVal;
        }
        const aStr = aVal == null ? '' : String(aVal);
        const bStr = bVal == null ? '' : String(bVal);
        const cmp = aStr.localeCompare(bStr);
        return sortAsc ? cmp : -cmp;
      });
    }
    renderBody();
  }

  // Store all frozen td elements per column index for offset updates
  let frozenCells: HTMLTableCellElement[][] = frozenIndices.map(() => []);

  function renderBody() {
    tbody.innerHTML = '';
    frozenCells = frozenIndices.map(() => []);

    for (const row of sortedData) {
      const tr = document.createElement('tr');
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const td = document.createElement('td');
        const val = row[col.field];
        if (typeof val === 'number') {
          td.textContent = Number.isInteger(val) ? String(val) : val.toFixed(2);
          td.classList.add('numeric');
        } else {
          td.textContent = val == null ? '' : String(val);
        }
        if (col.frozen) {
          td.classList.add('frozen');
          if (i === lastFrozenIdx) td.classList.add('frozen-last');
          const fi = frozenIndices.indexOf(i);
          frozenCells[fi].push(td);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    // Compute frozen offsets after layout
    requestAnimationFrame(applyFrozenOffsets);
  }

  function applyFrozenOffsets() {
    let left = 0;
    for (let fi = 0; fi < frozenIndices.length; fi++) {
      const colIdx = frozenIndices[fi];
      const th = ths[colIdx];
      const leftPx = `${left}px`;

      th.style.left = leftPx;
      for (const td of frozenCells[fi]) {
        td.style.left = leftPx;
      }

      // Advance by actual rendered width of this header
      left += th.getBoundingClientRect().width;
    }
  }

  function updateSortIndicators() {
    for (const th of ths) {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.field === sortField) {
        th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
      }
    }
  }

  // Initial render
  renderBody();
}
