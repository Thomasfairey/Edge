/**
 * Concept taxonomy — ported from web app with expanded library.
 * 35+ concepts across 7 domains.
 */

import { Concept, ConceptDomain } from "../types/domain.js";
import { getDueReviews } from "../services/spaced-rep.js";
import { SupabaseClient } from "@supabase/supabase-js";

export const CONCEPTS: Concept[] = [
  // ── Influence & Persuasion (Cialdini) ──
  { id: "reciprocity", name: "Reciprocity", domain: "Influence & Persuasion", source: "Cialdini", description: "The obligation to return favours creates leverage before a request is ever made. Giving first — even something small — triggers an automatic compliance response." },
  { id: "commitment-consistency", name: "Commitment & Consistency", domain: "Influence & Persuasion", source: "Cialdini", description: "Once someone takes a small public position, they feel compelled to act consistently with it. Getting a micro-commitment early locks in future compliance." },
  { id: "social-proof", name: "Social Proof", domain: "Influence & Persuasion", source: "Cialdini", description: "People look to others' actions to determine their own, especially under uncertainty. The behaviour of similar others is the strongest signal." },
  { id: "authority", name: "Authority", domain: "Influence & Persuasion", source: "Cialdini", description: "Perceived expertise and status markers dramatically increase compliance. Titles, credentials, and confident delivery trigger automatic deference." },
  { id: "scarcity", name: "Scarcity", domain: "Influence & Persuasion", source: "Cialdini", description: "Limited availability increases perceived value and urgency to act. Loss of access is more motivating than potential gain." },

  // ── Power Dynamics (Greene) ──
  { id: "never-outshine-master", name: "Law 1 — Never Outshine the Master", domain: "Power Dynamics", source: "Greene", description: "Making superiors feel intellectually or socially inferior triggers insecurity and retaliation. Always make those above you feel comfortably superior." },
  { id: "conceal-intentions", name: "Law 3 — Conceal Your Intentions", domain: "Power Dynamics", source: "Greene", description: "Keeping your true goals opaque prevents others from preparing countermeasures. Use decoy desires and red herrings to throw people off the scent." },
  { id: "court-attention", name: "Law 6 — Court Attention at All Costs", domain: "Power Dynamics", source: "Greene", description: "Visibility is power — being ignored is worse than being attacked. Everything is judged by its appearance; what is unseen counts for nothing." },
  { id: "crush-enemy", name: "Law 15 — Crush Your Enemy Totally", domain: "Power Dynamics", source: "Greene", description: "A half-defeated enemy recovers and seeks revenge. If you leave even a single ember of opposition, it will eventually reignite." },
  { id: "discover-thumbscrew", name: "Law 33 — Discover Each Person's Thumbscrew", domain: "Power Dynamics", source: "Greene", description: "Everyone has a weakness, a gap in their armour. It is usually an insecurity, an uncontrollable emotion, or a secret need. Find it and you have leverage." },

  // ── Negotiation (Voss) ──
  { id: "tactical-empathy", name: "Tactical Empathy", domain: "Negotiation", source: "Voss", description: "Demonstrating understanding of the other side's perspective — without agreeing with it — creates psychological safety that opens them to influence." },
  { id: "mirroring", name: "Mirroring", domain: "Negotiation", source: "Voss", description: "Repeating the last 1–3 words of what someone said triggers unconscious elaboration and builds rapport." },
  { id: "labelling", name: "Labelling", domain: "Negotiation", source: "Voss", description: "Naming the other person's emotion ('It seems like you're frustrated by...') defuses negative feelings and creates a sense of being deeply understood." },
  { id: "calibrated-questions", name: "Calibrated Questions", domain: "Negotiation", source: "Voss", description: "'How' and 'What' questions give the illusion of control to the other party while steering the conversation." },
  { id: "accusation-audit", name: "The Accusation Audit", domain: "Negotiation", source: "Voss", description: "Pre-emptively listing every negative thing the other side could think about you neutralises objections before they crystallise." },

  // ── Behavioural Psychology & Cognitive Bias (Kahneman) ──
  { id: "anchoring", name: "Anchoring Effect", domain: "Behavioural Psychology & Cognitive Bias", source: "Kahneman", description: "The first number or frame presented disproportionately influences all subsequent judgments." },
  { id: "framing", name: "Framing Effect", domain: "Behavioural Psychology & Cognitive Bias", source: "Kahneman", description: "Identical information presented differently produces opposite decisions." },
  { id: "loss-aversion", name: "Loss Aversion", domain: "Behavioural Psychology & Cognitive Bias", source: "Kahneman", description: "Losses feel roughly twice as painful as equivalent gains feel good. Framing in terms of what will be lost is more motivating." },
  { id: "availability-heuristic", name: "Availability Heuristic", domain: "Behavioural Psychology & Cognitive Bias", source: "Kahneman", description: "People judge probability by how easily examples come to mind, not by actual frequency." },
  { id: "sunk-cost", name: "Sunk Cost Fallacy", domain: "Behavioural Psychology & Cognitive Bias", source: "Kahneman", description: "Prior investment makes people continue failing courses of action to justify past decisions." },

  // ── Nonverbal Intelligence & Behavioural Profiling (Chase Hughes) ──
  { id: "baseline-reading", name: "Baseline Behaviour Reading", domain: "Nonverbal Intelligence & Behavioural Profiling", source: "Chase Hughes", description: "Before you can detect deception or stress, you must establish someone's baseline: their normal posture, speech cadence, eye movement." },
  { id: "deviation-detection", name: "Deviation Detection", domain: "Nonverbal Intelligence & Behavioural Profiling", source: "Chase Hughes", description: "Meaningful behavioural shifts occur at moments of internal stress. The deviation is the signal, not the specific behaviour." },
  { id: "authority-posture", name: "Authority Posture", domain: "Nonverbal Intelligence & Behavioural Profiling", source: "Chase Hughes", description: "Specific body positions signal status and dominance to the limbic system before the conscious mind registers it." },
  { id: "microexpression-clusters", name: "Microexpression Clusters", domain: "Nonverbal Intelligence & Behavioural Profiling", source: "Chase Hughes", description: "Fleeting facial expressions reveal concealed emotions. Clusters of 3+ signals within a 5-second window indicate genuine emotional leakage." },
  { id: "ellipsis-model", name: "The Ellipsis Model", domain: "Nonverbal Intelligence & Behavioural Profiling", source: "Chase Hughes", description: "A comprehensive behavioural profiling framework that maps observable behaviour patterns to predictable responses." },

  // ── Rapport & Relationship Engineering (Carnegie) ──
  { id: "genuine-interest", name: "Genuine Interest Principle", domain: "Rapport & Relationship Engineering", source: "Carnegie", description: "Becoming genuinely interested in other people generates more influence in two months than trying to get others interested in you achieves in two years." },
  { id: "name-recall", name: "Name Recall", domain: "Rapport & Relationship Engineering", source: "Carnegie", description: "A person's name is the sweetest sound in any language to that person. Remembering and using it correctly builds instant rapport." },
  { id: "avoid-criticism", name: "Avoid Criticism", domain: "Rapport & Relationship Engineering", source: "Carnegie", description: "Direct criticism triggers defensive identity protection and shuts down receptivity." },
  { id: "talk-their-interests", name: "Talk in Terms of Their Interests", domain: "Rapport & Relationship Engineering", source: "Carnegie", description: "The royal road to influence is talking about what the other person values most." },
  { id: "make-them-important", name: "Make Them Feel Important", domain: "Rapport & Relationship Engineering", source: "Carnegie", description: "The deepest principle in human nature is the craving to be appreciated." },

  // ── Dark Psychology & Coercive Technique Recognition ──
  { id: "gaslighting", name: "Gaslighting Recognition", domain: "Dark Psychology & Coercive Technique Recognition", source: "Zimbardo", description: "Systematic denial of another person's reality to destabilise their confidence and judgment." },
  { id: "darvo", name: "DARVO Pattern", domain: "Dark Psychology & Coercive Technique Recognition", source: "Zimbardo", description: "Deny, Attack, Reverse Victim and Offender. When confronted, the aggressor denies, attacks, then claims to be the real victim." },
  { id: "manufactured-urgency", name: "Manufactured Urgency", domain: "Dark Psychology & Coercive Technique Recognition", source: "Cialdini", description: "Creating artificial time pressure to bypass deliberate analysis and force impulsive compliance." },
  { id: "information-asymmetry", name: "Information Asymmetry Exploitation", domain: "Dark Psychology & Coercive Technique Recognition", source: "Greene", description: "Deliberately controlling what the other party knows to maintain strategic advantage." },
  { id: "love-bombing-professional", name: "Love-Bombing in Professional Contexts", domain: "Dark Psychology & Coercive Technique Recognition", source: "Zimbardo", description: "Overwhelming someone with excessive praise and attention early in a professional relationship to create dependency." },
];

