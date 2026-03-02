// --- Field value types ---
// Arrays are the source of truth; types are derived from them.

export const ALL_RACES = [
  "White",
  "Black or African American",
  "Asian",
  "Hispanic",
  "American Indian or Alaska Native",
  "Native Hawaiian or Other Pacific Islander",
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

export const ALL_COUNTY_MEASURES = [
  "access_to_exercise_opportunities",
  "adult_obesity",
  "adult_smoking",
  "air_pollution_particulate_matter",
  "children_in_poverty",
  "diabetes_prevalence",
  "excessive_drinking",
  "food_environment_index",
  "food_insecurity",
  "high_school_completion",
  "homeownership",
  "income_inequality",
  "insufficient_sleep",
  "limited_access_to_healthy_foods",
  "mammography_screening",
  "median_household_income",
  "percent_american_indian_alaska_native",
  "percent_asian",
  "percent_hispanic",
  "percent_native_hawaiian_other_pacific_islander",
  "percent_non_hispanic_black",
  "percent_non_hispanic_white",
  "percent_rural",
  "physical_inactivity",
  "poor_mental_health_days",
  "poor_or_fair_health",
  "poor_physical_health_days",
  "primary_care_physicians",
  "severe_housing_cost_burden",
  "severe_housing_problems",
  "sexually_transmitted_infections",
  "social_associations",
  "some_college",
  "traffic_volume",
  "unemployment",
  "uninsured",
  "uninsured_adults",
  "uninsured_children",
] as const;
export type CountyMeasure = (typeof ALL_COUNTY_MEASURES)[number];

// --- Filter helpers ---

/** A filter value can be a specific value, an array of values, or "*" for all non-Total values. */
export type FilterValue<T extends string> = T | "Total" | "*" | T[];

// --- Row types ---

export interface BaseRow {
  race: Race | "Total";
  sex: Sex | "Total";
  population: number;
}

export interface MortalityRow extends BaseRow {
  cause: CancerSite | "Total";
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
  ageGroup: AgeGroup | "Total";
}

export interface QuantileRow extends MortalityRow {
  countyMeasure: CountyMeasure;
  quantile: string;
}

export interface PopulationRow extends BaseRow {
  stateFips: string;
  countyFips: string;
  ageGroup: AgeGroup | "Total";
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
  countyMeasure?: FilterValue<CountyMeasure>;
  quantile?: FilterValue<string>;
  quantileType: QuantileType;
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

  /** County-measure quantile data (countyMeasure, quantile). */
  quantileDomain: DataDomain<QuantileFilters, QuantileRow>;

  /** Population data — no cause dimension, unsuppressed. */
  populationDomain: DataDomain<PopulationFilters, PopulationRow>;
}
