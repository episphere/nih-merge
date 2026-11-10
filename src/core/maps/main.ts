import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { onResize } from '../shared/resizeObserver';
import { MAPS_DEFAULTS, resolveMaps, type Card, type CardState, type MapsState } from './state';
import { openCardEditor } from './controls';
import { initTopControls } from './topControls';
import { fetchCardData, computeCardScales, getCachedGeoData, loadGeoData, type ColorConfig, type GeoData } from './query';
import { getMapDomain, renderMapCard } from './mapPlot';
import { selectDetailTier } from './detailTier';
import { Gridette } from './grid';
import { initMapTooltip } from './mapTooltip';
import { syncMapsToURL } from './urlSync';
import { cardLetter, cardMeasure, cardSource, MAX_MAP_DIMENSION, swapMapCards, valueField } from './scales';
import { chrField } from './chrFields';
import { element, button } from './editorUI';
import { mountCardLegend, measureLabel, type LegendHandle } from './cardLegend';
import { openScaleEditor } from './scaleEditor';
import { fipsName } from '../shared/fips';
import { MEASURE_STYLE } from '../shared/visual';
import type { TableView } from '../shared/tableView';
import { buildMapTableView } from './table';
import type { MapsFigureOptions } from '../shared/downloadImage';

initLayout({ showBackToTop: false });
const { $state, update } = createDashboardStore(MAPS_DEFAULTS, resolveMaps);
syncMapsToURL($state, update);

interface LoadedCard { key: string; rows?: Record<string, unknown>[]; error?: string }
const loaded = new Map<string, LoadedCard>();
let dataByIndex = new Map<number, Record<string, unknown>[]>();
let configs = new Map<string, ColorConfig>();
let densities = new Map<number, { cardIndex: number; values: number[] }>();
let legendHandles = new Map<number, LegendHandle>();
let gridette: Gridette;
let renderGeneration = 0;
let scheduled = false;
const mapGridEl = document.getElementById('map-grid')!;
const dashboardEl = document.getElementById('dashboard')!;

function requestKey(card: Card): string { return JSON.stringify(card.state); }
function allData(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  $state.get().cards.forEach((card, index) => {
    if (!card.state || card.blank) return;
    const c = card.state;
    for (const row of loaded.get(card.id!)?.rows ?? []) rows.push({
      mapCard: cardLetter(index), dataType: cardSource(c), measure: measureLabel(c),
      referenceYear: cardSource(c) === 'chr' ? null : c.year, spatialLevel: c.spatialLevel, regionName: row.regionName,
      stateFips: row.stateFips, countyFips: row.countyFips ?? null,
      value: row[valueField(c)] ?? null, unit: row.unit ?? (cardMeasure(c).includes('Rate') ? 'per 100,000' : 'count'),
      chrVintage: row.chrVintage ?? null, dataYears: row.dataYears ?? c.year,
      dataSource: row.dataSource ?? 'NCHS mortality / population data',
      cause: cardSource(c) === 'mortality' ? c.cause : null,
      sex: cardSource(c) === 'chr' ? null : c.sex,
      race: cardSource(c) === 'chr' ? null : c.race,
      deaths: row.deaths ?? null, population: row.population ?? null,
      ageAdjustedRate: row.ageAdjustedRate ?? null, crudeRate: row.crudeRate ?? null,
      chrField: row.chrField ?? null, rawValue: row.rawValue ?? null,
    });
  });
  return rows;
}
function tableView(cardId?: string): TableView { return buildMapTableView($state.get(), loaded, cardId); }
function figureOptions(): MapsFigureOptions | null {
  const state = $state.get();
  const maps = state.cards.map((card, index) => {
    if (card.blank || !card.state) return null;
    const el = mapGridEl.querySelector(`[data-card-index="${index}"]`);
    const svg = el?.querySelector<SVGSVGElement>('.map-card__body svg');
    if (!svg) return null;
    return { svg, title: `${cardLetter(index)} · ${measureLabel(card.state)}`, subtitle: subtitle(card.state, loaded.get(card.id!)?.rows),
      legendSVG: legendHandles.get(index)?.fullSVG() ?? undefined };
  });
  return maps.some(Boolean) ? { title: 'NIH-MERGE · Geographic comparisons', maps, nRows: state.nRows, nCols: state.nCols, legendSVGs: [], filename: 'nih-merge-maps' } : null;
}
initTopControls($state, update, allData, tableView, figureOptions);

