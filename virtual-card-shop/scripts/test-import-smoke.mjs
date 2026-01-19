// Smoke test for paste import parsing (no DB operations)
function isImageThumbToken(s) {
  return /^image\s*thumbnail$/i.test(s.trim());
}

function splitLine(line) {
  const cleaned = line.replace(/^(?:\s*image\s*thumbnail\s*){1,}/i, "");
  let parts = cleaned.split("\t").map((s) => s.trim());
  if (parts.length < 3) {
    parts = cleaned.trim().split(/\s{2,}/).map((s) => s.trim());
  }
  while (parts.length && isImageThumbToken(parts[0])) parts.shift();
  while (parts.length && isImageThumbToken(parts[0])) parts.shift();
  return parts;
}

function parsePlayerField(raw) {
  let player = raw.trim();
  let subset = null;
  let variant = null;
  if (/\bDK\b/i.test(player)) {
    subset = "Diamond Kings";
    player = player.replace(/\bDK\b/gi, "").replace(/\s+/g, " ").trim();
  }
  if (/\bUER\b/i.test(player)) {
    variant = variant ? `${variant}, UER` : "UER";
    player = player
      .replace(/\bUER\b/gi, "")
      .replace(/,\s*,/g, ",")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/,\s*$/g, "");
  }
  player = player.replace(/\s*,\s*/g, ", ").trim();
  return { player, subset, variant };
}

const sample = `Image thumbnail image thumbnail\t1\tDave Stieb DK\tToronto Blue Jays
Image thumbnail image thumbnail\t2\tCraig Biggio DK\tHouston Astros
Image thumbnail image thumbnail\t3\tCecil Fielder DK\tDetroit Tigers
Image thumbnail image thumbnail\t4\tBarry Bonds DK\tPittsburgh Pirates
Image thumbnail image thumbnail\t5\tBarry Larkin DK\tCincinnati Reds
Image thumbnail image thumbnail\t6\tDave Parker DK\tMilwaukee Brewers
Image thumbnail image thumbnail\t7\tLen Dykstra DK\tPhiladelphia Phillies
Image thumbnail image thumbnail\t8\tBobby Thigpen DK\tChicago White Sox
Image thumbnail image thumbnail\t9\tRoger Clemens DK\tBoston Red Sox
Image thumbnail image thumbnail\t10\tRon Gant DK, UER\tAtlanta Braves`;

const lines = sample.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

console.log(`Running smoke parse on ${lines.length} lines`);

const results = [];
for (const line of lines) {
  const parts = splitLine(line);
  if (parts.length < 2) {
    console.error('Could not parse:', line);
    continue;
  }
  const cardNumber = String(parts[1] ?? parts[0]).trim();
  // original code treats parts[0] as cardNumber; in sample the number is at index 1 after removing thumb tokens
  // We'll detect numeric column
  const idxNum = parts.findIndex(p => /^\d+$/.test(p));
  const cardNum = idxNum >= 0 ? parts[idxNum] : parts[0];
  const playerField = parts[idxNum+1] ?? parts[1] ?? '';
  const team = parts.length > (idxNum+2) ? parts.slice(idxNum+2).join(' ') : '';

  const parsed = parsePlayerField(playerField);
  results.push({ cardNum, player: parsed.player, subset: parsed.subset, variant: parsed.variant, team });
}

console.log(JSON.stringify(results, null, 2));

// Simple assertions
if (results.length !== lines.length) {
  console.error('Mismatch line count vs parsed count');
  process.exit(2);
}

if (!results[0].player.includes('Dave Stieb')) {
  console.error('First player parse looks wrong');
  process.exit(3);
}

console.log('Smoke parse OK');
