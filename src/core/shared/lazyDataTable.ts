import type { TableView } from './tableView'

/** Attach the small table-button bootstrap without loading the table UI. */
export function initLazyDataTableButton(buttonId: string, getView: () => TableView): void {
  const button = document.getElementById(buttonId)
  if (!button) return

  let activation: Promise<void> | null = null
  const activate = () => {
    if (activation) return
    button.setAttribute('aria-busy', 'true')
    performance.mark('nih-merge:table-module-start')
    activation = import('./dataTableOverlay')
      .then(({ initDataTableButton }) => {
        performance.mark('nih-merge:table-module-end')
        performance.measure(
          'nih-merge:table-module',
          'nih-merge:table-module-start',
          'nih-merge:table-module-end',
        )
        button.removeEventListener('click', activate)
        initDataTableButton(buttonId, getView)
        button.removeAttribute('aria-busy')
        button.click()
      })
      .catch((error) => {
        activation = null
        button.removeAttribute('aria-busy')
        console.error('Unable to load the data-table module', error)
      })
  }

  button.addEventListener('click', activate)
}
