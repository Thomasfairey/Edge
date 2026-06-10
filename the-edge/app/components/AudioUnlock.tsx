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
let _silentUrl: string | null = null;

function getOrCreateAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    _audio.setAttribute("playsinline", "true");
    _audio.setAttribute("webkit-playsinline", "true");
  }
  return _audio;
}

/**
 * Build (once) a blob: URL for a short silent WAV — the clip we play to unlock
 * the shared element on the first user gesture.
 *
 * Why a synthesised blob: and not a data: URI? The app's CSP is
 * `media-src 'self' blob:` — it does NOT allow data:, so a data: source is
 * blocked, audio.play() rejects, the element never unlocks, and TTS never plays
 * (the "no read-back on iOS" bug). blob: is allowed and matches how the real
 * TTS audio is delivered. We build the WAV bytes directly (no base64/atob,
 * which is stricter than the data: decoder and silently failed here).
 */
function getSilentUrl(): string {
  if (_silentUrl) return _silentUrl;
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * 0.12); // 120ms of silence
  const dataLen = samples * 2; // 16-bit mono
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  // sample bytes are already zero (silence)
  _silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return _silentUrl;
}

function flushPending() {
  if (_pendingFn) {
    const fn = _pendingFn;
    _pendingFn = null;
    fn();
  }
}

/**
 * Attempt to unlock. Called from user gesture handlers.
 */
async function unlock() {
  if (_unlocked || _unlocking) return;
  _unlocking = true;

  const audio = getOrCreateAudio();
  audio.src = getSilentUrl();

  try {
    await audio.play();
    _unlocked = true;
    flushPending();
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
 * Returns the element (attach onended/onerror) plus the play() promise so the
 * caller can detect a blocked/failed playback and recover — previously the
 * rejection was swallowed here, leaving the UI stuck in "speaking" with no
 * audio and no feedback (the classic iOS failure).
 */
export function playOnSharedAudio(
  blobUrl: string
): { audio: HTMLAudioElement; played: Promise<void> } {
  const audio = getOrCreateAudio();
  audio.src = blobUrl;
  const played = audio.play();
  return { audio, played: played ?? Promise.resolve() };
}

/**
 * Called when a real playback attempt was blocked by the browser (e.g. iOS
 * refused play() despite the silent-MP3 unlock). Re-locks so the next user
 * gesture re-runs unlock(), and queues `retry` to fire once that succeeds.
 */
export function notifyAudioBlocked(retry: () => void): void {
  _unlocked = false;
  _pendingFn = retry;
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
    // Keep the listeners attached for the component's whole lifetime (not just
    // until the first unlock). unlock() is a cheap no-op once unlocked, and
    // keeping them means we recover after notifyAudioBlocked() re-locks: the
    // next gesture re-runs unlock() and flushes the queued retry.
    const events = ["touchstart", "touchend", "click", "keydown"] as const;
    const handler = () => {
      if (!_unlocked) unlock();
      else flushPending();
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
