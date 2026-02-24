import stateFipsCsv from '../../data/state-fips.csv?raw'

interface StateInfo {
  name: string
  short: string
}

export const STATE_FIPS: Record<string, StateInfo> = {}
export const ALL_STATE_FIPS: string[] = []

for (const line of stateFipsCsv.trim().split('\n').slice(1)) {
  const [name, fips, short] = line.split(',')
  STATE_FIPS[fips] = { name, short }
  ALL_STATE_FIPS.push(fips)
}

ALL_STATE_FIPS.sort((a, b) =>
  STATE_FIPS[a].name.localeCompare(STATE_FIPS[b].name),
)

/** Format a FIPS code as a state name. Returns the code itself if unknown. */
export function fipsName(fips: string): string {
  if (fips === 'Total') return 'All'
  return STATE_FIPS[fips]?.name ?? fips
}
