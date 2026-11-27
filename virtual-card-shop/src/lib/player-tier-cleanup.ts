import type { PlayerTier } from "@prisma/client";
import type { PlayerTierAlias } from "./player-tier-aliases";

// C001 owner-approved rules. No fuzzy matching, no stored-tier rewrites.
// Effective overrides require a separately reviewed registry change.
export function literalPlayerKey(input: string) {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’'\x60]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}
const team: PlayerTierAlias = {sport:"Baseball",alias:"oakland as",canonicalName:"Oakland Athletics",normalizedName:"oakland athletics",targetId:40062};
const roy: PlayerTierAlias = {sport:"Hockey",alias:"patrick roy",canonicalName:"Patrick Roy",normalizedName:"patrick roy",targetId:2550};
export function protectedLiteral(sport: string, input: string) {
  const n = literalPlayerKey(input);
  return (sport === "Hockey" && n === "patrick roy") || (sport === "Baseball" && n === "oakland as");
}
export function cleanupTarget(sport: string, norm: string) {
  if (sport === team.sport && (norm === team.alias || norm === team.normalizedName)) return team;
  if (sport === roy.sport && norm === roy.normalizedName) return roy;
}
export function cleanupTargetById(id: number) {
  return id === team.targetId ? team : id === roy.targetId ? roy : undefined;
}
export function isTeamAlias(sport: string, norm: string) {
  return sport === team.sport && norm === team.alias;
}
export function isOverrideKey(sport: string, norm: string) {
  return sport === "Baseball" && norm === "johnny bench";
}
export function isOverrideId(id: number) { return id === 4256; }
export type TierProfile = {id:number; sport:string; canonicalName:string; normalizedName:string; tier:PlayerTier | null};
export function effectivePlayerTier(profile: TierProfile): PlayerTier | null {
  if (isOverrideKey(profile.sport, profile.normalizedName) || isOverrideId(profile.id)) {
    return profile.id === 4256 && profile.sport === "Baseball" && profile.normalizedName === "johnny bench" &&
      profile.canonicalName === "Johnny Bench" && profile.tier === "COMMON" ? "STAR_2" : null;
  }
  return profile.tier;
}
const deferred = new Map<string,string>([
  ["Baseball::alex sanchez","Ambiguous"],
  ["Basketball::mike dunleavy","Ambiguous"],
  ["Basketball::rick adelman","Coach"],
  ["Basketball::jerry sloan","Coach"],
  ["Basketball::wes unseld","Coach"],
  ["Basketball::bob weiss","Coach"],
  ["Basketball::chris ford","Coach"],
  ["Basketball::lenny wilkens","Coach"],
  ["Basketball::don nelson","Coach"],
  ["Basketball::matt guokas","Coach"],
  ["Basketball::richie adubato","Coach"],
  ["Basketball::chuck daly","Coach"],
  ["Basketball::don chaney","Coach"],
  ["Basketball::pat riley","Coach"],
  ["Basketball::larry brown","Coach"],
  ["Basketball::k c jones","Coach"],
  ["Basketball::mike schuler","Coach"],
  ["Basketball::del harris","Coach"],
  ["Basketball::cotton fitzsimmons","Coach"],
  ["Basketball::dick motta","Coach"],
  ["Basketball::paul westhead","Coach"],
  ["Basketball::bill fitch","Coach"],
  ["Basketball::jim lynam","Coach"],
  ["Basketball::gene littles","Coach"],
  ["Basketball::kevin loughery","Coach"],
  ["Basketball::allan bristow","Coach"],
  ["Basketball::bob hill","Coach"],
  ["Basketball::ron rothstein","Coach"],
  ["Basketball::dick versace","Coach"],
  ["Basketball::bill musselman","Coach"],
  ["Basketball::stu jackson","Coach"],
  ["Baseball::orioles leaders","Non-player"],
  ["Baseball::indians leaders","Non-player"],
  ["Baseball::padres leaders","Non-player"],
  ["Baseball::blue jays leaders","Non-player"],
  ["Baseball::pirates leaders","Non-player"],
  ["Baseball::cardinals leaders","Non-player"],
  ["Baseball::twins leaders","Non-player"],
  ["Baseball::reds leaders","Non-player"],
  ["Baseball::white sox leaders","Non-player"],
  ["Baseball::yankees leaders","Non-player"],
  ["Baseball::tigers leaders","Non-player"],
  ["Baseball::rangers leaders","Non-player"],
  ["Baseball::brewers leaders","Non-player"],
  ["Baseball::mariners leaders","Non-player"],
  ["Baseball::giants leaders","Non-player"],
  ["Baseball::royals leaders","Non-player"],
  ["Baseball::red sox leaders","Non-player"],
  ["Baseball::mets leaders","Non-player"],
  ["Baseball::expos leaders","Non-player"],
  ["Baseball::dodgers leaders","Non-player"],
  ["Baseball::phillies leaders","Non-player"],
  ["Baseball::astros leaders","Non-player"],
  ["Baseball::angels leaders","Non-player"],
  ["Baseball::cubs leaders","Non-player"],
  ["Baseball::braves leaders","Non-player"],
  ["Baseball::as leaders","Non-player"],
  ["Baseball::alejandro pena kent mercker mark wohlers","Non-player"],
  ["Baseball::david segui luis polonia","Non-player"],
  ["Baseball::checklist 701 800","Non-player"],
]);
export function reviewCategory(sport: string, key: string, labels: string[]) {
  if (sport === "Basketbal") return "Legacy sport";
  const marked = deferred.get(sport+"::"+key);
  if (marked) return marked;
  if (labels.some(x => /checklist|leaders?|champions?|team card|mascot|logo|award|stadium|print code|coach|all.star|rookie of the year/i.test(x))) return "Potential non-player";
  return null;
}
