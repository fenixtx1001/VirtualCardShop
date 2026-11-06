// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name bf02_set_factory_test on localhost.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const testUrl = process.env.SET_FACTORY_TEST_DATABASE_URL;
assert.ok(testUrl, 'Set SET_FACTORY_TEST_DATABASE_URL to an empty disposable local PostgreSQL database');
const parsedUrl = new URL(testUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname), 'Test database must be local');
assert.equal(parsedUrl.pathname, '/bf02_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2002-bowman-football.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'bf02-integration-'));
const environment = { ...process.env, DATABASE_URL: testUrl };
const run = async (args, success = true) => {
  await prisma.$disconnect();
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-set-bundle.ts', ...args], {
    cwd: root, env: environment, encoding: 'utf8', timeout: 120000,
  });
  const output = result.stdout + result.stderr;
  assert.ifError(result.error);
  if (success) assert.equal(result.status, 0, output);
  else assert.notEqual(result.status, 0, 'Expected importer rejection');
  return output;
};
try {
  assert.equal(await prisma.product.count(), 0, 'Refusing to test on a nonempty database');
  assert.equal(await prisma.card.count(), 0, 'Refusing to test on a nonempty database');
  const dryRun = await run([bundlePath]);
  assert.match(dryRun, /totalCards: 1022/);
  assert.match(dryRun, /productSets: 11/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2002-bowman-football.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Emmitt Smith,Dallas Cowboys,Veterans,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Emmitt Smith,Dallas Cowboys,Veterans,', 'unknown-family,1,Emmitt Smith,Dallas Cowboys,Veterans,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /references unknown setKey/);
  assert.equal(await prisma.product.count(), 0, 'Unknown-family rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 11);
  assert.equal(await prisma.card.count(), 1022);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 10);
  assert.equal(product.packsPerBox, 24);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 165);
  assert.equal(await prisma.card.count({ where: { team: null } }), 2, 'Two real checklist cards intentionally have no team');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '138');
  assert.equal(anchor.player, 'Ed Reed RC');
  assert.equal(anchor.team, 'Baltimore Ravens');
  assert.match(anchor.variant, /Printed name Edward Reed/);
  assert.equal((await lookup('base','99')).player, 'Tom Brady');
  assert.equal((await lookup('base','49')).player, 'James Allen');
  assert.equal((await lookup('base','261')).player, 'James Allen RC');
  assert.equal((await lookup('base','261')).team, 'New Orleans Saints');
  assert.equal((await lookup('base','218')).player, 'Brett Keisel RC');
  assert.match((await lookup('base','42')).variant, /Passing Yards in AVG column/);
  for (const key of ['gold','silver']) {
    assert.equal((await lookup(key,'197')).team, 'Minnesota Vikings');
    assert.match((await lookup(key,'197')).variant, /Source Miami affiliation corrected/);
  }
  assert.match((await lookup('gold','138')).variant, /Serial numbered \/50/);
  assert.match((await lookup('silver','138')).variant, /Serial numbered \/250/);
  assert.match((await lookup('uncirculated','250')).variant, /reported print run 290; physical serial stamp unverified/);
  const uncircId = bundle.productSets.find(s => s.key === 'uncirculated').id;
  assert.equal(await prisma.card.count({ where: { productSetId: uncircId } }), 110);
  assert.equal(await prisma.card.count({ where: { productSetId: uncircId, cardNumber: '1' } }), 0);
  assert.equal((await lookup('uncirculated','275')).player, 'John Henderson');
  assert.equal((await lookup('red-ink','SF-DG1')).player, 'Daniel Graham');
  assert.match((await lookup('red-ink','SF-DG1')).variant, /printed code pending original back QA/);
  assert.equal((await lookup('red-ink','SF-DG')).player, 'David Garrard');
  assert.match((await lookup('red-ink','SF-DG')).variant, /Serial numbered \/50/);
  assert.equal((await lookup('draft-relics','DDH-BM')).subset, 'Draft Day Hats');
  assert.equal((await lookup('draft-relics','DDJ-DC')).subset, 'Draft Day Jerseys');
  assert.match((await lookup('draft-relics','DDJ-DC')).variant, /event apparel, not claimed game-used/);
  assert.match((await lookup('fabric','FF-AB')).variant, /Game-worn Senior Bowl jersey/);
  assert.match((await lookup('flashback-jerseys','RFR-CJ')).variant, /Player-worn jersey relic; not claimed game-used/);
  const checklist = await lookup('checklists','2');
  assert.equal(checklist.player, 'Checklist');
  assert.equal(checklist.team, null);
  assert.equal(checklist.subset, 'Checklist');
  assert.match(checklist.variant, /198-275 and Inserts/);
  assert.equal(await prisma.card.count({ where: { productSetId: baseId, subset: 'Veterans' } }), 110);
  assert.equal(await prisma.card.count({ where: { productSetId: baseId, subset: 'Rookies' } }), 165);
  for (const set of bundle.productSets) assert.equal(set.oddsPerPack, null, 'No invented aggregate historical odds');
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2002-bowman-football.cards.csv')], { encoding: 'utf8' });
  assert.equal(status, 0);
  const csvRows = JSON.parse(stdout);
  const byIdentity = new Map(cards.map(card => [card.productSetId + ':' + card.cardNumber, card]));
  for (const row of csvRows) {
    const spec = bundle.productSets.find(s => s.key === row.setKey);
    const card = byIdentity.get(spec.id + ':' + row.cardNumber);
    assert.ok(card);
    for (const field of ['player', 'team', 'subset', 'variant']) assert.equal(card[field] ?? '', row[field], `${row.setKey} #${row.cardNumber} ${field}`);
  }
  // Add sentinel values only inside this disposable database, then rerun.
  await prisma.product.update({ where: { id: product.id }, data: { packPriceCents: 321, packImageUrl: 'https://example.test/pack.webp' } });
  await prisma.productSet.update({ where: { id: baseId }, data: { commonPrice: 1.25, star1Price: 12.5 } });
  await prisma.card.update({ where: { id: anchor.id }, data: { bookValue: 9.75, frontImageUrl: 'https://example.test/front.webp', backImageUrl: 'https://example.test/back.webp' } });
  const rerun = await run([bundlePath, '--apply']);
  assert.match(rerun, /insertedCards: 0/);
  assert.match(rerun, /updatedCards: 1022/);
  assert.equal(await prisma.card.count(), 1022);
  const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(after.released, false);
  assert.equal(after.packPriceCents, 321);
  assert.equal(after.packImageUrl, 'https://example.test/pack.webp');
  const setAfter = await prisma.productSet.findUniqueOrThrow({ where: { id: baseId } });
  assert.equal(Number(setAfter.commonPrice), 1.25);
  assert.equal(Number(setAfter.star1Price), 12.5);
  const cardAfter = await prisma.card.findUniqueOrThrow({ where: { id: anchor.id } });
  assert.equal(Number(cardAfter.bookValue), 9.75);
  assert.equal(cardAfter.frontImageUrl, 'https://example.test/front.webp');
  assert.equal(cardAfter.backImageUrl, 'https://example.test/back.webp');
  const malformed = path.join(temp, 'malformed.bundle.json');
  await writeFile(malformed, JSON.stringify({ ...bundle, product: { ...bundle.product, released: true }, cardsFile: path.resolve(path.dirname(bundlePath), bundle.cardsFile) }));
  assert.match(await run([malformed, '--apply'], false), /must start unreleased/);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).released, false);
  console.log('PASS: real importer dry-run, safety gates, 1022-card apply, 11 sets, RCs/teams/serials/materials/checklist exceptions, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
