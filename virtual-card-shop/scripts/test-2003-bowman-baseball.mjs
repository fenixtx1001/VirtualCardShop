// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name bm03_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/bm03_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2003-bowman-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'bm03-integration-'));
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
  assert.match(dryRun, /totalCards: 1317/);
  assert.match(dryRun, /productSets: 11/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2003-bowman-baseball.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Garret Anderson,Anaheim Angels,Veterans,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Garret Anderson,Anaheim Angels,Veterans,', 'base,1,Garret Anderson,,Veterans,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /non-checklist cards are missing teams/);
  assert.equal(await prisma.product.count(), 0, 'Missing-team rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 11);
  assert.equal(await prisma.card.count(), 1317);
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
  assert.equal(await prisma.card.count({ where: { team: null } }), 0, 'All Bowman subjects have real teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '327');
  assert.equal(anchor.player, 'Kevin Youkilis RC');
  assert.equal(anchor.team, 'Boston Red Sox');
  assert.equal((await lookup('base', '166')).player, 'Jose Contreras RC');
  assert.equal((await lookup('base', '202')).player, 'Chien-Ming Wang RC');
  assert.equal((await lookup('base', '260')).player, 'Brian McCann RC');
  assert.equal((await lookup('base', '285')).player, 'Hanley Ramirez RC');
  assert.equal((await lookup('base', '157')).player, 'Quincy Carter RC');
  assert.equal((await lookup('base', '156')).player, 'Chad Hutchinson');
  assert.equal((await lookup('base', '208')).player, 'Eric Eckenstahler');
  for (const [number, name, printed] of [['171','Ramon Nivar','Ramon A. Martinez'],['190','Wandy Rodriguez','Eny Cabreja'],['217','Santiago Casilla','Jairo Garcia'],['258','Willy Corporan','Aneudis Mateo'],['293','Rafael Diaz','Carlos Rijo'],['317','Carlos Morla','Denny Tussen']]) {
    const card = await lookup('base', number);
    assert.equal(card.player, name + ' RC');
    assert.ok(card.variant.includes('Printed name ' + printed));
    assert.equal((await lookup('gold', number)).player, name);
  }
  for (const key of ['base','gold','silver']) {
    const productSetId = bundle.productSets.find(s => s.key === key).id;
    assert.equal(await prisma.card.count({ where: { productSetId, subset: 'Veterans' } }), 155);
    assert.equal(await prisma.card.count({ where: { productSetId, subset: 'Rookies/Prospects' } }), 175);
  }
  assert.equal(await prisma.card.count({ where: { cardNumber: 'NNO' } }), 0, 'Generic redemption tickets are not player cards');
  assert.match((await lookup('silver', '327')).variant, /serial numbered \/250/);
  assert.match((await lookup('metallic-gold', '327')).variant, /stated print run 230; not serial numbered/);
  assert.match((await lookup('gold', '327')).variant, /facsimile signature; not a certified autograph/);
  const metallicId = bundle.productSets.find(s => s.key === 'metallic-gold').id;
  assert.equal(await prisma.card.count({ where: { productSetId: metallicId, cardNumber: '157' } }), 0);
  assert.equal((await lookup('jerseys', 'FG-SS')).team, 'Boston Red Sox');
  assert.equal((await lookup('jerseys', 'FG-RR')).team, 'Los Angeles Dodgers');
  assert.equal((await lookup('jerseys', 'FG-VD')).team, 'Cleveland Indians');
  assert.match((await lookup('jerseys', 'FG-VD')).variant, /printed affiliation retained/);
  assert.match((await lookup('futures-autograph', 'FGAB-JR')).variant, /game-used base relic.*HTA Jumbo exclusive/);
  assert.match((await lookup('roy-relic', 'ROY-JH')).variant, /jersey of Jason Jennings.*bat of Eric Hinske/);
  assert.equal((await lookup('roy-relic', 'ROY-JH')).team, 'Colorado Rockies / Toronto Blue Jays');
  assert.equal((await lookup('dual-autographs', 'DSF-CH')).player, 'Quincy Carter / Chad Hutchinson');
  assert.equal((await lookup('dual-autographs', 'DSF-CH')).team, 'Chicago Cubs / St. Louis Cardinals');
  assert.match((await lookup('red-ink', 'SOF-ZG')).variant, /Red ink signature/);
  assert.equal(await prisma.card.count({ where: { cardNumber: 'SOF-AT' } }), 0, 'Separate Draft subject excluded');
  for (const key of ['silver','metallic-gold','bats','autographs','futures-autograph']) assert.equal(bundle.productSets.find(s => s.key === key).oddsPerPack, null);
  assert.equal(bundle.productSets.find(s => s.key === 'gold').oddsPerPack, 1);
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2003-bowman-baseball.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 1317/);
  assert.equal(await prisma.card.count(), 1317);
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
  console.log('PASS: real importer dry-run, safety gates, 1317-card apply, 11 sets, RCs/teams/numbering/checklist/parallel metadata, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
