import type { TableView } from '../shared/tableView';
import { fipsName } from '../shared/fips';
import { MEASURE_STYLE } from '../shared/visual';
import type { CardState, MapsState } from './state';
import { MAPS_MEASURE_LABELS } from './state';
import { cardLetter, cardMeasure, cardSource } from './scales';
import { chrField } from './chrFields';

interface MapTableData { rows?: Record<string, unknown>[]; error?: string }
const dataVersions = new WeakMap<Record<string, unknown>[], number>();
const EMPTY_ROWS: Record<string, unknown>[] = [];
let nextDataVersion = 0;

function shortMeasureLabel(card: CardState): string {
  if (cardSource(card) === 'chr') return chrField(card.chrField).name;
  const measure = cardMeasure(card);
  return measure === 'ageAdjustedRate' || measure === 'crudeRate'
    ? MEASURE_STYLE[measure].barLabel ?? MEASURE_STYLE[measure].labelShort
    : MAPS_MEASURE_LABELS[measure];
}

/** A table describes one map; source and filter settings belong in its header,
 * while optional metadata and additional measures remain available in the chooser. */
export function buildMapTableView(
  state: MapsState, data: ReadonlyMap<string, MapTableData>, requestedId?: string,
): TableView {
  const available = state.cards.flatMap((card, index) => !card.blank && card.state ? [{ card, index }] : []);
  const choices = available.map(({ card, index }) => {
    const loaded = data.get(card.id!);
    const period = cardSource(card.state!) === 'chr' ? loaded?.rows?.[0]?.dataYears : card.state!.year;
    return { id: card.id!, label: `${cardLetter(index)} · ${shortMeasureLabel(card.state!)}${period ? ` · ${period}` : ''}${!loaded?.rows ? loaded?.error ? ' · Unavailable' : ' · Loading…' : ''}`,
      disabled: !loaded?.rows };
  });
  const selected = available.find(({ card }) => card.id === requestedId && data.get(card.id!)?.rows)
    ?? available.find(({ card }) => data.get(card.id!)?.rows)
    ?? available[0];
  const emptyPresentation = { fixedColumns: [], activeMeasure: '', defaultNumericColumns: [], exportFileStem: 'nih-merge-map' };
  if (!selected) return { key: 'no-maps', rows: [], choices, presentation: emptyPresentation };

  const { card, index } = selected;
  const config = card.state!;
  const source = cardSource(config);
  const measure = cardMeasure(config);
  const rawRows = data.get(card.id!)?.rows ?? EMPTY_ROWS;
  if (!dataVersions.has(rawRows)) dataVersions.set(rawRows, ++nextDataVersion);
  const countyLevel = config.spatialLevel === 'county';
  const fixedColumns = countyLevel ? ['countyName', 'stateName'] : ['stateName'];
  const chr = chrField(config.chrField);
  const activeMeasure = source === 'chr' ? chr.id : measure;
  const activeLabel = source === 'chr' ? `${chr.name} (${chr.unit})`
    : measure === 'ageAdjustedRate' ? 'Age-adjusted mortality (per 100,000)'
    : measure === 'crudeRate' ? 'Crude mortality (per 100,000)' : MAPS_MEASURE_LABELS[measure];
  const measureColumns = source === 'chr' ? [chr.id, 'rawValue']
    : source === 'population' ? ['population'] : ['deaths', 'population', 'ageAdjustedRate', 'crudeRate'];
  const defaultNumericColumns = [...new Set(source === 'mortality' ? ['deaths', 'population', measure] : [activeMeasure])];
  const rows = rawRows.map(row => {
    const result: Record<string, unknown> = countyLevel
      ? { countyName: row.regionName, stateName: fipsName(String(row.stateFips)) }
      : { stateName: row.regionName ?? fipsName(String(row.stateFips)) };
    result.stateFips = row.stateFips;
    if (countyLevel) result.countyFips = row.countyFips;
    for (const column of measureColumns) result[column] = source === 'chr' && column === chr.id ? row.value ?? null : row[column] ?? null;
    if (source === 'chr') {
      result.dataYears = row.dataYears ?? null;
      result.dataSource = row.dataSource ?? null;
      result.chrVintage = row.chrVintage ?? null;
    } else {
      result.year = config.year;
      if (source === 'mortality') result.cause = config.cause;
      result.sex = config.sex;
      result.race = config.race;
    }
    return result;
  });
  const geography = config.stateFips === 'All' ? 'US' : fipsName(config.stateFips);
  const subtitle = source === 'chr'
    ? `Data ${rawRows[0]?.dataYears ?? 'years unavailable'} · ${geography}`
    : [config.year, ...(source === 'mortality' ? [config.cause === 'All' ? 'All cancers' : config.cause] : []),
      config.sex === 'All' ? 'All sexes' : config.sex, config.race === 'All' ? 'All races / ethnicities' : config.race, geography].join(' · ');
  return {
    key: JSON.stringify([card.id, index, config, dataVersions.get(rawRows)]),
    choices, selectedChoiceId: card.id, subtitle, rows,
    presentation: {
      fixedColumns, activeMeasure, defaultNumericColumns,
      optionalColumns: Object.keys(rows[0] ?? {}).filter(column => !fixedColumns.includes(column)),
      columnWidths: { countyName: 155, stateName: 145, deaths: 145, population: 145,
        [activeMeasure]: Math.min(420, Math.max(180, activeLabel.length * 7 + 28)) },
      exportFileStem: `nih-merge-map-${cardLetter(index).toLowerCase()}`,
      aliases: { columns: {
        countyName: 'County', stateName: 'State', stateFips: 'State FIPS', countyFips: 'County FIPS',
        deaths: 'Deaths', population: 'Population',
        ageAdjustedRate: 'Age-adjusted mortality (per 100,000)', crudeRate: 'Crude mortality (per 100,000)',
        [chr.id]: `${chr.name} (${chr.unit})`, rawValue: 'Source value (unconverted)',
        dataYears: 'Data years', dataSource: 'Source', chrVintage: 'CHR release', year: 'Year',
        cause: 'Cancer site', sex: 'Sex', race: 'Race / ethnicity',
      } },
    },
  };
}
