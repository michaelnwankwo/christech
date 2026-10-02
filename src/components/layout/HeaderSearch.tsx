"use client";

// src/components/layout/HeaderSearch.tsx
// Catalog search for the site header, in two presentations fed by one hook:
//
//   • HeaderSearch  — desktop: sleek inline input between the mode pills and
//     the currency/account cluster, with a ⌘K / Ctrl+K shortcut badge, live
//     instant results in a dropdown popover, and full keyboard navigation.
//   • MobileSearch  — ≤768px: a search toggle icon in the top bar (between
//     the brand logo and the cart) that expands a full-width search bar just
//     below the sticky header with a slide/fade transition.
//
// Behavior: typing ≥2 characters fetches live suggestions from /api/search
// (debounced 250ms, stale requests aborted). Choosing a suggestion routes to
// the product page; submitting routes to /products?search=… so the query is
// shareable, back-button friendly, and filtered server-side.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CurrencyPrice } from "@/components/products/CurrencyPrice";
import {
  SEARCH_MIN_CHARS,
  type CatalogSearchResult,
} from "@/lib/catalog/search";

const SEARCH_DEBOUNCE_MS = 250;

type CatalogSearchState = {
  query: string;
  setQuery: (value: string) => void;
  results: CatalogSearchResult[];
  loading: boolean;
  /** Popover visibility is caller-owned (focus vs. toggle semantics). */
  open: boolean;
  setOpen: (open: boolean) => void;
  activeIndex: number;
  inputKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    onNavigate?: () => void
  ) => void;
  goToResult: (result: CatalogSearchResult, onNavigate?: () => void) => void;
  submitSearch: (onNavigate?: () => void) => void;
  reset: () => void;
};

/** Shared live-search engine behind both header presentations. */
function useCatalogSearch(): CatalogSearchState {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Route changes close the popover and clear the draft, like MobileNav.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const trimmed = query.trim();
  const searchable = trimmed.length >= SEARCH_MIN_CHARS;

  // Debounced live fetch with stale-request abortion.
  useEffect(() => {
    if (!searchable) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (!response.ok) throw new Error("search_failed");
        const payload = (await response.json()) as {
          results?: CatalogSearchResult[];
        };
        setResults(payload.results ?? []);
        setActiveIndex(-1);
      } catch {
        // Aborted or offline: keep whatever was there; the "view all" row
        // still routes to the full server-filtered results page.
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, trimmed]);

  const goToResult = useCallback(
    (result: CatalogSearchResult, onNavigate?: () => void) => {
      setOpen(false);
      onNavigate?.();
      router.push(`/products/${result.slug}`);
    },
    [router]
  );

  const submitSearch = useCallback(
    (onNavigate?: () => void) => {
      if (!searchable) return;
      setOpen(false);
      onNavigate?.();
      router.push(`/products?search=${encodeURIComponent(trimmed)}`);
    },
    [router, searchable, trimmed]
  );

  const inputKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLInputElement>,
      onNavigate?: () => void
    ) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        setResults((current) => {
          if (!current.length) return current;
          setActiveIndex((index) => {
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const next = index + delta;
            if (next < 0) return current.length - 1;
            if (next >= current.length) return 0;
            return next;
          });
          return current;
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          goToResult(results[activeIndex], onNavigate);
        } else {
          submitSearch(onNavigate);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    },
    [activeIndex, goToResult, results, submitSearch]
  );

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setLoading(false);
    setOpen(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    open,
    setOpen,
    activeIndex,
    inputKeyDown,
    goToResult,
    submitSearch,
    reset,
  };
}

/** Lucide-equivalent magnifier (24×24, stroke = currentColor). */
function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * Shared suggestion list (desktop popover body + mobile panel body).
 * Pure presentation; navigation side effects close the host surface.
 */
function SearchSuggestions(props: {
  search: CatalogSearchState;
  listboxId: string;
  onNavigate: () => void;
}) {
  const { search, listboxId, onNavigate } = props;
  if (!search.open) return null;

  return (
    <div className="search-sug" id={listboxId} role="listbox">
      {search.loading && search.results.length === 0 ? (
        <p className="search-sug__foot">Searching…</p>
      ) : null}
      {!search.loading && search.results.length === 0 ? (
        <p className="search-sug__foot">
          No quick matches — press Enter to search the full catalog.
        </p>
      ) : null}
      {search.results.map((result, index) => (
        <Link
          key={result.slug}
          id={`${listboxId}-opt-${index}`}
          href={`/products/${result.slug}`}
          role="option"
          aria-selected={index === search.activeIndex}
          className={`search-sug__opt${
            index === search.activeIndex ? " is-active" : ""
          }`}
          onClick={() => {
            onNavigate();
            search.setOpen(false);
          }}
        >
          <span className="search-sug__name">{result.name}</span>
          <span className="search-sug__meta">
            {result.brand} · {result.category} · SKU {result.sku}
          </span>
          <CurrencyPrice amountMinor={result.unitPriceMinor} />
        </Link>
      ))}
      {search.results.length > 0 ? (
        <Link
          className="search-sug__all"
          href={`/products?search=${encodeURIComponent(search.query.trim())}`}
          onClick={() => {
            onNavigate();
            search.setOpen(false);
          }}
        >
          View all results for “{search.query.trim()}” →
        </Link>
      ) : null}
    </div>
  );
}

