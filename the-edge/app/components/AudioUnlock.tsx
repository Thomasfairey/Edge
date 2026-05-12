"use client";

import { useEffect } from "react";

/**
 * Robust audio playback unlock for Safari/iOS.
 *
 * Strategy:
 *   - Maintain ONE singleton <audio> element + ONE shared AudioContext.
 *   - On first user gesture (touch/click/keydown) on ANY page, "unlock" both
 *     by playing a silent MP3 on the element and calling ctx.resume().
 *     Safari treats this as the user-initiated playback, after which we may
 *     call audio.play() from any (non-gesture) context on that same element.
 *   - Queue speak callbacks that arrive before unlock; flush on unlock.
 *   - Re-arm: if visibilitychange brings us back to the foreground we
 *     re-try unlock on the next gesture (Safari sometimes re-locks).
 *
 * Public API (used by useVoice):
 *   - whenAudioUnlocked(fn): run fn now or as soon as unlock completes
 *   - playOnSharedAudio(blobUrl, { onEnded, onError }): play on shared element
 *   - stopSharedAudio(): pause without destroying the unlock
 *   - isAudioUnlocked(): boolean
 *   - getSharedAudioContext(): shared (unlocked) AudioContext, or null
 *   - primeOnGesture(): manually trigger an unlock attempt (used by mic flows)
 */

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _audio: HTMLAudioElement | null = null;
let _ctx: AudioContext | null = null;
let _unlocked = false;
let _unlocking = false;
let _pendingQueue: Array<() => void> = [];
let _currentBlobUrl: string | null = null;

// Listeners registered for unlock-recovery (e.g. after backgrounding the tab).
let _gestureListenerAttached = false;

// Tiny silent MP3 — valid MPEG frame, plays in <10ms
const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhkVFcSoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DEAAAHAAGSAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7QMQKAAAMAS0AAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    // iOS Safari: required for inline playback (otherwise audio gets routed to
    // full-screen video controller and many things break).
    _audio.setAttribute("playsinline", "true");
    _audio.setAttribute("webkit-playsinline", "true");
    _audio.preload = "auto";
    _audio.crossOrigin = "anonymous";
  }
  return _audio;
}

function getOrCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  type ACCtor = typeof AudioContext;
  const W = window as unknown as {
    AudioContext?: ACCtor;
    webkitAudioContext?: ACCtor;
  };
  const AC = W.AudioContext || W.webkitAudioContext;
  if (!AC) return null;
  try {
    _ctx = new AC();
  } catch {
    _ctx = null;
  }
  return _ctx;
}

function revokeCurrentBlobUrl(): void {
  if (_currentBlobUrl) {
    try {
      URL.revokeObjectURL(_currentBlobUrl);
    } catch {}
    _currentBlobUrl = null;
  }
}

