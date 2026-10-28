import { describe, it, expect } from "vitest";
import { mapSupabaseError, throwIfSupabaseError } from "@/lib/supabaseErrors";
import { ZodError, z } from "zod";

describe("Supabase Error Mapping & Resilience", () => {
  it("translates Zod validation errors to readable user messages", () => {
    const schema = z.object({
      amount: z.number().positive("Amount must be greater than zero"),
    });

    try {
      schema.parse({ amount: -10 });
    } catch (err) {
      const msg = mapSupabaseError(err);
      expect(msg).toBe("Amount must be greater than zero");
    }
  });

  it("handles invalid login credentials cleanly", () => {
    const error = new Error("Invalid login credentials");
    expect(mapSupabaseError(error)).toContain("Incorrect email or password");

    const authErrorObj = { code: "invalid_credentials", message: "User not recognized" };
    expect(mapSupabaseError(authErrorObj)).toContain("Incorrect email or password");
  });

  it("handles unconfirmed email errors", () => {
    const error = new Error("Email not confirmed");
    expect(mapSupabaseError(error)).toContain("Please confirm your email before signing in");
  });

  it("handles existing user duplicate errors", () => {
    const error = new Error("User already registered");
    expect(mapSupabaseError(error)).toContain("An account with this email already exists");
  });

  it("handles network failure and disconnection cleanly", () => {
    const error = new Error("Failed to fetch");
    expect(mapSupabaseError(error)).toContain("Network error");
  });

  it("maps Postgres SQL error codes to helpful guidance", () => {
    expect(mapSupabaseError({ code: "23505" })).toBe("This record already exists.");
    expect(mapSupabaseError({ code: "23503" })).toBe(
      "This action cannot be completed because related data exists."
    );
    expect(mapSupabaseError({ code: "42501" })).toBe(
      "You do not have permission to perform this action."
    );
    expect(mapSupabaseError({ code: "PGRST116" })).toBe("The requested item was not found.");
    expect(mapSupabaseError({ code: "22P02" })).toBe("Invalid data format. Please check your input.");
  });

  it("fallbacks to generic error message for unknown shapes", () => {
    expect(mapSupabaseError(null)).toBe("Something went wrong. Please try again.");
    expect(mapSupabaseError(undefined)).toBe("Something went wrong. Please try again.");
  });

  describe("throwIfSupabaseError", () => {
    it("does not throw when error is null", () => {
      expect(() => throwIfSupabaseError(null)).not.toThrow();
    });

    it("throws mapped Error when PostgrestError is passed", () => {
      const pgError = {
        name: "PostgrestError",
        message: "duplicate key value violates unique constraint",
        details: "",
        hint: "",
        code: "23505",
      };
      expect(() => throwIfSupabaseError(pgError as any)).toThrow("This record already exists.");
    });
  });
});
