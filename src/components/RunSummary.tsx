import type { RunMetrics } from '../types/metrics'

function formatTat(ms: number): string {
  const totalSec = ms / 1000
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}m ${s}s`
}

function ConfBadge({ value }: { value: number }) {
  const color =
    value > 90 ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' :
    value >= 50 ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' :
    'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${color}`}>
      {value}%
    </span>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 tracking-tight ${accent ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-sm text-slate-500 mt-1.5">{sub}</p>}
    </div>
  )
}

/**
 * Read-only KPI dashboard ("Run Summary"). Renders metrics the run already
 * produced; it changes no mapping, normalization, derivation or export logic.
 */
export function RunSummary({ metrics, exported }: { metrics: RunMetrics; exported: boolean }) {
  const distTotal = metrics.confidenceHigh + metrics.confidenceMedium + metrics.confidenceLow
  const pct = (n: number) => (distTotal === 0 ? 0 : (n / distTotal) * 100)
  const hasValidationIssues = metrics.validation.total > 0
  const hasEmptyValues = metrics.validation.emptyMappedValues > 0

  return (
    <div className="bg-slate-100 rounded-2xl border border-slate-200 p-5 sm:p-6 mb-6 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Run Summary</p>
        <span className="text-xs text-slate-400">How this run performed · read-only, no effect on your data</span>
      </div>

      {/* KPI 1 — TAT, the north-star metric: full-width hero */}
      <div className="bg-white rounded-2xl border border-violet-200 ring-1 ring-violet-100 p-5 sm:p-6 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest">Turnaround Time · north-star KPI</p>
          <p className={`text-4xl font-bold mt-1 tracking-tight ${metrics.tatMs != null ? 'text-violet-700' : 'text-slate-400'}`}>
            {metrics.tatMs != null ? formatTat(metrics.tatMs) : 'In progress'}
          </p>
        </div>
        <p className="text-sm text-slate-500 max-w-56">
          {metrics.tatMs != null
            ? 'From mapping start to the first successful export of the standardized file.'
            : 'Measured from mapping start until the standardized file is downloaded.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {/* KPI 2 — auto-mapping rate */}
        <StatCard
          label="Auto-mapping Rate"
          value={metrics.autoMappingRate != null ? `${metrics.autoMappingRate.toFixed(0)}%` : '—'}
          sub="Client columns mapped without manual fixes"
        />
        {/* KPI 5 — validation errors (format failures only; empties reported separately) */}
        <StatCard
          label="Validation Errors"
          value={String(metrics.validation.total)}
          sub={`GST ${metrics.validation.invalidGst} · phone ${metrics.validation.invalidPhone} · email ${metrics.validation.invalidEmail}`}
          accent={hasValidationIssues ? 'text-rose-600' : 'text-emerald-600'}
        />
        {/* KPI 6 — transformation summary */}
        <StatCard
          label="Transformations"
          value={`${metrics.fieldsDerived + metrics.fieldsNormalized}`}
          sub={`${metrics.fieldsDerived} derived · ${metrics.fieldsNormalized} normalized · ${metrics.columnsDropped} dropped`}
        />
      </div>

      {/* Data-quality flags, kept distinct from the review queue */}
      {(hasValidationIssues || hasEmptyValues) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4 text-sm text-amber-800 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <div>
            <strong>Data quality needs attention:</strong>
            {hasValidationIssues && <> {metrics.validation.total} invalid value{metrics.validation.total > 1 ? 's' : ''} in the exported file.</>}
            {hasEmptyValues && <> {metrics.validation.emptyMappedValues} empty cell{metrics.validation.emptyMappedValues > 1 ? 's' : ''} in mapped columns.</>}
          </div>
        </div>
      )}

      {/* KPI 3 — confidence distribution */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Confidence Distribution</p>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
          {metrics.confidenceHigh > 0 && (
            <div className="bg-emerald-400" style={{ width: `${pct(metrics.confidenceHigh)}%` }} />
          )}
          {metrics.confidenceMedium > 0 && (
            <div className="bg-amber-400" style={{ width: `${pct(metrics.confidenceMedium)}%` }} />
          )}
          {metrics.confidenceLow > 0 && (
            <div className="bg-rose-400" style={{ width: `${pct(metrics.confidenceLow)}%` }} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />High (&gt;90): {metrics.confidenceHigh}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />Medium (50–90): {metrics.confidenceMedium}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />Low (&lt;50): {metrics.confidenceLow}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4">
        {/* KPI 7 — export summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Export Summary</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-600">
            <span>Rows processed</span>
            <span className="text-right font-mono font-semibold text-slate-800">{metrics.rowsProcessed}</span>
            <span>Rows exported</span>
            <span className="text-right font-mono font-semibold text-slate-800">
              {exported ? metrics.rowsExported : '—'}
            </span>
            <span>Columns mapped</span>
            <span className="text-right font-mono font-semibold text-slate-800">{metrics.columnsMapped}</span>
            <span>Columns dropped</span>
            <span className="text-right font-mono font-semibold text-slate-800">{metrics.columnsDropped}</span>
            <span>Empty cells in mapped columns</span>
            <span className="text-right font-mono font-semibold text-slate-800">{metrics.validation.emptyMappedValues}</span>
          </div>
        </div>

        {/* KPI 4 — manual review queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Manual Review Queue <span className="normal-case font-normal">(confidence &lt; 90) — where attention pays off most</span>
          </p>
          {metrics.reviewQueue.length === 0 ? (
            <p className="text-sm text-slate-500">No mappings below 90% confidence in this run.</p>
          ) : (
            <div className="space-y-2.5">
              {metrics.reviewQueue.map(item => (
                <div
                  key={`${item.sourceColumn}-${item.targetColumn ?? 'none'}`}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-500 text-xs flex-shrink-0">{item.sourceColumn}</span>
                    <svg className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <span className="font-medium text-slate-700 text-xs flex-shrink-0">{item.targetColumn ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-400 max-w-full sm:max-w-md truncate" title={item.reason}>{item.reason}</span>
                    <ConfBadge value={item.confidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Validation counts exported values that fail the GST / phone / email format checks. Empty cells in mapped
        columns are reported separately above. A missing-mandatory rule is unavailable: the template format has no
        required-field markers, so no column is treated as mandatory.
      </p>
    </div>
  )
}
