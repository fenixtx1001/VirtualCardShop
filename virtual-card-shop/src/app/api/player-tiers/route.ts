import { NextResponse } from "next/server";
import { PlayerTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanCanonicalPlayerName, normalizePlayerName, resolvePlayerTierIdentity, resolveCardTierIdentity, resolvedProfileMatches } from "@/lib/player-tiers";
import { cleanupTarget, isTeamAlias, isOverrideKey, effectivePlayerTier, reviewCategory, literalPlayerKey, auditFlags } from "@/lib/player-tier-cleanup";
import { approvedAliasFor, protectedAliasTarget, aliasTargetMatches } from "@/lib/player-tier-aliases";
import { C003_CARDS,C003_REVIEWS,contextualKey,protectedContextKey,reviewedConflict,reviewedDecision } from "@/lib/player-tier-c003";

function parseBool(v: string | null) {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function validTier(v: unknown): v is PlayerTier {
  return (
    v === "COMMON" ||
    v === "SEMI_STAR" ||
    v === "UNLISTED_STAR" ||
    v === "STAR_1" ||
    v === "STAR_2" ||
    v === "STAR_3"
  );
}

function tierRank(tier: PlayerTier | null | undefined) {
  switch (tier) {
    case "COMMON":
      return 1;
    case "SEMI_STAR":
      return 2;
    case "UNLISTED_STAR":
      return 3;
    case "STAR_1":
      return 4;
    case "STAR_2":
      return 5;
    case "STAR_3":
      return 6;
    default:
      return 0;
  }
}

type ProfileRow = {
  id: number;
  sport: string;
  canonicalName: string;
  normalizedName: string;
  tier: PlayerTier | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const sport = (url.searchParams.get("sport") ?? "").trim() || undefined;
    const onlyUnassigned = parseBool(url.searchParams.get("onlyUnassigned"));
    const review = url.searchParams.get("review") ?? "all";

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 100000);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100, 1, 500);

    const where: any = {};
    if (sport && sport !== "Unknown") where.sport = sport;
    if (sport === "Unknown") where.sport = "";

    const rawRows = (await prisma.playerTierProfile.findMany({
      where,
      orderBy: [{ sport: "asc" }, { canonicalName: "asc" }, { id: "asc" }],
    })) as ProfileRow[];

    const allProfiles=new Map(rawRows.map(r=>[r.id,r]));
    if(sport==="Basketbal"){
      const active=await prisma.playerTierProfile.findMany({where:{id:{in:C003_REVIEWS.filter(r=>r.sport==="Basketbal").map(r=>r.active.id)}}});
      for(const row of active)allProfiles.set(row.id,row);
    }
    const profilesByKey=new Map(rawRows.map(r=>[r.sport+"::"+r.normalizedName,r]));
    const unresolvedIdentityCards: Array<{id:number;player:string|null;reason:string}>=[];
    const relevantAssignments=C003_CARDS.filter(c=>!sport||c.sport===sport);
    if(relevantAssignments.length){
      const relevantIds=new Set(relevantAssignments.map(c=>c.id as number));
      const candidates=await prisma.card.findMany({where:{OR:[{id:{in:[...relevantIds]}},{player:{startsWith:"Alex Sanchez",mode:"insensitive"}},{player:{startsWith:"Mike Dunleavy",mode:"insensitive"}}]},select:{id:true,player:true,productSetId:true,cardNumber:true,team:true,productSet:{select:{product:{select:{sport:true,year:true}}}}}});
      const seen=new Set<number>();
      for(const c of candidates){
        const cardSport=c.productSet?.product?.sport||"";
        if(sport&&cardSport!==sport&&!relevantIds.has(c.id))continue;
        const identity=await resolveCardTierIdentity(cardSport,c.player,{...c,year:c.productSet?.product?.year});
        if(!relevantIds.has(c.id)&&!contextualKey(cardSport,identity.normalizedName))continue;
        seen.add(c.id);
        if(identity.blocked||!resolvedProfileMatches(cardSport,identity.normalizedName,profilesByKey.get(cardSport+"::"+identity.normalizedName)))unresolvedIdentityCards.push({id:c.id,player:c.player,reason:identity.blocked?"ambiguous-identity":"missing-contextual-profile"});
      }
      for(const c of relevantAssignments)if(!seen.has(c.id))unresolvedIdentityCards.push({id:c.id,player:c.player,reason:"approved-card-missing"});
    }
    const grouped = new Map<string, {name:string; key:string; target:Awaited<ReturnType<typeof resolvePlayerTierIdentity>>["target"]; members:ProfileRow[]}>();
    for (const row of rawRows) {
      const identity = await resolvePlayerTierIdentity(row.sport, row.canonicalName);
      const key = row.sport+"::"+identity.normalizedName;
      const group = grouped.get(key) ?? {name:identity.canonicalName,key:identity.normalizedName,target:identity.target,members:[]};
      group.members.push(row);
      grouped.set(key,group);
    }
    const allRows = Array.from(grouped.values()).map(group => {
      const canonical = group.members.find(row => row.normalizedName === group.key &&
        (!group.target || aliasTargetMatches(group.target,row)));
      const row = canonical ?? group.members[0];
      const effectiveTier = canonical ? effectivePlayerTier(canonical) : null;
      const assigned = new Set(group.members.map(r=>r.tier).filter(Boolean));
      const category = reviewCategory(row.sport, group.key, group.members.map(r=>r.canonicalName));
      const conflict = assigned.size > 1;
      const status = category ?? (conflict ? "Tier conflict" : effectiveTier ? (group.members.length > 1 ? "Resolved variants" : "Assigned") : canonical ? "Unassigned canonical" : "Missing canonical");
      const flags = auditFlags(row.sport,group.key);
      const decision=reviewedDecision(row.sport,group.key);
      const active=decision?allProfiles.get(decision.active.id):undefined;
      const authoritativeTier=active?effectivePlayerTier(active):null;
      const reviewed=reviewedConflict(row.sport,group.key,group.members,allProfiles,authoritativeTier);
      const reviewStale=!!decision&&!reviewed;
      const locked = !canonical || !!category || isOverrideKey(row.sport,group.key)||protectedContextKey(row.sport,group.key);
      const reviewedStatus=reviewed?"Reviewed historical conflict":reviewStale?"Review reopened":status;
      return {...row, ...flags, effectiveTier, authoritativeTier:decision?authoritativeTier:effectiveTier, reviewed,reviewStale,resolvedName:group.name,resolvedKey:group.key, status:reviewedStatus, conflict, locked, canonicalId:canonical?.id ?? null,
        variants:group.members.map(r=>({id:r.id,name:r.canonicalName,tier:r.tier,notes:r.notes})),
        rawBlankCount:group.members.filter(r=>r.tier===null).length};
    });
    const auditSummary = { rawProfiles:rawRows.length,rawBlank:rawRows.filter(r=>r.tier===null).length,
      resolvedBlank:allRows.filter(r=>r.effectiveTier!==null).reduce((n,r)=>n+r.rawBlankCount,0),
      effectiveUnassigned:allRows.filter(r=>r.effectiveTier===null&&!reviewCategory(r.sport,r.resolvedKey,r.variants.map(v=>v.name))).length,
      conflicts:allRows.filter(r=>r.conflict).length,reviewedConflicts:allRows.filter(r=>r.reviewed).length,unresolvedConflicts:allRows.filter(r=>(r.conflict||r.legacyConflict||r.reviewStale)&&!r.reviewed).length,unresolvedIdentityCards:unresolvedIdentityCards.length,legacyRows:rawRows.filter(r=>r.sport==="Basketbal").length,
      auditSnapshot:{asOf:"2026-11-27",orphanGroups:58,nonPlayerGroups:30,legacyConflicts:12} };
    let rows = allRows;

    if (q) {
      const literalQ = literalPlayerKey(q);
      const keys = new Map<string,string>();
      for (const s of new Set(rows.map(r=>r.sport))) keys.set(s,(await resolvePlayerTierIdentity(s,q)).normalizedName);
      rows = rows.filter(row => row.canonicalName.toLowerCase().includes(q.toLowerCase()) ||
        row.resolvedKey.includes(keys.get(row.sport) || literalQ) || row.variants.some(v=>literalPlayerKey(v.name).includes(literalQ)));
    }

    if (onlyUnassigned) {
      rows = rows.filter((row) => row.effectiveTier == null && !reviewCategory(row.sport,row.resolvedKey,row.variants.map(v=>v.name)));
    }

    if(review==="conflicts") rows=rows.filter(r=>r.conflict||r.legacyConflict||r.reviewStale||r.reviewed);
    else if(review==="unresolved-conflicts") rows=rows.filter(r=>(r.conflict||r.legacyConflict||r.reviewStale)&&!r.reviewed);
    else if(review==="reviewed-conflicts") rows=rows.filter(r=>r.reviewed);
    else if(review==="orphans") rows=rows.filter(r=>r.possibleOrphan);
    else if(review==="variants") rows=rows.filter(r=>r.variants.length>1);
    else if(review==="deferred") rows=rows.filter(r=>r.locked&&!isOverrideKey(r.sport,r.resolvedKey));
    else if(review==="legacy") rows=rows.filter(r=>r.sport==="Basketbal");
    rows.sort((a, b) => {
      const sportA = a.sport || "Unknown";
      const sportB = b.sport || "Unknown";
      const sportCmp = sportA.localeCompare(sportB);
      if (sportCmp !== 0) return sportCmp;

      const tierCmp = tierRank(a.effectiveTier) - tierRank(b.effectiveTier);
      if (tierCmp !== 0) return tierCmp;

      return a.canonicalName.localeCompare(b.canonicalName);
    });

    const sportCountsMap = new Map<string, number>();
    for (const row of allRows) {
      const key = row.sport ?? "";
      sportCountsMap.set(key, (sportCountsMap.get(key) ?? 0) + 1);
    }

    const sports = Array.from(sportCountsMap.entries())
      .map(([sportValue, count]) => ({
        sport: sportValue === "" ? null : sportValue,
        count,
      }))
      .sort((a, b) => {
        const aa = a.sport ?? "Unknown";
        const bb = b.sport ?? "Unknown";
        return aa.localeCompare(bb);
      });

    const total = rows.length;
    const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      ok: true,
      rows: pagedRows.map((row) => ({
        ...row,
        sport: row.sport === "" ? null : row.sport,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      sports,
      auditSummary,
      unresolvedIdentityCards,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load player tiers" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const sport = String(body.sport ?? "").trim();
    const canonicalName = await cleanCanonicalPlayerName(body.canonicalName,sport);
    const normalizedName = await normalizePlayerName(canonicalName,sport);
    const tier = body.tier ?? null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!canonicalName || !normalizedName) {
      return NextResponse.json({ ok: false, error: "canonicalName is required" }, { status: 400 });
    }

    if (tier !== null && !validTier(tier)) {
      return NextResponse.json({ ok: false, error: "Invalid tier" }, { status: 400 });
    }

    if (protectedContextKey(sport,normalizedName)||isOverrideKey(sport,normalizedName) || isTeamAlias(sport,normalizedName) || sport === "Basketbal") {
      return NextResponse.json({ok:false,error:"Reviewed identity or effective override requires an explicit review before editing."},{status:409});
    }
    if (approvedAliasFor(sport, normalizedName)) {
      return NextResponse.json({ ok: false, error: "This name is an approved alias; edit the canonical profile instead." }, { status: 409 });
    }
    const target = protectedAliasTarget(sport, normalizedName) ?? cleanupTarget(sport,normalizedName);
    if (target) {
      const existing = await prisma.playerTierProfile.findUnique({ where: { id: target.targetId } });
      if (!aliasTargetMatches(target, existing) || canonicalName !== target.canonicalName) {
        return NextResponse.json({ ok: false, error: "Protected alias target changed or missing." }, { status: 409 });
      }
      const row = await prisma.playerTierProfile.update({
        where: { id: target.targetId }, data: { tier, notes },
      });
      return NextResponse.json({ ok: true, row });
    }

    const row = await prisma.playerTierProfile.upsert({
      where: {
        sport_normalizedName: {
          sport,
          normalizedName,
        },
      },
      create: {
        sport,
        canonicalName,
        normalizedName,
        tier,
        notes,
      },
      update: {
        canonicalName,
        normalizedName,
        tier,
        notes,
      },
    });

    return NextResponse.json({
      ok: true,
      row: {
        ...row,
        sport: row.sport === "" ? null : row.sport,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save player tier" },
      { status: 500 }
    );
  }
}