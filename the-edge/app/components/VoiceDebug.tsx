"use client";

/**
 * On-screen debug overlay for diagnosing voice (STT/TTS) on a real device.
 *
 * Why this exists: voice failures on iOS happen inside the native WKWebView
 * where there is no visible console. This panel surfaces platform capabilities
 * and a live tail of console.warn/error/log lines (especially the
 * "[useVoice]" / "[AudioUnlock]" messages) directly on the phone screen — no
 * Mac/Web Inspector required.
 *
 * Activation (any of):
 *   - visit any page with ?debug=1   (persists for the session)
 *   - run localStorage.setItem("edge-debug", "1") then reload
 * Deactivate: tap "off" in the panel, or ?debug=0.
 */

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

interface LogLine {
  id: number;
  level: "log" | "warn" | "error";
  text: string;
}

const STORAGE_KEY = "edge-debug";

function isActive(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("debug");
  if (q === "1") {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    return true;
  }
  if (q === "0") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return false;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function VoiceDebug() {
  const [active, setActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    // Client-only: reads window/localStorage, which are unavailable during SSR.
    // Deliberately runs once after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(isActive());
  }, []);

  useEffect(() => {
    if (!active) return;

    const original = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    const capture = (level: LogLine["level"]) => {
      return (...args: unknown[]) => {
        original[level](...args);
        const text = args
          .map((a) => {
            if (typeof a === "string") return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(" ");
        // Only keep voice/audio-relevant noise plus anything that looks like an error.
        if (
          level === "error" ||
          /\[useVoice\]|\[AudioUnlock\]|TTS|STT|mic|audio|speech|recogni/i.test(text)
        ) {
          setLines((prev) => {
            const next = [...prev, { id: idRef.current++, level, text }];
            return next.slice(-40);
          });
        }
      };
    };

    console.log = capture("log");
    console.warn = capture("warn");
    console.error = capture("error");

    return () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    };
  }, [active]);

  if (!active) return null;

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = typeof window !== "undefined" ? (window as any) : {};
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const caps: [string, boolean][] = [
    ["isNative", Capacitor.isNativePlatform()],
    ["platform", !!Capacitor.getPlatform && (Capacitor.getPlatform() as unknown as boolean)],
    ["getUserMedia", !!nav?.mediaDevices?.getUserMedia],
    ["MediaRecorder", typeof MediaRecorder !== "undefined"],
    ["AudioContext", !!(w.AudioContext || w.webkitAudioContext)],
    ["webSpeech", "SpeechRecognition" in w || "webkitSpeechRecognition" in w],
  ];

  const dot = (ok: boolean) => (ok ? "🟢" : "🔴");

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        right: 8,
        zIndex: 99999,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.35,
        color: "#e6f1ff",
        background: "rgba(10,14,30,0.93)",
        border: "1px solid #3a4a7a",
        borderRadius: 10,
        padding: 8,
        maxHeight: collapsed ? 40 : "45vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: collapsed ? 0 : 6 }}>
        <strong style={{ flex: 1 }}>🎙 voice debug</strong>
        <button
          onClick={() => setLines([])}
          style={{ background: "#243056", color: "#cfe", border: "none", borderRadius: 6, padding: "3px 8px" }}
        >
          clear
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{ background: "#243056", color: "#cfe", border: "none", borderRadius: 6, padding: "3px 8px" }}
        >
          {collapsed ? "show" : "hide"}
        </button>
        <button
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {}
            setActive(false);
          }}
          style={{ background: "#5a2440", color: "#fcd", border: "none", borderRadius: 6, padding: "3px 8px" }}
        >
          off
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={{ marginBottom: 6, color: "#9fb3e0" }}>
            {caps.map(([label, ok]) => (
              <span key={label} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                {typeof ok === "boolean" ? dot(ok) : "🟡"} {label}
                {typeof ok !== "boolean" ? `:${ok}` : ""}
              </span>
            ))}
            <div style={{ marginTop: 2, wordBreak: "break-all", color: "#6f86bf" }}>
              {nav?.userAgent}
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {lines.length === 0 ? (
              <div style={{ color: "#6f86bf" }}>
                waiting for voice events… tap the mic / trigger read-back
              </div>
            ) : (
              lines.map((l) => (
                <div
                  key={l.id}
                  style={{
                    color: l.level === "error" ? "#ff8b8b" : l.level === "warn" ? "#ffd27a" : "#bfe0c8",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    borderTop: "1px solid #1c2748",
                    padding: "2px 0",
                  }}
                >
                  {l.text}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
