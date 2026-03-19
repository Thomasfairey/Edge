/**
 * Supabase client for server components and API routes.
 * Uses cookie-based session auth via @supabase/ssr.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase client that reads/writes auth cookies.
 * Use this in Server Components, Server Actions, and Route Handlers
 * when you need the authenticated user's identity.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components (read-only)
          }
        },
      },
    }
  );
}

/**
 * Get the authenticated user's ID, or null if not authenticated.
 * Returns null (rather than throwing) if Supabase is unreachable,
 * so callers fall through to the unauthenticated path gracefully.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    // Supabase unreachable — treat as unauthenticated rather than crashing
    return null;
  }
}
