"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

/**
 * Fire-and-forget confetti burst.
 *
 * Controlled by a `trigger` number — increment it to replay. Using a
 * counter instead of a boolean lets the caller fire the same animation
 * multiple times without juggling false→true→false state.
 *
 * Why the two-shot pattern: a single default burst feels anaemic on
 * wider screens. Two slightly-offset bursts fill the viewport without
 * looking like a firework show.
 */

export function Confetti({ trigger }: { trigger: number }) {
  const lastFired = useRef<number>(-1);

  useEffect(() => {
    if (trigger === lastFired.current) return;
    lastFired.current = trigger;
    if (trigger <= 0) return;

    // Left shot
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.3, y: 0.6 },
      colors: ["#FFE8A3", "#FFB5A0", "#A8D5BA", "#F5CF66", "#FF8F70"],
      scalar: 0.9,
    });
    // Right shot, slightly delayed
    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.7, y: 0.6 },
        colors: ["#FFE8A3", "#FFB5A0", "#A8D5BA", "#F5CF66", "#FF8F70"],
        scalar: 0.9,
      });
    }, 180);
  }, [trigger]);

  return null;
}
