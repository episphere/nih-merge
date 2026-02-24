import type { Race, Sex, CountyMeasure } from '../../data/types';

// --- Palette ---

export const PALETTE = {
  orange: '#E69F00',
  teal: '#009E73',
  blue: '#0072B2',
  pink: '#CC79A7',
  skyBlue: '#56B4E9',
  red: '#D55E00',
  grey: '#999999',
} as const;

// --- Race ---

interface RaceStyle {
  label: string;
  labelShort: string;
  color: string;
  symbol: string;
}

export const RACE_STYLE: Record<Race, RaceStyle> = {
  'Hispanic': {
    label: 'Hispanic',
    labelShort: 'Hispanic',
    color: PALETTE.orange,
    symbol: 'triangle',
  },
  'American Indian or Alaska Native': {
    label: 'American Indian\nor Alaska Native',
    labelShort: 'AI/AN',
    color: PALETTE.teal,
    symbol: 'diamond',
  },
  'Black or African American': {
    label: 'Black or\nAfrican American',
    labelShort: 'Black or AA',
    color: PALETTE.blue,
    symbol: 'cross',
  },
  'Native Hawaiian or Other Pacific Islander': {
    label: 'Native Hawaiian or\nOther Pacific Islander',
    labelShort: 'NHPI',
    color: PALETTE.pink,
    symbol: 'wye',
  },
  'White': {
    label: 'White',
    labelShort: 'White',
    color: PALETTE.skyBlue,
    symbol: 'square',
  },
  'Asian': {
    label: 'Asian',
    labelShort: 'Asian',
    color: PALETTE.red,
    symbol: 'star',
  },
};

// --- Sex ---

interface SexStyle {
  label: string;
  color: string;
  symbol: string;
}

export const SEX_STYLE: Record<Sex, SexStyle> = {
  'Male': {
    label: 'Male',
    color: PALETTE.blue,
    symbol: 'square',
  },
  'Female': {
    label: 'Female',
    color: PALETTE.orange,
    symbol: 'triangle',
  },
};

// --- Measure ---

type Measure = 'crudeRate' | 'ageAdjustedRate';

interface MeasureStyle {
  label: string;
  labelShort: string;
  plotLabel: string;
}

export const MEASURE_STYLE: Record<Measure, MeasureStyle> = {
  ageAdjustedRate: {
    label: 'Age-Adjusted Cancer Mortality (per 100,000)',
    labelShort: 'AA Mortality',
    plotLabel: 'Age-Adjusted Mortality (per 100,000)',
  },
  crudeRate: {
    label: 'Crude Cancer Mortality (per 100,000)',
    labelShort: 'Crude Mortality',
    plotLabel: 'Crude Mortality (per 100,000)',
  },
};

// --- Comparison field ---

export const COMPARISON_FIELD_LABEL: Record<string, string> = {
  race: 'Race/Ethnicity',
  sex: 'Sex',
  ageGroup: 'Age Group',
  cause: 'Cancer Site',
};

// --- County measure ---

export const COUNTY_MEASURE_LABEL: Record<CountyMeasure, string> = {
  access_to_exercise_opportunities: 'Access to Exercise Opportunities',
  adult_obesity: 'Adult Obesity',
  adult_smoking: 'Adult Smoking',
  air_pollution_particulate_matter: 'Air Pollution (Particulate Matter)',
  children_in_poverty: 'Children in Poverty',
  diabetes_prevalence: 'Diabetes Prevalence',
  excessive_drinking: 'Excessive Drinking',
  food_environment_index: 'Food Environment Index',
  food_insecurity: 'Food Insecurity',
  high_school_completion: 'High School Completion',
  homeownership: 'Homeownership',
  income_inequality: 'Income Inequality',
  insufficient_sleep: 'Insufficient Sleep',
  limited_access_to_healthy_foods: 'Limited Access to Healthy Foods',
  mammography_screening: 'Mammography Screening',
  median_household_income: 'Median Household Income',
  percent_american_indian_alaska_native: '% American Indian / Alaska Native',
  percent_asian: '% Asian',
  percent_hispanic: '% Hispanic',
  percent_native_hawaiian_other_pacific_islander: '% Native Hawaiian / Other Pacific Islander',
  percent_non_hispanic_black: '% Non-Hispanic Black',
  percent_non_hispanic_white: '% Non-Hispanic White',
  percent_rural: '% Rural',
  physical_inactivity: 'Physical Inactivity',
  poor_mental_health_days: 'Poor Mental Health Days',
  poor_or_fair_health: 'Poor or Fair Health',
  poor_physical_health_days: 'Poor Physical Health Days',
  primary_care_physicians: 'Primary Care Physicians',
  severe_housing_cost_burden: 'Severe Housing Cost Burden',
  severe_housing_problems: 'Severe Housing Problems',
  sexually_transmitted_infections: 'Sexually Transmitted Infections',
  social_associations: 'Social Associations',
  some_college: 'Some College',
  traffic_volume: 'Traffic Volume',
  unemployment: 'Unemployment',
  uninsured: 'Uninsured',
  uninsured_adults: 'Uninsured Adults',
  uninsured_children: 'Uninsured Children',
};
