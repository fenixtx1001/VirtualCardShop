/**
 * Explicit admin-only access to the rarity editor. Fail closed when
 * ADMIN_EMAILS is absent. Do not confuse authenticated collectors with admins.
 */
export function canManagePackRarity(
  email: string | null | undefined,
  adminEmails: string | undefined
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !adminEmails) return false;
  const allowed = adminEmails.split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}
