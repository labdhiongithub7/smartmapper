import type { ParsedAddress } from './types'

const INDIAN_STATES = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
  'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
  'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram',
  'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
  'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
  'andaman and nicobar', 'chandigarh', 'dadra and nagar haveli', 'daman and diu',
  'delhi', 'jammu and kashmir', 'ladakh', 'lakshadweep', 'puducherry',
]

const STATE_ABBREVS: Record<string, string> = {
  ap: 'Andhra Pradesh', ar: 'Arunachal Pradesh', as: 'Assam', br: 'Bihar',
  cg: 'Chhattisgarh', ch: 'Chandigarh', dl: 'Delhi', ga: 'Goa', gj: 'Gujarat',
  hr: 'Haryana', hp: 'Himachal Pradesh', jh: 'Jharkhand', jk: 'Jammu and Kashmir',
  ka: 'Karnataka', kl: 'Kerala', la: 'Ladakh', mh: 'Maharashtra', ml: 'Meghalaya',
  mn: 'Manipur', mp: 'Madhya Pradesh', mz: 'Mizoram', nl: 'Nagaland', od: 'Odisha',
  pb: 'Punjab', py: 'Puducherry', rj: 'Rajasthan', sk: 'Sikkim', tn: 'Tamil Nadu',
  ts: 'Telangana', tr: 'Tripura', uk: 'Uttarakhand', up: 'Uttar Pradesh', wb: 'West Bengal',
}

const MAJOR_CITIES = new Set([
  'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
  'pune', 'ahmedabad', 'jaipur', 'surat', 'lucknow', 'kanpur', 'nagpur', 'indore',
  'thane', 'bhopal', 'visakhapatnam', 'patna', 'vadodara', 'ghaziabad', 'ludhiana',
  'agra', 'nashik', 'faridabad', 'meerut', 'rajkot', 'varanasi', 'srinagar',
  'aurangabad', 'dhanbad', 'amritsar', 'allahabad', 'prayagraj', 'ranchi', 'coimbatore',
  'jodhpur', 'madurai', 'guwahati', 'chandigarh', 'solapur', 'hubli', 'mysore', 'mysuru',
  'noida', 'gurgaon', 'gurugram', 'faridabad', 'greater noida',
])

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase()).trim()
}

function findState(text: string): string {
  const lower = text.toLowerCase().trim()

  for (const state of INDIAN_STATES) {
    const re = new RegExp(`\\b${state.replace(/\s+/g, '\\s+')}\\b`, 'i')
    if (re.test(lower)) return titleCase(state)
  }

  for (const [abbrev, full] of Object.entries(STATE_ABBREVS)) {
    const re = new RegExp(`\\b${abbrev}\\b`, 'i')
    if (re.test(lower)) return full
  }

  return ''
}

function findPincode(text: string): string {
  const matches = text.match(/\b(\d{6})\b/g)
  if (!matches) return ''
  return matches[matches.length - 1]
}

function findCityInSegments(segments: string[], state: string): string {
  const cleaned = segments
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .filter(s => !/\b\d{6}\b/.test(s))
    .filter(s => {
      const lower = s.toLowerCase()
      if (state && lower.includes(state.toLowerCase())) return false
      if (/^\d+$/.test(s)) return false
      if (/^(india|in)$/i.test(s)) return false
      return true
    })

  if (cleaned.length === 0) return ''

  for (let i = cleaned.length - 1; i >= 0; i--) {
    const seg = cleaned[i]
    const lower = seg.toLowerCase()
    if (MAJOR_CITIES.has(lower)) return titleCase(seg)
    if (state && findState(seg) === state) continue
    if (seg.length <= 35 && !/\b(road|street|sector|plot|floor|building|near|lane|nagar|colony|apt|flat|no\.?)\b/i.test(seg)) {
      if (i === cleaned.length - 1 || cleaned.length <= 2) return titleCase(seg)
    }
  }

  const candidate = cleaned[cleaned.length - 1] || cleaned[0]
  if (candidate && candidate.length <= 40) return titleCase(candidate)
  return ''
}

export function parseAddress(raw: string): ParsedAddress {
  const text = raw.trim()
  if (!text) return { city: '', state: '', pincode: '', raw }

  const pincode = findPincode(text)
  let working = text
  if (pincode) working = working.replace(new RegExp(`\\b${pincode}\\b`), ' ').trim()

  const state = findState(working)
  if (state) {
    working = working.replace(new RegExp(state, 'i'), ' ').trim()
  }

  const segments = working.split(/[,;\n|]+/).map(s => s.trim()).filter(Boolean)
  let city = findCityInSegments(segments, state)

  if (!city && segments.length === 1) {
    const only = segments[0]
    if (only.length <= 30 && !/\d/.test(only)) city = titleCase(only)
  }

  if (!city && MAJOR_CITIES.has(text.toLowerCase())) {
    city = titleCase(text)
  }

  return { city, state, pincode, raw: text }
}

const ADDRESS_KEYWORDS = /\b(address|addr|location|billing|shipping|office|premises|residence)\b/i
const STREET_PATTERN = /\b(road|street|sector|plot|floor|building|near|lane|nagar|colony|apt|flat|pincode|pin code|zip)\b/i

export function looksLikeFullAddress(samples: string[]): boolean {
  const valid = samples.filter(s => s.trim().length > 0)
  if (valid.length === 0) return false

  const hits = valid.filter(v => {
    const hasComma = v.includes(',')
    const hasPincode = /\b\d{6}\b/.test(v)
    const isLong = v.length > 30
    const hasStreet = STREET_PATTERN.test(v)
    return (hasComma && (isLong || hasPincode)) || (hasPincode && hasComma) || (hasStreet && isLong)
  })

  return hits.length / valid.length >= 0.5
}

export function looksLikeCityOnly(samples: string[]): boolean {
  const valid = samples.filter(s => s.trim().length > 0)
  if (valid.length === 0) return false

  const hits = valid.filter(v => {
    const noComma = !v.includes(',')
    const short = v.length <= 35
    const noPincode = !/\b\d{6}\b/.test(v)
    const noStreet = !STREET_PATTERN.test(v)
    return noComma && short && noPincode && noStreet
  })

  return hits.length / valid.length >= 0.7
}

export function isAddressColumnName(header: string): boolean {
  const n = header.toLowerCase()
  if (ADDRESS_KEYWORDS.test(n)) return true
  if (/\bfull\s*addr/i.test(n)) return true
  if (n === 'address' || n === 'addr') return true
  return false
}

export type AddressField = 'city' | 'state' | 'pincode' | 'address'

export function matchTargetField(targetCol: string): AddressField | null {
  const n = targetCol.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim()
  if (/\baddress\b/.test(n) || n === 'addr' || /\bfull\s*addr/.test(n)) return 'address'
  if (/\bcity\b/.test(n) || n === 'town') return 'city'
  if (/\bstate\b/.test(n) || n === 'province' || n === 'region') return 'state'
  if (/\bpin\s*code\b/.test(n) || /\bpincode\b/.test(n) || n === 'zip' || n === 'postal') return 'pincode'
  return null
}

export function isCityColumnName(header: string): boolean {
  const n = header.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim()
  return /\bcity\b/.test(n) || n === 'town' || /\bplace\b/.test(n)
}

export function isLikelyCitySourceColumn(header: string, samples: string[]): boolean {
  if (isCityColumnName(header)) return true
  if (isAddressColumnName(header)) return false
  const n = header.toLowerCase()
  return looksLikeCityOnly(samples) && /\b(city|town|place|district|loc)\b/.test(n)
}
