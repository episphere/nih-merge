import type { MapStore } from 'nanostores';
import { ALL_CANCER_SITES, ALL_RACES, ALL_YEARS } from '../../domain/mortality';
import { DEFAULT_CARD, MAPS_DEFAULTS, type Card, type CardState, type MapsMeasure, type MapsState } from './state';
import { COLOR_SCHEMES, defaultScale, gridDimension, type ScaleSettings } from './scales';
import { CHR_FIELDS } from './chrFields';

const MEASURES: MapsMeasure[] = ['ageAdjustedRate', 'crudeRate', 'deaths', 'population'];
const OUTLINES = ['showOutlineCounty', 'showOutlineState', 'showOutlineNation'] as const;
const SCALE_BOOL = ['colorReverse', 'colorCenterMean', 'colorExcludeExtremes', 'showZeroValues', 'stripedExtremes'] as const;
function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function identifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w:|.-]{1,160}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value) ? value : undefined;
}
function readScale(value: unknown): ScaleSettings {
  const raw = record(value); const settings = defaultScale();
  if (COLOR_SCHEMES.some(([name]) => name === raw.colorScheme)) settings.colorScheme = String(raw.colorScheme);
  for (const key of SCALE_BOOL) if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  if (['conservative', 'balanced', 'aggressive', 'custom'].includes(String(raw.extremeValueSensitivity))) settings.extremeValueSensitivity = raw.extremeValueSensitivity as ScaleSettings['extremeValueSensitivity'];
  if (typeof raw.gamma === 'number' && Number.isFinite(raw.gamma)) settings.gamma = Math.max(0, Math.min(2, raw.gamma));
  for (const key of ['domainMin', 'domainMax'] as const) if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) settings[key] = raw[key];
  if (settings.domainMin != null && settings.domainMax != null && settings.domainMin >= settings.domainMax) { settings.domainMin = null; settings.domainMax = null; }
  return settings;
}
function readCardState(value: unknown, fallback: MapsMeasure): CardState {
  const raw = record(value); const state: CardState = { ...DEFAULT_CARD };
  if (ALL_YEARS.includes(raw.year as never)) state.year = raw.year as CardState['year'];
  if (raw.cause === 'All' || ALL_CANCER_SITES.includes(raw.cause as never)) state.cause = raw.cause as CardState['cause'];
  if (['All', 'Male', 'Female'].includes(String(raw.sex))) state.sex = raw.sex as CardState['sex'];
  if (raw.race === 'All' || ALL_RACES.includes(raw.race as never)) state.race = raw.race as CardState['race'];
  if (raw.stateFips === 'All' || typeof raw.stateFips === 'string' && /^\d{2}$/.test(raw.stateFips)) state.stateFips = raw.stateFips as string;
  if (raw.spatialLevel === 'state') state.spatialLevel = 'state';
  state.measure = MEASURES.includes(raw.measure as MapsMeasure) ? raw.measure as MapsMeasure : fallback;
  state.source = ['mortality', 'population', 'chr'].includes(String(raw.source)) ? raw.source as CardState['source'] : state.measure === 'population' ? 'population' : 'mortality';
  if (state.source === 'chr') {
    state.chrField = CHR_FIELDS.some(field => field.id === raw.chrField) ? raw.chrField as CardState['chrField'] : 'v009';
    state.chrVintage = typeof raw.chrVintage === 'string' && /^(auto|201[89]|202[0-5])$/.test(raw.chrVintage) ? raw.chrVintage : 'auto';
  }
  return state;
}

export function encodeMapsConfiguration(state: MapsState): string {
  return JSON.stringify({ version: 2, nRows: state.nRows, nCols: state.nCols,
    cards: state.cards, scales: state.scales,
    ...Object.fromEntries(OUTLINES.map(key => [key, state[key]])),
  });
}

