"""Rebuild the verified, frozen 2002 Prestige checklist without network access.

The source snapshot preserves TCDB card numbers, subject labels, and teams.
See docs/2002-playoff-prestige-football.md for research and modeling decisions.
"""
from collections import Counter
from pathlib import Path
import csv
import io
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
STEM = '2002-playoff-prestige-football'
DATA = ROOT / 'data' / 'set-factory'
PRODUCT_ID = '2002_Playoff_Prestige_Football'
# name, expected collector checklist size, kind, verified pack denominator
SETS = [
    ('Base', 216, 'BASE', None),
    ('Banner Season', 40, 'INSERT', None),
    ('Banner Season Ink Autographs', 40, 'INSERT', None),
    ('Connections Jerseys', 30, 'INSERT', None),
    ('Draft Picks', 25, 'INSERT', 18),
    ('Draft Picks Autographs', 25, 'INSERT', None),
    ('Gridiron Heritage Helmets', 20, 'INSERT', None),
    ('Inside the Numbers', 30, 'INSERT', 18),
    ('Inside the Numbers Gold', 30, 'INSERT', None),
    ('League Leader Tandems', 20, 'INSERT', 18),
    ('League Leader Tandems Materials', 20, 'INSERT', None),
    ('Sophomore Signatures', 40, 'INSERT', None),
    ('Stars of the NFL Autographs', 10, 'INSERT', None),
    ('Stars of the NFL Jerseys', 20, 'INSERT', None),
    ('Xtra Points Green', 216, 'PARALLEL', None),
    ('Xtra Points Purple', 216, 'PARALLEL', None),
]


def split_label(label):
    # Metadata tokens must be separate trailing words; never trim surname letters.
    match = re.search(r'\s+((?:RC|AU|MEM|SP|SN\d+|PR\d+|EXCH)(?:\b.*)?)$', label)
    if not match:
        return label, ''
    return label[:match.start()], match.group(1)


def is_checklist(player, subset=''):
    return 'checklist' in (player + ' ' + subset).lower()


