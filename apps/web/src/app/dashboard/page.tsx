import Link from "next/link";
import Image from "next/image";
import {
  Bot,
  ChevronRight,
  CircleDot,
  DollarSign,
  Gauge,
  Group,
  MessageSquare,
  User,
  Trash2,
} from "lucide-react";
import { ScreenShell } from "@/components/shell/screen-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const METRICS = [
  {
    label: "Total Customers",
    value: "2,842",
    delta: "+12.5%",
    tone: "emerald",
    icon: Group,
  },
  {
    label: "AI Conversations",
    value: "15,920",
    delta: "84% AI Rate",
    tone: "violet",
    icon: Bot,
  },
  {
    label: "Pending Quotes",
    value: "24",
    delta: "Action Req.",
    tone: "amber",
    icon: MessageSquare,
  },
  {
    label: "Revenue Forecast",
    value: "$142.8k",
    delta: "MTD",
    tone: "sky",
    icon: DollarSign,
  },
] as const;

const QUOTES_NEEDING_ACTION = [
  {
    initials: "JD",
    customer: "New Quote for Jane Doe",
    context: "Residential Architecture Package",
    updatedAt: "Updated 2h ago",
    amount: "$12,400.00",
    status: "Urgent",
    statusColor: "text-orange-400",
  },
  {
    initials: "BM",
    customer: "Commercial Bid: Blue Mountain",
    context: "Urban Development Phase 1",
    updatedAt: "Updated 5h ago",
    amount: "$85,000.00",
    status: "Review",
    statusColor: "text-sky-400",
  },
  {
    initials: "SR",
    customer: "Draft: Sarah Richards",
    context: "Interior Consultation",
    updatedAt: "Updated 1d ago",
    amount: "$1,200.00",
    status: "Draft",
    statusColor: "text-slate-500",
  },
] as const;

const RECENT_CONVERSATIONS = [
  {
    customer: "Elena Vance",
    time: "12m ago",
    message:
      '"Can we adjust the structural timeline for the second phase of the project?"',
    state: "AI Handled",
    stateClass: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCCa7HMJ9d_OYMcwPCQFZIGg9QTZ8RD3yRga6XlWQeuAoayqpbV1KlZHpLygjZQSjDNFyYaB7XSA2lV5fRN56WE8UFfvs958NhfduC41iP41WEJtJHbc24GZl_a_iEF0Shg6PXSQPoG9qItbnQBPkkrq-UjFLTzwIWhF2hjv_PnW-VQBFTZFtWmj6-HF5BElWihBt7hDIOYdQQozNLzwGjCIrx2hTO8RJz8Tr9SYc3o9Wp7m06RdR0x_PDuNcokEJMBhx03TXCKq7Q",
    indicator: "bot",
  },
  {
    customer: "Marcus Thorne",
    time: "1h ago",
    message:
      '"The latest quote looks great, but I had one question about the material sourcing."',
    state: "Transfer to Agent",
    stateClass: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBZ3hYNb4318I3fivqXp5A6oW-eIjTdQLK1ih_3LP0v4bcx6nzX1i8IHcWt24q5KSwtUSZgAmizkjIeyxb_G3yY9meZwtMpunHKuNxGagOyqkvG14jv_FYKcgNkz53HbZE0tMt3a52AvzMkLbCqRLTWzN6UBnyvalljNF86I9_df-B1UWqRySJ9yRX25T3fKofY-gV0P-uTElJRLKMxl1mVMgkWsfhgQUgOZPHPA-X-v7KwHM-Ege5t_I3pAcwENUTUYh1RNf8bxHE",
    indicator: "agent",
  },
  {
    customer: "New Lead #092",
    time: "4h ago",
    message: "Initial inquiry regarding site survey for new construction.",
    state: "Queued",
    stateClass: "border-slate-700 bg-slate-800 text-slate-500",
    indicator: "none",
  },
] as const;

function metricToneClasses(tone: (typeof METRICS)[number]["tone"]) {
  if (tone === "emerald") {
    return {
      iconWrap: "bg-blue-500/10 text-blue-500",
      delta: "bg-emerald-500/10 text-emerald-400",
    };
  }

  if (tone === "violet") {
    return {
      iconWrap: "bg-orange-500/10 text-orange-400",
      delta: "bg-slate-800 text-slate-400",
    };
  }

  if (tone === "amber") {
    return {
      iconWrap: "bg-amber-500/10 text-amber-400",
      delta: "bg-red-500/10 text-red-400",
    };
  }

  if (tone === "sky") {
    return {
      iconWrap: "bg-blue-500/10 text-blue-400",
      delta: "bg-blue-500/10 text-blue-400",
    };
  }

  return {
    iconWrap: "bg-blue-500/10 text-blue-400",
    delta: "bg-slate-800 text-slate-300",
  };
}

