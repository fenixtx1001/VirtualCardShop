#!/usr/bin/env python3
"""Generate the fully audited 1994 Fleer Baseball Set Factory draft.

Offline by default from the committed source snapshot. --check compares the
committed CSV, --self-test tests the full checklist and corruption rejection,
and --refresh-sources re-fetches every required source before validation.
No database access; incomplete, conflicting or unexpected data fails closed.
"""
from __future__ import annotations
import argparse
import copy
import csv
import hashlib
import html
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'set-factory'
STEM = '1994-fleer-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 940
KNOWN_CLUBS = {
    "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
    "California Angels", "Chicago Cubs", "Chicago White Sox",
    "Cincinnati Reds", "Cleveland Indians", "Detroit Tigers",
    "Houston Astros", "Kansas City Royals", "Los Angeles Dodgers",
    "Milwaukee Brewers", "Minnesota Twins", "Montreal Expos",
    "New York Mets", "New York Yankees", "Oakland Athletics",
    "Philadelphia Phillies", "Pittsburgh Pirates", "St. Louis Cardinals",
    "San Diego Padres", "San Francisco Giants", "Seattle Mariners",
    "Texas Rangers", "Toronto Blue Jays",
    "Colorado Rockies", "Florida Marlins",
}
class Rows(HTMLParser):
    """Retain captions separately, including when source markup omits spaces."""

    def __init__(self, expected_sid=None):
        super().__init__()
        self.expected_sid = expected_sid
        self.card_sids = set()
        self.rows = []
        self.row = None
        self.cell = None
        self.caption = False
        self.link = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
            self.link = False
            self.card_sids = set()
        elif tag == 'td' and self.row is not None:
            self.cell = {'label': [], 'note': []}
        elif tag == 'figcaption' and self.cell is not None:
            self.caption = True
        elif tag == 'br' and self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(' ')
        elif tag == 'a' and self.row is not None:
            href = dict(attrs).get('href', '')
            if 'ViewCard.cfm' in href:
                self.link = True
                sid = re.search(r'/sid/(\d+)/', href)
                if sid:
                    self.card_sids.add(int(sid[1]))

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(data)

    def handle_endtag(self, tag):
        if tag == 'figcaption':
            self.caption = False
        elif tag == 'td' and self.cell is not None:
            self.row.append({k: ' '.join(''.join(v).split()) for k, v in self.cell.items()})
            self.cell = None
            self.caption = False
        elif tag == 'tr' and self.row is not None:
            if self.link:
                if self.expected_sid is not None and self.card_sids != {self.expected_sid}:
                    raise ValueError(f'Wrong source card-set namespace: {self.card_sids}; expected {self.expected_sid}')
                self.rows.append(self.row)
            self.row = None


NUM = re.compile(r'^(?:\d{1,3}[a-z]?|SS\d{1,2}|H\d|SP[12]|HH1|NNO)$', re.I)


def parse(raw, expected_sid=None):
    parser = Rows(expected_sid=expected_sid)
    parser.feed(raw)
    out = []
    for row in parser.rows:
        cells = [c for c in row if c['label']]
        for i, cell in enumerate(cells):
            if NUM.fullmatch(cell['label']) and i + 1 < len(cells):
                label = cells[i + 1]
                rest = cells[i + 2:]
                if len(rest) > 1:
                    raise ValueError(f'Unexpected checklist columns: {rest}')
                out.append([cell['label'].upper(), label['label'],
                            rest[0]['label'] if rest else '', label['note']])
                break
    return out


