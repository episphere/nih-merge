import type { QuantileType, Year } from '../domain/mortality'

const PRODUCTION_DATA_DIRECTORY = './data/'

/** URL for a static application dataset copied beside the compiled JavaScript. */
export function dataAssetUrl(path: string): string {
  if (import.meta.env.DEV) {
    return `${import.meta.env.BASE_URL}src/data/${path}`
  }
  return new URL(PRODUCTION_DATA_DIRECTORY + path, import.meta.url).href
}

export function countyFile(year: Year): string { return `rates/with-county/data_with-county_${year}.parquet` }
export function ageFile(year: Year): string { return `rates/with-age/data_with-age_${year}.parquet` }
export function quantileFile(quantileType: QuantileType, year: Year): string {
  return `rates/with-county-characteristics/q${quantileType}/data_by-measure-quantile_q${quantileType}_${year}.parquet`
}
export function populationFile(year: Year): string { return `rates/population/data_with-population_${year}.parquet` }
