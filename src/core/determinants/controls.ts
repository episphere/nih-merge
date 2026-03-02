import type { MapStore } from 'nanostores';
import type { DeterminantsState } from './state';
import { USAComboBox } from '../../lib/USAComboBox';
import { DETERMINANTS_MEASURE_STYLE, COMPARISON_FIELD_LABEL, COUNTY_MEASURE_LABEL } from '../shared/visual';

// --- Label formatting ---

function formatLabel(key: string, value: string): string {
  if (value === 'Total') return 'All';
  if (value === 'none') return 'None';

  if (key === 'compareColor' || key === 'compareFacet') {
    return COMPARISON_FIELD_LABEL[value] ?? value;
  }

  if (key === 'measure') {
    return DETERMINANTS_MEASURE_STYLE[value as keyof typeof DETERMINANTS_MEASURE_STYLE]?.labelShort ?? value;
  }

  if (key === 'quantileField') {
    return COUNTY_MEASURE_LABEL[value as keyof typeof COUNTY_MEASURE_LABEL] ?? value;
  }

  return value;
}

// --- Quantile field grouping ---

/** Module-level group map, set asynchronously after quantile details load. */
let quantileFieldGroupMap: Map<string, string> | null = null;

/**
 * Call this once after loading quantile_details.json to enable grouped
 * rendering in the County Characteristic combo box.
 */
export function setQuantileFieldGroups(groupMap: Map<string, string>): void {
  quantileFieldGroupMap = groupMap;
}

// --- Control binding config ---

interface ControlConfig {
  id: string;
  stateKey: keyof DeterminantsState;
  optionsKey: keyof DeterminantsState;
  comboBoxId?: string;
  /** When true, use quantileFieldGroupMap to build <optgroup> elements. */
  grouped?: boolean;
}

const CONTROLS: ControlConfig[] = [
  { id: 'select-compare-color', stateKey: 'compareColor',   optionsKey: 'compareColorOptions' },
  { id: 'select-compare-facet', stateKey: 'compareFacet',   optionsKey: 'compareFacetOptions' },
  { id: 'select-select-cause',  stateKey: 'cause',          optionsKey: 'causeOptions',          comboBoxId: 'combo-select-cause' },
  { id: 'select-select-sex',    stateKey: 'sex',            optionsKey: 'sexOptions' },
  { id: 'select-select-race',   stateKey: 'race',           optionsKey: 'raceOptions' },
  { id: 'select-quantile-field', stateKey: 'quantileField', optionsKey: 'quantileFieldOptions', comboBoxId: 'combo-quantile-field', grouped: true },
  { id: 'select-quantile-number', stateKey: 'quantileNumber', optionsKey: 'quantileNumberOptions' },
  { id: 'select-measure',       stateKey: 'measure',        optionsKey: 'measureOptions' },
];

// --- Helpers ---

function populateSelect(
  selectEl: HTMLSelectElement,
  options: string[],
  stateKey: string,
  groupMap?: Map<string, string> | null,
): boolean {
  const current = Array.from(selectEl.options).map(o => o.value);
  const changed = options.length !== current.length || options.some((v, i) => v !== current[i]);

  // Also re-populate when groups become available but <optgroup>s aren't present yet
  const hasOptgroups = selectEl.querySelector('optgroup') !== null;
  if (!changed && !(groupMap && !hasOptgroups)) return false;

  selectEl.innerHTML = '';

  if (groupMap) {
    // Build ordered groups preserving the order options appear in
    const grouped = new Map<string, string[]>();
    const ungrouped: string[] = [];
    for (const value of options) {
      const group = groupMap.get(value);
      if (group) {
        let arr = grouped.get(group);
        if (!arr) { arr = []; grouped.set(group, arr); }
        arr.push(value);
      } else {
        ungrouped.push(value);
      }
    }

    for (const value of ungrouped) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = formatLabel(stateKey, value);
      selectEl.appendChild(opt);
    }

    for (const [groupLabel, values] of grouped) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupLabel;
      for (const value of values) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = formatLabel(stateKey, value);
        optgroup.appendChild(opt);
      }
      selectEl.appendChild(optgroup);
    }
  } else {
    for (const value of options) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = formatLabel(stateKey, value);
      selectEl.appendChild(opt);
    }
  }

  return true;
}

// --- Plain select binding ---

function bindSelect(
  selectEl: HTMLSelectElement,
  config: ControlConfig,
  $state: MapStore<DeterminantsState>,
  update: (change: Partial<DeterminantsState>) => void,
): void {
  $state.subscribe((state) => {
    const options = state[config.optionsKey] as string[];
    const currentValue = state[config.stateKey] as string;
    const disabled = state.disabledFilters.includes(config.stateKey);

    const groupMap = config.grouped ? quantileFieldGroupMap : null;
    populateSelect(selectEl, options, config.stateKey, groupMap);
    selectEl.value = currentValue;
    selectEl.disabled = disabled;
  });

  selectEl.addEventListener('change', () => {
    update({ [config.stateKey]: selectEl.value } as Partial<DeterminantsState>);
  });
}

// --- Combo-box select binding ---

function bindComboBox(
  selectEl: HTMLSelectElement,
  wrapperEl: HTMLElement,
  config: ControlConfig,
  $state: MapStore<DeterminantsState>,
  update: (change: Partial<DeterminantsState>) => void,
): void {
  let comboBox: USAComboBox | null = null;
  let syncing = false;

  $state.subscribe((state) => {
    const options = state[config.optionsKey] as string[];
    const currentValue = state[config.stateKey] as string;
    const disabled = state.disabledFilters.includes(config.stateKey);

    const groupMap = config.grouped ? quantileFieldGroupMap : null;
    const optionsChanged = populateSelect(selectEl, options, config.stateKey, groupMap);
    selectEl.value = currentValue;
    selectEl.disabled = disabled;

    if (!comboBox) {
      comboBox = USAComboBox.create(wrapperEl);
    } else if (optionsChanged) {
      comboBox.refreshOptions();
    }

    syncing = true;
    comboBox.setSelectedByValue(currentValue);
    syncing = false;
  });

  wrapperEl.addEventListener('usa-combo-box:selected', () => {
    if (syncing || !comboBox) return;
    const value = comboBox.getValue();
    if (value !== undefined) {
      update({ [config.stateKey]: value } as Partial<DeterminantsState>);
    }
  });
}

// --- Plot filter checkboxes ---

function bindPlotFilter(
  containerId: string,
  filterKey: 'compareColorFilter' | 'compareFacetFilter',
  optionsKey: 'compareColorFilterOptions' | 'compareFacetFilterOptions',
  $state: MapStore<DeterminantsState>,
  update: (change: Partial<DeterminantsState>) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  let prevOptions: string[] = [];

  $state.subscribe((state) => {
    const options = state[optionsKey] as string[];
    const filter = state[filterKey] as Set<string> | null;

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

          const allChecked = currentOptions.every(v => newSet.has(v));
          update({ [filterKey]: allChecked ? null : newSet } as Partial<DeterminantsState>);
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

    const checkboxes = container.querySelectorAll<HTMLInputElement>('.usa-checkbox__input');
    for (const cb of checkboxes) {
      cb.checked = filter === null || filter.has(cb.value);
    }
  });
}

// --- Public API ---

export function initControls(
  $state: MapStore<DeterminantsState>,
  update: (change: Partial<DeterminantsState>) => void,
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

  bindPlotFilter('filter-compare-color', 'compareColorFilter', 'compareColorFilterOptions', $state, update);
  bindPlotFilter('filter-compare-facet', 'compareFacetFilter', 'compareFacetFilterOptions', $state, update);
}
