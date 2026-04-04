import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { ScreenShell } from "@/components/shell/screen-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const lineItems = [
    {
      description: "Cloud Architecture Re-design",
      detail: "Multi-region AWS landing zone setup with Terraform",
      qty: "1",
      rate: "$12,500",
      total: "$12,500",
    },
    {
      description: "Data Migration Service",
      detail: "50TB on-premise to S3/Glacier with validation",
      qty: "50",
      rate: "$150",
      total: "$7,500",
    },
    {
      description: "Security & Compliance Audit",
      detail: "SOC2 readiness and vulnerability assessment",
      qty: "2",
      rate: "$4,000",
      total: "$8,000",
    },
  ] as const;

  const chatContext = [
    {
      author: "Sarah",
      message:
        "We really need this live before the Q4 peak. Can we expedite the data migration phase?",
    },
    {
      author: "AI Agent",
      message:
        "Understood. I'll prioritize the migration workstreams. Does the budget permit for weekend labor?",
    },
    {
      author: "Sarah",
      message: "Yes, as long as it's within the $30k ballpark total.",
    },
  ] as const;

  return (
    <ScreenShell
      title={`Quote Detail · ${params.id.toUpperCase()}`}
      description="Granular pricing, AI rationale, and customer context for approval."
      activeTab="quotes"
    >
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
              <span className="text-slate-500">Quotes</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              <span className="text-sky-300">{params.id.toUpperCase()}</span>
            </div>
            <div className="mb-3 flex items-center gap-3">
              <Badge className="bg-sky-500/20 text-sky-300 hover:bg-sky-500/25">
                AI Generated
              </Badge>
              <span className="text-xs text-slate-500">Created Oct 24, 2023</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
              Quote for Global Logistics Corp
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Enterprise Cloud Infrastructure Migration and Security Audit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4" />
              Edit Quote
            </Button>
            <Button
              variant="destructive"
              className="h-10 bg-rose-900/50 text-rose-200 hover:bg-rose-800/60"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button className="h-10 bg-sky-600 text-white hover:bg-sky-500">
              <Check className="h-4 w-4" />
              Accept Quote
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
              <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  Itemized Services
                </h3>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/40">
                      <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Description
                      </th>
                      <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Qty
                      </th>
                      <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Rate
                      </th>
                      <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {lineItems.map((item) => (
                      <tr
                        key={item.description}
                        className="odd:bg-slate-800/50"
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-100">
                            {item.description}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-300">
                          {item.qty}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-300">
                          {item.rate}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-sky-300">
                          {item.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="flex justify-end border-t border-dashed border-slate-700 px-6 py-5">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-200">$28,000.00</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>AI Volume Discount (5%)</span>
                    <span className="font-semibold text-amber-300">-$1,400.00</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-lg font-black text-white">
                    <span>Total</span>
                    <span className="text-sky-300">$26,600.00</span>
                  </div>
                </div>
              </footer>
            </article>

            <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-700 to-blue-900 p-7 text-white shadow-xl shadow-sky-900/40">
              <div className="relative z-10">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-sky-100">
                  <ShieldCheck className="h-4 w-4" />
                  AI Rationale & Confidence
                </h3>
                <p className="text-sm text-blue-100/90">
                  This quote was generated based on chat history where the
                  client emphasized security-first delivery and a strict 60-day
                  timeline.
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-blue-100/90">
                  <li>
                    Migration pricing adjusted +15% for urgent weekend deployment.
                  </li>
                  <li>
                    Loyalty discount applied from three successful previous contracts.
                  </li>
                  <li>
                    Compliance audit added as mandatory for fintech expansion.
                  </li>
                </ul>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Badge className="bg-white/15 text-white hover:bg-white/20">
                    Confidence: 96.8%
                  </Badge>
                  <Badge className="bg-white/15 text-white hover:bg-white/20">
                    Risk: Low
                  </Badge>
                  <Badge className="bg-white/15 text-white hover:bg-white/20">
                    Margin Safe
                  </Badge>
                </div>
              </div>
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/20 blur-3xl" />
            </article>
          </div>

          <aside className="space-y-6 xl:col-span-4">
            <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Customer Profile
              </h3>
              <div className="mt-5 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-800 text-lg font-black text-sky-300">
                  GL
                </div>
                <div>
                  <p className="text-base font-bold text-slate-100">
                    Global Logistics Corp
                  </p>
                  <p className="text-xs text-slate-500">Enterprise account</p>
                </div>
              </div>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex items-start gap-2 text-slate-300">
                  <UserRound className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Primary Contact
                    </p>
                    <p>Sarah Jenkins • CTO</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <Mail className="mt-0.5 h-4 w-4 text-slate-500" />
                  <span>s.jenkins@globallogistics.com</span>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <Phone className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Phone
                    </p>
                    <p>+1 (212) 555-0197</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                  Account Health: Excellent
                </span>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Chat Context
                </h3>
                <Badge
                  variant="outline"
                  className="border-slate-700 bg-slate-950 text-[10px] text-slate-300"
                >
                  Last 24h
                </Badge>
              </div>
              <div className="space-y-3">
                {chatContext.map((item, idx) => (
                  <div
                    key={`${item.author}-${idx}`}
                    className="rounded-lg border-l-2 border-sky-500 bg-slate-800/70 p-3 text-xs leading-relaxed text-slate-300"
                  >
                    <span className="font-bold text-sky-300">{item.author}:</span>{" "}
                    {item.message}
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/inbox"
                className="mt-6 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-300 transition-colors hover:bg-slate-700 hover:text-sky-200"
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                View Full Transcript
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </article>

            <section className="grid grid-cols-2 gap-3">
              <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Profit Margin
                </p>
                <p className="mt-1 text-xl font-black text-white">32.4%</p>
              </article>
              <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Est. Delivery
                </p>
                <p className="mt-1 text-xl font-black text-white">45 Days</p>
              </article>
            </section>
          </aside>
        </section>
      </div>
    </ScreenShell>
  );
}