// ── Desktop ────────────────────────────────────────────────────────────────

export function HeaderSearch() {
  const search = useCatalogSearch();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the inline input — only when it is actually visible
  // (below 768px the mobile panel owns the shortcut instead).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const input = inputRef.current;
      if (!input || input.offsetParent === null) return; // CSS-hidden on mobile
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click-outside closes the popover (pointer-level, so focus moves inside
  // keep it open).
  useEffect(() => {
    if (!search.open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      search.setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [search]);

  const showPopover = search.open && search.query.trim().length >= SEARCH_MIN_CHARS;

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="hsearch" ref={rootRef}>
      <span className="hsearch__icon">
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        className="hsearch__input"
        type="search"
        role="combobox"
        aria-expanded={showPopover}
        aria-controls="hsearch-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          search.activeIndex >= 0
            ? `hsearch-listbox-opt-${search.activeIndex}`
            : undefined
        }
        autoComplete="off"
        spellCheck={false}
        placeholder="Search products, hardware, SKUs…"
        value={search.query}
        onChange={(event) => {
          search.setQuery(event.target.value);
          search.setOpen(true);
        }}
        onFocus={() => search.setOpen(true)}
        onKeyDown={(event) => search.inputKeyDown(event)}
        aria-label="Search catalog"
      />
      <kbd className="hsearch__kbd" aria-hidden="true">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
      {showPopover ? (
        <div className="hsearch__pop">
          <SearchSuggestions
            search={search}
            listboxId="hsearch-listbox"
            onNavigate={() => inputRef.current?.blur()}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Mobile ─────────────────────────────────────────────────────────────────

export function MobileSearch() {
  const [open, setOpen] = useState(false);
  const search = useCatalogSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  // Navigation collapses the panel (route change = user chose a destination).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape collapses; ⌘K / Ctrl+K opens (the desktop input is CSS-hidden on
  // mobile, so this surface owns the shortcut here).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the field the moment the panel expands (keyboard/touch keyboards
  // rise with the panel — no second tap).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const collapse = useCallback(() => {
    search.reset();
    setOpen(false);
  }, [search]);

  return (
    <>
      <button
        type="button"
        className="icon-btn msearch__toggle"
        aria-expanded={open}
        aria-controls="mobile-search-panel"
        aria-label={open ? "Close search" : "Search catalog"}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="msearch__toggle-icon" aria-hidden="true">
          {open ? "✕" : <SearchIcon size={20} />}
        </span>
      </button>

      <div
        id="mobile-search-panel"
        className={`msearch${open ? " msearch--open" : ""}`}
      >
        <form
          className="msearch__bar"
          onSubmit={(event) => {
            event.preventDefault();
            search.submitSearch(() => collapse());
          }}
        >
          <div className="msearch__field">
            <span className="msearch__icon" aria-hidden="true">
              <SearchIcon size={16} />
            </span>
            <input
              ref={inputRef}
              className="msearch__input"
              type="search"
              role="combobox"
              aria-expanded={search.open}
              aria-controls="msearch-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                search.activeIndex >= 0
                  ? `msearch-listbox-opt-${search.activeIndex}`
                  : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder="Search catalog, products, model…"
              value={search.query}
              tabIndex={open ? 0 : -1}
              onChange={(event) => {
                search.setQuery(event.target.value);
                search.setOpen(true);
              }}
              onKeyDown={(event) =>
                search.inputKeyDown(event, () => collapse())
              }
              aria-label="Search catalog"
            />
          </div>
          <button
            type="button"
            className="msearch__clear"
            aria-label="Clear and collapse search"
            tabIndex={open ? 0 : -1}
            onClick={collapse}
          >
            ✕
          </button>
        </form>
        {open ? (
          <SearchSuggestions
            search={search}
            listboxId="msearch-listbox"
            onNavigate={collapse}
          />
        ) : null}
      </div>
    </>
  );
}
