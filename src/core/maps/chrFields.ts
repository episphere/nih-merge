import type { FieldId } from '../../domain/mortality';

export interface ChrField { id: FieldId; name: string; category: string; unit: string; multiplier: number; digits: number }

// Explicit source-unit conversions; small provider rates must not be inferred as percentages.
// CHR methods: https://www.countyhealthrankings.org/sites/default/files/media/document/Trends%20documentation%202024.pdf
export const CHR_FIELDS: ChrField[] = [
  {"id": "v132", "name": "Access to Exercise Opportunities", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v011", "name": "Adult Obesity", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v009", "name": "Adult Smoking", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v125", "name": "Air Pollution - Particulate Matter", "category": "Physical Environment", "unit": "µg/m³", "multiplier": 1, "digits": 1},
  {"id": "v024", "name": "Children in Poverty", "category": "Social & Economic Factors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v060", "name": "Diabetes Prevalence", "category": "Health Outcomes", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v049", "name": "Excessive Drinking", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v133", "name": "Food Environment Index", "category": "Health Behaviors", "unit": "index (0–10)", "multiplier": 1, "digits": 1},
  {"id": "v139", "name": "Food Insecurity", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v021", "name": "High School Graduation", "category": "Social & Economic Factors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v153", "name": "Homeownership", "category": "Physical Environment", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v044", "name": "Income Inequality", "category": "Social & Economic Factors", "unit": "ratio", "multiplier": 1, "digits": 2},
  {"id": "v143", "name": "Insufficient Sleep", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v083", "name": "Limited Access to Healthy Foods", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v050", "name": "Mammography Screening", "category": "Clinical Care", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v063", "name": "Median Household Income", "category": "Social & Economic Factors", "unit": "USD", "multiplier": 1, "digits": 0},
  {"id": "v055", "name": "% American Indian & Alaska Native", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v081", "name": "% Asian", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v056", "name": "% Hispanic", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v080", "name": "% Native Hawaiian/Other Pacific Islander", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v054", "name": "% Non-Hispanic Black", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v126", "name": "% Non-Hispanic White", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v058", "name": "% Rural", "category": "Demographics", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v070", "name": "Physical Inactivity", "category": "Health Behaviors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v042", "name": "Poor Mental Health Days", "category": "Health Outcomes", "unit": "days", "multiplier": 1, "digits": 1},
  {"id": "v002", "name": "Poor or Fair Health", "category": "Health Outcomes", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v036", "name": "Poor Physical Health Days", "category": "Health Outcomes", "unit": "days", "multiplier": 1, "digits": 1},
  {"id": "v004", "name": "Primary Care Physicians", "category": "Clinical Care", "unit": "per 100,000 residents", "multiplier": 100000, "digits": 1},
  {"id": "v154", "name": "Severe Housing Cost Burden", "category": "Physical Environment", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v136", "name": "Severe Housing Problems", "category": "Physical Environment", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v045", "name": "Sexually Transmitted Infections", "category": "Health Behaviors", "unit": "per 100,000", "multiplier": 1, "digits": 1},
  {"id": "v140", "name": "Social Associations", "category": "Social & Economic Factors", "unit": "per 10,000", "multiplier": 1, "digits": 1},
  {"id": "v069", "name": "Some College", "category": "Social & Economic Factors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v156", "name": "Traffic Volume", "category": "Physical Environment", "unit": "vehicles per meter", "multiplier": 1, "digits": 1},
  {"id": "v023", "name": "Unemployment", "category": "Social & Economic Factors", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v085", "name": "Uninsured", "category": "Clinical Care", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v003", "name": "Uninsured Adults", "category": "Clinical Care", "unit": "%", "multiplier": 100, "digits": 1},
  {"id": "v122", "name": "Uninsured Children", "category": "Clinical Care", "unit": "%", "multiplier": 100, "digits": 1},
];

export function chrField(id: string = 'v009'): ChrField {
  return CHR_FIELDS.find(field => field.id === id) ?? CHR_FIELDS.find(field => field.id === 'v009')!;
}
