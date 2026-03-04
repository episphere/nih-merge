import type { MapStore } from 'nanostores';
import type { MapsState, CardState } from './state';
import { createOverlay, type OverlayHandle } from '../shared/overlay';
import { USAComboBox } from '../../lib/USAComboBox';
import { fipsName } from '../shared/fips';

// --- Label formatting ---

function formatLabel(key: string, value: string): string {
  if (value === 'Total') return 'All';
  if (key === 'editStateFips') return fipsName(value);
  return value;
}

// --- Control config ---

interface EditControlConfig {
  id: string;
  stateKey: keyof MapsState;
  optionsKey: keyof MapsState;
  label: string;
  comboBox?: boolean;
}

const EDIT_CONTROLS: EditControlConfig[] = [
  { id: 'edit-year', stateKey: 'editYear', optionsKey: 'editYearOptions', label: 'Year' },
  { id: 'edit-cause', stateKey: 'editCause', optionsKey: 'editCauseOptions', label: 'Cancer Site', comboBox: true },
  { id: 'edit-sex', stateKey: 'editSex', optionsKey: 'editSexOptions', label: 'Sex' },
  { id: 'edit-race', stateKey: 'editRace', optionsKey: 'editRaceOptions', label: 'Race/Ethnicity' },
  { id: 'edit-state', stateKey: 'editStateFips', optionsKey: 'editStateFipsOptions', label: 'State', comboBox: true },
  { id: 'edit-spatial', stateKey: 'editSpatialLevel', optionsKey: 'editSpatialLevel', label: 'Spatial Level' },
];

// --- Build form HTML ---

function buildForm(): HTMLElement {
  const form = document.createElement('div');

  for (const config of EDIT_CONTROLS) {
    const group = document.createElement('div');
    group.className = 'usa-form-group';

    const label = document.createElement('label');
    label.className = 'usa-label';
    label.htmlFor = config.id;
    label.textContent = config.label;
    group.appendChild(label);

    if (config.comboBox) {
      const wrapper = document.createElement('div');
      wrapper.className = 'usa-combo-box';
      wrapper.id = `combo-${config.id}`;

      const select = document.createElement('select');
      select.className = 'usa-select';
      select.id = config.id;
      select.name = config.id;

      wrapper.appendChild(select);
      group.appendChild(wrapper);
    } else {
      const select = document.createElement('select');
      select.className = 'usa-select';
      select.id = config.id;
      select.name = config.id;
      group.appendChild(select);
    }

    form.appendChild(group);
  }

  // Apply button
  const btnGroup = document.createElement('div');
  btnGroup.className = 'margin-top-2';
  const btn = document.createElement('button');
  btn.className = 'usa-button';
  btn.type = 'button';
  btn.id = 'edit-apply';
  btn.textContent = 'Apply';
  btnGroup.appendChild(btn);
  form.appendChild(btnGroup);

  return form;
}

// --- Populate select ---