// ---------------------------------------------------------------------------
// Concept selection — now per-user
// ---------------------------------------------------------------------------

export async function selectConcept(
  db: SupabaseClient,
  userId: string,
  completedIds: string[]
): Promise<{ concept: Concept; isReview: boolean }> {
  // Check for due reviews — 30% chance of review session
  try {
    const dueReviews = await getDueReviews(db, userId);
    if (dueReviews.length > 0 && Math.random() < 0.3) {
      const reviewConcept = CONCEPTS.find((c) => c.id === dueReviews[0].conceptId);
      if (reviewConcept) {
        return { concept: reviewConcept, isReview: true };
      }
    }
  } catch {
    // SR not available — continue with normal selection
  }

  return { concept: selectNewConcept(completedIds), isReview: false };
}

function selectNewConcept(completedIds: string[]): Concept {
  const completedSet = new Set(completedIds);
  const available = CONCEPTS.filter((c) => !completedSet.has(c.id));

  if (available.length === 0) {
    return CONCEPTS[Math.floor(Math.random() * CONCEPTS.length)];
  }

  let lastDomain: ConceptDomain | null = null;
  if (completedIds.length > 0) {
    const lastId = completedIds[completedIds.length - 1];
    const lastConcept = CONCEPTS.find((c) => c.id === lastId);
    if (lastConcept) lastDomain = lastConcept.domain;
  }

  if (lastDomain) {
    const differentDomain = available.filter((c) => c.domain !== lastDomain);
    if (differentDomain.length > 0) {
      return differentDomain[Math.floor(Math.random() * differentDomain.length)];
    }
  }

  return available[Math.floor(Math.random() * available.length)];
}