TAGS = r'(?:RC|UER|ERR|COR|VAR|CL|SSS|AU|EXCH|RDM|LL|AS|SN\d+)'
TRAILING = re.compile(r'\s+(' + TAGS + r'(?:,?\s+' + TAGS + r')*)$', re.I)
SECTIONS = {
    'base': 'Base_Set', 'all-stars': 'All-Stars', 'award-winners': 'Award_Winners',
    'golden-moments': 'Golden_Moments', 'league-leaders': 'League_Leaders',
    'lumber-company': 'Lumber_Company', 'prospects': 'Major_League_Prospects',
    'pro-visions': 'Pro-Visions', 'rookie-sensations': 'Rookie_Sensations',
    'smoke-heat': "Smoke_'n_Heat", 'team-leaders': 'Team_Leaders',
    'tim-salmon': 'Tim_Salmon_A.L._Rookie_of_the_Year', 'redemption': 'All-Rookie_Team',
}
EXPECTED_COUNTS = {'base': 720, 'all-stars': 50, 'award-winners': 6,
    'golden-moments': 10, 'league-leaders': 12, 'lumber-company': 10,
    'prospects': 35, 'pro-visions': 9, 'rookie-sensations': 20, 'smoke-heat': 12,
    'team-leaders': 28, 'tim-salmon': 15, 'tim-salmon-auto': 12, 'redemption': 1}
EXPECTED_ODDS = {'base': None, 'all-stars': 2, 'award-winners': 37,
    'golden-moments': None, 'league-leaders': 17, 'lumber-company': None,
    'prospects': 6, 'pro-visions': 12, 'rookie-sensations': None, 'smoke-heat': 30,
    'team-leaders': 6, 'tim-salmon': 30, 'tim-salmon-auto': None, 'redemption': 200}
ROOKIES = {'62', '289', '297', '299', '415', '430', '544', '617', '669'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def split_label(label):
    label = ' '.join(label.split())
    match = TRAILING.search(label)
    if not match:
        return label, set()
    return label[:match.start()], set(re.split(r',?\s+', match[1].upper()))


def clean_name(label):
    return split_label(label)[0]


def is_team(value):
    return bool(value) and all(t in KNOWN_CLUBS for t in value.split(' / '))


def is_checklist(player, subset=''):
    return 'checklist' in (player + ' ' + subset).lower()


def independent_rows(raw, key):
    part = raw[raw.index('id="' + SECTIONS[key] + '"'):]
    if key == 'base':
        part = part[:part.index('id="Inserts"')]
    else:
        boundary = re.search('<h[23]', part)
        if boundary:
            part = part[:boundary.start()]
    return [html.unescape(re.sub('<[^>]+>', '', x)).strip()
            for x in re.findall(r'<li>(.*?)</li>', part, re.S)]


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; VCS checklist audit)'})
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.read().decode('utf-8', 'replace')
    except Exception as exc:
        raise RuntimeError(f'Source retrieval failed: {url}: {exc}; no partial CSV written') from exc


def refresh_sources(snapshot):
    changed = copy.deepcopy(snapshot)
    cache = {}
    for key, entry in changed['sources'].items():
        url = entry['url'].split('#', 1)[0]
        # BasicID is a set-specific TCDB identifier; reusing another product's
        # BasicID can return that product's rows under a different page header.
        require('BasicID=' not in url, 'Do not reuse an unverified BasicID filter')
        if url not in cache:
            cache[url] = fetch(url)
        raw = cache[url]
        if key.startswith('bcp-'):
            records = independent_rows(raw, key.removeprefix('bcp-'))
        else:
            sid = int(re.search(r'/sid/(\d+)/', url)[1])
            records = parse(raw, expected_sid=sid)
        entry['records'] = records
        entry['sha256'] = hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(records)} source records', flush=True)
    changed['retrievedAt'] = datetime.now(timezone.utc).date().isoformat()
    return changed


def records(snapshot, key):
    entry = snapshot['sources'][key]
    require(entry['url'].startswith('https://'), f'Missing source URL: {key}')
    require(re.fullmatch(r'[a-f0-9]{64}', entry['sha256']) is not None, f'Missing raw-source hash: {key}')
    return entry['records']


