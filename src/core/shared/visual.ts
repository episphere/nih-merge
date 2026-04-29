import type { Race, Sex } from '../../data/types';

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
  'More than one race': {
    label: 'More than\none race',
    labelShort: 'Multiracial',
    color: PALETTE.grey,
    symbol: 'diamond2',
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

// --- Characteristics measure ---

type CharacteristicsMeasure =
  | 'ageAdjustedRate'
  | 'crudeRate'
  | 'ageAdjustedRateRatioRefLow'
  | 'ageAdjustedRateRatioRefHigh'
  | 'crudeRateRatioRefLow'
  | 'crudeRateRatioRefHigh';

export const CHARACTERISTICS_MEASURE_STYLE: Record<CharacteristicsMeasure, MeasureStyle> = {
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
  ageAdjustedRateRatioRefLow: {
    label: 'AA Rate Ratio (ref: lowest quantile)',
    labelShort: 'AA RR (ref low)',
    plotLabel: 'Age-Adjusted Rate Ratio (ref: lowest quantile)',
  },
  ageAdjustedRateRatioRefHigh: {
    label: 'AA Rate Ratio (ref: highest quantile)',
    labelShort: 'AA RR (ref high)',
    plotLabel: 'Age-Adjusted Rate Ratio (ref: highest quantile)',
  },
  crudeRateRatioRefLow: {
    label: 'Crude Rate Ratio (ref: lowest quantile)',
    labelShort: 'Crude RR (ref low)',
    plotLabel: 'Crude Rate Ratio (ref: lowest quantile)',
  },
  crudeRateRatioRefHigh: {
    label: 'Crude Rate Ratio (ref: highest quantile)',
    labelShort: 'Crude RR (ref high)',
    plotLabel: 'Crude Rate Ratio (ref: highest quantile)',
  },
};

// --- Comparison field ---

export const COMPARISON_FIELD_LABEL: Record<string, string> = {
  race: 'Race/Ethnicity',
  sex: 'Sex',
  ageGroup: 'Age Group',
  cause: 'Cancer Site',
};

