from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "2003-donruss-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/1603/2003-Donruss"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/1603/2003-Donruss"
INSERTS_URL = "https://www.tcdb.com/Inserts.cfm/sid/1603/2003-Donruss"

EXPECTED_BASE = 400
EXPECTED_TRUE_RCS = 0
EXPECTED_PRODUCT_SETS = 19

SOURCE_SPECS = [
    {"key": "stat-line-career", "name": "Stat Line Career", "expected": 400, "pattern": r"\d{1,3}", "subset": "Stat Line Career"},
    {"key": "stat-line-season", "name": "Stat Line Season", "expected": 400, "pattern": r"\d{1,3}", "subset": "Stat Line Season"},
    {"key": "anniversary-1983", "name": "Anniversary 1983", "expected": 20, "pattern": r"\d{1,2}", "subset": "Anniversary 1983"},
    {"key": "all-stars", "name": "All-Stars", "expected": 10, "pattern": r"(?:AL|NL)-\d{1,2}", "subset": "All-Stars"},
    {"key": "diamond-kings-gold", "name": "Diamond Kings Gold", "expected": 20, "pattern": r"DK-\d{1,2}", "subset": "Diamond Kings Gold"},
    {"key": "diamond-kings-gold-studio", "name": "Diamond Kings Gold Studio Series", "expected": 20, "pattern": r"DK-\d{1,2}", "subset": "Diamond Kings Gold Studio Series"},
    {"key": "elite-series", "name": "Elite Series", "expected": 15, "pattern": r"ES-\d{1,2}", "subset": "Elite Series"},
    {"key": "elite-series-dominators", "name": "Elite Series Dominators", "expected": 15, "pattern": r"ES-\d{1,2}", "subset": "Elite Series Dominators"},
    {"key": "production-line", "name": "Production Line", "expected": 30, "pattern": r"PL-\d{1,2}", "subset": "Production Line"},
    {"key": "production-line-die-cut", "name": "Production Line Die Cut", "expected": 30, "pattern": r"PL-\d{1,2}", "subset": "Production Line Die Cut"},
    {"key": "longball-leaders", "name": "Longball Leaders", "expected": 10, "pattern": r"LL-\d{1,2}", "subset": "Longball Leaders"},
    {"key": "longball-leaders-seasonal-sums", "name": "Longball Leaders Seasonal Sums", "expected": 10, "pattern": r"LL-\d{1,2}", "subset": "Longball Leaders Seasonal Sums"},
    {"key": "bat-kings", "name": "Bat Kings", "expected": 20, "pattern": r"BK-\d{1,2}", "subset": "Bat Kings"},
    {"key": "bat-kings-studio", "name": "Bat Kings Studio Series", "expected": 20, "pattern": r"BK-\d{1,2}", "subset": "Bat Kings Studio Series"},
    {"key": "jersey-kings", "name": "Jersey Kings", "expected": 20, "pattern": r"JK-\d{1,2}", "subset": "Jersey Kings"},
    {"key": "jersey-kings-studio", "name": "Jersey Kings Studio Series", "expected": 20, "pattern": r"JK-\d{1,2}", "subset": "Jersey Kings Studio Series"},
    {"key": "timber-and-threads", "name": "Timber and Threads", "expected": 50, "pattern": r"TT-\d{1,2}", "subset": "Timber and Threads"},
    {
        "key": "recollection-collection",
        "name": "Recollection Collection",
        "expected": 302,
        "pattern": r"(?:NNO|[A-Z]{0,5}-?\d{1,4}[A-Z]?)",
        "subset": "Recollection Collection",
        "sequence": True,
    },
]

EXPECTED_EXPLICIT = EXPECTED_BASE + sum(int(source["expected"]) for source in SOURCE_SPECS)


class RowParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.in_tr = False
        self.in_td = False
        self.row: list[str] = []
        self.cell: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "tr":
            self.in_tr = True
            self.row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.cell = []
        elif tag == "br" and self.in_td:
            self.cell.append(" ")

    def handle_data(self, data: str) -> None:
        if self.in_td:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "td" and self.in_td:
            self.row.append(" ".join("".join(self.cell).split()))
            self.in_td = False
            self.cell = []
        elif tag == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
            self.in_tr = False
            self.row = []


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.active_href: str | None = None
        self.active_text: list[str] = []
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "a":
            return
        attrs_dict = dict(attrs)
        href = attrs_dict.get("href")
        if not href:
            return
        if "sid/" not in href or not any(token in href for token in ("Checklist.cfm", "ViewSet.cfm")):
            return
        self.active_href = href
        self.active_text = []

    def handle_data(self, data: str) -> None:
        if self.active_href is not None:
            self.active_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self.active_href is None:
            return
        text = " ".join("".join(self.active_text).split()).strip()
        if text:
            self.links.append((text, self.active_href))
        self.active_href = None
        self.active_text = []