def key_for(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def build():
    for surname in ['Ken Boswell', 'Marshall', 'Jim Hall', 'Eric Crouch']:
        if split_label(surname) != (surname, ''):
            raise ValueError('Unsafe token boundary')
    if split_label('David Carr RC') != ('David Carr', 'RC'):
        raise ValueError('RC token parsing failed')
    source = json.loads((DATA / f'{STEM}.source.json').read_text())
    rookies = set(source['rookieNumbers'])
    if rookies != set(range(151, 217)):
        raise ValueError('Verified rookie index must cover exactly #151-216')
    if set(source['sets']) != {s[0] for s in SETS}:
        raise ValueError('Unexpected source checklist family')
    rows, product_sets, by_name = [], [], {}
    for name, count, kind, odds in SETS:
        raw = source['sets'][name]
        key = key_for(name)
        seen = set()
        current = {}
        for number, label, team in raw['cards']:
            if number in seen:
                raise ValueError(f'Duplicate {name} #{number}')
            seen.add(number)
            player, metadata = split_label(label)
            team = ' '.join(team.split())
            subset = ''
            # Correct obvious source team assignment errors against the subjects.
            if name == 'Connections Jerseys' and number == 'C-7':
                team = 'Carolina Panthers'
            if name == 'League Leader Tandems Materials' and number == 'LL16':
                team = 'New England Patriots / Tampa Bay Buccaneers'
            if name == 'Base':
                if metadata not in ('', 'RC'):
                    raise ValueError(f'Unexpected base annotation: {label}')
                metadata = ''
                if int(number) in rookies:
                    player += ' RC'
                    subset, metadata = 'Rookie', 'SP'
                elif number == '150':
                    player = 'Houston Texans'
                    subset = 'Team Card'
                    metadata = 'Inaugural Season / Season Schedule'
            elif kind == 'PARALLEL':
                # RC suffix only on recognized base RCs; inserts stay unmarked.
                if int(number) in rookies:
                    player += ' RC'
                    subset = 'Rookie'
                expected_sn = 'SN150' if int(number) <= 150 else 'SN25'
                if metadata != expected_sn:
                    raise ValueError(f'Unexpected parallel serial numbering: {label}')
            if not player.strip() or (not team and not is_checklist(player, subset)):
                raise ValueError(f'Missing subject/team: {name} #{number}')
            if re.search(r'\s(?:AU|MEM|SN\d+|EXCH|UER|ERR|COR)\b', player):
                raise ValueError(f'Metadata leaked into player: {player}')
            metadata = metadata.replace('No AU', 'Unsigned').replace('EXCH', 'Redemption')
            if name == 'Draft Picks Autographs':
                metadata += '; Fulfilled redemption'
            row = [key, number, player, team, subset, metadata]
            rows.append(row)
            current[number] = row
        if len(current) != count:
            raise ValueError(f'{name}: expected {count}, got {len(current)}')
        if name == 'Base' or kind == 'PARALLEL':
            if seen != {str(n) for n in range(1, 217)}:
                raise ValueError(f'{name}: incomplete #1-216 sequence')
        by_name[name] = current
        notes = 'Complete collector checklist. '
        notes += 'Pack odds unverified; excluded from hit selection until configured.' if odds is None and kind != 'BASE' else ''
        product_sets.append(dict(key=key, id=PRODUCT_ID+'_'+name.replace(' ', '_'),
            name=name, kind=kind, expectedCards=count, oddsPerPack=odds,
            defaultGradeability='COMMON', sourceUrl=raw['url'], notes=notes.strip()))
    if len(rows) != 998:
        raise ValueError(f'Expected 998 cards, got {len(rows)}')
    base = by_name['Base']
    for name in ['Xtra Points Green', 'Xtra Points Purple']:
        for number, row in by_name[name].items():
            if row[2:4] != base[number][2:4]:
                raise ValueError(f'Parallel subject/team mismatch {name} #{number}')
    unsigned = {n for n, r in by_name['Sophomore Signatures'].items() if 'Unsigned' in r[5]}
    if unsigned != {'SS26', 'SS30', 'SS39'}:
        raise ValueError('Unsigned Sophomore Signatures exception mismatch')
    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {'requestedUrl': 'https://www.tcdb.com/ViewSet.cfm/sid/4562/2002-Playoff-Prestige',
                   'rookiesUrl': source['rookiesUrl'], 'verifiedOn': source['retrievedOn'],
                   'note': 'All 16 collector checklists checked card by card against the frozen TCDB source snapshot. Beckett confirms base size and hobby configuration; see research notes for odds evidence and source corrections.'},
        'decisions': {
            'canonicalPackFormat': 'Hobby: 5 cards per pack, 20 packs per box. Retail 4-card packs are not a separate VCS product.',
            'baseStructure': 'One complete #1-216 Base checklist. #151-216 are SP true RCs; availability flattened within Base to preserve collector completion.',
            'parallelStructure': 'Two complete #1-216 Xtra Points checklists; #1-150 SN150 and #151-216 SN25. No split by serial-number tier.',
            'promotions': 'Exclude National Embossed, National Embossed Banner Season, Beckett Samples Gold and Silver; these are non-pack promotions.',
            'redemptions': 'Draft Picks Autographs models the 25 fulfilled redemption cards, not a claim that signed cards were physically inserted.',
            'unsignedCards': 'Sophomore Signatures SS26 Marvin Minnis, SS30 Nate Clements and SS39 Travis Henry are unsigned SN100 cards. Other AU and SP notes preserved per card.',
            'odds': 'Only Draft Picks, Inside the Numbers and League Leader Tandems use documented 1:18. All other hit odds remain null pending evidence; print runs are never converted into invented pack ratios.',
            'sourceCorrections': 'Connections C-7 team corrected to Carolina Panthers. Materials LL16 team order corrected to match Troy Brown / Keyshawn Johnson. Other TCDB team labels retained, including Colts franchise labeling for Raymond Berry.',
            'releaseSafety': 'Unreleased draft; pack odds, pricing and images must be reviewed before release.',
        },
        'product': dict(id=PRODUCT_ID, year=2002, brand='Playoff Prestige', sport='Football',
                        cardsPerPack=5, packsPerBox=20, packPriceCents=0, autoPackPricing=True,
                        packImageUrl=None, boxImageUrl=None, released=False),
        'review': dict(teamData='COMPLETE', rookieData='VERIFIED', packOdds='PARTIAL',
                       packImage='PENDING', cardImages='PENDING', pricing='PENDING', release='BLOCKED'),
        'cardsFile': f'{STEM}.cards.csv', 'productSets': product_sets,
    }
    output = io.StringIO(newline='')
    writer = csv.writer(output, lineterminator='\n')
    writer.writerow(['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant'])
    writer.writerows(rows)
    return {f'{STEM}.cards.csv': output.getvalue(), f'{STEM}.bundle.json': json.dumps(bundle, indent=2)+'\n'}


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--check']):
        raise SystemExit('Usage: generate-2002-playoff-prestige-football.py [--check]')
    for filename, content in build().items():
        target = DATA / filename
        if '--check' in sys.argv:
            if not target.exists() or target.read_text() != content:
                raise SystemExit(f'Stale generated file: {target}')
        else:
            target.write_text(content, encoding='utf-8')
    print('PASS: 998 cards; 16 complete checklists; 66 verified base RCs; teams, serial tiers, unsigned exceptions and parallel identities validated.')
