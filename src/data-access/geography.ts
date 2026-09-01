import stateFipsCsv from '../data/geography/reference/state-fips.csv?raw'
import { dataAssetUrl } from './assets'

export { stateFipsCsv }

export type GeographyTier = 'low' | 'medium' | 'high'

export function geographyTopologyUrl(tier: GeographyTier, stateFips?: string): string {
  if (tier === 'high') {
    if (!stateFips || stateFips === 'All') {
      throw new Error('High-detail geography requires a state FIPS code')
    }
    return dataAssetUrl(`geography/topology/high/${stateFips}.topojson`)
  }
  return dataAssetUrl(`geography/topology/${tier}.topojson`)
}

export const geographyNamesUrl = () => dataAssetUrl('geography/names.json')
