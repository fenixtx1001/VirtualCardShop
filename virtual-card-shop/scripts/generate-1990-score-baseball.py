#!/usr/bin/env python3
"""Generate verified base and pack-insert checklists from an offline snapshot."""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/set-factory'
STEM = '1990-score-baseball'
EXPECTED = {'base': 704, 'magic': 56, 'young': 42}
TAG = re.compile(r'\s+((?:(?:RC|ROO|FRDP|DT|ASG|MVP|ALCS|NLCS|WS|HL|UER|ERR|COR|VAR)(?:,\s*|\s+|$))+)$')


def split_label(label):
    m = TAG.search(label)
    return (label[:m.start()], m[1]) if m else (label, '')


def generate():
    for name in ['Ken Boswell', 'Marshall', 'John Marshall', 'Jim Hall', 'Mel Hall']:
        assert split_label(name) == (name, '')
        assert split_label(name + ' DT') == (name, 'DT')
    assert split_label('Frank Thomas FRDP, RC') == ('Frank Thomas', 'FRDP, RC')
    source = json.loads((DATA / (STEM + '.source.json')).read_text())
    result = []
    for set_key, count in EXPECTED.items():
        cards = {}
        assert len(source[set_key]) == (722 if set_key == 'base' else count)
        for row in source[set_key]:
            number = re.sub(r'[ab]$', '', row['number'])
            if number in cards and not row['number'].endswith('b'):
                raise ValueError('Unexpected duplicate: ' + set_key + ' ' + number)
            name, flags = split_label(row['label'])
            subset, note = '', row['note']
            team = row['team']
            if set_key == 'base':
                n = int(number)
                if 580 <= n <= 657: subset = '1990 Rookies'
                elif 661 <= n <= 682: subset = 'Draft Picks'
                elif 683 <= n <= 695: subset = 'Dream Team'
                elif 700 <= n <= 703: subset = '1989 World Series'
                elif n in {561,566,696,698,699,704}: subset = 'Highlights'
                if n == 697:
                    name, subset = 'Bo Jackson', 'BO'
                    teams = {x['team'] for x in source['base'] if x['label'].startswith('Bo Jackson ')}
                    assert teams == {'Kansas City Royals'}
                    team = next(iter(teams))
                    note = 'Baseball/football portrait; baseball affiliation from same-set Bo Jackson cards #280, #566 and #687.'
                world_series = {'700': 'Dave Stewart / Mike Moore', '701': 'Candlestick Park', '702': 'Jose Canseco / Dave Henderson / Rickey Henderson / Carney Lansford', '703': 'Oakland Athletics'}
                if number in world_series:
                    name = world_series[number]
                    note = '; '.join(filter(None, [row['label'].removesuffix(' WS'), note]))
                if n == 566: note = 'All-Star Game MVP'
                if n == 698: note = 'ALCS MVP'
                if n == 699: note = 'NLCS MVP'
            if re.search(r'\bRC\b', flags): name += ' RC'
            if not team:
                raise ValueError('Missing team: ' + set_key + ' #' + number)
            if re.search(r'\b(ERR|COR|UER|VAR|TRIB|RP|HL)\b', name):
                raise ValueError('Unclean name: ' + name)
            cards[number] = dict(setKey=set_key, cardNumber=number, player=name, team=team, subset=subset, variant=note)
        assert set(cards) == set(map(str, range(1,count+1)))
        if set_key == 'base':
            for number, player in {'558':'Sammy Sosa RC','589':'John Olerud RC','631':'Larry Walker RC','650':'Dave Justice RC','663':'Frank Thomas RC'}.items():
                assert cards[number]['player'] == player
            assert cards['697']['player'] == 'Bo Jackson'
            assert cards['697']['team'] == 'Kansas City Royals'
            assert sum(c['subset'] == 'Draft Picks' for c in cards.values()) == 22
            assert sum(c['subset'] == 'Dream Team' for c in cards.values()) == 13
        result.extend(cards.values())
    assert len(result) == 802
    return result


if __name__ == '__main__':
    cards = generate()
    if '--self-test' not in sys.argv:
        with (DATA / (STEM + '.cards.csv')).open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader()
            writer.writerows(cards)
    print('PASS: 802 cards (704 Base + 56 Magic Motion + 42 Young Superstars); numbering, teams, clean names and RC flags validated.')
