#!/usr/bin/env python3
"""Reproduce the verified 1993 Score flagship and insert checklists."""
import csv
import json
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/set-factory'
STEM='1993-score-baseball'
EXPECTED={'base':660,'boys':30,'leaders':90,'franchise':28}
TAG=re.compile(r'\s+((?:(?:RC|RP|DPK|AS|AW|DT|HL|WSHL|MOY|UER|ERR|COR|VAR)(?:,\s*|\s+|$))+)$')


def split_label(label):
    m=TAG.search(label)
    return (label[:m.start()],m[1]) if m else (label,'')


def generate():
    for name in ['Ken Boswell','Marshall','John Marshall','Jim Hall','Mel Hall']:
        assert split_label(name)==(name,'')
        assert split_label(name+' AS')==(name,'AS')
    assert split_label('Derek Jeter DPK, RC')==('Derek Jeter','DPK, RC')
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
                for token,title in {'RP':'Rookie Prospects','DPK':'Draft Picks','AS':'All-Star Caricatures','AW':'Award Winners','DT':'Dream Team','HL':'Highlights','WSHL':'1992 World Series Highlights'}.items():
                    if re.search(r'\b'+token+r'\b',flags):subset=title;break
                if re.search(r'\bRC\b',flags):name+=' RC'
                award={481:'AL MVP',482:'NL MVP',483:'AL Cy Young',484:'NL Cy Young',485:'AL Rookie of the Year',486:'NL Rookie of the Year'}.get(int(number))
                if award:note='; '.join(filter(None,[note,award]))
                if re.search(r'\bMOY\b',flags):note='; '.join(filter(None,[note,'Manager of the Year']))
            if not row['team']:raise ValueError('Missing team '+key+number)
            if re.search(r'\b(ERR|COR|UER|VAR|DPK|RP|WSHL)\b',name):raise ValueError('Unclean name '+name)
            cards[number]=dict(setKey=key,cardNumber=number,player=name,team=row['team'],subset=subset,variant=note)
        assert set(cards)==set(map(str,range(1,count+1)))
        if key=='base':
            assert cards['489']['player']=='Derek Jeter RC'
            assert cards['286']['player']=='Mike Piazza'  # Rookie Prospect, not true RC.
            assert sum(c['subset']=='Draft Picks' for c in cards.values())==15
        result.extend(cards.values())
    assert len(result)==808
    return result


if __name__=='__main__':
    cards=generate()
    if '--self-test' not in sys.argv:
        with (DATA/(STEM+'.cards.csv')).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=['setKey','cardNumber','player','team','subset','variant'])
            writer.writeheader();writer.writerows(cards)
    print('PASS: 808 cards (660 Base + 90 Stat Leaders + 28 Franchise + 30 Boys of Summer); IDs, teams, clean names and RC labels validated.')
