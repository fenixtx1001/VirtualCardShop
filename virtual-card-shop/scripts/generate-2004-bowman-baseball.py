"""Build the 2004 Bowman VCS bundle from frozen checklist sources."""
import csv
import io
import json
from pathlib import Path
import re
import sys

STEM = '2004-bowman-baseball'
PRODUCT = '2004_Bowman_Baseball'
DATA = Path(__file__).resolve().parents[1] / 'data' / 'set-factory'
# Source ID, key, display name, kind, count, standard hobby denominator.
SETS = [
    ('1681', 'base', 'Base', 'BASE', 330, None),
    ('15552', 'gold', 'Gold', 'PARALLEL', 330, 1),
    ('15546', 'first-edition', '1st Edition', 'PARALLEL', 330, None),
    ('15557', 'uncirculated-silver', 'Uncirculated Silver', 'PARALLEL', 330, None),
    ('15556', 'uncirculated-gold', 'Uncirculated Gold', 'PARALLEL', 165, None),
    ('15547', 'autographs', 'Autographs', 'INSERT', 15, 72),
    ('15548', 'autographs-red-ink', 'Autographs Red Ink', 'INSERT', 15, 1466),
    ('15549', 'base-of-the-future-autograph', 'Base of the Future Autograph', 'INSERT', 1, None),
    ('15550', 'base-of-the-future-autograph-red-ink', 'Base of the Future Autograph Red Ink', 'INSERT', 1, None),
    ('15551', 'futures-game-gear-jerseys', 'Futures Game Gear Jerseys', 'INSERT', 28, None),
    ('15553', 'relics', 'Relics', 'INSERT', 10, None),
    ('15554', 'signs-of-the-future', 'Signs of the Future', 'INSERT', 19, None),
    ('15555', 'signs-of-the-future-red-ink', 'Signs of the Future Red Ink', 'INSERT', 19, 1466),
    ('roy', 'roy-dual-relic', '2003 ROY Dual Relic', 'INSERT', 1, 829),
]
GROUPS = {
    '15551': {
        'A': (167, 'AR EE GQ JH RN'),
        'B': (71, 'CB CN CT DBK JM JV PL PWL SJS SS TB'),
        'C': (181, 'CW EJ JD ST'),
        'D': (173, 'DB ES NC SH'),
        'E': (145, 'DK JC KY MV'),
    },
    '15553': {'A': (346, '157 160 192'), 'B': (133, '154 155 156 158 159 164 221')},
    '15554': {
        'A': (75, 'AH BC BM CS DS IC JH JV TJ TL'),
        'B': (847, 'BW'), 'C': (582, 'NM RH'), 'D': (315, 'BF BS ED GS JB MM'),
    },
}
NOTES = {
    '15546': 'Separate 1st Edition packs contained only 1st Edition cards. Checklist staged without standard pack odds.',
    '15557': 'Encased box loader or complete-set redemption. Serial numbered to 245.',
    '15556': 'Fulfilled redemption of #166–330, print run 210 per card. Physical exchange cards are outside the player checklist.',
    '15549': 'HTA exclusive, 1:110 HTA packs.',
    '15550': 'HTA exclusive, 1:5112 HTA packs. Serial numbered to 25.',
}
ALIASES = {'CC Sabathia': 'C.C. Sabathia', 'Ichiro Suzuki': 'Ichiro',
           'Jon DeVries': 'Jon De Vries'}
TAG = r'FY|RC|UER|AU|MEM|ROY|SN\d+|PR\d+'
TRAILING_TAGS = re.compile(rf'\s+((?:{TAG})(?:,\s*(?:{TAG}))*)$')
ROOKIES = {str(n) for n in range(166, 331) if n != 197}


def normalize(row, sid, key, group):
    number, label, team, note = row
    match = TRAILING_TAGS.search(label)
    tags = match[1].split(', ') if match else []
    player = label[:match.start()] if match else label
    if player == 'Steve Lerud' and sid in {'15546', '15557'}:
        player = 'Steven Lerud'
    player = ALIASES.get(player, player)
    subset = ''
    if sid in {'1681', '15552', '15546', '15556', '15557'}:
        n = int(number)
        subset = 'Veterans' if n <= 144 else 'Prospects' if n <= 165 else 'First Year'
    if sid == '1681':
        if ('RC' in tags) != (number in ROOKIES):
            raise ValueError(f'Rookie mismatch at #{number}')
        if number in ROOKIES:
            player += ' RC'
    if not player or not team:
        raise ValueError(f'Missing subject or team for {key} #{number}')
    details = [note] if note else []
    if 'AU' in tags:
        details.append('Autograph')
    if 'MEM' in tags and not note:
        details.append('Game-worn jersey' if sid == '15551' else 'Game-used base')
    details.extend(tag for tag in tags if tag.startswith(('SN', 'PR')))
    if group:
        details.append(f'Physical odds group {group}')
    return [key, number, player, team, subset, ' | '.join(details)]


