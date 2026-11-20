import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveHarvestCardNumber,
  tcdbNumericSuffix,
} from "./set-factory-harvest-number";

describe("Set Factory TCDB card-number matching", () => {
  it("maps TCDB letter-suffixed numbers to the one plain numeric VCS card", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1", "2", "10", "11"]), {
      kind: "alias",
      cardNumber: "1",
    });
    assert.deepEqual(resolveHarvestCardNumber("123G", ["123", "12", "1230"]), {
      kind: "alias",
      cardNumber: "123",
    });
    assert.deepEqual(resolveHarvestCardNumber("001G", ["001", "1"]), {
      kind: "alias",
      cardNumber: "001",
    });
  });

  it("always prefers an exact match over stripping the suffix", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1", "1G"]), {
      kind: "exact",
      cardNumber: "1G",
    });
  });

  it("rejects ambiguous numeric slots rather than misfiling parallels", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1", "1R", "2"]), {
      kind: "ambiguous",
      candidates: ["1", "1R"],
    });
  });

  it("never translates one lettered parallel into a different parallel", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1R", "2"]), {
      kind: "not-found",
    });
  });

  it("keeps numbers with prefixes, internal letters, and noncard tokens strict", () => {
    for (const source of ["G1", "A1B", "1-G", "12A-2", "12.1", "12", ""]) {
      assert.deepEqual(resolveHarvestCardNumber(source, ["1", "12"]), {
        kind: source === "12" ? "exact" : source === "" ? "not-found" : "not-found",
        ...(source === "12" ? { cardNumber: "12" } : {}),
      });
    }
    assert.equal(tcdbNumericSuffix("1G"), "1");
    assert.equal(tcdbNumericSuffix("G1"), null);
  });

  it("does not match unrelated card numbers or zero padding", () => {
    assert.deepEqual(resolveHarvestCardNumber("2G", ["1", "20"]), {
      kind: "not-found",
    });
    assert.deepEqual(resolveHarvestCardNumber("1G", ["001"]), {
      kind: "not-found",
    });
  });
});
