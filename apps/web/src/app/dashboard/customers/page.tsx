import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  EllipsisVertical,
  Filter,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScreenShell } from "@/components/shell/screen-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type KpiCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
  chip?: string;
  chipClassName?: string;
};

const KPI_CARDS: KpiCard[] = [
  {
    label: "Total Customers",
    value: "1,284",
    icon: Users,
    iconClassName: "bg-blue-500/10 text-blue-400",
    chip: "Active",
    chipClassName:
      "border border-orange-900/30 bg-orange-950/50 text-orange-200",
  },
  {
    label: "Open Quotes",
    value: "42",
    icon: ClipboardList,
    iconClassName: "bg-slate-800 text-slate-300",
  },
  {
    label: "Pipeline Value",
    value: "$482.5k",
    icon: CircleDollarSign,
    iconClassName: "bg-slate-800/50 text-slate-300",
  },
];

const DIRECTORY_ROWS = [
  {
    id: "marcus-sterling",
    name: "Marcus Sterling",
    company: "Sterling & Associates",
    email: "m.sterling@sa-arch.com",
    status: "Active",
    quotes: "12 Quotes",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBe6xUKXRqdfxvQflUuUdmuGa234jBRPtA3veQb-_BTuGW8biE8EcTfuPCDuqquFWuBWN3Rcouw4u5QPJOgKr7AO-xuNFbQWMG3Ychq50dq7qdGG94eJDLwYqi8YyFphY3b9g8sw8QdxdQN7OvSyesX0T-0ka9kCt-fDSj3mR5BkLFGycunO9N_VkHWujWSn_9Oz3LlIaZM0VF9PlRjJRrMDsNzX4tlZJjq-Btw6rj0Ed682f2bZWGJoUPMK6d8C8lIhVo2i1CpVwU",
    statusClassName:
      "border border-emerald-900/40 bg-emerald-950/30 text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  {
    id: "elena-rodriguez",
    name: "Elena Rodriguez",
    company: "EcoBuild Solutions",
    email: "elena.r@ecobuild.dev",
    status: "Prospect",
    quotes: "3 Quotes",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuB8Fbvt3BGTgqyn6gXvR6YscVc3j1VQJZGw7RaWdTF_UD9d61e01jU_WQOg8UzklYKdbn9h74tsk2Fup4d6Gbrl60OhuxhQ1mOxYeLFD68MpN4NbdKjVzFCtQ_oJ8KiEl8LgUxQrSFZnytvHzF7mOZ4z2jKatnuZ85aB-p8_VDCAxyNN61MPhnEq_IP9c6eGYHUujWyJdVQDZQX8Qj7Fe-ZcruxFqvOh1mm5cM7OO2DHbvVanR-dOZR8siXDfg4onmTHZ8DEZBh3_M",
    statusClassName: "border border-sky-900/40 bg-sky-950/30 text-sky-300",
    dotClassName: "bg-sky-500",
  },
  {
    id: "julian-thorne",
    name: "Julian Thorne",
    company: "Thorne Residential",
    email: "julian@thorne.home",
    status: "Inactive",
    quotes: "24 Quotes",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBX8XtdVklSgYu9Hw27xN89kXxxjLgO1FTp_5Gh0ZPbb0st73kbZrSQvGcHAKYmL6Rhafm5To_TCI7DclSnnXXc88AjdiuUkdD4zHKFRYocw1WPJQknrAO8MJEKvLBYDiL0Ubqryx-wD2-U_eqXgOS7L9X-RknxFXu8OaBbfWGgsALJppMXxNP9W5m39aW4mH3zg1tA-Wx8xQhmtTXux5b9uiITduvcRDTSo9kZhKxxgmTPOJncEj01FQEp7a1JFvjSjaodcka7sNM",
    statusClassName: "bg-slate-800 text-slate-400",
    dotClassName: "bg-slate-500",
  },
  {
    id: "sarah-jenkins",
    name: "Sarah Jenkins",
    company: "Skyline Partners",
    email: "s.jenkins@skyline.co",
    status: "Active",
    quotes: "8 Quotes",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCASgNVHlV3QWQU9MxceI3OZXpwmIe2JhjyJ_i8W2Molxxja42H9PdgQkXAWjKQ3yudo-Rx8X7rkjCCXOQhVJI2OAQ2RXhho2RNc8JB45Q9VVI-UW8P1ixjCad8JXidkhh2lS5k5bniX1WdcGTzpGo98cEhgmMXuycMrKKOXyA1xmsI9maOiwY1QjV6cHpYVP6M8k8sRMQJPXD6BG5PxSRqy0-4vCB6kQPshLwDX9TdOsRYzp4uyexTx9IPHoXgn3Lh5MxzZhhD8zY",
    statusClassName:
      "border border-emerald-900/40 bg-emerald-950/30 text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  {
    id: "david-chen",
    name: "David Chen",
    company: "Metropolis Design",
    email: "dchen@metropolis.inc",
    status: "Urgent",
    quotes: "1 Quote",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC2LXsqQO_hweae0IPVPyBkkWSwEK0tvUnDgpShHPLkbipjbHbHq6w5lxuAQq4MCKhsPgJuuEIR8yGOLzHtTOz04ZZb0XlweK1Y2pYxMtADSVkykl5opQyZrdQjXLtfdbFsFTGyjvD_CqpBFk-sKrgbWN1JcygUNRmtDW-buSxFM7gBi8yXDPry9DK5y3q9fPgdN0dPbR2VKenNx1yfXS-XLE6waGu9mAdPw6B1WZ91D-iLIW5zQMimBz8Qfcn9HNeOE98Bgv7fYGc",
    statusClassName:
      "border border-orange-900/40 bg-orange-950/40 text-orange-300",
    dotClassName: "bg-orange-400",
  },
] as const;

