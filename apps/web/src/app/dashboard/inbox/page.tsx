import { Suspense } from "react";
import { DetailPanel } from "@/components/shell/detail-panel";

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="h-full bg-background" />}>
      <DetailPanel />
    </Suspense>
  );
}