def fetch(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def page_url(url: str, page_index: int) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}PageIndex={page_index}"


def label_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def discover_source_urls() -> dict[str, str]:
    parser = LinkParser()
    parser.feed(fetch(INSERTS_URL))
    discovered: dict[str, str] = {}

    for text, href in parser.links:
        key = label_key(text)
        url = urljoin("https://www.tcdb.com/", href.replace("&amp;", "&"))
        url = url.replace("ViewSet.cfm", "Checklist.cfm")
        discovered.setdefault(key, url)

    resolved: dict[str, str] = {}
    missing: list[str] = []
    for source in SOURCE_SPECS:
        name = str(source["name"])
        url = discovered.get(label_key(name))
        if not url:
            missing.append(name)
        else:
            resolved[str(source["key"])] = url

    if missing:
        visible = sorted(text for text, _href in parser.links)
        raise SystemExit(
            "Could not discover TCDB checklist URLs for: "
            f"{missing}. Insert-page links found include: {visible[:80]}"
        )

    return resolved


def parse_rows(html: str, number_pattern: str) -> list[tuple[str, str, str, list[str]]]:
    parser = RowParser()
    parser.feed(html)
    pattern = re.compile(rf"^(?:{number_pattern})$", re.IGNORECASE)
    found: list[tuple[str, str, str, list[str]]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            card_number = value.strip()
            if not pattern.fullmatch(card_number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[-1].strip() if i + 2 < len(vals) else ""
            extras = vals[i + 2 : -1] if i + 2 < len(vals) else []
            found.append((card_number.upper(), raw_name, team, extras))
            break

    return found


META_TOKEN = re.compile(
    r"\b(?:MEM|AU|AUTO|SN\d+|PR\d+|UER|ERR|COR|VAR|RDM|EXCH|SAM)\b",
    re.IGNORECASE,
)


def clean_player_and_variant(raw_name: str, extras: list[str] | None = None) -> tuple[str, str]:
    raw = " ".join(raw_name.split()).strip()
    variant_parts: list[str] = []

    mem_detail = re.search(r"\bMEM\s*:\s*([^;]+)$", raw, re.IGNORECASE)
    if mem_detail:
        variant_parts.append(f"MEM: {mem_detail.group(1).strip()}")
        raw = raw[: mem_detail.start()].strip(" ,;")

    for match in META_TOKEN.findall(raw):
        token = match.upper()
        variant_parts.append(token)

    raw = META_TOKEN.sub("", raw)
    raw = re.sub(r",\s*,", ",", raw)
    raw = re.sub(r"\s+,", ",", raw)
    raw = re.sub(r",\s*$", "", raw)

    # RC comes only from the dedicated TCDB rookie index. RR remains a legitimate
    # Donruss subset marker but does not imply true rookie status.
    raw = re.sub(r",?\s+RC\b", "", raw, flags=re.IGNORECASE).strip(" ,;")
    player = " ".join(raw.split()).strip(" ,;")

    for extra in extras or []:
        extra_clean = " ".join(extra.split()).strip()
        if extra_clean and extra_clean.lower() not in {"options", "add", "edit"}:
            variant_parts.append(extra_clean)

    if not player:
        raise SystemExit(f"Could not derive clean Player from {raw_name!r}")

    unique_variant = "; ".join(dict.fromkeys(part for part in variant_parts if part))
    return player, unique_variant


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    clean = " ".join(team.split()).strip()
    if not clean and not is_checklist_card(player, subset):
        raise SystemExit(f"{subset} #{card_number} {player} is missing team data")
    return clean


def base_subset(number: int, player: str) -> str:
    if 1 <= number <= 20 or re.search(r"\bDK\b", player):
        return "Diamond Kings"
    if 21 <= number <= 70 or re.search(r"\bRR\b", player):
        return "Rated Rookies"
    return ""


def load_true_rc_numbers() -> set[str]:
    print("rookie-index:")
    rows = parse_rows(fetch(ROOKIES_URL), r"\d{1,3}")
    numbers = {number for number, _name, _team, _extras in rows}
    print(f"  parsed {len(rows)} records; {len(numbers)} unique true RC numbers")
    if len(numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            "TCDB rookie index changed for 2003 Donruss; "
            f"expected {EXPECTED_TRUE_RCS}, found {len(numbers)}: {sorted(numbers)}"
        )
    return numbers


def build_base_rows(true_rcs: set[str]) -> list[list[str]]:
    print("base:")
    grouped: dict[int, list[tuple[str, str, list[str]]]] = {}

    for page_index in range(1, 7):
        parsed = parse_rows(fetch(page_url(BASE_URL, page_index)), r"\d{1,3}[A-Za-z]?")
        before = len(grouped)
        for raw_number, raw_name, raw_team, extras in parsed:
            match = re.fullmatch(r"(\d{1,3})[A-Za-z]?", raw_number)
            if not match:
                continue
            number = int(match.group(1))
            if 1 <= number <= EXPECTED_BASE:
                grouped.setdefault(number, []).append((raw_name, raw_team, extras))

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(grouped) - before}; logical cards {len(grouped)}"
        )
        if len(grouped) == EXPECTED_BASE:
            break
        if page_index > 1 and not parsed:
            break

    required = set(range(1, EXPECTED_BASE + 1))
    if set(grouped) != required:
        missing = sorted(required - set(grouped))
        extra = sorted(set(grouped) - required)
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}, "
            f"found={len(grouped)} expected={EXPECTED_BASE}"
        )

    rows: list[list[str]] = []
    for number in range(1, EXPECTED_BASE + 1):
        versions = grouped[number]
        cleaned: list[tuple[str, str, str]] = []
        for raw_name, raw_team, extras in versions:
            player, variant = clean_player_and_variant(raw_name, extras)
            subset = base_subset(number, player)
            team = validate_team(str(number), player, raw_team, subset or "Base")
            cleaned.append((player, team, variant))

        subjects = {(player, team) for player, team, _variant in cleaned}
        if len(subjects) != 1:
            raise SystemExit(
                f"Base #{number} source variations resolve to different subjects/teams: {sorted(subjects)!r}"
            )

        player, team, variant = cleaned[0]
        if str(number) in true_rcs:
            player = f"{player} RC"
        rows.append(["base", str(number), player, team, base_subset(number, player), variant])

    return rows


