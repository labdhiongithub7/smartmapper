import type { ColumnMapping } from '../mapping/aiMap'

/**
 * A mapping plus run-tracking metadata added by the reporting layer.
 * Reporting only — does not change mapping, normalization, derivation or export logic.
 */
export interface RunMapping extends ColumnMapping {
  /**
   * true only when the user actually changed the target column or skipped/restored
   * the column during review. Confirming an unchanged AI suggestion stays false,
   * so the auto-mapping rate is not diluted by confirmations.
   */
  userEdited: boolean
}

export interface ValidationBreakdown {
  invalidGst: number
  invalidPhone: number
  invalidEmail: number
  /**
   * Empty cells in mapped target columns, reported separately from validation
   * errors. Not labeled "missing mandatory": the template format carries no
   * required-field markers, so a mandatory-field rule is unavailable.
   */
  emptyMappedValues: number
  total: number
}

export interface ReviewItem {
  sourceColumn: string
  targetColumn: string | null
  confidence: number
  reason: string
}

export interface RunMetrics {
  /** When the current mapping run began (Run AI Mapping clicked). */
  startedAt: number | null
  /** When the standardized file was first exported successfully. */
  finishedAt: number | null
  /** finishedAt - startedAt, null until the first successful export. */
  tatMs: number | null
  /** Client columns mapped without any manual change ÷ all client columns, × 100. */
  autoMappingRate: number | null
  /** Confidence buckets over active mappings: High > 90. */
  confidenceHigh: number
  /** Medium 50–90 (90 inclusive). */
  confidenceMedium: number
  /** Low < 50. */
  confidenceLow: number
  /** Active mappings with confidence < 90, lowest first. */
  reviewQueue: ReviewItem[]
  validation: ValidationBreakdown
  fieldsDerived: number
  fieldsNormalized: number
  columnsDropped: number
  rowsProcessed: number
  rowsExported: number
  columnsMapped: number
}
