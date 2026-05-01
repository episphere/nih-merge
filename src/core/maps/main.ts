import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { onResize } from '../shared/resizeObserver';
import { MAPS_DEFAULTS, resolveMaps, type MapsState } from './state';
import { initControls, openCardEditor } from './controls';
import { fipsName } from '../shared/fips';
import type { CardState, MapsMeasure } from './state';
import { initTopControls } from './topControls';
import { fetchAllCardData, computeColorConfig, loadGeoJSON, type ColorConfig } from './query';
import { renderMapCard } from './mapPlot';
import { renderColorLegend } from './colorLegend';
import { Gridette } from './grid';
import { initMapTooltip, type MapTooltipHandle } from './mapTooltip';
import { parquetUrl, countyFile } from '../../data/dataManager';
import type { TableInfo, TableFilterSpec } from '../shared/tableFilters';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(MAPS_DEFAULTS, resolveMaps);

// 3. Controls
initControls($state, update);

// Collect all card data for table/download export
let allCardData: Record<string, unknown>[] = [];
function getData(): Record<string, unknown>[] {
  return allCardData;
}

function getTableInfo(): TableInfo {
  const state = $state.get();
  const activeCards = state.cards.filter((c) => !c.blank && c.state);
  const firstCard = activeCards[0];
  const year = firstCard?.state?.year ?? '2022';
  const url = parquetUrl(countyFile(year));

  // Build union filters across all active cards
  const fieldKeys = ['cause', 'sex', 'race', 'stateFips'] as const;
  const filters: TableFilterSpec[] = [];

  for (const key of fieldKeys) {
    const values = [...new Set(activeCards.map((c) => c.state![key]))];
    if (values.length === 1) {
      filters.push({ column: key, value: values[0] });
    } else if (values.length > 1) {
      filters.push({ column: key, value: values });
    }
  }

  // stateFips="All" means "all states" — convert to '*' so the table
  // doesn't filter on the literal string "All" (which no county row has).
  for (const f of filters) {
    if (f.column === 'stateFips' && f.value === 'All') {
      f.value = '*';
    }
  }

  // Exclude aggregate county rows
  filters.push({ column: 'countyFips', value: '*' });

  return { url, filters };
}

initTopControls($state, update, getData, getTableInfo);

// 4. Color legend + in-grid add/remove buttons
const dashboardEl = document.getElementById('dashboard')!;
const mapGridEl = document.getElementById('map-grid')!;
const topbarEl = document.getElementById('dashboard-topbar')!;

// Color legend container — inserted at the start of the topbar (left)
const legendEl = document.createElement('div');
legendEl.id = 'color-legend';
topbarEl.insertBefore(legendEl, topbarEl.firstChild);

// Wrap map-grid and add/remove buttons in a CSS grid layout
const gridWrapper = document.createElement('div');
gridWrapper.className = 'maps-dashboard-grid';

// Move map-grid into the wrapper
dashboardEl.appendChild(gridWrapper);
gridWrapper.appendChild(mapGridEl);

// Column add/remove buttons
const colBtnGroup = document.createElement('div');
colBtnGroup.className = 'grid-add grid-add--col';

const addColBtn = document.createElement('button');
addColBtn.className = 'grid-add__btn';
addColBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
addColBtn.title = 'Add column';
addColBtn.addEventListener('click', () => {
  const s = $state.get();
  update({ nCols: s.nCols + 1 });
});
colBtnGroup.appendChild(addColBtn);

const removeColBtn = document.createElement('button');
removeColBtn.className = 'grid-add__btn';
removeColBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
removeColBtn.title = 'Remove column';
removeColBtn.addEventListener('click', () => {
  const s = $state.get();
  if (s.nCols > 1) update({ nCols: s.nCols - 1 });
});
colBtnGroup.appendChild(removeColBtn);
gridWrapper.appendChild(colBtnGroup);

// Row add/remove buttons
const rowBtnGroup = document.createElement('div');
rowBtnGroup.className = 'grid-add grid-add--row';

