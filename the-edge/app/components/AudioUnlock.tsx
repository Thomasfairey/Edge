"use client";

import { useEffect } from "react";

/**
 * Invisible component that unlocks audio playback on Safari/iOS.
 *
 * Safari requires a user gesture to call audio.play(). Crucially, the
 * unlock only applies to the SPECIFIC Audio element that was played —
 * creating new Audio() elements later won't inherit the unlock.
 *
 * This component:
 * 1. Mounts in root layout (present on EVERY page, including home)
 * 2. On first touch/click, plays a silent MP3 on a singleton Audio element
 * 3. Exports that same element for useVoice.ts to reuse via playOnSharedAudio()
 *
 * The key insight: speak() must reuse THIS element (not create new ones).
 * Once an element has been played from a gesture, Safari allows subsequent
 * play() calls on it even from non-gesture contexts (useEffect, fetch callbacks).
 *
 * We also queue any speak() calls that arrive before the unlock completes,
 * and flush them after. This handles the case where the lesson loads faster
 * than the silent MP3 finishes playing.
 */

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _audio: HTMLAudioElement | null = null;
let _unlocked = false;
let _unlocking = false;
let _pendingFn: (() => void) | null = null;

function getOrCreateAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    _audio.setAttribute("playsinline", "true");
    _audio.setAttribute("webkit-playsinline", "true");
  }
  return _audio;
}

// Tiny silent MP3 — valid MPEG frame, plays in <10ms
const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhkVFcSoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DEAAAHAAGSAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7QMQKAAAMAS0AAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";

/**
 * Attempt to unlock. Called from user gesture handlers.
 */
async function unlock() {
  if (_unlocked || _unlocking) return;
  _unlocking = true;

  const audio = getOrCreateAudio();
  audio.src = SILENT_MP3;

  try {
    await audio.play();
    _unlocked = true;

    // Flush queued speak
    if (_pendingFn) {
      const fn = _pendingFn;
      _pendingFn = null;
      fn();
    }
  } catch {
    // Will retry on next gesture
  } finally {
    _unlocking = false;
  }
}

// ---------------------------------------------------------------------------
// Public API — used by useVoice.ts
// ---------------------------------------------------------------------------

/**
 * Schedule a function to run once audio is unlocked.
 * If already unlocked, runs immediately. If unlock is in progress, queues.
 */
export function whenAudioUnlocked(fn: () => void): void {
  if (_unlocked) {
    fn();
  } else {
    // Replace any previous pending (only the latest speak matters)
    _pendingFn = fn;
  }
}

/**
 * Play a blob URL on the shared (unlocked) Audio element.
 * Returns the element so caller can attach onended/onerror.
 */
export function playOnSharedAudio(blobUrl: string): HTMLAudioElement {
  const audio = getOrCreateAudio();
  audio.src = blobUrl;
  audio.play().catch((err) => {
    console.warn("[AudioUnlock] play() rejected:", err.message);
  });
  return audio;
}

/**
 * Stop playback without destroying the unlock.
 * NEVER call audio.load() — Safari re-locks the element.
 */
export function stopSharedAudio(): void {
  if (_audio) {
    _audio.pause();
    _audio.onended = null;
    _audio.onerror = null;
  }
}

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioUnlock() {
  useEffect(() => {
    if (_unlocked) return;

    const events = ["touchstart", "touchend", "click", "keydown"] as const;
    const handler = () => {
      unlock();
      if (_unlocked) {
        events.forEach((e) =>
          document.removeEventListener(e, handler, true)
        );
      }
    };

    events.forEach((e) =>
      document.addEventListener(e, handler, { capture: true, passive: true })
    );

    return () => {
      events.forEach((e) =>
        document.removeEventListener(e, handler, true)
      );
    };
  }, []);

  return null;
}
