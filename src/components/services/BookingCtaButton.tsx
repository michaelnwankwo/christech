"use client";

// src/components/services/BookingCtaButton.tsx
// "Request booking" on service cards. A plain <Link> leaves the card inert
// for the whole server round-trip; this keeps the same href (middle-click /
// new-tab semantics intact — the interception only handles plain left-click)
// but wraps the navigation in a React transition so the button shows the
// branded inline spinner while /booking's RSC payload loads, and cannot be
// double-fired. Attaching onClick changes no DOM, so there is no hydration
// mismatch even though the click behavior is client-only.

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLoader } from "@/components/ui/BrandLoader";

export function BookingCtaButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, startNav] = useTransition();

  return (
    <Link
      className="btn btn--sm"
      href={`/booking?service=${slug}`}
      aria-busy={pending || undefined}
      onClick={(event) => {
        const modified =
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || event.button !== 0 || modified) {
          return; // let the browser handle new-tab / modified-click semantics
        }
        event.preventDefault();
        startNav(() => router.push(`/booking?service=${slug}`));
      }}
    >
      {pending ? <BrandLoader variant="inline" label="" /> : "Request booking"}
    </Link>
  );
}
