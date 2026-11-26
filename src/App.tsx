import { useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { aiMap, transformData, previewTransform, TRANSFORM_LABELS, type ColumnMapping } from './transforms'
import { computeRunMetrics } from './metrics/compute'
import { RunSummary } from './components/RunSummary'

interface ParsedFile {
  headers: string[]
  rows: Record<string, string>[]
  name: string
}

type Step = 1 | 2 | 3 | 4 | 5

// ─── File Parsing ─────────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete(results) {
          const raw = results.data as string[][]
          if (raw.length === 0) return resolve({ headers: [], rows: [], name: file.name })
          const headers = raw[0].map(h => String(h).trim())
          const rows = raw.slice(1).map(r =>
            Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()]))
          )
          resolve({ headers, rows, name: file.name })
        },
        error: reject,
      })
    })
  }
  // xlsx / xls — use raw 2D array so header row is always captured
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
  if (raw.length === 0) return { headers: [], rows: [], name: file.name }
  const headers = raw[0].map(h => String(h).trim()).filter(Boolean)
  const rows = raw.slice(1)
    .filter(r => r.some(cell => String(cell).trim() !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])))
  return { headers, rows, name: file.name }
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfBadge({ value }: { value: number }) {
  const color =
    value >= 90 ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' :
    value >= 70 ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' :
    'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${color}`}>
      {value}%
    </span>
  )
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepDots({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: 'Template' },
    { n: 2, label: 'Client File' },
    { n: 3, label: 'AI Mapping' },
    { n: 4, label: 'Preview' },
    { n: 5, label: 'Export' },
  ]
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                s.n < current
                  ? 'bg-violet-600 text-white'
                  : s.n === current
                  ? 'bg-violet-600 text-white ring-4 ring-violet-100'
                  : 'bg-white text-slate-400 ring-1 ring-slate-200'
              }`}
            >
              {s.n < current ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : s.n}
            </div>
            <span className={`text-[10px] font-medium whitespace-nowrap ${s.n === current ? 'text-violet-700' : 'text-slate-400'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-px mb-4 mx-1 transition-colors duration-300 ${s.n < current ? 'bg-violet-400' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  label,
  hint,
  icon,
  accepted,
}: {
  onFile: (f: File) => void
  label: string
  hint: string
  icon: React.ReactNode
  accepted?: string
}) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (f: File | undefined) => {
    if (f) onFile(f)
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200 ${
        drag ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40'
      }`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accepted ?? '.csv,.xlsx,.xls'}
        className="hidden"
        onChange={e => handle(e.target.files?.[0])}
      />
      <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-600">
        {icon}
      </div>
      <div className="text-center">
        <p className="font-semibold text-slate-800 text-base">{label}</p>
        <p className="text-sm text-slate-500 mt-1">{hint}</p>
      </div>
      <span className="text-xs text-violet-600 font-medium px-3 py-1 rounded-full bg-violet-100">
        Browse or drop CSV / XLSX / XLS
      </span>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState<Step>(1)
  const [template, setTemplate] = useState<ParsedFile | null>(null)
  const [clientFile, setClientFile] = useState<ParsedFile | null>(null)
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // saved learned mappings per client file name
  const [learnedMappings, setLearnedMappings] = useState<Record<string, Record<string, string>>>({})

  // ── Run reporting state (read-only; feeds the Run Summary dashboard) ──
  // Actual human changes by client column. Confirming an unchanged suggestion
  // is not an edit, so it is never recorded here.
  const [editedCols, setEditedCols] = useState<Set<string>>(new Set())
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [runFinishedAt, setRunFinishedAt] = useState<number | null>(null)
  const [rowsExported, setRowsExported] = useState<number | null>(null)

  const markEdited = (clientCol: string) => {
    setEditedCols(prev => {
      if (prev.has(clientCol)) return prev
      const next = new Set(prev)
      next.add(clientCol)
      return next
    })
  }

  const handleTemplateUpload = useCallback(async (file: File) => {
    try {
      setError(null)
      const parsed = await parseFile(file)
      setTemplate(parsed)
    } catch {
      setError('Could not read template file. Please upload a valid CSV or Excel file.')
    }
  }, [])

  const handleClientUpload = useCallback(async (file: File) => {
    try {
      setError(null)
      const parsed = await parseFile(file)
      setClientFile(parsed)
    } catch {
      setError('Could not read client file.')
    }
  }, [])

  const runMapping = useCallback(async () => {
    if (!template || !clientFile) return
    setLoading(true)
    setError(null)
    // Start a fresh run: TAT restarts and prior export/edit records are cleared.
    setRunStartedAt(Date.now())
    setRunFinishedAt(null)
    setRowsExported(null)
    setEditedCols(new Set())
    await new Promise(r => setTimeout(r, 1400)) // simulate processing
    const raw = aiMap(clientFile.headers, template.headers, clientFile.rows)
    // apply any learned corrections for this client
    const learned = learnedMappings[clientFile.name] || {}
    const patched = raw.map(m => {
      if (learned[m.clientCol]) {
        return { ...m, targetCol: learned[m.clientCol], confidence: 100, reason: 'Learned from previous correction', status: 'confirmed' as const }
      }
      return m
    })
    setMappings(patched)
    setLoading(false)
    setStep(3)
  }, [template, clientFile, learnedMappings])

  const updateMapping = (idx: number, patch: Partial<ColumnMapping>) => {
    setMappings(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  const confirmMapping = (idx: number) => {
    const m = mappings[idx]
    if (clientFile && m.targetCol) {
      setLearnedMappings(prev => ({
        ...prev,
        [clientFile.name]: { ...(prev[clientFile.name] || {}), [m.clientCol]: m.targetCol! },
      }))
    }
    updateMapping(idx, { status: 'confirmed' })
  }

  const skipMapping = (idx: number) => {
    markEdited(mappings[idx].clientCol)
    updateMapping(idx, { status: 'skipped', targetCol: null })
  }

  const pendingCount = mappings.filter(m => m.status === 'pending').length
  const confirmedCount = mappings.filter(m => m.status === 'confirmed' || m.status === 'auto').length

  const transformedRows = (template && clientFile)
    ? transformData(clientFile.rows, mappings, template.headers)
    : []

  const transformedTargets = new Set(
    mappings.filter(m => m.transformation && m.targetCol && m.status !== 'skipped').map(m => m.targetCol!),
  )

  const handleDownload = () => {
    if (!template) return
    try {
      const ws = XLSX.utils.json_to_sheet(transformedRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Standardized')
      XLSX.writeFile(wb, `standardized_${clientFile?.name ?? 'output'}.xlsx`)
      // TAT ends at the first successful export; a failed download never counts as finished.
      setRunFinishedAt(prev => prev ?? Date.now())
      setRowsExported(transformedRows.length)
    } catch {
      setError('Export failed while writing the file. Please try downloading again.')
    }
  }

  const IconTemplate = (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  )

  const IconClient = (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-[#0D1529] px-8 py-4 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <div>
            <span className="text-white font-bold tracking-tight text-base">AI Data Onboarding</span>
            <span className="ml-2 text-xs text-violet-400 font-medium bg-violet-900/60 px-2 py-0.5 rounded-full">Assistant</span>
          </div>
        </div>
        <StepDots current={step} />
        <div className="text-xs text-slate-500 font-mono">
          {step < 3 ? null : (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              {confirmedCount}/{mappings.length} mapped
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            {error}
          </div>
        )}

        {/* ── Step 1: Upload Template ── */}
        {step === 1 && (
          <div className="max-w-xl mx-auto">
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Upload Company Template</h1>
              <p className="text-slate-500 mt-2 text-sm">This defines your standard output schema. Upload a CSV or Excel file with the column headers you need.</p>
            </div>

            {!template ? (
              <UploadZone onFile={handleTemplateUpload} label="Company Template" hint="Your target schema with standard column headers" icon={IconTemplate} />
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-slate-800">{template.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{template.headers.length} columns detected</p>
                  </div>
                  <button onClick={() => setTemplate(null)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                    Replace
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {template.headers.map(h => (
                    <span key={h} className="px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-sm font-medium ring-1 ring-violet-200">
                      {h}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="mt-6 w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors duration-200"
                >
                  Continue to Client File →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Upload Client File ── */}
        {step === 2 && (
          <div className="max-w-xl mx-auto">
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Upload Client File</h1>
              <p className="text-slate-500 mt-2 text-sm">Upload the client's data file in any format. The AI will figure out how to map it.</p>
            </div>

            {!clientFile ? (
              <UploadZone onFile={handleClientUpload} label="Client Data File" hint="Any CSV or Excel format — unknown schema is fine" icon={IconClient} />
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-slate-800">{clientFile.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{clientFile.headers.length} columns · {clientFile.rows.length} rows</p>
                  </div>
                  <button onClick={() => setClientFile(null)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                    Replace
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                  {clientFile.headers.map(h => (
                    <span key={h} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-mono ring-1 ring-slate-200">
                      {h}
                    </span>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors duration-200"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={runMapping}
                    disabled={loading}
                    className="flex-[2] bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Analyzing with AI…
                      </>
                    ) : 'Run AI Mapping →'}
                  </button>
                </div>
              </div>
            )}

            {/* Template summary */}
            {template && (
              <div className="mt-4 px-4 py-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3 text-sm">
                <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-slate-600">Template: <span className="font-medium text-slate-800">{template.name}</span> · {template.headers.length} target columns</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Mapping Review ── */}
        {step === 3 && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Column Mapping</h1>
                <p className="text-slate-500 mt-1 text-sm">
                  Review and confirm AI suggestions.
                  {pendingCount > 0 && (
                    <span className="ml-2 text-amber-600 font-medium">{pendingCount} need your review.</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  ← Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={pendingCount > 0}
                  className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Preview Output →
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Auto-mapped (≥90%)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Needs review (&lt;90%)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" />Skipped</span>
            </div>

            <div className="space-y-2">
              {mappings.map((m, i) => (
                <MappingRow
                  key={`${m.clientCol}-${m.targetCol ?? 'none'}-${i}`}
                  mapping={m}
                  targetHeaders={template?.headers || []}
                  sampleValue={clientFile?.rows[0]?.[m.clientCol] ?? ''}
                  onConfirm={() => confirmMapping(i)}
                  onSkip={() => skipMapping(i)}
                  onChangeTarget={t => {
                    markEdited(m.clientCol)
                    updateMapping(i, { targetCol: t, status: 'pending' })
                  }}
                />
              ))}
            </div>

            {pendingCount > 0 && (
              <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <div>
                  <strong>{pendingCount} mapping{pendingCount > 1 ? 's' : ''}</strong> still need{pendingCount === 1 ? 's' : ''} your confirmation before you can preview the output.
                  Use the confirm or skip buttons above to resolve them.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 4 && template && clientFile && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Output Preview</h1>
                <p className="text-slate-500 mt-1 text-sm">{transformedRows.length} rows · {template.headers.length} columns</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(3)} className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  ← Back to Mapping
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Export →
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto scrollbar-thin">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-800">
                      {template.headers.map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-mono font-semibold text-slate-300 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transformedRows.slice(0, 50).map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        {template.headers.map(h => (
                          <td key={h} className={`px-4 py-2.5 text-slate-700 font-mono text-xs whitespace-nowrap border-b border-slate-100 ${row[h] ? '' : 'text-slate-300 italic'} ${transformedTargets.has(h) ? 'bg-violet-50/80 text-violet-900' : ''}`}>
                            {row[h] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {transformedRows.length > 50 && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                  Showing 50 of {transformedRows.length} rows
                </div>
              )}
              {transformedTargets.size > 0 && (
                <div className="px-4 py-2 bg-violet-50 border-t border-violet-100 text-xs text-violet-700 flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-violet-100 ring-1 ring-violet-200 inline-block" />
                  Highlighted cells were smart-extracted or normalized from composite source fields
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 5: Export ── */}
        {step === 5 && (
          <div className="max-w-4xl mx-auto">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Ready to Download</h1>
            <p className="text-slate-500 text-sm mb-8">
              Your data has been standardized into the company template format.<br />
              {transformedRows.length} rows · {template?.headers.length} columns
            </p>

          </div>

            {/* Run Summary KPI dashboard (read-only) */}
            <RunSummary
              metrics={computeRunMetrics({
                startedAt: runStartedAt,
                finishedAt: runFinishedAt,
                mappings: mappings.map(m => ({ ...m, userEdited: editedCols.has(m.clientCol) })),
                rowsProcessed: clientFile?.rows.length ?? 0,
                rowsExported,
                transformedRows,
              })}
              exported={rowsExported != null}
            />


            {/* Mapping summary */}
          <div className="max-w-lg mx-auto text-center">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 text-left space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Mapping Summary</p>
              {mappings.filter(m => m.status !== 'skipped').map(m => (
                <div key={`${m.clientCol}-${m.targetCol}`} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-500 text-xs truncate">{m.clientCol}</span>
                    <svg className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <span className="font-medium text-slate-700 text-xs truncate">{m.targetCol}</span>
                    {m.transformation && m.transformation !== 'copy' && (
                      <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded ring-1 ring-violet-200 flex-shrink-0">
                        {TRANSFORM_LABELS[m.transformation]}
                      </span>
                    )}
                  </div>
                  <ConfBadge value={m.confidence} />
                </div>
              ))}
              {mappings.filter(m => m.status === 'skipped').length > 0 && (
                <div className="pt-2 border-t border-slate-100 text-xs text-slate-400">
                  {mappings.filter(m => m.status === 'skipped').length} column(s) discarded:&nbsp;
                  {mappings.filter(m => m.status === 'skipped').map(m => m.clientCol).join(', ')}
                </div>
              )}
            </div>

            <button
              onClick={handleDownload}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-4 rounded-xl text-base transition-colors duration-200 flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" />
              </svg>
              Download Standardized Excel
            </button>

            <button
              onClick={() => {
                setStep(1)
                setTemplate(null)
                setClientFile(null)
                setMappings([])
                setError(null)
                setEditedCols(new Set())
                setRunStartedAt(null)
                setRunFinishedAt(null)
                setRowsExported(null)
              }}
              className="mt-4 w-full text-slate-500 hover:text-slate-700 text-sm font-medium py-3 transition-colors"
            >
              Start a new mapping session
            </button>
          </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Mapping Row ──────────────────────────────────────────────────────────────

function MappingRow({
  mapping,
  targetHeaders,
  sampleValue,
  onConfirm,
  onSkip,
  onChangeTarget,
}: {
  mapping: ColumnMapping
  targetHeaders: string[]
  sampleValue: string
  onConfirm: () => void
  onSkip: () => void
  onChangeTarget: (t: string | null) => void
}) {
  const { clientCol, targetCol, confidence, reason, status, transformation, isDerived } = mapping

  const transformedPreview = transformation && transformation !== 'copy' && sampleValue
    ? previewTransform(sampleValue, transformation)
    : null

  const statusStyle =
    status === 'confirmed' ? 'bg-emerald-50 border-emerald-200' :
    status === 'skipped' ? 'bg-slate-50 border-slate-200 opacity-60' :
    status === 'auto' ? 'bg-white border-slate-200' :
    'bg-amber-50 border-amber-200'

  const barColor =
    confidence >= 90 ? 'bg-emerald-400' :
    confidence >= 70 ? 'bg-amber-400' :
    'bg-rose-400'

  return (
    <div className={`rounded-xl border px-5 py-4 transition-all duration-200 ${statusStyle}`}>
      <div className="flex items-start gap-4">
        {/* Client column */}
        <div className="w-44 flex-shrink-0">
          <p className="text-xs text-slate-400 mb-1">{isDerived ? 'Source field' : 'Client column'}</p>
          <span className="font-mono text-sm font-semibold text-slate-800 block truncate">{clientCol}</span>
          {sampleValue && (
            <span className="text-xs text-slate-400 font-mono mt-0.5 block truncate" title={sampleValue}>
              eg. "{sampleValue.length > 40 ? sampleValue.slice(0, 40) + '…' : sampleValue}"
            </span>
          )}
          {transformedPreview && (
            <span className="text-xs text-violet-600 font-mono mt-1 block truncate" title={transformedPreview}>
              → "{transformedPreview}"
            </span>
          )}
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 pt-5">
          <svg className={`w-5 h-5 ${status === 'skipped' ? 'text-slate-300' : 'text-violet-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>

        {/* Target column selector */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-1">Maps to</p>
          {status === 'skipped' ? (
            <span className="text-sm text-slate-400 italic">Discarded</span>
          ) : (
            <select
              value={targetCol ?? ''}
              onChange={e => onChangeTarget(e.target.value || null)}
              className="text-sm font-semibold text-slate-800 bg-transparent border-0 outline-none p-0 cursor-pointer focus:ring-0 w-full"
              disabled={status === 'confirmed'}
            >
              <option value="">— Not mapped —</option>
              {targetHeaders.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          )}
          {/* Confidence bar */}
          {status !== 'skipped' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <ConfBadge value={confidence} />
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1.5">{reason}</p>
          {transformation && transformation !== 'copy' && (
            <span className="inline-flex mt-1.5 text-[10px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-200">
              {TRANSFORM_LABELS[transformation]}
            </span>
          )}
        </div>

        {/* Status badge + actions */}
        <div className="flex-shrink-0 flex flex-col items-end gap-2 pt-1">
          {status === 'confirmed' ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Confirmed
              </span>
              <button
                onClick={onSkip}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Skip
              </button>
            </div>
          ) : status === 'auto' ? (
            <div className="flex gap-2">
              <button
                onClick={onSkip}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={onConfirm}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-3 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                Confirm
              </button>
            </div>
          ) : status === 'pending' ? (
            <div className="flex gap-2">
              <button
                onClick={onSkip}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={onConfirm}
                disabled={!targetCol}
                className="text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold px-3 py-1 rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          ) : (
            <button
              onClick={() => onChangeTarget(targetCol)}
              className="text-xs text-violet-500 hover:text-violet-700 font-medium px-2 py-1 rounded-lg hover:bg-violet-50 transition-colors"
            >
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
