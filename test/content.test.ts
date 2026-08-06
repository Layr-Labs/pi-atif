import { describe, expect, it } from "vitest";
import { sanitizeJson } from "../src/content.ts";

describe("sanitizeJson", () => {
  it("replaces circular references with null while preserving shared objects", () => {
    const circular: Record<string, unknown> = { value: 1 };
    circular.self = circular;
    const shared = { value: 2 };

    expect(sanitizeJson({ circular, first: shared, second: shared })).toEqual({
      circular: { value: 1, self: null },
      first: { value: 2 },
      second: { value: 2 },
    });
  });

  it("preserves special own property names without changing prototypes", () => {
    const input: Record<string, unknown> = { constructor: "constructor-value", prototype: "prototype-value" };
    Object.defineProperty(input, "__proto__", {
      value: { marker: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const output = sanitizeJson(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(output, "__proto__")).toBe(true);
    expect(output.__proto__).toEqual({ marker: true });
    expect(output.constructor).toBe("constructor-value");
    expect(output.prototype).toBe("prototype-value");
    expect(JSON.stringify(output)).toContain('"__proto__":{"marker":true}');
    expect(({} as Record<string, unknown>).marker).toBeUndefined();
  });
});