const wrapper = element('div', 'maps-dashboard-grid');
dashboardEl.append(wrapper); wrapper.append(mapGridEl);
for (const [axis, label] of [['col', 'column'], ['row', 'row']] as const) {
  const group = element('div', `grid-add grid-add--${axis}`);
  for (const [symbol, delta, verb] of [['plus', 1, 'Add'], ['minus', -1, 'Remove']] as const) {
    const btn = element('button', 'grid-add__btn'); btn.type = 'button';
    btn.innerHTML = `<i class="fa-solid fa-${symbol}" aria-hidden="true"></i>`;
    btn.title = `${verb} ${label}`; btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', () => {
      const state = $state.get(); const key = axis === 'row' ? 'nRows' : 'nCols';
      update({ [key]: Math.max(1, state[key] + delta) });
    });
    $state.subscribe(state => {
      const size = state[axis === 'row' ? 'nRows' : 'nCols'];
      if (delta < 0) btn.hidden = size <= 1;
      else btn.disabled = size >= MAX_MAP_DIMENSION;
    });
    group.append(btn);
  }
  wrapper.append(group);
}

const tooltip = initMapTooltip((index, featureId) => {
  const state = $state.get(); const card = state.cards[index];
  if (!card?.state || card.blank) return null;
  const c = card.state;
  const rows = dataByIndex.get(index);
  const row = rows?.find(r => r[c.spatialLevel === 'county' ? 'countyFips' : 'stateFips'] === featureId);
  const ct = cardSource(c) !== 'chr' && c.spatialLevel === 'county' && featureId.startsWith('09')
    && cardMeasure(c) !== 'deaths' && (c.year === '2018-2024' || Number(c.year) >= 2020);
  return { row, cardState: c, spatialLevel: c.spatialLevel, measure: cardMeasure(c),
    density: densities.get(index), colorConfig: configs.get(card.scaleId!),
    unavailableMessage: ct ? 'County rates and population are unavailable for Connecticut after 2019 (see documentation).' : undefined };
});

function scheduleRender() {
  if (scheduled) return; scheduled = true;
  requestAnimationFrame(() => { scheduled = false; void render().catch(error => { console.error('Unable to render maps', error); }); });
}

$state.subscribe(state => {
  const ids = new Set(state.cards.map(card => card.id));
  for (const id of loaded.keys()) if (!ids.has(id)) loaded.delete(id);
  for (const card of state.cards) {
    if (card.blank || !card.state) continue;
    const id = card.id!; const key = requestKey(card);
    if (loaded.get(id)?.key === key) continue;
    const entry: LoadedCard = { key }; loaded.set(id, entry);
    void fetchCardData(card.state, cardMeasure(card.state)).then(rows => {
      if (loaded.get(id) !== entry) return;
      entry.rows = rows; scheduleRender();
    }).catch(error => {
      if (loaded.get(id) !== entry) return;
      entry.error = error instanceof Error ? error.message : 'Unable to load map data.'; scheduleRender();
    });
  }
  scheduleRender();
});

function subtitle(card: CardState, rows?: Record<string, unknown>[]): string {
  const geography = card.stateFips === 'All' ? 'US' : fipsName(card.stateFips);
  if (cardSource(card) === 'chr') {
    const row = rows?.[0];
    return row ? `Data ${row.dataYears} · ${geography}` : geography;
  }
  const filters: string[] = [card.year];
  if (cardSource(card) === 'mortality') filters.push(card.cause === 'All' ? 'All cancers' : card.cause);
  if (card.sex !== 'All') filters.push(card.sex);
  else if (card.cause === 'Breast') filters.push('All sexes');
  if (card.race !== 'All') filters.push(card.race);
  return `${filters.join(' · ')} · ${geography}`;
}

