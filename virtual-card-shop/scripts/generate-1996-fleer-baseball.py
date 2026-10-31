#!/usr/bin/env python3
"""Generate the fully audited 1996 Fleer Baseball Set Factory draft.

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
STEM = '1996-fleer-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1333
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


TAGS = r'(?:RC|UER|ERR|COR|VAR|CL|AU|LL|AS|SN\d+)'
TRAILING = re.compile(r'\s+(' + TAGS + r'(?:,?\s+' + TAGS + r')*)$', re.I)
SECTIONS = {"base": "Base_Set", "checklists": "Checklists", "golden-memories": "Golden_Memories", "lumber-company": "Lumber_Company", "postseason-glory": "Postseason_Glory", "prospects": "Prospects", "road-warriors": "Road_Warriors", "rookie-sensations": "Rookie_Sensations", "smoke-heat": "Smoke_'n_Heat", "team-leaders": "Team_Leaders", "tomorrows-legends": "Tomorrow's_Legends", "zone": "Zone"}
EXPECTED_COUNTS = {'base': 600, 'tiffany': 600, 'checklists': 10, 'golden-memories': 10, 'lumber-company': 12, 'postseason-glory': 5, 'prospects': 10, 'road-warriors': 10, 'rookie-sensations': 15, 'smoke-heat': 10, 'team-leaders': 28, 'game-card': 1, 'tomorrows-legends': 10, 'zone': 12}
EXPECTED_ODDS = {'base': None, 'tiffany': 1, 'checklists': 6, 'golden-memories': 10, 'lumber-company': None, 'postseason-glory': 5, 'prospects': 6, 'road-warriors': 13, 'rookie-sensations': 11, 'smoke-heat': 9, 'team-leaders': 9, 'game-card': 1, 'tomorrows-legends': 13, 'zone': 90}
ROOKIES = {'62','69','76','138','167','212','223','279','282','317','409','423','429','467','519','531','582','584'}

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
        part = part[:part.index('id="Parallels"')]
    else:
        boundary = re.search(r'<h[23](?:\s|>)', part)
        if boundary:
            part = part[:boundary.start()]
    rows = [html.unescape(re.sub('<[^>]+>', '', x)).strip() for x in re.findall(r'<li>(.*?)</li>', part, re.S)]
    return [r for r in rows if re.match(r'^\d+\s+', r)]


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



def canonical_tiffany(snapshot):
    raw = [r for page in range(1, 8) for r in records(snapshot, f'tiffany-{page}')]
    require(len(raw) == 601, f'Tiffany source incomplete/unreviewed: {len(raw)} rows')
    variants = [r for r in raw if r[0] == '267B']
    require(variants == [['267B', 'Roberto Alomar VAR', 'Toronto Blue Jays', 'Gold Foil']], 'Tiffany printing-variation scope changed')
    rows = [r for r in raw if r[0] != '267B']
    require(len(rows) == 600 and {r[0] for r in rows} == {str(i) for i in range(1, 601)}, 'Tiffany must contain each canonical number 1..600')
    return rows


def row_for(key, number, label, team, note='', rookie=False):
    name, tags = split_label(label)
    subset = 'Checklist' if key == 'checklists' else ''
    notes = [note] if note else []
    if key == 'checklists':
        require('CL' in tags, f'Missing source checklist tag: #{number}')
    elif key == 'game-card':
        require(number == 'NNO' and name == 'Thanks A Million! Official Game Card' and not team, 'Unexpected game-card identity')
        notes.append('Physical scratch-off promotion token; no active prize or redemption mechanic')
    if key == 'base' and number == '120':
        notes.append('RC designation disputed: BCP marks RC; TCDB canonical/index and Keyman do not; pending review')
    if key == 'tiffany':
        require('RC' not in tags, f'Unexpected Tiffany true-RC source tag: #{number}')
    if rookie:
        name += ' RC'
    require(name and not re.search(r'\b(?:UER|ERR|COR|VAR|AU|SN\d+)\b', name), f'Dirty player/subject: {name}')
    require(not team or is_team(team), f'Unknown historical team: {key} #{number} {team}')
    require(team or is_checklist(name, subset) or (key, number) == ('game-card', 'NNO'), f'Missing team: {key} #{number}')
    return [key, number, name, team, subset, '; '.join(dict.fromkeys(notes))]


def normalized(name):
    aliases = {'Javy Lopez': 'Javier Lopez', 'Curtis Leskanic': 'Curt Leskanic', 'Brian L. Hunter': 'Brian Hunter', 'Dave Justice': 'David Justice',
               'Dave Nilsson': 'David Nilsson', 'Wil Cordero': 'Wilfredo Cordero',
               'Bob Higginson': 'Bobby Higginson', 'Billy Ashley': 'Billy Ashley',
               'William VanLandingham': 'William Van Landingham'}
    name = aliases.get(name, name)
    return re.sub(r'[^a-z0-9]', '', name.lower())


def independent_name(label):
    return re.split(r'\s+(?:UER|ERR|COR|RC|VAR)\b', label, maxsplit=1)[0].strip()


def same_people(left, right):
    return sorted(normalized(n.strip()) for n in left.split(' / ')) == sorted(normalized(n.strip()) for n in right.split(' / '))


def verify_independent(snapshot, cards):
    by_key = {key: {r[1]: r for r in cards if r[0] == key} for key in EXPECTED_COUNTS}
    for key in SECTIONS:
        source = records(snapshot, 'bcp-' + key)
        require(len(source) == EXPECTED_COUNTS[key], f'Independent count mismatch: {key}')
        seen = set()
        for label in source:
            match = re.match(r'^(\d+)\s+(.+)$', label)
            require(bool(match), f'Unparsed independent source row: {label}')
            number, raw = match.groups()
            require(number in by_key[key] and number not in seen, f'Independent ID mismatch: {key} #{number}')
            seen.add(number)
            actual = by_key[key][number][2].removesuffix(' RC')
            candidate = independent_name(raw)
            require(same_people(candidate, actual), f'Independent subject mismatch: {key} #{number}: {candidate!r} vs {actual!r}')
    # Every one of the 600 Tiffany identities/teams is independently retrieved
    # from its own TCDB namespace, then compared with the full base checklist.
    # No true RC suffix is inferred from a different issue.
    for number, row in by_key['tiffany'].items():
        base = by_key['base'][number]
        require(same_people(row[2], base[2].removesuffix(' RC')) and row[3] == base[3], f'Tiffany/base identity or team mismatch #{number}')
    bcp_rc = {r.split(' ', 1)[0] for r in records(snapshot, 'bcp-base') if re.search(r'\bRC\b', r)}
    require(ROOKIES - bcp_rc == {'62', '282', '317', '409'} and bcp_rc - ROOKIES == {'120'}, 'RC source disagreement changed; re-review required')


def validate(bundle, cards):
    require(bundle['schemaVersion'] == 2 and bundle['status'] == 'DRAFT' and bundle['product']['released'] is False, 'Product must remain an unreleased draft')
    require(bundle['product']['cardsPerPack'] == 12 and bundle['product']['packsPerBox'] == 36, 'Pack item model changed')
    require(bundle['review']['teamData'] == 'PENDING', 'Generic game token needs pending-team staging')
    require(bundle['review']['rookieDesignation'] == 'PENDING_120_SOURCE_DISAGREEMENT', 'Do not conceal disputed #120 RC designation')
    specs = bundle['productSets']
    require(len(specs) == 14 and len({s['id'] for s in specs}) == 14 and {s['key'] for s in specs} == set(EXPECTED_COUNTS), 'Invalid ProductSet inventory/IDs')
    require(len(cards) == len({(r[0], r[1]) for r in cards}) == TOTAL, 'Expected 1333 unique explicit rows')
    for spec in specs:
        key = spec['key']
        require(spec['expectedCards'] == EXPECTED_COUNTS[key] and spec.get('oddsPerPack') == EXPECTED_ODDS[key], f'Unreviewed count/odds: {key}')
        require(spec['kind'] == ('BASE' if key == 'base' else 'PARALLEL' if key == 'tiffany' else 'INSERT'), f'Wrong set kind: {key}')
        rows = [r for r in cards if r[0] == key]
        expected = {'NNO'} if key == 'game-card' else {str(i) for i in range(1, spec['expectedCards'] + 1)}
        require(len(rows) == len(expected) and {r[1] for r in rows} == expected, f'Missing or duplicate IDs: {key}')
    base = {r[1]: r for r in cards if r[0] == 'base'}
    for number, name, team in [('1','Manny Alexander','Baltimore Orioles'),('69','Matt Karchner RC','Chicago White Sox'),('120','Clint Sodowsky','Detroit Tigers'),('138','Mike Sweeney RC','Kansas City Royals'),('167','Matt Lawton RC','Minnesota Twins'),('184','Derek Jeter','New York Yankees'),('600','Matt Williams','San Francisco Giants')]:
        require(base[number][2] == name and base[number][3] == team, f'Identity/RC/team anchor mismatch #{number}')
    require({r[1] for r in cards if r[0] == 'base' and r[2].endswith(' RC')} == ROOKIES, 'Confirmed base RC audit failed')
    require(sum(r[2].endswith(' RC') for r in cards) == 18, 'RC status inferred for parallel/insert')
    require(sum(r[4] == 'Checklist' for r in cards) == 10, 'Checklist subset count failed')
    require({(r[0], r[1]) for r in cards if not r[3]} == {('game-card','NNO')}, 'Unexpected missing team')
    for row in cards:
        require(len(row) == 6 and all(isinstance(v, str) for v in row), 'Invalid CSV fields')
        require(not row[3] or is_team(row[3]), 'Unknown team')
        require(not re.search(r'\b1\s*:\s*\d+', row[5]), 'Set odds leaked into card variant')


def assemble(bundle, snapshot):
    require(snapshot['schemaVersion'] == 1, 'Unexpected source schema')
    base = [r for page in range(1, 8) for r in records(snapshot, f'base-{page}')]
    require(len(base) == 600 and {r[0] for r in base} == {str(i) for i in range(1,601)} and not records(snapshot,'base-7'), 'Incomplete/duplicate base retrieval')
    rookies = {n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies-1')}
    require(len(records(snapshot,'rookies-1')) == 18 and not records(snapshot,'rookies-2') and set(rookies) == ROOKIES, 'Incomplete or changed rookie index')
    base_rc = {n:(clean_name(label),team) for n,label,team,_ in base if 'RC' in split_label(label)[1]}
    require(base_rc == rookies, 'Canonical base and independent rookie-index identities/teams disagree')
    tiffany = canonical_tiffany(snapshot)
    cards = []
    for spec in bundle['productSets']:
        key = spec['key']
        source = base if key == 'base' else tiffany if key == 'tiffany' else records(snapshot,key)
        cards.extend(row_for(key,n,label,team,note,key == 'base' and n in rookies) for n,label,team,note in source)
    validate(bundle,cards)
    verify_independent(snapshot,cards)
    return cards


def self_test(bundle, snapshot):
    fixture = '<table><tr><td><a href="/ViewCard.cfm/sid/677/cid/1">220</a></td><td>Danny Tartabull UER<br><figcaption>UER: birthplace</figcaption></td><td>Oakland Athletics</td></tr></table>'
    require(parse(fixture, expected_sid=677) == [['220','Danny Tartabull UER','Oakland Athletics','UER: birthplace']], 'Caption parsing regression')
    try:
        parse(fixture.replace('/sid/677/','/sid/342/'), expected_sid=677)
    except ValueError:
        pass
    else:
        raise ValueError('Wrong source namespace was accepted')
    for raw, expected in [('Ken Boswell','Ken Boswell'),('Ken Boswell LL','Ken Boswell'),('Marshall','Marshall'),('John Marshall LL','John Marshall'),('Jim Hall','Jim Hall'),('Jim Hall CL','Jim Hall'),('Matt Lawton RC','Matt Lawton'),('Danny Tartabull UER','Danny Tartabull')]:
        require(clean_name(raw) == expected, f'Trailing token boundary failed: {raw}')
    assemble(bundle,snapshot)
    cases = [
        ('missing base',lambda s:s['sources']['base-1']['records'].pop()),
        ('wrong subject',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong known team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'Boston Red Sox')),
        ('missing team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),
        ('unverified RC',lambda s:s['sources']['base-2']['records'][19].__setitem__(1,'Clint Sodowsky RC')),
        ('missing Zone card',lambda s:s['sources']['zone']['records'].pop()),
        ('bad Tiffany identity',lambda s:s['sources']['tiffany-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('missing Tiffany row',lambda s:s['sources']['tiffany-1']['records'].pop()),
        ('unreviewed foil variant',lambda s:s['sources']['tiffany-3']['records'].append(['299B','Greg Maddux VAR','Atlanta Braves','Gold Foil'])),
    ]
    for label,mutate in cases:
        changed = copy.deepcopy(snapshot)
        mutate(changed)
        try:
            assemble(bundle,changed)
        except (ValueError,KeyError):
            pass
        else:
            raise ValueError(f'Corruption test did not fail: {label}')
    print('PASS: complete source/parallel/RC audit, parser, token boundaries, source namespace and nine corruption tests')


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
    print(f'PASS: {len(cards)} verified cards / {len(bundle["productSets"])} collector sets / 18 confirmed base RCs; #120 RC disputed; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