export default function CustomersPage() {
  return (
    <ScreenShell
      title="Customer Directory"
      description="Manage your architectural client portfolio and quote history."
      activeTab="customers"
    >
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white">
              Customer Directory
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage your architectural client portfolio and quote history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-9 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button
              variant="outline"
              className="h-9 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {KPI_CARDS.map((kpi) => (
            <article
              key={kpi.label}
              className="rounded-2xl border border-slate-800/50 bg-slate-900 p-6"
            >
              <div className="mb-4 flex items-start justify-between">
                <span
                  className={`inline-flex rounded-lg p-2 ${kpi.iconClassName}`}
                >
                  <kpi.icon className="h-5 w-5" />
                </span>
                {kpi.chip ? (
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${kpi.chipClassName}`}
                  >
                    {kpi.chip}
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-medium text-slate-400">{kpi.label}</p>
              <p className="mt-1 text-2xl font-black text-white">{kpi.value}</p>
            </article>
          ))}
          <article className="flex flex-col justify-between rounded-2xl bg-sky-600 p-6 shadow-lg shadow-sky-600/20">
            <div className="flex items-center justify-between text-sky-100">
              <span className="text-sm font-semibold">Growth Pulse</span>
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="mt-8">
              <p className="text-3xl font-black text-white">+12%</p>
              <p className="mt-1 text-xs text-sky-100/80">Vs. last month</p>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-900">
          <header className="flex flex-col gap-4 border-b border-slate-800/40 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-bold text-white">All Records</h3>
              <div className="flex rounded-lg bg-slate-950 p-1">
                <Button
                  size="sm"
                  className="h-7 bg-slate-800 text-xs text-sky-300 hover:bg-slate-700"
                >
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                >
                  Residential
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                >
                  Commercial
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Showing 1-10 of 1,284</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled
                  className="text-slate-500 hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-slate-500 hover:bg-slate-800"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full">
              <thead>
                <tr className="bg-slate-950/50 text-left text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Email Address</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Total Quotes</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {DIRECTORY_ROWS.map((row) => (
                  <tr key={row.id} className="group hover:bg-slate-800/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-10">
                          <AvatarImage src={row.avatarUrl} alt={row.name} />
                          <AvatarFallback>{row.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-slate-100 group-hover:text-sky-300">
                            {row.name}
                          </p>
                          <p className="text-xs text-slate-500">{row.company}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-400">
                      {row.email}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${row.statusClassName}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${row.dotClassName}`}
                        />
                        {row.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-300">
                      {row.quotes}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-slate-600 hover:bg-slate-800 hover:text-blue-400"
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex justify-center border-t border-slate-800/40 bg-slate-950/40 px-4 py-4">
            <nav className="flex items-center gap-1 text-xs font-bold">
              <Button size="icon-sm" className="bg-sky-600 text-white hover:bg-sky-500">
                1
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-slate-400 hover:bg-slate-800"
              >
                2
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-slate-400 hover:bg-slate-800"
              >
                3
              </Button>
              <span className="px-2 text-slate-600">...</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-slate-400 hover:bg-slate-800"
              >
                128
              </Button>
            </nav>
          </footer>
        </section>

        <section className="grid grid-cols-1 gap-8 pb-8 md:grid-cols-3">
          <article className="relative overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-900 p-8 md:col-span-2">
            <div className="absolute right-6 top-4 opacity-5">
              <TrendingUp className="h-24 w-24 text-white" />
            </div>
            <h3 className="mb-6 text-xl font-black text-white">Directory Insights</h3>
            <div className="relative z-10 space-y-6">
              <div className="flex gap-4">
                <div className="h-12 w-1 rounded-full bg-sky-500" />
                <div>
                  <p className="font-bold text-slate-100">Client retention up 4.2%</p>
                  <p className="text-sm text-slate-400">
                    Architectural services for repeat residential clients have
                    increased this quarter.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="h-12 w-1 rounded-full bg-orange-500" />
                <div>
                  <p className="font-bold text-slate-100">
                    High-priority attention needed
                  </p>
                  <p className="text-sm text-slate-400">
                    David Chen has an expired quote that requires follow-up
                    within 24 hours.
                  </p>
                </div>
              </div>
            </div>
          </article>

          <article className="flex flex-col items-center justify-center rounded-2xl border border-slate-800/50 bg-slate-900/60 p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
              <Users className="h-7 w-7 text-sky-300" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-white">Grow your portfolio</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-400">
              Our AI analyzes your customer interactions to suggest perfect timing
              for new quotes.
            </p>
            <Button className="w-full bg-white text-slate-950 hover:bg-sky-500 hover:text-white">
              View Lead Suggestions
            </Button>
          </article>
        </section>
      </div>
    </ScreenShell>
  );
}
