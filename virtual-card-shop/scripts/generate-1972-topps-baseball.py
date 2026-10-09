from __future__ import annotations

import csv
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/set-factory/1972-topps-baseball.cards.csv"
BASE = "https://www.tcdb.com/Checklist.cfm/sid/72/1972-Topps"
ROOKIES = "https://www.tcdb.com/Rookies.cfm/sid/72/1972-Topps"
EXPECTED = 787
EXPECTED_RC_NUMBERS = 74

class RowParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []
    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)
    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None

def fetch(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory checklist research)",
                 "Accept": "text/html,application/xhtml+xml"}
    )
    with urllib.request.urlopen(req, timeout=35) as response:
        return response.read().decode("utf-8", errors="replace")

def parse(url, max_pages, label):
    found = []
    for page in range(1, max_pages + 1):
        p = RowParser()
        p.feed(fetch(f"{url}?PageIndex={page}"))
        parsed = []
        for row in p.rows:
            values = [x.strip() for x in row if x.strip()]
            for idx, val in enumerate(values):
                if re.fullmatch(r"\d{1,3}[A-Za-z]?", val) and idx+1 < len(values):
                    n = int(re.match(r"\d+", val).group())
                    if 1 <= n <= EXPECTED:
                        name = values[idx+1]
                        if name.lower() not in ("options", "add", "edit"):
                            team = values[-1] if idx+2 < len(values) else ""
                            if team == name or re.match(r"^(?:VAR|ERR|COR|UER):", team, re.I):
                                team = ""
                            parsed.append((n, name, team))
                    break
        print(f"{label} page {page}: parsed {len(parsed)} records")
        found.extend(parsed)
        if page > 1 and not parsed:
            break
        if label == "rookies" and page >= 2 and len({n for n,_,_ in found}) >= EXPECTED_RC_NUMBERS:
            break
    return found

ANNOTATION = re.compile(
    r"(?:\s*,?\s*(?:RC|RS|ROO|VAR|ERR|COR|UER|ASR|AS|TC|CL|LL|IA|MGR|MG|ALCS|NLCS|LCS|WS|BP))+"
    r"\s*(?::\s*.*)?$", re.I
)
MERGED_ERROR = re.compile(
    r"\s+(?:(?:RC|RS|ROO)?(?:VAR|ERR|COR|UER)){1,3}\s*(?::\s*.*)?$", re.I
)
NOTE_ONLY = re.compile(r"\s+(?:RC)+\s+for\s+.+?\s+only\s*$", re.I)
LEAK = re.compile(r"(?<!\w)(?:UER|ERR|COR|VAR)(?!\w)", re.I)

def clean(raw):
    text = " ".join(raw.split()).strip()
    text = NOTE_ONLY.sub("", text)
    for _ in range(6):
        old = text
        text = MERGED_ERROR.sub("", text)
        text = ANNOTATION.sub("", text)
        text = re.sub(r"\s+,\s*$", "", text).strip(" ,;")
        if text == old:
            break
    if not text or LEAK.search(text):
        raise ValueError(f"Could not clean TCDB source subject: {raw!r} => {text!r}")
    return text

def subset(n, raw, player):
    if "checklist" in player.lower(): return "Checklist"
    if 85 <= n <= 96: return "League Leaders"
    if 221 <= n <= 222: return "League Championship Series"
    if 223 <= n <= 230: return "World Series"
    if 341 <= n <= 348 or 491 <= n <= 498: return "Boyhood Photos"
    if 621 <= n <= 626: return "Awards and Trophy"
    if 751 <= n <= 757: return "Traded"
    if re.search(r"\bIA\b", raw): return "In Action"
    if re.search(r"\bRS\b", raw) or "Rookie Stars" in player: return "Rookie Stars"
    if re.search(r"\bTC\b", raw): return "Team Card"
    if re.search(r"\bASR\b", raw): return "All-Star Rookie"
    return ""

def main():
    rookies = parse(ROOKIES, 4, "rookies")
    rc = {n for n, _name, _team in rookies}
    if len(rc) != EXPECTED_RC_NUMBERS:
        raise SystemExit(f"Rookie index mismatch, expected {EXPECTED_RC_NUMBERS}, got {len(rc)}: {sorted(rc)}")
    source = parse(BASE, 12, "base")
    groups = {}
    for n, raw_name, team in source:
        groups.setdefault(n, []).append((clean(raw_name), team, raw_name))
    if set(groups) != set(range(1, EXPECTED+1)):
        missing = sorted(set(range(1, EXPECTED+1)) - set(groups))
        raise SystemExit(f"Numbering mismatch: {len(groups)} unique numbers; missing {missing[:30]}")
    rows = []
    multiplayer_review = []
    for n in range(1, EXPECTED+1):
        records = groups[n]
        subjects = {r[0] for r in records}
        teams = {r[1] for r in records if r[1]}
        if len(subjects) != 1:
            raise SystemExit(f"Base #{n} variations do not collapse to one subject: {sorted(subjects)}")
        if len(teams) > 1:
            raise SystemExit(f"Base #{n} team mismatch across variations: {sorted(teams)}")
        player = next(iter(subjects))
        team = next(iter(teams)) if teams else ""
        category = subset(n, records[0][2], player)
        # The six award cards depict trophies, not a player's club.
        # Retain them in Base and use the neutral MLB association.
        if 621 <= n <= 626 and category == "Awards and Trophy":
            if team and team != "MLB":
                raise SystemExit(f"Base #{n} award unexpectedly assigned to {team!r}")
            team = "MLB"
        if not team and category != "Checklist":
            raise SystemExit(f"Base #{n} missing team for {player!r}")
        if n in rc:
            if "/" in player or "Rookie Stars" in player:
                multiplayer_review.append((n, player))
            else:
                player += " RC"
        rows.append(["base", str(n), player, team, category, ""])

    if len(rows) != EXPECTED or len({r[1] for r in rows}) != EXPECTED:
        raise SystemExit("Card count or duplicate card numbers")
    if LEAK.search("\n".join(r[2] for r in rows)):
        raise SystemExit("Source annotations remain in player values")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(rows)
    print("=== 1972 TOPPS BASEBALL GENERATED ===")
    print(f"Base cards: {len(rows)}")
    print(f"Unique rookie-index cards: {len(rc)}")
    print(f"Multi-player rookie cards pending player-level review: {len(multiplayer_review)}")
    for n, player in multiplayer_review:
        print(f"  REVIEW #{n}: {player}")
    print(f"CSV: {OUT}")
    print("Status: UNRELEASED / player-level RC review pending")

if __name__ == "__main__":
    main()
