// src/components/layout/DemoBanner.tsx
// Persistent, unmissable notice while the offline demo layer is active.
// Rendered by the root layout ONLY when the server-side probe determined
// the database is unavailable in a demo-eligible environment — the UI never
// pretends demo rows are real silently.

import { DEMO_NOTE } from "@/lib/demo/data";

export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <span aria-hidden="true">⚠︎</span> {DEMO_NOTE}
    </div>
  );
}
