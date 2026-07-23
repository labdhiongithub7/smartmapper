export type TransformType =
  | 'copy'
  | 'extract_city'
  | 'extract_state'
  | 'extract_pincode'
  | 'normalize_phone'
  | 'normalize_gst'
  | 'normalize_email'

export interface ParsedAddress {
  city: string
  state: string
  pincode: string
  raw: string
}

export const TRANSFORM_LABELS: Record<TransformType, string> = {
  copy: 'Direct copy',
  extract_city: 'Extract city from address',
  extract_state: 'Extract state from address',
  extract_pincode: 'Extract pincode from address',
  normalize_phone: 'Normalize phone number',
  normalize_gst: 'Normalize GST number',
  normalize_email: 'Normalize email',
}
