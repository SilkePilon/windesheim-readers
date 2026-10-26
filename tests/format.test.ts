import { expect, test } from "bun:test";
import { formatInterval } from "../shared/format";

test("formatInterval", () => {
  expect(formatInterval(60_000, "nl")).toBe("1 min");
  expect(formatInterval(8 * 60_000, "nl")).toBe("8 min");
  expect(formatInterval(5 * 3600_000, "nl")).toBe("5 uur");
  expect(formatInterval(5 * 3600_000, "en")).toBe("5 h");
  expect(formatInterval(2 * 86400_000, "nl")).toBe("2 dagen");
  expect(formatInterval(86400_000, "nl")).toBe("1 dag");
  expect(formatInterval(86400_000, "en")).toBe("1 day");
  expect(formatInterval(2 * 86400_000, "en")).toBe("2 days");
  expect(formatInterval(45 * 86400_000, "nl")).toBe("1,5 mnd");
  expect(formatInterval(60 * 86400_000, "en")).toBe("2 mo");
  expect(formatInterval(400 * 86400_000, "en")).toBe("1.1 yr");
});
