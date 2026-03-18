/**
 * Unit tests for character archetypes and selection.
 */

import { describe, it, expect } from "vitest";
import { CHARACTERS, selectCharacter } from "../../src/content/characters.js";
import { CONCEPTS } from "../../src/content/concepts.js";
import type { ConceptDomain } from "../../src/types/domain.js";

describe("CHARACTERS", () => {
  it("should have at least 12 characters", () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(12);
  });

  it("should have unique IDs", () => {
    const ids = CHARACTERS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have all required fields", () => {
    for (const c of CHARACTERS) {
      expect(c.id, `Character missing id`).toBeTruthy();
      expect(c.name, `Character ${c.id} missing name`).toBeTruthy();
      expect(c.description, `Character ${c.id} missing description`).toBeTruthy();
      expect(c.personality.length, `Character ${c.id} personality too short`).toBeGreaterThan(50);
      expect(c.communication_style, `Character ${c.id} missing communication_style`).toBeTruthy();
      expect(c.hidden_motivation, `Character ${c.id} missing hidden_motivation`).toBeTruthy();
      expect(c.pressure_points.length, `Character ${c.id} needs pressure points`).toBeGreaterThanOrEqual(2);
      expect(c.tactics.length, `Character ${c.id} needs tactics`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("selectCharacter", () => {
  it("should return a valid character for every domain", () => {
    const domains: ConceptDomain[] = [
      "Influence & Persuasion",
      "Power Dynamics",
      "Negotiation",
      "Behavioural Psychology & Cognitive Bias",
      "Nonverbal Intelligence & Behavioural Profiling",
      "Rapport & Relationship Engineering",
      "Dark Psychology & Coercive Technique Recognition",
    ];

    for (const domain of domains) {
      const concept = CONCEPTS.find((c) => c.domain === domain)!;
      const character = selectCharacter(concept);
      expect(character, `No character selected for domain "${domain}"`).toBeDefined();
      expect(character.id).toBeTruthy();
      expect(character.name).toBeTruthy();
    }
  });

  it("should return a character (never undefined) for any concept", () => {
    for (const concept of CONCEPTS) {
      const character = selectCharacter(concept);
      expect(character).toBeDefined();
      expect(character.id).toBeTruthy();
    }
  });
});
