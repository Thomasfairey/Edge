/**
 * Unit tests for the system context builder.
 */

import { describe, it, expect } from "vitest";
import { buildSystemContext } from "../../src/prompts/system-context.js";
import type { UserProfile } from "../../src/types/domain.js";

function makeProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    id: "user-123",
    email: "test@example.com",
    display_name: "Tom Fairey",
    professional_context: "CRO at an AI company, leading enterprise sales.",
    communication_style: "Direct and specific",
    experience_level: "advanced",
    goals: ["Master negotiation", "Improve frame control"],
    subscription_tier: "pro",
    subscription_expires_at: null,
    onboarding_completed: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildSystemContext", () => {
  it("should include user name", () => {
    const context = buildSystemContext(makeProfile(), "No prior sessions.", []);
    expect(context).toContain("Tom Fairey");
  });

  it("should include experience level", () => {
    const context = buildSystemContext(makeProfile(), "No prior sessions.", []);
    expect(context).toContain("advanced");
  });

  it("should include professional context", () => {
    const context = buildSystemContext(makeProfile(), "No prior sessions.", []);
    expect(context).toContain("CRO at an AI company");
  });

  it("should include goals", () => {
    const context = buildSystemContext(makeProfile(), "No prior sessions.", []);
    expect(context).toContain("Master negotiation");
    expect(context).toContain("Improve frame control");
  });

  it("should include ledger summary", () => {
    const ledger = "## Recent Session History\n\n- **Day 1 — Reciprocity:** Good session.";
    const context = buildSystemContext(makeProfile(), ledger, []);
    expect(context).toContain("Recent Session History");
  });

  it("should include completed concepts", () => {
    const context = buildSystemContext(
      makeProfile(),
      "No prior sessions.",
      ["Reciprocity (Cialdini)", "Mirroring (Voss)"]
    );
    expect(context).toContain("Reciprocity (Cialdini)");
    expect(context).toContain("2 total");
  });

  it("should handle new user with no data", () => {
    const context = buildSystemContext(
      makeProfile({ goals: [], professional_context: "" }),
      "No prior sessions recorded.",
      []
    );
    expect(context).toContain("None yet");
    expect(context).toContain("No professional context");
  });

  it("should address user by first name", () => {
    const context = buildSystemContext(makeProfile(), "No prior sessions.", []);
    expect(context).toContain("Tom");
  });

  it("should calibrate to experience level", () => {
    const beginnerContext = buildSystemContext(
      makeProfile({ experience_level: "beginner" }),
      "No prior sessions.",
      []
    );
    expect(beginnerContext).toContain("beginner");
  });
});
