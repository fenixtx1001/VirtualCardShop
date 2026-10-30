#!/usr/bin/env python3
"""Generate verified 1995 Score flagship and pack-distributed insert checklists."""
import csv
import json
import pathlib
import re
import sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/set-factory'
STEM='1995-score-baseball'
CONFIG={'base':(605,'',0),'draft':(18,'DP',0),'airmail':(18,'AM',2),'double':(12,'GC',0),'dream':(12,'DG',0),'hall':(110,'HG',0),'platinum-redemption':(1,'NNO',0),'rookie-dream':(12,'RDT',0),'rookie-greatness':(1,'RG',0),'rules':(30,'SR',0),'signed':(1,'SG',0),'hall-redemption':(1,'NNO',0),'trade-redemption':(1,'NNO',0)}
TAG=re.compile(r'\s+((?:(?:RC|ROO|SH|HIT|CL|TC|UER|ERR|COR|VAR|RDM|AU|SN\d+)(?:,\s*|\s+|$))+)$')

def split_label(label):
    m=TAG.search(label)
    return (label[:m.start()],m[1]) if m else (label,'')

def generate():
    for name in ['Ken Boswell','Marshall','John Marshall','Jim Hall','Mel Hall']:
        assert split_label(name)==(name,'')
        assert split_label(name+' CL')==(name,'CL')
    assert split_label('Ryan Klesko AU, SN6100')==('Ryan Klesko','AU, SN6100')
    source=json.loads((DATA/(STEM+'.source.json')).read_text())
    result=[]
    for key,(count,prefix,width) in CONFIG.items():
        assert len(source[key])==count
        cards={}
        for row in source[key]:
            number=row['number']
            if number in cards:raise ValueError('Duplicate '+key+number)
            name,flags=split_label(row['label']);note=row['note'];subset=''
            if key=='base':
                if re.search(r'\bCL\b',flags):
                    subset='Checklist';note='; '.join(filter(None,[name,note]));name='Checklist'
                elif re.search(r'\bHIT\b',flags):subset='Hitters Inc.'
                elif re.search(r'\bROO\b',flags):subset='Rookies'
                elif re.search(r'\bSH\b',flags):subset='Season Highlights'
                if re.search(r'\bRC\b',flags):name+=' RC'
            elif key=='signed':note='; '.join(filter(None,[note,'Autograph; SN6100']))
            elif key.endswith('redemption'):note='; '.join(filter(None,[note,'Physical redemption card only; no automated redemption functionality']))
            if not row['team'] and not ((key=='base' and subset=='Checklist') or key.endswith('redemption')):raise ValueError('Missing team '+key+number)
            if re.search(r'\b(ERR|COR|UER|VAR|RDM|AU|SN\d+)\b',name):raise ValueError('Unclean subject '+name)
            cards[number]=dict(setKey=key,cardNumber=number,player=name,team=row['team'],subset=subset,variant=note)
        expected={'NNO'} if prefix=='NNO' else {prefix+str(n).zfill(width) for n in range(1,count+1)}
        assert set(cards)==expected,(key,set(cards)^expected)
        if key=='base':assert cards['299']['player']=='Armando Benitez RC'
        result.extend(cards.values())
    assert len(result)==822
    assert sum(not c['team'] for c in result)==7
    return result

if __name__=='__main__':
    cards=generate()
    if '--self-test' not in sys.argv:
        with (DATA/(STEM+'.cards.csv')).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=['setKey','cardNumber','player','team','subset','variant']);writer.writeheader();writer.writerows(cards)
    print('PASS: 822 explicit cards + 605 derived Gold Rush = 1427 total; counts, IDs, teams, clean names and RC flags validated.')
