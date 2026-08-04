import { parquetReadObjects, type AsyncBuffer } from 'hyparquet'
import type {
  AgeFilters, AgeRow, CountyFilters, CountyRow, DataManager, FilterValue,
  MortalityFilters, MortalityRow, PopulationFilters, PopulationRow,
  QuantileFilters, QuantileRow,
} from '../domain/mortality'
import { ageFile, countyFile, dataAssetUrl, populationFile, quantileFile } from './assets'

const cache = new Map<string, Promise<Record<string, unknown>[]>>()

async function fetchParquetBuffer(url: string): Promise<AsyncBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed ${response.status} for ${url}`)
  const buffer = await response.arrayBuffer()
  return { byteLength: buffer.byteLength, slice(start, end) { return buffer.slice(start, end) } }
}

async function loadParquet(fileName: string): Promise<Record<string, unknown>[]> {
  const url = dataAssetUrl(fileName)
  let pending = cache.get(url)
  if (!pending) {
    pending = fetchParquetBuffer(url).then((file) => parquetReadObjects({ file })).then((rows) => {
      for (const row of rows) for (const key in row) if (typeof row[key] === 'bigint') row[key] = Number(row[key])
      return rows
    })
    cache.set(url, pending)
    pending.catch(() => cache.delete(url))
  }
  return pending
}

function matchesFilter<T extends string>(rowValue: T | 'All', filterValue: FilterValue<T> | undefined): boolean {
  if (filterValue === undefined || filterValue === 'All') return rowValue === 'All'
  if (filterValue === '*') return rowValue !== 'All'
  return Array.isArray(filterValue) ? (filterValue as string[]).includes(rowValue) : rowValue === filterValue
}

function applyFilters<TRow>(rows: Record<string, unknown>[], filters: [string, FilterValue<string> | undefined][]): TRow[] {
  return rows.filter((row) => filters.every(([field, value]) => matchesFilter(row[field] as string, value))) as TRow[]
}

async function queryCounty(filters: CountyFilters): Promise<CountyRow[]> {
  return applyFilters(await loadParquet(countyFile(filters.year)), [['cause', filters.cause], ['race', filters.race], ['sex', filters.sex], ['stateFips', filters.stateFips], ['countyFips', filters.countyFips]])
}
async function queryAge(filters: AgeFilters): Promise<AgeRow[]> {
  return applyFilters(await loadParquet(ageFile(filters.year)), [['cause', filters.cause], ['race', filters.race], ['sex', filters.sex], ['stateFips', filters.stateFips], ['ageGroup', filters.ageGroup]])
}
async function queryQuantile(filters: QuantileFilters): Promise<QuantileRow[]> {
  return applyFilters(await loadParquet(quantileFile(filters.quantileType, filters.year)), [['cause', filters.cause], ['race', filters.race], ['sex', filters.sex], ['chr_field_id', filters.chr_field_id]])
}
async function queryPopulation(filters: PopulationFilters): Promise<PopulationRow[]> {
  return applyFilters(await loadParquet(populationFile(filters.year)), [['race', filters.race], ['sex', filters.sex], ['stateFips', filters.stateFips], ['countyFips', filters.countyFips], ['ageGroup', filters.ageGroup]])
}
async function queryMortality(filters: MortalityFilters): Promise<MortalityRow[]> {
  return (await queryAge(filters)).map(({ race, sex, population, cause, deaths, crudeRate, ageAdjustedRate }) => ({ race, sex, population, cause, deaths, crudeRate, ageAdjustedRate }))
}

export const dataManager: DataManager = {
  query: queryMortality,
  countyDomain: { query: queryCounty }, ageDomain: { query: queryAge },
  quantileDomain: { query: queryQuantile }, populationDomain: { query: queryPopulation },
}
