from pathlib import Path

path = Path(__file__).with_name("generate-2003-donruss-baseball.py")
source = path.read_text(encoding="utf-8")
changed = False

old_syntax = '''    if "SN206" not in lookup[("stat-line-career", "1")][5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {lookup[(\\\"stat-line-career\\\", \\\"1\\\")]}")
    if "SN111" not in lookup[("stat-line-season", "1")][5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {lookup[(\\\"stat-line-season\\\", \\\"1\\\")]}")
'''

new_syntax = '''    career_one = lookup[("stat-line-career", "1")]
    if "SN206" not in career_one[5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {career_one}")

    season_one = lookup[("stat-line-season", "1")]
    if "SN111" not in season_one[5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {season_one}")
'''

if old_syntax in source:
    source = source.replace(old_syntax, new_syntax)
    changed = True
    print("Patched 2003 Donruss generator Stat Line audit syntax.")
elif new_syntax in source:
    print("2003 Donruss generator Stat Line audit already patched.")
else:
    raise SystemExit("Expected Stat Line audit block not found; refusing to modify generator.")

old_team = '''def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    clean = " ".join(team.split()).strip()
    if not clean and not is_checklist_card(player, subset):
        raise SystemExit(f"{subset} #{card_number} {player} is missing team data")
    return clean
'''

new_team = '''CHICKEN_TEAM_ALIASES = {
    "the chicken",
    "the san diego chicken",
    "san diego chicken",
    "the famous chicken",
    "famous chicken",
    "the famous san diego chicken",
}


def normalized_subject_for_team_override(player: str) -> str:
    value = re.sub(r"\\bMAS\\b", "", player, flags=re.IGNORECASE)
    return " ".join(value.lower().split()).strip(" ,;")


def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    clean = " ".join(team.split()).strip()
    if clean:
        return clean

    # TCDB identifies The Chicken / San Diego Chicken as the independent mascot
    # associated with San Diego, and its team-filtered gallery places the 2003
    # Donruss Anniversary #19 card under the San Diego Padres. Preserve that
    # source-backed association rather than weakening missing-team validation.
    if normalized_subject_for_team_override(player) in CHICKEN_TEAM_ALIASES:
        return "San Diego Padres"

    if not is_checklist_card(player, subset):
        raise SystemExit(f"{subset} #{card_number} {player} is missing team data")
    return clean
'''

if old_team in source:
    source = source.replace(old_team, new_team)
    changed = True
    print("Added source-backed San Diego Chicken team override.")
elif new_team in source:
    print("San Diego Chicken team override already present.")
else:
    raise SystemExit("Expected validate_team block not found; refusing to modify generator.")

old_spot = '''        ("anniversary-1983", "1"): ("Dale Murphy", "Atlanta Braves"),
'''
new_spot = '''        ("anniversary-1983", "1"): ("Dale Murphy", "Atlanta Braves"),
        ("anniversary-1983", "19"): ("The Chicken MAS", "San Diego Padres"),
'''

if old_spot in source and new_spot not in source:
    source = source.replace(old_spot, new_spot)
    changed = True
    print("Added Anniversary 1983 #19 Chicken spot check.")
elif new_spot in source:
    print("Anniversary 1983 #19 Chicken spot check already present.")
else:
    raise SystemExit("Expected Anniversary 1983 spot-check anchor not found; refusing to modify generator.")

old_recollection = '''        for number, raw_name, raw_team, extras in parsed:
            exact = (number, raw_name, raw_team, tuple(extras))
            if exact in seen_exact:
                continue
            seen_exact.add(exact)
'''

new_recollection = '''        for number, raw_name, raw_team, extras in parsed:
            if sequence:
                # Recollection Collection consists specifically of autographed,
                # serial-numbered buybacks. TCDB's generic HTML tables can expose
                # number-like navigation/stat rows; require the defining AU + SN
                # metadata so those UI rows never become logical cards.
                source_text = " ".join([raw_name, *extras])
                if not re.search(r"\\bAU\\b", source_text, re.IGNORECASE) or not re.search(
                    r"\\bSN\\d+\\b", source_text, re.IGNORECASE
                ):
                    print(
                        f"    skipping non-Recollection row: "
                        f"number={number!r} name={raw_name!r} extras={extras!r}"
                    )
                    continue

            exact = (number, raw_name, raw_team, tuple(extras))
            if exact in seen_exact:
                continue
            seen_exact.add(exact)
'''

if old_recollection in source:
    source = source.replace(old_recollection, new_recollection)
    changed = True
    print("Added strict AU + SN filtering for Recollection Collection rows.")
elif new_recollection in source:
    print("Recollection Collection AU + SN filtering already present.")
else:
    raise SystemExit("Expected Recollection fetch loop not found; refusing to modify generator.")

old_imports = '''import csv
import re
import urllib.request
'''
new_imports = '''import csv
import hashlib
import re
import time
import urllib.error
import urllib.request
'''

if old_imports in source:
    source = source.replace(old_imports, new_imports)
    changed = True
    print("Added rate-limit/cache imports.")
