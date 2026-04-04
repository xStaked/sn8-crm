"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/inbox", label: "Inbox", exact: true },
  { href: "/dashboard/quotes", label: "Quotes", exact: false },
  { href: "/dashboard/customers", label: "Customers", exact: true },
  { href: "/dashboard/analytics", label: "Analytics", exact: true },
] as const;

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <p className="text-sm font-bold text-primary md:hidden">sn8labs</p>
          <div className="relative hidden w-full max-w-sm md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Global search..."
              className="h-10 rounded-full border-border/80 bg-card pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Button>
          <div className="mx-2 hidden h-8 w-px bg-border sm:block" />
          <div className="hidden items-center gap-3 sm:flex">
            <div className="text-right">
              <p className="text-xs font-bold text-foreground">Alex Curator</p>
              <p className="text-[11px] text-muted-foreground">Admin Access</p>
            </div>
            <Avatar className="h-9 w-9 ring-2 ring-primary/20">
              <AvatarFallback>AC</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      <nav className="border-t border-border px-3 py-2 md:hidden">
        <div className="flex gap-1 overflow-x-auto">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