const addRowBtn = document.createElement('button');
addRowBtn.className = 'grid-add__btn';
addRowBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
addRowBtn.title = 'Add row';
addRowBtn.addEventListener('click', () => {
  const s = $state.get();
  update({ nRows: s.nRows + 1 });
});
rowBtnGroup.appendChild(addRowBtn);

const removeRowBtn = document.createElement('button');
removeRowBtn.className = 'grid-add__btn';
removeRowBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
removeRowBtn.title = 'Remove row';
removeRowBtn.addEventListener('click', () => {
  const s = $state.get();
  if (s.nRows > 1) update({ nRows: s.nRows - 1 });
});
rowBtnGroup.appendChild(removeRowBtn);
gridWrapper.appendChild(rowBtnGroup);

// Subscribe to hide remove buttons when at minimum
$state.subscribe((s) => {
  removeColBtn.style.display = s.nCols <= 1 ? 'none' : '';
  removeRowBtn.style.display = s.nRows <= 1 ? 'none' : '';
});

// 5. Tooltip
const mapTooltipHandle: MapTooltipHandle = initMapTooltip((cardIndex, featureId) => {
  const state = $state.get();
  const card = state.cards[cardIndex];
  if (!card || card.blank || !card.state) return null;
  const data = cardDataMap.get(cardIndex);
  if (!data) return null;
  const indexField = card.state.spatialLevel === 'county' ? 'countyFips' : 'stateFips';
  const row = data.find((r) => r[indexField] === featureId);
  return { row, spatialLevel: card.state.spatialLevel, measure: state.measure };
});

// 6. Render loop with query-key separation
let cardDataMap = new Map<number, Record<string, unknown>[]>();
let colorConfig: ColorConfig | null = null;
let renderVersion = 0;
let prevQuerySnapshot = '';
let gridette: Gridette | null = null;
let prevGridKey = '';

function querySnapshot(state: MapsState): string {
  const cardsKey = state.cards
    .map((c) =>
      c.blank || !c.state
        ? `${c.x},${c.y},-`
        : `${c.x},${c.y},${c.state.year},${c.state.cause},${c.state.sex},${c.state.race},${c.state.stateFips},${c.state.spatialLevel}`,
    )
    .join('|');
  return `${cardsKey}\0${state.measure}`;
}

/** Key that only changes when grid dimensions change (not card content). */
function gridKey(state: MapsState): string {
  return `${state.nRows}x${state.nCols}`;
}

$state.subscribe(async (state) => {
  const snap = querySnapshot(state);
  const needsFetch = snap !== prevQuerySnapshot;

  if (needsFetch) {
    prevQuerySnapshot = snap;
    const version = ++renderVersion;
    const data = await fetchAllCardData(state.cards, state.measure);
    if (version !== renderVersion) return; // stale
    cardDataMap = data;

    // Flatten all card data for table/download
    allCardData = [];
    for (const rows of cardDataMap.values()) {
      allCardData.push(...rows);
    }
  }

  colorConfig = computeColorConfig(cardDataMap, state);
  renderColorLegend(legendEl, colorConfig, state);
  updateTitles(state);

  // Update tooltip histogram with all values from all cards
  if (colorConfig && colorConfig.valid) {
    const allValues: number[] = [];
    for (const rows of cardDataMap.values()) {
      for (const row of rows) {
        const v = row[state.measure];
        if (typeof v === 'number' && !Number.isNaN(v)) allValues.push(v);
      }
    }
    mapTooltipHandle.updateHistogram(allValues, colorConfig);
  }

  render();
});