export default function DashboardPage() {
  return (
    <ScreenShell
      title="Command Center"
      description="Real-time precision monitoring for sn8labs operations."
      activeTab="dashboard"
    >
      <div className="mx-auto w-full max-w-7xl space-y-8 p-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white">
              Command Center
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-400">
              Real-time precision monitoring for sn8labs operations.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-1.5">
            <CircleDot className="h-3 w-3 animate-pulse text-sky-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Live System Active
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {METRICS.map((metric) => {
            const Icon = metric.icon;
            const tone = metricToneClasses(metric.tone);

            return (
              <article
                key={metric.label}
                className="relative overflow-hidden rounded-xl bg-slate-900 p-6"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className={`rounded-lg p-2 ${tone.iconWrap}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold ${tone.delta}`}
                  >
                    {metric.delta}
                  </span>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-1 text-3xl font-black text-white">
                  {metric.value}
                </p>
                <Icon className="pointer-events-none absolute -bottom-4 -right-4 h-20 w-20 text-white/5" />
              </article>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Quotes Needing Action</h3>
              <Link
                href="/dashboard/quotes"
                className="inline-flex items-center gap-1 text-sm font-semibold text-sky-400 hover:text-sky-300"
              >
                View All Quotes
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="space-y-3">
              {QUOTES_NEEDING_ACTION.map((quote) => (
                <article
                  key={quote.customer}
                  className="group flex flex-col gap-4 rounded-xl border border-transparent bg-slate-900 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                      {quote.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {quote.customer}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {quote.context} •{" "}
                        <span className="font-medium text-slate-500">
                          {quote.updatedAt}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="hidden text-right sm:block">
                      <p className="text-sm font-bold text-white">{quote.amount}</p>
                      <p
                        className={`text-[10px] font-bold uppercase tracking-[0.16em] ${quote.statusColor}`}
                      >
                        {quote.status}
                      </p>
                    </div>
                    <Button type="button" size="sm" className="h-8 px-3">
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-slate-500 hover:bg-transparent hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <article className="relative min-h-[216px] overflow-hidden rounded-2xl bg-blue-600 p-6 text-white">
                <h4 className="text-lg font-bold">Precision AI Performance</h4>
                <p className="mt-2 max-w-[180px] text-xs text-blue-100">
                  98.2% Accuracy on automated technical quotes this week.
                </p>
                <div className="mt-8 flex items-end gap-1">
                  {[4, 8, 12, 16, 20].map((height) => (
                    <span
                      key={height}
                      className="w-2 rounded-t-sm bg-white"
                      style={{ height: `${height * 4}px`, opacity: height / 20 }}
                    />
                  ))}
                </div>
                <Gauge className="absolute -right-8 top-4 h-28 w-28 text-white/10" />
              </article>

              <article className="flex min-h-[216px] flex-col justify-between rounded-2xl bg-slate-900 p-6">
                <div>
                  <h4 className="text-lg font-bold text-blue-500">Team Capacity</h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Resource allocation monitor.
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full w-[70%] rounded-full bg-blue-500" />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    <span>Utilities Active</span>
                    <span>70%</span>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <aside className="space-y-6">
            <h3 className="text-xl font-bold text-white">Recent Conversations</h3>
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="space-y-6 p-6">
                {RECENT_CONVERSATIONS.map((conversation) => (
                  <article
                    key={conversation.customer}
                    className="flex items-start gap-3 border-b border-slate-800 pb-4 last:border-none last:pb-0"
                  >
                    <div className="relative">
                      {conversation.indicator === "none" ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-500">
                          <User className="h-4 w-4" />
                        </div>
                      ) : (
                        <Image
                          src={conversation.avatarUrl}
                          alt={conversation.customer}
                          className="h-10 w-10 rounded-full object-cover"
                          width={40}
                          height={40}
                        />
                      )}
                      {conversation.indicator === "bot" ? (
                        <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-slate-900 bg-orange-500">
                          <Bot className="h-2.5 w-2.5 fill-white text-white" />
                        </div>
                      ) : null}
                      {conversation.indicator === "agent" ? (
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-900 bg-blue-500" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {conversation.customer}
                        </p>
                        <span className="text-[10px] text-slate-500">
                          {conversation.time}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                        {conversation.message}
                      </p>
                      <Badge
                        variant="outline"
                        className={`mt-2 rounded px-2 py-0.5 text-[10px] font-bold ${conversation.stateClass}`}
                      >
                        {conversation.state}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
              <Link
                href="/dashboard/inbox"
                className="flex items-center justify-center gap-2 border-t border-slate-800 bg-slate-800 py-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              >
                Go to Inbox
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
                <h4 className="text-sm font-bold text-white">Lead Heat Index</h4>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Urban Projects
                  </span>
                  <div className="flex -space-x-2">
                    {["AS", "JK"].map((initials) => (
                      <span
                        key={initials}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-900 bg-slate-800 text-[9px] font-semibold text-slate-300"
                      >
                        {initials}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Residential Retrofit
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">
                    Rising Fast
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </ScreenShell>
  );
}
