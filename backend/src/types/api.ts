/**
 * API request/response types with Zod validation schemas.
 */

import { z } from "zod";
import type { SessionScores } from "./domain.js";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: z.string().min(1).max(100),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AppleSignInSchema = z.object({
  id_token: z.string().min(1),
  nonce: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  professional_context: z.string().max(2000).optional(),
  communication_style: z.string().max(500).optional(),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  goals: z.array(z.string().max(200)).max(10).optional(),
});

export const OnboardingSchema = z.object({
  display_name: z.string().min(1).max(100),
  professional_context: z.string().min(10).max(2000),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  goals: z.array(z.string().max(200)).min(1).max(10),
});

// ---------------------------------------------------------------------------
// Session phases
// ---------------------------------------------------------------------------

export const CheckinSchema = z.object({
  mission_response: z.string().min(1).max(2000),
});

export const RoleplayMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().uuid(),
});

export const CoachRequestSchema = z.object({
  session_id: z.string().uuid(),
  transcript: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

export const DebriefRequestSchema = z.object({
  session_id: z.string().uuid(),
});

export const RetrievalBridgeSchema = z.object({
  session_id: z.string().uuid(),
  user_response: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export const VerifyReceiptSchema = z.object({
  receipt_data: z.string().min(1),
  product_id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface StatusResponse {
  dayNumber: number;
  lastEntry: {
    concept: string;
    mission: string;
    mission_outcome: string;
    scores: SessionScores;
  } | null;
  recentScores: Array<{
    day: number;
    scores: SessionScores;
  }>;
  streakCount: number;
  srSummary: {
    totalConcepts: number;
    dueForReview: number;
    masteredCount: number;
  };
  sessionsThisWeek: number;
  tier: "free" | "pro";
}

export interface LessonResponse {
  concept_id: string;
  concept_name: string;
  domain: string;
  is_review: boolean;
}

export interface SessionStartResponse {
  session_id: string;
  day: number;
  needs_checkin: boolean;
  last_mission: string | null;
}
