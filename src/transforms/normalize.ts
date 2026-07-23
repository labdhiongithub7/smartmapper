export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits || value.trim()
}

export function normalizeGst(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function looksLikePhone(samples: string[]): boolean {
  const valid = samples.filter(Boolean)
  if (valid.length === 0) return false
  return valid.filter(v => /[\d\s\-+()]{10,}/.test(v) && /\d{10}/.test(v.replace(/\D/g, ''))).length / valid.length >= 0.6
}

export function looksLikeGst(samples: string[]): boolean {
  const valid = samples.filter(Boolean)
  if (valid.length === 0) return false
  return valid.filter(v => /\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]/i.test(v.replace(/\s/g, ''))).length / valid.length >= 0.5
}

export function looksLikeEmail(samples: string[]): boolean {
  const valid = samples.filter(Boolean)
  if (valid.length === 0) return false
  return valid.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())).length / valid.length >= 0.6
}
