#!/usr/bin/env python3
"""Reproduce the collector checklist from the verified offline source snapshot."""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/set-factory'
STEM = '1982-donruss-baseball'
RATED = set()
RANGES = ['27-130', '131-234', '235-338', '339-442', '443-544', '545-653']
TAG = re.compile(r'\s+((?:(?:DK|RR|RC|MGR|CO|CPC|PUZ|MAS|CL|VAR|ERR|COR|UER)(?:,\s*|\s+|$))+)$')


def split_label(label):
    marker = TAG.search(label)
    return (label[:marker.start()], marker[1]) if marker else (label, '')


def generate():
    for name in ['Ken Boswell', 'Marshall', 'John Marshall', 'Jim Hall', 'Mel Hall']:
        assert split_label(name) == (name, '')
        assert split_label(name + ' CL') == (name, 'CL')
    assert split_label('Tony Gwynn RC') == ('Tony Gwynn', 'RC')
    source = json.loads((DATA / (STEM + '.source.json')).read_text())
    assert len(source['rows']) == 668
    cards = {}
    for row in source['rows']:
        number, label = row['number'], row['label']
        checklist = 'Checklist' in label
        if checklist:
            if 'Diamond Kings Checklist' in label:
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
            name = 'Diamond Kings Checklist' if key == 'CL-DK' else 'Checklist'
            note = '; '.join(filter(None, [label.split(' DK')[0].split(' CL')[0], 'Printed number: unnumbered', note]))
        specials = {
            '558': ('Ron Guidry / Tommy John', 'Yankee Winners'),
            '575': ('Reggie Jackson / Dave Winfield', 'Bronx Bombers'),
            '585': ('Pete Rose / Mike Schmidt', 'Phillies Finest'),
            '628': ('Tom Seaver / Johnny Bench', 'Pride of the Reds'),
        }
        if key in specials: name, subset = specials[key]
        if key == '531':
            name, subset = 'The Chicken', 'Mascot'
            note = '; '.join(filter(None, [note, 'Independent mascot; no team affiliation (intentionally blank).']))
        if re.search(r'\bRC\b', flags): name += ' RC'
        if re.search(r'\bMGR\b', flags): name += ' MGR'
        if re.search(r'\bCO\b', flags): name += ' CO'
        if not row['team'] and not checklist and key != '531':
            raise ValueError('Missing team: ' + key)
        cards[key] = dict(setKey='base', cardNumber=key, player=name, team=row['team'], subset=subset, variant=note)
    assert set(cards) == set(map(str, range(1,654))) | {'CL-DK'} | {'CL'+str(n) for n in range(1,7)}
    assert len(cards) == 660
    assert sum(not c['team'] for c in cards.values()) == 8
    for number, player in {'73':'Dave Righetti RC','252':'Lee Smith RC','405':'Cal Ripken, Jr. RC','410':'Dave Stewart RC','557':'Kent Hrbek RC','627':'Terry Francona RC'}.items():
        assert cards[number]['player'] == player
    assert sum(c['subset'] == 'Rated Rookies' for c in cards.values()) == 0
    assert cards['579']['player'] == 'Cal Ripken, Sr. CO'
    assert all(not cards[n]['player'].endswith(' RC') for n in ['558','575','585','628'])
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
