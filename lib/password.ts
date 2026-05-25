import bcrypt from "bcryptjs";

const COST = 12;

// Module-level constant: a real bcrypt hash of a random throwaway string.
// Used by `authorize` when the looked-up user is null, so timing is equal
// regardless of whether the email exists. Precomputed (not generated at
// import time) to keep cold-start cheap.
export const KNOWN_BAD_HASH =
  "$2b$12$KIXxsT1QIWzqU8RNGqQ9aOQ3SBh0xa4N9G3W3xJ7P1G2xZkS4eYbW";

export function hash(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST);
}

export function verify(plaintext: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hashed);
}

export type StrengthResult =
  | { ok: true }
  | { ok: false; reason: string };

// Policy: 10 ≤ length ≤ 128; at least one non-letter character.
// Specific reasons are surfaced only on signup (where they aren't enumeration).
export function validateStrength(plaintext: string): StrengthResult {
  if (plaintext.length < 10) return { ok: false, reason: "min 10 characters" };
  if (plaintext.length > 128) return { ok: false, reason: "max 128 characters" };
  if (!/[^A-Za-z]/.test(plaintext)) {
    return { ok: false, reason: "must contain at least one number or symbol" };
  }
  return { ok: true };
}
