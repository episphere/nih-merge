import type { MapStore } from 'nanostores';
import type { MapsState } from './state';
import { cardLetter, compatibleGroups, scaleMembers, scaleSharingDescription, changeScaleMembership, type ScaleSettings } from './scales';
import { actions, element, openMapDialog, selectControl } from './editorUI';
import { scaleControls } from './scaleControls';

export function openScaleEditor(index: number, store: MapStore<MapsState>, update: (change: Partial<MapsState>) => void): void {
  const state = store.get();
  const card = state.cards[index];
  if (!card.state || !card.id || !card.scaleId) return;
  const cardId = card.id;
  const overlay = openMapDialog(`Map ${cardLetter(index)} · Color scale`);
  const root = overlay.contentEl;
  const members = scaleMembers(state, card.scaleId);
  root.append(element('p', 'map-editor__intro', scaleSharingDescription(state, index)));
  const groups = compatibleGroups(state, card.state, cardId);
  const sharing = selectControl('Scale sharing', [
    ['independent', 'Independent'], ...groups.map(g => [g.id, `Share with ${g.indices.map(cardLetter).join(', ')}`] as const),
  ], members.length > 1 ? card.scaleId : 'independent');
  sharing.group.hidden = sharing.select.options.length < 2;
  root.append(sharing.group);
  const notice = element('p', 'map-editor__notice'); root.append(notice);
  const controlsHost = element('div'); root.append(controlsHost);
  let settings: ScaleSettings = { ...state.scales[card.scaleId] };
  let controls = scaleControls(settings);
  controlsHost.append(controls.root);
  const error = element('p', 'map-editor__error'); error.setAttribute('role', 'alert'); root.append(error);
  const describe = () => {
    const group = groups.find(g => g.id === sharing.select.value);
    notice.textContent = group
      ? `Changes will apply to maps ${[index, ...group.indices].sort((a,b) => a-b).map(cardLetter).join(', ')}. Joining adopts this group's settings and recalculates automatic bounds.`
      : 'Changes apply only to this map. Automatic bounds will use its own observations.';
  };
  sharing.select.addEventListener('change', () => {
    settings = sharing.select.value === 'independent' ? controls.read() : { ...state.scales[sharing.select.value] };
    controls = scaleControls(settings); controlsHost.replaceChildren(controls.root); describe();
  });
  describe();
  root.append(actions(() => overlay.close(), () => {
    if (!controls.valid()) { error.textContent = 'Enter valid bounds with the minimum below the maximum, and a sensitivity from 0 to 2.'; return; }
    const current = store.get();
    if (!current.cards.some(c => c.id === cardId)) { overlay.close(); return; }
    const target = sharing.select.value;
    if (target !== 'independent' && !current.scales[target]) { error.textContent = 'That shared scale is no longer available.'; return; }
    update(changeScaleMembership(current, cardId, target, controls.read()));
    overlay.close();
  }, 'Apply scale'));
}
