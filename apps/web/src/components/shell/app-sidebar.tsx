"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Quote,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiFetch, clearStoredAccessToken } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/inbox",
    label: "Inbox",
    icon: MessageSquare,
    exact: true,
  },
  {
    href: "/dashboard/quotes",
    label: "Quotes",
    icon: Quote,
    exact: false,
  },
  {
    href: "/dashboard/customers",
    label: "Customers",
    icon: Users,
    exact: true,
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: BarChart3,
    exact: true,
  },
];

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiFetch("/auth/logout", { method: "DELETE" });
    } finally {
      clearStoredAccessToken();
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card/80 backdrop-blur md:flex">
      <div className="border-b border-border px-6 py-6">
        <p className="text-lg font-black tracking-tight text-foreground">
          sn8labs CRM
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Precision Curator
        </p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href, item.exact);

          return (
            <Link key={item.href} href={item.href} className="block">
              <Button
                type="button"
                variant="ghost"
                size="default"
                title={item.label}
                aria-label={item.label}
                className={cn(
                  "h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  active &&
                    "border border-border bg-accent/80 text-foreground shadow-sm",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 p-3">
        <Link href="/dashboard/quotes" className="block">
          <Button type="button" className="h-11 w-full justify-center gap-2 rounded-xl">
            <Plus className="h-4 w-4" />
            Create New Quote
          </Button>
        </Link>

        <Separator className="my-2" />

        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full justify-start gap-2 rounded-xl text-muted-foreground"
        >
          <CircleHelp className="h-4 w-4" />
          Help
        </Button>

        <Button
          type="button"
          variant="ghost"
          title="Cerrar sesion"
          aria-label="Cerrar sesion"
          className="h-10 w-full justify-start gap-2 rounded-xl text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
