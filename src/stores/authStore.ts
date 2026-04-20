"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Auth store — thin wrapper around Supabase's browser client. Tracks the
 * currently signed-in user and exposes sign-out; subscribes to Supabase's
 * onAuthStateChange so the store reflects login/logout without a reload.
 *
 * Nibble doesn't have a separate `profiles` table yet — the child profile
 * still lives in `childProfileStore` backed by localStorage. We just need
 * to know WHO is logged in so the rest of the app can gate on it. When we
 * migrate data to Supabase later, we'll add a `profile` field here that
 * points to the row in `nibble_families` (or whatever we name it).
 */

interface AuthState {
  user: User | null;
  /** true until the initial session check completes. Gate redirects on this. */
  loading: boolean;
  /** Idempotent — safe to call more than once. Returns a cleanup for the listener. */
  initialize: () => () => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: () => {
    const supabase = createClient();

    // Fire-and-forget the initial user check so any page that mounts the
    // store resolves `loading` quickly.
    void supabase.auth.getUser().then(({ data }) => {
      set({ user: data.user ?? null, loading: false });
    });

    // Keep the store in sync with browser auth state — login from another
    // tab, token refresh failure, sign-out, etc.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, loading: false });
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null });
    // Full refresh ensures the middleware re-runs and strips any cached
    // authed-state UI. Avoids stale chrome after logout.
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  },
}));

/**
 * React hook variant that auto-initializes on mount. Use at the top of any
 * client component that wants to know the current auth state without
 * re-wiring the subscription.
 */
export function useAuth() {
  const state = useAuthStore();
  return state;
}

// Eagerly bootstrap on first import so the auth state is warm by the time
// the first page reads it. Safe because initialize() is idempotent — the
// only price is a tiny duplicate subscription if called multiple times.
if (typeof window !== "undefined") {
  useAuthStore.getState().initialize();
}

