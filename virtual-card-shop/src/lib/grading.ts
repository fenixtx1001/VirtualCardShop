// src/lib/grading.ts
import type { Gradeability } from "@prisma/client";

export type VcsGrade = 6 | 7 | 8 | 9 | 10;

export const RAW_GRADE = 0;
export const VCS_GRADES: VcsGrade[] = [6, 7, 8, 9, 10];

export const GRADING_FEE_BPS = 1500; // 15%
export const MIN_GRADING_FEE_CENTS = 200; // $2.00
export const GRADED_SHOP_OFFER_BONUS_BPS = 1000; // +10%

const UNIVERSAL_GRADE_REVEAL_WAIT_MS = 24 * 60 * 60 * 1000;

const UNIVERSAL_GRADE_ODDS: Record<VcsGrade, number> = {
  6: 5,
  7: 15,
  8: 44,
  9: 32,
  10: 4,
};

const UNIVERSAL_GRADE_VALUE_MULTIPLIERS: Record<VcsGrade, number> = {
  6: 0.8,
  7: 1.05,
  8: 1.45,
  9: 2.6,
  10: 15.0,
};

// Keep these exports shaped the same so existing code keeps compiling.
// Gradeability no longer changes grading odds, values, or wait times.
export const GRADE_REVEAL_WAIT_MS: Record<Gradeability, number> = {
  COMMON: UNIVERSAL_GRADE_REVEAL_WAIT_MS,
  GREAT: UNIVERSAL_GRADE_REVEAL_WAIT_MS,
  ICONIC: UNIVERSAL_GRADE_REVEAL_WAIT_MS,
};

export const GRADE_ODDS: Record<Gradeability, Record<VcsGrade, number>> = {
  COMMON: UNIVERSAL_GRADE_ODDS,
  GREAT: UNIVERSAL_GRADE_ODDS,
  ICONIC: UNIVERSAL_GRADE_ODDS,
};

export const GRADE_VALUE_MULTIPLIERS: Record<Gradeability, Record<VcsGrade, number>> = {
  COMMON: UNIVERSAL_GRADE_VALUE_MULTIPLIERS,
  GREAT: UNIVERSAL_GRADE_VALUE_MULTIPLIERS,
  ICONIC: UNIVERSAL_GRADE_VALUE_MULTIPLIERS,
};

export function normalizeGradeability(value: unknown): Gradeability {
  return value === "GREAT" || value === "ICONIC" || value === "COMMON" ? value : "COMMON";
}

export function getEffectiveGradeability(input: {
  cardOverride?: Gradeability | null;
  productSetDefault?: Gradeability | null;
}): Gradeability {
  // Gradeability is now legacy metadata only. It no longer affects grading.
  // Return COMMON as the stable universal grading profile.
  return "COMMON";
}

export function bookValueToCents(bookValue: unknown): number {
  const n = typeof bookValue === "number" && Number.isFinite(bookValue) ? bookValue : Number(bookValue ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export function calculateGradingFeeCents(rawBookValueCents: number): number {
  if (!Number.isFinite(rawBookValueCents) || rawBookValueCents <= 0) return MIN_GRADING_FEE_CENTS;
  return Math.max(MIN_GRADING_FEE_CENTS, Math.round((rawBookValueCents * GRADING_FEE_BPS) / 10000));
}

export function getGradeMultiplier(_gradeability: Gradeability, grade: number): number {
  if (!VCS_GRADES.includes(grade as VcsGrade)) return 1;
  return UNIVERSAL_GRADE_VALUE_MULTIPLIERS[grade as VcsGrade] ?? 1;
}

export function calculateGradedValueCents(input: {
  rawBookValueCents: number;
  gradeability: Gradeability;
  grade: number;
}): number {
  const multiplier = getGradeMultiplier(input.gradeability, input.grade);
  return Math.round(input.rawBookValueCents * multiplier);
}

export function calculateReadyAt(input: {
  now?: Date;
  gradeability: Gradeability;
}): Date {
  const now = input.now ?? new Date();
  return new Date(now.getTime() + UNIVERSAL_GRADE_REVEAL_WAIT_MS);
}

export function rollVcsGrade(_gradeability: Gradeability, randomValue = Math.random()): VcsGrade {
  const roll = Math.max(0, Math.min(0.999999999, randomValue)) * 100;

  let cumulative = 0;
  for (const grade of VCS_GRADES) {
    cumulative += UNIVERSAL_GRADE_ODDS[grade];
    if (roll < cumulative) return grade;
  }

  return 8;
}

export function expectedGradeMultiplier(_gradeability: Gradeability): number {
  return VCS_GRADES.reduce((sum, grade) => {
    return sum + (UNIVERSAL_GRADE_ODDS[grade] / 100) * UNIVERSAL_GRADE_VALUE_MULTIPLIERS[grade];
  }, 0);
}

export function labelGradeability(_gradeability: Gradeability): string {
  return "Standard";
}

export function labelVcsGrade(grade: number): string {
  return grade === RAW_GRADE ? "Raw" : `VCS ${grade}`;
}