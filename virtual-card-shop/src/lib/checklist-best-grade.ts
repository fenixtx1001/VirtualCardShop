/**
 * Highest *currently owned and revealed* VCS grade for each checklist card.
 *
 * Grading orders in PENDING/READY states do not create an owned graded bucket
 * until the bubble mailer is opened. Only positive ownership in grade 6-10
 * counts, matching the Graded Registry's highest-owned-copy rule.
 *
 * The selected collector is supplied explicitly so checklist compare mode
 * never accidentally displays the signed-in user's grade as the other
 * collector's grade.
 */
export type ChecklistGradeOwnership = {
  userId: string;
  cardId: number;
  grade: number;
  quantity: number;
};

export function highestRevealedGradeByCard(
  ownerships: readonly ChecklistGradeOwnership[],
  selectedUserId: string,
): Map<number, number> {
  const best = new Map<number, number>();

  for (const row of ownerships) {
    if (
      row.userId !== selectedUserId ||
      !Number.isInteger(row.grade) ||
      row.grade < 6 ||
      row.grade > 10 ||
      !Number.isInteger(row.quantity) ||
      row.quantity <= 0
    ) {
      continue;
    }

    const previous = best.get(row.cardId) ?? 0;
    if (row.grade > previous) best.set(row.cardId, row.grade);
  }

  return best;
}