def natural_number_key(value: str) -> tuple[str, int, str]:
    match = re.fullmatch(r"([A-Z]+-)?(\d+)([A-Z]?)", value.upper())
    if match:
        return (match.group(1) or "", int(match.group(2)), match.group(3) or "")
    return (value.upper(), 999999, "")


def fetch_source_rows(
    source: dict[str, object],
    url: str,
) -> list[tuple[str, str, str, list[str]]]:
    expected = int(source["expected"])
    pattern = str(source["pattern"])
    label = str(source["key"])
    sequence = bool(source.get("sequence", False))
    print(f"{label}:")

    records: list[tuple[str, str, str, list[str]]] = []
    seen_exact: set[tuple[str, str, str, tuple[str, ...]]] = set()
    seen_numbers: set[str] = set()

    max_pages = 8 if expected > 100 else 4
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), pattern)
        added = 0
        for number, raw_name, raw_team, extras in parsed:
            exact = (number, raw_name, raw_team, tuple(extras))
            if exact in seen_exact:
                continue
            seen_exact.add(exact)

            if not sequence and number in seen_numbers:
                # Ordinary insert sets may expose print/error variations for the same
                # logical card. Keep one logical card and validate subject consistency later.
                records.append((number, raw_name, raw_team, extras))
                added += 1
                continue

            records.append((number, raw_name, raw_team, extras))
            seen_numbers.add(number)
            added += 1

        logical_count = len(records) if sequence else len({row[0] for row in records})
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; +{added}; "
            f"logical records {logical_count}"
        )
        if logical_count >= expected:
            break
        if page_index > 1 and (not parsed or added == 0):
            break

    logical_count = len(records) if sequence else len({row[0] for row in records})
    if logical_count != expected:
        raise SystemExit(
            f"{label}: expected {expected} logical records, found {logical_count}; source={url}"
        )
    return records


def build_standard_insert(source: dict[str, object], url: str) -> list[list[str]]:
    key = str(source["key"])
    subset = str(source["subset"])
    expected = int(source["expected"])
    records = fetch_source_rows(source, url)

    grouped: dict[str, list[tuple[str, str, list[str]]]] = {}
    for number, raw_name, raw_team, extras in records:
        grouped.setdefault(number, []).append((raw_name, raw_team, extras))

    if len(grouped) != expected:
        raise SystemExit(f"{key}: expected {expected} unique card numbers, found {len(grouped)}")

    rows: list[list[str]] = []
    for number in sorted(grouped, key=natural_number_key):
        versions = grouped[number]
        cleaned: list[tuple[str, str, str]] = []
        for raw_name, raw_team, extras in versions:
            player, variant = clean_player_and_variant(raw_name, extras)
            team = validate_team(number, player, raw_team, subset)
            cleaned.append((player, team, variant))

        subjects = {(player, team) for player, team, _variant in cleaned}
        if len(subjects) != 1:
            raise SystemExit(
                f"{key} #{number}: source variations resolve to different subjects/teams: {sorted(subjects)!r}"
            )

        # Prefer the richest variant metadata among otherwise identical logical versions.
        player, team, variant = max(cleaned, key=lambda item: len(item[2]))
        rows.append([key, number, player, team, subset, variant])

    return rows


