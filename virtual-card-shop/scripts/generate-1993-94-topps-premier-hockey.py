"""Build the Topps Premier draft from the frozen checklist and rookie index."""
import csv
import io
import json
from pathlib import Path
import re
import sys

STEM = '1993-94-topps-premier-hockey'
PRODUCT = '1993_94_Topps_Premier_Hockey'
DATA = Path(__file__).resolve().parents[1] / 'data' / 'set-factory'
INSERTS_URL = 'https://www.tcdb.com/Inserts.cfm/sid/4988/1993-94-Topps-Premier---Black-Gold'
ROOKIES_URL = 'https://www.tcdb.com/Rookies.cfm/sid/4988/1993-94-Topps-Premier'
ROOKIES = {199, 283, 285, 290, 307, 336, 342, 345, 352, 361, 365, 379,
           392, 393, 402, 412, 418, 478, 484, 488, 491, 516, 522, 525}
REPLACEMENTS = {
    263: ('Martin Lapointe', 'Detroit Red Wings'),
    264: ('Kevin Miehm', 'St. Louis Blues'),
    527: ("Myles O'Connor", 'Anaheim Mighty Ducks'),
    528: ('Jamie Leach', 'Florida Panthers'),
}
SUBSET_TAGS = {
    'SR': 'Super Rookies', 'LL': 'League Leaders',
    'CZE': 'International Stars — Czech Republic', 'CAN': 'International Stars — Canada',
    'USA': 'International Stars — USA', 'RUS': 'International Stars — Russia',
    'LAT': 'International Stars — Latvia', 'LTU': 'International Stars — Lithuania',
}
SETS = [
    ('base', 'Base', 'BASE', 528, None, 'Two 264-card series in one base checklist.'),
    ('gold', 'Gold', 'PARALLEL', 528, 1, 'One Gold slot per VCS pack. Physical standard packs sometimes had a second Gold.'),
    ('black-gold', 'Black Gold', 'INSERT', 24, 72, 'Numbered player cards across both series.'),
    ('finest', 'Finest', 'INSERT', 12, None, 'Shared Topps and O-Pee-Chee Series Two issue. Published insertion rate not verified.'),
    ('team-usa', 'Team USA', 'INSERT', 23, 24, 'Physical Topps Series Two rate 1:12. Combined equal-series VCS rate 1:24.'),
    ('black-gold-redemptions', 'Black Gold Redemptions', 'INSERT', 3, None, 'Original pack-issued exchange cards. Mail-in Certified Winners excluded.'),
    ('finest-redemptions', 'Finest Redemptions', 'INSERT', 2, None, 'Two unnumbered exchange cards. VCS identifiers distinguish their prizes.'),
]


def normalize(row, base=False):
    number, label, *teams = row
    team = teams[0] if teams else ''
    name, _, error = label.partition('UERUER:')
    name = re.sub(r'\s+UER\s*$', '', name.strip())
    match = re.search(r'\s+(RC|CL|AS|SR|LL|CZE|CAN|USA|RUS|LAT|LTU)$', name)
    tag = match[1] if match else ''
    if match:
        name = name[:match.start()]
    subset = SUBSET_TAGS.get(tag, '')
    variant = f'UER: {error.strip()}' if error else ''
    if tag == 'CL':
        name, variant = 'Checklist', name.removeprefix('Checklist: ')
        subset = 'Checklist'
    elif tag == 'AS':
        subset = 'First Team All-Stars' if int(number) <= 95 else 'Second Team All-Stars'
    if base:
        if (tag == 'RC') != (int(number) in ROOKIES):
            raise ValueError(f'Base rookie mismatch at #{number}')
        if tag == 'RC':
            name += ' RC'
    if not name or (not team and tag != 'CL'):
        raise ValueError(f'Missing subject or team at #{number}')
    return [number, name, team, subset, variant]


