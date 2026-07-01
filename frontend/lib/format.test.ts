import { describe, it, expect } from "vitest";
import {
  formatUsd,
  parseUsdToRaw,
  usd6ToPlain,
  bpsToPercent,
  formatBps,
  formatProgress,
  truncateHash,
  formatYearsLeft,
} from "./format";

describe("formatUsd", () => {
  it("formats raw 6-dp USD with grouping + 2dp cents", () => {
    expect(formatUsd("1234560000")).toBe("$1,234.56");
    expect(formatUsd("1000000")).toBe("$1.00");
    expect(formatUsd("0")).toBe("$0.00");
  });

  it("rounds cents half-up without floats", () => {
    expect(formatUsd("1234565000")).toBe("$1,234.57"); // 56.5c -> 57c
    expect(formatUsd("1234564000")).toBe("$1,234.56"); // 56.4c -> 56c
  });

  it("rolls cents into the whole part when they reach 100", () => {
    expect(formatUsd("1234999999")).toBe("$1,235.00");
  });

  it("accepts bigint and handles negatives + the +sign option", () => {
    expect(formatUsd(-1000000n)).toBe("-$1.00");
    expect(formatUsd("1000000", { sign: true })).toBe("+$1.00");
    expect(formatUsd("0", { sign: true })).toBe("+$0.00");
  });
});

describe("parseUsdToRaw", () => {
  it("encodes a dollar string into raw 6-dp (BigInt, no float)", () => {
    expect(parseUsdToRaw("100")).toBe("100000000");
    expect(parseUsdToRaw("100.5")).toBe("100500000");
    expect(parseUsdToRaw("0.000001")).toBe("1");
    expect(parseUsdToRaw("  250.25  ")).toBe("250250000");
  });

  it("rejects non-positive, non-numeric, and >6-decimal input", () => {
    expect(() => parseUsdToRaw("0")).toThrow();
    expect(() => parseUsdToRaw("")).toThrow();
    expect(() => parseUsdToRaw("abc")).toThrow();
    expect(() => parseUsdToRaw("-5")).toThrow();
    expect(() => parseUsdToRaw("1.1234567")).toThrow(); // 7 dp
  });
});

describe("usd6ToPlain", () => {
  it("renders a plain editable decimal, trimming trailing zeros", () => {
    expect(usd6ToPlain("100500000")).toBe("100.5");
    expect(usd6ToPlain("100000000")).toBe("100");
    expect(usd6ToPlain("1")).toBe("0.000001");
    expect(usd6ToPlain(0n)).toBe("0");
  });

  it("round-trips with parseUsdToRaw", () => {
    for (const raw of ["1", "100000000", "123456789", "100500000"]) {
      expect(parseUsdToRaw(usd6ToPlain(raw))).toBe(raw);
    }
  });
});

describe("bps helpers", () => {
  it("bpsToPercent divides by 100", () => {
    expect(bpsToPercent(2000)).toBe(20);
    expect(bpsToPercent(10000)).toBe(100);
  });

  it("formatBps renders a percent string", () => {
    expect(formatBps(2000)).toBe("20.00%");
    expect(formatBps(2000, 0)).toBe("20%");
  });

  it("formatProgress clamps to 0..10000", () => {
    expect(formatProgress(5000)).toBe("50.0%");
    expect(formatProgress(12000)).toBe("100.0%");
    expect(formatProgress(-5)).toBe("0.0%");
  });
});

describe("truncateHash", () => {
  it("truncates long hashes head…tail", () => {
    expect(truncateHash("hash-abcdef1234567890")).toBe("hash-a…7890");
  });

  it("leaves short strings and empty input untouched", () => {
    expect(truncateHash("short")).toBe("short");
    expect(truncateHash("")).toBe("");
  });
});

describe("formatYearsLeft", () => {
  it("labels goal / months / years", () => {
    expect(formatYearsLeft(0)).toBe("at goal");
    expect(formatYearsLeft(-2)).toBe("at goal");
    expect(formatYearsLeft(0.5)).toBe("6 months");
    expect(formatYearsLeft(5)).toBe("5.0 years");
    expect(formatYearsLeft(15)).toBe("15 years");
  });
});
