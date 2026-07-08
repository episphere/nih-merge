import { parquetReadObjects, type AsyncBuffer } from 'hyparquet'
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
  let pending = cache.get(url)
  if (!pending) {
    pending = fetchAndParse(url)
    cache.set(url, pending)
    pending.catch(() => cache.delete(url))
  }
  return pending
}

async function fetchAndParse(url: string): Promise<Record<string, unknown>[]> {
  const file = await fetchParquetBuffer(url)
  const rows = await parquetReadObjects({ file })
  // Convert BigInt values to Number (hyparquet returns int64 columns as BigInt)
  for (const row of rows) {
    for (const key in row) {
      if (typeof row[key] === 'bigint') {
        row[key] = Number(row[key])
      }
    }
  }
  return rows
}

async function fetchParquetBuffer(url: string): Promise<AsyncBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`fetch failed ${response.status} for ${url}`)
  }

  // GitHub Pages gzips .parquet responses and reports the compressed
  // Content-Length on HEAD requests. Fetching the full response gives
  // hyparquet the decompressed bytes and the correct byte length.
  const buffer = await response.arrayBuffer()
  return {
    byteLength: buffer.byteLength,
    slice(start, end) {
      return buffer.slice(start, end)
    },
  }
}

// --- Filtering ---

function matchesFilter<T extends string>(
  rowValue: T | 'All',
  filterValue: FilterValue<T> | undefined,
): boolean {
  if (filterValue === undefined || filterValue === 'All') {
    return rowValue === 'All'
  }
  if (filterValue === '*') {
    return rowValue !== 'All'
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

export function parquetUrl(fileName: string): string {
  return `${DATA_BASE_URL}${fileName}`
}

export function countyFile(year: Year): string {
  return `data_with-county_${year}.parquet`
}

export function ageFile(year: Year): string {
  return `data_with-age_${year}.parquet`
}

export function quantileFile(quantileType: string, year: Year): string {
  return `data_by-measure-quantile_q${quantileType}_${year}.parquet`
}

function populationFile(year: Year): string {
  return `data_with-population_${year}.parquet`
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
  return applyFilters<AgeRow>(rows, [
    ['cause', filters.cause],
    ['race', filters.race],
    ['sex', filters.sex],
    ['stateFips', filters.stateFips],
    ['ageGroup', filters.ageGroup],
  ])
}

async function queryQuantile(filters: QuantileFilters): Promise<QuantileRow[]> {
  const rows = await loadParquet(quantileFile(filters.quantileType, filters.year))
  return applyFilters<QuantileRow>(rows, [
    ['cause', filters.cause],
    ['race', filters.race],
    ['sex', filters.sex],
    ['field_id', filters.field_id],
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
  // Use age domain (smaller files) with geography/age defaulting to All.
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
