import stateFipsCsv from '../data/geography/reference/state-fips.csv?raw'
import { dataAssetUrl } from './assets'

export { stateFipsCsv }
export const geographyUrl = (fileName: 'states.geojson' | 'counties.geojson' | 'nation.geojson') =>
  dataAssetUrl(`geography/${fileName}`)
