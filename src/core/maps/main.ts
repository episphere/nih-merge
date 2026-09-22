import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { onResize } from '../shared/resizeObserver';
import { MAPS_DEFAULTS, resolveMaps, type MapsState } from './state';
import { initControls, openCardEditor } from './controls';
import type { CardState, MapsMeasure } from './state';
import { buildCardTitle, buildSharedTitle, type CardField } from './titles';
import { initTopControls } from './topControls';
import {
  fetchAllCardData,
  computeColorConfig,
  getCachedGeoData,
  loadGeoData,
  type ColorConfig,
  type GeoData,
} from './query';
import { getMapDomain, renderMapCard } from './mapPlot';
import { selectDetailTier } from './detailTier';
import { renderColorLegend } from './colorLegend';
import { Gridette } from './grid';
import { initMapTooltip, type MapTooltipHandle, type CardDensityData } from './mapTooltip';
import type { TableView } from '../shared/dataTableOverlay';
import { syncMapsToURL } from './urlSync';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(MAPS_DEFAULTS, resolveMaps);

// 3. Controls
initControls($state, update);

// URL state sync (must come after store creation, before render subscriptions)
syncMapsToURL($state, update);

// Collect all card data for table/download export
let allCardData: Record<string, unknown>[] = [];
let tableDataVersion = 0;
function getData(): Record<string, unknown>[] {
  return allCardData;
}

function getTableView(): TableView {
  const state = $state.get();
  return {
    key: `${querySnapshot(state)}\0${tableDataVersion}`,
    rows: allCardData,
    subtitle: document.getElementById('title')?.textContent ?? '',
    presentation: {
      fixedColumns: [
        'mapCard', 'year', 'spatialLevel', 'regionName', 'stateFips', 'countyFips',
        'cause', 'race', 'sex', 'ageGroup',
      ],
      activeMeasure: state.measure,
      defaultNumericColumns: ['deaths', 'population', state.measure],
      exportFileStem: 'nih-merge-maps-table',
      columnLabels: {
        deaths: 'Deaths', population: 'Population', crudeRate: 'Crude Rate',
        ageAdjustedRate: 'Age-Adjusted Rate',
      },
    },
  };
}

initTopControls($state, update, getData, getTableView);

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
  const isConnecticutCounty = card.state.spatialLevel === 'county' && featureId.startsWith('09');
  const hasNoConnecticutCountyData = isConnecticutCounty
    && (state.measure === 'ageAdjustedRate' || state.measure === 'crudeRate' || state.measure === 'population')
    && (card.state.year === '2018-2024' || Number(card.state.year) >= 2020);

  return {
    row,
    spatialLevel: card.state.spatialLevel,
    measure: state.measure,
    unavailableMessage: hasNoConnecticutCountyData
      ? 'No county-level rates available for Connecticut after 2019 (see documentation)'
      : undefined,
  };
});

// 6. Render loop with query-key separation
let cardDataMap = new Map<number, Record<string, unknown>[]>();
let colorConfig: ColorConfig | null = null;
let renderVersion = 0;
let renderGeneration = 0;
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
  const generation = ++renderGeneration;
  const snap = querySnapshot(state);
  const needsFetch = snap !== prevQuerySnapshot;

  if (needsFetch) {
    document.getElementById('btn-table')?.setAttribute('disabled', '');
    prevQuerySnapshot = snap;
    const version = ++renderVersion;
    const data = await fetchAllCardData(state.cards, state.measure);
    if (version !== renderVersion) return; // stale
    cardDataMap = data;

    // Flatten all card data for table/download
    allCardData = [];
    for (const [cardIndex, rows] of cardDataMap) {
      const cardState = state.cards[cardIndex]?.state;
      if (!cardState) continue;
      allCardData.push(...rows.map((row) => ({
        mapCard: cardIndex + 1,
        year: cardState.year,
        spatialLevel: cardState.spatialLevel,
        ...row,
      })));
    }
    tableDataVersion++;
    document.getElementById('btn-table')?.removeAttribute('disabled');
  }

  colorConfig = computeColorConfig(cardDataMap, state);
  renderColorLegend(legendEl, colorConfig, state);
  updateTitles(state);

  // Update tooltip density plot with per-card values
  if (colorConfig && colorConfig.valid) {
    const cardData: CardDensityData[] = [];
    for (const [cardIndex, rows] of cardDataMap.entries()) {
      const values: number[] = [];
      for (const row of rows) {
        const v = row[state.measure];
        if (typeof v === 'number' && !Number.isNaN(v)) {
          if (!state.showZeroValues && v === 0) continue;
          values.push(v);
        }
      }
      if (values.length > 0) {
        cardData.push({ cardIndex, values });
      }
    }
    mapTooltipHandle.updateDensity(cardData, colorConfig);
  }

  void render(generation).catch((error: unknown) => {
    showGeographyError(error, generation);
  });
});

