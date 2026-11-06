// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name ts01_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/ts01_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2001-topps-stars-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'ts01-integration-'));
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
  assert.match(dryRun, /totalCards: 817/);
  assert.match(dryRun, /productSets: 11/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2001-topps-stars-baseball.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Darin Erstad,Anaheim Angels,Veterans,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Darin Erstad,Anaheim Angels,Veterans,', 'base,1,Darin Erstad,,Veterans,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /non-checklist cards are missing teams/);
  assert.equal(await prisma.product.count(), 0, 'Missing-team rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 11);
  assert.equal(await prisma.card.count(), 817);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 6);
  assert.equal(product.packsPerBox, 24);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 21);
  assert.equal(await prisma.card.count({ where: { team: null } }), 0, 'All Topps Stars subjects have real teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '198');
  assert.equal(anchor.player, 'Albert Pujols RC');
  assert.equal(anchor.team, 'St. Louis Cardinals');
  assert.equal((await lookup('base', '196')).player, 'Jose Reyes RC');
  assert.equal((await lookup('base', '200')).player, 'Jake Peavy RC');
  assert.equal((await lookup('base', '184')).player, 'Derek Thompson');
  for (const key of ['base', 'gold', 'onyx']) {
    const id = bundle.productSets.find(s => s.key === key).id;
    assert.equal(await prisma.card.count({ where: { productSetId: id, subset: 'Hall of Fame' } }), 9);
    assert.equal(await prisma.card.count({ where: { productSetId: id, subset: 'Rookies/Prospects' } }), 50);
  }
  assert.match((await lookup('gold', '198')).variant, /Serial numbered \/499/);
  assert.match((await lookup('onyx', '198')).variant, /Serial numbered \/99/);
  assert.equal((await lookup('gold', '198')).player, 'Albert Pujols');
  assert.match((await lookup('elimination', '198')).variant, /print run 100; not serial numbered/);
  const elimId = bundle.productSets.find(s => s.key === 'elimination').id;
  for (const number of ['24', '53', '54', '59', '60', '81', '96', '110', '142', '197', '200']) assert.equal(await prisma.card.count({ where: { productSetId: elimId, cardNumber: number } }), 0);
  assert.equal((await lookup('progression', 'P7')).team, 'Brooklyn Dodgers / St. Louis Cardinals / Toronto Blue Jays');
  assert.match((await lookup('progression', 'P8')).player, /Ryan Anderson/);
  assert.equal((await lookup('awards', 'PCA6')).team, 'Chicago White Sox / Seattle Mariners / Detroit Tigers');
  assert.match((await lookup('awards', 'PCA3')).team, /Seattle Mariners/);
  assert.match((await lookup('awards-relics', 'PCAR-1')).variant, /Authentic Players Choice Awards ticket stub; not player-worn material/);
  assert.match((await lookup('awards-relics', 'PCAR-1')).variant, /Ticket face printed 2000; card back refers to 2001/);
  assert.equal((await lookup('awards-relics', 'PCAR-10')).team, 'Atlanta Braves');
  assert.match((await lookup('jerseys', 'TSR-BB')).variant, /^Player-worn jersey relic$/);
  assert.equal((await lookup('jerseys', 'TSR-EM')).player, 'Edgar Martinez');
  assert.equal((await lookup('bats', 'TSR-EM')).player, 'Eric Munson');
  assert.match((await lookup('autograph-relics', 'TSRA-BB')).variant, /player-worn jersey relic; serial numbered \/25/);
  assert.match((await lookup('autograph-relics', 'TSRA-CP')).variant, /game-used bat relic; serial numbered \/25/);
  assert.equal(bundle.productSets.find(s => s.key === 'autograph-relics').oddsPerPack, null);
  assert.match((await lookup('autographs', 'TSA-DS')).variant, /^Certified autograph$/);
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2001-topps-stars-baseball.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 817/);
  assert.equal(await prisma.card.count(), 817);
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
  console.log('PASS: real importer dry-run, safety gates, 817-card apply, 11 sets, RCs/teams/numbering/checklist/parallel metadata, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
