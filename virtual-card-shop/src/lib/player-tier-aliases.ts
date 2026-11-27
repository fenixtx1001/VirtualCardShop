// Owner-approved aliases (A001). Sport scoped and pinned to the existing canonical profile.
// Version-controlled to avoid a schema migration or per-card database queries.
// Do not infer aliases from similarity. Add only reviewed mappings.
export type PlayerTierAlias = {
  sport: string;
  alias: string;
  canonicalName: string;
  normalizedName: string;
  targetId: number;
};
export const PLAYER_TIER_ALIASES: readonly PlayerTierAlias[] = Object.freeze([
  { sport: "Football", alias: "donald reche caldwell", canonicalName: "Reche Caldwell", normalizedName: "reche caldwell", targetId: 291804 },
  { sport: "Football", alias: "rocket ismail", canonicalName: "Raghib Ismail", normalizedName: "raghib ismail", targetId: 3158 },
  { sport: "Baseball", alias: "gabriel white", canonicalName: "Gabe White", normalizedName: "gabe white", targetId: 4063 },
  { sport: "Baseball", alias: "kaz ishii", canonicalName: "Kazuhisa Ishii", normalizedName: "kazuhisa ishii", targetId: 298567 },
  { sport: "Baseball", alias: "orestes minoso", canonicalName: "Minnie Minoso", normalizedName: "minnie minoso", targetId: 157059 },
  { sport: "Baseball", alias: "catfish hunter", canonicalName: "Jim Hunter", normalizedName: "jim hunter", targetId: 66490 },
  { sport: "Baseball", alias: "david nilsson", canonicalName: "Dave Nilsson", normalizedName: "dave nilsson", targetId: 1449 },
  { sport: "Football", alias: "william roaf", canonicalName: "Willie Roaf", normalizedName: "willie roaf", targetId: 4594 },
  { sport: "Baseball", alias: "alexis rios", canonicalName: "Alex Rios", normalizedName: "alex rios", targetId: 310663 },
  { sport: "Baseball", alias: "ed mathews", canonicalName: "Eddie Mathews", normalizedName: "eddie mathews", targetId: 91689 },
  { sport: "Baseball", alias: "james fregosi", canonicalName: "Jim Fregosi", normalizedName: "jim fregosi", targetId: 148517 },
  { sport: "Baseball", alias: "joseph torre", canonicalName: "Joe Torre", normalizedName: "joe torre", targetId: 157250 },
  { sport: "Baseball", alias: "luman harris", canonicalName: "Lum Harris", normalizedName: "lum harris", targetId: 235902 },
  { sport: "Baseball", alias: "mateo alou", canonicalName: "Matty Alou", normalizedName: "matty alou", targetId: 201682 },
  { sport: "Baseball", alias: "pat strange", canonicalName: "Patrick Strange", normalizedName: "patrick strange", targetId: 282372 },
  { sport: "Baseball", alias: "robert keppel", canonicalName: "Bob Keppel", normalizedName: "bob keppel", targetId: 282299 },
  { sport: "Baseball", alias: "rodney carew", canonicalName: "Rod Carew", normalizedName: "rod carew", targetId: 4253 },
  { sport: "Baseball", alias: "ronald santo", canonicalName: "Ron Santo", normalizedName: "ron santo", targetId: 186136 },
  { sport: "Baseball", alias: "steve lerud", canonicalName: "Steven Lerud", normalizedName: "steven lerud", targetId: 310981 },
  { sport: "Football", alias: "snoop minnis", canonicalName: "Marvin Minnis", normalizedName: "marvin minnis", targetId: 102734 },
  // C002 owner-approved exact aliases.
  { sport: "Baseball", alias: "rod carew i", canonicalName: "Rod Carew", normalizedName: "rod carew", targetId: 4253 },
  { sport: "Baseball", alias: "rod carew ii", canonicalName: "Rod Carew", normalizedName: "rod carew", targetId: 4253 },
  { sport: "Baseball", alias: "rod carew iii", canonicalName: "Rod Carew", normalizedName: "rod carew", targetId: 4253 },
  { sport: "Baseball", alias: "rod carew iv", canonicalName: "Rod Carew", normalizedName: "rod carew", targetId: 4253 },
  { sport: "Baseball", alias: "rod carew v", canonicalName: "Rod Carew", normalizedName: "rod carew", targetId: 4253 },
  { sport: "Basketball", alias: "jim rodgers", canonicalName: "Jimmy Rodgers", normalizedName: "jimmy rodgers", targetId: 143974 },
]);
const key = (sport: string, name: string) => sport.trim() + "::" + name;

export function createAliasRegistry(entries: readonly PlayerTierAlias[]) {
  const aliases = new Map<string, PlayerTierAlias>();
  const targets = new Map<string, PlayerTierAlias>();
  const ids = new Map<number, PlayerTierAlias>();
  for (const entry of entries) {
    const a = key(entry.sport, entry.alias);
    const t = key(entry.sport, entry.normalizedName);
    if (!entry.sport || !entry.alias || !entry.normalizedName || !entry.canonicalName ||
        !Number.isInteger(entry.targetId) || entry.targetId <= 0 || a === t || aliases.has(a)) {
      throw new Error("Invalid or duplicate player tier alias: " + a);
    }
    const prior = targets.get(t);
    const priorId = ids.get(entry.targetId);
    if ((prior && prior.targetId !== entry.targetId) ||
        (priorId && key(priorId.sport, priorId.normalizedName) !== t)) {
      throw new Error("Conflicting player tier alias target: " + t);
    }
    aliases.set(a, entry);
    targets.set(t, entry);
    ids.set(entry.targetId, entry);
  }
  for (const t of targets.keys()) {
    if (aliases.has(t)) throw new Error("Player tier alias chains are not allowed: " + t);
  }
  return { aliases, targets, ids };
}
const registry = createAliasRegistry(PLAYER_TIER_ALIASES);
export function approvedAliasFor(sport: string, normalizedName: string) {
  return registry.aliases.get(key(sport, normalizedName));
}
export function protectedAliasTarget(sport: string, normalizedName: string) {
  return registry.targets.get(key(sport, normalizedName));
}
export function protectedAliasTargetById(id: number) {
  return registry.ids.get(id);
}
export function aliasTargetMatches(
  target: PlayerTierAlias,
  profile: { id: number; sport: string; normalizedName: string; canonicalName: string } | null | undefined
) {
  return !!profile && profile.id === target.targetId && profile.sport === target.sport &&
    profile.normalizedName === target.normalizedName && profile.canonicalName === target.canonicalName;
}
