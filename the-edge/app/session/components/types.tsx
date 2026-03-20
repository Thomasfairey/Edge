/**
 * Shared types for session phase components.
 */

import type { SessionPhase, Concept, CharacterArchetype, SessionScores, Message } from "@/lib/types";
import type { VoiceState } from "@/app/hooks/useVoice";

// Re-export lib types used across session components
export type { SessionPhase, Concept, CharacterArchetype, SessionScores, Message };

// ---------------------------------------------------------------------------
// Constants shared across components
// ---------------------------------------------------------------------------

export const PHASES: { key: SessionPhase; label: string; color: string }[] = [
  { key: "lesson", label: "Learn", color: "#B8D4E3" },
  { key: "roleplay", label: "Sim", color: "#F2C4C4" },
  { key: "debrief", label: "Brief", color: "#C5B8E8" },
  { key: "mission", label: "Deploy", color: "#B8E0C8" },
];

export const PHASE_BG: Record<string, string> = {
  lesson: "#EFF6FA",
  retrieval: "#EFF6FA",
  roleplay: "#FDF2F2",
  debrief: "#F3F0FA",
  mission: "#F0FAF4",
};

export const SCORE_DIMS: { key: keyof SessionScores; label: string; fullName: string }[] = [
  { key: "technique_application", label: "TA", fullName: "Technique" },
  { key: "tactical_awareness", label: "TW", fullName: "Tactical" },
  { key: "frame_control", label: "FC", fullName: "Frame" },
  { key: "emotional_regulation", label: "ER", fullName: "Regulation" },
  { key: "strategic_outcome", label: "SO", fullName: "Outcome" },
];

// ---------------------------------------------------------------------------
// Voice props — subset of useVoice return passed to phase components
// ---------------------------------------------------------------------------

export interface VoiceProps {
  state: VoiceState;
  voiceEnabled: boolean;
  sttSupported: boolean;
  ttsSupported: boolean;
  toggleVoice: () => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, voiceOverride?: string) => void;
  speakDirect: (text: string, voiceOverride?: string) => void;
  stopSpeaking: () => void;
  interimTranscript: string;
  micError: string | null;
  clearMicError: () => void;
}

// ---------------------------------------------------------------------------
// Helpers shared across components
// ---------------------------------------------------------------------------

export function characterEmoji(id?: string): string {
  switch (id) {
    case "sceptical-investor": return "\uD83C\uDFAF";
    case "political-stakeholder": return "\uD83C\uDFDB";
    case "resistant-report": return "\uD83D\uDE0F";
    case "hostile-negotiator": return "\u2694\uFE0F";
    case "alpha-peer": return "\uD83D\uDD2C";
    case "consultancy-gatekeeper": return "\uD83D\uDC54";
    default: return "\uD83C\uDFAD";
  }
}

export function scoreCircleColor(score: number): string {
  if (score >= 4) return "var(--score-high)";
  if (score === 3) return "var(--score-mid)";
  return "var(--score-low)";
}

export function scoreTextColor(score: number): string {
  if (score >= 4) return "var(--score-high-text)";
  if (score === 3) return "var(--score-mid-text)";
  return "var(--score-low-text)";
}

/** Strip markdown formatting for natural TTS narration */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/^#+\s+(.+)$/gm, "$1.")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[_~`#]/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function haptic() {
  import("@/lib/haptics").then((h) => h.hapticImpact()).catch(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  });
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

