import type { MapStore } from 'nanostores';
import type { DemographicsState } from './state';
import { USAComboBox } from '../../lib/USAComboBox';
import { MEASURE_STYLE, COMPARISON_FIELD_LABEL } from '../shared/visual';
import { fipsName } from '../shared/fips';

// --- Label formatting ---

function formatLabel(key: string, value: string): string {
  if (value === 'All') return 'All';
  if (value === 'none') return 'None';

  if (key === 'compareBar' || key === 'compareFacet') {
    return COMPARISON_FIELD_LABEL[value] ?? value;
  }

  if (key === 'measure') {
    return MEASURE_STYLE[value as keyof typeof MEASURE_STYLE]?.label ?? value;
  }

  if (key === 'stateFips') {
    return fipsName(value);
  }

  return value;
}

// --- Control binding config ---

interface ControlConfig {
  id: string;
  stateKey: keyof DemographicsState;
  optionsKey: keyof DemographicsState;
  comboBoxId?: string;  // if set, this control is a USAComboBox
}

const CONTROLS: ControlConfig[] = [
  { id: 'select-compare-bar',   stateKey: 'compareBar',   optionsKey: 'compareBarOptions' },
  { id: 'select-compare-facet', stateKey: 'compareFacet', optionsKey: 'compareFacetOptions' },
  { id: 'select-select-year',   stateKey: 'year',         optionsKey: 'yearOptions' },
  { id: 'select-select-state',  stateKey: 'stateFips',    optionsKey: 'stateFipsOptions', comboBoxId: 'combo-select-state' },
  { id: 'select-select-cause',  stateKey: 'cause',        optionsKey: 'causeOptions',     comboBoxId: 'combo-select-cause' },
  { id: 'select-select-sex',    stateKey: 'sex',          optionsKey: 'sexOptions' },
  { id: 'select-select-race',   stateKey: 'race',         optionsKey: 'raceOptions' },
  { id: 'select-select-age',    stateKey: 'ageGroup',     optionsKey: 'ageGroupOptions' },
  { id: 'select-measure',       stateKey: 'measure',      optionsKey: 'measureOptions' },
];

// --- Helpers ---

/** Populate a <select> element with <option> elements. Returns true if options changed. */
function populateSelect(selectEl: HTMLSelectElement, options: string[], stateKey: string): boolean {
  const current = Array.from(selectEl.options).map(o => o.value);
  const changed = options.length !== current.length || options.some((v, i) => v !== current[i]);
  if (!changed) return false;

  selectEl.innerHTML = '';
  for (const value of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = formatLabel(stateKey, value);
    selectEl.appendChild(opt);
  }
  return true;
}

// --- Plain select binding ---

function bindSelect(
  selectEl: HTMLSelectElement,
  config: ControlConfig,
  $state: MapStore<DemographicsState>,
  update: (change: Partial<DemographicsState>) => void,
): void {
  $state.subscribe((state) => {
    const options = state[config.optionsKey] as string[];
    const currentValue = state[config.stateKey] as string;
    const disabled = state.disabledFilters.includes(config.stateKey);

    populateSelect(selectEl, options, config.stateKey);
    selectEl.value = currentValue;
    selectEl.disabled = disabled;
  });

  selectEl.addEventListener('change', () => {
    update({ [config.stateKey]: selectEl.value } as Partial<DemographicsState>);
  });
}

// --- Combo-box select binding ---

function bindComboBox(
  selectEl: HTMLSelectElement,
  wrapperEl: HTMLElement,
  config: ControlConfig,
  $state: MapStore<DemographicsState>,
  update: (change: Partial<DemographicsState>) => void,
): void {
  let comboBox: USAComboBox | null = null;
  let syncing = false; // guard against programmatic setSelectedByValue firing the event

  $state.subscribe((state) => {
    const options = state[config.optionsKey] as string[];
    const currentValue = state[config.stateKey] as string;
    const disabled = state.disabledFilters.includes(config.stateKey);

    const optionsChanged = populateSelect(selectEl, options, config.stateKey);
    selectEl.value = currentValue;
    selectEl.disabled = disabled;

    // (Re)create combo box when options change or on first run
    if (optionsChanged || !comboBox) {
      comboBox = USAComboBox.create(wrapperEl);
    }

    syncing = true;
    comboBox.setSelectedByValue(currentValue);
    syncing = false;
  });

  // Listen for the combo box's custom selection event
  wrapperEl.addEventListener('usa-combo-box:selected', () => {
    if (syncing || !comboBox) return;
    const value = comboBox.getValue();
    if (value !== undefined) {
      update({ [config.stateKey]: value } as Partial<DemographicsState>);
    }
  });
}

// --- Plot filter checkboxes ---

function bindPlotFilter(
  containerId: string,
  filterKey: 'compareBarFilter' | 'compareFacetFilter',
  optionsKey: 'compareBarFilterOptions' | 'compareFacetFilterOptions',
  $state: MapStore<DemographicsState>,
  update: (change: Partial<DemographicsState>) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  let prevOptions: string[] = [];

  $state.subscribe((state) => {
    const options = state[optionsKey] as string[];
    const filter = state[filterKey] as Set<string> | null;

    // Rebuild checkboxes if the options list changed
    if (options.length !== prevOptions.length || options.some((v, i) => v !== prevOptions[i])) {
      prevOptions = options;
      container.innerHTML = '';

      for (const value of options) {
        const wrapper = document.createElement('div');
        wrapper.className = 'usa-checkbox';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'usa-checkbox__input';
        input.id = `${containerId}-${value}`;
        input.value = value;
        input.checked = filter === null || filter.has(value);

        input.addEventListener('change', () => {
          const currentState = $state.get();
          const currentOptions = currentState[optionsKey] as string[];
          const currentFilter = currentState[filterKey] as Set<string> | null;

          const newSet = new Set(currentFilter ?? currentOptions);
          if (input.checked) {
            newSet.add(value);
          } else {
            newSet.delete(value);
          }

          // All checked → null (no filter)
          const allChecked = currentOptions.every(v => newSet.has(v));
          update({ [filterKey]: allChecked ? null : newSet } as Partial<DemographicsState>);
        });

        const label = document.createElement('label');
        label.className = 'usa-checkbox__label';
        label.htmlFor = input.id;
        label.textContent = value;

        wrapper.appendChild(input);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
      }
    }

    // Sync checked state
    const checkboxes = container.querySelectorAll<HTMLInputElement>('.usa-checkbox__input');
    for (const cb of checkboxes) {
      cb.checked = filter === null || filter.has(cb.value);
    }
  });
}

// --- Public API ---

export function initControls(
  $state: MapStore<DemographicsState>,
  update: (change: Partial<DemographicsState>) => void,
): void {
  for (const config of CONTROLS) {
    const selectEl = document.getElementById(config.id) as HTMLSelectElement | null;
    if (!selectEl) continue;

    if (config.comboBoxId) {
      const wrapperEl = document.getElementById(config.comboBoxId);
      if (wrapperEl) {
        bindComboBox(selectEl, wrapperEl, config, $state, update);
        continue;
      }
    }

    bindSelect(selectEl, config, $state, update);
  }

  bindPlotFilter('filter-compare-bar', 'compareBarFilter', 'compareBarFilterOptions', $state, update);
  bindPlotFilter('filter-compare-facet', 'compareFacetFilter', 'compareFacetFilterOptions', $state, update);
}
