"use client";

import { create } from "zustand";

/**
 * Ask Nibble — chat thread state.
 *
 * Single rolling thread keyed by child. When the caregiver switches
 * active child, the thread implicitly filters to that child's messages
 * (we never delete — retention is handy for "what did I ask last week
 * about iron?"). Persisted to localStorage; Supabase sync lands with
 * the auth migration later.
 *
 * Message shape mirrors what /api/ai/chat returns so we can re-render
 * the same disclaimer / toolCall UI on reload without re-fetching.
 */

export type ChatRole = "user" | "assistant";

export type DisclaimerLevel =
  | "none"
  | "educational"
  | "pediatrician"
  | "emergency";

export interface ChatToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  childId: string;
  role: ChatRole;
  content: string;
  /** Only present on assistant messages. */
  disclaimerLevel?: DisclaimerLevel;
  disclaimerText?: string;
  toolCall?: ChatToolCall;
  createdAt: string; // ISO
}

interface ChatState {
  messages: ChatMessage[];
  loaded: boolean;
  loadFromStorage: () => void;
  /** Append a message; returns the stored ChatMessage (with id + createdAt). */
  addMessage: (
    msg: Omit<ChatMessage, "id" | "createdAt"> &
      Partial<Pick<ChatMessage, "id" | "createdAt">>,
  ) => ChatMessage;
  /** Remove the last assistant message — used when the send failed and we
   *  want to retry without leaving a stale placeholder behind. */
  popLastAssistant: () => void;
  /** Wipe the thread for one child (or all, if no id given). */
  resetThread: (childId?: string) => void;
  /** Select messages for a given child, oldest → newest. */
  messagesFor: (childId: string) => ChatMessage[];
}

const STORAGE_KEY = "nibble_chat_v1";

function loadStored(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persist(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    // Cap at 500 messages total so localStorage doesn't balloon after weeks
    // of use. The oldest ones fall off first. When Supabase syncs them,
    // history lives server-side and this cap becomes UI-only.
    const trimmed = messages.length > 500 ? messages.slice(-500) : messages;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage full or disabled — chat still works in-memory */
  }
}

function newId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loaded: false,

  loadFromStorage: () => {
    set({ messages: loadStored(), loaded: true });
  },

  addMessage: (msg) => {
    const entry: ChatMessage = {
      id: msg.id ?? newId(),
      createdAt: msg.createdAt ?? new Date().toISOString(),
      childId: msg.childId,
      role: msg.role,
      content: msg.content,
      disclaimerLevel: msg.disclaimerLevel,
      disclaimerText: msg.disclaimerText,
      toolCall: msg.toolCall,
    };
    const next = [...get().messages, entry];
    set({ messages: next });
    persist(next);
    return entry;
  },

  popLastAssistant: () => {
    const current = get().messages;
    const lastIdx = current.length - 1;
    if (lastIdx < 0) return;
    if (current[lastIdx].role !== "assistant") return;
    const next = current.slice(0, lastIdx);
    set({ messages: next });
    persist(next);
  },

  resetThread: (childId) => {
    const next = childId
      ? get().messages.filter((m) => m.childId !== childId)
      : [];
    set({ messages: next });
    persist(next);
  },

  messagesFor: (childId) => get().messages.filter((m) => m.childId === childId),
}));
