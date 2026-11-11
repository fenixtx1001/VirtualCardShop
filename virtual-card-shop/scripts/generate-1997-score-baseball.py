"""Build the retail 1997 Score VCS draft from frozen checklist rows."""
import csv
import io
import json
from pathlib import Path
import re
import sys

STEM = '1997-score-baseball'
PRODUCT = '1997_Score_Baseball'
DATA = Path(__file__).resolve().parents[1] / 'data' / 'set-factory'
# Source ID, VCS key, title, kind, card count, series, physical pack denominator.
SETS = [
    (1001, 'base', 'Base', 'BASE', 551, None, None),
    (10266, 'showcase-series', 'Showcase Series', 'PARALLEL', 551, None, 7),
    (10950, 'artists-proofs-holofoil', "Artist's Proofs Holofoil", 'PARALLEL', 551, None, 35),
    (10945, 'artists-proofs-white-border', "Artist's Proofs White Border", 'PARALLEL', 330, 1, 35),
    (10946, 'hobby-reserve-by-score', 'Hobby Reserve by Score', 'PARALLEL', 220, 2, None),
    (10944, 'andruw-jones', 'Andruw Jones', 'INSERT', 1, 2, None),
    (1002, 'blast-masters', 'Blast Masters', 'INSERT', 18, 2, 35),
    (1003, 'heart-of-the-order', 'Heart of the Order', 'INSERT', 18, 2, 23),
    (1004, 'pitcher-perfect', 'Pitcher Perfect', 'INSERT', 15, 1, 23),
    (1005, 'stand-and-deliver', 'Stand & Deliver', 'INSERT', 24, 2, 71),
    (1006, 'stellar-season', 'Stellar Season', 'INSERT', 18, 1, 35),
    (1007, 'the-franchise', 'The Franchise', 'INSERT', 9, 1, 72),
    (10951, 'the-franchise-glowing', 'The Franchise Glowing', 'INSERT', 9, 1, 240),
    (1009, 'titanic-taters', 'Titanic Taters', 'INSERT', 18, 1, 35),
]
SUBSETS = {'CL': 'Checklist', 'ROO': 'Rookies', 'GY': "Goin’ Yard",
           'RF': 'Rock and Fire', 'TG': 'True Grit', 'WC': 'Wild Card'}
TAG = r'ROO|GY|RF|TG|RC|CL|SP|UER|ERR|COR|WC'
TRAILING_TAGS = re.compile(rf'\s+((?:{TAG})(?:,\s*(?:{TAG}))*)$')
ROOKIES = {'209', '308', '309', '320', '321', '469', '479', '483', '488', '491'}
ALIASES = {'David Justice': 'Dave Justice', 'Javier Lopez': 'Javy Lopez'}
NOTES = {
    1001: 'Two retail series. Corrected Chili Davis #338 is the canonical card.',
    10944: 'One per Series Two blister. Mixed-pack odds left unset because the blister share is unknown.',
    10946: 'Retail foil-stamped parallel #331–550 without HR prefix. Pack insertion rate unverified.',
    10950: 'Uses the TCDB retail 1:35 listing. BaseballCardPedia leaves Series One retail odds unspecified.',
    1003: 'Retail cards #1–18. Cards #19–36 belong to the separate Hobby Reserve product.',
    1006: 'Uses the Series One jumbo rate before series weighting.',
}


def parse_card(row, sid, key):
    number, label, team, variant = row
    match = TRAILING_TAGS.search(label)
    tags = match[1].split(', ') if match else []
    player = label[:match.start()] if match else label
    player = ALIASES.get(player, player)
    if sid in {1001, 10266, 10950, 10946}:
        if player == 'Jim Thome' and number in {'514', '515a', '515b'}:
            number = '515-Thome'
            variant = 'Printed #515. Intended #514.'
        elif player == 'Gary Sheffield' and number == '515b':
            number = '515'
        elif number == '338b':
            number = '338'
    if sid == 1001:
        if ('RC' in tags) != (number in ROOKIES):
            raise ValueError(f'Rookie index mismatch at #{number}')
        if number in ROOKIES:
            player += ' RC'
    if 'SP' in tags:
        variant = f'Short print | {variant}' if variant else 'Short print'
    subset = next((SUBSETS[tag] for tag in tags if tag in SUBSETS), '')
    if not player or not team:
        raise ValueError(f'Missing subject or team for {key} #{number}')
    return [key, number, player, team, subset, variant]


