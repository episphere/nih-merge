export { dataManager } from './mortality-repository'
export { ageFile, countyFile, dataAssetUrl, populationFile, quantileFile } from './assets'
export {
  buildFieldGroupMap, buildFieldNameMap, formatQuantileRange, getFieldName,
  getQuantileDetail, getQuantileDetailForYear, getQuantileDetailSync,
  loadQuantileDetails, preloadVintageAssignments,
} from './chr-repository'
export type { QuantileDetail, QuantileDetailsIndex } from './chr-repository'
