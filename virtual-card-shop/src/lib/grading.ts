// src/lib/grading.ts
import type { Gradeability } from "@prisma/client";

export type VcsGrade = 6 | 7 | 8 | 9 | 10;

export const RAW_GRADE = 0;
export const VCS_GRADES: VcsGrade[] = [6, 7, 8, 9, 10];

export const GRADING_FEE_BPS = 1500; // 15%
export const MIN_GRADING_FEE_CENTS = 200; // $2.00
export const GRADED_SHOP_OFFER_BONUS_BPS = 1000; // +10%

export const GRADE_REVEAL_WAIT_MS: Record<Gradeability, number> = {
  COMMON: 2 * 60 * 60 * 1000,
  GREAT: 12 * 60 * 60 * 1000,
  ICONIC: 24 * 60 * 60 * 1000,
};

export const GRADE_ODDS: Record<Gradeability, Record<VcsGrade, number>> = {
  COMMON: {
    6: 7,
    7: 18,
    8: 45,
    9: 27,
    10: 3,
  },
  GREAT: {
    6: 6,
    7: 17,
    8: 44,
    9: 29,
    10: 4,
  },
  ICONIC: {
    6: 5,
    7: 15,
    8: 42,
    9: 33,
    10: 5,
  },
};

export const GRADE_VALUE_MULTIPLIERS: Record<Gradeability, Record<VcsGrade, number>> = {
  COMMON: {
    6: 0.75,
    7: 0.9,
    8: 1.1,
    9: 1.4,
    10: 4.0,
  },
  GREAT: {
    6: 0.7,
    7: 0.95,
    8: 1.25,
    9: 1.9,
    10: 6.0,
  },
  ICONIC: {
    6: 0.8,
    7: 1.05,
    8: 1.45,
    9: 2.6,
    10: 10.0,
  },
};

export function normalizeGradeability(value: unknown): Gradeability {
  return value === "GREAT" || value === "ICONIC" || value === "COMMON" ? value : "COMMON";
}

export function getEffectiveGradeability(input: {
  cardOverride?: Gradeability | null;
  productSetDefault?: Gradeability | null;
}): Gradeability {
  return normalizeGradeability(input.cardOverride ?? input.productSetDefault ?? "COMMON");
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

export function getGradeMultiplier(gradeability: Gradeability, grade: number): number {
  if (!VCS_GRADES.includes(grade as VcsGrade)) return 1;
  return GRADE_VALUE_MULTIPLIERS[gradeability][grade as VcsGrade] ?? 1;
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
  return new Date(now.getTime() + GRADE_REVEAL_WAIT_MS[input.gradeability]);
}

export function rollVcsGrade(gradeability: Gradeability, randomValue = Math.random()): VcsGrade {
  const odds = GRADE_ODDS[gradeability];
  const roll = Math.max(0, Math.min(0.999999999, randomValue)) * 100;

  let cumulative = 0;
  for (const grade of VCS_GRADES) {
    cumulative += odds[grade];
    if (roll < cumulative) return grade;
  }

  return 8;
}

export function expectedGradeMultiplier(gradeability: Gradeability): number {
  const odds = GRADE_ODDS[gradeability];
  const multipliers = GRADE_VALUE_MULTIPLIERS[gradeability];

  return VCS_GRADES.reduce((sum, grade) => {
    return sum + (odds[grade] / 100) * multipliers[grade];
  }, 0);
}

export function labelGradeability(gradeability: Gradeability): string {
  if (gradeability === "ICONIC") return "Iconic";
  if (gradeability === "GREAT") return "Great";
  return "Common";
}

export function labelVcsGrade(grade: number): string {
  return grade === RAW_GRADE ? "Raw" : `VCS ${grade}`;
}