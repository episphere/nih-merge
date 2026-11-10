import * as d3 from 'd3';
import { COLOR_SCHEMES, getSchemeReverse, type ScaleSettings } from './scales';
import { element, selectControl } from './editorUI';

export function paletteGradient(settings: ScaleSettings): string {
  const interpolate = (d3 as unknown as Record<string, (t: number) => string>)[`interpolate${settings.colorScheme}`] ?? d3.interpolateBlues;
  const reverse = getSchemeReverse(settings.colorScheme) !== settings.colorReverse;
  return `linear-gradient(to right, ${Array.from({ length: 12 }, (_, i) => interpolate(reverse ? 1 - i / 11 : i / 11)).join(', ')})`;
}

/** All changes stay in the editor draft until Apply. */
export function scaleControls(initial: ScaleSettings, onChange?: (settings: ScaleSettings) => void) {
  const settings = { ...initial };
  const root = element('div', 'scale-controls');
  const scheme = selectControl('Color scheme', COLOR_SCHEMES.map(([id, name]) => [id, name]), settings.colorScheme);
  const preview = element('div', 'scale-controls__preview');
  preview.setAttribute('aria-hidden', 'true');
  const endpoints = element('div', 'scale-controls__endpoints');
  endpoints.append(element('span', '', 'Low'), element('span', '', 'High'));
  const refresh = () => { preview.style.background = paletteGradient(settings); onChange?.({ ...settings }); };
  scheme.select.addEventListener('change', () => { settings.colorScheme = scheme.select.value; refresh(); });
  root.append(scheme.group, preview, endpoints);

  function checkbox(key: 'colorReverse' | 'colorCenterMean' | 'colorExcludeExtremes' | 'stripedExtremes' | 'showZeroValues', label: string, parent: HTMLElement) {
    const wrapper = element('label', 'map-editor__check');
    const input = element('input'); input.type = 'checkbox'; input.checked = settings[key];
    wrapper.append(input, document.createTextNode(label)); parent.append(wrapper);
    input.addEventListener('change', () => { settings[key] = input.checked; refresh(); });
    return input;
  }
  checkbox('colorReverse', 'Reverse colors', root);
  const advanced = element('details', 'map-editor__advanced');
  advanced.append(element('summary', '', 'Range and advanced settings'));
  const bounds = element('div', 'map-editor__columns');
  const inputs: HTMLInputElement[] = [];
  for (const [key, label] of [['domainMin', 'Minimum'], ['domainMax', 'Maximum']] as const) {
    const group = element('label', 'usa-label', label);
    const input = element('input', 'usa-input'); input.type = 'number'; input.step = 'any'; input.placeholder = 'Automatic';
    input.value = settings[key] == null ? '' : String(settings[key]);
    input.addEventListener('input', () => { settings[key] = input.value.trim() ? Number(input.value) : null; refresh(); });
    group.append(input); bounds.append(group); inputs.push(input);
  }
  advanced.append(bounds, element('p', 'map-editor__hint', 'Automatic ranges use the displayed observations across maps sharing this scale. Leave bounds empty for automatic.'));
  const center = checkbox('colorCenterMean', 'Center on the unweighted geographic mean', advanced);
  const diverging = new Set(['RdYlBu', 'RdYlGn', 'RdBu', 'PiYG', 'PRGn', 'BrBG', 'Spectral']);
  const syncCenter = () => {
    center.closest('label')!.hidden = !diverging.has(settings.colorScheme);
    if (!diverging.has(settings.colorScheme)) { settings.colorCenterMean = false; center.checked = false; }
  };
  scheme.select.addEventListener('change', syncCenter); syncCenter();
  const exclude = checkbox('colorExcludeExtremes', 'Exclude extreme values from the main ramp', advanced);
  const extremeOptions = element('div', 'scale-controls__extremes');
  const sensitivity = selectControl('Extreme-value sensitivity', [
    ['conservative', 'Conservative'], ['balanced', 'Balanced'], ['aggressive', 'Aggressive'], ['custom', 'Custom'],
  ], settings.extremeValueSensitivity);
  const gammaGroup = element('label', 'usa-label', 'Custom sensitivity (γ)');
  const gamma = element('input', 'usa-input'); gamma.type = 'number'; gamma.min = '0'; gamma.max = '2'; gamma.step = '0.01'; gamma.value = String(settings.gamma);
  gammaGroup.append(gamma); extremeOptions.append(sensitivity.group, gammaGroup);
  checkbox('stripedExtremes', 'Stripe values outside the range', extremeOptions);
  const syncExtreme = () => {
    extremeOptions.hidden = !settings.colorExcludeExtremes;
    gammaGroup.hidden = settings.extremeValueSensitivity !== 'custom';
  };
  sensitivity.select.addEventListener('change', () => {
    settings.extremeValueSensitivity = sensitivity.select.value as ScaleSettings['extremeValueSensitivity']; syncExtreme(); refresh();
  });
  gamma.addEventListener('input', () => { settings.gamma = Number(gamma.value); refresh(); });
  exclude.addEventListener('change', syncExtreme); syncExtreme();
  advanced.append(extremeOptions);
  checkbox('showZeroValues', 'Show zero values', advanced);
  root.append(advanced); refresh();
  return {
    root,
    read: (): ScaleSettings => ({ ...settings }),
    valid: () => {
      const valid = inputs.every(input => input.validity.valid) && gamma.validity.valid
        && (settings.domainMin == null || settings.domainMax == null || settings.domainMin < settings.domainMax);
      if (!valid) { advanced.open = true; inputs[1].focus(); }
      return valid;
    },
  };
}
