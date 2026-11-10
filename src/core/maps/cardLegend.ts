import { renderColorLegendGeneric } from './colorLegend';
import type { ColorConfig } from './query';
import { MAPS_MEASURE_LABELS, type Card, type CardState, type MapsState } from './state';
import { cardLetter, cardMeasure, cardSource, scaleMembers, scaleSharingDescription, type ScaleSettings } from './scales';
import { chrField } from './chrFields';
import { element } from './editorUI';
import { createTooltip } from '../shared/tooltip';
import { paletteGradient } from './scaleControls';

type Mode = NonNullable<Card['legendMode']>;

export function measureLabel(card: CardState): string {
  if (cardSource(card) === 'chr') {
    const field = chrField(card.chrField);
    return `${field.name} (${field.unit})`;
  }
  const measure = cardMeasure(card);
  const suffix = measure === 'ageAdjustedRate' || measure === 'crudeRate' ? ' (per 100,000)' : '';
  return `${MAPS_MEASURE_LABELS[measure]}${suffix}`;
}

export function legendGraphic(container: HTMLElement, card: CardState, config: ColorConfig, settings: ScaleSettings, width: number) {
  renderColorLegendGeneric({ container, domain: config.domain, scheme: config.trimmedScheme ?? config.scheme,
    label: measureLabel(card), pivot: config.pivot, reverse: config.reverse,
    lowOutlierColor: config.lowOutlierColor || false,
    highOutlierColor: config.highOutlierColor || false,
    stripedOutliers: settings.stripedExtremes, width, height: 51, fontSize: 11,
  });
  const svg = container.querySelector('svg');
  if (svg) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${measureLabel(card)}: ${config.domain[0]} to ${config.domain[1]}`);
    svg.style.maxWidth = '100%';
  }
}

export interface LegendHandle { destroy(): void; fullSVG(): SVGSVGElement | null }

export function mountCardLegend(
  container: HTMLElement, state: MapsState, index: number, config: ColorConfig | undefined,
  onSettings: () => void, onMode: (mode: Mode) => void,
): LegendHandle {
  const card = state.cards[index];
  const settings = state.scales[card.scaleId!];
  const letter = cardLetter(index);
  const graphic = element('div', 'map-legend__graphic');
  const tools = element('div', 'map-legend__tools');
  const members = scaleMembers(state, card.scaleId!);
  const shared = element('span', 'map-legend__sharing');
  const sharingDescription = scaleSharingDescription(state, index);
  const badgeTooltip = createTooltip();
  badgeTooltip.el.classList.add('map-sharing-tooltip');
  badgeTooltip.el.id = `map-scale-sharing-${card.id}`;
  badgeTooltip.el.setAttribute('role', 'tooltip');
  badgeTooltip.contentEl.textContent = sharingDescription;
  for (const member of members) {
    const badge = element('span', 'map-card__letter', cardLetter(member));
    badge.tabIndex = 0;
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `Map ${cardLetter(member)}`);
    badge.setAttribute('aria-describedby', badgeTooltip.el.id);
    const showBadgeTooltip = () => {
      const box = badge.getBoundingClientRect();
      badgeTooltip.show(box.right, box.top);
    };
    badge.addEventListener('mouseenter', showBadgeTooltip);
    badge.addEventListener('mouseleave', () => badgeTooltip.hide());
    badge.addEventListener('focus', showBadgeTooltip);
    badge.addEventListener('blur', () => badgeTooltip.hide());
    badge.addEventListener('click', showBadgeTooltip);
    badge.addEventListener('keydown', event => { if (event.key === 'Escape') badgeTooltip.hide(); });
    shared.append(badge);
  }
  shared.setAttribute('role', 'group');
  shared.setAttribute('aria-label', sharingDescription);
  const gear = element('button', 'epi-icon-btn'); gear.type = 'button'; gear.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
  gear.title = `Edit color scale for map ${letter}`; gear.setAttribute('aria-label', gear.title); gear.addEventListener('click', onSettings);
  const toggle = element('button', 'epi-icon-btn'); toggle.type = 'button';
  const toggleIcon = element('i', 'fa-solid'); toggleIcon.setAttribute('aria-hidden', 'true'); toggle.append(toggleIcon);
  tools.append(shared, gear, toggle); container.append(graphic, tools);
  const tooltip = createTooltip(); tooltip.el.classList.add('map-legend-tooltip');
  const description = element('div', 'map-legend-tooltip__description');
  let effective: Mode = 'minimized';
  let canExpand = false;
  const cardElement = container.closest<HTMLElement>('.map-card')!;
  const minFullWidth = Math.max(310, measureLabel(card.state!).length * 5.7 + 40);
  function fullSVG() {
    if (!config) return null;
    const host = element('div');
    legendGraphic(host, card.state!, config, settings, Math.max(390, minFullWidth));
    return host.querySelector('svg');
  }
  function show(x: number, y: number) {
    if (!config) return;
    const svg = fullSVG();
    description.textContent = `${sharingDescription} ${settings.domainMin == null && settings.domainMax == null ? 'Automatic range across displayed observations.' : 'Custom range.'}`;
    tooltip.contentEl.replaceChildren(...(svg ? [svg, description] : [description]));
    tooltip.show(x, y);
  }
  function draw() {
    // The floating legend's own width is deliberately small; use the card's available width
    // and the full controls (including badges) to determine whether it can expand.
    container.dataset.mode = 'full';
    const width = Math.max(0, cardElement.clientWidth - tools.getBoundingClientRect().width - 20);
    canExpand = width >= minFullWidth;
    const preferred = card.legendMode ?? 'full';
    effective = preferred === 'full' && canExpand ? 'full' : 'minimized';
    container.dataset.mode = effective;
    const expanded = effective === 'full';
    toggleIcon.className = `fa-solid ${expanded ? 'fa-compress' : 'fa-expand'}`;
    toggle.title = `${expanded ? 'Minimize' : 'Expand'} legend for map ${letter}${!expanded && !canExpand ? ' (more space needed)' : ''}`;
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.disabled = !expanded && !canExpand;
    graphic.replaceChildren();
    if (effective === 'minimized') {
      const icon = element('button', 'map-legend__palette'); icon.type = 'button';
      const glyph = element('i', 'fa-solid fa-palette'); glyph.style.backgroundImage = paletteGradient(settings); glyph.setAttribute('aria-hidden', 'true');
      icon.append(glyph);
      icon.setAttribute('aria-label', `Show full color scale for map ${letter}`);
      icon.addEventListener('click', () => { const box = icon.getBoundingClientRect(); show(box.right, box.top); });
      icon.addEventListener('focus', () => { const box = icon.getBoundingClientRect(); show(box.right, box.top); });
      icon.addEventListener('blur', () => tooltip.hide());
      icon.addEventListener('keydown', event => { if (event.key === 'Escape') tooltip.hide(); });
      graphic.append(icon);
    } else if (config) legendGraphic(graphic, card.state!, config, settings, Math.min(580, width));
    else graphic.append(element('span', 'map-editor__hint', 'No values to scale'));
  }
  graphic.addEventListener('mousemove', event => { if (effective === 'minimized') show(event.clientX, event.clientY); });
  graphic.addEventListener('mouseleave', () => tooltip.hide());
  toggle.addEventListener('click', () => { tooltip.hide(); onMode(effective === 'full' ? 'minimized' : 'full'); });
  const observer = new ResizeObserver(draw); observer.observe(cardElement); draw();
  return { fullSVG, destroy: () => { observer.disconnect(); tooltip.destroy(); badgeTooltip.destroy(); } };
}
