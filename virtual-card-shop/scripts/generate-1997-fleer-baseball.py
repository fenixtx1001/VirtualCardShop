#!/usr/bin/env python3
"""Generate the fully audited 1997 Fleer Baseball Set Factory draft.

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
STEM = '1997-fleer-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1851
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
    "Colorado Rockies", "Florida Marlins", "Anaheim Angels",
    "Arizona Diamondbacks", "Tampa Bay Devil Rays", "Brooklyn Dodgers", "New York Giants",
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


TAGS = r'(?:RC|UER|ERR|COR|VAR|CL|AU|LL|AS|WS|TC|ENC|ROO|RDM|SP|SSP|SN\d+)'
TRAILING = re.compile(r'\s+(' + TAGS + r'(?:,?\s+' + TAGS + r')*)$', re.I)
SECTIONS = {'base': 'Base_Set', 'bleacher-blasters': 'Bleacher_Blasters', 'decade-of-excellence': 'Decade_of_Excellence', 'diamond-tribute': 'Diamond_Tribute', 'golden-memories': 'Golden_Memories', 'goudey-greats': 'Goudey_Greats', 'headliners': 'Headliners', 'lumber-company': 'Lumber_Company', 'new-horizon': 'New_Horizon', 'night-day': 'Night_and_Day', 'rookie-sensations': 'Rookie_Sensations', 'soaring-stars': 'Soaring_Stars', 'team-leaders': 'Team_Leaders', 'zone': 'Zone', 'million-dollar-moments': 'Checklist'}
EXPECTED_COUNTS = {'base': 761, 'tiffany': 761, 'bleacher-blasters': 10, 'decade-of-excellence': 12, 'decade-rare-traditions': 12, 'diamond-tribute': 12, 'golden-memories': 10, 'goudey-greats': 15, 'goudey-gold': 15, 'headliners': 20, 'lumber-company': 18, 'new-horizon': 15, 'night-day': 10, 'rookie-sensations': 20, 'soaring-stars': 12, 'soaring-glowing': 12, 'team-leaders': 28, 'team-leaders-tabs': 28, 'zone': 20, 'million-dollar-moments': 50, 'autograph-redemption': 10}
EXPECTED_ODDS = {'base': None, 'tiffany': 20, 'bleacher-blasters': None, 'decade-of-excellence': 72, 'decade-rare-traditions': 720, 'diamond-tribute': 576, 'golden-memories': 32, 'goudey-greats': 16, 'goudey-gold': 1600, 'headliners': 4, 'lumber-company': None, 'new-horizon': 8, 'night-day': 480, 'rookie-sensations': 12, 'soaring-stars': 24, 'soaring-glowing': None, 'team-leaders': 40, 'team-leaders-tabs': None, 'zone': 160, 'million-dollar-moments': 2, 'autograph-redemption': 8}
PARALLELS = {'goudey-gold', 'decade-rare-traditions', 'tiffany', 'team-leaders-tabs', 'soaring-glowing'}
ROOKIES = {'752', '759', '192', '645', '542', '485', '611', '658', '581', '675', '437', '45', '519', '591', '589', '532', '760', '78', '544', '172', '512', '510', '584', '613', '638', '690', '629', '633', '653', '560', '518', '753', '586', '285', '524', '649', '756', '288', '597', '751', '606', '571', '689', '568', '622'}

# Exact catalog annotation differences reviewed against identical card designs.
TAG_DIFFERENCES = {'13': (['AS'], []), '263': (['AS', 'WS'], ['AS', 'LL']), '264': (['AS', 'WS'], ['AS', 'LL']), '397': ([], ['AS']), '504': (['ROO'], []), '507': (['ROO'], []), '508': (['ROO'], []), '513': (['ROO'], []), '515': (['ROO'], []), '516': (['ROO'], []), '522': (['ROO'], []), '529': (['ROO'], []), '530': (['ROO'], []), '546': (['ROO'], []), '547': (['ROO'], []), '554': (['ROO'], []), '559': (['ROO'], []), '561': (['ROO'], []), '567': (['ROO'], []), '575': (['ROO'], []), '582': (['ROO'], []), '583': (['ROO'], []), '598': (['ROO'], []), '611': (['ROO'], []), '613': (['ROO'], []), '617': (['ROO'], []), '620': (['ROO'], []), '622': (['ROO'], []), '626': (['ROO'], []), '628': (['ROO'], []), '629': (['ROO'], []), '633': (['ROO'], []), '644': (['ROO'], []), '652': (['ROO'], []), '654': (['ROO'], []), '664': (['ROO'], []), '668': (['ROO'], []), '674': (['ROO'], []), '677': (['ROO'], []), '683': (['ROO'], []), '686': (['ROO'], []), '691': (['ROO'], []), '692': (['ROO'], [])}

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
    for entry in changed.get('reviewedScanEvidence', []):
        request = urllib.request.Request(entry['url'], headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=35) as response:
            digest = hashlib.sha256(response.read()).hexdigest()
        require(digest == entry['sha256'], 'Reviewed image changed: ' + entry['url'])
    changed['retrievedAt'] = datetime.now(timezone.utc).date().isoformat()
    return changed


def records(snapshot, key):
    entry = snapshot['sources'][key]
    require(entry['url'].startswith('https://'), f'Missing source URL: {key}')
    require(re.fullmatch(r'[a-f0-9]{64}', entry['sha256']) is not None, f'Missing raw-source hash: {key}')
    return entry['records']



def row_for(key, number, label, team, note='', rookie=False):
    name, tags = split_label(label)
    subsets = []
    for tag, subset in [('AS','All-Star'),('LL','League Leaders'),('WS','World Series'),('ROO','Rookie'),('ENC','Encore')]:
        if tag in tags:
            subsets.append(subset)
    if 'CL' in tags:
        subsets.append('Team Checklist' if 'TC' in tags else 'Checklist')
    notes = [note] if note else []
    if key in {'base','tiffany'} and number == '512':
        notes.append('David Ortiz; printed as David Arias')
    if key in {'base','tiffany'} and int(number) >= 751:
        notes.append('Late-added high number; reported short print')
    if key == 'million-dollar-moments':
        notes.append('Original pack game card; game-card legalese on back; not mail-in Exchange')
    if 'SP' in tags or 'SSP' in tags:
        notes.append('Short print' if 'SP' in tags else 'Super short print')
    if key == 'autograph-redemption':
        require(name == number + ' of 10' and not team, 'Unexpected generic redemption identity')
        notes.append('Physical Emerald autograph redemption card; no active redemption or prize mechanic')
    if key == 'tiffany':
        require('RC' not in tags, f'Unexpected Tiffany true RC #{number}')
    if rookie:
        name += ' RC'
    require(name and not re.search(r'\b(?:UER|ERR|COR|VAR|AU|RDM|ROO|ENC|SN\d+)\b', name), f'Dirty player/subject: {name}')
    require(not team or is_team(team), f'Unknown historical team: {key} #{number} {team}')
    subset = ' / '.join(subsets)
    require(team or is_checklist(name, subset) or key == 'autograph-redemption', f'Missing team: {key} #{number}')
    return [key, number, name, team, subset, '; '.join(dict.fromkeys(notes))]


def normalized(name):
    aliases = {'Javy Lopez': 'Javier Lopez', 'Curtis Leskanic': 'Curt Leskanic', 'Brian L. Hunter': 'Brian Hunter', 'Dave Justice': 'David Justice',
               'Dave Nilsson': 'David Nilsson', 'Wil Cordero': 'Wilfredo Cordero',
               'Bob Higginson': 'Bobby Higginson', 'Billy Ashley': 'Billy Ashley',
               'William VanLandingham': 'William Van Landingham', 'David Arias': 'David Ortiz'}
    name = aliases.get(name, name)
    return re.sub(r'[^a-z0-9]', '', name.lower())


def independent_name(label):
    return re.split(r'\s+(?:UER|ERR|COR|RC|VAR|SP|SSP|ROO)\b', label, maxsplit=1)[0].strip()


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
            # The two expansion-team logo cards are called Insert Checklist by
            # TCDB and named for their printed team logos by BCP.
            if key == 'base' and number in {'749','750'}:
                require(actual == 'Insert Checklist' and candidate == by_key[key][number][3], f'Expansion checklist mismatch #{number}')
            else:
                require(same_people(candidate, actual), f'Independent subject mismatch: {key} #{number}: {candidate!r} vs {actual!r}')
    for number, row in by_key['tiffany'].items():
        base = by_key['base'][number]
        require(row[2] == base[2].removesuffix(' RC') and row[3:5] == base[3:5], f'Tiffany/base identity, team or subset mismatch #{number}')
    for parent, parallel in [('decade-of-excellence','decade-rare-traditions'),('goudey-greats','goudey-gold'),('soaring-stars','soaring-glowing'),('team-leaders','team-leaders-tabs')]:
        for number, row in by_key[parent].items():
            require(row[2:5] == by_key[parallel][number][2:5], f'Parallel identity/team mismatch {parallel} #{number}')
    bcp_rc = {r.split(' ', 1)[0] for r in records(snapshot, 'bcp-base') if re.search(r'\bRC\b', r)}
    require(ROOKIES - bcp_rc == {'285','288','437'} and not bcp_rc - ROOKIES, 'RC source disagreement changed; re-review required')


def validate(bundle, cards):
    require(bundle['schemaVersion'] == 2 and bundle['status'] == 'DRAFT' and bundle['product']['released'] is False, 'Product must remain an unreleased draft')
    require(bundle['product']['cardsPerPack'] == 11 and bundle['product']['packsPerBox'] == 36, 'Pack item model changed')
    require(bundle['review']['teamData'] == 'PENDING', 'Generic redemption cards need pending-team staging')
    specs = bundle['productSets']
    require(len(specs) == len(EXPECTED_COUNTS) == len({s['id'] for s in specs}) and {s['key'] for s in specs} == set(EXPECTED_COUNTS), 'Invalid ProductSet inventory/IDs')
    require(len(cards) == len({(r[0], r[1]) for r in cards}) == TOTAL, 'Expected 1851 unique explicit rows')
    for spec in specs:
        key = spec['key']
        require(spec['expectedCards'] == EXPECTED_COUNTS[key] and spec.get('oddsPerPack') == EXPECTED_ODDS[key], f'Unreviewed count/odds: {key}')
        require(spec['kind'] == ('BASE' if key == 'base' else 'PARALLEL' if key in PARALLELS else 'INSERT'), f'Wrong set kind: {key}')
        rows = [r for r in cards if r[0] == key]
        require(len(rows) == spec['expectedCards'] and {r[1] for r in rows} == {str(i) for i in range(1, spec['expectedCards'] + 1)}, f'Missing or duplicate IDs: {key}')
    base = {r[1]: r for r in cards if r[0] == 'base'}
    for number, name, team in [('1','Roberto Alomar','Baltimore Orioles'),('78','Brian Giles RC','Cleveland Indians'),('285','Dave Swartzbaugh RC','Chicago Cubs'),('512','David Arias RC','Minnesota Twins'),('696','Roberto Alomar','Baltimore Orioles'),('721','Tim Salmon','Anaheim Angels'),('749','Insert Checklist','Arizona Diamondbacks'),('750','Insert Checklist','Tampa Bay Devil Rays'),('751','Hideki Irabu RC','New York Yankees'),('761','Bonus Checklist','')]:
        require(base[number][2] == name and base[number][3] == team, f'Identity/RC/team anchor mismatch #{number}')
    require({r[1] for r in cards if r[0] == 'base' and r[2].endswith(' RC')} == ROOKIES, 'Confirmed base RC audit failed')
    require(sum(r[2].endswith(' RC') for r in cards) == 45, 'RC status inferred for parallel/insert')
    for key in ['base','tiffany']:
        require({r[1] for r in cards if r[0] == key and r[4] == 'Encore'} == {str(n) for n in range(696,721)}, 'Encore subset audit failed')
        require({r[1] for r in cards if r[0] == key and 'Checklist' in r[4]} == {str(n) for n in [*range(491,501),*range(721,751),761]}, 'Checklist subset audit failed')
    blank = {('base','761'),('tiffany','761'),('million-dollar-moments','1')} | {('autograph-redemption',str(i)) for i in range(1,11)}
    require({(r[0], r[1]) for r in cards if not r[3]} == blank, 'Unexpected missing team')
    for row in cards:
        require(len(row) == 6 and all(isinstance(v, str) for v in row), 'Invalid CSV fields')
        require(not row[3] or is_team(row[3]), 'Unknown team')
        require(not re.search(r'\b1\s*:\s*\d+', row[5]), 'Set odds leaked into card variant')


def corrected_base_and_tiffany(snapshot):
    base = [copy.deepcopy(r) for page in range(1,9) for r in records(snapshot,f'base-{page}')]
    tiffany = [copy.deepcopy(r) for page in range(1,9) for r in records(snapshot,f'tiffany-{page}')]
    by_base = {r[0]:r for r in base}
    by_tiffany = {r[0]:r for r in tiffany}
    require(len(base) == len(tiffany) == 761 and set(by_base) == set(by_tiffany) == {str(i) for i in range(1,762)}, 'Incomplete or duplicated base/Tiffany source')
    differences = {n:(sorted(split_label(r[1])[1]-{'RC'}),sorted(split_label(by_tiffany[n][1])[1])) for n,r in by_base.items() if split_label(r[1])[1]-{'RC'} != split_label(by_tiffany[n][1])[1]}
    require(differences == TAG_DIFFERENCES, 'Unreviewed base/Tiffany source annotation difference')
    # Printed team and trade destination are distinct on the actual cards.
    require(by_base['427'][2] == 'Toronto Blue Jays' and by_tiffany['37'][2] == 'Kansas City Royals', 'Reviewed catalog team error changed; re-review')
    by_base['427'][2] = 'Pittsburgh Pirates'
    by_base['427'][3] = 'Printed team Pittsburgh Pirates; traded to Blue Jays; source team corrected from card scan'
    by_tiffany['37'][2] = 'California Angels'
    by_tiffany['37'][3] = 'Printed team California Angels; traded to Royals; source team corrected from card scan'
    require(by_base['397'][1] == 'Todd Hundley', 'Reviewed missing All-Star annotation changed')
    by_base['397'][1] += ' AS'
    # Same Tiffany design: restore missing subset annotations; never infer RC.
    for n, row in by_tiffany.items():
        name, tags = split_label(row[1])
        require('RC' not in tags, 'Unexpected parallel true-RC tag')
        canonical_tags = split_label(by_base[n][1])[1] - {'RC'}
        row[1] = name + (' ' + ', '.join(sorted(canonical_tags)) if canonical_tags else '')
    return base, tiffany


def assemble(bundle, snapshot):
    require(snapshot['schemaVersion'] == 1, 'Unexpected source schema')
    base, tiffany = corrected_base_and_tiffany(snapshot)
    for key, rows in [('base',base),('tiffany',tiffany)]:
        require(len(rows) == 761 and {r[0] for r in rows} == {str(i) for i in range(1,762)}, f'Incomplete/duplicate {key} retrieval')
    rookies = {n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies-1')}
    require(len(records(snapshot,'rookies-1')) == 45 and not records(snapshot,'rookies-2') and set(rookies) == ROOKIES, 'Incomplete or changed rookie index')
    base_rc = {n:(clean_name(label),team) for n,label,team,_ in base if 'RC' in split_label(label)[1]}
    require(base_rc == rookies, 'Canonical base and separate rookie-index identities/teams disagree')
    cards = []
    for spec in bundle['productSets']:
        key = spec['key']
        source = base if key == 'base' else tiffany if key == 'tiffany' else records(snapshot,key)
        cards.extend(row_for(key,n,label,team,note,key == 'base' and n in rookies) for n,label,team,note in source)
    validate(bundle,cards)
    verify_independent(snapshot,cards)
    return cards


def self_test(bundle, snapshot):
    fixture = '<table><tr><td><a href="/ViewCard.cfm/sid/929/cid/1">512</a></td><td>David Arias RC<br><figcaption>David Ortiz</figcaption></td><td>Minnesota Twins</td></tr></table>'
    require(parse(fixture, expected_sid=929) == [['512','David Arias RC','Minnesota Twins','David Ortiz']], 'Caption parsing regression')
    try:
        parse(fixture.replace('/sid/929/','/sid/677/'), expected_sid=929)
    except ValueError:
        pass
    else:
        raise ValueError('Wrong source namespace accepted')
    for raw, expected in [('Ken Boswell','Ken Boswell'),('Ken Boswell LL','Ken Boswell'),('Marshall','Marshall'),('John Marshall LL','John Marshall'),('Jim Hall','Jim Hall'),('Jim Hall CL','Jim Hall'),('David Arias RC','David Arias'),('Ramiro Mendoza RC, WS','Ramiro Mendoza'),('Tim Salmon CL, TC','Tim Salmon')]:
        require(clean_name(raw) == expected, f'Trailing token boundary failed: {raw}')
    assemble(bundle,snapshot)
    cases = [
        ('missing base',lambda s:s['sources']['base-1']['records'].pop()),
        ('wrong subject',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong known team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'Boston Red Sox')),
        ('missing team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),
        ('unverified RC',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Roberto Alomar RC, AS')),
        ('bad Encore subset',lambda s:s['sources']['base-7']['records'][95].__setitem__(1,'Roberto Alomar')),
        ('missing Zone card',lambda s:s['sources']['zone']['records'].pop()),
        ('bad Tiffany identity',lambda s:s['sources']['tiffany-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('missing Tiffany row',lambda s:s['sources']['tiffany-1']['records'].pop()),
        ('bad parallel team',lambda s:s['sources']['goudey-gold']['records'][0].__setitem__(2,'Boston Red Sox')),
        ('missing redemption',lambda s:s['sources']['autograph-redemption']['records'].pop()),
        ('wrong redemption subject',lambda s:s['sources']['autograph-redemption']['records'][0].__setitem__(1,'Invented autograph')),
    ]
    for label, mutate in cases:
        changed = copy.deepcopy(snapshot)
        mutate(changed)
        try:
            assemble(bundle,changed)
        except (ValueError,KeyError):
            pass
        else:
            raise ValueError(f'Corruption test did not fail: {label}')
    print('PASS: full source/parallel/RC/subset audit, parser, namespace/token boundaries, twelve corruption tests')


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
    print(f'PASS: {len(cards)} verified cards / {len(bundle["productSets"])} collector sets / 45 confirmed base RCs; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
