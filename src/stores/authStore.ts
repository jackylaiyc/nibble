"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  onboarding_completed: boolean;
  role_permissions: Record<string, unknown>;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  teamId: string | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setTeamId: (teamId: string | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  teamId: null,
  loading: true,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setTeamId: (teamId) => set({ teamId }),

  initialize: async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", profile?.id)
        .limit(1)
        .single();

      set({
        user,
        profile: profile || null,
        teamId: membership?.team_id || null,
        loading: false,
      });
    } else {
      set({ user: null, profile: null, teamId: null, loading: false });
    }
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null, teamId: null });
  },
}));