def build():
    source = json.loads((DATA / f'{STEM}.source.json').read_text(encoding='utf-8'))
    checklists = source['checklists']
    base = checklists['4988']['rows']
    gold = checklists['48484']['rows']
    rookies = [r for r in base if int(r[0]) in ROOKIES]
    if rookies != source['rookieRows']:
        raise ValueError('Base rookie subjects differ from the rookie index')
    for base_row, gold_row in zip(base, gold, strict=True):
        number = int(base_row[0])
        if number in REPLACEMENTS:
            if tuple(gold_row[1:]) != REPLACEMENTS[number] or ' CL' not in base_row[1]:
                raise ValueError(f'Gold replacement mismatch at #{number}')
        elif [base_row[0], base_row[1].removesuffix(' RC'), *base_row[2:]] != gold_row:
            raise ValueError(f'Base and Gold differ at #{number}')

    black_gold = checklists['4989']['rows']
    original_winners = [r for r in black_gold if r[1].startswith('Winner Group ')]
    if [r[0] for r in original_winners] != ['A', 'B', 'A/B']:
        raise ValueError('Unexpected Black Gold winner numbers')
    finest_winners = [r for r in source['relatedCards'] if r[1].startswith('Finest Instant Winner Redemption')]
    if [r[1].split('VARVAR: ')[-1] for r in finest_winners] != ['Full Set', 'Single Card']:
        raise ValueError('Unexpected Finest redemption variants')

    numbered = {
        'base': (4988, base), 'gold': (48484, gold),
        'black-gold': (4989, [r for r in black_gold if r[0].isdigit()]),
        'finest': (4990, checklists['4990']['rows']),
        'team-usa': (48485, checklists['48485']['rows']),
    }
    cards, product_sets = [], []
    for key, title, kind, count, odds, notes in SETS:
        if key in numbered:
            sid, rows = numbered[key]
            if [r[0] for r in rows] != [str(n) for n in range(1, count + 1)]:
                raise ValueError(f'Invalid numbering for {title}')
            source_url = checklists[str(sid)]['sourceUrl']
            normalized = [normalize(row, base=key == 'base') for row in rows]
        elif key == 'black-gold-redemptions':
            source_url = checklists['4989']['sourceUrl']
            prizes = {'A': 'Series One set', 'B': 'Series Two set', 'A/B': 'Complete 24-card set'}
            normalized = [[r[0], r[1], '', 'Redemption', prizes[r[0]]] for r in original_winners]
        else:
            source_url = INSERTS_URL
            normalized = [
                ['NNO-FULL-SET', 'Finest Instant Winner Redemption', '', 'Redemption', 'Full set'],
                ['NNO-SINGLE-CARD', 'Finest Instant Winner Redemption', '', 'Redemption', 'Single card'],
            ]
        if len(normalized) != count or len({r[0] for r in normalized}) != count:
            raise ValueError(f'Incorrect count or duplicate number for {title}')
        cards.extend([key, *row] for row in normalized)
        product_sets.append(dict(
            key=key, id=f'{PRODUCT}_{title.replace(" ", "_")}', name=title,
            kind=kind, expectedCards=count, oddsPerPack=odds,
            defaultGradeability='COMMON', sourceUrl=source_url, notes=notes,
        ))
    if len(cards) != 1120 or sum(row[2].endswith(' RC') for row in cards) != 24:
        raise ValueError('Card or rookie total mismatch')

    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {'checklistUrl': checklists['4988']['sourceUrl'],
                   'rookiesUrl': ROOKIES_URL, 'insertsUrl': INSERTS_URL},
        'decisions': {
            'packFormat': 'Standard hobby configuration: 12 cards per pack, 36 packs per box.',
            'series': 'One VCS product combines two equal 264-card base series.',
            'gold': 'One guaranteed Gold in VCS. The VCS rip engine supports one hit per ProductSet per pack. Physical bonus Gold (1:4) and jumbo collation are documented separately.',
            'rookies': '24 TCDB-indexed true rookie labels appear on Base only. Super Rookies is a separate subset.',
            'unknownOdds': 'Finest and two original redemption families are staged without pack odds.',
            'excludedIssues': 'Pre-production samples, the promo sheet, Certified Winner replacements and the separate O-Pee-Chee product are outside this draft.',
        },
        'product': dict(id=PRODUCT, year=1993, brand='Topps Premier', sport='Hockey',
                        cardsPerPack=12, packsPerBox=36, packPriceCents=0, autoPackPricing=True,
                        packImageUrl=None, boxImageUrl=None, released=False),
        'review': dict(teamData='COMPLETE', rookieData='VERIFIED', packOdds='PARTIAL',
                       packImage='PENDING', cardImages='PENDING', pricing='PENDING', release='BLOCKED'),
        'cardsFile': f'{STEM}.cards.csv', 'productSets': product_sets,
    }
    output = io.StringIO(newline='')
    writer = csv.writer(output, lineterminator='\n')
    writer.writerow(['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant'])
    writer.writerows(cards)
    return {f'{STEM}.cards.csv': output.getvalue(),
            f'{STEM}.bundle.json': json.dumps(bundle, indent=2, ensure_ascii=False) + '\n'}


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--check']):
        raise SystemExit(f'Usage: generate-{STEM}.py [--check]')
    for filename, content in build().items():
        path = DATA / filename
        if '--check' in sys.argv:
            if path.read_text(encoding='utf-8') != content:
                raise SystemExit(f'Stale generated file: {path}')
        else:
            path.write_text(content, encoding='utf-8')
    print('PASS: 1,120 cards, seven checklists, 24 true Base RCs, four Gold replacements.')