def build():
    source = json.loads((DATA / f'{STEM}.source.json').read_text(encoding='utf-8'))
    if {r[0] for r in source['rookies']} != ROOKIES or len(source['rookies']) != 164:
        raise ValueError('Rookie index changed')
    if set(source['checklists']) != {s[0] for s in SETS}:
        raise ValueError('Unexpected checklist families')
    cards, product_sets = [], []
    subjects = {}
    for sid, key, title, kind, count, odds in SETS:
        section = source['checklists'][sid]
        rows = section['rows']
        if sid in {'15556', '15557'}:
            exchange = [row for row in rows if row[0] == 'NNO']
            if len(exchange) != 1 or 'Exchange' not in exchange[0][1]:
                raise ValueError(f'Unexpected exchange entries in {title}')
            rows = [row for row in rows if row[0] != 'NNO']
        numbers = {r[0] for r in rows}
        if len(rows) != count or len(numbers) != count:
            raise ValueError(f'Incorrect count or duplicate number for {title}')
        if kind in {'BASE', 'PARALLEL'}:
            start = 166 if sid == '15556' else 1
            if numbers != set(map(str, range(start, 331))):
                raise ValueError(f'Incorrect numbering for {title}')
        groups = GROUPS.get(sid, {})
        group_by_number = {n: g for g, (_, ids) in groups.items() for n in ids.split()}
        if groups and {n.split('-', 1)[-1] for n in numbers} != set(group_by_number):
            raise ValueError(f'Physical odds groups do not cover {title}')
        normalized = [normalize(row, sid, key, group_by_number.get(row[0].split('-', 1)[-1]))
                      for row in rows]
        subjects[sid] = {r[1]: (r[2].removesuffix(' RC'), r[3]) for r in normalized}
        if kind == 'PARALLEL':
            for number, identity in subjects[sid].items():
                if identity != subjects['1681'][number]:
                    raise ValueError(f'Parallel subject or team mismatch for {title} #{number}')
        for regular, red in [('15547', '15548'), ('15554', '15555')]:
            if sid == red and subjects[red] != subjects[regular]:
                raise ValueError(f'Red ink checklist mismatch for {title}')
        cards.extend(normalized)
        notes = NOTES.get(sid, '')
        if groups:
            odds = round(1 / sum(1 / denominator for denominator, _ in groups.values()))
            rates = ', '.join(f'{g} 1:{rate}' for g, (rate, _) in groups.items())
            notes = f'Hobby group rates: {rates}. Combined VCS pool 1:{odds}, equal draws within pool.'
        suffix = '_'.join(part.capitalize() for part in key.split('-'))
        product_sets.append(dict(key=key, id=f'{PRODUCT}_{suffix}', name=title, kind=kind,
            oddsPerPack=odds, expectedCards=count, defaultGradeability='COMMON',
            sourceUrl=section['sourceUrl'], notes=notes))
    if len(cards) != 1594 or sum(r[2].endswith(' RC') for r in cards) != 164:
        raise ValueError('Unexpected card or rookie total')

    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {'checklistUrl': source['checklists']['1681']['sourceUrl'],
                   'rookiesUrl': 'https://www.tcdb.com/Rookies.cfm/sid/1681/2004-Bowman',
                   'relatedSetsUrl': 'https://www.tcdb.com/Inserts.cfm/sid/1681/2004-Bowman',
                   'crossCheckUrl': 'https://baseballcardpedia.com/index.php/2004_Bowman'},
        'decisions': {
            'packFormat': 'Standard hobby: 10 cards per pack, 24 packs per box. One Gold per pack.',
            'groupedOdds': 'Combine published group frequencies into one rounded family denominator. Cards draw equally within each family.',
            'stagedChecklists': '1st Edition, Uncirculated Gold and Silver, and the two HTA-only Base of the Future cards are catalogued with null standard hobby pack odds.',
            'rookies': '164 TCDB rookie-index labels. Bobby Madritsch #197 is First Year without RC in that index.',
            'exclusions': 'Unnumbered claim tickets are in the frozen source snapshot. Bowman Chrome and Bowman Draft are separate products.',
        },
        'product': dict(id=PRODUCT, year=2004, brand='Bowman', sport='Baseball',
                        cardsPerPack=10, packsPerBox=24, packPriceCents=0,
                        autoPackPricing=True, packImageUrl=None, boxImageUrl=None, released=False),
        'review': dict(teamData='COMPLETE', rookieData='VERIFIED', packOdds='MODELED',
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
    print('PASS: 1,594 cards across 14 checklists, including 164 Base RCs.')
