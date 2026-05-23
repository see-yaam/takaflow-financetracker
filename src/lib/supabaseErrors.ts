import type { PostgrestError } from "@supabase/supabase-js";
import { ZodError } from "zod";

const CODE_MESSAGES: Record<string, string> = {
  "23505": "This record already exists.",
  "23503": "This action cannot be completed because related data exists.",
  "42501": "You do not have permission to perform this action.",
  "PGRST116": "The requested item was not found.",
  "22P02": "Invalid data format. Please check your input.",
};

export function mapSupabaseError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.errors[0]?.message ?? "Please check your input and try again.";
  }

  if (error instanceof Error && !(error as PostgrestError).code) {
    const msg = error.message;
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return "Network error. Check your connection and try again.";
    }
    if (msg.includes("JWT") || msg.includes("session")) {
      return "Your session has expired. Please sign in again.";
    }
    if (msg.toLowerCase().includes("invalid login credentials")) {
      return "Incorrect email or password. Please try again.";
    }
    if (msg.toLowerCase().includes("user already registered")) {
      return "An account with this email already exists. Try logging in.";
    }
    if (msg.toLowerCase().includes("email not confirmed")) {
      return "Please confirm your email before signing in.";
    }
    if (msg.length < 120 && !msg.includes("PostgREST") && !msg.includes("PGRST")) {
      return msg;
    }
  }

  const pg = error as PostgrestError;
  if (pg?.code && CODE_MESSAGES[pg.code]) {
    return CODE_MESSAGES[pg.code];
  }

  if (pg?.message) {
    const lower = pg.message.toLowerCase();
    if (lower.includes("row-level security") || lower.includes("permission denied")) {
      return "You do not have permission to perform this action.";
    }
    if (lower.includes("duplicate key")) {
      return "This record already exists.";
    }
    if (lower.includes("violates foreign key")) {
      return "This action cannot be completed because related data exists.";
    }
  }

  return "Something went wrong. Please try again.";
}

export function throwIfSupabaseError(error: PostgrestError | null): void {
  if (error) throw new Error(mapSupabaseError(error));
}