export function renderMarkdown(text: string, context: "lesson" | "debrief" | "default" = "default"): React.ReactNode[] {
  // Strip any raw HTML tags from AI output to prevent XSS
  const sanitized = text.replace(/<[^>]*>/g, "");
  const lines = sanitized.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let isFirstParagraph = true;
  const isLesson = context === "lesson";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      isFirstParagraph = true;
      elements.push(
        <h2 key={key++} className="mb-2 mt-5 text-caption font-semibold uppercase tracking-wider first:mt-0" style={{ color: "var(--phase-learn-muted)" }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="mb-2 mt-4 text-caption font-medium" style={{ color: "var(--phase-learn-muted)" }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const hasBold = parts.some(p => p.startsWith("**"));

      const isExample = isLesson && !hasBold && (
        line.startsWith('"') || line.startsWith('\u201C') ||
        /^When [A-Z]/.test(line) || /^In \d{4}/.test(line)
      );

      if (isExample) {
        isFirstParagraph = false;
        elements.push(
          <div key={key++} className="lesson-example">{line}</div>
        );
      } else if (isFirstParagraph && !hasBold && line.length > 20) {
        isFirstParagraph = false;
        const sentenceEnd = line.search(/[.!?]\s|[.!?]$/);
        if (sentenceEnd > 0) {
          const firstSentence = line.slice(0, sentenceEnd + 1);
          const rest = line.slice(sentenceEnd + 1);
          elements.push(
            <p key={key++} className={isLesson ? "lesson-definition" : "text-base leading-relaxed text-primary"}>
              {isLesson ? firstSentence : <strong className="font-semibold">{firstSentence}</strong>}
              {rest && <span className={isLesson ? "font-normal text-base" : ""}>{rest}</span>}
            </p>
          );
        } else {
          elements.push(
            <p key={key++} className={isLesson ? "lesson-definition" : "text-base leading-relaxed text-primary font-medium"}>{line}</p>
          );
        }
      } else {
        isFirstParagraph = false;
        if (!hasBold && line.length > 200) {
          const sentences = line.match(/[^.!?]+[.!?]+\s*/g) || [line];
          const chunks: string[] = [];
          let buf = "";
          for (const s of sentences) {
            buf += s;
            if (buf.length > 100) {
              chunks.push(buf.trim());
              buf = "";
            }
          }
          if (buf.trim()) chunks.push(buf.trim());
          for (const chunk of chunks) {
            elements.push(
              <p key={key++} className={`${isLesson ? "lesson-body" : "text-base leading-relaxed text-primary"} mb-2`}>{chunk}</p>
            );
          }
        } else {
          elements.push(
            <p key={key++} className={isLesson ? "lesson-body" : "text-base leading-relaxed text-primary"}>
              {parts.map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i} className="font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  part
                )
              )}
            </p>
          );
        }
      }
    }
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Lesson section splitter
// ---------------------------------------------------------------------------

export function splitLessonSections(text: string): { title: string; content: string }[] {
  const raw: { title: string; content: string }[] = [];
  const pattern = /^## (The (?:Principle|Play|Counter|Refresher|Advanced Play))/gm;
  const headings: { title: string; index: number }[] = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    headings.push({ title: match[1], index: match.index });
  }

  if (headings.length === 0) {
    return [{ title: "Lesson", content: text }];
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index + headings[i].title.length + 3;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    raw.push({
      title: headings[i].title,
      content: text.slice(start, end).trim(),
    });
  }

  const MAX_CARD_CHARS = 600;
  const sections: { title: string; content: string }[] = [];
  for (const section of raw) {
    if (section.content.length <= MAX_CARD_CHARS) {
      sections.push(section);
    } else {
      let paragraphs = section.content.split(/\n\n+/);
      if (paragraphs.length <= 1) {
        paragraphs = section.content.split(/\n/);
      }
      let current = "";
      let partNum = 1;
      for (const para of paragraphs) {
        if (current && (current.length + para.length + 2) > MAX_CARD_CHARS) {
          sections.push({ title: partNum === 1 ? section.title : `${section.title} (cont.)`, content: current.trim() });
          current = para;
          partNum++;
        } else {
          current += (current ? "\n\n" : "") + para;
        }
      }
      if (current.trim()) {
        sections.push({ title: partNum > 1 ? `${section.title} (cont.)` : section.title, content: current.trim() });
      }
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Loading dots
// ---------------------------------------------------------------------------

export function LoadingDots() {
  return (
    <div className="flex items-center justify-center gap-2 py-5">
      <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(90,82,224,0.4)" }} />
      <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(90,82,224,0.4)" }} />
      <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(90,82,224,0.4)" }} />
    </div>
  );
}