elif new_imports in source:
    print("Rate-limit/cache imports already present.")
else:
    raise SystemExit("Expected generator import block not found; refusing to modify generator.")

old_fetch = '''def fetch(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")
'''

new_fetch = '''TCDB_CACHE_DIR = Path("/tmp/vcs-set-factory-tcdb-cache/2003-donruss")
TCDB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
LAST_NETWORK_REQUEST_AT = 0.0
MIN_REQUEST_INTERVAL_SECONDS = 1.25


def fetch(url: str) -> str:
    global LAST_NETWORK_REQUEST_AT

    cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_path = TCDB_CACHE_DIR / f"{cache_key}.html"
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8", errors="replace")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )

    max_attempts = 7
    for attempt in range(1, max_attempts + 1):
        elapsed = time.monotonic() - LAST_NETWORK_REQUEST_AT
        if elapsed < MIN_REQUEST_INTERVAL_SECONDS:
            time.sleep(MIN_REQUEST_INTERVAL_SECONDS - elapsed)

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                LAST_NETWORK_REQUEST_AT = time.monotonic()
                body = response.read().decode("utf-8", errors="replace")
                cache_path.write_text(body, encoding="utf-8")
                return body
        except urllib.error.HTTPError as exc:
            LAST_NETWORK_REQUEST_AT = time.monotonic()
            if exc.code not in {429, 503} or attempt == max_attempts:
                raise

            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            try:
                server_wait = float(retry_after) if retry_after else 0.0
            except (TypeError, ValueError):
                server_wait = 0.0

            backoff = min(60.0, 5.0 * (2 ** (attempt - 1)))
            delay = max(server_wait, backoff)
            print(
                f"  TCDB returned HTTP {exc.code}; retry {attempt}/{max_attempts} "
                f"after rate-limit backoff."
            )
            time.sleep(delay)

    raise RuntimeError(f"TCDB fetch exhausted retries for {url}")
'''

if old_fetch in source:
    source = source.replace(old_fetch, new_fetch)
    changed = True
    print("Added TCDB pacing, retry/backoff, and local response caching.")
elif new_fetch in source:
    print("TCDB pacing/retry/cache already present.")
else:
    raise SystemExit("Expected generator fetch() block not found; refusing to modify generator.")

old_sequence_count = '''    logical_count = len(records) if sequence else len({row[0] for row in records})
    if logical_count != expected:
        raise SystemExit(
            f"{label}: expected {expected} logical records, found {logical_count}; source={url}"
        )
    return records
'''

new_sequence_count = '''    if sequence and len(records) > expected:
        # TCDB reports 302 Recollection cards, but its paginated HTML currently
        # exposes one extra valid-looking row. Collapse only rows that resolve to
        # the same original buyback identity: physical card number + cleaned
        # subject + team + original source release. This preserves genuine
        # distinctions such as Black Ink vs Blue Ink source releases.
        canonical: dict[tuple[str, str, str, tuple[str, ...]], tuple[str, str, str, list[str]]] = {}
        deduped: list[tuple[str, str, str, list[str]]] = []

        for record in records:
            number, raw_name, raw_team, extras = record
            player, _variant = clean_player_and_variant(raw_name, extras)
            normalized_team = " ".join(raw_team.lower().split())
            normalized_extras = [" ".join(extra.lower().split()) for extra in extras if extra.strip()]
            source_release = tuple(
                extra for extra in normalized_extras if re.match(r"^(?:19|20)\\d{2}\\b", extra)
            )
            if not source_release:
                source_release = tuple(normalized_extras)

            identity = (number.upper(), player.lower(), normalized_team, source_release)
            prior = canonical.get(identity)
            if prior is not None:
                print(
                    "    collapsing duplicate Recollection identity: "
                    f"kept={prior!r} dropped={record!r}"
                )
                continue

            canonical[identity] = record
            deduped.append(record)

        if len(deduped) != len(records):
            print(
                f"  Recollection identity dedupe: {len(records)} source rows -> "
                f"{len(deduped)} logical cards"
            )
            records = deduped

    logical_count = len(records) if sequence else len({row[0] for row in records})
    if logical_count != expected:
        if sequence and logical_count > expected:
            print("  Recollection rows still exceeding authoritative TCDB total:")
            for record in records[-12:]:
                print(f"    {record!r}")
        raise SystemExit(
            f"{label}: expected {expected} logical records, found {logical_count}; source={url}"
        )
    return records
'''

if old_sequence_count in source:
    source = source.replace(old_sequence_count, new_sequence_count)
    changed = True
    print("Added Recollection original-card identity deduplication.")
elif new_sequence_count in source:
    print("Recollection original-card identity deduplication already present.")
else:
    raise SystemExit("Expected Recollection logical-count block not found; refusing to modify generator.")

if changed:
    path.write_text(source, encoding="utf-8")
    print("2003 Donruss generator patch complete.")
else:
    print("2003 Donruss generator already fully patched.")