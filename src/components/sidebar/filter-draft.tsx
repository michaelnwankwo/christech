"use client";

// src/components/sidebar/filter-draft.tsx
// Draft state for the filter panel (Option: staged apply). Controls inside
// the sidebar mutate ONLY this context while the sheet is open; the URL is
// untouched until "Apply" commits (router.push with the codec-built query),
// at which point the sheet dismisses. "Clear all"/"Clear category" clear the
// draft without navigating. The URL stays the single committed source of
// truth: back-button, shared links, and pagination all keep working, and the
// draft re-syncs from the URL on every query change AND on every sheet
// open/close (closing discards unsaved edits — a fresh draft next time).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useStorefrontStore } from "@/stores/storefront-store";
import {
  EMPTY_DRAFT,
  countDraftFilters,
  draftFromQuery,
  draftToQuery,
  isDraftEmpty,
  type FilterDraft,
} from "@/lib/catalog/filters-query";

type FilterDraftApi = {
  draft: FilterDraft;
  setCategory: (value: string) => void;
  toggleUsage: (value: string) => void;
  toggleBrand: (value: string) => void;
  setAvailable: (value: boolean) => void;
  setPrice: (min: string, max: string) => void;
  clearDraft: () => void;
  commit: () => void;
  /** True while a committed Apply navigation is still pending (RSC fetch). */
  isCommitPending: boolean;
  activeCount: number;
  isEmpty: boolean;
};

const FilterDraftContext = createContext<FilterDraftApi | null>(null);

export function useFilterDraft(): FilterDraftApi {
  const ctx = useContext(FilterDraftContext);
  if (!ctx) {
    throw new Error("useFilterDraft must be used within <FilterDraftProvider>");
  }
  return ctx;
}

export function FilterDraftProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const sidebarOpen = useStorefrontStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStorefrontStore((s) => s.setSidebarOpen);

  const [draft, setDraft] = useState<FilterDraft>(() =>
    draftFromQuery(new URLSearchParams(queryString))
  );

  // Re-sync on committed-query changes (Apply, back/forward, pagination) and
  // on sheet open AND close — closing discards any uncommitted draft.
  useEffect(() => {
    setDraft(draftFromQuery(new URLSearchParams(queryString)));
  }, [queryString, sidebarOpen]);

  const setCategory = useCallback(
    (category: string) => setDraft((d) => ({ ...d, category })),
    []
  );
  const toggleList = useCallback((key: "usage" | "brands", value: string) => {
    setDraft((d) => {
      const current = d[key];
      return {
        ...d,
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }, []);
  const toggleUsage = useCallback(
    (value: string) => toggleList("usage", value),
    [toggleList]
  );
  const toggleBrand = useCallback(
    (value: string) => toggleList("brands", value),
    [toggleList]
  );
  const setAvailable = useCallback(
    (available: boolean) => setDraft((d) => ({ ...d, available })),
    []
  );
  const setPrice = useCallback(
    (min: string, max: string) => setDraft((d) => ({ ...d, min, max })),
    []
  );
  const clearDraft = useCallback(() => setDraft({ ...EMPTY_DRAFT }), []);

  const [isCommitPending, startCommit] = useTransition();

  const commit = useCallback(() => {
    const qs = draftToQuery(draft).toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = queryString ? `${pathname}?${queryString}` : pathname;
    if (target !== current) {
      // Transition-wrapped: isCommitPending is true for exactly as long as
      // the server render of the new query takes — no faked spinner.
      startCommit(() => router.push(target, { scroll: false }));
    }
    setSidebarOpen(false);
  }, [draft, pathname, queryString, router, setSidebarOpen, startCommit]);

  const value = useMemo<FilterDraftApi>(
    () => ({
      draft,
      setCategory,
      toggleUsage,
      toggleBrand,
      setAvailable,
      setPrice,
      clearDraft,
      commit,
      isCommitPending,
      activeCount: countDraftFilters(draft),
      isEmpty: isDraftEmpty(draft),
    }),
    [
      draft,
      setCategory,
      toggleUsage,
      toggleBrand,
      setAvailable,
      setPrice,
      clearDraft,
      commit,
      isCommitPending,
    ]
  );

  return (
    <FilterDraftContext.Provider value={value}>
      {children}
    </FilterDraftContext.Provider>
  );
}
