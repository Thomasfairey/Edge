/**
 * Hono environment types — enables type-safe c.get()/c.set()
 */

import type { AuthUser } from "../middleware/auth.js";

export type AppEnv = {
  Variables: {
    user: AuthUser;
    token: string;
    requestId: string;
  };
};
