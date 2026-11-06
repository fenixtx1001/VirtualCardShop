#!/usr/bin/env python3
"""Generate a 660-card collector checklist from the checked-in source snapshot."""
import csv
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/set-factory'
STEM = '1986-donruss-baseball'


def generate():
    source = json.loads((DATA / (STEM + '.source.json')).read_text())
    cards = {}
    for row in source['rows']:
        number, label = row['number'], row['label']
        checklist = 'Checklist' in label
        key = ('CL-DK' if number == 'NNO' else 'CL' + re.sub('[ab]$', '', number)) if checklist else re.sub('[ab]$', '', number)
        # One canonical card per printed number. Prefer corrected/later state.
        if key in cards and not number.endswith('b'):
            raise ValueError('Unexpected duplicate: ' + key)
        marker = re.search(r'\s+(DK|RR|RC|P/MGR|CPC|PUZ|CL|ERR|COR|VAR|UER)(?:,|\s|$)', label)
        name = label[:marker.start()] if marker else label
        flags = label[marker.start():] if marker else ''
        subset = 'Checklist' if checklist else 'Diamond Kings' if key.isdigit() and int(key) <= 26 else 'Rated Rookies' if key.isdigit() and 27 <= int(key) <= 46 else 'King of Kings' if key == '653' else ''
        note = row['note']
        if checklist:
            name = 'Diamond Kings Checklist' if key == 'CL-DK' else 'Checklist'
            note = '; '.join(filter(None, [label.split(' CL')[0], 'Printed number: ' + number.rstrip('ab'), note]))
        if key == '645': name, subset = 'Phil Niekro / Joe Niekro', 'Knuckle Brothers'
        if key == '651': name, subset = 'Willie McGee / Vince Coleman', 'Fleet Feet'
        if re.search(r'\bRC\b', flags): name += ' RC'
        if not row['team'] and not checklist: raise ValueError('Missing team: ' + key)
        cards[key] = dict(setKey='base', cardNumber=key, player=name, team=row['team'], subset=subset, variant=note)
    assert len(cards) == 660, len(cards)
    assert set(cards) == set(map(str, range(1,654))) | {'CL-DK'} | {'CL'+str(n) for n in range(1,7)}
    assert cards['28']['player'] == 'Fred McGriff RC'
    assert cards['39']['player'] == 'Jose Canseco RC'
    assert cards['151']['player'] == 'Bill Buckner'  # Incorrect RC flag in secondary source.
    assert not cards['651']['player'].endswith(' RC')
    assert sum(not c['team'] for c in cards.values()) == 7
    assert all(not re.search(r'\b(ERR|COR|UER|VAR)\b', c['player']) for c in cards.values())
    return list(cards.values())


if __name__ == '__main__':
    import sys
    cards = generate()
    if '--self-test' not in sys.argv:
        with (DATA / (STEM + '.cards.csv')).open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader()
            writer.writerows(cards)
    print('PASS: 660 unique base cards; 653 numbered cards + 7 checklists; teams, RC labels and clean names validated.')