function iconButton(icon: string, label: string, action: () => void) {
  const btn = element('button', 'epi-icon-btn'); btn.type = 'button'; btn.title = label; btn.setAttribute('aria-label', label);
  btn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`; btn.addEventListener('click', action); return btn;
}

function createCard(card: Card, index: number, state: MapsState): HTMLElement {
  const letter = cardLetter(index);
  const el = element('div', card.blank ? 'map-card map-card--blank' : 'map-card'); el.dataset.cardIndex = String(index);
  const badge = element('span', 'map-card__letter', letter); badge.setAttribute('aria-label', `Map position ${letter}`);
  if (card.blank || !card.state) {
    el.append(badge, button('Add map', () => openCardEditor(index, $state, update), true)); return el;
  }
  const heading = element('div', 'map-card__header');
  const drag = iconButton('fa-grip-vertical', `Drag map ${letter} to swap; arrow keys move to another position`, () => {});
  drag.classList.add('map-card__drag-handle');
  drag.addEventListener('keydown', event => {
    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -state.nCols, ArrowDown: state.nCols } as Record<string, number>)[event.key];
    if (offset == null) return;
    const target = index + offset;
    if (target < 0 || target >= state.cards.length || (event.key === 'ArrowLeft' && card.x === 1) || (event.key === 'ArrowRight' && card.x === state.nCols)) return;
    event.preventDefault(); update({ cards: swapMapCards($state.get(), index, target) });
    requestAnimationFrame(() => mapGridEl.querySelector<HTMLElement>(`[data-card-index="${target}"] .map-card__drag-handle`)?.focus());
  });
  const measure = cardMeasure(card.state);
  const title = element('span', 'map-card__title', cardSource(card.state) === 'chr' ? chrField(card.state.chrField).name
    : measure === 'ageAdjustedRate' || measure === 'crudeRate' ? MEASURE_STYLE[measure].barLabel ?? MEASURE_STYLE[measure].labelShort : measureLabel(card.state));
  title.title = measureLabel(card.state);
  const context = element('span', 'map-card__context', subtitle(card.state, loaded.get(card.id!)?.rows));
  context.title = context.textContent!;
  const headingText = element('div', 'map-card__heading');
  headingText.append(title, context);
  const tools = element('span', 'map-card__controls');
  tools.append(iconButton('fa-pen', `Edit map ${letter}`, () => openCardEditor(index, $state, update)),
    iconButton('fa-clone', `Clone map ${letter}`, () => openCardEditor(index, $state, update, true)),
    iconButton('fa-xmark', `Clear map ${letter}`, () => update({ cards: $state.get().cards.map(c => c.id === card.id ? { ...c, blank: true, state: null } : c) })));
  heading.append(badge, drag, headingText, tools);
  el.append(heading);
  const body = element('div', 'map-card__body'); el.append(body);
  const data = loaded.get(card.id!);
  if (!data?.rows) {
    const status = element('div', data?.error ? 'map-card__error' : 'map-card__loading', data?.error ?? 'Loading map data…');
    if (data?.error) status.append(button('Retry', () => { loaded.delete(card.id!); update({ cards: [...$state.get().cards] }); }, true));
    status.setAttribute('role', 'status'); body.append(status);
  }
  const legend = element('div', 'map-legend');
  // Apply the preference before measuring the map so a minimized legend reserves no footer space.
  legend.dataset.mode = card.legendMode ?? 'full';
  el.append(legend);
  // Mount after the card is attached so legend layout can measure available space.
  requestAnimationFrame(() => {
    if (!legend.isConnected) return;
    legendHandles.set(index, mountCardLegend(legend, state, index, configs.get(card.scaleId!),
      () => openScaleEditor(index, $state, update),
      mode => {
        const focused = document.activeElement === legend.querySelector('.map-legend__tools button:last-child');
        update({ cards: $state.get().cards.map(c => c.id === card.id ? { ...c, legendMode: mode } : c) });
        if (focused) requestAnimationFrame(() => mapGridEl.querySelector<HTMLElement>(`[data-card-index="${index}"] .map-legend__tools button:last-child`)?.focus());
      }));
  });
  return el;
}

async function render() {
  const generation = ++renderGeneration;
  const state = $state.get();
  tooltip.hide();
  legendHandles.forEach(handle => handle.destroy()); legendHandles = new Map();
  dataByIndex = new Map();
  state.cards.forEach((card, i) => { const rows = !card.blank && loaded.get(card.id!)?.rows; if (rows) dataByIndex.set(i, rows); });
  configs = computeCardScales(state, dataByIndex);
  densities = new Map();
  for (const [i, rows] of dataByIndex) {
    const card = state.cards[i]; const field = valueField(card.state!); const settings = state.scales[card.scaleId!];
    densities.set(i, { cardIndex: i, values: rows.map(row => row[field]).filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && (settings.showZeroValues || value !== 0)) });
  }
  document.getElementById('btn-table')?.toggleAttribute('disabled', dataByIndex.size === 0);
  document.getElementById('btn-download')?.toggleAttribute('disabled', dataByIndex.size === 0);
  mapGridEl.style.setProperty('--map-available-height', `${Math.max(340, window.innerHeight - mapGridEl.getBoundingClientRect().top - window.scrollY - 40)}px`);
  mapGridEl.style.setProperty('--map-rows', String(state.nRows));
  mapGridEl.style.setProperty('--map-cols', String(state.nCols));
  gridette = new Gridette(mapGridEl, { nRows: state.nRows, nCols: state.nCols, swappable: true, handle: '.map-card__drag-handle' });
  gridette.on('swap', (a, b) => {
    const current = $state.get();
    const ai = current.cards.findIndex(c => c.x === a.x && c.y === a.y);
    const bi = current.cards.findIndex(c => c.x === b.x && c.y === b.y);
    if (ai >= 0 && bi >= 0) update({ cards: swapMapCards(current, ai, bi) });
  });
  state.cards.forEach((card, index) => gridette.setCell(createCard(card, index, state), card.x, card.y));
  let low: GeoData;
  try { low = await loadGeoData('low'); }
  catch {
    if (generation === renderGeneration) for (const body of mapGridEl.querySelectorAll('.map-card__body')) body.replaceChildren(element('div', 'map-card__error', 'Map geography could not be loaded. Reload to retry.'));
    return;
  }
  if (generation !== renderGeneration) return;
  for (const [index, rows] of dataByIndex) {
    const card = state.cards[index]; if (!card.state) continue;
    const container = mapGridEl.querySelector<HTMLElement>(`[data-card-index="${index}"] .map-card__body`)!;
    const base = configs.get(card.scaleId!);
    const config: ColorConfig = base ?? { scheme: 'Blues', reverse: false, domain: [0, 1], pivot: null, valid: true, trimmedScheme: null, lowOutlierColor: null, highOutlierColor: null };
    const settings = state.scales[card.scaleId!];
    const scopedState = { ...state, ...settings, measure: cardMeasure(card.state) };
    const draw = (geo: GeoData) => {
      if (generation !== renderGeneration || !container.isConnected) return;
      const features = renderMapCard(container, card.state!, rows, config, geo, scopedState);
      if (features) tooltip.bindCard(container, index, features.features);
    };
    const tier = selectDetailTier(getMapDomain(card.state, low), container.clientWidth - 30, container.clientHeight - 30, card.state.stateFips === 'All');
    const fips = tier === 'high' ? card.state.stateFips : undefined;
    const detail = getCachedGeoData(tier, fips);
    draw(detail ?? low);
    if (!detail && tier !== 'low') void loadGeoData(tier, fips).then(draw).catch(error => console.warn('Retaining lower-detail geography', error));
  }
}
onResize(mapGridEl, scheduleRender, 200);