function populateSelect(selectEl: HTMLSelectElement, options: string[], stateKey: string): boolean {
  const current = Array.from(selectEl.options).map((o) => o.value);
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

// --- Card editor overlay ---

let overlay: OverlayHandle | null = null;
let unsubscribes: (() => void)[] = [];

export function openCardEditor(
  cardIndex: number,
  $state: MapStore<MapsState>,
  update: (change: Partial<MapsState>) => void,
): void {
  // Clean up previous overlay
  if (overlay) {
    overlay.destroy();
    unsubscribes.forEach((fn) => fn());
    unsubscribes = [];
  }

  // Populate edit fields from the card's current state
  const state = $state.get();
  const card = state.cards[cardIndex];
  const cardState: CardState = card.state ?? {
    year: state.editYear,
    cause: state.editCause,
    sex: state.editSex,
    race: state.editRace,
    stateFips: state.editStateFips,
    spatialLevel: state.editSpatialLevel,
  };

  update({
    editingCardIndex: cardIndex,
    editYear: cardState.year,
    editCause: cardState.cause,
    editSex: cardState.sex,
    editRace: cardState.race,
    editStateFips: cardState.stateFips,
    editSpatialLevel: cardState.spatialLevel,
  });

  // Create overlay
  const overlayTitle = card.blank ? 'Add New Map' : 'Edit Map';
  overlay = createOverlay({ title: overlayTitle, maxWidth: '500px' });
  const form = buildForm();
  overlay.contentEl.appendChild(form);

  // Bind each control
  const comboBoxes = new Map<string, USAComboBox>();

  for (const config of EDIT_CONTROLS) {
    const selectEl = form.querySelector(`#${config.id}`) as HTMLSelectElement | null;
    if (!selectEl) continue;

    // Spatial level has fixed options not stored in state
    if (config.stateKey === 'editSpatialLevel') {
      selectEl.innerHTML = '';
      for (const value of ['county', 'state']) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value === 'county' ? 'County' : 'State';
        selectEl.appendChild(opt);
      }
    }

    let syncing = false;

    const unsub = $state.subscribe((s) => {
      if (config.stateKey === 'editSpatialLevel') {
        selectEl.value = s.editSpatialLevel;
        return;
      }

      const options = s[config.optionsKey] as string[];
      const currentValue = s[config.stateKey] as string;

      // Hide cause when measure is population
      if (config.stateKey === 'editCause') {
        const group = selectEl.closest('.usa-form-group') as HTMLElement | null;
        if (group) {
          group.style.display = s.measure === 'population' ? 'none' : '';
        }
      }

      const optionsChanged = populateSelect(selectEl, options, config.stateKey);
      selectEl.value = currentValue;

      if (config.comboBox) {
        const wrapperId = `combo-${config.id}`;
        const wrapperEl = form.querySelector(`#${wrapperId}`) as HTMLElement | null;
        if (wrapperEl) {
          if (optionsChanged || !comboBoxes.has(config.id)) {
            comboBoxes.set(config.id, USAComboBox.create(wrapperEl));
          }
          syncing = true;
          comboBoxes.get(config.id)!.setSelectedByValue(currentValue);
          syncing = false;
        }
      }
    });
    unsubscribes.push(unsub);

    // Listen for changes
    if (config.comboBox) {
      const wrapperId = `combo-${config.id}`;
      const wrapperEl = form.querySelector(`#${wrapperId}`) as HTMLElement | null;
      if (wrapperEl) {
        const handler = () => {
          if (syncing) return;
          const cb = comboBoxes.get(config.id);
          if (cb) {
            const value = cb.getValue();
            if (value !== undefined) {
              update({ [config.stateKey]: value } as Partial<MapsState>);
            }
          }
        };
        wrapperEl.addEventListener('usa-combo-box:selected', handler);
      }
    } else {
      selectEl.addEventListener('change', () => {
        update({ [config.stateKey]: selectEl.value } as Partial<MapsState>);
      });
    }
  }

  // Apply button
  const applyBtn = form.querySelector('#edit-apply') as HTMLButtonElement;
  applyBtn.addEventListener('click', () => {
    const s = $state.get();
    if (s.editingCardIndex == null) return;

    const newCardState: CardState = {
      year: s.editYear,
      cause: s.editCause,
      sex: s.editSex,
      race: s.editRace,
      stateFips: s.editStateFips,
      spatialLevel: s.editSpatialLevel,
    };

    const newCards = s.cards.map((c, i) => {
      if (i === s.editingCardIndex) {
        return { ...c, blank: false, state: newCardState };
      }
      return c;
    });

    update({ cards: newCards, editingCardIndex: null });
    overlay?.close();
  });

  overlay.open();
}

export function initControls(
  _$state: MapStore<MapsState>,
  _update: (change: Partial<MapsState>) => void,
): void {
  // Card editor is opened on demand via openCardEditor() — no static controls to bind here.
  // This function exists to match the standard page initialization pattern.
}
