import { describe, it, expect } from "vitest";
import { hash, verify, validateStrength, KNOWN_BAD_HASH } from "./password";

describe("validateStrength", () => {
  it("rejects empty", () => {
    expect(validateStrength("")).toEqual({ ok: false, reason: "min 10 characters" });
  });

  it("rejects 9 chars", () => {
    expect(validateStrength("abcdefgh1")).toEqual({ ok: false, reason: "min 10 characters" });
  });

  it("rejects 10 chars all letters", () => {
    expect(validateStrength("abcdefghij")).toEqual({
      ok: false,
      reason: "must contain at least one number or symbol",
    });
  });

  it("accepts 10 chars with a digit", () => {
    expect(validateStrength("abcdefghi1")).toEqual({ ok: true });
  });

  it("accepts 10 chars with a symbol", () => {
    expect(validateStrength("abcdefghi!")).toEqual({ ok: true });
  });

  it("accepts boundary 128 chars", () => {
    expect(validateStrength("a".repeat(127) + "1")).toEqual({ ok: true });
  });

  it("rejects 129 chars", () => {
    expect(validateStrength("a".repeat(128) + "1")).toEqual({
      ok: false,
      reason: "max 128 characters",
    });
  });
});

describe("hash + verify", () => {
  it("verifies a freshly hashed password", async () => {
    const h = await hash("correct horse battery staple 9");
    expect(await verify("correct horse battery staple 9", h)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const h = await hash("correct horse battery staple 9");
    expect(await verify("wrong password 9", h)).toBe(false);
  });

  it("KNOWN_BAD_HASH does not validate against any reasonable password", async () => {
    // The point of KNOWN_BAD_HASH is that nobody knows its plaintext, so any
    // user-supplied password should fail to verify against it.
    expect(await verify("anything anyone might try", KNOWN_BAD_HASH)).toBe(false);
  });
});
