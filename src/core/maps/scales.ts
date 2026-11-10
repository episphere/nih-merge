import type { Card, CardState, MapsMeasure, MapsState } from './state';
import type { ExtremeValueSensitivity } from './colorDomain';

export interface ScaleSettings {
  colorScheme: string;
  colorReverse: boolean;
  colorCenterMean: boolean;
  colorExcludeExtremes: boolean;
  extremeValueSensitivity: ExtremeValueSensitivity;
  gamma: number;
  showZeroValues: boolean;
  stripedExtremes: boolean;
  domainMin: number | null;
  domainMax: number | null;
}

export const COLOR_SCHEMES = [
  ['RdYlBu', 'Blue–Yellow–Red', true], ['RdYlGn', 'Green–Yellow–Red', true],
  ['RdBu', 'Blue–Red', true], ['PiYG', 'Green–Yellow–Pink', true],
  ['PRGn', 'Green–Purple', true], ['BrBG', 'Blue-Green–Brown', true],
  ['Spectral', 'Spectral', true], ['RdPu', 'Red–Purple', false],
  ['YlGnBu', 'Blue–Green–Yellow', true], ['YlOrRd', 'Yellow–Orange–Red', false],
  ['Blues', 'Blues', false], ['Greens', 'Greens', false], ['Oranges', 'Oranges', false],
  ['Reds', 'Reds', false], ['Purples', 'Purples', false], ['Greys', 'Greys', false],
] as const;

export function getSchemeReverse(name: string): boolean {
  return COLOR_SCHEMES.some(([value, , reverse]) => value === name && reverse);
}

export function newId(): string { return crypto.randomUUID(); }
export const MAX_MAP_DIMENSION = 8;
export function gridDimension(value: unknown): number { return Math.max(1, Math.min(MAX_MAP_DIMENSION, Math.trunc(Number(value)) || 1)); }

/** Labels belong to row-major positions, while IDs and scale membership travel with cards. */
export function cardLetter(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}

export function cardSource(card: CardState): 'mortality' | 'population' | 'chr' {
  return card.source ?? (card.measure === 'population' ? 'population' : 'mortality');
}

export function cardMeasure(card: CardState, fallback: MapsMeasure = 'ageAdjustedRate'): MapsMeasure {
  return cardSource(card) === 'population' ? 'population' : card.measure ?? fallback;
}

export function valueField(card: CardState): string {
  return cardSource(card) === 'chr' ? 'value' : cardMeasure(card);
}

export function compatibilityKey(card: CardState): string {
  return [cardSource(card), cardSource(card) === 'chr' ? card.chrField ?? 'v009' : cardMeasure(card), card.spatialLevel].join('|');
}

export function defaultScale(source: CardState['source'] = 'mortality'): ScaleSettings {
  return {
    colorScheme: source === 'mortality' ? 'RdYlBu' : 'Blues', colorReverse: false,
    colorCenterMean: source === 'mortality', colorExcludeExtremes: source === 'mortality',
    extremeValueSensitivity: 'balanced', gamma: 0.25, showZeroValues: true,
    stripedExtremes: true, domainMin: null, domainMax: null,
  };
}

export function legacyScale(state: MapsState): ScaleSettings {
  return Object.fromEntries(Object.keys(defaultScale()).map(key => [key,
    key in state ? state[key as keyof MapsState] : null,
  ])) as unknown as ScaleSettings;
}

export function compatibleGroups(state: MapsState, draft: CardState, excludeId?: string): { id: string; indices: number[] }[] {
  const groups = new Map<string, number[]>();
  state.cards.forEach((card, index) => {
    if (card.blank || !card.state || card.id === excludeId || !card.scaleId
      || compatibilityKey(card.state) !== compatibilityKey(draft)) return;
    const indices = groups.get(card.scaleId) ?? [];
    indices.push(index);
    groups.set(card.scaleId, indices);
  });
  return [...groups].map(([id, indices]) => ({ id, indices }));
}

export function scaleMembers(state: MapsState, scaleId: string): number[] {
  return state.cards.flatMap((card, index) => !card.blank && card.scaleId === scaleId ? [index] : []);
}

/** The legend badges and scale settings explain membership using the same wording. */
export function scaleSharingDescription(state: MapsState, index: number): string {
  const members = scaleMembers(state, state.cards[index].scaleId!);
  return members.length > 1
    ? `This color scale is shared by maps ${members.map(cardLetter).join(', ')}.`
    : `Map ${cardLetter(index)} has an independent color scale.`;
}

/** Normalize legacy URLs and prevent incompatible measures from sharing numeric domains. */
export function normalizeMapCards(state: MapsState, change: Partial<MapsState>): void {
  const scales = { ...state.scales };
  const assigned = new Map<string, string>();
  const seenIds = new Set<string>();
  state.cards = state.cards.map((original): Card => {
    const card = { ...original, state: original.state ? { ...original.state } : null };
    if (!card.id || seenIds.has(card.id)) card.id = newId();
    seenIds.add(card.id);
    card.legendMode ??= 'full';
    if (card.blank || !card.state) { card.scaleId = undefined; return card; }
    card.state.measure ??= state.measure;
    card.state.source ??= card.state.measure === 'population' ? 'population' : 'mortality';
    if (card.state.source === 'chr') {
      card.state.spatialLevel = 'county'; card.state.chrField ??= 'v009'; card.state.chrVintage ??= 'auto';
      card.state.cause = 'All'; card.state.race = 'All'; card.state.sex = 'All';
    } else if (card.state.source === 'population') {
      card.state.measure = 'population'; card.state.cause = 'All';
    }
    const key = compatibilityKey(card.state);
    card.scaleId ??= `legacy:${key}`;
    if (assigned.has(card.scaleId) && assigned.get(card.scaleId) !== key) card.scaleId = newId();
    assigned.set(card.scaleId, key);
    if (!scales[card.scaleId]) scales[card.scaleId] = card.state.source === 'mortality'
      ? legacyScale(state) : defaultScale(card.state.source);
    if (Object.keys(defaultScale()).some(key => key in change) && card.scaleId.startsWith('legacy:')) scales[card.scaleId] = legacyScale(state);
    return card;
  });
  state.scales = Object.fromEntries([...assigned.keys()].map(id => [id, scales[id]]));
}

export function swapMapCards(state: MapsState, a: number, b: number): Card[] {
  if (a < 0 || b < 0 || a >= state.cards.length || b >= state.cards.length) return state.cards;
  return state.cards.map((card, index) => index === a ? { ...state.cards[b], x: card.x, y: card.y }
    : index === b ? { ...state.cards[a], x: card.x, y: card.y } : card);
}

export function changeScaleMembership(state: MapsState, cardId: string, target: string, settings: ScaleSettings): Partial<MapsState> {
  const scaleId = target === 'independent' ? newId() : target;
  return {
    cards: state.cards.map(card => card.id === cardId ? { ...card, scaleId } : card),
    scales: { ...state.scales, [scaleId]: { ...settings } },
  };
}
