// Integration test for the actual Set Factory importer, using an EMPTY local
// disposable PostgreSQL database. Never reads DATABASE_URL from the shell.
// SET_FACTORY_TEST_DATABASE_URL must name ud91_set_factory_test on localhost.
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
assert.equal(parsedUrl.pathname, '/ud91_set_factory_test', 'Dedicated test database name required');
const prisma = new PrismaClient({ datasourceUrl: testUrl });
const root = process.cwd();
const bundlePath = path.resolve('data/set-factory/1991-upper-deck-baseball.bundle.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const temp = await mkdtemp(path.join(tmpdir(), 'ud91-integration-'));
const environment = { ...process.env, DATABASE_URL: testUrl };
const run = (args, success = true) => {
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
  const dryRun = run([bundlePath]);
  assert.match(dryRun, /totalCards: 878/);
  assert.match(dryRun, /productSets: 11/);
  assert.equal(await prisma.product.count(), 0, 'Dry run wrote a product');
  assert.equal(await prisma.card.count(), 0, 'Dry run wrote cards');
  assert.match(run([bundlePath, '--apply'], false), /apply blocked/);
  assert.equal(await prisma.product.count(), 0, 'Pending-team rejection wrote data');
  run([bundlePath, '--apply', '--allow-pending-teams']);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(await prisma.productSet.count(), 11);
  assert.equal(await prisma.card.count(), 878);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: bundle.product.id } });
  assert.equal(product.released, false);
  assert.equal(product.cardsPerPack, 16);
  assert.equal(product.packsPerBox, 36);
  for (const spec of bundle.productSets) {
    const set = await prisma.productSet.findUniqueOrThrow({ where: { id: spec.id } });
    assert.equal(await prisma.card.count({ where: { productSetId: spec.id } }), spec.expectedCards);
    assert.equal(set.isBase, spec.kind === 'BASE');
    assert.equal(set.isInsert, spec.kind === 'INSERT');
    assert.equal(set.oddsPerPack, spec.oddsPerPack);
  }
  assert.equal(await prisma.card.count({ where: { player: { endsWith: ' RC' } } }), 69);
  assert.equal(await prisma.card.count({ where: { team: null } }), 12, 'Only ten checklists and two generic headers may lack teams');
  const baseId = bundle.productSets.find(s => s.key === 'base').id;
  const anchor = await prisma.card.findUniqueOrThrow({ where: { productSetId_cardNumber: { productSetId: baseId, cardNumber: '55' } } });
  assert.equal(anchor.player, 'Chipper Jones RC');
  assert.equal(anchor.team, 'Atlanta Braves');
  assert.equal(anchor.subset, 'Top Prospects');
  const header = await prisma.card.findFirstOrThrow({ where: { productSetId: { endsWith: 'Heroes_of_Baseball' }, cardNumber: 'H4' } });
  assert.equal(header.player, 'Harmon Killebrew / Gaylord Perry / Ferguson Jenkins');
  // Add sentinel values only inside this disposable database, then rerun.
  await prisma.product.update({ where: { id: product.id }, data: { packPriceCents: 321, packImageUrl: 'https://example.test/pack.webp' } });
  await prisma.productSet.update({ where: { id: baseId }, data: { commonPrice: 1.25, star1Price: 12.5 } });
  await prisma.card.update({ where: { id: anchor.id }, data: { bookValue: 9.75, frontImageUrl: 'https://example.test/front.webp', backImageUrl: 'https://example.test/back.webp' } });
  const rerun = run([bundlePath, '--apply', '--allow-pending-teams']);
  assert.match(rerun, /insertedCards: 0/);
  assert.match(rerun, /updatedCards: 878/);
  assert.equal(await prisma.card.count(), 878);
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
  assert.match(run([malformed, '--apply', '--allow-pending-teams'], false), /must start unreleased/);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).released, false);
  console.log('PASS: real importer dry-run, safety gates, 878-card apply, 11 sets, RCs/teams/metadata, idempotent rerun, preserved prices/images, unreleased state');
} finally {
  await prisma.$disconnect();
}
