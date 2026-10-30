#!/usr/bin/env python3
"""Generate verified base and pack-insert checklists from an offline snapshot."""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/set-factory'
STEM = '1988-score-baseball'
EXPECTED = {'base': 660, 'magic': 56, 'young': 40}
TAG = re.compile(r'\s+((?:(?:RC|RP|TRIB|AS|HL|UER|ERR|COR|VAR)(?:,\s*|\s+|$))+)$')


def split_label(label):
    m = TAG.search(label)
    return (label[:m.start()], m[1]) if m else (label, '')


def generate():
    for name in ['Ken Boswell', 'Marshall', 'John Marshall', 'Jim Hall', 'Mel Hall']:
        assert split_label(name) == (name, '')
        assert split_label(name + ' AS') == (name, 'AS')
    assert split_label('Tom Glavine RP, RC') == ('Tom Glavine', 'RP, RC')
    source = json.loads((DATA / (STEM + '.source.json')).read_text())
    result = []
    for set_key, count in EXPECTED.items():
        cards = {}
        assert len(source[set_key]) == (668 if set_key == 'base' else count)
        for row in source[set_key]:
            number = re.sub(r'[ab]$', '', row['number'])
            if number in cards and not row['number'].endswith('b'):
                raise ValueError('Unexpected duplicate: ' + set_key + ' ' + number)
            name, flags = split_label(row['label'])
            subset, note = '', row['note']
            if set_key == 'magic':
                m = re.fullmatch(r'(.+): (\d{2}/\d{2}/\d{4})', row['label'])
                if not m: raise ValueError('Malformed trivia subject/date')
                name = m[1]
                note = '; '.join(filter(None, [m[2], note]))
            elif set_key == 'base':
                n = int(number)
                if 500 <= n <= 504: subset = 'Reggie Jackson Tribute'
                elif 623 <= n <= 647: subset = 'Rookie Prospects'
                elif 648 <= n <= 651: subset = 'All-Stars'
                elif 652 <= n <= 660: subset = '1987 Season Highlights'
                if n == 651:
                    name = 'Tony Fernandez / Cal Ripken, Jr. / Alan Trammell'
                    note = '; '.join(filter(None, ['Super Shortstops', note]))
            if re.search(r'\bRC\b', flags): name += ' RC'
            if not row['team']:
                raise ValueError('Missing team: ' + set_key + ' #' + number)
            if re.search(r'\b(ERR|COR|UER|VAR|TRIB|RP|HL)\b', name):
                raise ValueError('Unclean name: ' + name)
            cards[number] = dict(setKey=set_key, cardNumber=number, player=name, team=row['team'], subset=subset, variant=note)
        assert set(cards) == set(map(str, range(1,count+1)))
        if set_key == 'base':
            for number, player in {'118':'Matt Williams RC', '164':'Ken Caminiti RC', '638':'Tom Glavine RC'}.items():
                assert cards[number]['player'] == player
            assert cards['297']['player'] == 'Terry Francona'
            assert cards['501']['team'] == 'Baltimore Orioles'
            assert all(' RC' not in cards[str(n)]['player'] for n in range(648,652))
            assert sum(c['subset'] == 'Rookie Prospects' for c in cards.values()) == 25
        result.extend(cards.values())
    assert len(result) == 756
    return result


if __name__ == '__main__':
    cards = generate()
    if '--self-test' not in sys.argv:
        with (DATA / (STEM + '.cards.csv')).open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader()
            writer.writerows(cards)
    print('PASS: 756 cards (660 Base + 56 Magic Motion + 40 Young Superstars); numbering, teams, clean names and RC flags validated.')
