// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name th01_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/th01_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2001-topps-heritage-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'th01-integration-'));
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
  assert.match(dryRun, /totalCards: 773/);
  assert.match(dryRun, /productSets: 15/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2001-topps-heritage-baseball.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1A,Kris Benson,Pittsburgh Pirates,Low Numbers,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1A,Kris Benson,Pittsburgh Pirates,Low Numbers,', 'base,1A,Kris Benson,,Low Numbers,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /non-checklist cards are missing teams/);
  assert.equal(await prisma.product.count(), 0, 'Missing-team rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 15);
  assert.equal(await prisma.card.count(), 773);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 8);
  assert.equal(product.packsPerBox, 24);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 22);
  assert.equal(await prisma.card.count({ where: { team: null } }), 2, 'Only two generic checklist cards have blank teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '246');
  assert.equal(anchor.player, 'Juan Uribe RC');
  assert.equal(anchor.team, 'Colorado Rockies');
  assert.equal((await lookup('base', '250')).player, 'Kyle Lohse RC');
  const baseIdForCounts = bundle.productSets.find(s => s.key === 'base').id;
  assert.equal(await prisma.card.count({ where: { productSetId: baseIdForCounts, subset: 'High Numbers' } }), 97);
  assert.equal(await prisma.card.count({ where: { productSetId: baseIdForCounts, subset: 'Low Numbers' } }), 160);
  assert.match((await lookup('base', '1A')).variant, /^Red back/);
  assert.match((await lookup('base', '1B')).variant, /^Black back/);
  assert.match((await lookup('base', '41A')).variant, /Buerhle/);
  assert.match((await lookup('base', '103')).variant, /Black back only/);
  assert.equal((await lookup('checklists', '1')).team, null);
  assert.equal((await lookup('checklists', '2')).variant, '360-407 and Inserts');
  assert.match((await lookup('chrome', 'CP110')).variant, /Serial numbered \/552/);
  assert.equal((await lookup('autographs', 'THA-ML')).player, 'Mike Lamb');
  assert.equal((await lookup('autographs', 'THA-ML2')).player, 'Matt Lawton');
  assert.match((await lookup('autographs', 'THA-ML2')).variant, /Printed THA-ML/);
  assert.equal((await lookup('red-ink', 'THA-JG')).team, 'Pittsburgh Pirates');
  assert.match((await lookup('red-ink', 'THA-WM')).variant, /Unnumbered.*replacement/);
  assert.match((await lookup('red-ink', 'THA-WMA')).variant, /Hand numbered \/52/);
  for (const key of ['autographs', 'red-ink']) {
    const id = bundle.productSets.find(s => s.key === key).id;
    assert.equal(await prisma.card.count({ where: { productSetId: id, player: { in: ['Eddie Mathews', 'Larry Doby'] } } }), 0);
  }
  assert.equal((await lookup('clubhouse-autographs', 'THCC-DS')).player, 'Duke Snider');
  assert.match((await lookup('clubhouse-autographs', 'THCC-DS')).variant, /Serial numbered \/25/);
  assert.match((await lookup('clubhouse-dual', 'THCC-MMFT')).variant, /Game-used jersey/);
  assert.match((await lookup('time-capsule', 'THTC-WMTW')).variant, /not worn by featured/);
  assert.match((await lookup('grandstand', 'THGG-JR')).variant, /Stadium-seat relic/);
  assert.equal((await lookup('autoproofs', '261')).team, 'New York Giants');
  for (const key of ['red-ink', 'autoproofs', 'clubhouse', 'time-capsule']) assert.equal(bundle.productSets.find(s => s.key === key).oddsPerPack, null);
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2001-topps-heritage-baseball.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 773/);
  assert.equal(await prisma.card.count(), 773);
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
  console.log('PASS: real importer dry-run, safety gates, 773-card apply, 15 sets, RCs/teams/numbering/checklist/parallel metadata, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
