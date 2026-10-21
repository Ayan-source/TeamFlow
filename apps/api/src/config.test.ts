import { describe, expect, it } from "vitest";
import { parsePort } from "./config.js";

describe("parsePort", () => {
  it("defaults to 3001 when PORT is not set", () => {
    expect(parsePort(undefined)).toBe(3001);
  });

  it.each(["1", "3001", "65535"])("accepts port %s", (value) => {
    expect(parsePort(value)).toBe(Number(value));
  });

  it.each(["", "0", "-1", "65536", "abc", "3001.5"])("rejects invalid port %s", (value) => {
    expect(() => parsePort(value)).toThrow("PORT must be an integer between 1 and 65535.");
  });
});
