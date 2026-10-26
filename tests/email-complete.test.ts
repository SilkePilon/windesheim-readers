import { expect, test, describe } from "bun:test";
import { completeEmail } from "../shared/email";

describe("completeEmail", () => {
  test("student number gets the student domain", () => {
    expect(completeEmail("s1").email).toBe("s1@student.windesheim.nl");
    expect(completeEmail("S1234567 ").email).toBe("s1234567@student.windesheim.nl");
  });
  test("anything else without @ gets the staff domain", () => {
    const r = completeEmail("silke.pilon");
    expect(r.email).toBe("silke.pilon@windesheim.nl");
    expect(r).toMatchObject({ localPart: "silke.pilon", domain: "windesheim.nl", auto: true });
  });
  test("override flips the domain", () => {
    expect(completeEmail("silke.pilon", "student").email).toBe("silke.pilon@student.windesheim.nl");
    expect(completeEmail("s1234567", "staff").email).toBe("s1234567@windesheim.nl");
  });
  test("a full address is used as typed, trimmed and lowercased", () => {
    const r = completeEmail("a@b.nl");
    expect(r.email).toBe("a@b.nl");
    expect(r.auto).toBe(false);
    expect(completeEmail(" Silke.Pilon@Windesheim.nl ", "student").email).toBe("silke.pilon@windesheim.nl");
  });
  test("empty input stays empty", () => {
    expect(completeEmail("").email).toBe("");
    expect(completeEmail("   ").email).toBe("");
  });
});
