import { Bolt, TrendingUp } from "lucide-react";
import { ScreenShell } from "@/components/shell/screen-shell";
import { Badge } from "@/components/ui/badge";

const GROWTH_BARS = [40, 45, 42, 55, 65, 75, 70, 85, 92, 100] as const;

const FUNNEL_STAGES = [
  { label: "Awareness", value: "1.2M", width: 100 },
  { label: "Engagement", value: "450K", width: 65 },
  { label: "Quote Generation", value: "82K", width: 40 },
  { label: "Conversion", value: "14K", width: 22 },
] as const;

const AUDIT_ROWS = [
  {
    agentId: "#NEO-742",
    sector: "Financial Services",
    accuracy: "99.42%",
    responseTime: "14ms",
    status: "Optimal",
  },
  {
    agentId: "#ORC-911",
    sector: "Global Logistics",
    accuracy: "98.15%",
    responseTime: "22ms",
    status: "Optimal",
  },
  {
    agentId: "#VUL-404",
    sector: "Healthcare Tech",
    accuracy: "97.89%",
    responseTime: "104ms",
    status: "Lagging",
  },
] as const;

export default function AnalyticsPage() {
  return (
    <ScreenShell
      title="Analytics"
      description="Real-time performance metrics and predictive modeling for the sn8labs ecosystem."
      activeTab="analytics"
    >
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-10 w-1 rounded-full bg-blue-500" />
            <h2 className="text-3xl font-black uppercase tracking-tight text-white">
              Deep Intelligence
            </h2>
          </div>
          <p className="max-w-3xl text-sm text-slate-300">
            Real-time performance metrics and predictive modeling for the
            sn8labs ecosystem. Architecting raw data into actionable
            intelligence.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          <article className="xl:col-span-3 rounded-2xl border border-slate-800 bg-slate-900 p-7">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Overall Growth
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight text-white">
                  $14,290,000.00
                </p>
              </div>
              <div className="text-right">
                <p className="inline-flex items-center gap-1 text-sm font-semibold text-blue-300">
                  <TrendingUp className="h-4 w-4" />
                  12.4%
                </p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  vs previous quarter
                </p>
              </div>
            </div>

            <div className="flex h-64 items-end gap-1.5 rounded-xl bg-slate-950/60 p-3">
              {GROWTH_BARS.map((height, idx) => (
                <div
                  key={height + idx}
                  className="flex-1 rounded-t-sm bg-blue-500/20 transition hover:bg-blue-500/50"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              AI Efficiency
            </p>
            <p className="mt-2 text-3xl font-black text-white">98.2%</p>

            <div className="relative mx-auto my-6 h-32 w-32">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="rgb(51 65 85)"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="rgb(59 130 246)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={264}
                  strokeDashoffset={5}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Bolt className="h-8 w-8 text-blue-400" />
              </div>
            </div>

            <p className="text-center text-xs leading-relaxed text-slate-400">
              System precision remains above benchmark for 18 consecutive days.
            </p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-7">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Conversion Funnel
            </h3>
            <div className="mt-6 space-y-5">
              {FUNNEL_STAGES.map((stage) => (
                <div key={stage.label}>
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <span>{stage.label}</span>
                    <span className="text-blue-300">{stage.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${stage.width}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-7 pb-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Global Sector Distribution
              </h3>
              <p className="mt-2 text-xl font-black text-white">
                Dominance in APAC Tech
              </p>
            </div>
            <div className="relative min-h-[300px] bg-slate-950 p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.2),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.2),_transparent_40%)]" />
              <div className="relative h-full rounded-xl border border-slate-800 bg-slate-900/40 p-4 backdrop-blur-sm">
                <div className="mb-4 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Regional concentration
                </div>
                <div className="flex h-[220px] items-end justify-between gap-3">
                  <div className="flex-1 rounded-md bg-slate-800 p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-blue-300">
                      North America
                    </p>
                    <p className="mt-2 text-2xl font-black text-white">42%</p>
                  </div>
                  <div className="flex-1 rounded-md bg-slate-800 p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-blue-300">
                      APAC Cluster
                    </p>
                    <p className="mt-2 text-2xl font-black text-white">58%</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <header className="border-b border-slate-800 p-7">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              AI Performance Audit
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Detailed breakdown of neural agent response accuracy by sector.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="bg-slate-950 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-7 py-4">Agent ID</th>
                  <th className="px-7 py-4">Sector</th>
                  <th className="px-7 py-4">Accuracy</th>
                  <th className="px-7 py-4">Response Time</th>
                  <th className="px-7 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {AUDIT_ROWS.map((row) => (
                  <tr
                    key={row.agentId}
                    className="transition-colors hover:bg-slate-800/40"
                  >
                    <td className="px-7 py-4 font-mono text-xs text-blue-300">
                      {row.agentId}
                    </td>
                    <td className="px-7 py-4 text-sm font-semibold text-slate-100">
                      {row.sector}
                    </td>
                    <td className="px-7 py-4 text-sm text-slate-100">
                      {row.accuracy}
                    </td>
                    <td className="px-7 py-4 text-sm text-slate-400">
                      {row.responseTime}
                    </td>
                    <td className="px-7 py-4">
                      <Badge
                        className={
                          row.status === "Optimal"
                            ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
                            : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/20"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ScreenShell>
  );
}
