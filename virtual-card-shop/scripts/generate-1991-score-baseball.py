#!/usr/bin/env python3
"""Build verified collector-facing checklists from checked-in source data."""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/set-factory'
STEM = '1991-score-baseball'
EXPECTED = {'base':893, 'magic':72, 'hot':10, 'mantle':7, 'auto':7}
TAG = re.compile(r'\s+((?:(?:RC|RP|FRDP|AS|MB|KM|RIF|NHC|FRAN|AW|DT|HL|WS|CY|MOY|ROY|MVP|ERR|COR|UER|VAR)(?:,\s*|\s+|$))+)$')
SUBSETS = {'RP':'Rookie Prospects','FRDP':'First Draft Picks','AS':'All-Stars','MB':'Master Blasters','KM':'K-Men','RIF':'Rifleman','NHC':'No-Hitters','FRAN':'Franchise','AW':'Award Winners','DT':'Dream Team','HL':'1990 Highlights','WS':'1990 World Series'}


def split_label(label):
    m = TAG.search(label)
    return (label[:m.start()], m[1]) if m else (label, '')


def generate():
    for name in ['Ken Boswell','Marshall','John Marshall','Jim Hall','Mel Hall']:
        assert split_label(name) == (name,'')
        assert split_label(name + ' AS') == (name,'AS')
    assert split_label('Mike Mussina FRDP, RC') == ('Mike Mussina','FRDP, RC')
    source = json.loads((DATA / (STEM + '.source.json')).read_text())
    result = []
    for key, count in EXPECTED.items():
        cards = {}
        assert len(source[key]) == (897 if key == 'base' else count)
        for row in source[key]:
            number = re.sub('[ab]$','',row['number'])
            if number in cards and not row['number'].endswith('b'):
                raise ValueError('Unexpected duplicate: ' + key + number)
            name, flags = split_label(row['label'])
            subset, note = '', row['note']
            if key == 'base':
                for token, title in SUBSETS.items():
                    if re.search(r'\b'+token+r'\b',flags):
                        subset = title
                        break
                if re.search(r'\bRC\b',flags): name += ' RC'
                awards = [t for t in ['CY','MOY','ROY','MVP'] if re.search(r'\b'+t+r'\b',flags)]
                if awards: note = '; '.join(filter(None,[note,', '.join(awards)]))
                if number == '841':
                    name, subset = 'Ken Griffey, Jr. / Ken Griffey, Sr.', 'The Griffeys'
                if number == '737': subset = 'American Flag Tribute'
            elif key in {'mantle','auto'}:
                title = re.split(r'\s+(?:AU|PR5500)\b',row['label'])[0].strip()
                name, subset = 'Mickey Mantle', title
                note = 'PR5500 (not serial numbered)' if key == 'mantle' else 'Autograph; SN2500 aggregate series; PR356 per subject'
            if not row['team'] and not ((key=='base' and number=='737') or (key=='magic' and 57<=int(number)<=72)):
                raise ValueError('Missing team: '+key+number)
            if re.search(r'\b(ERR|COR|UER|VAR|FRDP|RP|PR5500|SN2500)\b',name):
                raise ValueError('Unclean subject: '+name)
            cards[number] = dict(setKey=key,cardNumber=number,player=name,team=row['team'],subset=subset,variant=note)
        assert set(cards) == set(map(str,range(1,count+1)))
        if key == 'base':
            assert cards['383']['player'] == 'Mike Mussina RC'
            assert cards['671']['player'] == 'Chipper Jones RC'
            assert cards['737']['player'] == 'American Flag'
        result.extend(cards.values())
    assert [c['subset'] for c in result if c['setKey']=='mantle'] == [c['subset'] for c in result if c['setKey']=='auto']
    assert len(result) == 989
    assert sum(not c['team'] for c in result) == 17
    return result


if __name__ == '__main__':
    cards = generate()
    if '--self-test' not in sys.argv:
        with (DATA / (STEM+'.cards.csv')).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader()
            writer.writerows(cards)
    print('PASS: 989 cards across five sets; counts, identifiers, RC labels, clean names and 17 intentional non-team subjects validated.')
