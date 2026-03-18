/**
 * Unit tests for concept taxonomy and selection.
 */

import { describe, it, expect } from "vitest";
import { CONCEPTS } from "../../src/content/concepts.js";

describe("CONCEPTS", () => {
  it("should have at least 35 concepts", () => {
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(35);
  });

  it("should have unique IDs", () => {
    const ids = CONCEPTS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should cover all 7 domains", () => {
    const domains = new Set(CONCEPTS.map((c) => c.domain));
    expect(domains.size).toBe(7);
    expect(domains.has("Influence & Persuasion")).toBe(true);
    expect(domains.has("Power Dynamics")).toBe(true);
    expect(domains.has("Negotiation")).toBe(true);
    expect(domains.has("Behavioural Psychology & Cognitive Bias")).toBe(true);
    expect(domains.has("Nonverbal Intelligence & Behavioural Profiling")).toBe(true);
    expect(domains.has("Rapport & Relationship Engineering")).toBe(true);
    expect(domains.has("Dark Psychology & Coercive Technique Recognition")).toBe(true);
  });

  it("should have 5 concepts per domain", () => {
    const domainCounts = new Map<string, number>();
    for (const c of CONCEPTS) {
      domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
    }
    for (const [domain, count] of domainCounts) {
      expect(count, `Domain "${domain}" should have 5 concepts`).toBe(5);
    }
  });

  it("should have required fields for every concept", () => {
    for (const c of CONCEPTS) {
      expect(c.id, `Concept ${c.name} missing id`).toBeTruthy();
      expect(c.name, `Concept ${c.id} missing name`).toBeTruthy();
      expect(c.domain, `Concept ${c.id} missing domain`).toBeTruthy();
      expect(c.source, `Concept ${c.id} missing source`).toBeTruthy();
      expect(c.description, `Concept ${c.id} missing description`).toBeTruthy();
      expect(c.description.length, `Concept ${c.id} description too short`).toBeGreaterThan(20);
    }
  });

  it("should have proper source attributions", () => {
    const validSources = ["Cialdini", "Greene", "Voss", "Kahneman", "Chase Hughes", "Carnegie", "Zimbardo"];
    for (const c of CONCEPTS) {
      expect(
        validSources.includes(c.source),
        `Concept "${c.name}" has invalid source "${c.source}"`
      ).toBe(true);
    }
  });
});
