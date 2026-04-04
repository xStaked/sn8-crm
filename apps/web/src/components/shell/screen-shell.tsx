import type { ReactNode } from "react";

type ScreenShellProps = {
  title: string;
  description: string;
  activeTab?: "dashboard" | "inbox" | "quotes" | "customers" | "analytics";
  children: ReactNode;
};

export function ScreenShell({
  title,
  description,
  children,
}: ScreenShellProps) {
  return (
    <section className="flex min-h-full flex-col bg-background">
      <header className="border-b border-border px-4 py-4 md:px-8">
        <h1 className="text-lg font-semibold text-foreground md:text-xl">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">{description}</p>
      </header>
      <div className="flex-1 p-4 md:p-6">{children}</div>
    </section>
  );
}
