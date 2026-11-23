import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveHarvestCardNumber,
  tcdbNumericSuffix,
} from "./set-factory-harvest-number";

describe("Set Factory TCDB card-number matching", () => {
  it("retains original suffix-to-plain VCS matching", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1", "2", "10", "11"]), {
      kind: "alias", cardNumber: "1",
    });
    assert.deepEqual(resolveHarvestCardNumber("123G", ["123", "12", "1230"]), {
      kind: "alias", cardNumber: "123",
    });
    assert.deepEqual(resolveHarvestCardNumber("001G", ["001", "1"]), {
      kind: "alias", cardNumber: "001",
    });
  });

  it("matches 1998 Ultra Kid Gloves TCDB #1 to VCS #1KG", () => {
    assert.deepEqual(resolveHarvestCardNumber("1", ["1KG", "2KG", "3KG", "10KG", "11KG"]), {
      kind: "alias", cardNumber: "1KG",
    });
    assert.deepEqual(resolveHarvestCardNumber("12", ["1KG", "12KG", "2KG"]), {
      kind: "alias", cardNumber: "12KG",
    });
  });

  it("supports unambiguous alphabetic prefixes or separator variants in VCS", () => {
    for (const stored of ["KG1", "KG-1", "1-KG", "1kg"]) {
      assert.deepEqual(resolveHarvestCardNumber("1", [stored, "2KG", "11KG"]), {
        kind: "alias", cardNumber: stored,
      });
    }
  });

  it("always prefers exact matches to any inferred alias", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1", "1G"]), {
      kind: "exact", cardNumber: "1G",
    });
    assert.deepEqual(resolveHarvestCardNumber("1", ["1", "1KG", "KG1"]), {
      kind: "exact", cardNumber: "1",
    });
  });

  it("rejects ambiguous numeric slots instead of silently misfiling variants", () => {
    assert.deepEqual(resolveHarvestCardNumber("1G", ["1", "1R", "2"]), {
      kind: "ambiguous", candidates: ["1", "1R"],
    });
    assert.deepEqual(resolveHarvestCardNumber("1", ["1KG", "1AT", "2KG"]), {
      kind: "ambiguous", candidates: ["1AT", "1KG"],
    });
    assert.deepEqual(resolveHarvestCardNumber("1", ["1KG", "KG1"]), {
      kind: "ambiguous", candidates: ["1KG", "KG1"],
    });
  });

  it("never translates TCDB lettered parallels into a differently lettered VCS parallel", () => {
    for (const stored of ["1R", "KG1", "1-KG"]) {
      assert.deepEqual(resolveHarvestCardNumber("1G", [stored, "2"]), {
        kind: "not-found",
      });
    }
  });

  it("keeps unexpected source formats and unrelated identifiers strict", () => {
    for (const source of ["G1", "A1B", "1-G", "12A-2", "12.1", ""]) {
      assert.deepEqual(resolveHarvestCardNumber(source, ["1", "12", "1KG"]), {
        kind: "not-found",
      });
    }
    assert.deepEqual(resolveHarvestCardNumber("12", ["12", "12KG"]), {
      kind: "exact", cardNumber: "12",
    });
    assert.equal(tcdbNumericSuffix("1G"), "1");
    assert.equal(tcdbNumericSuffix("G1"), null);
  });

  it("does not treat padding or multi-part numbers as equivalent", () => {
    assert.deepEqual(resolveHarvestCardNumber("2G", ["1", "20"]), {
      kind: "not-found",
    });
    assert.deepEqual(resolveHarvestCardNumber("1G", ["001"]), {
      kind: "not-found",
    });
    assert.deepEqual(resolveHarvestCardNumber("1", ["001KG"]), {
      kind: "not-found",
    });
    assert.deepEqual(resolveHarvestCardNumber("1", ["1-2", "2-1"]), {
      kind: "not-found",
    });
  });
});
