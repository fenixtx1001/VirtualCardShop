from pathlib import Path
from collections import Counter
import csv
import io
import json
import zlib

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
gz_path = DATA / "1999-fleer-mystique-football.cards.csv.gz"
csv_path = DATA / "1999-fleer-mystique-football.cards.csv"
bundle_path = DATA / "1999-fleer-mystique-football.bundle.json"

print("=== REPAIR 1999 FLEER MYSTIQUE CHECKLIST ===")

if not gz_path.exists():
    raise SystemExit(f"Missing source file: {gz_path}")

raw = gz_path.read_bytes()
if raw[:2] != b"\x1f\x8b":
    raise SystemExit("Mystique source file does not have a valid gzip header.")

flags = raw[3]
pos = 10
if flags & 4:
    xlen = int.from_bytes(raw[pos:pos + 2], "little")
    pos += 2 + xlen
if flags & 8:
    pos = raw.index(b"\x00", pos) + 1
if flags & 16:
    pos = raw.index(b"\x00", pos) + 1
if flags & 2:
    pos += 2

compressed = raw[pos:-8]
decompressor = zlib.decompressobj(-15)
salvaged = bytearray()
error = None

for byte in compressed:
    try:
        salvaged.extend(decompressor.decompress(bytes([byte])))
    except zlib.error as exc:
        error = exc
        break

text = salvaged.decode("utf-8", errors="ignore")
lines = text.splitlines()
if not lines:
    raise SystemExit("Could not recover any CSV data.")

reader = csv.reader(lines)
header = next(reader)
expected_header = ["setKey", "cardNumber", "player", "team", "subset", "variant"]
if header != expected_header:
    raise SystemExit(f"Unexpected CSV header: {header}")

good_rows = []
for row in reader:
    if len(row) != 6:
        break
    good_rows.append(dict(zip(header, row)))

required_non_masterpiece = {
    "base": 160,
    "checklist": 1,
    "feel-the-game": 10,
    "fresh-ink": 30,
    "nfl-2000": 10,
    "protential": 10,
    "star-power": 10,
    "gold": 100,
}

non_masterpiece = [row for row in good_rows if row["setKey"] != "masterpiece"]
counts = Counter(row["setKey"] for row in non_masterpiece)

for key, expected in required_non_masterpiece.items():
    actual = counts.get(key, 0)
    if actual != expected:
        raise SystemExit(
            f"Recovery validation failed for {key}: expected {expected}, recovered {actual}."
        )

base_rows = {
    int(row["cardNumber"]): row
    for row in non_masterpiece
    if row["setKey"] == "base"
}
if sorted(base_rows) != list(range(1, 161)):
    raise SystemExit("Base checklist is not exactly cards 1-160.")

gold_numbers = sorted(
    int(row["cardNumber"])
    for row in non_masterpiece
    if row["setKey"] == "gold"
)
if gold_numbers != list(range(1, 101)):
    raise SystemExit("Gold checklist is not exactly cards 1-100.")

missing_teams = [
    row for row in non_masterpiece
    if row["setKey"] != "checklist" and not row["team"].strip()
]
if missing_teams:
    raise SystemExit(f"Found {len(missing_teams)} unexpected cards without teams.")

masterpiece_rows = []
for number in range(1, 161):
    base = base_rows[number]
    masterpiece_rows.append({
        "setKey": "masterpiece",
        "cardNumber": f"{number}M",
        "player": base["player"],
        "team": base["team"],
        "subset": base["subset"],
        "variant": "Masterpiece; SN1",
    })

all_rows = non_masterpiece + masterpiece_rows
expected_total_counts = {**required_non_masterpiece, "masterpiece": 160}
final_counts = Counter(row["setKey"] for row in all_rows)

for key, expected in expected_total_counts.items():
    actual = final_counts.get(key, 0)
    if actual != expected:
        raise SystemExit(
            f"Final validation failed for {key}: expected {expected}, found {actual}."
        )

if len(all_rows) != 491:
    raise SystemExit(f"Expected 491 total cards; found {len(all_rows)}.")

seen = set()
for row in all_rows:
    key = (row["setKey"], row["cardNumber"])
    if key in seen:
        raise SystemExit(f"Duplicate card detected: {key}")
    seen.add(key)

buffer = io.StringIO(newline="")
writer = csv.DictWriter(buffer, fieldnames=expected_header, lineterminator="\n")
writer.writeheader()
writer.writerows(all_rows)
csv_path.write_text(buffer.getvalue(), encoding="utf-8")

bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
bundle["cardsFile"] = csv_path.name
bundle_path.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")

gz_path.unlink()

print(f"Recovered intact rows: {len(good_rows)}")
if error:
    print(f"Recovered through damaged gzip point: {error}")
print(f"Created normal CSV: {csv_path.name}")
print(f"Final card records: {len(all_rows)}")
for key in expected_total_counts:
    print(f"  {key}: {final_counts[key]}")
print("Repair complete. No database changes were made.")
