import {
  isAddressColumnName,
  isCityColumnName,
  isLikelyCitySourceColumn,
  looksLikeCityOnly,
  looksLikeFullAddress,
  matchTargetField,
} from '../transforms/address'
import { looksLikeEmail, looksLikeGst, looksLikePhone } from '../transforms/normalize'
import { applyTransform } from '../transforms/pipeline'
import type { TransformType } from '../transforms/types'

export interface ColumnMapping {
  clientCol: string
  targetCol: string | null
  confidence: number
  reason: string
  status: 'auto' | 'pending' | 'confirmed' | 'skipped'
  transformation?: TransformType
  isDerived?: boolean
}

function normalizeStr(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim()
}

function similarity(a: string, b: string): number {
  const na = normalizeStr(a)
  const nb = normalizeStr(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const aWords = new Set(na.split(' ').filter(Boolean))
  const bWords = new Set(nb.split(' ').filter(Boolean))
  const intersection = [...aWords].filter(w => bWords.has(w)).length
  const union = new Set([...aWords, ...bWords]).size
  return union === 0 ? 0 : intersection / union
}

const semanticAliases: Record<string, string[]> = {
  'Vendor Name': ['supplier', 'vendor', 'company', 'organisation', 'organization', 'firm', 'vendor name', 'vendor_name', 'company name', 'supplier name'],
  'GST': ['gstin', 'gst', 'gst number', 'gst_number', 'gstin number', 'tax id', 'tax_id', 'vat', 'gst no'],
  'Phone': ['mobile', 'phone', 'contact', 'contact number', 'mobile number', 'telephone', 'tel', 'phone number', 'cell'],
  'Email': ['email', 'e-mail', 'email address', 'mail', 'email id'],
  'City': ['city', 'town', 'place'],
  'State': ['state', 'province', 'region', 'st'],
  'Pincode': ['pincode', 'pin code', 'pin', 'zip', 'postal code', 'postal'],
  'Address': ['address', 'full address', 'full addr', 'billing address', 'shipping address', 'office address', 'premises', 'location'],
  'Material Category': ['category', 'material', 'product category', 'item category', 'type', 'goods category', 'material category'],
}

const FIELD_TRANSFORM: Record<string, TransformType> = {
  city: 'extract_city',
  state: 'extract_state',
  pincode: 'extract_pincode',
}

function inferNormalization(targetCol: string, samples: string[]): TransformType | undefined {
  const n = normalizeStr(targetCol)
  if (/\b(phone|mobile|contact|tel)\b/.test(n) && looksLikePhone(samples)) return 'normalize_phone'
  if (/\b(gst|gstin|tax)\b/.test(n) && looksLikeGst(samples)) return 'normalize_gst'
  if (/\b(email|mail)\b/.test(n) && looksLikeEmail(samples)) return 'normalize_email'
  return undefined
}

function findDedicatedCityColumn(
  clientHeaders: string[],
  sampleRows: Record<string, string>[],
): string | null {
  for (const col of clientHeaders) {
    const samples = sampleRows.slice(0, 8).map(r => r[col] || '')
    if (isLikelyCitySourceColumn(col, samples)) return col
  }
  return null
}

function scoreMapping(
  clientCol: string,
  targetCol: string,
  samples: string[],
  dedicatedCityCol: string | null,
): { score: number; reason: string; transform?: TransformType } {
  let score = similarity(clientCol, targetCol)
  let reason = 'Column name similarity'
  let transform: TransformType | undefined

  const aliases = semanticAliases[targetCol] || []
  const aliasScore = aliases.reduce((max, alias) => Math.max(max, similarity(clientCol, alias)), 0)
  if (aliasScore > score) {
    score = Math.min(aliasScore + 0.05, 1)
    reason = 'Semantic alias match'
  }

  const field = matchTargetField(targetCol)
  const isAddressCol = isAddressColumnName(clientCol) || looksLikeFullAddress(samples)
  const isCityCol = isLikelyCitySourceColumn(clientCol, samples)
  const hasSeparateCity = dedicatedCityCol !== null && dedicatedCityCol !== clientCol

  if (field === 'address' && (isAddressColumnName(clientCol) || isAddressCol)) {
    score = Math.max(score, 0.92)
    reason = 'Address field — copied as-is to Address column'
    transform = undefined
  } else if (field === 'city' && isCityCol && !isAddressCol) {
    score = Math.max(score, 0.93)
    reason = 'City column — direct copy'
    transform = undefined
  } else if (field === 'city' && isAddressCol && !isCityCol && !hasSeparateCity) {
    score = Math.max(score, 0.88)
    reason = 'Full address detected — city will be extracted automatically'
    transform = 'extract_city'
  } else if (field === 'state' && isAddressCol && !hasSeparateCity) {
    score = Math.max(score, 0.85)
    reason = 'Full address detected — state will be extracted automatically'
    transform = 'extract_state'
  } else if (field === 'pincode' && isAddressCol && !hasSeparateCity) {
    score = Math.max(score, 0.85)
    reason = 'Full address detected — pincode will be extracted automatically'
    transform = 'extract_pincode'
  }

  if (targetCol === 'GST' && looksLikeGst(samples)) {
    score = Math.max(score, 0.97)
    reason = 'GST format detected in sample data'
    transform = 'normalize_gst'
  }
  if (targetCol === 'Email' && looksLikeEmail(samples)) {
    score = Math.max(score, 0.95)
    reason = 'Email format detected in sample data'
    transform = 'normalize_email'
  }
  if (targetCol === 'Phone' && looksLikePhone(samples)) {
    score = Math.max(score, 0.92)
    reason = 'Phone number pattern detected in sample data'
    transform = 'normalize_phone'
  }

  const norm = inferNormalization(targetCol, samples)
  if (norm && !transform) {
    transform = norm
    if (score >= 0.7) reason = `${reason} + data normalization`
  }

  return { score, reason, transform }
}

function baseMap(clientHeaders: string[], targetHeaders: string[], sampleRows: Record<string, string>[]): ColumnMapping[] {
  const dedicatedCityCol = findDedicatedCityColumn(clientHeaders, sampleRows)

  return clientHeaders.map(clientCol => {
    const samples = sampleRows.slice(0, 8).map(r => r[clientCol] || '')
    let bestTarget: string | null = null
    let bestScore = 0
    let bestReason = ''
    let bestTransform: TransformType | undefined

    for (const targetCol of targetHeaders) {
      const { score, reason, transform } = scoreMapping(clientCol, targetCol, samples, dedicatedCityCol)

      if (score > bestScore) {
        bestScore = score
        bestTarget = targetCol
        bestReason = reason
        bestTransform = transform
      }
    }

    const jitter = (Math.random() - 0.5) * 0.04
    const confidence = Math.min(Math.max(Math.round((bestScore + jitter) * 100), 1), 100)
    const status: ColumnMapping['status'] =
      bestScore < 0.4 ? 'skipped' :
      confidence < 90 ? 'pending' : 'auto'

    return {
      clientCol,
      targetCol: bestScore < 0.4 ? null : bestTarget,
      confidence,
      reason: bestScore < 0.4 ? 'No matching target column found' : bestReason,
      status,
      transformation: bestScore >= 0.4 ? bestTransform : undefined,
    }
  })
}

function findBestAddressColumn(
  clientHeaders: string[],
  sampleRows: Record<string, string>[],
  usedCols: Set<string>,
): string | null {
  let best: { col: string; score: number } | null = null

  for (const col of clientHeaders) {
    if (usedCols.has(col)) continue
    if (isCityColumnName(col)) continue
    const samples = sampleRows.slice(0, 8).map(r => r[col] || '')
    let score = 0
    if (isAddressColumnName(col)) score += 0.5
    if (looksLikeFullAddress(samples)) score += 0.5
    if (looksLikeCityOnly(samples)) score -= 0.4
    if (score > 0 && (!best || score > best.score)) best = { col, score }
  }

  return best && best.score >= 0.5 ? best.col : null
}

function findAddressTarget(targetHeaders: string[]): string | undefined {
  return targetHeaders.find(h => matchTargetField(h) === 'address')
}

function addDerivedExtractions(
  mappings: ColumnMapping[],
  targetHeaders: string[],
  sampleRows: Record<string, string>[],
  clientHeaders: string[],
): ColumnMapping[] {
  const result = [...mappings]
  const mappedTargets = new Set(
    mappings.filter(m => m.targetCol && m.status !== 'skipped').map(m => m.targetCol!),
  )
  const dedicatedCityCol = findDedicatedCityColumn(clientHeaders, sampleRows)
  const addressTarget = findAddressTarget(targetHeaders)

  const extractableTargets = targetHeaders
    .map(th => ({ header: th, field: matchTargetField(th) }))
    .filter((t): t is { header: string; field: 'city' | 'state' | 'pincode' } =>
      t.field !== null && t.field !== 'address',
    )
    .filter(t => !mappedTargets.has(t.header))

  if (extractableTargets.length === 0) return result

  const addressCol = findBestAddressColumn(clientHeaders, sampleRows, new Set())
  if (!addressCol) return result

  const addressSamples = sampleRows.slice(0, 8).map(r => r[addressCol] || '')
  if (!looksLikeFullAddress(addressSamples) && !isAddressColumnName(addressCol)) return result

  for (const { header, field } of extractableTargets) {
    if (field === 'city' && dedicatedCityCol) continue

    const transform = FIELD_TRANSFORM[field]
    const sourceMappedToAddress = addressTarget
      ? result.some(
          m => m.clientCol === addressCol && m.targetCol === addressTarget && m.status !== 'skipped',
        )
      : false
    const sourceMappedToCityWithExtract = result.some(
      m => m.clientCol === addressCol && matchTargetField(m.targetCol ?? '') === 'city'
        && m.transformation === 'extract_city' && m.status !== 'skipped',
    )
    if (sourceMappedToCityWithExtract) continue

    const alreadyDerived = result.some(
      m => m.clientCol === addressCol && m.targetCol === header && m.isDerived && m.status !== 'skipped',
    )
    if (alreadyDerived) continue

    const existingIdx = result.findIndex(m => m.targetCol === header && m.status !== 'skipped')
    if (existingIdx >= 0) {
      const existing = result[existingIdx]
      const existingSamples = sampleRows.slice(0, 8).map(r => r[existing.clientCol] || '')
      if (looksLikeCityOnly(existingSamples) || isLikelyCitySourceColumn(existing.clientCol, existingSamples)) continue
      if (similarity(existing.clientCol, header) > 0.85) continue
      result[existingIdx] = { ...existing, status: 'skipped', targetCol: null }
    }

    result.push({
      clientCol: addressCol,
      targetCol: header,
      confidence: sourceMappedToAddress ? 90 : 87,
      reason: `Extracted ${field} from "${addressCol}" (same source also fills Address)`,
      status: 'pending',
      transformation: transform,
      isDerived: true,
    })
    mappedTargets.add(header)
  }

  return result
}

function resolveConflicts(mappings: ColumnMapping[]): ColumnMapping[] {
  const byTarget = new Map<string, ColumnMapping[]>()
  for (const m of mappings) {
    if (!m.targetCol || m.status === 'skipped') continue
    const list = byTarget.get(m.targetCol) || []
    list.push(m)
    byTarget.set(m.targetCol, list)
  }

  const demote = new Set<ColumnMapping>()
  for (const [, group] of byTarget) {
    if (group.length <= 1) continue
    const ranked = [...group].sort((a, b) => {
      const aScore = a.confidence + (a.transformation?.startsWith('extract_') ? 0 : 5)
      const bScore = b.confidence + (b.transformation?.startsWith('extract_') ? 0 : 5)
      return bScore - aScore
    })
    for (const m of ranked.slice(1)) demote.add(m)
  }

  return mappings.map(m =>
    demote.has(m) ? { ...m, status: 'skipped' as const, targetCol: null, reason: `Superseded — "${m.targetCol}" mapped from a better source` } : m,
  )
}

export function aiMap(
  clientHeaders: string[],
  targetHeaders: string[],
  sampleRows: Record<string, string>[],
): ColumnMapping[] {
  const base = baseMap(clientHeaders, targetHeaders, sampleRows)
  const withDerived = addDerivedExtractions(base, targetHeaders, sampleRows, clientHeaders)
  return resolveConflicts(withDerived)
}

export function transformData(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  targetHeaders: string[],
): Record<string, string>[] {
  const active = mappings.filter(m => m.targetCol && m.status !== 'skipped')

  return rows.map(row => {
    const out: Record<string, string> = {}
    for (const th of targetHeaders) out[th] = ''

    for (const m of active) {
      if (!(m.clientCol in row)) continue
      const raw = row[m.clientCol] ?? ''
      const value = m.transformation ? applyTransform(raw, m.transformation) : raw
      if (!out[m.targetCol!] || value) out[m.targetCol!] = value
    }
    return out
  })
}
