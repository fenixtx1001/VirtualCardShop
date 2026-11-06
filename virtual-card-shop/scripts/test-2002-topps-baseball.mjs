// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name tp02_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/tp02_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/2002-topps-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'tp02-integration-'));
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
  assert.match(dryRun, /totalCards: 3761/);
  assert.match(dryRun, /productSets: 49/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  const malformedCsv = path.join(temp, 'missing-team.cards.csv');
  const originalCsv = await readFile(path.resolve('data/set-factory/2002-topps-baseball.cards.csv'), 'utf8');
  assert.ok(originalCsv.includes('base,1,Pedro Martinez,Boston Red Sox,Veterans,'));
  await writeFile(malformedCsv, originalCsv.replace('base,1,Pedro Martinez,Boston Red Sox,Veterans,', 'base,1,Pedro Martinez,,Veterans,'));
  const missingTeamBundle = path.join(temp, 'missing-team.bundle.json');
  await writeFile(missingTeamBundle, JSON.stringify({ ...bundle, cardsFile: malformedCsv }));
  assert.match(await run([missingTeamBundle, '--apply'], false), /non-checklist cards are missing teams/);
  assert.equal(await prisma.product.count(), 0, 'Missing-team rejection wrote data');
  await run([bundlePath, '--apply']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 49);
  assert.equal(await prisma.card.count(), 3761);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 10);
  assert.equal(product.packsPerBox, 36);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 39);
  assert.equal(await prisma.card.count({ where: { team: null } }), 24, 'Only actual checklist cards have blank teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const lookup = (key, number) => prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: bundle.productSets.find(s => s.key === key).id, cardNumber: number } } });
  const anchor = await lookup('base', '622');
  assert.equal(anchor.player, 'Joe Mauer RC');
  assert.equal(anchor.team, 'Minnesota Twins');
  assert.equal(anchor.subset, 'Draft Picks');
  assert.equal((await lookup('base', '326')).player, 'Jason Bay RC');
  assert.equal((await lookup('base', '313')).player, 'Freddy Sanchez RC');
  assert.equal((await lookup('base', '687')).player, 'Rich Harden RC');
  assert.equal((await lookup('base', '719')).player, 'Albert Pujols');
  assert.equal((await lookup('base', '719')).subset, 'Rookie of the Year Awards');
  assert.equal(await prisma.card.count({ where: { productSetId: baseId, cardNumber: '7' } }), 0);
  assert.equal(await prisma.card.count({ where: { productSetId: baseId } }), 718);
  assert.match((await lookup('base', '365')).variant, /home run 73 of 73/);
  assert.match((await lookup('base-variations', '365A')).variant, /home run 1 of 73/);
  assert.match((await lookup('base-variations', '446B')).variant, /only available in factory sets/);
  assert.match((await lookup('gold', '622')).variant, /Serial numbered \/2002/);
  assert.equal((await lookup('gold', '622')).player, 'Joe Mauer');
  assert.match((await lookup('limited', '622')).variant, /1950 sets; not serial numbered/);
  assert.equal((await lookup('hta', '160')).player, 'Albert Pujols');
  assert.match((await lookup('hta-variations', '160-ERR')).variant, /Placido Polanco/);
  assert.equal((await lookup('13913', 'FS-AL')).team, 'Atlanta Braves / Chicago White Sox / Cleveland Indians');
  assert.equal((await lookup('13913', 'FS-BOO')).team, 'Philadelphia Phillies / Cincinnati Reds / Seattle Mariners');
  assert.match((await lookup('13907', 'RP')).variant, /print run 52; not serial numbered/);
  assert.match((await lookup('13907', 'SB')).variant, /Hand numbered \/52/);
  assert.match((await lookup('13908', 'RP')).variant, /hand numbered \/25/);
  assert.match((await lookup('13910', '1962-TOPPS-315')).variant, /missing from TCDB.*WF10/);
  assert.match((await lookup('13915', 'PCABB')).variant, /actual serial denominator pending.*\/47 conflicts/);
  assert.match((await lookup('13898', '5K-PO')).variant, /exact material unverified/);
  assert.equal((await lookup('134874', 'S1-1')).team, null);
  assert.equal((await lookup('134874', 'S2-1')).team, null);
  assert.equal((await lookup('limited', '340')).player, 'Bret Boone / Juan Gonzalez / Alex Rodriguez');
  for (const key of ['gold','limited','hta','13913','13902','13915','539727','9056']) assert.equal(bundle.productSets.find(s => s.key === key).oddsPerPack, null);
  const cards = await prisma.card.findMany();
  // Verify every imported field against the generated source CSV, not only counts.
  const { stdout, status } = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))', path.resolve('data/set-factory/2002-topps-baseball.cards.csv')], { encoding: 'utf8' });
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
  assert.match(rerun, /updatedCards: 3761/);
  assert.equal(await prisma.card.count(), 3761);
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
  console.log('PASS: real importer dry-run, safety gates, 3761-card apply, 49 sets, RCs/teams/numbering/checklist/parallel metadata, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
