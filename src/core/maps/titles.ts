import { fipsName } from '../shared/fips';
import { MAPS_MEASURE_LABELS, type CardState, type MapsMeasure, type MapsState } from './state';

export const CARD_FIELDS = ['year', 'cause', 'sex', 'race', 'stateFips', 'spatialLevel'] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/** Find fields where all non-blank cards have the same value. */
function computeSharedFields(state: MapsState): Partial<Record<CardField, string>> {
  const cardStates = state.cards.filter((c) => !c.blank && c.state).map((c) => c.state!);
  if (cardStates.length === 0) return {};

  const shared: Partial<Record<CardField, string>> = {};
  for (const field of CARD_FIELDS) {
    const first = cardStates[0][field];
    if (cardStates.every((cardState) => cardState[field] === first)) {
      shared[field] = first;
    }
  }
  return shared;
}

function formatFieldValue(field: CardField, value: string, cause?: string): string | null {
  switch (field) {
    case 'sex':
      if (value === 'All') return cause === 'Breast' ? 'All sexes' : null;
      return value;
    case 'race':
      return value === 'All' ? null : value;
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

function titleMeasureLabel(measure: MapsMeasure): string {
  if (measure === 'ageAdjustedRate') return 'Age-Adjusted Mortality Rate';
  if (measure === 'crudeRate') return 'Crude Mortality Rate';
  return MAPS_MEASURE_LABELS[measure];
}

export function buildSharedTitle(state: MapsState): { title: string; diffFields: CardField[] } {
  const shared = computeSharedFields(state);
  const diffFields = CARD_FIELDS.filter((field) => !(field in shared));
  const cardStates = state.cards.filter((card) => !card.blank && card.state).map((card) => card.state!);

  // When cause varies, the Breast card needs to disambiguate an otherwise shared
  // "All" sex selection. Treat sex as a per-card field for title purposes.
  if (
    shared.sex === 'All'
    && shared.cause === undefined
    && cardStates.some((cardState) => cardState.cause === 'Breast')
    && !diffFields.includes('sex')
  ) {
    diffFields.push('sex');
  }

  const filterParts: string[] = [];
  if (shared.year) filterParts.push(shared.year);

  if (shared.race !== undefined) {
    const race = formatFieldValue('race', shared.race, shared.cause);
    if (race) filterParts.push(race);
  }
  if (shared.sex !== undefined) {
    const sex = formatFieldValue('sex', shared.sex, shared.cause);
    if (sex) filterParts.push(sex);
  }
  if (state.measure !== 'population' && shared.cause !== undefined) {
    const cause = formatFieldValue('cause', shared.cause, shared.cause);
    if (cause) filterParts.push(cause);
  }

  let title = `US ${titleMeasureLabel(state.measure).toLowerCase()}`;
  if (filterParts.length > 0) title += `, ${filterParts.join(', ')}`;
  return { title, diffFields };
}

export function buildCardTitle(
  cardState: CardState,
  measure: MapsMeasure,
  diffFields: CardField[],
): string {
  const parts: string[] = [];
  for (const field of CARD_FIELDS) {
    if (!diffFields.includes(field)) continue;
    if (field === 'cause' && measure === 'population') continue;
    const part = formatFieldValue(field, cardState[field], cardState.cause);
    if (part) parts.push(part);
  }
  return parts.join(', ');
}
