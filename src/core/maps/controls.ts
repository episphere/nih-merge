import type { MapStore } from 'nanostores';
import { ALL_CANCER_SITES, ALL_RACES, ALL_YEARS, type CancerSite, type Race, type Sex, type Year } from '../../domain/mortality';
import { ALL_STATE_FIPS, fipsName } from '../shared/fips';
import { USAComboBox } from '../../lib/USAComboBox';
import { DEFAULT_CARD, MAPS_MEASURE_LABELS, type Card, type CardState, type MapsMeasure, type MapsState } from './state';
import { actions, button, element, openMapDialog, selectControl } from './editorUI';
import { cardLetter, cardSource, compatibilityKey, compatibleGroups, defaultScale, MAX_MAP_DIMENSION, newId, type ScaleSettings } from './scales';
import { scaleControls } from './scaleControls';
import { CHR_FIELDS } from './chrFields';
import { chrPeriodChoices } from './chrData';
import { causeSexRule } from '../shared/state/rules';

/** A creation workflow reveals sections in place. Editing/cloning starts with all sections open. */
export function openCardEditor(index: number, store: MapStore<MapsState>, update: (change: Partial<MapsState>) => void, clone = false): void {
  const state = store.get();
  const original = state.cards[index];
  const originalId = original?.id;
  const existing = !!original?.state && !original.blank;
  const draft: CardState = { ...(existing ? original.state! : DEFAULT_CARD) };
  draft.source ??= draft.measure === 'population' ? 'population' : 'mortality';
  draft.measure ??= 'ageAdjustedRate'; draft.chrField ??= 'v009'; draft.chrVintage ??= 'auto';
  let stage = existing ? 4 : 1;
  let selectedSource = existing;
  let selectedGroup = original?.scaleId ?? 'independent';
  let localScale = original?.scaleId ? { ...state.scales[original.scaleId] } : defaultScale(draft.source);
  let recommendChrPeriod = !existing || cardSource(draft) !== 'chr';
  let chrPeriodReady = false;
  const overlay = openMapDialog(clone ? `Clone map ${cardLetter(index)}` : existing ? `Edit map ${cardLetter(index)}` : `Create map ${cardLetter(index)}`);
  const root = overlay.contentEl;
  root.append(element('p', 'map-editor__intro', clone
    ? 'Start with this map’s configuration. Make any changes, then create a new map.'
    : 'Choose what to map, where to show it, and how its color scale is shared.'));

  const sections = [1, 2, 3, 4].map((n) => {
    const section = element('section', 'map-editor__step');
    const heading = element('h3', 'map-editor__step-title');
    heading.append(element('span', 'map-editor__step-number', String(n)), document.createTextNode(['Data source', 'Measure and time', 'Geography and population', 'Color scale'][n - 1]));
    section.append(heading); root.append(section); return section;
  });
  const sources = element('div', 'map-editor__sources'); sections[0].append(sources);
  const sourceButtons: HTMLButtonElement[] = [];
  for (const [source, label, icon] of [
    ['mortality', 'Cancer mortality', 'fa-chart-line'], ['chr', 'County characteristics', 'fa-layer-group'], ['population', 'Population', 'fa-users'],
  ] as const) {
    const btn = button(label, () => {
      const was = cardSource(draft);
      draft.source = source;
      if (source === 'population') draft.measure = 'population';
      else if (draft.measure === 'population') draft.measure = 'ageAdjustedRate';
      if (source === 'chr') { draft.spatialLevel = 'county'; draft.cause = 'All'; draft.sex = 'All'; draft.race = 'All'; }
      if (source === 'chr' && was !== source) recommendChrPeriod = true;
      selectedSource = true;
      if (was !== source || !existing) { localScale = defaultScale(source); selectedGroup = suggestGroup(); }
      stage = Math.max(stage, 2); refresh();
    }, true);
    const glyph = element('i', `fa-solid ${icon}`); glyph.setAttribute('aria-hidden', 'true'); btn.prepend(glyph);
    btn.dataset.source = source; sourceButtons.push(btn); sources.append(btn);
  }

  function searchable(control: ReturnType<typeof selectControl>, parent: HTMLElement, combos: USAComboBox[]) {
    const wrapper = element('div', 'usa-combo-box');
    control.select.replaceWith(wrapper); wrapper.append(control.select);
    parent.append(control.group);
    const combo = USAComboBox.create(wrapper, { portal: true }); combos.push(combo);
    return { combo, wrapper };
  }
  let combos: USAComboBox[] = [];
  overlay.onClose(() => { combos.forEach(combo => combo.unregister()); combos = []; });
  let metadataVersion = 0;
  overlay.onClose(() => { metadataVersion++; });
  let controls: ReturnType<typeof scaleControls>;
  const error = element('p', 'map-editor__error'); error.setAttribute('role', 'alert');
  const footer = actions(() => overlay.close(), save, clone || !existing ? 'Create map' : 'Apply changes');
  const saveButton = footer.querySelector<HTMLButtonElement>('button:last-child')!;
  root.append(error, footer);

  function suggestGroup(): string {
    const groups = compatibleGroups(store.get(), draft, clone ? undefined : originalId);
    return groups.length === 1 ? groups[0].id : 'independent';
  }
  function reveal(next: number) {
    stage = next; refresh();
    requestAnimationFrame(() => {
      sections[next - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      sections[next - 1].querySelector<HTMLElement>('input:not([type="hidden"]), select, button')?.focus();
    });
  }
  function changedMeasure(previous: string) {
    if (compatibilityKey(draft) !== previous) { localScale = defaultScale(draft.source); selectedGroup = suggestGroup(); }
    refresh();
  }
  function retainScaleDraft() { if (controls) localScale = controls.read(); }
  function refresh() {
    const version = ++metadataVersion;
    chrPeriodReady = false;
    combos.forEach(combo => combo.unregister()); combos = [];
    sections.forEach((section, i) => { section.hidden = i + 1 > stage; if (i > 0) while (section.children.length > 1) section.lastChild!.remove(); });
    sourceButtons.forEach(btn => { btn.classList.toggle('is-selected', selectedSource && btn.dataset.source === draft.source); btn.setAttribute('aria-pressed', String(selectedSource && btn.dataset.source === draft.source)); });
    footer.hidden = stage < 4;
    if (!selectedSource) return;
    const source = cardSource(draft);
    saveButton.disabled = source === 'chr';
    let continueButton: HTMLButtonElement | undefined;
    const measure = source === 'chr'
      ? selectControl('County characteristic', [], draft.chrField!)
      : selectControl('Measure', Object.entries(MAPS_MEASURE_LABELS).filter(([id]) => source === 'population' ? id === 'population' : id !== 'population'), draft.measure!);
    if (source === 'chr') {
      for (const category of [...new Set(CHR_FIELDS.map(field => field.category))]) {
        const group = element('optgroup'); group.label = category;
        CHR_FIELDS.filter(field => field.category === category).forEach(field => group.append(new Option(`${field.name} (${field.unit})`, field.id)));
        measure.select.append(group);
      }
      measure.select.value = draft.chrField!;
    }
    const measureCombo = searchable(measure, sections[1], combos);
    measureCombo.wrapper.addEventListener('usa-combo-box:selected', () => {
      const next = measureCombo.combo.getValue(); if (!next) return;
      const previous = compatibilityKey(draft); retainScaleDraft();
      if (source === 'chr') {
        if (draft.chrField !== next) recommendChrPeriod = true;
        draft.chrField = next as CardState['chrField'];
      } else draft.measure = next as MapsMeasure;
      changedMeasure(previous);
    });
    if (source === 'chr') {
      const period = selectControl('Data years', [], '');
      period.select.disabled = true;
      const resolved = element('p', 'map-editor__notice', 'Loading available data years…'); resolved.setAttribute('aria-live', 'polite');
      const sourceNote = element('p', 'map-editor__hint');
      sections[1].append(period.group, resolved, sourceNote);
      const comparisonCards = store.get().cards.filter(card => clone || card.id !== originalId);
      void chrPeriodChoices(draft.chrField!, comparisonCards, recommendChrPeriod ? undefined : { ...draft }).then(selection => {
        if (version !== metadataVersion || !period.select.isConnected) return;
        // The option labels expose measurement years; the underlying release remains provenance only.
        selection.options.forEach(detail => period.select.add(new Option(detail.dataYears, detail.chrVintage)));
        period.select.value = selection.selected.chrVintage;
        draft.chrVintage = selection.selected.chrVintage;
        recommendChrPeriod = false;
        chrPeriodReady = true;
        period.select.disabled = false;
        saveButton.disabled = false;
        if (continueButton) continueButton.disabled = false;
        resolved.textContent = selection.recommended
          ? `Recommended data years: ${selection.recommended.dataYears}, based on the earliest mortality year on this dashboard (${selection.referenceYear}).`
          : `Latest available data: ${selection.options[0].dataYears}.`;
        const describeSource = () => {
          const selected = selection.options.find(detail => detail.chrVintage === period.select.value)!;
          sourceNote.textContent = `Source: ${selected.source}. Values describe the county population, independently of mortality filters.`;
        };
        describeSource();
        period.select.addEventListener('change', () => { draft.chrVintage = period.select.value; describeSource(); });
      }).catch(reason => {
        if (version !== metadataVersion || !resolved.isConnected) return;
        resolved.textContent = reason instanceof Error ? reason.message : 'Data years could not be loaded.';
        sections[1].append(button('Retry data years', () => { retainScaleDraft(); refresh(); }, true));
      });
    } else {
      const year = selectControl(source === 'population' ? 'Year' : 'Mortality year', ALL_YEARS.map(y => [y, y]), draft.year);
      sections[1].append(year.group);
      year.select.addEventListener('change', () => { retainScaleDraft(); draft.year = year.select.value as Year; refresh(); });
    }
    if (stage === 2) {
      continueButton = button('Continue to geography', () => reveal(3));
      continueButton.disabled = source === 'chr' && !chrPeriodReady;
      sections[1].append(continueButton);
    }
    if (stage < 3) return;
    const geo = selectControl('Geographic extent', [['All', 'United States'], ...ALL_STATE_FIPS.map(fips => [fips, fipsName(fips)] as const)], draft.stateFips);
    const geoCombo = searchable(geo, sections[2], combos);
    geoCombo.wrapper.addEventListener('usa-combo-box:selected', () => { const v = geoCombo.combo.getValue(); if (v) draft.stateFips = v; });
    if (source === 'chr') {
      draft.spatialLevel = 'county';
      sections[2].append(element('p', 'map-editor__hint', 'Choosing a state displays its counties.'));
    } else {
      const level = selectControl('Aggregation level', [['county', 'Counties'], ['state', 'States']], draft.spatialLevel);
      sections[2].append(level.group);
      level.select.addEventListener('change', () => {
        retainScaleDraft(); const previous = compatibilityKey(draft); draft.spatialLevel = level.select.value as CardState['spatialLevel'];
        if (draft.spatialLevel === 'county' && draft.race === 'American Indian or Alaska Native') draft.race = 'All';
        changedMeasure(previous);
      });
      if (source === 'mortality') {
        const cause = selectControl('Cancer site', [['All', 'All cancers'], ...ALL_CANCER_SITES.map(c => [c, c] as const)], draft.cause);
        const causeCombo = searchable(cause, sections[2], combos);
        causeCombo.wrapper.addEventListener('usa-combo-box:selected', () => {
          const value = causeCombo.combo.getValue(); if (!value) return;
          retainScaleDraft();
          const prev = { cause: draft.cause, sex: draft.sex, sexOptions: ['All', 'Male', 'Female'] as (Sex | 'All')[] };
          const next = { ...prev, cause: value as CancerSite | 'All' };
          causeSexRule(next, prev, { cause: next.cause }); draft.cause = next.cause; draft.sex = next.sex; refresh();
        });
      }
      const proxy = { cause: draft.cause, sex: draft.sex, sexOptions: ['All', 'Male', 'Female'] as (Sex | 'All')[] };
      causeSexRule(proxy, proxy, {}); draft.sex = proxy.sex;
      const sex = selectControl('Sex', proxy.sexOptions.map(s => [s, s === 'All' ? 'All sexes' : s]), draft.sex);
      const races = ALL_RACES.filter(r => draft.spatialLevel === 'state' || r !== 'American Indian or Alaska Native');
      const race = selectControl('Race / ethnicity', [['All', 'All races / ethnicities'], ...races.map(r => [r, r] as const)], draft.race);
      sections[2].append(sex.group, race.group);
      sex.select.addEventListener('change', () => { draft.sex = sex.select.value as Sex | 'All'; });
      race.select.addEventListener('change', () => { draft.race = race.select.value as Race | 'All'; });
    }
    if (stage === 3) sections[2].append(button('Continue to color scale', () => { selectedGroup = suggestGroup(); reveal(4); }));
    if (stage < 4) return;
    const groups = compatibleGroups(store.get(), draft, clone ? undefined : originalId);
    if (!groups.some(g => g.id === selectedGroup)) selectedGroup = 'independent';
    const sharing = selectControl('Scale sharing', [['independent', 'Independent'], ...groups.map(g => [g.id, `Share with ${g.indices.map(cardLetter).join(', ')}`] as const)], selectedGroup);
    sharing.group.hidden = sharing.select.options.length < 2;
    const host = element('div'); const note = element('p', 'map-editor__notice');
    const renderScale = () => {
      const shared = selectedGroup !== 'independent';
      const settings = shared ? store.get().scales[selectedGroup] : localScale;
      controls = scaleControls(settings); host.replaceChildren(controls.root);
      // Shared settings are edited through the legend after creation, never as a side effect of adding a map.
      for (const input of host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) input.disabled = shared;
      const group = groups.find(g => g.id === selectedGroup);
      note.textContent = group ? `Uses the scale shared with ${group.indices.map(cardLetter).join(', ')}. Adding this map may change automatic bounds. Edit shared colors from any member’s legend after saving.`
        : 'This map will have its own color scale. You can link it to compatible maps later.';
    };
    sharing.select.addEventListener('change', () => {
      if (selectedGroup === 'independent') localScale = controls.read();
      else localScale = { ...store.get().scales[selectedGroup] };
      selectedGroup = sharing.select.value; renderScale();
    });
    sections[3].append(sharing.group, note, host); renderScale();
  }

  function save() {
    if (cardSource(draft) === 'chr' && !chrPeriodReady) { error.textContent = 'Choose available data years before saving this map.'; return; }
    if (selectedGroup === 'independent' && !controls.valid()) { error.textContent = 'Check the scale bounds and sensitivity values.'; return; }
    const current = store.get();
    const cardState = { ...draft };
    if (cardState.source === 'population') cardState.cause = 'All';
    if (cardState.source === 'chr') { cardState.cause = 'All'; cardState.race = 'All'; cardState.sex = 'All'; cardState.spatialLevel = 'county'; }
    else { delete cardState.chrField; delete cardState.chrVintage; }
    const scaleId = selectedGroup === 'independent' ? newId() : selectedGroup;
    const settings: ScaleSettings = selectedGroup === 'independent' ? controls.read() : current.scales[scaleId];
    if (!settings) { error.textContent = 'The selected shared scale is no longer available.'; return; }
    let cards: Card[] = current.cards.map(card => ({ ...card }));
    let nRows = current.nRows;
    const replacement: Partial<Card> = { blank: false, state: cardState, scaleId,
      legendMode: existing ? original.legendMode : 'full' };
    if (clone) {
      let target = cards.findIndex(card => card.blank);
      if (target < 0) {
        if (nRows >= MAX_MAP_DIMENSION) { error.textContent = 'This grid is full. Clear a map position or add a column before cloning.'; return; }
        nRows++;
        for (let x = 1; x <= current.nCols; x++) cards.push({ id: newId(), x, y: nRows, blank: true, state: null });
        target = cards.length - current.nCols;
      }
      cards[target] = { ...cards[target], ...replacement, id: newId() };
    } else {
      const target = cards.findIndex(card => card.id === originalId);
      if (target < 0) { error.textContent = 'This map position is no longer available.'; return; }
      cards[target] = { ...cards[target], ...replacement };
    }
    update({ cards, nRows, scales: { ...current.scales, [scaleId]: { ...settings } } });
    overlay.close();
  }
  refresh();
}
