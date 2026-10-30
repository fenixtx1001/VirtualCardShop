#!/usr/bin/env python3
"""Generate 1994 Score base and inserts; Gold Rush derives from complete base."""
import csv
import json
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/set-factory'
STEM='1994-score-baseball'
EXPECTED={'base':660,'boys':60,'dream':10,'stars':60,'cycle':20}
TAG=re.compile(r'\s+((?:(?:RC|RP|ROO|DPK|DP|CL|STAD|SH|MVP|CY|ROY|UER|ERR|COR|VAR|PR\d+)(?:,\s*|\s+|$))+)$')


def split_label(label):
    m=TAG.search(label)
    return (label[:m.start()],m[1]) if m else (label,'')


def generate():
    for name in ['Ken Boswell','Marshall','John Marshall','Jim Hall','Mel Hall']:
        assert split_label(name)==(name,'')
        assert split_label(name+' CL')==(name,'CL')
    assert split_label('Billy Wagner DPK, RC')==('Billy Wagner','DPK, RC')
    source=json.loads((DATA/(STEM+'.source.json')).read_text())
    result=[]
    for key,count in EXPECTED.items():
        assert len(source[key])==count
        cards={}
        for row in source[key]:
            number=row['number']
            if number in cards:raise ValueError('Duplicate '+key+number)
            name,flags=split_label(row['label'])
            subset,note='',row['note']
            if key=='base':
                for token,title in {'RP':'Rookie Prospects','ROO':'Rookies','DPK':'Draft Picks','DP':'Draft Picks','CL':'Team Checklist / Stadium','STAD':'Team Checklist / Stadium','SH':'Season Highlights','MVP':'Award Winners','CY':'Award Winners','ROY':'Award Winners'}.items():
                    if re.search(r'\b'+token+r'\b',flags):subset=title;break
                if number in source['stadiums']:
                    note='; '.join(filter(None,[note,'Stadium: '+source['stadiums'][number]]))
                if re.search(r'\bRC\b',flags):name+=' RC'
                awards=[t for t in ['MVP','CY','ROY'] if re.search(r'\b'+t+r'\b',flags)]
                if awards:note='; '.join(filter(None,[note,', '.join(awards)]))
            if key=='stars':note='; '.join(filter(None,[note,'PR6500 (not serial numbered)']))
            if not row['team']:raise ValueError('Missing team '+key+number)
            if re.search(r'\b(ERR|COR|UER|VAR|DPK|RP|STAD|PR6500)\b',name):raise ValueError('Unclean name '+name)
            cards[number]=dict(setKey=key,cardNumber=number,player=name,team=row['team'],subset=subset,variant=note)
        expected={'TC'+str(n) for n in range(1,21)} if key=='cycle' else set(map(str,range(1,count+1)))
        assert set(cards)==expected
        if key=='base':
            assert cards['486']['player']=='Trot Nixon RC'
            assert cards['536']['player']=='Billy Wagner RC'
            assert 'RC' not in cards['636']['player']  # Piazza ROY is not a rookie card.
            assert sum(c['subset']=='Team Checklist / Stadium' for c in cards.values())==28
        result.extend(cards.values())
    assert len(result)==810
    return result


if __name__=='__main__':
    cards=generate()
    if '--self-test' not in sys.argv:
        with (DATA/(STEM+'.cards.csv')).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader();writer.writerows(cards)
    print('PASS: 810 explicit cards + 660 derived Gold Rush = 1470 total; IDs, teams, RC flags and clean names validated.')
