// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name ex01_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/ex01_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2001-fleer-ex-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'ex01-integration-'));
const environment = { ...process.env, DATABASE_URL: testUrl };
const run = async (args, success = true) => {
  // Release the assertion client before the importer opens its own connection.
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
  assert.match(dryRun, /totalCards: 426/);
  assert.match(dryRun, /productSets: 12/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2001-fleer-ex-baseball.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Jason Kendall,Pittsburgh Pirates,,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Jason Kendall,Pittsburgh Pirates,,', 'base,1,Jason Kendall,,,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /non-checklist cards are missing teams/);
  assert.equal(await prisma.product.count(), 0, 'Missing-team rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 12);
  assert.equal(await prisma.card.count(), 426);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 5);
  assert.equal(product.packsPerBox, 24);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 4);
  assert.equal(await prisma.card.count({ where: { team: null } }), 2, 'Only two generic checklists may lack teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '105');
  assert.equal(anchor.player, 'Ichiro Suzuki RC');
  assert.equal(anchor.team, 'Seattle Mariners');
  assert.equal(anchor.subset, 'Rookies/Prospects');
  assert.equal((await lookup('base', '109')).player, 'Esix Snead RC');
  assert.equal((await lookup('base', '115')).player, 'Elpidio Guzman RC');
  assert.equal((await lookup('base', '117')).player, 'Winston Abreu RC');
  assert.equal((await lookup('base', '100')).subset, null);
  for (const [number, run] of [['109', 1999], ['121', 2999], ['129', 2999]]) {
    assert.match((await lookup('base', number)).variant, new RegExp('Serial numbered /' + run));
  }
  assert.match((await lookup('base', '101')).variant, /unsigned allocation 1749/);
  assert.match((await lookup('rookie-autographs', '101')).variant, /signed allocation 250/);
  assert.match((await lookup('rookie-autographs', '127')).variant, /signed allocation 2000/);
  assert.equal((await lookup('essential', '105')).player, 'Ichiro Suzuki');
  assert.equal((await lookup('essential', '100')).subset, 'Essential Credentials Now');
  assert.equal((await lookup('essential', '101')).subset, 'Essential Credentials Future');
  assert.match((await lookup('essential', '1')).variant, /Serial numbered \/299/);
  assert.match((await lookup('essential', '130')).variant, /Serial numbered \/29$/);
  assert.equal((await lookup('jerseys', 'NNO-MARK-GRACE')).team, 'Chicago Cubs');
  assert.equal((await lookup('base', '96')).team, 'Arizona Diamondbacks');
  assert.match((await lookup('jersey-autographs', 'NNO-ROLLIE-FINGERS')).variant, /Serial run pending verification/);
  assert.match((await lookup('wall-of-fame', 'NNO-ROBIN-YOUNT')).variant, /outfield-wall memorabilia/);
  assert.match((await lookup('jeter-monumental', '2 MM')).variant, /Serial numbered \/1996/);
  assert.match((await lookup('jeter-monumental-auto', 'NNO-DEREK-JETER')).variant, /hand numbered \/96/);
  assert.match((await lookup('jeter-base-inks', 'NNO-DEREK-JETER')).variant, /published print run 500/);
  assert.equal((await lookup('extra-innings', '1XI')).player, 'Mark McGwire');
  assert.match((await lookup('season-pass', 'NNO-NOLAN-RYAN')).variant, /historical redemption expired/);
  assert.equal((await lookup('checklists', 'NNO-A')).team, null);
  assert.equal((await lookup('checklists', 'NNO-B')).variant, 'Checklist: 122-130 and Inserts; source catalogue range 122-140 corrected from scans');
  assert.equal(await prisma.card.count({ where: { productSetId: baseId, cardNumber: '131' } }), 0, 'Platinum-only update must not enter original E-X packs');
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2001-fleer-ex-baseball.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 426/);
  assert.equal(await prisma.card.count(), 426);
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
  console.log('PASS: real importer dry-run, safety gates, 426-card apply, 12 sets, RCs/teams/serial allocations and explicit unresolved-run flag, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
