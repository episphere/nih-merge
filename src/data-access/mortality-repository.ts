import type {
  AgeFilters, AgeRow, CountyFilters, CountyRow, DataManager, FilterValue,
  MortalityFilters, MortalityRow, PopulationFilters, PopulationRow,
  QuantileFilters, QuantileRow,
} from '../domain/mortality'
import { ageFile, countyFile, dataAssetUrl, populationFile, quantileFile } from './assets'
import { queryParquet } from './duckdb-parquet'

const COUNTY_COLUMNS = [
  'stateFips', 'countyFips', 'cause', 'race', 'sex',
  'deaths', 'population', 'crudeRate', 'ageAdjustedRate',
] as const
const AGE_COLUMNS = [
  'stateFips', 'cause', 'race', 'sex', 'ageGroup',
  'deaths', 'population', 'crudeRate', 'ageAdjustedRate',
] as const
const QUANTILE_COLUMNS = [
  'chr_field_id', 'quantile_bin', 'cause', 'race', 'sex',
  'deaths', 'population', 'crudeRate', 'ageAdjustedRate',
] as const
const POPULATION_COLUMNS = [
  'stateFips', 'countyFips', 'race', 'sex', 'ageGroup', 'population',
] as const

interface SqlFilter {
  column: string
  value: FilterValue<string> | undefined
}

function buildWhere(filters: SqlFilter[]): { sql: string; parameters: string[] } {
  const clauses: string[] = []
  const parameters: string[] = []

  for (const { column, value } of filters) {
    const identifier = `"${column}"`
    if (value === undefined || value === 'All') {
      clauses.push(`${identifier} = ?`)
      parameters.push('All')
    } else if (value === '*') {
      clauses.push(`${identifier} <> ?`)
      parameters.push('All')
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        clauses.push('FALSE')
      } else {
        clauses.push(`${identifier} IN (${value.map(() => '?').join(', ')})`)
        parameters.push(...value)
      }
    } else {
      clauses.push(`${identifier} = ?`)
      parameters.push(value)
    }
  }

  return { sql: clauses.join(' AND '), parameters }
}

async function queryFile<TRow>(
  fileName: string,
  columns: readonly string[],
  filters: SqlFilter[],
): Promise<TRow[]> {
  const where = buildWhere(filters)
  return queryParquet(dataAssetUrl(fileName), columns, where.sql, where.parameters) as Promise<TRow[]>
}

async function queryCounty(filters: CountyFilters): Promise<CountyRow[]> {
  return queryFile(countyFile(filters.year), COUNTY_COLUMNS, [
    { column: 'cause', value: filters.cause }, { column: 'race', value: filters.race },
    { column: 'sex', value: filters.sex }, { column: 'stateFips', value: filters.stateFips },
    { column: 'countyFips', value: filters.countyFips },
  ])
}
async function queryAge(filters: AgeFilters): Promise<AgeRow[]> {
  return queryFile(ageFile(filters.year), AGE_COLUMNS, [
    { column: 'cause', value: filters.cause }, { column: 'race', value: filters.race },
    { column: 'sex', value: filters.sex }, { column: 'stateFips', value: filters.stateFips },
    { column: 'ageGroup', value: filters.ageGroup },
  ])
}
async function queryQuantile(filters: QuantileFilters): Promise<QuantileRow[]> {
  return queryFile(quantileFile(filters.quantileType, filters.year), QUANTILE_COLUMNS, [
    { column: 'cause', value: filters.cause }, { column: 'race', value: filters.race },
    { column: 'sex', value: filters.sex }, { column: 'chr_field_id', value: filters.chr_field_id },
  ])
}
async function queryPopulation(filters: PopulationFilters): Promise<PopulationRow[]> {
  return queryFile(populationFile(filters.year), POPULATION_COLUMNS, [
    { column: 'race', value: filters.race }, { column: 'sex', value: filters.sex },
    { column: 'stateFips', value: filters.stateFips }, { column: 'countyFips', value: filters.countyFips },
    { column: 'ageGroup', value: filters.ageGroup },
  ])
}
async function queryMortality(filters: MortalityFilters): Promise<MortalityRow[]> {
  return (await queryAge(filters)).map(({ race, sex, population, cause, deaths, crudeRate, ageAdjustedRate }) => ({ race, sex, population, cause, deaths, crudeRate, ageAdjustedRate }))
}

export const dataManager: DataManager = {
  query: queryMortality,
  countyDomain: { query: queryCounty }, ageDomain: { query: queryAge },
  quantileDomain: { query: queryQuantile }, populationDomain: { query: queryPopulation },
}