async function render(): Promise<void> {
  const state = $state.get();

  const geoData = await loadGeoJSON();
  const gk = gridKey(state);

  // Only recreate Gridette when grid dimensions change
  if (!gridette || gk !== prevGridKey) {
    prevGridKey = gk;
    gridette = new Gridette(mapGridEl, {
      nRows: state.nRows,
      nCols: state.nCols,
      swappable: true,
      handle: '.map-card__drag-handle',
    });

    // Handle card swaps — update state to reflect the new positions.
    // Gridette already handles the DOM swap internally; we just need to
    // sync our state to match.
    gridette.on('swap', (cellA, cellB) => {
      const s = $state.get();
      // After Gridette fires swap, cellA and cellB have ALREADY been swapped.
      // cellA.x/y is now where cellA ended up, cellB.x/y is where cellB ended up.
      // We need to swap the card data at those positions.
      const newCards = s.cards.map((c) => ({ ...c, state: c.state ? { ...c.state } : null }));

      // Find cards by their OLD positions (before Gridette swapped them).
      // After swap: cellA is now at cellA.x,cellA.y but used to be at cellB.x,cellB.y
      // So we look up by the OTHER cell's position.
      const idxA = newCards.findIndex((c) => c.x === cellA.x && c.y === cellA.y);
      const idxB = newCards.findIndex((c) => c.x === cellB.x && c.y === cellB.y);

      if (idxA >= 0 && idxB >= 0) {
        // Swap the card state (blank, state) but keep positions matching
        const tempBlank = newCards[idxA].blank;
        const tempState = newCards[idxA].state;
        newCards[idxA].blank = newCards[idxB].blank;
        newCards[idxA].state = newCards[idxB].state;
        newCards[idxB].blank = tempBlank;
        newCards[idxB].state = tempState;

        // Update state without triggering a full grid rebuild
        prevQuerySnapshot = ''; // force data re-association
        update({ cards: newCards });
      }
    });

    // Populate all cells
    for (const card of state.cards) {
      const cardIdx = state.cards.indexOf(card);
      const cardEl = createCardElement(card.blank, cardIdx);
      gridette.setCell(cardEl, card.x, card.y);
    }
  } else {
    // Grid dimensions unchanged — update cell contents in place.
    // We need to re-populate cells because card state may have changed
    // (e.g., after edit, delete, or swap).
    for (const card of state.cards) {
      const cardIdx = state.cards.indexOf(card);
      const cell = gridette.getCell(card.x, card.y);
      if (cell) {
        const cardEl = createCardElement(card.blank, cardIdx);
        cell.element.replaceChildren(cardEl);
        // Re-enable swapping for the new content
        if (gridette.swappable && !card.blank) {
          gridette.setCell(cardEl, card.x, card.y);
        }
      }
    }
  }

  // Render maps into card bodies
  for (const card of state.cards) {
    if (card.blank || !card.state || !colorConfig?.valid) continue;
    const cardIdx = state.cards.indexOf(card);
    const data = cardDataMap.get(cardIdx);
    if (!data) continue;

    const cell = gridette.getCell(card.x, card.y);
    if (!cell) continue;
    const mapContainer = cell.element.querySelector('.map-card__body') as HTMLElement;
    if (mapContainer) {
      const fc = renderMapCard(mapContainer, card.state, data, colorConfig, geoData, state);
      if (fc) {
        mapTooltipHandle.bindCard(mapContainer, cardIdx, fc.features);
      }
    }
  }
}

function createCardElement(blank: boolean, cardIndex: number): HTMLElement {
  const el = document.createElement('div');
  el.className = blank ? 'map-card map-card--blank' : 'map-card';
  el.setAttribute('data-card-index', String(cardIndex));

  if (blank) {
    const addBtn = document.createElement('button');
    addBtn.className = 'map-card__add-btn';
    addBtn.type = 'button';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    addBtn.title = 'Configure map';
    addBtn.addEventListener('click', () => {
      openCardEditor(cardIndex, $state, update);
    });
    el.appendChild(addBtn);
  } else {
    const header = document.createElement('div');
    header.className = 'map-card__header';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'map-card__drag-handle';
    dragHandle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
    dragHandle.title = 'Drag to swap';
    header.appendChild(dragHandle);

    const currentState = $state.get();
    const card = currentState.cards[cardIndex];
    const cardTitleEl = document.createElement('span');
    cardTitleEl.className = 'map-card__title';
    if (card.state) {
      cardTitleEl.textContent = getCardTitle(card.state, currentState.measure);
    }
    header.appendChild(cardTitleEl);

    const controls = document.createElement('span');
    controls.className = 'map-card__controls';

    const editBtn = document.createElement('button');
    editBtn.className = 'epi-icon-btn';
    editBtn.type = 'button';
    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', () => {
      openCardEditor(cardIndex, $state, update);
    });
    controls.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'epi-icon-btn';
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    deleteBtn.title = 'Clear';
    deleteBtn.addEventListener('click', () => {
      const s = $state.get();
      const newCards = s.cards.map((c, i) => {
        if (i === cardIndex) return { ...c, blank: true, state: null };
        return c;
      });
      update({ cards: newCards });
    });
    controls.appendChild(deleteBtn);

    header.appendChild(controls);
    el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'map-card__body';
    el.appendChild(body);
  }

  return el;
}

