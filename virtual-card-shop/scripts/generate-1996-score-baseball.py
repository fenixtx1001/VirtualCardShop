"""Generate the 1996 Score draft from the frozen, verified checklist snapshot."""
import csv
import io
import json
from pathlib import Path
import re
import sys

STEM = '1996-score-baseball'
PRODUCT = '1996_Score_Baseball'
DATA = Path(__file__).resolve().parents[1] / 'data' / 'set-factory'
ROOKIES = {'239', '256', '258', '264', '492', '495', '502', '503'}
SERIES_SIZE = {1: 275, 2: 242}
# TCDB ID, checklist title, count, physical series, pack denominator, channel.
SETS = [
    (749, 'Base', 517, None, None, None),
    (10783, 'Dugout Collection Series One', 110, 1, 3, 'Hobby/Retail'),
    (97124, 'Dugout Collection Series Two', 110, 2, 3, 'Hobby/Retail'),
    (10784, 'Dugout Collection Artist\'s Proofs Series One', 110, 1, 36, 'Hobby/Retail'),
    (97125, 'Dugout Collection Artist\'s Proofs Series Two', 110, 2, 36, 'Hobby/Retail'),
    (750, 'All Stars', 20, 2, 9, 'Jumbo'),
    (751, 'Big Bats', 20, 1, 31, 'Retail'),
    (753, 'Diamond Aces', 30, 1, 8, 'Jumbo'),
    (754, 'Dream Team', 9, 1, 72, 'Hobby/Retail'),
    (755, 'Future Franchise', 16, 2, 72, 'Hobby/Retail'),
    (756, 'Gold Stars', 30, 2, 15, 'Hobby/Retail'),
    (757, 'Numbers Game', 30, 1, 15, 'Hobby/Retail'),
    (758, 'Power Pace', 18, 2, 31, 'Retail'),
    (759, 'Reflextions', 20, 1, 15, 'Hobby'),
    (760, 'Titanic Taters', 18, 2, 31, 'Hobby'),
    (2131, 'Cal Ripken 2131', 1, 1, 300, 'Hobby/Retail'),
]
PARALLELS = {10783, 10784, 97124, 97125}
TAG = re.compile(r'\s+((?:ROO|RC|RR|SS|UER)(?:,\s*(?:ROO|RC|RR|SS|UER))*)$')


def parse_subject(label):
    label, _, error = label.partition('UERUER:')
    match = TAG.search(label.strip())
    tags = set(match[1].split(', ')) if match else set()
    return label.strip()[:match.start()] if match else label.strip(), tags, error.strip()