def row_for(key, number, label, team, note='', rookie=False):
    name, tags = split_label(label)
    subset = ''
    notes = [note] if note else []
    if key == 'base':
        n = int(number)
        if 706 <= n <= 713:
            require('SSS' in tags, f'Superstar Specials source tag missing: #{number}')
            subset = 'Superstar Specials'
        elif 714 <= n <= 720:
            require('CL' in tags and name.startswith('Checklist: '), f'Checklist tag/range missing: #{number}')
            subset = 'Checklist'
            notes.append(name.removeprefix('Checklist: '))
            name = 'Checklist'
        if n in (34, 442, 448):
            # Independently published full collector names disambiguate TCDB's
            # shortened labels. Do not infer middle initials from team alone.
            expected, full = {34: ('Greg Harris', 'Greg A. Harris'), 442: ('Greg Harris', 'Greg W. Harris'), 448: ('J. Owens', 'Jayhawk Owens')}[n]
            require(name == expected, f'Name override source changed: #{number}')
            name = full
        if n == 669:
            notes.append('San Diego Padres pitcher; distinct from Dodgers Pedro Martinez #515')
    elif key == 'tim-salmon' and int(number) >= 13:
        require('EXCH' in tags, f'Missing exchange marker: #{number}')
        notes.append('Historically wrapper mail-in exchange only; VCS availability flattened within full checklist')
    elif key == 'tim-salmon-auto':
        require(tags == {'AU'}, f'Unexpected autograph/serial source tags: {label}')
        notes.append('Autograph; embossed Fleer Mark of Authenticity')
    elif key == 'redemption':
        require('RDM' in tags and name == 'All-Rookie Team Exchange Card', 'Unexpected redemption subject')
        notes.append('Physical redemption card; expired September 30, 1994; no automated redemption')
    if rookie:
        name += ' RC'
    require(name and not re.search(r'\b(?:UER|ERR|COR|VAR|SSS|AU|EXCH|RDM|SN\d+)\b', name), f'Annotation in subject: {name}')
    require(not team or is_team(team), f'Invalid historical team: {key} #{number}: {team}')
    require(team or is_checklist(name, subset) or (key, number) == ('redemption', 'NNO'), f'Missing player team: {key} #{number}')
    return [key, number, name, team, subset, '; '.join(dict.fromkeys(notes))]


def normalized(name):
    aliases = {'Dave Justice': 'David Justice', 'Dave West': 'David West',
               'Danny Miceli': 'Dan Miceli', 'Pedro A. Martinez': 'Pedro Martinez',
               'Bill Swift': 'Billy Swift', 'Manuel Lee': 'Manny Lee', 'Gene Petralli': 'Geno Petralli'}
    name = aliases.get(name, name)
    return re.sub(r'[^a-z0-9]', '', name.lower())


def independent_name(label):
    return re.split(r'\s+(?:UER|ERR|COR|RC|NNO|EXCH)\b', label, maxsplit=1)[0].strip()


def same_people(left, right):
    return sorted(normalized(n.strip()) for n in left.split(' / ')) == sorted(normalized(n.strip()) for n in right.split(' / '))


def verify_independent(snapshot, cards):
    by_key = {key: {r[1]: r for r in cards if r[0] == key} for key in EXPECTED_COUNTS}
    for key in SECTIONS:
        independent = records(snapshot, 'bcp-' + key)
        # M1-M9 are a separate returned mail-in checklist, not pack contents.
        if key == 'redemption':
            require(len(independent) == 10 and independent[-1].startswith('NNO '), 'Unreviewed redemption/returned-set scope')
            independent = [independent[-1]]
        require(len(independent) == EXPECTED_COUNTS[key], f'Independent count mismatch: {key}')
        seen = set()
        for line in independent:
            match = re.match(r'^(\d+|NNO)\s+(.+)$', line)
            require(bool(match), f'Unparsed independent label: {line}')
            number, label = match.groups()
            require(number not in seen and number in by_key[key], f'Independent ID mismatch: {key} #{number}')
            seen.add(number)
            actual = by_key[key][number][2].removesuffix(' RC')
            candidate = independent_name(label)
            if key == 'base' and int(number) >= 714:
                require('Checklist' in label and actual == 'Checklist', f'Checklist mismatch #{number}')
            elif key == 'redemption':
                require('Exch' in label and 'Exchange' in actual, 'Redemption identity mismatch')
            else:
                require(same_people(candidate, actual), f'Independent subject mismatch: {key} #{number}: {candidate!r} vs {actual!r}')
    # BCP describes the genuine Salmon autograph program, but does not list its
    # 12 numbers. Those exact AU IDs are verified directly at TCDB sid/307796;
    # BCP independently establishes the same subject/program/aggregate print run.
    bcp_rc = {line.split(' ', 1)[0] for line in records(snapshot, 'bcp-base') if re.search(r'\bRC\b', line)}
    require(ROOKIES - bcp_rc == {'62'} and not bcp_rc - ROOKIES, 'Independent rookie discrepancy changed')


