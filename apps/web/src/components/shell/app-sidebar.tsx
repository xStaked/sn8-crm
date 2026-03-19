"use client";

import { useRouter } from "next/navigation";
import { LogOut, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiFetch, clearStoredAccessToken } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AppSidebar() {
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
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r border-border bg-card py-4">
      <nav className="flex flex-1 flex-col items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Inbox"
          aria-label="Inbox"
          className={cn(
            "h-10 w-10 text-foreground",
            "bg-accent/20 hover:bg-accent/20 hover:text-foreground",
          )}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </nav>

      <Separator className="my-2 w-8" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Cerrar sesion"
        aria-label="Cerrar sesion"
        className="h-10 w-10 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
        onClick={handleLogout}
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </aside>
  );
}
