#!/usr/bin/env python3
"""Generate complete, verified flagship and pack-insert checklists."""
import csv
import json
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/set-factory'
STEM='1992-score-baseball'
EXPECTED={'base':893,'impact':90,'knoblauch':1,'hot':10,'dimaggio':5,'dimaggio-auto':5,'franchise':4,'franchise-auto':4}
TAG=re.compile(r'\s+((?:(?:RC|RP|FRDP|AS|DT|HL|NHC|CY|MOY|MVP|ROY|AU|SN\d+|PR\d+|ERR|COR|UER|VAR)(?:,\s*|\s+|$))+)$')


def split_label(label):
    m=TAG.search(label)
    return (label[:m.start()],m[1]) if m else (label,'')


def generate():
    for name in ['Ken Boswell','Marshall','John Marshall','Jim Hall','Mel Hall']:
        assert split_label(name)==(name,'')
        assert split_label(name+' AS')==(name,'AS')
    assert split_label('Manny Ramirez FRDP, RC')==('Manny Ramirez','FRDP, RC')
    source=json.loads((DATA/(STEM+'.source.json')).read_text())
    result=[]
    for key,count in EXPECTED.items():
        assert len(source[key])==(941 if key=='base' else count)
        cards={}
        for row in source[key]:
            number=re.sub('[ab]$','',row['number'])
            if number in cards:
                if not row['number'].endswith('b'): raise ValueError('Unexpected duplicate '+key+number)
                if 'Factory set version' in row['note']:
                    continue  # Prefer physically pack-distributed state.
            name,flags=split_label(row['label'])
            subset,note='',row['note']
            if key=='base':
                mapping={'RP':'Rookie Prospects','FRDP':'Draft Picks','AS':'All-Stars','DT':'Dream Team','HL':'Highlights','NHC':'No-Hit Club'}
                for token,title in mapping.items():
                    if re.search(r'\b'+token+r'\b',flags): subset=title;break
                if 878<=int(number)<=882: subset='Memorabilia'
                if re.search(r'\bRC\b',flags): name+=' RC'
                award=[t for t in ['CY','MOY','MVP','ROY'] if re.search(r'\b'+t+r'\b',flags)]
                if award: note='; '.join(filter(None,[note,', '.join(award)]))
            elif key=='dimaggio':
                subset=note
                note='PR30000 (not serial numbered)'
            elif key=='dimaggio-auto':
                subset=note
                note='Autograph; SN2500 aggregate five-subject series; five cards reserved as promotion prizes'
            elif key=='franchise': note='PR150000 (not serial numbered)'
            elif key=='franchise-auto': note='Triple autograph; SN500; gold ink' if number=='4' else 'Autograph; SN2000; blue ink'
            elif key=='knoblauch':
                note='Autograph; SN3000; gold ink; signed 1990 Score #672; 11 cards reserved as promotion prizes'
            if not row['team']: raise ValueError('Missing team '+key+number)
            if re.search(r'\b(ERR|COR|UER|VAR|AU|FRDP|RP|SN\d+|PR\d+)\b',name):raise ValueError('Unclean subject '+name)
            cards[number]=dict(setKey=key,cardNumber=number,player=name,team=row['team'],subset=subset,variant=note)
        expected={'672'} if key=='knoblauch' else set(map(str,range(1,count+1)))
        assert set(cards)==expected
        if key=='base':
            assert cards['800']['player']=='Manny Ramirez RC'
            assert cards['860']['player']=='Vinny Castilla RC'
            assert 'Pack version' in cards['893']['variant']
        result.extend(cards.values())
    assert len(result)==1012
    return result


if __name__=='__main__':
    cards=generate()
    if '--self-test' not in sys.argv:
        with (DATA/(STEM+'.cards.csv')).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader();writer.writerows(cards)
    print('PASS: 1012 cards across eight sets; identifiers, counts, teams, RC flags, pack print states and clean names validated.')
