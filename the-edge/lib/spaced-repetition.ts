/**
 * Simplified SM-2 spaced repetition engine.
 * Tracks concept mastery across sessions using a JSON file.
 */

import fs from "fs";
import path from "path";

export interface SREntry {
  conceptId: string;
  lastPracticed: string; // ISO date
  easeFactor: number; // starts at 2.5
  interval: number; // days until next review
  nextReview: string; // ISO date
  practiceCount: number;
  lastScoreAvg: number;
}

const SR_PATH = path.join(process.cwd(), "data", "spaced-repetition.json");

function ensureFile(): void {
  const dir = path.dirname(SR_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(SR_PATH)) {
    fs.writeFileSync(SR_PATH, "[]", "utf-8");
  }
}

export function getSRData(): SREntry[] {
  try {
    ensureFile();
    const raw = fs.readFileSync(SR_PATH, "utf-8");
    return JSON.parse(raw) as SREntry[];
  } catch {
    fs.writeFileSync(SR_PATH, "[]", "utf-8");
    return [];
  }
}

function writeSRData(data: SREntry[]): void {
  ensureFile();
  fs.writeFileSync(SR_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Update SR entry after a session.
 * SM-2 variant:
 * - avg >= 4 → ease * 1.3, interval * ease (mastery)
 * - avg >= 3 → interval * ease (competent)
 * - avg < 3 → ease * 0.8, interval = 1 (needs review)
 */
export function updateSREntry(conceptId: string, scores: { [key: string]: number }): void {
  const data = getSRData();
  const values = Object.values(scores);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const today = new Date().toISOString().split("T")[0];
  const existing = data.find((e) => e.conceptId === conceptId);

  if (existing) {
    existing.lastPracticed = today;
    existing.practiceCount += 1;
    existing.lastScoreAvg = Math.round(avg * 10) / 10;

    if (avg >= 4) {
      existing.easeFactor = Math.min(existing.easeFactor * 1.3, 5);
      existing.interval = Math.round(existing.interval * existing.easeFactor);
    } else if (avg >= 3) {
      existing.interval = Math.round(existing.interval * existing.easeFactor);
    } else {
      existing.easeFactor = Math.max(existing.easeFactor * 0.8, 1.3);
      existing.interval = 1;
    }

    const next = new Date(today);
    next.setDate(next.getDate() + existing.interval);
    existing.nextReview = next.toISOString().split("T")[0];
  } else {
    // New entry — initial interval based on performance
    const initialInterval = avg >= 4 ? 7 : avg >= 3 ? 3 : 1;
    const next = new Date(today);
    next.setDate(next.getDate() + initialInterval);

    data.push({
      conceptId,
      lastPracticed: today,
      easeFactor: 2.5,
      interval: initialInterval,
      nextReview: next.toISOString().split("T")[0],
      practiceCount: 1,
      lastScoreAvg: Math.round(avg * 10) / 10,
    });
  }

  writeSRData(data);
}

/**
 * Get concepts due for review (nextReview <= today).
 * Returns sorted by most overdue first.
 */
export function getDueReviews(): SREntry[] {
  const data = getSRData();
  const today = new Date().toISOString().split("T")[0];

  return data
    .filter((e) => e.nextReview <= today)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview));
}

/**
 * Get SR summary stats for the status API.
 */
export function getSRSummary(): {
  totalConcepts: number;
  dueForReview: number;
  masteredCount: number;
} {
  const data = getSRData();
  const today = new Date().toISOString().split("T")[0];

  return {
    totalConcepts: data.length,
    dueForReview: data.filter((e) => e.nextReview <= today).length,
    masteredCount: data.filter((e) => e.easeFactor >= 3.5 && e.practiceCount >= 3).length,
  };
}
