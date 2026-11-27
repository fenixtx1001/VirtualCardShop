import test from "node:test";
import assert from "node:assert/strict";
import { PLAYER_TIER_ALIASES, createAliasRegistry, approvedAliasFor, protectedAliasTargetById, aliasTargetMatches } from "../src/lib/player-tier-aliases";

const profiles = PLAYER_TIER_ALIASES.map(a => ({
  id: a.targetId, sport: a.sport, canonicalName: a.canonicalName, normalizedName: a.normalizedName,
  tier: "SEMI_STAR", notes: null, createdAt: new Date(0), updatedAt: new Date(1),
}));
const target = profiles.find(p => p.canonicalName === "Jim Hunter")!;
const cards = [{ id: 1, player: "Catfish Hunter", productSet: { product: { sport: "Baseball" } } },
  { id: 2, player: "Jim Hunter", productSet: { product: { sport: "Baseball" } } },
  { id: 3, player: "Catfish Hunter SM", productSet: { product: { sport: "Baseball" } } }];
const writes: string[] = [];
const fake = {
  playerTierIgnoreToken: { findMany: async () => ["sm","roy","dp","tc","cl","rr","fp","fut","co","hc","sv"].map(normalizedToken=>({normalizedToken})) },
  playerTierProfile: {
    findUnique: async ({ where }: any) => profiles.find(p => where.id === p.id || (where.sport_normalizedName?.sport === p.sport && where.sport_normalizedName?.normalizedName === p.normalizedName)) ?? null,
    findMany: async ({ where }: any = {}) => profiles.filter(p => !where?.sport || (where.sport === p.sport && (!where.normalizedName?.in || where.normalizedName.in.includes(p.normalizedName)))),
    upsert: async () => { writes.push("upsert"); throw new Error("Unexpected upsert"); },
    update: async ({ where }: any) => { writes.push("update:" + where.id); return profiles.find(p => p.id === where.id); },
    create: async () => { writes.push("create"); throw new Error("Unexpected create"); },
    delete: async () => { writes.push("delete"); throw new Error("Unexpected delete"); },
    deleteMany: async () => { writes.push("deleteMany"); throw new Error("Unexpected deleteMany"); },
    count: async () => 0,
  },
  productSet: { findUnique: async () => ({ id: "test", product: { sport: "Baseball" }, commonPrice: 1, semiStarPrice: 2, unlistedStarPrice: 3, star1Price: 4, star2Price: 5, star3Price: 6 }) },
  card: { findMany: async () => cards },
  $transaction: async (cb: any) => cb(fake),
};
(globalThis as any).prisma = fake;

test("A001 registry exact sport scope, 20 mappings, collision and chain protection", () => {
  assert.equal(PLAYER_TIER_ALIASES.length, 20);
  const a = PLAYER_TIER_ALIASES[0];
  assert.throws(() => createAliasRegistry([a, a]));
  assert.throws(() => createAliasRegistry([{ ...a, alias: a.normalizedName }]));
  assert.throws(() => createAliasRegistry([a, { ...a, alias: a.normalizedName, normalizedName: a.alias, targetId: 999 }]));
  assert.throws(() => createAliasRegistry([a, { ...a, alias: "other name", targetId: 999 }]));
  assert.equal(approvedAliasFor("Football", "catfish hunter"), undefined);
  assert.equal(approvedAliasFor("Football", "mike williams"), undefined);
  assert.equal(protectedAliasTargetById(target.id)?.canonicalName, "Jim Hunter");
  assert.equal(aliasTargetMatches(protectedAliasTargetById(target.id)!, { ...target, id: 999 }), false);
});

test("shared identity resolves all approved names and retains trailing artifacts and suffix rules", async () => {
  const { resolvePlayerTierIdentity, normalizePlayerName } = await import("../src/lib/player-tiers");
  for (const a of PLAYER_TIER_ALIASES) {
    const identity = await resolvePlayerTierIdentity(a.sport, a.alias.toUpperCase() + " SM");
    assert.equal(identity.target?.targetId, a.targetId);
    assert.equal(identity.normalizedName, a.normalizedName);
    assert.equal(identity.canonicalName, a.canonicalName);
  }
  assert.equal((await resolvePlayerTierIdentity("Football", "Catfish Hunter")).normalizedName, "catfish hunter");
  assert.equal(await normalizePlayerName("Eddie George SM"), "eddie george");
  assert.equal(await normalizePlayerName("Ken Griffey Jr."), "ken griffey jr");
});

