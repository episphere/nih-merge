import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet'
import type {
  DataManager,
  FilterValue,
  MortalityFilters,
  MortalityRow,
  CountyFilters,
  CountyRow,
  AgeFilters,
  AgeRow,
  QuantileFilters,
  QuantileRow,
  PopulationFilters,
  PopulationRow,
  Year,
} from './types.ts'

// --- Parquet loading with promise cache ---

const DATA_BASE_URL = new URL(/* @vite-ignore */ './', import.meta.url).href
const cache = new Map<string, Promise<Record<string, unknown>[]>>()

function loadParquet(fileName: string): Promise<Record<string, unknown>[]> {
  const url = `${DATA_BASE_URL}${fileName}`
  console.log(DATA_BASE_URL, url)
  let pending = cache.get(url)
  if (!pending) {
    pending = fetchAndParse(url)
    cache.set(url, pending)
    pending.catch(() => cache.delete(url))
  }
  return pending
}

async function fetchAndParse(url: string): Promise<Record<string, unknown>[]> {
  const file = await asyncBufferFromUrl({ url })
  return await parquetReadObjects({ file })
}

// --- Filtering ---

function matchesFilter<T extends string>(
  rowValue: T | 'Total',
  filterValue: FilterValue<T> | undefined,
): boolean {
  if (filterValue === undefined || filterValue === 'Total') {
    return rowValue === 'Total'
  }
  if (filterValue === '*') {
    return rowValue !== 'Total'
  }
  if (Array.isArray(filterValue)) {
    return (filterValue as string[]).includes(rowValue)
  }
  return rowValue === filterValue
}

function applyFilters<TRow>(
  rows: Record<string, unknown>[],
  filters: [string, FilterValue<string> | undefined][],
): TRow[] {
  return rows.filter((row) =>
    filters.every(([field, filterValue]) =>
      matchesFilter(row[field] as string, filterValue),
    ),
  ) as TRow[]
}

// --- File path resolution ---

function countyFile(year: Year): string {
  return `data_by-county_${year}.parquet`
}

function ageFile(year: Year): string {
  return `data_by-age_${year}.parquet`
}

function quantileFile(quantileType: string): string {
  return `data_by-measure-quantile_${quantileType}_2018-2022.parquet`
}

function populationFile(year: Year): string {
  return `data_by-population_${year}.parquet`
}

// --- Domain query functions ---

async function queryCounty(filters: CountyFilters): Promise<CountyRow[]> {
  const rows = await loadParquet(countyFile(filters.year))
  return applyFilters<CountyRow>(rows, [
    ['cause', filters.cause],
    ['race', filters.race],
    ['sex', filters.sex],
    ['stateFips', filters.stateFips],
    ['countyFips', filters.countyFips],
  ])
}

async function queryAge(filters: AgeFilters): Promise<AgeRow[]> {
  const rows = await loadParquet(ageFile(filters.year))
  console.log(filters, rows)
  return applyFilters<AgeRow>(rows, [
    ['cause', filters.cause],
    ['race', filters.race],
    ['sex', filters.sex],
    ['stateFips', filters.stateFips],
    ['ageGroup', filters.ageGroup],
  ])
}

async function queryQuantile(filters: QuantileFilters): Promise<QuantileRow[]> {
  const rows = await loadParquet(quantileFile(filters.quantileType))
  return applyFilters<QuantileRow>(rows, [
    ['cause', filters.cause],
    ['race', filters.race],
    ['sex', filters.sex],
    ['countyMeasure', filters.countyMeasure],
    ['quantile', filters.quantile],
  ])
}

async function queryPopulation(filters: PopulationFilters): Promise<PopulationRow[]> {
  const rows = await loadParquet(populationFile(filters.year))
  return applyFilters<PopulationRow>(rows, [
    ['race', filters.race],
    ['sex', filters.sex],
    ['stateFips', filters.stateFips],
    ['countyFips', filters.countyFips],
    ['ageGroup', filters.ageGroup],
  ])
}

async function queryMortality(filters: MortalityFilters): Promise<MortalityRow[]> {
  // Use age domain (smaller files) with geography/age defaulting to Total.
  const ageRows = await queryAge(filters)
  return ageRows.map(({ race, sex, population, cause, deaths, crudeRate, ageAdjustedRate }) => ({
    race, sex, population, cause, deaths, crudeRate, ageAdjustedRate,
  }))
}

// --- Exported singleton ---

export const dataManager: DataManager = {
  query: queryMortality,
  countyDomain: { query: queryCounty },
  ageDomain: { query: queryAge },
  quantileDomain: { query: queryQuantile },
  populationDomain: { query: queryPopulation },
}
