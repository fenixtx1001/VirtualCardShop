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
  playerTierIgnoreToken: { findMany: async () => ["sm","roy","dp","tc","cl","rr","fp","fut","co","hc","sv","trib","uer","ll","alcs","nlcs","rr","fbc","mvpr","skm"].map(normalizedToken=>({normalizedToken})) },
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

test("A001 and C002 registry exact sport scope, 26 mappings, collision and chain protection", () => {
  assert.equal(PLAYER_TIER_ALIASES.length, 26);
  assert.equal(PLAYER_TIER_ALIASES.slice(0,20).length,20);
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
  assert.equal(reviewCategory("Baseball","alex sanchez",[]),"Contextual history");
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

test("C001 protected profiles resolve in single and bulk price paths, and canonical conflict wins",async()=>{
  const {getDefaultPriceForPlayer,ensurePlayerTierProfile}=await import("../src/lib/player-tiers");
  const {GET}=await import("../src/app/api/product-sets/[productSetId]/default-prices/route");
  const {GET:adminGet}=await import("../src/app/api/player-tiers/route");
  const p=(id:number,sport:string,canonicalName:string,normalizedName:string,tier:string)=>({id,sport,canonicalName,normalizedName,tier,notes:null,createdAt:new Date(0),updatedAt:new Date(1)});
  const roy=p(2550,"Hockey","Patrick Roy","patrick roy","STAR_2"),oak=p(40062,"Baseball","Oakland Athletics","oakland athletics","COMMON");
  const murphy=p(702,"Baseball","Dale Murphy","dale murphy","UNLISTED_STAR"),variant=p(37048,"Baseball","Dale Murphy SV","dale murphy sv","STAR_3");
  profiles.push(roy,oak,murphy,variant);
  cards.push({id:5,player:"Oakland A's CL, TC",productSet:{product:{sport:"Baseball"}}});
  writes.length=0;
  try {
    assert.equal((await ensurePlayerTierProfile({prisma:fake as any,sport:"Hockey",player:"Patrick Roy RC"}))?.id,2550);
    const x=await getDefaultPriceForPlayer({prisma:fake as any,productSetId:"test",player:"Oakland A's CL, TC"});
    assert.equal(x.canonicalName,"Oakland Athletics");assert.equal(x.tier,"COMMON");
    const b=await (await GET(new Request("https://test"),{params:{productSetId:"test"}})).json();
    assert.equal(b.results[5].canonicalName,"Oakland Athletics");
    const a=await (await adminGet(new Request("https://test?q=Dale%20Murphy&review=conflicts"))).json();
    assert.equal(a.rows[0].id,702);assert.equal(a.rows[0].effectiveTier,"UNLISTED_STAR");
    assert.equal(a.rows[0].variants.length,2);assert.equal(writes.length,0);
  } finally {profiles.splice(-4);cards.pop();}
});


test("C002 six exact aliases and eight classifications, preserved genuine suffixes and sport scope", async () => {
  const {resolvePlayerTierIdentity,normalizePlayerName}=await import("../src/lib/player-tiers");
  const {reviewCategory}=await import("../src/lib/player-tier-cleanup");
  for(const suffix of ["I","II","III","IV","V"]){
    const x=await resolvePlayerTierIdentity("Baseball","Rod Carew - "+suffix+" TRIB");
    assert.equal(x.target?.targetId,4253); assert.equal(x.normalizedName,"rod carew");
  }
  assert.equal((await resolvePlayerTierIdentity("Basketball","Jim Rodgers CO")).target?.targetId,143974);
  assert.equal((await resolvePlayerTierIdentity("Football","Rod Carew - III TRIB")).target,undefined);
  assert.equal((await resolvePlayerTierIdentity("Baseball","Jim Rodgers CO")).target,undefined);
  assert.equal(await normalizePlayerName("Ken Griffey Jr."),"ken griffey jr");
  assert.equal(await normalizePlayerName("John Smith III"),"john smith iii");
  assert.equal((await resolvePlayerTierIdentity("Baseball","Austin Manahan UER")).normalizedName,"austin manahan");
  for(const [sport,name,category] of [
    ["Football","Tom Landry HC","Coach"],["Baseball","Jimmie Reese CO","Coach"],
    ["Basketball","Rex Hughes CO","Coach"],["Basketball","Jim Rodgers CO","Coach"],
    ["Basketball","Jimmy Rodgers","Coach"],["Basketball","Jimmy Rodgers CO","Coach"],
    ["Basketball","Frank Hamblen CO","Coach"],
    ["Baseball","1983 Leading Firemen (Al Holland / Dan Quisenberry) LL","Multi-player"],
    ["Baseball","ALCS: Athletics vs Blue Jays ALCS","Game card"],
    ["Baseball","NLCS: Pirates vs Braves NLCS","Game card"]
  ]) {
    const x=await resolvePlayerTierIdentity(sport,name);
    assert.equal(reviewCategory(sport,x.normalizedName,[name]),category);
    if(category==="Game card"||category==="Multi-player") assert.equal(x.target,undefined);
  }
});
test("C002 canonical single pricing inherits without writes",async()=>{
  const {getDefaultPriceForPlayer,ensurePlayerTierProfile}=await import("../src/lib/player-tiers");
  const carews=profiles.filter(p=>p.id===4253), old=carews.map(p=>p.tier);
  const manahan={id:999999,sport:"Baseball",canonicalName:"Austin Manahan",normalizedName:"austin manahan",tier:"COMMON",notes:null,createdAt:new Date(0),updatedAt:new Date(1)};
  carews.forEach(p=>p.tier="UNLISTED_STAR"); profiles.push(manahan);
  writes.length=0;
  try {
    for(const suffix of ["I","II","III","IV","V"]){
      const player="Rod Carew - "+suffix+" TRIB";
      assert.equal((await ensurePlayerTierProfile({prisma:fake as any,sport:"Baseball",player}))?.id,4253);
      const result=await getDefaultPriceForPlayer({prisma:fake as any,productSetId:"test",player});
      assert.equal(result.tier,"UNLISTED_STAR");assert.equal(result.defaultPrice,3);
    }
    const result=await getDefaultPriceForPlayer({prisma:fake as any,productSetId:"test",player:"Austin Manahan UER"});
    assert.equal(result.tier,"COMMON");assert.equal(result.defaultPrice,1);
    assert.equal(writes.length,0);
  } finally {profiles.pop();carews.forEach((p,i)=>p.tier=old[i]);}
});


test("C003 all 40 approved card contexts resolve and changed or missing context fails closed",async()=>{
  const {C003_CARDS,C003_TARGETS,contextProfileMatches}=await import("../src/lib/player-tier-c003");
  const {resolveCardTierIdentity,ensurePlayerTierProfile,getDefaultPriceForPlayer}=await import("../src/lib/player-tiers");
  const fixtures=C003_TARGETS.map((t,i)=>({...t,id:"id" in t?t.id:999990+i,notes:null,createdAt:new Date(0),updatedAt:new Date(1)}));
  profiles.push(...fixtures); writes.length=0;
  const originalSet=fake.productSet.findUnique;
  try{
    assert.equal(C003_CARDS.length,40);
    for(const c of C003_CARDS){
      const target=C003_TARGETS[c.target];
      const r=await resolveCardTierIdentity(c.sport,c.player,c);
      assert.equal(r.blocked,false);assert.equal(r.normalizedName,target.normalizedName);
      assert.equal((await ensurePlayerTierProfile({prisma:fake as any,sport:c.sport,player:c.player,card:c}))?.id,fixtures[c.target].id);
      (fake.productSet as any).findUnique=async()=>({...await originalSet(),id:c.productSetId,product:{sport:c.sport,year:c.year}});
      const price=await getDefaultPriceForPlayer({prisma:fake as any,productSetId:c.productSetId,player:c.player,card:c});
      assert.equal(price.tier,"COMMON");assert.equal(price.defaultPrice,1);
      for(const bad of [{...c,team:"Wrong team"},{...c,year:1800},{...c,cardNumber:"bogus"},{...c,productSetId:"wrong"},{...c,player:"Unrelated player"}])assert.equal((await resolveCardTierIdentity(c.sport,bad.player,bad)).blocked,true);
    }
    for(const c of C003_CARDS.filter(c=>c.target!==3)){
      assert.equal((await resolveCardTierIdentity(c.sport,c.player)).blocked,true);
      assert.equal((await resolveCardTierIdentity(c.sport,c.player,{...c,id:99999999})).blocked,true);
      assert.equal(await ensurePlayerTierProfile({prisma:fake as any,sport:c.sport,player:c.player}),null);
    }
    const c=C003_CARDS[0];
    assert.equal(contextProfileMatches(C003_TARGETS[c.target],null),false);
    const old=fixtures[c.target].canonicalName;
    (fixtures[c.target] as any).canonicalName="Wrong";
    assert.equal(await ensurePlayerTierProfile({prisma:fake as any,sport:c.sport,player:c.player,card:c}),null);
    (fixtures[c.target] as any).canonicalName=old;
    assert.equal(writes.length,0);
  }finally{profiles.splice(-fixtures.length);fake.productSet.findUnique=originalSet;}
});
test("C003 all 21 historical decisions validate preimages and reopen for changes",async()=>{
  const {C003_REVIEWS,reviewedConflict}=await import("../src/lib/player-tier-c003");
  const {effectivePlayerTier}=await import("../src/lib/player-tier-cleanup");
  assert.equal(C003_REVIEWS.length,21);
  for(const r of C003_REVIEWS){
    const all=new Map([...r.members,r.active].map(m=>[m.id,m]));
    const tier=effectivePlayerTier(r.active);
    assert.equal(reviewedConflict(r.sport,r.key,r.members,all,tier),true,r.key);
    const altered=new Map(all);altered.set(r.active.id,{...r.active,canonicalName:"Changed"});
    assert.equal(reviewedConflict(r.sport,r.key,r.members,altered,tier),false);
    assert.equal(reviewedConflict(r.sport,r.key,[...r.members,{...r.members[0],id:9999999}],all,tier),false);
  }
});
test("C003 Pippen override exact canonical preimage, other identities unchanged",async()=>{
  const {effectivePlayerTier,isOverrideId}=await import("../src/lib/player-tier-cleanup");
  const {resolvePlayerTierIdentity}=await import("../src/lib/player-tiers");
  const p={id:5007,sport:"Basketball",canonicalName:"Scottie Pippen",normalizedName:"scottie pippen",tier:"UNLISTED_STAR" as const};
  assert.equal(effectivePlayerTier(p),"STAR_1");assert.equal(p.tier,"UNLISTED_STAR");assert.equal(isOverrideId(5007),true);
  assert.equal(effectivePlayerTier({...p,id:999}),null);
  assert.equal(effectivePlayerTier({...p,tier:"COMMON"}),null);
  assert.equal(effectivePlayerTier({...p,id:95441,sport:"Basketbal",tier:"STAR_1"}),"STAR_1");
  assert.equal(effectivePlayerTier({...p,id:230225,canonicalName:"Scottie Pippen SMALL",normalizedName:"scottie pippen small"}),"UNLISTED_STAR");
  assert.equal((await resolvePlayerTierIdentity("Basketball","Scottie Pippen SMALL")).normalizedName,"scottie pippen small");
  assert.equal((await resolvePlayerTierIdentity("Basketball","Scottie Pippen / Mark Price / Jamal Mashburn")).normalizedName,"scottie pippen mark price jamal mashburn");
});


test("one-click pricing uses saved snapshot, scopes to resolved cards and groups changed values",async()=>{
 const {validPriceSnapshot,matchesPriceSnapshot,planTierPriceApplication}=await import("../src/lib/apply-tier-prices");
 const prices={commonPrice:1,semiStarPrice:2,unlistedStarPrice:3,star1Price:4,star2Price:5,star3Price:6};
 assert.equal(validPriceSnapshot(prices),true);
 assert.equal(validPriceSnapshot({...prices,star3Price:null}),false);
 assert.equal(validPriceSnapshot({...prices,star3Price:0}),false);
 assert.equal(validPriceSnapshot({...prices,star3Price:"6"}),false);
 assert.equal(matchesPriceSnapshot(prices,{...prices,commonPrice:0.5}),false);
 const set={id:"test",productId:"product",product:{sport:"Baseball",year:1990},...prices};
 const cs=[
  {id:1,player:"Catfish Hunter SM",team:null,cardNumber:"1",bookValue:99},
  {id:2,player:"Jim Hunter",team:null,cardNumber:"2",bookValue:2},
  {id:3,player:"Catfish Hunter",team:null,cardNumber:"3",bookValue:0},
  {id:4,player:"Unknown athlete qqq",team:null,cardNumber:"4",bookValue:0},
  {id:5,player:"Unknown athlete zzz",team:null,cardNumber:"5",bookValue:7},
 ];
 writes.length=0;
 const r=await planTierPriceApplication(fake as any,set,cs,"overwriteAllPrices");
 assert.deepEqual([...r.groups],[[2,[1,3]]]);
 assert.deepEqual(r.summary,{scannedCards:5,updatedCards:2,alreadyCorrect:1,skippedAlreadyPriced:0,skippedNoTier:2,skippedNoPrice:0,pricedCards:4});
 assert.equal(writes.length,0);
 assert.equal(cs[0].bookValue,99);
 const missing=await planTierPriceApplication(fake as any,{...set,semiStarPrice:null},cs,"overwriteAllPrices");
 assert.equal(missing.summary.skippedNoPrice,3);assert.equal(missing.groups.size,0);
});

test("one-click pricing respects C003 overrides and ambiguous contexts",async()=>{
 const {planTierPriceApplication}=await import("../src/lib/apply-tier-prices");
 const p={id:5007,sport:"Basketball",canonicalName:"Scottie Pippen",normalizedName:"scottie pippen",tier:"UNLISTED_STAR",notes:null,createdAt:new Date(0),updatedAt:new Date(1)};
 profiles.push(p);
 try{
  const set={id:"test",productId:"product",product:{sport:"Basketball",year:1996},commonPrice:1,semiStarPrice:2,unlistedStarPrice:3,star1Price:4,star2Price:5,star3Price:6};
  const r=await planTierPriceApplication(fake as any,set,[{id:1,player:"Scottie Pippen",team:"Chicago Bulls",cardNumber:"1",bookValue:0},{id:2,player:"Mike Dunleavy",team:null,cardNumber:"2",bookValue:0}]);
  assert.deepEqual([...r.groups],[[4,[1]]]);assert.equal(r.summary.skippedNoTier,1);
 }finally{profiles.pop();}
});

test("blank pricing is default, preserves every nonzero value, and overwrite requires explicit confirmation",async()=>{
 const {parseApplyMode,planTierPriceApplication}=await import("../src/lib/apply-tier-prices");
 assert.equal(parseApplyMode(undefined,undefined),"fillBlankPrices");
 assert.equal(parseApplyMode("fillBlankPrices",false),"fillBlankPrices");
 assert.equal(parseApplyMode("overwriteAllPrices",undefined),null);
 assert.equal(parseApplyMode("overwriteAllPrices",false),null);
 assert.equal(parseApplyMode("overwriteAllPrices",true),"overwriteAllPrices");
 assert.equal(parseApplyMode("unexpected",true),null);
 const set={id:"test",productId:"product",product:{sport:"Baseball",year:1990},commonPrice:1,semiStarPrice:2,unlistedStarPrice:3,star1Price:4,star2Price:5,star3Price:6};
 const cs=[{id:1,player:"Catfish Hunter",team:null,cardNumber:"1",bookValue:99},{id:2,player:"Jim Hunter",team:null,cardNumber:"2",bookValue:0},{id:3,player:"Jim Hunter",team:null,cardNumber:"3",bookValue:2},{id:4,player:"Unknown athlete qqq",team:null,cardNumber:"4",bookValue:7},{id:5,player:"Unknown athlete zzz",team:null,cardNumber:"5",bookValue:0},{id:6,player:"Jim Hunter",team:null,cardNumber:"6",bookValue:-1}];
 const r=await planTierPriceApplication(fake as any,set,cs);
 assert.deepEqual([...r.groups],[[2,[2]]]);
 assert.deepEqual(r.summary,{scannedCards:6,updatedCards:1,alreadyCorrect:0,skippedAlreadyPriced:4,skippedNoTier:1,skippedNoPrice:0,pricedCards:4});
 assert.equal(cs[0].bookValue,99);
});
