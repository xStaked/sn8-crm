"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ConversationList } from "@/components/shell/conversation-list";
import { TopNavbar } from "@/components/shell/top-navbar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const showConversationList =
    pathname === "/dashboard/inbox" || pathname.startsWith("/dashboard/quotes/");

  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopNavbar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {showConversationList ? (
            <Suspense
              fallback={
                <div className="hidden w-96 shrink-0 border-r border-border bg-background lg:block" />
              }
            >
              <ConversationList />
            </Suspense>
          ) : null}
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
