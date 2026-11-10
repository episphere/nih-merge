import type { DataTableAliases } from '@jeyabbalas/data-table'

export interface TablePresentation {
  /** Dimension/context columns that remain visible and are not user-selectable. */
  fixedColumns: string[]
  /** Currently selected dashboard measure; placed last when available. */
  activeMeasure: string
  /** Numeric columns visible when the table is first opened or reset. */
  defaultNumericColumns: string[]
  /** Additional columns, including text metadata, available through the chooser but hidden initially. */
  optionalColumns?: string[]
  columnWidths?: Record<string, number>
  /** Human-readable names used by the column chooser. */
  columnLabels?: Record<string, string>
  /** Presentation-only aliases passed through to the data-table library. */
  aliases?: DataTableAliases
  /** Filename stem for exports launched from the table overlay. */
  exportFileStem: string
}

export interface TableView {
  key: string
  rows: Record<string, unknown>[]
  presentation: TablePresentation
  subtitle?: string
  choices?: { id: string; label: string; disabled?: boolean }[]
  selectedChoiceId?: string
}
