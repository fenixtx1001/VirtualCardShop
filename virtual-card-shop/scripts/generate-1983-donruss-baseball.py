#!/usr/bin/env python3
"""Reproduce the collector checklist from the verified offline source snapshot."""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/set-factory'
STEM = '1983-donruss-baseball'
RATED = {'52', '126', '547', '574', '579', '649'}
RANGES = ['27-130', '131-234', '235-338', '339-442', '443-546', '547-653']
TAG = re.compile(r'\s+((?:(?:DK|RR|RC|MGR|PUZ|MAS|CL|VAR|ERR|COR|UER)(?:,\s*|\s+|$))+)$')


def split_label(label):
    marker = TAG.search(label)
    return (label[:marker.start()], marker[1]) if marker else (label, '')


def generate():
    for name in ['Ken Boswell', 'Marshall', 'John Marshall', 'Jim Hall', 'Mel Hall']:
        assert split_label(name) == (name, '')
        assert split_label(name + ' CL') == (name, 'CL')
    assert split_label('Tony Gwynn RC') == ('Tony Gwynn', 'RC')
    source = json.loads((DATA / (STEM + '.source.json')).read_text())
    assert len(source['rows']) == 670
    cards = {}
    for row in source['rows']:
        number, label = row['number'], row['label']
        checklist = 'Checklist' in label
        if checklist:
            if 'DK Checklist' in label:
                key = 'CL-DK'
            else:
                match = re.search(r'Checklist: (\d+-\d+)', label)
                if not match: raise ValueError('Ambiguous checklist: ' + label)
                key = 'CL' + str(RANGES.index(match[1]) + 1)
        else:
            key = re.sub(r'[a-z]$', '', number)
        if key in cards and not (re.search(r'[bc]$', number) or key == 'CL-DK'):
            raise ValueError('Unexpected duplicate: ' + key)
        name, flags = split_label(label)
        subset = 'Checklist' if checklist else 'Diamond Kings' if int(key) <= 26 else 'Rated Rookies' if key in RATED else ''
        note = row['note']
        if checklist:
            name = 'Dick Perez / Diamond Kings Checklist' if key == 'CL-DK' else 'Checklist'
            note = '; '.join(filter(None, [label.split(' DK')[0].split(' CL')[0], 'Printed number: unnumbered', note]))
        if key == '613': name, subset = 'Phil Niekro / Joe Niekro', 'Niekro Brothers'
        if key == '648': name, subset = 'Frank Robinson / Vida Blue / Joe Morgan', 'MVPs'
        if key == '645':
            name, subset = 'The Chicken', 'Mascot'
            note = 'Independent mascot; no team affiliation (intentionally blank).'
        if re.search(r'\bRC\b', flags): name += ' RC'
        if re.search(r'\bMGR\b', flags): name += ' MGR'
        if not row['team'] and not checklist and key != '645':
            raise ValueError('Missing team: ' + key)
        cards[key] = dict(setKey='base', cardNumber=key, player=name, team=row['team'], subset=subset, variant=note)
    assert set(cards) == set(map(str, range(1,654))) | {'CL-DK'} | {'CL'+str(n) for n in range(1,7)}
    assert len(cards) == 660
    assert sum(not c['team'] for c in cards.values()) == 8
    for number, player in {'277':'Ryne Sandberg RC','586':'Wade Boggs RC','598':'Tony Gwynn RC'}.items():
        assert cards[number]['player'] == player
    assert sum(c['subset'] == 'Rated Rookies' for c in cards.values()) == 6
    assert not cards['613']['player'].endswith(' RC')
    assert not cards['648']['player'].endswith(' RC')
    assert all(not re.search(r'\b(ERR|COR|UER|VAR)\b', c['player']) for c in cards.values())
    return list(cards.values())


if __name__ == '__main__':
    cards = generate()
    if '--self-test' not in sys.argv:
        with (DATA / (STEM + '.cards.csv')).open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader()
            writer.writerows(cards)
    print('PASS: 660 unique cards, 653 numbered + 7 checklists; RC, subsets, clean names and intentional mascot/team exception validated.')
