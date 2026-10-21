// Regression checks for the VCS Graded Valuation V2 sliding premium.
// Pure math, NO database access or writes.
// Run: npx tsx scripts/test-graded-valuation-v2.ts
import assert from "node:assert/strict";
import {
  bookValueToCents, calculateGradedValueCents, calculateGradingFeeCents,
  GRADED_V2_REFERENCE_FLOORS_CENTS, GRADED_V2_REFERENCE_RAW_CENTS,
  getGradeMultiplier, GRADE_ODDS, GRADE_REVEAL_WAIT_MS,
} from "../src/lib/grading";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";
const profiles: Gradeability[] = ["COMMON", "GREAT", "ICONIC"];
const grades = [6, 7, 8, 9, 10];

function calculate(rawCents: number, grade: number, gradeability: Gradeability = "COMMON") {
  return calculateGradedValueCents({ rawBookValueCents: rawCents, gradeability, grade });
}
function previous(rawCents: number, grade: number, gradeability: Gradeability = "COMMON") {
  return Math.round(rawCents * getGradeMultiplier(gradeability, grade));
}

// Check the *agreed* example table, including exact cent rounding.
const referenceCases: Array<[number, number, number, number]> = [
  // raw cents, grade 8 cents, grade 9 cents, grade 10 cents
  [5, 32, 47, 237],
  [10, 45, 67, 335],
  [25, 71, 106, 530],
  [50, 100, 150, 750],
  [60, 110, 164, 900],
  [100, 145, 260, 1500],
];
for (const [rawCents, eight, nine, ten] of referenceCases) {
  assert.equal(calculate(rawCents, 8), eight, "Grade 8 reference: raw=" + rawCents);
  assert.equal(calculate(rawCents, 9), nine, "Grade 9 reference: raw=" + rawCents);
  assert.equal(calculate(rawCents, 10), ten, "Grade 10 reference: raw=" + rawCents);
}

assert.equal(GRADED_V2_REFERENCE_RAW_CENTS, 50);
assert.deepEqual(GRADED_V2_REFERENCE_FLOORS_CENTS, { 8: 100, 9: 150, 10: 750 });

// Exhaustive 0¢ through $10.00, plus large premium cards.
// Preserve original values EXACTLY for every card >= $1.00.
// Grade 6 and 7 valuations never change, including 1-cent commons.
let verified = 0;
for (const gradeability of profiles) {
  for (const rawCents of [
    ...Array.from({ length: 1001 }, (_, i) => i),
    1001, 10000, 10001, 100000, 1000000, 999999999,
  ]) {
    for (const grade of grades) {
      const now = calculate(rawCents, grade, gradeability);
      const old = previous(rawCents, grade, gradeability);
      assert.ok(Number.isInteger(now) && now >= 0);
      if (rawCents >= 100 || grade <= 7) {
        assert.equal(now, old,
          `Protected valuation changed: profile=${gradeability}, grade=${grade}, raw=${rawCents}¢`);
      } else {
        assert.ok(now >= old,
          `Low-end premium must not reduce value: grade=${grade}, raw=${rawCents}¢`);
      }
      verified++;
    }
  }
}

// Preserve a premium hierarchy for every 1-cent step in the cheap-card range.
for (const grade of [8, 9, 10]) {
  for (let rawCents = 1; rawCents < 100; rawCents++) {
    assert.ok(calculate(rawCents + 1, grade) >= calculate(rawCents, grade),
      `Rarer raw card became less valuable: grade=${grade}, raw=${rawCents}¢`);
  }
}
for (let rawCents = 1; rawCents <= 100; rawCents++) {
  assert.ok(calculate(rawCents, 10) >= calculate(rawCents, 9));
  assert.ok(calculate(rawCents, 9) >= calculate(rawCents, 8));
  assert.ok(calculate(rawCents, 8) >= calculate(rawCents, 7));
}

// Grade odds and the $1 minimum fee remain exactly the same.
assert.deepEqual(GRADE_ODDS.COMMON, { 6: 5, 7: 15, 8: 44, 9: 32, 10: 4 });
assert.equal(calculateGradingFeeCents(bookValueToCents(0.05)), 100);
assert.equal(calculateGradingFeeCents(bookValueToCents(0.60)), 100);
assert.equal(calculateGradingFeeCents(bookValueToCents(1.00)), 100);
assert.equal(GRADE_REVEAL_WAIT_MS.COMMON, 24 * 60 * 60 * 1000);

console.log("VCS Graded Valuation V2 regression checks PASSED");
console.log("Protected cents/grades verified:", verified.toLocaleString("en-US"));
console.log("Every graded $1+ raw valuation is unchanged.");
console.log("Grades 6/7, reveal odds, timing, and grading fee unchanged.");
console.log("No database access or mutations.");