def expected_numbers(sid, count):
    if sid == 10944:
        return {'NNO'}
    if sid == 10946:
        numbers = set(map(str, range(331, 551)))
    else:
        numbers = set(map(str, range(1, count + 1)))
    if sid in {1001, 10266, 10950, 10946}:
        numbers.remove('514')
        numbers.add('515-Thome')
    return numbers


def build():
    source = json.loads((DATA / f'{STEM}.source.json').read_text(encoding='utf-8'))
    if {r[0] for r in source['rookies']} != ROOKIES:
        raise ValueError('Unexpected rookie index')
    if set(source['checklists']) != {str(s[0]) for s in SETS}:
        raise ValueError('Unexpected source checklist families')
    cards, product_sets = [], []
    base_subjects = {}
    for sid, key, title, kind, count, series, physical_odds in SETS:
        section = source['checklists'][str(sid)]
        rows = [parse_card(row, sid, key) for row in section['rows']
                if not (sid == 1001 and row[0] == '338a')]
        if len(rows) != count or {r[1] for r in rows} != expected_numbers(sid, count):
            raise ValueError(f'Checklist number or count mismatch for {title}')
        if kind == 'BASE':
            base_subjects = {r[1]: (r[2].removesuffix(' RC'), r[3]) for r in rows}
        if kind == 'PARALLEL':
            for _, number, player, team, *_ in rows:
                if base_subjects[number] != (player, team):
                    raise ValueError(f'Parallel subject or team mismatch: {title} #{number}')
        cards.extend(rows)
        odds = physical_odds
        if physical_odds and series:
            odds = round(physical_odds * 551 / {1: 330, 2: 221}[series])
        notes = NOTES.get(sid, '')
        if physical_odds:
            channel = 'jumbo' if sid == 1006 else 'retail'
            notes = f'Physical {channel} rate 1:{physical_odds}. VCS rate 1:{odds}. {notes}'.strip()
        suffix = "_".join(part.capitalize() for part in key.split("-"))
        product_sets.append(dict(key=key, id=f'{PRODUCT}_{suffix}',
            name=title, kind=kind, oddsPerPack=odds, expectedCards=count,
            defaultGradeability='COMMON', sourceUrl=section['sourceUrl'], notes=notes))
    if len(cards) != 2333 or sum(r[2].endswith(' RC') for r in cards) != 10:
        raise ValueError('Unexpected card or rookie total')

    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {'checklistUrl': source['checklists']['1001']['sourceUrl'],
                   'rookiesUrl': 'https://www.tcdb.com/Rookies.cfm/sid/1001/1997-Score',
                   'relatedSetsUrl': 'https://www.tcdb.com/Inserts.cfm/sid/1001/1997-Score',
                   'crossCheckUrl': 'https://baseballcardpedia.com/index.php/1997_Score'},
        'decisions': {
            'scope': 'Flagship retail Score, including jumbo and blister inserts. Premium Stock and Hobby Reserve are separate products.',
            'numbering': 'Both players have printed #515. VCS uses 515-Thome for Jim Thome and 515 for Gary Sheffield. Chili Davis #338 uses the corrected back.',
            'packFormat': 'Four-card VCS packs, 36 packs per box, matching the 1996 Score VCS convention. Physical retail packs held 10 cards in Series One and 12 in Series Two.',
            'odds': 'Series-specific pack rates are weighted by the 330/551 and 221/551 series shares and rounded. Retail baselines apply where published, with the Series One jumbo rate for Stellar Season.',
            'scarcity': 'Short-print annotations are preserved where cataloged. The base pool gives each card equal availability.',
            'excludedIssues': 'Separate hobby products and their exclusive inserts, FanFest cards, 5x7 blaster box toppers, samples and the framed mail-in Stand & Deliver Gold set.',
        },
        'product': dict(id=PRODUCT, year=1997, brand='Score', sport='Baseball',
                        cardsPerPack=4, packsPerBox=36, packPriceCents=0, autoPackPricing=True,
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
    print('PASS: 2,333 cards across 14 checklists, including 10 Base RCs.')