function flushPending(): void {
  if (!_pendingQueue.length) return;
  // Only the LAST pending matters in practice (every speak() supersedes the previous),
  // but we still drain in order in case the queue gathered multiple unrelated callbacks.
  const queue = _pendingQueue.slice();
  _pendingQueue = [];
  for (const fn of queue) {
    try {
      fn();
    } catch (err) {
      console.warn("[AudioUnlock] pending fn threw:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Unlock
// ---------------------------------------------------------------------------

async function unlock(): Promise<void> {
  if (_unlocked || _unlocking) return;
  _unlocking = true;

  const audio = getOrCreateAudio();
  const ctx = getOrCreateContext();

  // Synchronously kick the AudioContext into "running" inside the gesture.
  if (ctx && ctx.state === "suspended") {
    // Don't await — this returns a promise but we want the sync side-effect
    // first (Safari treats the call itself as the user-initiated action).
    ctx.resume().catch(() => {});
  }

  // Arm the audio element with the silent MP3. We MUST set src and call play()
  // synchronously inside the gesture call stack on iOS Safari.
  try {
    if (audio.src !== SILENT_MP3) {
      audio.src = SILENT_MP3;
    }
    const p = audio.play();
    if (p && typeof p.then === "function") {
      await p;
    }
    _unlocked = true;
    flushPending();
  } catch (err) {
    // Safari can reject on first attempt if the gesture wasn't quite right.
    // Leave _unlocked=false so the next gesture will retry.
    console.warn("[AudioUnlock] silent play rejected:", (err as Error)?.message);
  } finally {
    _unlocking = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run fn now if audio is unlocked. Otherwise queue fn — it will run as soon
 * as the user makes a gesture and the silent MP3 finishes (typically <100ms).
 *
 * Subsequent calls before unlock COALESCE the queue down to just the latest fn:
 * voice playback is "say the most recent thing", not "say everything queued".
 */
export function whenAudioUnlocked(fn: () => void): void {
  if (_unlocked) {
    fn();
    return;
  }
  // Coalesce: only the latest speak matters
  _pendingQueue = [fn];
}

/**
 * Play a blob URL on the shared (unlocked) Audio element.
 * Pauses any in-flight playback first to avoid Safari "interrupted by call to
 * pause()" or "AbortError" rejections. Revokes the previous blob URL.
 *
 * onEnded/onError fire EXACTLY ONCE per call. If play() itself rejects,
 * onError is invoked so callers can clear their "speaking" state instead of
 * hanging forever.
 */
export function playOnSharedAudio(
  blobUrl: string,
  handlers: { onEnded?: () => void; onError?: (err: unknown) => void } = {}
): HTMLAudioElement {
  const audio = getOrCreateAudio();

  // Pause and detach any previous handlers so they can't fire for the new src.
  try {
    audio.pause();
  } catch {}
  audio.onended = null;
  audio.onerror = null;
  audio.onpause = null;

  // Revoke the previous URL (if any) since we're replacing it.
  revokeCurrentBlobUrl();
  _currentBlobUrl = blobUrl;

  let finished = false;
  const finishEnded = () => {
    if (finished) return;
    finished = true;
    revokeCurrentBlobUrl();
    handlers.onEnded?.();
  };
  const finishError = (err: unknown) => {
    if (finished) return;
    finished = true;
    revokeCurrentBlobUrl();
    handlers.onError?.(err);
  };

  audio.onended = finishEnded;
  audio.onerror = (e) => finishError(e);

  try {
    audio.src = blobUrl;
  } catch (err) {
    finishError(err);
    return audio;
  }

  // Some browsers need an explicit load() after src change. We previously
  // avoided this because Safari sometimes re-locks the element on load() —
  // however, after a fresh assignment the element is in a clean state and
  // load() is harmless. We skip it on iOS Safari out of caution.
  const isIOSSafari =
    typeof navigator !== "undefined" &&
    /iP(hone|ad|od)/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  if (!isIOSSafari) {
    try {
      audio.load();
    } catch {}
  }

  const p = audio.play();
  if (p && typeof p.then === "function") {
    p.catch((err) => {
      // Treat NotAllowedError as needing a fresh unlock attempt.
      if ((err as DOMException)?.name === "NotAllowedError") {
        _unlocked = false;
      }
      console.warn("[AudioUnlock] play() rejected:", (err as Error)?.message);
      finishError(err);
    });
  }

  return audio;
}

/**
 * Stop playback without destroying the unlock. Safe to call multiple times.
 */
export function stopSharedAudio(): void {
  if (!_audio) return;
  try {
    _audio.pause();
  } catch {}
  _audio.onended = null;
  _audio.onerror = null;
  revokeCurrentBlobUrl();
}

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

/**
 * Returns the shared (unlocked) AudioContext or null if not available.
 * Used by useVoice for mic recording fallback.
 */
export function getSharedAudioContext(): AudioContext | null {
  return _ctx;
}

/**
 * Attach gesture listeners to attempt unlock. Idempotent — calling multiple
 * times is safe. Useful for hooks that need to re-arm if the unlock was lost.
 */
export function primeOnGesture(): void {
  if (typeof document === "undefined") return;
  if (_unlocked || _gestureListenerAttached) return;
  attachGestureListeners();
}

function attachGestureListeners(): void {
  if (_gestureListenerAttached) return;
  _gestureListenerAttached = true;

  const events = ["pointerdown", "touchstart", "touchend", "click", "keydown"] as const;
  const handler = () => {
    void unlock();
    if (_unlocked) {
      events.forEach((e) => document.removeEventListener(e, handler, true));
      _gestureListenerAttached = false;
    }
  };

  events.forEach((e) =>
    document.addEventListener(e, handler, { capture: true, passive: true })
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioUnlock() {
  useEffect(() => {
    attachGestureListeners();

    // If the tab comes back from the background, Safari can lose the unlock.
    // Re-attach listeners so the next interaction restores it.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !_unlocked) {
        attachGestureListeners();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
