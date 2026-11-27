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
const bench: PlayerTierAlias = {sport:"Baseball",alias:"johnny bench",canonicalName:"Johnny Bench",normalizedName:"johnny bench",targetId:4256};
export function cleanupTarget(sport: string, norm: string) {
  if (sport === bench.sport && norm === bench.normalizedName) return bench;
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
  return (sport === "Baseball" && norm === "johnny bench") || (sport === "Basketball" && norm === "scottie pippen");
}
export function isOverrideId(id: number) { return id === 4256 || id === 5007; }
export type TierProfile = {id:number; sport:string; canonicalName:string; normalizedName:string; tier:PlayerTier | null};
export function effectivePlayerTier(profile: TierProfile): PlayerTier | null {
  if (profile.id===5007 || (profile.sport==="Basketball" && profile.normalizedName==="scottie pippen")) {
    return profile.id===5007 && profile.sport==="Basketball" && profile.canonicalName==="Scottie Pippen" && profile.normalizedName==="scottie pippen" && profile.tier==="UNLISTED_STAR" ? "STAR_1" : null;
  }
  if (isOverrideKey(profile.sport, profile.normalizedName) || isOverrideId(profile.id)) {
    return profile.id === 4256 && profile.sport === "Baseball" && profile.normalizedName === "johnny bench" &&
      profile.canonicalName === "Johnny Bench" && profile.tier === "COMMON" ? "STAR_2" : null;
  }
  return profile.tier;
}
const deferred = new Map<string,string>([
  // C002 owner-approved classifications.
  ["Football::tom landry","Coach"],
  ["Baseball::jimmie reese","Coach"],
  ["Basketball::rex hughes","Coach"],
  ["Basketball::jimmy rodgers","Coach"],
  ["Basketball::frank hamblen","Coach"],
  ["Baseball::1983 leading firemen al holland dan quisenberry","Multi-player"],
  ["Baseball::alcs athletics vs blue jays","Game card"],
  ["Baseball::nlcs pirates vs braves","Game card"],
  ["Baseball::alex sanchez","Contextual history"],
  ["Basketball::mike dunleavy","Contextual history"],
  ["Basketball::mike dunleavy sr","Coach"],
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
  if (/\b(checklist|leaders?|champions?|team card|mascot|logo|award|stadium|print code|coach|all.star|rookie of the year)\b/i.test(key)) return "Potential non-player";
  return null;
}

// C001 audit flags are dated observations, not automatic deletion criteria.
const orphanSnapshot = new Set(["Basketbal::alonzo mourning","Basketbal::anthony mason","Basketbal::b j armstrong","Basketbal::charles barkley","Basketbal::chris mills","Basketbal::chris morris","Basketbal::chris mullin","Basketbal::chris webber","Basketbal::christian laettner","Basketbal::clifford robinson","Basketbal::david wingate","Basketbal::derek harper","Basketbal::derrick coleman","Basketbal::dikembe mutombo","Basketbal::dominique wilkins","Basketbal::donyell marshall","Basketbal::elden campbell","Basketbal::eric montross","Basketbal::eric murdock","Basketbal::glen rice","Basketbal::glenn robinson","Basketbal::grant hill","Basketbal::hersey hawkins","Basketbal::horace grant","Basketbal::jalen rose","Basketbal::jamal mashburn","Basketbal::jay humphries","Basketbal::jim jackson","Basketbal::john salley","Basketbal::juwan howard","Basketbal::ken norman","Basketbal::kenny anderson","Basketbal::kenny smith","Basketbal::kevin willis","Basketbal::latrell sprewell","Basketbal::mahmoud abdul rauf","Basketbal::mario elie","Basketbal::mark jackson","Basketbal::mark price","Basketbal::muggsy bogues","Basketbal::nick anderson","Basketbal::olden polynice","Basketbal::otis thorpe","Basketbal::patrick ewing","Basketbal::reggie miller","Basketbal::reggie williams","Basketbal::robert horry","Basketbal::rod strickland","Basketbal::rony seikaly","Basketbal::sam cassell","Basketbal::shaquille oneal","Basketbal::sherman douglas","Basketbal::stacey augmon","Basketbal::terry cummings","Basketbal::terry mills","Basketbal::tim hardaway","Basketbal::tom gugliotta","Basketbal::wesley person"]);
const legacyConflictSnapshot = new Map<string,{id:number;tier:string}>([
  ["Basketbal::james worthy",{id:1365,tier:"UNLISTED_STAR"}],
  ["Basketbal::derrick coleman",{id:7632,tier:"COMMON"}],
  ["Basketbal::ervin johnson",{id:46604,tier:"COMMON"}],
  ["Basketbal::scottie pippen",{id:5007,tier:"UNLISTED_STAR"}],
  ["Basketbal::rod strickland",{id:1408,tier:"COMMON"}],
  ["Basketbal::dominique wilkins",{id:1297,tier:"STAR_1"}],
  ["Basketbal::charles oakley",{id:1395,tier:"COMMON"}],
  ["Basketbal::robert parish",{id:1304,tier:"UNLISTED_STAR"}],
  ["Basketbal::jalen rose",{id:5088,tier:"COMMON"}],
  ["Basketbal::rick mahorn",{id:1270,tier:"SEMI_STAR"}],
  ["Basketbal::alton lister",{id:5074,tier:"SEMI_STAR"}],
  ["Basketbal::john starks",{id:5673,tier:"COMMON"}],
]);
export function auditFlags(sport:string,key:string) { return {possibleOrphan:orphanSnapshot.has(sport+"::"+key),legacyConflict:legacyConflictSnapshot.get(sport+"::"+key)??null}; }
