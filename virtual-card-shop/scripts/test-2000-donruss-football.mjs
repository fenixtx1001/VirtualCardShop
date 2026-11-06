// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name dr00_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/dr00_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2000-donruss-football.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'dr00-integration-'));
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
  assert.match(dryRun, /totalCards: 1278/);
  assert.match(dryRun, /productSets: 22/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2000-donruss-football.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Jake Plummer,Arizona Cardinals,Veterans,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Jake Plummer,Arizona Cardinals,Veterans,', 'unknown-family,1,Jake Plummer,Arizona Cardinals,Veterans,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /references unknown setKey/);
  assert.equal(await prisma.product.count(), 0, 'Unknown-family rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 22);
  assert.equal(await prisma.card.count(), 1278);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 16);
  assert.equal(product.packsPerBox, 18);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 100);
  assert.equal(await prisma.card.count({ where: { team: null } }), 0, 'All Donruss subjects have real teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '230');
  assert.equal(anchor.player, 'Tom Brady RC');
  assert.equal(anchor.team, 'New England Patriots');
  assert.match(anchor.variant, /Serial numbered \/1325/);
  assert.equal((await lookup('base', '245')).player, 'Kevin McDougal RC');
  assert.equal((await lookup('base', '182')).player, 'R. Jay Soward RC');
  assert.match((await lookup('career', '230')).variant, /Serial numbered \/214/);
  assert.match((await lookup('season', '230')).variant, /Serial numbered \/20/);
  assert.match((await lookup('kings-autographs', 'GK-7')).variant, /Serial numbered \/250; Reported print run 19 signed copies/);
  assert.match((await lookup('rookie-autographs', 'GK-6')).variant, /Signed allocation 50.*Serial numbered \/250/);
  assert.match((await lookup('rookie-autographs', 'GK-9')).variant, /fulfilled signed Sylvester Morris/);
  assert.match((await lookup('jersey-autographs', '1')).variant, /Certified autograph; Game-worn jersey relic; Serial numbered \/50/);
  assert.match((await lookup('zoning', 'ZC-1')).variant, /Serial numbered \/1000/);
  assert.equal(await prisma.card.count({ where: { productSetId: baseId, subset: 'Veterans' } }), 150);
  assert.equal(await prisma.card.count({ where: { productSetId: baseId, subset: 'Rookies' } }), 100);
  const allCards = await prisma.card.findMany();
  for (const key of ['signature-blue','signature-gold','signature-red','promos']) {
    const id = bundle.productSets.find(s => s.key === key).id;
    for (const card of allCards.filter(c => c.productSetId === id)) {
      assert.match(card.cardNumber, /^NNO-\d+$/);
      assert.match(card.variant, /local NNO-CID identifier is not a printed card number/);
    }
  }
  const sig = (key, name) => allCards.find(c => c.productSetId === bundle.productSets.find(s => s.key === key).id && c.player === name);
  assert.equal(sig('signature-blue','Doug Chapman').team, 'Minnesota Vikings');
  assert.equal(sig('signature-red','Danny Farmer').team, 'Pittsburgh Steelers');
  assert.equal(sig('signature-red','Kevin Faulk').team, 'New England Patriots');
  for (const card of allCards.filter(c => c.productSetId === bundle.productSets.find(s => s.key === 'signature-red').id)) {
    assert.match(card.variant, /Reported print run \d+; not serial numbered/);
    assert.doesNotMatch(card.variant, /Serial numbered/);
  }
  assert.ok(!bundle.productSets.some(s => s.sourceSetId === 35798), 'Disputed duplicate namespace is withheld');
  assert.match(bundle.review.checklist, /53_WITHHELD/);
  assert.equal(bundle.productSets.find(s => s.key === 'career').oddsPerPack, null);
  assert.equal(bundle.productSets.find(s => s.key === 'season').oddsPerPack, 192);
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2000-donruss-football.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 1278/);
  assert.equal(await prisma.card.count(), 1278);
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
  console.log('PASS: real importer dry-run, safety gates, 1278-card apply, 22 sets, RCs/teams/serials/print runs/withheld entries, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
