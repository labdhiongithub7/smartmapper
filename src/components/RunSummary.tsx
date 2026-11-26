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
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold mt-1 tracking-tight ${accent ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
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

  return (
    <div className="bg-slate-100 rounded-2xl border border-slate-200 p-5 mb-6 text-left">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Run Summary</p>
        <span className="text-[10px] text-slate-400">How this run performed · read-only, no effect on your data</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* KPI 1 — TAT, the north-star metric */}
        <StatCard
          label="Turnaround Time"
          value={metrics.tatMs != null ? formatTat(metrics.tatMs) : 'In progress'}
          sub={
            metrics.tatMs != null
              ? 'Mapping start to first successful export'
              : 'Measured until the standardized file is downloaded'
          }
          accent="text-violet-700"
        />
        {/* KPI 2 — auto-mapping rate */}
        <StatCard
          label="Auto-mapping Rate"
          value={metrics.autoMappingRate != null ? `${metrics.autoMappingRate.toFixed(0)}%` : '—'}
          sub="Columns mapped without manual fixes"
        />
        {/* KPI 5 — validation errors */}
        <StatCard
          label="Validation Errors"
          value={String(metrics.validation.total)}
          sub={`GST ${metrics.validation.invalidGst} · phone ${metrics.validation.invalidPhone} · email ${metrics.validation.invalidEmail} · missing ${metrics.validation.missingValues}`}
          accent={metrics.validation.total > 0 ? 'text-rose-600' : 'text-emerald-600'}
        />
        {/* KPI 6 — transformation summary */}
        <StatCard
          label="Transformations"
          value={`${metrics.fieldsDerived + metrics.fieldsNormalized}`}
          sub={`${metrics.fieldsDerived} derived · ${metrics.fieldsNormalized} normalized · ${metrics.columnsDropped} dropped`}
        />
      </div>

      {/* KPI 3 — confidence distribution */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Confidence Distribution</p>
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
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
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

      {/* KPI 7 — export summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Export Summary</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
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
        </div>
      </div>

      {/* KPI 4 — manual review queue */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Manual Review Queue <span className="normal-case font-normal">(confidence &lt; 90) — where attention pays off most</span>
        </p>
        {metrics.reviewQueue.length === 0 ? (
          <p className="text-sm text-emerald-600">Nothing below 90% confidence — no manual review needed.</p>
        ) : (
          <div className="space-y-2">
            {metrics.reviewQueue.map(item => (
              <div
                key={`${item.sourceColumn}-${item.targetColumn ?? 'none'}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-slate-500 text-xs truncate">{item.sourceColumn}</span>
                  <svg className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <span className="font-medium text-slate-700 text-xs truncate">{item.targetColumn ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-slate-400 max-w-56 truncate" title={item.reason}>{item.reason}</span>
                  <ConfBadge value={item.confidence} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 mt-3">
        Validation counts invalid GST / phone / email values plus empty cells in mapped columns. The template
        format has no mandatory-field markers, so all mapped columns are checked equally.
      </p>
    </div>
  )
}