def validate(bundle, cards):
    require(bundle['schemaVersion'] == 2 and bundle['status'] == 'DRAFT' and bundle['product']['released'] is False, 'Must stay an unreleased draft')
    require(bundle['product']['cardsPerPack'] == 15 and bundle['product']['packsPerBox'] == 36, 'Pack configuration changed')
    specs = bundle['productSets']
    require(len(specs) == 14 and {s['key'] for s in specs} == set(EXPECTED_COUNTS), 'Unexpected checklist inventory')
    require(len({s['id'] for s in specs}) == 14 and sum(s['kind'] == 'BASE' for s in specs) == 1, 'Invalid set IDs/kinds')
    require(len(cards) == len({(r[0], r[1]) for r in cards}) == TOTAL, 'Expected 940 unique card rows')
    for spec in specs:
        key = spec['key']
        require(spec['expectedCards'] == EXPECTED_COUNTS[key], f'Count expectation changed: {key}')
        require(spec.get('oddsPerPack') == EXPECTED_ODDS[key], f'Unreviewed pack odds: {key}')
        require(spec['kind'] == ('BASE' if key == 'base' else 'INSERT'), f'Wrong kind: {key}')
        rows = [r for r in cards if r[0] == key]
        ids = {'NNO'} if key == 'redemption' else {str(i) for i in range(1, EXPECTED_COUNTS[key] + 1)}
        require(len(rows) == len(ids) and {r[1] for r in rows} == ids, f'Incomplete/duplicate printed IDs: {key}')
    actual_rc = {r[1] for r in cards if r[0] == 'base' and r[2].endswith(' RC')}
    require(actual_rc == ROOKIES, 'True rookie designation mismatch')
    require(sum(r[4] == 'Superstar Specials' for r in cards) == 8 and sum(r[4] == 'Checklist' for r in cards) == 7, 'Base subset mismatch')
    base = {r[1]: r for r in cards if r[0] == 'base'}
    for n, name, team in [('1', 'Brady Anderson', 'Baltimore Orioles'), ('62', 'Phil Leftwich RC', 'California Angels'), ('119', 'Manny Ramirez', 'Cleveland Indians'), ('286', 'Ken Griffey Jr.', 'Seattle Mariners'), ('515', 'Pedro Martinez', 'Los Angeles Dodgers'), ('544', 'Brian Looney RC', 'Montreal Expos'), ('669', 'Pedro Martinez RC', 'San Diego Padres')]:
        require(base[n][2] == name and base[n][3] == team, f'Anchor identity/team failed: #{n}')
    require({(r[0], r[1]) for r in cards if not r[3]} == {('base', '720'), ('redemption', 'NNO')}, 'Unexpected missing teams')
    require(bundle['review']['teamData'] == 'PENDING', 'Generic exchange card requires pending-team staging')
    for row in cards:
        require(len(row) == 6 and all(isinstance(v, str) for v in row), 'Invalid CSV fields')
        require(row[0] == 'base' or not row[2].endswith(' RC'), 'Insert title incorrectly treated as a true RC')
        require(not re.search(r'\b1\s*:\s*\d+', row[5]), 'Set odds repeated in variant')
        require(not row[3] or is_team(row[3]), 'Invalid team')
        if row[0] == 'tim-salmon-auto':
            require(not re.search(r'\bSN\d+|/2000', row[5]), 'Aggregate autograph print run treated as serial numbering')