test("ensure/single pricing inherit current canonical tier, never upsert an alias, reject stale target", async () => {
  const { ensurePlayerTierProfile, getDefaultPriceForPlayer } = await import("../src/lib/player-tiers");
  writes.length = 0;
  const profile = await ensurePlayerTierProfile({ prisma: fake as any, sport: "Baseball", player: "Catfish Hunter SM" });
  assert.equal(profile?.id, target.id);
  assert.equal(writes.length, 0);
  const price = () => getDefaultPriceForPlayer({ prisma: fake as any, productSetId: "test", player: "Catfish Hunter" });
  assert.equal((await price()).defaultPrice, 2);
  target.tier = "STAR_2";
  try {
    assert.equal((await price()).defaultPrice, 5);
    assert.equal((await price()).canonicalName, "Jim Hunter");
    target.canonicalName = "Wrong Name";
    assert.equal((await price()).reason, "no-tier-profile");
    await assert.rejects(ensurePlayerTierProfile({ prisma: fake as any, sport: "Baseball", player: "Catfish Hunter" }));
  } finally { target.tier = "SEMI_STAR"; target.canonicalName = "Jim Hunter"; }
});

test("bulk default-price route resolves alias, canonical and trailing forms without writes", async () => {
  const { GET } = await import("../src/app/api/product-sets/[productSetId]/default-prices/route");
  writes.length = 0;
  const response = await GET(new Request("https://test"), { params: { productSetId: "test" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.uniquePlayersChecked, 1);
  for (const id of [1,2,3]) {
    assert.equal(body.results[id].canonicalName, "Jim Hunter");
    assert.equal(body.results[id].defaultPrice, 2);
  }
  assert.equal(writes.length, 0);
});

test("C001 blocks global rebuild without creating, merging or deleting profiles", async () => {
  const { POST } = await import("../src/app/api/player-tiers/rebuild/route");
  writes.length = 0;
  assert.equal((await POST()).status, 409);
  assert.equal(writes.length, 0);
});

test("admin create, rename and delete collision guards; canonical tier edits allowed", async () => {
  const { POST, GET } = await import("../src/app/api/player-tiers/route");
  const { PUT, DELETE } = await import("../src/app/api/player-tiers/[id]/route");
  const req = (canonicalName: string) => new Request("https://test", { method: "POST", body: JSON.stringify({ sport: "Baseball", canonicalName, tier: "STAR_1" }) });
  writes.length = 0;
  assert.equal((await POST(req("Catfish Hunter"))).status, 409);
  assert.equal((await PUT(req("Catfish Hunter"), { params: { id: String(target.id) } })).status, 409);
  assert.equal((await PUT(req("Different Name"), { params: { id: String(target.id) } })).status, 409);
  assert.equal((await DELETE(new Request("https://test"), { params: { id: String(target.id) } })).status, 409);
  assert.equal(writes.length, 0);
  assert.equal((await POST(req("Jim Hunter"))).status, 200);
  assert.deepEqual(writes, ["update:" + target.id]);
  const result = await GET(new Request("https://test?q=Catfish%20Hunter&sport=Baseball"));
  const body = await result.json();
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0].id, target.id);
});