async function render(generation: number): Promise<void> {
  const state = $state.get();
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

  const lowGeoData = await loadGeoData('low');
  if (generation !== renderGeneration) return;

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
      const width = Math.max(0, mapContainer.getBoundingClientRect().width - 30);
      const height = Math.max(0, mapContainer.getBoundingClientRect().height - 30);
      const lowDomain = getMapDomain(card.state, lowGeoData);
      const desiredTier = selectDetailTier(
        lowDomain,
        width,
        height,
        card.state.stateFips === 'All',
      );
      const tierStateFips = desiredTier === 'high' ? card.state.stateFips : undefined;
      const desiredGeoData = getCachedGeoData(desiredTier, tierStateFips);
      const cachedLowerTier = desiredTier === 'high' ? getCachedGeoData('medium') : null;
      const initialGeoData = desiredGeoData ?? cachedLowerTier ?? lowGeoData;

      renderCardGeometry(mapContainer, cardIdx, card.state, data, colorConfig, initialGeoData, state);

      if (!desiredGeoData && desiredTier !== 'low') {
        void loadGeoData(desiredTier, tierStateFips).then((detailGeoData) => {
          if (generation !== renderGeneration || !gridette) return;
          const currentCell = gridette.getCell(card.x, card.y);
          const currentContainer = currentCell?.element.querySelector('.map-card__body');
          if (currentContainer !== mapContainer) return;
          renderCardGeometry(
            mapContainer,
            cardIdx,
            card.state!,
            data,
            colorConfig!,
            detailGeoData,
            state,
          );
        }).catch((error: unknown) => {
          console.warn(`Unable to load ${desiredTier}-detail map geography; retaining lower detail.`, error);
        });
      }
    }
  }
}

function renderCardGeometry(
  container: HTMLElement,
  cardIndex: number,
  cardState: CardState,
  data: Record<string, unknown>[],
  cardColorConfig: ColorConfig,
  geoData: GeoData,
  state: MapsState,
): void {
  const featureCollection = renderMapCard(
    container,
    cardState,
    data,
    cardColorConfig,
    geoData,
    state,
  );
  if (featureCollection) {
    mapTooltipHandle.bindCard(container, cardIndex, featureCollection.features);
  }
}

function showGeographyError(error: unknown, generation: number): void {
  if (generation !== renderGeneration) return;
  console.error('Unable to load map geography.', error);
  for (const body of mapGridEl.querySelectorAll<HTMLElement>('.map-card__body')) {
    body.replaceChildren();
    const message = document.createElement('div');
    message.className = 'map-card__error';
    message.textContent = 'Map geography could not be loaded.';
    body.appendChild(message);
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

const titleEl = document.getElementById('title')!;

function updateTitles(state: MapsState): void {
  const cardStates = state.cards.filter((c) => !c.blank && c.state);
  if (cardStates.length === 0) {
    titleEl.textContent = '';
    return;
  }

  const { title, diffFields } = buildSharedTitle(state);
  titleEl.textContent = title;
  currentDiffFields = diffFields;
}

let currentDiffFields: CardField[] = [];

function getCardTitle(cardState: CardState, measure: MapsMeasure): string {
  return buildCardTitle(cardState, measure, currentDiffFields);
}

// 7. Re-render on resize
if (mapGridEl) {
  onResize(
    mapGridEl,
    () => {
      // ResizeObserver fires once during startup. If that happens while the
      // initial data query is still pending, rendering here would invalidate
      // the data-backed render and leave the card empty until another resize.
      if (!colorConfig?.valid || cardDataMap.size === 0) return;
      gridette = null;
      prevGridKey = '';
      const generation = ++renderGeneration;
      void render(generation).catch((error: unknown) => {
        showGeographyError(error, generation);
      });
    },
    300,
    () => {},
  );
}
