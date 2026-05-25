import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { sign, verify } from "./signed-cookie";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa";
});

function signRaw(body: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(body).digest("base64url");
}

describe("signed-cookie", () => {
  it("roundtrips a payload", () => {
    const payload = { userId: "u1", ids: ["c1", "c2"], iat: 123 };
    const token = sign(payload);
    expect(verify(token)).toEqual(payload);
  });

  it("returns null on tampered body", () => {
    const token = sign({ userId: "u1", ids: ["c1"], iat: 1 });
    const dot = token.lastIndexOf(".");
    const tampered = token.slice(0, dot - 2) + "xx" + token.slice(dot);
    expect(verify(tampered)).toBeNull();
  });

  it("returns null on tampered signature", () => {
    const token = sign({ userId: "u1", ids: ["c1"], iat: 1 });
    expect(verify(token.slice(0, -2) + "xx")).toBeNull();
  });

  it("returns null on missing input", () => {
    expect(verify(undefined)).toBeNull();
    expect(verify(null)).toBeNull();
    expect(verify("")).toBeNull();
    expect(verify("nodot")).toBeNull();
  });

  it("returns null when body is invalid JSON but signature checks", () => {
    const garbage = Buffer.from("definitely-not-json").toString("base64url");
    expect(verify(`${garbage}.${signRaw(garbage)}`)).toBeNull();
  });

  it("returns null when payload shape is wrong but signature checks", () => {
    const garbage = Buffer.from(JSON.stringify({ unrelated: "object" })).toString("base64url");
    expect(verify(`${garbage}.${signRaw(garbage)}`)).toBeNull();
  });
});
