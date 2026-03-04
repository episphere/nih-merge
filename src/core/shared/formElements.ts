/**
 * USWDS form element factories.
 * Creates standard checkbox and select elements following the US Web Design System markup.
 */

// --- Checkbox ---

export interface CheckboxHandle {
  wrapper: HTMLElement;
  input: HTMLInputElement;
}

export function createCheckbox(id: string, labelText: string): CheckboxHandle {
  const wrapper = document.createElement('div');
  wrapper.className = 'usa-checkbox';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'usa-checkbox__input';
  input.id = id;

  const label = document.createElement('label');
  label.className = 'usa-checkbox__label';
  label.htmlFor = id;
  label.textContent = labelText;

  wrapper.appendChild(input);
  wrapper.appendChild(label);

  return { wrapper, input };
}

// --- Select (form group with label + select) ---

export interface SelectHandle {
  group: HTMLElement;
  select: HTMLSelectElement;
}

export function createSelect(id: string, labelText: string): SelectHandle {
  const group = document.createElement('div');
  group.className = 'usa-form-group';

  const label = document.createElement('label');
  label.className = 'usa-label';
  label.htmlFor = id;
  label.textContent = labelText;
  group.appendChild(label);

  const select = document.createElement('select');
  select.className = 'usa-select';
  select.id = id;
  group.appendChild(select);

  return { group, select };
}