// --- Title logic: shared fields go in topbar, differing fields go on cards ---

const MEASURE_LABEL_SHORT: Record<MapsMeasure, string> = {
  ageAdjustedRate: 'Age-Adjusted Rate',
  crudeRate: 'Crude Rate',
  deaths: 'Deaths',
  population: 'Population',
};

const CARD_FIELDS = ['year', 'cause', 'sex', 'race', 'stateFips', 'spatialLevel'] as const;
type CardField = (typeof CARD_FIELDS)[number];

/** Find fields where all non-blank cards have the same value. */
function computeSharedFields(state: MapsState): Partial<Record<CardField, string>> {
  const cardStates = state.cards.filter((c) => !c.blank && c.state).map((c) => c.state!);
  if (cardStates.length === 0) return {};

  const shared: Partial<Record<CardField, string>> = {};
  for (const field of CARD_FIELDS) {
    const first = cardStates[0][field];
    if (cardStates.every((cs) => cs[field] === first)) {
      shared[field] = first;
    }
  }
  return shared;
}

function formatFieldValue(field: CardField, value: string): string {
  switch (field) {
    case 'sex':
      return value === 'All' ? 'All sexes' : value;
    case 'race':
      return value === 'All' ? 'All races' : value;
    case 'cause':
      return value === 'All' ? 'All cancers' : value;
    case 'stateFips':
      return value === 'All' ? 'US' : fipsName(value);
    case 'spatialLevel':
      return value === 'county' ? 'County' : 'State';
    case 'year':
      return value;
    default:
      return value;
  }
}

const titleEl = document.getElementById('title')!;

function updateTitles(state: MapsState): void {
  const cardStates = state.cards.filter((c) => !c.blank && c.state);
  if (cardStates.length === 0) {
    titleEl.textContent = '';
    return;
  }

  const shared = computeSharedFields(state);
  const diffFields = CARD_FIELDS.filter((f) => !(f in shared));

  // Build shared title: "US age-adjusted rate, 2018-2022, All races, All sexes, All cancers"
  const measureLabel = MEASURE_LABEL_SHORT[state.measure];
  const filterParts: string[] = [];
  if (shared.year) filterParts.push(shared.year);
  if (shared.race !== undefined) filterParts.push(formatFieldValue('race', shared.race));
  if (shared.sex !== undefined) filterParts.push(formatFieldValue('sex', shared.sex));
  if (state.measure !== 'population' && shared.cause !== undefined) {
    filterParts.push(formatFieldValue('cause', shared.cause));
  }

  let title = `US ${measureLabel.toLowerCase()}`;
  if (filterParts.length > 0) {
    title += `, ${filterParts.join(', ')}`;
  }
  titleEl.textContent = title;

  // Store diffFields for card title generation
  currentDiffFields = diffFields;
}

let currentDiffFields: CardField[] = [];

function getCardTitle(cardState: CardState, measure: MapsMeasure): string {
  const parts: string[] = [];
  for (const field of currentDiffFields) {
    if (field === 'cause' && measure === 'population') continue;
    parts.push(formatFieldValue(field, cardState[field]));
  }
  return parts.length > 0 ? parts.join(', ') : '';
}

// 7. Re-render on resize
if (mapGridEl) {
  onResize(
    mapGridEl,
    () => {
      gridette = null;
      prevGridKey = '';
      render();
    },
    300,
    () => {},
  );
}
