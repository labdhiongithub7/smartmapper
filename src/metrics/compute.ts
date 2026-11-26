import type { RunMapping, RunMetrics, ValidationBreakdown } from '../types/metrics'

// Read-only reporting computations. Nothing here feeds back into mapping,
// normalization, derivation or export.

// Target-column kind detection mirrors the intent of inferNormalization in
// src/mapping/aiMap.ts: which validator applies to which target column.
const GST_TARGET = /\b(gst|gstin|tax)\b/i
const PHONE_TARGET = /\b(phone|mobile|contact|tel)\b/i
const EMAIL_TARGET = /\b(e-?mail|mail)\b/i

// Output validators, aligned with the normalizers in src/transforms/normalize.ts.
// These are reporting heuristics, not the app's source of truth for formats.
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_DIGITS = 10

export interface ComputeInput {
  startedAt: number | null
  finishedAt: number | null
  mappings: RunMapping[]
  /** Client file row count. */
  rowsProcessed: number
  /** Rows written by the last successful export; null before any export. */
  rowsExported: number | null
  /** Post-transform output rows (what export writes). */
  transformedRows: Record<string, string>[]
}

export function computeRunMetrics(input: ComputeInput): RunMetrics {
  const active = input.mappings.filter(m => m.targetCol && m.status !== 'skipped')
  const dropped = input.mappings.filter(m => !m.targetCol || m.status === 'skipped')

  // KPI 1 — TAT: mapping-run start to first successful export.
  const tatMs =
    input.startedAt != null && input.finishedAt != null
      ? Math.max(0, input.finishedAt - input.startedAt)
      : null

  // KPI 2 — auto-mapping rate, per client column: a column counts when it has
  // an active mapping and none of its mappings were touched by the user.
  // (A single client column can carry several mappings, e.g. one direct copy
  // plus derived City/State/Pincode extractions — it still counts once.)
  const byCol = new Map<string, RunMapping[]>()
  for (const m of input.mappings) {
    const list = byCol.get(m.clientCol) || []
    list.push(m)
    byCol.set(m.clientCol, list)
  }
  let autoCols = 0
  for (const list of byCol.values()) {
    const hasActive = list.some(m => m.targetCol && m.status !== 'skipped')
    if (hasActive && list.every(m => !m.userEdited)) autoCols++
  }
  const autoMappingRate = byCol.size === 0 ? null : (autoCols / byCol.size) * 100

  // KPI 3 — confidence distribution. Boundaries per spec: High > 90,
  // Medium 50–90 (90 is Medium), Low < 50.
  let confidenceHigh = 0
  let confidenceMedium = 0
  let confidenceLow = 0
  for (const m of active) {
    if (m.confidence > 90) confidenceHigh++
    else if (m.confidence >= 50) confidenceMedium++
    else confidenceLow++
  }

  // KPI 4 — manual review queue: active mappings below 90 (90 is not queued).
  const reviewQueue = active
    .filter(m => m.confidence < 90)
    .map(m => ({
      sourceColumn: m.clientCol,
      targetColumn: m.targetCol,
      confidence: m.confidence,
      reason: m.reason,
    }))
    .sort((a, b) => a.confidence - b.confidence)

  // KPI 5 — validation errors over the exported (post-transform) values,
  // counted per mapped target column so shared targets are not double counted.
  const validation: ValidationBreakdown = {
    invalidGst: 0,
    invalidPhone: 0,
    invalidEmail: 0,
    missingValues: 0,
    total: 0,
  }
  const targetKind = new Map<string, 'gst' | 'phone' | 'email'>()
  const targets: string[] = []
  for (const m of active) {
    const t = m.targetCol!
    if (targets.includes(t)) continue
    targets.push(t)
    if (GST_TARGET.test(t)) targetKind.set(t, 'gst')
    else if (PHONE_TARGET.test(t)) targetKind.set(t, 'phone')
    else if (EMAIL_TARGET.test(t)) targetKind.set(t, 'email')
  }
  for (const row of input.transformedRows) {
    for (const t of targets) {
      const value = (row[t] ?? '').trim()
      if (!value) {
        validation.missingValues++
        continue
      }
      const kind = targetKind.get(t)
      if (kind === 'gst' && !GSTIN.test(value.replace(/\s+/g, '').toUpperCase())) validation.invalidGst++
      else if (kind === 'phone' && value.replace(/\D/g, '').length !== PHONE_DIGITS) validation.invalidPhone++
      else if (kind === 'email' && !EMAIL.test(value.toLowerCase())) validation.invalidEmail++
    }
  }
  validation.total =
    validation.invalidGst + validation.invalidPhone + validation.invalidEmail + validation.missingValues

  // KPI 6 — transformation summary.
  const fieldsDerived = active.filter(m => m.isDerived).length
  const fieldsNormalized = active.filter(
    m =>
      m.transformation === 'normalize_phone' ||
      m.transformation === 'normalize_gst' ||
      m.transformation === 'normalize_email',
  ).length

  return {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    tatMs,
    autoMappingRate,
    confidenceHigh,
    confidenceMedium,
    confidenceLow,
    reviewQueue,
    validation,
    fieldsDerived,
    fieldsNormalized,
    columnsDropped: dropped.length,
    rowsProcessed: input.rowsProcessed,
    rowsExported: input.rowsExported ?? 0,
    columnsMapped: active.length,
  }
}
