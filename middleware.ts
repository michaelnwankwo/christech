// middleware.ts (project root → re-export from src for clarity)
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets and the Paystack webhook (it must never be
  // redirected by auth middleware; it authenticates via HMAC instead).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|api/webhooks/).*)",
  ],
};