def build_recollection(source: dict[str, object], url: str) -> list[list[str]]:
    records = fetch_source_rows(source, url)
    subset = str(source["subset"])

    normalized: list[tuple[str, str, str, str]] = []
    for physical_number, raw_name, raw_team, extras in records:
        player, variant = clean_player_and_variant(raw_name, extras)
        team = validate_team(physical_number, player, raw_team, subset)
        details = [f"Physical #{physical_number}", "AU"]
        if variant:
            details.append(variant)
        normalized.append((physical_number, player, team, "; ".join(dict.fromkeys(details))))

    normalized.sort(key=lambda row: (natural_number_key(row[0]), row[1].lower(), row[2].lower(), row[3]))

    rows: list[list[str]] = []
    for index, (_physical_number, player, team, variant) in enumerate(normalized, start=1):
        rows.append([
            "recollection-collection",
            f"RC-{index:03d}",
            player,
            team,
            subset,
            variant,
        ])
    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    source_urls = discover_source_urls()

    all_rows = build_base_rows(true_rcs)
    counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCE_SPECS:
        key = str(source["key"])
        url = source_urls[key]
        rows = (
            build_recollection(source, url)
            if bool(source.get("sequence", False))
            else build_standard_insert(source, url)
        )
        all_rows.extend(rows)
        counts[key] = len(rows)

    if len(all_rows) != EXPECTED_EXPLICIT:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT} explicit CSV rows, found {len(all_rows)}"
        )

    rc_rows = [row for row in all_rows if row[2].endswith(" RC")]
    if rc_rows:
        raise SystemExit(f"TCDB currently recognizes zero base RCs; unexpected RC labels: {rc_rows[:8]}")

    keys = {(row[0], row[1]) for row in all_rows}
    if len(keys) != len(all_rows):
        raise SystemExit("Duplicate ProductSet/cardNumber key detected")

    dirty_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:MEM|AU|AUTO|SN\d+|PR\d+|UER|ERR|COR|VAR|RDM|EXCH|SAM)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if dirty_players:
        raise SystemExit(f"Collector metadata leaked into Player: {dirty_players[:8]}")

    odds_leaks = [row for row in all_rows if re.search(r"\b1\s*:\s*\d+\b", row[5] or "")]
    if odds_leaks:
        raise SystemExit(f"Card-level odds leaked into Variant: {odds_leaks[:5]}")

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip() and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(f"Unexpected missing team data: {missing_teams[:8]}")

    lookup = {(row[0], row[1]): row for row in all_rows}
    spot_checks = {
        ("base", "1"): ("Vladimir Guerrero DK", "Montreal Expos"),
        ("base", "32"): ("Jake Peavy RR", "San Diego Padres"),
        ("anniversary-1983", "1"): ("Dale Murphy", "Atlanta Braves"),
        ("elite-series", "ES-2"): ("Barry Bonds", "San Francisco Giants"),
        ("production-line", "PL-4"): ("Barry Bonds", "San Francisco Giants"),
        ("longball-leaders", "LL-4"): ("Jim Thome", "Cleveland Indians"),
        ("all-stars", "NL-6"): ("Barry Bonds", "San Francisco Giants"),
    }
    for key, (expected_player, expected_team) in spot_checks.items():
        row = lookup.get(key)
        if not row or row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )

    if "SN206" not in lookup[("stat-line-career", "1")][5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {lookup[(\"stat-line-career\", \"1\")]}")
    if "SN111" not in lookup[("stat-line-season", "1")][5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {lookup[(\"stat-line-season\", \"1\")]}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 2003 DONRUSS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Base cards: {counts['base']}")
    print("Verified true RC cards: 0 (TCDB currently flags none for sid 1603)")
    for source in SOURCE_SPECS:
        key = str(source["key"])
        print(f"{key}: {counts[key]}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_EXPLICIT}")
    print("Pack configuration: 13 cards per pack, 24 packs per box")


if __name__ == "__main__":
    main()
