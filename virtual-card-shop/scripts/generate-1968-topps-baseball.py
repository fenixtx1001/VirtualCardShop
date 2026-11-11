"""Build the 1968 Topps Baseball draft from the verified checklist snapshot."""
import csv
import io
import json
from pathlib import Path
import re
import sys

STEM = '1968-topps-baseball'
PRODUCT = '1968_Topps_Baseball'
DATA = Path(__file__).resolve().parents[1] / 'data' / 'set-factory'
BASE = 'https://www.tcdb.com/Checklist.cfm/sid/68/1968-Topps'
GAME = 'https://www.tcdb.com/Checklist.cfm/sid/9503/1968-Topps---Game'
PREFERRED = {10: '10b', 49: '49a', 66: '66a', 107: '107a', 192: '192a',
             208: '208b', 247: '247b', 278: '278a', 356: '356a', 400: '400',
             454: '454a', 518: '518a'}
SUBSETS = {
    'LL': 'League Leaders', 'RS': 'Rookie Stars', 'WS': '1967 World Series',
    'AS': 'Sporting News All-Stars', 'ASR': 'Topps All-Star Rookie',
    'MGR': 'Managers', 'TC': 'Team Cards', 'CL': 'Checklists', 'CPC': 'Combo Cards',
}
TAG = re.compile(r'\s+((?:LL|RS|WS|AS|ASR|MGR|TC|CL|CPC|RC|DP|ERR|COR|VAR|UER)(?:,\s*(?:LL|RS|WS|AS|ASR|MGR|TC|CL|CPC|RC|DP|ERR|COR|VAR|UER))*)$')


def base_card(number, row, is_rookie):
    _, label, team, note = row
    match = TAG.search(label)
    tags = match[1].split(', ') if match else []
    subject = label[:match.start()] if match else label
    if ('RC' in tags) != is_rookie:
        raise ValueError(f'Rookie index mismatch at #{number}')
    subset = next((SUBSETS[tag] for tag in tags if tag in SUBSETS), '')
    variant = note
    combo = re.fullmatch(r'(.+) \((.+)\)', subject)
    if combo and any(tag in tags for tag in ('LL', 'RS', 'CPC')):
        caption, subject = combo.groups()
        variant = f'{caption} | {variant}' if variant else caption
    if is_rookie:
        players = subject.split(' / ')
        single_rookie = re.search(r'RC for (.+?) only', note)
        if single_rookie:
            surname = single_rookie[1]
            matches = [name for name in players if name.endswith(' ' + surname)]
            if len(matches) != 1:
                raise ValueError(f'Ambiguous rookie player at #{number}')
            players = [name + ' RC' if name == matches[0] else name for name in players]
        else:
            players = [name + ' RC' for name in players]
        subject = ' / '.join(players)
    if 'DP' in tags:
        variant = f'{variant} | Double print' if variant else 'Double print'
    if not subject or not team:
        raise ValueError(f'Missing subject or team at #{number}')
    return ['base', str(number), subject, team, subset, variant]


def build():
    source = json.loads((DATA / f'{STEM}.source.json').read_text(encoding='utf-8'))
    numbered = {}
    for row in source['base']:
        number = int(re.fullmatch(r'(\d+)[a-z]?', row[0])[1])
        numbered.setdefault(number, []).append(row)
    if set(numbered) != set(range(1, 599)) or len(source['base']) != 612:
        raise ValueError('Base checklist numbering mismatch')
    if {n for n, rows in numbered.items() if len(rows) > 1} != set(PREFERRED):
        raise ValueError('Base variant groups changed')
    rookies = {int(row[0]) for row in source['rookieIndex']}
    if len(rookies) != 47:
        raise ValueError('Expected 47 unique TCDB rookie-index numbers')
    cards = []
    for number, choices in sorted(numbered.items()):
        expected = PREFERRED.get(number, str(number))
        matches = [row for row in choices if row[0] == expected]
        if len(matches) != 1:
            raise ValueError(f'Missing preferred printing #{expected}')
        cards.append(base_card(number, matches[0], number in rookies))
    if cards[176][2] != 'Jerry Koosman RC / Nolan Ryan RC':
        raise ValueError('Ryan/Koosman rookie labels changed')
    if cards[246][2] != 'Johnny Bench RC / Ron Tompkins':
        raise ValueError('Bench-only rookie label changed')
    if [row[0] for row in source['game']] != [str(n) for n in range(1, 34)]:
        raise ValueError('Game checklist numbering mismatch')
    for number, player, team, variant in source['game']:
        if not player or not team:
            raise ValueError(f'Missing Game subject or team at #{number}')
        cards.append(['game', number, player, team, '', variant])

    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {
            'checklistUrl': BASE, 'gameChecklistUrl': GAME,
            'rookiesUrl': 'https://www.tcdb.com/Rookies.cfm/sid/68/1968-Topps',
            'baseCrossCheck': 'https://baseballcardpedia.com/index.php/1968_Topps',
            'gameCrossCheck': 'https://www.keymancollectibles.com/baseballcards/1968toppsgamecardinsert.htm',
        },
        'decisions': {
            'series': 'One Base checklist combines all seven series at equal card availability. Physical ranges: 1–109, 110–196, 197–283, 284–370, 371–457, 458–533, 534–598.',
            'variants': 'One standard card per printed number. Prefer corrected versions where identified and preserve source alternatives in the snapshot.',
            'rookies': '47 unique TCDB rookie-index numbers. Apply player-specific exceptions from the source notes. Rookie Stars and All-Star Rookie are separate subset labels.',
            'packFormat': 'VCS uses a five-card pack and 24-pack box. A Game hit occupies one card slot.',
            'gameOdds': 'Model documented third-series Game distribution at one per eligible wax pack. Weight by the 87/598 third-series checklist share and round to 1:7 in the combined VCS pack. Later-series cello reports and occasional second inserts are outside this model.',
            'excludedIssues': 'Proofs, separately sold Posters and Milton Bradley Win-A-Card printings are outside the standard wax product.',
        },
        'product': dict(id=PRODUCT, year=1968, brand='Topps', sport='Baseball',
                        cardsPerPack=5, packsPerBox=24, packPriceCents=0, autoPackPricing=True,
                        packImageUrl=None, boxImageUrl=None, released=False),
        'review': dict(teamData='COMPLETE', rookieData='VERIFIED', packOdds='MODELED',
                       packImage='PENDING', cardImages='PENDING', pricing='PENDING', release='BLOCKED'),
        'cardsFile': f'{STEM}.cards.csv',
        'productSets': [
            dict(key='base', id=f'{PRODUCT}_Base', name='Base', kind='BASE', expectedCards=598,
                 oddsPerPack=None, defaultGradeability='COMMON', sourceUrl=BASE,
                 notes='Complete seven-series checklist, one card per printed number.'),
            dict(key='game', id=f'{PRODUCT}_Game', name='Game', kind='INSERT', expectedCards=33,
                 oddsPerPack=7, defaultGradeability='COMMON', sourceUrl=GAME,
                 notes='Third-series wax baseline weighted to the combined pack. 1:7 is a VCS model.'),
        ],
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
    print('PASS: 631 cards, 47 rookie-index numbers, two complete checklists.')
