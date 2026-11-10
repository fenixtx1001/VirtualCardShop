"""Build the 1993–94 Leaf Hockey draft from frozen checklist rows."""
import csv
import io
import json
from pathlib import Path
import re
import sys

STEM = '1993-94-leaf-hockey'
PRODUCT = '1993_94_Leaf_Hockey'
DATA = Path(__file__).resolve().parents[1] / 'data' / 'set-factory'
SETS = [
    ('4954', 'base', 'Base', 440, 'Two 220-card series.'),
    ('4955', 'freshman-phenoms', 'Freshman Phenoms', 10, 'Series Two.'),
    ('4956', 'gold-leaf-all-stars', 'Gold Leaf All-Stars', 10, 'Series One #1–5, Series Two #6–10.'),
    ('4957', 'gold-leaf-rookie', 'Gold Leaf Rookie', 15, 'Series One.'),
    ('4958', 'hat-trick-artists', 'Hat Trick Artists', 10, 'Series One #1–5, Series Two #6–10.'),
    ('4959', 'mario-lemieux-collection', 'Mario Lemieux Collection', 10, 'Series One #1–5, Series Two #6–10.'),
    ('4960', 'painted-warriors', 'Painted Warriors', 10, 'Series One #1–5, Series Two #6–10.'),
    ('4961', 'studio-signature-series', 'Studio Signature Series', 10, 'Series One #1–5, Series Two #6–10. Facsimile signatures.'),
    ('430048', 'authentic-autograph', 'Authentic Autograph', 1, 'Series Two Mario Lemieux autograph, SN2000.'),
]
TAGS = r'RC|AW|CL|TC|ET|SCC|UER|AU|SN\d+'
TRAILING_TAGS = re.compile(rf'\s+((?:{TAGS})(?:,\s*(?:{TAGS}))*)$')


def normalize(row, key, rookies):
    number, label, team, note = row
    match = TRAILING_TAGS.search(label)
    tags = match[1].split(', ') if match else []
    player = label[:match.start()] if match else label
    subset = ''
    details = [note] if note else []
    if key == 'base':
        if ('RC' in tags) != (number in rookies):
            raise ValueError(f'Rookie index mismatch at #{number}')
        if number in rookies:
            if (label, team) != rookies[number]:
                raise ValueError(f'Rookie identity mismatch at #{number}')
            player += ' RC'
        if 'CL' in tags:
            subset = 'Awards Checklist'
        elif 'ET' in tags or 'TC' in tags:
            subset = 'Expansion Teams'
        elif 'SCC' in tags:
            subset = 'Stanley Cup Champions'
    elif player == 'Title Card':
        subset = 'Title Card'
    if 'AU' in tags:
        details.append('Autograph')
    details.extend(tag for tag in tags if tag.startswith('SN'))
    if not player or not team:
        raise ValueError(f'Missing subject or team for {key} #{number}')
    return [key, number, player, team, subset, ' | '.join(details)]


def build():
    source = json.loads((DATA / f'{STEM}.source.json').read_text(encoding='utf-8'))
    rookies = {number: (name, team) for number, name, team, _ in source['rookies']}
    if len(rookies) != 29 or len(source['rookies']) != 29:
        raise ValueError('Rookie index changed')
    if set(source['checklists']) != {s[0] for s in SETS}:
        raise ValueError('Unexpected checklist families')
    cards, product_sets = [], []
    for sid, key, title, count, notes in SETS:
        section = source['checklists'][sid]
        rows = section['rows']
        expected = ['NNO'] if sid == '430048' else [str(n) for n in range(1, count + 1)]
        if [r[0] for r in rows] != expected:
            raise ValueError(f'Checklist numbering mismatch for {title}')
        cards.extend(normalize(row, key, rookies) for row in rows)
        suffix = '_'.join(part.capitalize() for part in key.split('-'))
        product_sets.append(dict(key=key, id=f'{PRODUCT}_{suffix}', name=title,
            kind='BASE' if key == 'base' else 'INSERT', oddsPerPack=None,
            expectedCards=count, defaultGradeability='COMMON', sourceUrl=section['sourceUrl'],
            notes=notes if key == 'base' else f'{notes} Standard pack odds unverified.'))
    if len(cards) != 516 or sum(r[2].endswith(' RC') for r in cards) != 29:
        raise ValueError('Unexpected card or rookie total')
    if cards[-1][1:] != ['NNO', 'Mario Lemieux', 'Pittsburgh Penguins', '', 'Autograph | SN2000']:
        raise ValueError('Lemieux autograph metadata changed')

    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {'checklistUrl': source['checklists']['4954']['sourceUrl'],
                   'rookiesUrl': 'https://www.tcdb.com/Rookies.cfm/sid/4954/1993-94-Leaf',
                   'relatedSetsUrl': 'https://www.tcdb.com/Inserts.cfm/sid/4954/1993-94-Leaf',
                   'crossCheckUrl': 'https://www.hobbyinsider.net/forum/threads/checklist-1993-94-leaf.436420/'},
        'decisions': {
            'packFormat': 'Combined VCS product uses verified U.S. Series One format of 14 cards and 36 packs per box. Other physical configurations exist.',
            'base': 'One base pool combines Series One #1–220 and Series Two #221–440.',
            'packOdds': 'Insert families are catalogued with null odds pending reliable per-pack frequencies.',
            'rookies': '29 TCDB rookie labels on Base only. Rookie-themed inserts keep their checklist names.',
            'exclusions': 'The oversized pre-release Lemieux #1 promotion is outside the pack product.',
        },
        'product': dict(id=PRODUCT, year=1993, brand='Leaf', sport='Hockey',
                        cardsPerPack=14, packsPerBox=36, packPriceCents=0, autoPackPricing=True,
                        packImageUrl=None, boxImageUrl=None, released=False),
        'review': dict(teamData='COMPLETE', rookieData='VERIFIED', packOdds='PENDING',
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
    print('PASS: 516 cards across nine checklists, including 29 Base RCs.')
