import { parseAddress } from './address'
import { normalizeEmail, normalizeGst, normalizePhone } from './normalize'
import type { TransformType } from './types'

export function applyTransform(value: string, transformation: TransformType | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw || !transformation || transformation === 'copy') return raw

  switch (transformation) {
    case 'extract_city':
      return parseAddress(raw).city
    case 'extract_state':
      return parseAddress(raw).state
    case 'extract_pincode':
      return parseAddress(raw).pincode
    case 'normalize_phone':
      return normalizePhone(raw)
    case 'normalize_gst':
      return normalizeGst(raw)
    case 'normalize_email':
      return normalizeEmail(raw)
    default:
      return raw
  }
}

export function previewTransform(value: string, transformation: TransformType | undefined): string {
  const result = applyTransform(value, transformation)
  return result || '(empty)'
}
