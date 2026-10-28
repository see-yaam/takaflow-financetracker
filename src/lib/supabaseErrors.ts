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

  const errAny = error as Record<string, unknown> | undefined;
  const msg =
    error instanceof Error
      ? error.message
      : typeof errAny?.message === "string"
      ? errAny.message
      : typeof errAny?.error_description === "string"
      ? errAny.error_description
      : typeof error === "string"
      ? error
      : "";
  const lower = msg.toLowerCase();
  const errCode = (typeof errAny?.code === "string" ? errAny.code : "").toLowerCase();

  // Supabase Auth errors
  if (
    errCode === "invalid_credentials" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid_grant")
  ) {
    return "Incorrect email or password. Please check your details or sign in using a 6-digit OTP code.";
  }

  if (
    errCode === "email_not_confirmed" ||
    lower.includes("email not confirmed")
  ) {
    return "Please confirm your email before signing in, or use 6-digit OTP to access your vault.";
  }

  if (
    errCode === "user_already_exists" ||
    lower.includes("user already registered")
  ) {
    return "An account with this email already exists. Try logging in.";
  }

  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Network error. Check your connection and try again.";
  }

  if (lower.includes("jwt") || lower.includes("session")) {
    return "Your session has expired. Please sign in again.";
  }

  // Postgres SQL specific codes
  if (errCode && CODE_MESSAGES[errCode]) {
    return CODE_MESSAGES[errCode];
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "You do not have permission to perform this action.";
  }

  if (lower.includes("duplicate key")) {
    return "This record already exists.";
  }

  if (lower.includes("violates foreign key")) {
    return "This action cannot be completed because related data exists.";
  }

  if (msg.length > 0 && msg.length < 120 && !msg.includes("PostgREST") && !msg.includes("PGRST")) {
    return msg;
  }

  const pg = error as PostgrestError;
  if (pg?.code && CODE_MESSAGES[pg.code]) {
    return CODE_MESSAGES[pg.code];
  }

  return "Something went wrong. Please try again.";
}

export function throwIfSupabaseError(error: PostgrestError | null): void {
  if (error) throw new Error(mapSupabaseError(error));
}
