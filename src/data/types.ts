// --- Field value types ---
// Arrays are the source of truth; types are derived from them.

export const ALL_RACES = [
  "White",
  "Black or African American",
  "Asian",
  "Hispanic",
  "American Indian or Alaska Native",
  "Native Hawaiian or Other Pacific Islander",
  "More than one race",
] as const;
export type Race = (typeof ALL_RACES)[number];

export const ALL_SEXES = ["Male", "Female"] as const;
export type Sex = (typeof ALL_SEXES)[number];

export const ALL_CANCER_SITES = [
  "Breast",
  "Brain and Other Nervous System",
  "Cervix Uteri",
  "Colon and Rectum",
  "Corpus and Uterus",
  "Esophagus",
  "Eye and Orbit",
  "Intrahepatic Bile Duct",
  "Kidney and Renal Pelvis",
  "Liver",
  "Lung and Bronchus",
  "Lymphocytic Leukemia",
  "Melanoma of the Skin",
  "Myeloid and Monocytic Leukemia",
  "Myeloma",
  "Non-Hodgkin Lymphoma",
  "Non-Melanoma Skin",
  "Oral Cavity and Pharynx",
  "Other",
  "Ovary",
  "Pancreas",
  "Prostate",
  "Soft Tissue including Heart",
  "Stomach",
  "Thyroid",
  "Urinary Bladder",
] as const;
export type CancerSite = (typeof ALL_CANCER_SITES)[number];

export const ALL_AGE_GROUPS = [
  "0-4", "5-14", "15-24", "25-34", "35-44",
  "45-54", "55-64", "65-74", "75-84", "85+",
] as const;
export type AgeGroup = (typeof ALL_AGE_GROUPS)[number];

export const ALL_YEARS = [
  "2018", "2019", "2020", "2021", "2022", "2018-2022",
] as const;
export type Year = (typeof ALL_YEARS)[number];

export const ALL_QUANTILE_TYPES = ["3", "4", "5", "10"] as const;
export type QuantileType = (typeof ALL_QUANTILE_TYPES)[number];

export const ALL_FIELD_IDS = [
  "v002", "v003", "v004", "v009", "v011", "v021", "v023", "v024",
  "v036", "v042", "v044", "v045", "v049", "v050", "v054", "v055",
  "v056", "v058", "v060", "v063", "v069", "v070", "v080", "v081",
  "v083", "v085", "v122", "v125", "v126", "v132", "v133", "v136",
  "v139", "v140", "v143", "v153", "v154", "v156",
] as const;
export type FieldId = (typeof ALL_FIELD_IDS)[number];

// --- Filter helpers ---

/** A filter value can be a specific value, an array of values, or "*" for all non-All values. */
export type FilterValue<T extends string> = T | "All" | "*" | T[];

// --- Row types ---

export interface BaseRow {
  race: Race | "All";
  sex: Sex | "All";
  population: number;
}

export interface MortalityRow extends BaseRow {
  cause: CancerSite | "All";
  deaths: number;
  crudeRate: number;
  ageAdjustedRate: number;
}

export interface CountyRow extends MortalityRow {
  stateFips: string;
  countyFips: string;
}

export interface AgeRow extends MortalityRow {
  stateFips: string;
  ageGroup: AgeGroup | "All";
}

export interface QuantileRow extends MortalityRow {
  field_id: FieldId;
  quantile_bin: number;
}

export interface PopulationRow extends BaseRow {
  stateFips: string;
  countyFips: string;
  ageGroup: AgeGroup | "All";
}

// --- Filter types ---

export interface BaseFilters {
  year: Year;
  race?: FilterValue<Race>;
  sex?: FilterValue<Sex>;
}

export interface MortalityFilters extends BaseFilters {
  cause?: FilterValue<CancerSite>;
}

export interface CountyFilters extends MortalityFilters {
  stateFips?: FilterValue<string>;
  countyFips?: FilterValue<string>;
}

export interface AgeFilters extends MortalityFilters {
  stateFips?: FilterValue<string>;
  ageGroup?: FilterValue<AgeGroup>;
}

export interface QuantileFilters extends MortalityFilters {
  field_id?: FilterValue<FieldId>;
  quantileType: QuantileType;
  year: Year;
}

export interface PopulationFilters extends BaseFilters {
  stateFips?: FilterValue<string>;
  countyFips?: FilterValue<string>;
  ageGroup?: FilterValue<AgeGroup>;
}

// --- Domain interface ---

export interface DataDomain<TFilters, TRow> {
  query(filters: TFilters): Promise<TRow[]>;
}

// --- Data manager interface ---

export interface DataManager {
  /** Generic mortality query using only shared mortality dimensions. */
  query(filters: MortalityFilters): Promise<MortalityRow[]>;

  /** County-level geographic data (countyFips, stateFips). */
  countyDomain: DataDomain<CountyFilters, CountyRow>;

  /** Age-stratified data (ageGroup, stateFips). */
  ageDomain: DataDomain<AgeFilters, AgeRow>;

  /** County-measure quantile data (fieldId, quantileBin). */
  quantileDomain: DataDomain<QuantileFilters, QuantileRow>;

  /** Population data — no cause dimension, unsuppressed. */
  populationDomain: DataDomain<PopulationFilters, PopulationRow>;
}
