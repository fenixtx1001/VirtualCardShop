// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name bm01_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/bm01_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2001-bowman-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'bm01-integration-'));
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
  assert.match(dryRun, /totalCards: 1032/);
  assert.match(dryRun, /productSets: 12/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2001-bowman-baseball.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Jason Giambi,Oakland Athletics,Veterans,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Jason Giambi,Oakland Athletics,Veterans,', 'base,1,Jason Giambi,,Veterans,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /non-checklist cards are missing teams/);
  assert.equal(await prisma.product.count(), 0, 'Missing-team rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 12);
  assert.equal(await prisma.card.count(), 1032);
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
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 104);
  assert.equal(await prisma.card.count({ where: { team: null } }), 0, 'All Bowman subjects have real teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '264');
  assert.equal(anchor.player, 'Albert Pujols RC');
  assert.equal(anchor.team, 'St. Louis Cardinals');
  for (const [number, name] of [['32', 'Dan Tosca RC'], ['256', 'Travis Hafner RC'], ['361', 'Justin Morneau RC'], ['397', 'Jake Peavy RC'], ['430', 'Jose Reyes RC']]) assert.equal((await lookup('base', number)).player, name);
  assert.equal((await lookup('base', '180')).player, 'Nick Neugebauer');
  assert.match((await lookup('base', '299')).variant, /Photo depicts another player/);
  assert.match((await lookup('base', '397')).variant, /Peavey/);
  assert.match((await lookup('base', '429')).variant, /first Bowman card is 2000/);
  for (const key of ['base', 'gold']) {
    const id = bundle.productSets.find(s => s.key === key).id;
    assert.equal(await prisma.card.count({ where: { productSetId: id, subset: 'Veterans' } }), 140);
    assert.equal(await prisma.card.count({ where: { productSetId: id, subset: 'Rookies/Prospects' } }), 300);
  }
  assert.equal(bundle.productSets.find(s => s.key === 'gold').oddsPerPack, 1);
  assert.match((await lookup('gold', '264')).variant, /facsimile signature/);
  assert.equal((await lookup('gold', '264')).player, 'Albert Pujols');
  assert.equal((await lookup('futures', 'FGR-DCP')).player, 'Corey Patterson');
  assert.equal((await lookup('futures', 'FGR-CP')).player, 'Carlos Pena');
  assert.equal((await lookup('multiple-autographs', 'AMGR-EM')).team, 'Detroit Tigers');
  assert.match((await lookup('autographs', 'BA-DM')).variant, /fulfilled signed card/);
  const autoId = bundle.productSets.find(s => s.key === 'autographs').id;
  assert.equal(await prisma.card.count({ where: { productSetId: autoId, cardNumber: 'BA-KS' } }), 0);
  assert.match((await lookup('reprint-autographs', '4')).variant, /print run 100; not serial numbered/);
  const rraId = bundle.productSets.find(s => s.key === 'reprint-autographs').id;
  assert.equal(await prisma.card.count({ where: { productSetId: rraId, cardNumber: '7' } }), 0);
  assert.match((await lookup('autoproofs', '569')).variant, /1991 Bowman #569; hand numbered \/25/);
  assert.equal((await lookup('autoproofs', '3')).player, 'Ralph Kiner');
  assert.equal(bundle.productSets.find(s => s.key === 'autoproofs').oddsPerPack, null);
  assert.equal((await lookup('roy', 'ROY-R')).team, 'Seattle Mariners / Atlanta Braves');
  assert.match((await lookup('bat-autographs', '3')).variant, /Game-used bat/);
  assert.doesNotMatch((await lookup('bat-autographs', '3')).variant, /Serial numbered/);
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2001-bowman-baseball.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 1032/);
  assert.equal(await prisma.card.count(), 1032);
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
  console.log('PASS: real importer dry-run, safety gates, 1032-card apply, 12 sets, RCs/teams/numbering/checklist/parallel metadata, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
