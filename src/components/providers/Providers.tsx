"use client";

// src/components/providers/Providers.tsx
// Client boundary: (1) auth session context (Supabase owns auth — this only
// mirrors it; roles are READ via RLS, never trusted from cache), (2) Zustand
// persist rehydration gate so server HTML and the first client render agree
// (skipHydration in the store + explicit rehydrate here; prevents the
// classic cart-badge hydration mismatch).
//
// DEMO MODE: when the server-rendered probe found the database unreachable
// (demoEligible environments only), a synthetic session is provided so the
// checkout/booking UI stays fully interactable offline, and NO supabase-js
// client is constructed (its "Invalid URL" throw used to crash this effect).

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useCartStore } from "@/stores/cart-store";
import { useCartSync } from "@/lib/cart/sync";
import type { User } from "@supabase/supabase-js";
import type { UsersRow } from "@/types/database";

type SessionState = {
  user: User | null;
  profile: Pick<UsersRow, "role" | "full_name" | "email"> | null;
  loading: boolean;
  demo: boolean;
  signOut: () => Promise<void>;
};

const DEMO_SESSION = {
  id: "de400000-0000-4000-8000-0000000000c0",
  email: "demo-shopper@chrisviscus.test",
  aud: "authenticated",
  role: "authenticated",
};

const DEMO_PROFILE: SessionState["profile"] = {
  role: "customer",
  full_name: "Demo Shopper",
  email: "demo-shopper@chrisviscus.test",
};

const SessionContext = createContext<SessionState>({
  user: null,
  profile: null,
  loading: true,
  demo: false,
  signOut: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function Providers({
  children,
  demoMode = false,
}: {
  children: React.ReactNode;
  demoMode?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SessionState["profile"]>(null);
  const [loading, setLoading] = useState(true);

  // One browser client for the cart mirror sync; null in demo mode or when
  // Supabase env is absent (the client constructor throws on placeholders).
  const supabase = useMemo(() => {
    if (demoMode) return null;
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, [demoMode]);

  // Durable cart mirror (0008): pull + login merge on mount, debounced
  // push on every mutation. No-ops while loading or unconfigured.
  useCartSync(supabase, user, !loading);

  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (demoMode) {
      // Synthetic session keeps every "sign in to checkout/book" gate open
      // for UI testing. Real money/DB operations are refused server-side.
      setUser(DEMO_SESSION as unknown as User);
      setProfile(DEMO_PROFILE);
      setLoading(false);
      return;
    }

    let supabase;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      // Config went missing mid-session: degrade to signed-out, don't crash
      // the whole client tree.
      setLoading(false);
      return;
    }
    let active = true;

    void (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUser(currentUser);

      if (currentUser) {
        // RLS users_read_own returns exactly this user's row.
        const { data } = await supabase
          .from("users")
          .select("role, full_name, email")
          .eq("id", currentUser.id)
          .maybeSingle();
        if (active) setProfile(data ?? null);
      }
      if (active) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [demoMode]);

  const signOut = async () => {
    if (demoMode) {
      window.location.href = "/";
      return;
    }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <SessionContext.Provider value={{ user, profile, loading, demo: demoMode, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