export function decodeMapsConfiguration(raw: string): Partial<MapsState> {
  const config = record(JSON.parse(raw));
  if (config.version !== 2 || !Array.isArray(config.cards)) throw new Error('Unsupported maps configuration');
  const nRows = gridDimension(config.nRows); const nCols = gridDimension(config.nCols);
  const cards: Card[] = Array.from({ length: nRows * nCols }, (_, i) => {
    const card = record(config.cards instanceof Array ? config.cards[i] : undefined);
    return { x: i % nCols + 1, y: Math.floor(i / nCols) + 1, id: identifier(card.id), scaleId: identifier(card.scaleId),
      blank: card.blank === true || card.state == null,
      state: card.blank === true || card.state == null ? null : readCardState(card.state, 'ageAdjustedRate'),
      // The former reduced view now becomes the floating minimized legend.
      legendMode: card.legendMode === 'reduced' || card.legendMode === 'minimized' ? 'minimized' : 'full' };
  });
  const scales = Object.fromEntries(Object.entries(record(config.scales)).filter(([key]) => identifier(key)).slice(0, 64).map(([id, settings]) => [id, readScale(settings)]));
  const outlines = Object.fromEntries(OUTLINES.filter(key => typeof config[key] === 'boolean').map(key => [key, config[key]]));
  return { cards, scales, nRows, nCols, ...outlines };
}

export function decodeLegacyMaps(params: URLSearchParams): Partial<MapsState> {
  const nRows = gridDimension(params.get('nRows') ?? 1); const nCols = gridDimension(params.get('nCols') ?? 1);
  const candidate = params.get('measure') as MapsMeasure;
  const measure = MEASURES.includes(candidate) ? candidate : MAPS_DEFAULTS.measure;
  const segments = params.get('cards')?.split(';') ?? [];
  const cards: Card[] = Array.from({ length: nRows * nCols }, (_, i) => {
    const segment = segments[i] ?? '';
    const raw = Object.fromEntries(segment.split(',').flatMap(pair => {
      const eq = pair.indexOf('='); return eq < 0 ? [] : [[pair.slice(0, eq), pair.slice(eq + 1)]];
    }));
    return { x: i % nCols + 1, y: Math.floor(i / nCols) + 1, blank: segment === '-',
      state: segment === '-' ? null : readCardState(raw, measure) };
  });
  const settings = { ...defaultScale() } as unknown as Record<string, unknown>;
  for (const key of Object.keys(defaultScale())) {
    const value = params.get(key); if (value == null) continue;
    settings[key] = SCALE_BOOL.includes(key as never) ? value === '1' || value === 'true'
      : key === 'gamma' ? Number(value) : value;
  }
  const scale = readScale(settings);
  const outlines = Object.fromEntries(OUTLINES.filter(key => params.has(key)).map(key => [key, ['1', 'true'].includes(params.get(key)!)]));
  return { cards, scales: {}, nRows, nCols, measure, ...scale, ...outlines };
}

export function syncMapsToURL(store: MapStore<MapsState>, update: (change: Partial<MapsState>) => void): void {
  const params = new URLSearchParams(window.location.search);
  try {
    const config = params.get('mapConfig');
    if (config) update(decodeMapsConfiguration(config));
    else if (params.get('example') === 'chr') update({
      nRows: 1, nCols: 2,
      cards: [
        { id: 'example-mortality', x: 1, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'mortality', measure: 'ageAdjustedRate' }, scaleId: 'mortality' },
        { id: 'example-smoking', x: 2, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'chr', chrField: 'v009', chrVintage: 'auto' }, scaleId: 'smoking' },
      ],
      scales: { mortality: defaultScale(), smoking: defaultScale('chr') },
    });
    else if (params.size) update(decodeLegacyMaps(params));
  } catch (error) { console.warn('Unable to restore map configuration; using defaults.', error); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(state => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const query = new URLSearchParams({ mapConfig: encodeMapsConfiguration(state) });
      history.replaceState(null, '', `${window.location.pathname}?${query}${window.location.hash}`);
    }, 150);
  });
}
