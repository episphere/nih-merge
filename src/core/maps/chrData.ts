import { dataAssetUrl } from '../../data-access/assets';
import { getQuantileDetail, getQuantileDetailSync, loadQuantileDetails, type QuantileDetail, type QuantileDetailsIndex } from '../../data-access/chr-repository';
import type { FieldId, Year } from '../../domain/mortality';
import type { Card, CardState } from './state';
import { chrField } from './chrFields';
import { cardSource } from './scales';

let csvPromise: Promise<string> | undefined;

export async function chrMetadata(card: CardState) {
  const index = await loadQuantileDetails();
  const fieldId = card.chrField ?? 'v009';
  const detail = card.chrVintage && card.chrVintage !== 'auto'
    ? getQuantileDetailSync(index, fieldId, '4', card.chrVintage)
    : await getQuantileDetail(index, fieldId, '4', card.year);
  if (!detail) throw new Error('This characteristic is unavailable for the selected period. Choose different data years.');
  return detail;
}

export function earliestMortalityYear(cards: Card[]): Year | undefined {
  const years = cards.flatMap(card => !card.blank && card.state && cardSource(card.state) === 'mortality'
    ? (card.state.year.match(/\d{4}/g) ?? []).map(Number) : []);
  return years.length ? String(Math.min(...years)) as Year : undefined;
}

function newestDataFirst(a: QuantileDetail, b: QuantileDetail): number {
  const years = (detail: QuantileDetail) => (detail.dataYears.match(/\d{4}/g) ?? []).map(Number);
  const aYears = years(a); const bYears = years(b);
  return Math.max(0, ...bYears) - Math.max(0, ...aYears)
    || (bYears.length ? Math.min(...bYears) : 0) - (aYears.length ? Math.min(...aYears) : 0)
    || Number(b.chrVintage) - Number(a.chrVintage);
}

/** Releases are provenance. Present distinct actual measurement periods, keeping
 * the CC-recommended observations when several releases describe the same years. */
export function chooseChrPeriods(
  index: QuantileDetailsIndex, fieldId: FieldId,
  recommended?: QuantileDetail, preservedVintage?: string,
) {
  const details = [...index.values()].filter(detail => detail.fieldId === fieldId && detail.nQuantiles === '4')
    .sort(newestDataFirst);
  const selected = details.find(detail => detail.chrVintage === preservedVintage)
    ?? details.find(detail => detail.chrVintage === recommended?.chrVintage)
    ?? details[0];
  if (!selected) throw new Error('No data years are available for this characteristic.');
  const periods = new Map<string, QuantileDetail>();
  for (const detail of details) {
    if (!periods.has(detail.dataYears) || detail.chrVintage === selected.chrVintage) periods.set(detail.dataYears, detail);
  }
  return { options: [...periods.values()].sort(newestDataFirst), selected, recommended };
}

export async function chrPeriodChoices(
  fieldId: FieldId, cards: Card[], preserve?: Pick<CardState, 'chrVintage' | 'year'>,
) {
  const index = await loadQuantileDetails();
  const referenceYear = earliestMortalityYear(cards);
  const recommended = referenceYear ? await getQuantileDetail(index, fieldId, '4', referenceYear) : undefined;
  // Opening an existing card or clone preserves its observations, including legacy automatic links.
  const preservedVintage = preserve?.chrVintage === 'auto'
    ? (await getQuantileDetail(index, fieldId, '4', preserve.year))?.chrVintage
    : preserve?.chrVintage;
  return { ...chooseChrPeriods(index, fieldId, recommended, preservedVintage), referenceYear };
}

/** The analytic CSV is numeric/unquoted. Match only the requested series instead
 * of materializing almost a million records for every map. Blank values stay null. */
export function parseChrSeries(csv: string, vintage: string, fieldId: string, multiplier: number) {
  if (!/^\d{4}$/.test(vintage) || !/^v\d{3}$/.test(fieldId)) throw new Error('Invalid CHR series');
  const pattern = new RegExp(`(?:^|\\n)${vintage},(\\d{5}),${fieldId},([^,\\r\\n]*)`, 'g');
  return [...csv.matchAll(pattern)].map(match => {
    const raw = match[2].trim() === '' ? NaN : Number(match[2]);
    return { countyFips: match[1], stateFips: match[1].slice(0, 2),
      rawValue: Number.isFinite(raw) ? raw : null,
      value: Number.isFinite(raw) ? raw * multiplier : null };
  });
}

export async function fetchChrData(card: CardState): Promise<Record<string, unknown>[]> {
  const detail = await chrMetadata(card);
  if (!csvPromise) {
    csvPromise = fetch(dataAssetUrl('chr/chr_analytic_data.csv')).then(response => {
      if (!response.ok) throw new Error(`Unable to load county characteristics (${response.status}).`);
      return response.text();
    });
    csvPromise.catch(() => { csvPromise = undefined; });
  }
  const field = chrField(card.chrField);
  const rows = parseChrSeries(await csvPromise, detail.chrVintage, field.id, field.multiplier);
  return rows.filter(row => card.stateFips === 'All' || row.stateFips === card.stateFips).map(row => ({
    ...row, chrField: field.id, chrVintage: detail.chrVintage, dataYears: detail.dataYears,
    dataSource: detail.source, measureName: field.name, unit: field.unit,
  }));
}