def build():
    source = json.loads((DATA / f'{STEM}.source.json').read_text(encoding='utf-8'))
    if set(source['rookieNumbers']) != ROOKIES:
        raise ValueError('Rookie index mismatch')
    if set(source['checklists']) != {str(sid) for sid, *_ in SETS}:
        raise ValueError('Unexpected checklist families')
    for dugout, proof in [(10783, 10784), (97124, 97125)]:
        dugout_rows = source['checklists'][str(dugout)]['rows']
        proof_rows = source['checklists'][str(proof)]['rows']
        if [[cell.casefold() for cell in row] for row in dugout_rows] != [
            [cell.casefold() for cell in row] for row in proof_rows
        ]:
            raise ValueError('Dugout and Artist’s Proof subjects differ')
    if parse_subject('Chris Sale RC') != ('Chris Sale', {'RC'}, ''):
        raise ValueError('Rookie tag parsing failed')
    if parse_subject('George Kell') != ('George Kell', set(), ''):
        raise ValueError('Name parsing failed')

    cards = []
    product_sets = []
    for sid, title, count, series, physical_odds, channel in SETS:
        section = source['checklists'][str(sid)]
        expected = ['2131'] if sid == 2131 else [str(n) for n in range(1, count + 1)]
        if [r[0] for r in section['rows']] != expected:
            raise ValueError(f'{title}: unexpected card numbering')
        slug = re.sub(r'[^a-zA-Z0-9 ]', '', title)
        key = slug.lower().replace(' ', '-')
        for number, label, *teams in section['rows']:
            player, tags, error = parse_subject(label)
            team = ' / '.join(part.strip() for part in teams[0].split('/')) if teams else ''
            subset = ''
            variant = f'UER: {error}' if error else ''
            if sid == 749:
                if ('RC' in tags) != (number in ROOKIES):
                    raise ValueError(f'Base #{number}: rookie classification mismatch')
                if number in ROOKIES:
                    player += ' RC'
                if 193 <= int(number) <= 202:
                    subset = 'Radar Rating'
                elif 356 <= int(number) <= 385:
                    subset = 'Star Struck'
                elif 220 <= int(number) <= 268 or 491 <= int(number) <= 510:
                    subset = 'Rookies'
                elif ' Checklist CL' in label:
                    player, variant = label.split(' CL', 1)
                    subset = 'Checklist'
                if number == '148':
                    variant = 'UER: Birthplace should be Cincinnati'
                elif number == '339':
                    variant = 'UER: Birthplace should be San Juan, Puerto Rico'
            elif sid == 2131:
                player, variant = 'Cal Ripken Jr.', 'Short print'
            elif sid in PARALLELS:
                subset = 'Star Struck' if 'SS' in tags else 'Rookies' if 'ROO' in tags else ''
            if team == 'Minnesota twins':
                team = 'Minnesota Twins'
            if 'Houston Astros' in team.split(' / '):
                player = player.replace('Brian Hunter', 'Brian L. Hunter')
            if sid == 759 and number == '9':
                team = 'Florida Marlins / Colorado Rockies'
            if not player or (not team and subset != 'Checklist'):
                raise ValueError(f'{title} #{number}: missing subject or team')
            cards.append([key, number, player, team, subset, variant])

        kind = 'BASE' if sid == 749 else 'PARALLEL' if sid in PARALLELS else 'INSERT'
        odds = round(physical_odds * 517 / SERIES_SIZE[series]) if physical_odds else None
        notes = f'Physical Series {series} {channel}: 1:{physical_odds}. Combined VCS pack: 1:{odds}.' if odds else 'Complete Series One #1–275 and Series Two #276–517.'
        if sid == 2131:
            notes += ' Physical Series One Jumbo: 1:150.'
        product_sets.append(dict(
            key=key, id=f'{PRODUCT}_{slug.replace(" ", "_")}', name=title, kind=kind,
            oddsPerPack=odds, defaultGradeability='COMMON', sourceUrl=section['sourceUrl'],
            expectedCards=count, notes=notes,
        ))

    if len(cards) != 1169 or sum(r[2].endswith(' RC') for r in cards) != 8:
        raise ValueError('Unexpected total or true rookie count')
    bundle = {
        'schemaVersion': 2, 'status': 'DRAFT',
        'source': {
            'checklistUrl': source['checklists']['749']['sourceUrl'],
            'rookiesUrl': 'https://www.tcdb.com/Rookies.cfm/sid/749/1996-Score',
            'relatedSetsUrl': 'https://www.tcdb.com/Inserts.cfm/sid/749/1996-Score',
            'crossCheckUrl': 'https://baseballcardpedia.com/index.php/1996_Score',
        },
        'decisions': {
            'packFormat': 'VCS four-card packs, 36 packs per box. Physical hobby packs had 10 cards.',
            'collation': 'One universal pack. Series odds are weighted by 275/517 and 242/517 and rounded to whole denominators. Channel-exclusive inserts stay available at their weighted channel odds.',
            'baseStructure': 'One 517-card Base checklist with equal base availability. Four independently numbered 110-card Dugout and Artist’s Proof checklists.',
            'reflextions': 'Use 20 numbered entries from both checklists. The 18 in the BaseballCardPedia odds table conflicts with its own checklist.',
            'rookieLabels': 'Use TCDB’s eight recognized true rookie cards, only on Base. Rookie-themed subset cards such as Derek Jeter #240 do not receive RC.',
            'exclusions': 'Exclude the two separately distributed Samples promotional checklists.',
        },
        'product': dict(id=PRODUCT, year=1996, brand='Score', sport='Baseball',
                        cardsPerPack=4, packsPerBox=36, packPriceCents=0,
                        autoPackPricing=True, packImageUrl=None, boxImageUrl=None, released=False),
        'review': dict(teamData='COMPLETE', rookieData='VERIFIED', packImage='PENDING',
                       cardImages='PENDING', pricing='PENDING', release='BLOCKED'),
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
        raise SystemExit('Usage: generate-1996-score-baseball.py [--check]')
    for filename, content in build().items():
        path = DATA / filename
        if '--check' in sys.argv:
            if path.read_text(encoding='utf-8') != content:
                raise SystemExit(f'Stale generated file: {path}')
        else:
            path.write_text(content, encoding='utf-8')
    print('PASS: 1,169 cards, 16 complete checklists, eight verified base RCs.')