def assemble(bundle, snapshot):
    require(snapshot['schemaVersion'] == 1, 'Unexpected source snapshot format')
    base = [row for i in range(1, 9) for row in records(snapshot, f'base-{i}')]
    require(len(base) == 720 and {r[0] for r in base} == {str(i) for i in range(1, 721)}, 'Base retrieval is partial, duplicate or from wrong set')
    rookies = {n: (clean_name(label), team) for n, label, team, _ in records(snapshot, 'rookies-1')}
    require(len(records(snapshot, 'rookies-1')) == 9 and not records(snapshot, 'rookies-2'), 'Incomplete rookie index')
    require(set(rookies) == ROOKIES, 'Rookie index changed')
    source_rc = {n: (clean_name(label), team) for n, label, team, _ in base if 'RC' in split_label(label)[1]}
    require(source_rc == rookies, 'Base rookie identities/teams differ from rookie index')
    cards = []
    for spec in bundle['productSets']:
        key = spec['key']
        source = base if key == 'base' else records(snapshot, key)
        cards.extend(row_for(key, n, label, team, note, key == 'base' and n in rookies) for n, label, team, note in source)
    validate(bundle, cards)
    verify_independent(snapshot, cards)
    return cards


def self_test(bundle, snapshot):
    fixture = '<table><tr><td><a href="/ViewCard.cfm/sid/342/cid/1">280</a></td><td>Bret Boone UER<br><figcaption>UER: Brett on front</figcaption></td><td>Seattle Mariners</td></tr></table>'
    require(parse(fixture, expected_sid=342) == [['280', 'Bret Boone UER', 'Seattle Mariners', 'UER: Brett on front']], 'HTML parser caption handling failed')
    try:
        parse(fixture.replace('/sid/342/', '/sid/171/'), expected_sid=342)
    except ValueError:
        pass
    else:
        raise ValueError('Wrong source set IDs must be rejected, even under a matching page title')
    for raw, expected in [('Ken Boswell', 'Ken Boswell'), ('Ken Boswell LL', 'Ken Boswell'), ('Marshall', 'Marshall'), ('John Marshall LL', 'John Marshall'), ('Jim Hall', 'Jim Hall'), ('Jim Hall CL', 'Jim Hall'), ('Tim Salmon AU', 'Tim Salmon'), ('Bret Boone UER', 'Bret Boone')]:
        require(clean_name(raw) == expected, f'Trailing-token boundary failed: {raw}')
    assemble(bundle, snapshot)
    for label, mutate in [
        ('missing row', lambda s: s['sources']['base-1']['records'].pop()),
        ('wrong player', lambda s: s['sources']['base-1']['records'][0].__setitem__(1, 'Wrong Player')),
        ('wrong team', lambda s: s['sources']['base-1']['records'][0].__setitem__(2, 'Boston Red Sox')),
        ('missing team', lambda s: s['sources']['base-1']['records'][0].__setitem__(2, '')),
        ('false RC', lambda s: s['sources']['base-2']['records'][18].__setitem__(1, 'Manny Ramirez RC')),
        ('incomplete insert', lambda s: s['sources']['all-stars']['records'].pop()),
        ('false SN', lambda s: s['sources']['tim-salmon-auto']['records'][0].__setitem__(1, 'Tim Salmon AU, SN2000')),
    ]:
        changed = copy.deepcopy(snapshot)
        mutate(changed)
        try:
            assemble(bundle, changed)
        except (ValueError, KeyError):
            pass
        else:
            raise ValueError(f'Corruption test did not reject: {label}')
    print('PASS: full-source identity/rookie/subset audit, token boundaries, source-set identity and seven corruption tests')


def csv_text(cards):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(HEADER)
    writer.writerows(cards)
    return stream.getvalue()


def atomic_write(path, text):
    temporary = path.with_suffix(path.suffix + '.tmp')
    try:
        temporary.write_text(text, encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--refresh-sources', action='store_true')
    args = parser.parse_args()
    bundle = json.loads(BUNDLE.read_text())
    snapshot = json.loads(SOURCE.read_text())
    if args.refresh_sources:
        snapshot = refresh_sources(snapshot)
    self_test(bundle, snapshot)
    cards = assemble(bundle, snapshot)
    text = csv_text(cards)
    if args.check:
        require(OUT.read_text() == text, 'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:
            atomic_write(SOURCE, json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
        atomic_write(OUT, text)
    print(f'PASS: {len(cards)} verified cards / {len(bundle["productSets"])} collector sets / 9 true RCs; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
