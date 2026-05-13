import type { MapStore } from 'nanostores';
import { serializeValue, deserializeValue } from '../shared/state/urlSync';
import { DEFAULT_CARD, MAPS_DEFAULTS, type Card, type CardState, type MapsState } from './state';

/** Scalar keys to sync to URL (excludes cards, edit form state, and options). */
const URL_KEYS: (keyof MapsState & string)[] = [
  'nRows', 'nCols', 'measure', 'colorScheme', 'colorReverse',
  'colorCenterMean', 'colorExcludeExtremes', 'colorExtremeCutoff',
  'showZeroValues', 'showOutlineCounty', 'showOutlineState', 'showOutlineNation',
];

/** Fields in CardState that are serialized to URL. */
const CARD_FIELDS: (keyof CardState)[] = [
  'year', 'cause', 'sex', 'race', 'stateFips', 'spatialLevel',
];

/**
 * Deserialize a URL value, coercing to the same type as the default value.
 * The shared `deserializeValue` treats '0'/'1' as booleans, which conflicts
 * with numeric keys like nRows. We use the default's type to disambiguate.
 */
function deserializeTyped(raw: string, defaultValue: unknown): unknown {
  if (typeof defaultValue === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? defaultValue : n;
  }
  return deserializeValue(raw);
}

// --- Card serialization ---

function serializeCards(cards: Card[]): string {
  const segments: string[] = [];
  for (const card of cards) {
    if (card.blank || !card.state) {
      segments.push('-');
    } else {
      const parts: string[] = [];
      for (const field of CARD_FIELDS) {
        if (card.state[field] !== DEFAULT_CARD[field]) {
          parts.push(`${field}=${card.state[field]}`);
        }
      }
      segments.push(parts.join(','));
    }
  }
  // Strip trailing empty/default segments
  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (last === '' || last === '-') {
      segments.pop();
    } else {
      break;
    }
  }
  return segments.join(';');
}

function deserializeCards(raw: string, nRows: number, nCols: number): Card[] {
  const total = nRows * nCols;
  const segments = raw ? raw.split(';') : [];
  const cards: Card[] = [];

  for (let i = 0; i < total; i++) {
    const y = Math.floor(i / nCols) + 1;
    const x = (i % nCols) + 1;
    const seg = i < segments.length ? segments[i].trim() : '';

    if (seg === '-' || seg === '') {
      // Blank card or trailing default — but treat empty (default) differently:
      // empty segment means default card, '-' means explicitly blank
      if (seg === '-') {
        cards.push({ x, y, blank: true, state: null });
      } else {
        // Empty segment = default card
        cards.push({ x, y, blank: false, state: { ...DEFAULT_CARD } });
      }
    } else {
      // Parse key=value pairs
      const state: CardState = { ...DEFAULT_CARD };
      for (const pair of seg.split(',')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx < 0) continue;
        const key = pair.slice(0, eqIdx) as keyof CardState;
        const val = pair.slice(eqIdx + 1);
        if (key in DEFAULT_CARD) {
          (state as unknown as Record<string, unknown>)[key] = val;
        }
      }
      cards.push({ x, y, blank: false, state });
    }
  }

  return cards;
}

// --- Main sync function ---

export function syncMapsToURL(
  $state: MapStore<MapsState>,
  update: (change: Partial<MapsState>) => void,
): void {
  // --- Read URL → update store ---
  const params = new URLSearchParams(window.location.search);
  const fromURL: Partial<MapsState> = {};

  for (const key of URL_KEYS) {
    const value = params.get(key);
    if (value !== null) {
      (fromURL as Record<string, unknown>)[key] = deserializeTyped(value, MAPS_DEFAULTS[key]);
    }
  }

  // Deserialize cards (need nRows/nCols first)
  const nRows = (fromURL.nRows as number | undefined) ?? MAPS_DEFAULTS.nRows;
  const nCols = (fromURL.nCols as number | undefined) ?? MAPS_DEFAULTS.nCols;
  const cardsRaw = params.get('cards');
  if (cardsRaw !== null) {
    fromURL.cards = deserializeCards(cardsRaw, nRows, nCols);
  }

  if (Object.keys(fromURL).length > 0) {
    update(fromURL);
  }

  // --- Store → URL (debounced) ---
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  $state.subscribe((state) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const params = new URLSearchParams();

      // Scalar keys
      for (const key of URL_KEYS) {
        const serialized = serializeValue(state[key]);
        const defaultSerialized = serializeValue(MAPS_DEFAULTS[key]);
        if (serialized !== defaultSerialized) {
          params.set(key, serialized);
        }
      }

      // Cards
      const cardsSerialized = serializeCards(state.cards);
      // Omit if it's a single default card (empty string after stripping)
      if (cardsSerialized !== '') {
        params.set('cards', cardsSerialized);
      }

      const qs = params.toString();
      history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
    }, 100);
  });
}