test("C001 genuine names, sport scope and trailing codes", async () => {
  const {resolvePlayerTierIdentity,normalizePlayerName}=await import("../src/lib/player-tiers");
  for(const n of ["Patrick Roy","PATRICK ROY AS","Patrick Roy DP","Patrick Roy RC SN100"]) {
    const x=await resolvePlayerTierIdentity("Hockey",n);
    assert.equal(x.normalizedName,"patrick roy"); assert.equal(x.target?.targetId,2550);
  }
  for(const n of ["Oakland A's","OAKLAND A’S CL, TC","Oakland A's TC CL"]) {
    const x=await resolvePlayerTierIdentity("Baseball",n);
    assert.equal(x.normalizedName,"oakland athletics"); assert.equal(x.target?.targetId,40062);
  }
  assert.equal((await resolvePlayerTierIdentity("Football","Patrick Roy")).normalizedName,"patrick");
  assert.equal((await resolvePlayerTierIdentity("Hockey","Bobby Smith ROY")).normalizedName,"bobby smith");
  assert.equal(await normalizePlayerName("Ken Griffey Jr."),"ken griffey jr");
});
test("C001 override stays separate from stored tier; stale identity fails closed", async () => {
  const {effectivePlayerTier,reviewCategory}=await import("../src/lib/player-tier-cleanup");
  const p={id:4256,sport:"Baseball",canonicalName:"Johnny Bench",normalizedName:"johnny bench",tier:"COMMON" as const};
  assert.equal(effectivePlayerTier(p),"STAR_2"); assert.equal(p.tier,"COMMON");
  assert.equal(effectivePlayerTier({...p,id:99}),null);
  assert.equal(effectivePlayerTier({...p,tier:"SEMI_STAR"}),null);
  assert.equal(reviewCategory("Baseball","alex sanchez",[]),"Ambiguous");
  assert.equal(reviewCategory("Basketball","rick adelman",[]),"Coach");
  assert.equal(reviewCategory("Baseball","orioles leaders",[]),"Non-player");
  assert.equal(reviewCategory("Basketbal","scottie pippen",[]),"Legacy sport");
});
test("C001 single and bulk price lookups inherit Bench override without modifying stored tier", async () => {
  const {getDefaultPriceForPlayer}=await import("../src/lib/player-tiers");
  const {GET}=await import("../src/app/api/product-sets/[productSetId]/default-prices/route");
  const bench={id:4256,sport:"Baseball",canonicalName:"Johnny Bench",normalizedName:"johnny bench",tier:"COMMON",notes:null,createdAt:new Date(0),updatedAt:new Date(1)};
  profiles.push(bench);
  cards.push({id:4,player:"Johnny Bench SV",productSet:{product:{sport:"Baseball"}}});
  writes.length=0;
  try {
    const single=await getDefaultPriceForPlayer({prisma:fake as any,productSetId:"test",player:"Johnny Bench SV"});
    assert.equal(single.tier,"STAR_2"); assert.equal(single.defaultPrice,5);
    const response=await GET(new Request("https://test"),{params:{productSetId:"test"}});
    assert.equal((await response.json()).results[4].tier,"STAR_2");
    assert.equal(bench.tier,"COMMON"); assert.equal(writes.length,0);
  } finally {profiles.pop();cards.pop();}
});
test("C001 admin shows stored and effective tiers and blocks override writes",async()=>{
  const {GET,POST}=await import("../src/app/api/player-tiers/route");
  const {PUT,DELETE}=await import("../src/app/api/player-tiers/[id]/route");
  profiles.push({id:4256,sport:"Baseball",canonicalName:"Johnny Bench",normalizedName:"johnny bench",tier:"COMMON",notes:null,createdAt:new Date(0),updatedAt:new Date(1)});
  writes.length=0;
  try {
    const b=await (await GET(new Request("https://test?q=Johnny%20Bench"))).json();
    assert.equal(b.rows[0].tier,"COMMON");assert.equal(b.rows[0].effectiveTier,"STAR_2");assert.equal(b.rows[0].locked,true);
    const req=()=>new Request("https://test",{method:"POST",body:JSON.stringify({sport:"Baseball",canonicalName:"Johnny Bench",tier:"STAR_2"})});
    assert.equal((await POST(req())).status,409);
    assert.equal((await PUT(req(),{params:{id:"4256"}})).status,409);
    assert.equal((await DELETE(new Request("https://test"),{params:{id:"4256"}})).status,409);
    assert.equal(writes.length,0);
  } finally {profiles.pop();}
});
