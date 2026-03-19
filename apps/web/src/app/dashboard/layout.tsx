"use client";

import { Suspense } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ConversationList } from "@/components/shell/conversation-list";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 overflow-hidden">
        <Suspense fallback={<div className="w-80 shrink-0 border-r border-border bg-background" />}>
          <ConversationList />
        </Suspense>
        <main className="flex-1 overflow-auto border-l border-border">
          {children}
        </main>
      </div>
    </div>
  );
}
