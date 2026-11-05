#!/usr/bin/env python3
"""Generate the 1998 Fleer Tradition Baseball unreleased Set Factory draft.

The complete catalogued CSV is reconstructed from committed source records and
validated before writing. --check compares exact committed bytes; --self-test
also runs parser and corruption cases. --refresh-sources retrieves every source
and checks reviewed scan hashes. Missing/unexpected rows fail closed.
Flashback exchange inventory remains an explicit scope blocker in research.
No database access or deployment occurs in this generator.
"""
from __future__ import annotations
import argparse
import copy
import csv
import hashlib
import html
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'set-factory'
STEM = '1998-fleer-tradition-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1125
KNOWN_CLUBS = {
    "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
    "California Angels", "Chicago Cubs", "Chicago White Sox",
    "Cincinnati Reds", "Cleveland Indians", "Detroit Tigers",
    "Houston Astros", "Kansas City Royals", "Los Angeles Dodgers",
    "Milwaukee Brewers", "Minnesota Twins", "Montreal Expos",
    "New York Mets", "New York Yankees", "Oakland Athletics",
    "Philadelphia Phillies", "Pittsburgh Pirates", "St. Louis Cardinals",
    "San Diego Padres", "San Francisco Giants", "Seattle Mariners",
    "Texas Rangers", "Toronto Blue Jays",
    "Colorado Rockies", "Florida Marlins", "Anaheim Angels",
    "Arizona Diamondbacks", "Tampa Bay Devil Rays", "Brooklyn Dodgers", "New York Giants",
}
class Rows(HTMLParser):
    """Retain captions separately, including when source markup omits spaces."""

    def __init__(self, expected_sid=None):
        super().__init__()
        self.expected_sid = expected_sid
        self.card_sids = set()
        self.rows = []
        self.row = None
        self.cell = None
        self.caption = False
        self.link = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
            self.link = False
            self.card_sids = set()
        elif tag == 'td' and self.row is not None:
            self.cell = {'label': [], 'note': []}
        elif tag == 'figcaption' and self.cell is not None:
            self.caption = True
        elif tag == 'br' and self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(' ')
        elif tag == 'a' and self.row is not None:
            href = dict(attrs).get('href', '')
            if 'ViewCard.cfm' in href:
                self.link = True
                sid = re.search(r'/sid/(\d+)/', href)
                if sid:
                    self.card_sids.add(int(sid[1]))

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(data)

    def handle_endtag(self, tag):
        if tag == 'figcaption':
            self.caption = False
        elif tag == 'td' and self.cell is not None:
            self.row.append({k: ' '.join(''.join(v).split()) for k, v in self.cell.items()})
            self.cell = None
            self.caption = False
        elif tag == 'tr' and self.row is not None:
            if self.link:
                if self.expected_sid is not None and self.card_sids != {self.expected_sid}:
                    raise ValueError(f'Wrong source card-set namespace: {self.card_sids}; expected {self.expected_sid}')
                self.rows.append(self.row)
            self.row = None


NUM = re.compile(r'^(?:\d{1,3}(?:\s?[a-z]{1,3})?|NNO(?:\d+C?|[ -]?[AB])?)$', re.I)


def parse(raw, expected_sid=None):
    parser = Rows(expected_sid=expected_sid)
    parser.feed(raw)
    out = []
    for row in parser.rows:
        cells = [c for c in row if c['label']]
        matched = False
        for i, cell in enumerate(cells):
            if NUM.fullmatch(cell['label']) and i + 1 < len(cells):
                label = cells[i + 1]
                rest = cells[i + 2:]
                if len(rest) > 1:
                    raise ValueError(f'Unexpected checklist columns: {rest}')
                out.append([cell['label'].upper(), label['label'],
                            rest[0]['label'] if rest else '', label['note']])
                matched = True
                break
        if not matched:
            raise ValueError('Unparsed linked checklist row: ' + repr(cells))
    return out



SECTIONS = {'base': 'Base_Set', 'vintage': "Vintage_'63", 'diamond-standouts': 'Diamond_Standouts', 'diamond-tribute': 'Diamond_Tribute', 'in-the-clutch': 'In_The_Clutch', 'lumber-company': 'Lumber_Company', 'mantle-moments': 'Mickey_Mantle_Monumental_Moments', 'promising-forecasts': 'Promising_Forecast', 'rookie-sensations': 'Rookie_Sensations', 'power-game': 'The_Power_Game', 'zone': 'Zone', 'decade-of-excellence': 'Decade_of_Excellence', 'million-dollar-moments': 'Checklist'}
EXPECTED_COUNTS = {'base': 600, 'vintage': 128, 'classic': 128, 'decade-of-excellence': 12, 'decade-rare-traditions': 12, 'diamond-ink-1': 10, 'diamond-ink-5': 10, 'diamond-ink-10': 10, 'diamond-ink-25': 10, 'diamond-standouts': 20, 'diamond-tribute': 10, 'in-the-clutch': 15, 'lumber-company': 15, 'mantle-moments': 10, 'mantle-gold': 10, 'promising-forecasts': 20, 'rookie-sensations': 20, 'power-game': 20, 'zone': 15, 'million-dollar-moments': 50}
EXPECTED_ODDS = {'base': None, 'vintage': 1, 'classic': None, 'decade-of-excellence': 144, 'decade-rare-traditions': 1440, 'diamond-ink-1': None, 'diamond-ink-5': None, 'diamond-ink-10': None, 'diamond-ink-25': None, 'diamond-standouts': 24, 'diamond-tribute': 600, 'in-the-clutch': 40, 'lumber-company': None, 'mantle-moments': 136, 'mantle-gold': None, 'promising-forecasts': 24, 'rookie-sensations': 36, 'power-game': 72, 'zone': 576, 'million-dollar-moments': 2}
PARALLELS = {'classic', 'mantle-gold', 'decade-rare-traditions', 'vintage'}
ROOKIES = {'506', '273', '149', '123', '212', '36', '159', '147', '554', '513', '499', '88', '151', '269', '92', '425', '95', '186', '400', '235', '402', '558', '295', '480', '294'}
INK_PLAYERS = ['Alex Rodriguez', 'Greg Maddux', 'Jay Buhner', 'Jose Cruz, Jr.', 'Nomar Garciaparra', 'Roberto Hernandez', 'Roger Clemens', 'Scott Rolen', 'Tony Gwynn', 'Tony Womack']
NUMBER_SUFFIXES = {'decade-of-excellence': 'DE', 'decade-rare-traditions': 'DE', 'diamond-standouts': 'DS', 'diamond-tribute': 'DT', 'in-the-clutch': 'IC', 'lumber-company': 'LC', 'mantle-moments': 'MM', 'mantle-gold': 'MMG', 'promising-forecasts': 'PF', 'rookie-sensations': 'RS', 'power-game': 'PG', 'zone': 'Z'}
EXPECTED_IDS = {}
for _key, _count in EXPECTED_COUNTS.items():
    if _key == 'vintage':
        EXPECTED_IDS[_key] = {str(i) for i in range(1,127)} | {'NNO-A','NNO-B'}
    elif _key == 'classic':
        EXPECTED_IDS[_key] = {f'{i}C' for i in range(1,127)} | {'NNO1C','NNO2C'}
    elif _key.startswith('diamond-ink-'):
        EXPECTED_IDS[_key] = {f'NNO-{i:02d}' for i in range(1,11)}
    else:
        EXPECTED_IDS[_key] = {str(i) + (' ' + NUMBER_SUFFIXES[_key] if _key in NUMBER_SUFFIXES else '') for i in range(1,_count+1)}

TAGS = r'(?:RC|MLD|ROO|ED|TR|SH|GM|TT|UM|SP|SSP|CL|UER|ERR|COR|VAR|RDM|AU|LL|AS|SN\d+)'
TRAILING = re.compile(r'\s+(' + TAGS + r'(?:,?\s+' + TAGS + r')*)$',re.I)

def require(condition,message):
    if not condition:
        raise ValueError(message)

def split_label(label):
    label=' '.join(label.split())
    match=TRAILING.search(label)
    return (label[:match.start()],set(re.split(r',?\s+',match[1].upper()))) if match else (label,set())

def clean_name(label):
    return split_label(label)[0]

def is_team(value):
    return bool(value) and all(v in KNOWN_CLUBS for v in value.split(' / '))

def is_checklist(name,subset=''):
    return 'checklist' in (name+' '+subset).lower()

def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=35) as response:
            return response.read().decode('utf8','replace')
    except Exception as exc:
        raise RuntimeError(f'Source retrieval failed: {url}: {exc}; no partial CSV written') from exc

def independent_rows(raw,key):
    section=SECTIONS[key]
    part=raw[raw.index('id="'+section+'"'):]
    if key=='base':
        part=part[:part.index('id="Parallels"')]
    else:
        boundary=re.search(r'<h[23](?:\s|>)',part)
        if boundary:
            part=part[:boundary.start()]
    rows=[html.unescape(re.sub('<[^>]+>','',r)).strip() for r in re.findall('<li>(.*?)</li>',part,re.S)]
    return [r for r in rows if re.match(r'^(?:\d+|NNO)\s',r)]

def scope_facts(raw,key):
    plain=' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())
    if key=='scope-flashback-description':
        require('50 hand-numbered Fleer Flashback Exchange cards' in plain and '1981 to 1993' in plain,'Flashback scope evidence changed')
        return ['50 hand-numbered Fleer Flashback Exchange cards; exchange for framed uncut press sheet from 1981-1993; individual card inventory/numbering not verified']
    require('one of ten Major League stars' in plain and '1, 5, 10, and 25' in plain and '500 points' in plain,'Diamond Ink program changed')
    require('Greg Maddux' in plain and 'only in 1998 Fleer Tradition Series One packs' in plain,'Maddux program scope changed')
    return ['Ten players; 1, 5, 10 and 25 point denominations; 500 points of same player exchanged for autographed baseball','Greg Maddux point cards available only in 1998 Fleer Tradition Series One packs']

def refresh_sources(snapshot):
    changed=copy.deepcopy(snapshot)
    urls=sorted({entry['url'].split('#',1)[0] for entry in changed['sources'].values()})
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:
        cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,entry in changed['sources'].items():
        url=entry['url'].split('#',1)[0]
        require('BasicID=' not in url,'Unverified checklist filter')
        raw=cache[url]
        if key.startswith('bcp-'):
            rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key in {'scope-flashback-description','scope-diamond-ink-program'}:
            rows=scope_facts(raw,key)
        else:
            rows=parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',url)[1]))
        entry['records']=rows
        entry['sha256']=hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(rows)} records',flush=True)
    for entry in changed.get('reviewedScanEvidence',[]):
        request=urllib.request.Request(entry['url'],headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=35) as response:
            require(hashlib.sha256(response.read()).hexdigest()==entry['sha256'],'Reviewed card scan changed: '+entry['url'])
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat()
    return changed

def records(snapshot,key):
    entry=snapshot['sources'][key]
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid source provenance: '+key)
    return entry['records']

def normalized(name):
    aliases={'Javy Lopez':'Javier Lopez','Bob Higginson':'Bobby Higginson','Dave Justice':'David Justice','Bob Abreu':'Bobby Abreu'}
    name=aliases.get(name,name)
    return re.sub('[^a-z0-9]','',name.lower())

def same_people(a,b):
    return sorted(normalized(x.strip()) for x in a.split(' / '))==sorted(normalized(x.strip()) for x in b.split(' / '))

def subset_for(number,tags):
    n=int(number)
    if 301<=n<=310:return "Smoke 'n Heat"
    if 311<=n<=320:return 'Golden Memories'
    if 321<=n<=340:return 'Tale of the Tape'
    if 341<=n<=350 or 571<=n<=575:return 'Checklist'
    if 576<=n<=600:return 'Unforgettable Moments'
    if 'MLD' in tags and n!=63:return '1997 Debut'
    if 'ROO' in tags:return 'Rookie'
    return ''

def row_for(key,number,label,team,note='',rookie=False):
    name,tags=split_label(label)
    subset=''
    notes=[note] if note else []
    require('AU' not in tags,'No pack-issued autograph card family verified')
    if key=='base':
        n=int(number)
        subset=subset_for(number,tags)
        if n==63:
            require(name=='Darrin Fletcher' and 'MLD' in tags,'Reviewed Fletcher annotation changed')
        if 'ED' in tags:notes.append('Expansion Draft')
        if 'TR' in tags:notes.append('Traded')
        if 311<=n<=340 or 576<=n<=600:
            notes.append('Short print')
    elif key in {'vintage','classic'}:
        if number in {'NNO-A','NNO1C','NNO-B','NNO2C'}:
            which=1 if number in {'NNO-A','NNO1C'} else 2
            name='Checklist'
            subset='Checklist'
            notes.append('Checklist: '+('1-63' if which==1 else '64-126'))
        if key=='classic':
            require('SN63' in tags,'Unverified Classic print run: '+number)
            notes.append('Serial numbered /63')
    elif key=='mantle-gold':
        require('SN51' in tags,'Unverified Mantle Gold print run: '+number)
        notes.append('Serial numbered /51')
    elif key.startswith('diamond-ink-'):
        require('RDM' in tags and not team and name in INK_PLAYERS,'Unreviewed Diamond Ink token')
        subset='Diamond Ink'
        point=int(key.rsplit('-',1)[1])
        notes.append(str(point)+' '+('point' if point==1 else 'points')+'; physical redemption token')
    if key in {'mantle-moments','mantle-gold'} and number in {'3 MM','3 MMG'}:
        require(name=='Mickey Mantle' and team=='New York Yankees','Reviewed Mantle #3 changed')
        name='Mickey Mantle / Phil Rizzuto'
    if key=='million-dollar-moments':
        if 'CL' in tags:subset='Checklist'
        notes.append('Original game-card back; shared 1997-98 issue')
    if 'SP' in tags:notes.append('Short print')
    if 'SSP' in tags:notes.append('Super short print')
    if rookie:name+=' RC'
    require(name and not re.search(r'\b(?:MLD|ROO|UER|ERR|COR|VAR|RDM|AU|SN\d+)\b',name),'Unclean player/subject: '+name)
    require(not team or is_team(team),'Unknown historical team: '+key+' #'+number+' '+team)
    allow_ink=key.startswith('diamond-ink-') and name in INK_PLAYERS
    require(team or is_checklist(name,subset) or allow_ink,'Missing team: '+key+' #'+number)
    return [key,number,name,team,subset,'; '.join(dict.fromkeys(n for n in notes if n))]

def base_and_rookies(snapshot):
    base=[r for page in range(1,8) for r in records(snapshot,f'base-{page}')]
    require(len(base)==600 and {r[0] for r in base}=={str(i) for i in range(1,601)} and not records(snapshot,'base-7'),'Incomplete/duplicate base retrieval')
    indexed={n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies-1')}
    candidates={n:(clean_name(label),team) for n,label,team,_ in base if 'RC' in split_label(label)[1]}
    require(len(records(snapshot,'rookies-1'))==25 and not records(snapshot,'rookies-2') and set(indexed)==ROOKIES and indexed==candidates,'Canonical and rookie-index identity/team/tag mismatch')
    return base,indexed

def verify_independent(snapshot,cards):
    by_key={key:{r[1]:r for r in cards if r[0]==key} for key in EXPECTED_COUNTS}
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key)
        require(len(rows)==EXPECTED_COUNTS[key],'Independent count mismatch: '+key)
        seen=set()
        for raw in rows:
            if key=='vintage' and raw.startswith('NNO '):
                require(raw in {'NNO Checklist (A)','NNO Checklist (B)'},'Unreviewed independent Vintage checklist')
                number='NNO-A' if '(A)' in raw else 'NNO-B'
                subject='Checklist'
            else:
                match=re.match(r'^(\d+(?: [A-Z]{1,2})?)\s+(.+)$',raw)
                require(bool(match),'Unparsed independent card: '+raw)
                number,subject=match.groups()
            require(number not in seen and number in by_key[key],'Independent numbering mismatch '+key+' #'+number)
            seen.add(number)
            candidate=re.split(r'\s+(?:RC|UER|ERR|COR|SP|SSP|NYM|FLA)\b',subject,maxsplit=1)[0].strip()
            actual=by_key[key][number][2].removesuffix(' RC')
            if key=='base' and number=='275':
                require(candidate=='Jose Cruz' and actual=='Jose Cruz, Jr.','BCP #275 suffix omission changed')
            else:
                require(same_people(candidate,actual),f'Independent identity mismatch {key} #{number}: {candidate!r} vs {actual!r}')
    require({r.split(' ',1)[0] for r in records(snapshot,'bcp-base') if re.search(r'\bRC\b',r)}==ROOKIES,'BCP true RC set changed')
    for number,row in by_key['classic'].items():
        n=number.removesuffix('C')
        parent='NNO-A' if n=='NNO1' else 'NNO-B' if n=='NNO2' else n
        v=by_key['vintage'][parent]
        require(same_people(row[2],v[2]) and row[3:5]==v[3:5],'Classic/Vintage subject/team mismatch #'+number)
    for parent,parallel in [('decade-of-excellence','decade-rare-traditions'),('mantle-moments','mantle-gold')]:
        for n,row in by_key[parent].items():
            other=n if parent=='decade-of-excellence' else n+'G'
            require(row[2:5]==by_key[parallel][other][2:5],'Parallel identity/team mismatch '+parallel+' #'+other)
    ink=by_key['diamond-ink-1']
    for point in [1,5,10,25]:
        other=by_key[f'diamond-ink-{point}']
        require({r[2] for r in other.values()}==set(INK_PLAYERS),'Incomplete points-card roster')
        for n,row in ink.items():
            require(row[2:4]==other[n][2:4],'Points-card variant roster/team mismatch')

def validate(bundle,cards):
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and bundle['product']['released'] is False,'Must remain an unreleased draft')
    require(bundle['product']['cardsPerPack']==12 and bundle['product']['packsPerBox']==36,'Pack model changed')
    require(bundle['review']['teamData']=='PENDING' and bundle['review']['checklistScope']=='PENDING_FLASHBACK_INVENTORY','Review limits cannot be silently cleared')
    specs=bundle['productSets']
    require(len(specs)==len({s['id'] for s in specs})==20 and {s['key'] for s in specs}==set(EXPECTED_COUNTS),'Wrong collector-family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==1125,'Expected 1125 unique explicit cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(len(rows)==spec['expectedCards']==EXPECTED_COUNTS[key] and {r[1] for r in rows}==EXPECTED_IDS[key],'Incomplete/duplicate family: '+key)
        require(spec.get('oddsPerPack')==EXPECTED_ODDS[key],'Unreviewed odds: '+key)
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Wrong set kind: '+key)
    base={r[1]:r for r in cards if r[0]=='base'}
    for n,name,team in [('1','Ken Griffey, Jr.','Seattle Mariners'),('36','Curtis King RC','St. Louis Cardinals'),('63','Darrin Fletcher','Toronto Blue Jays'),('123','Todd Erdos RC','Arizona Diamondbacks'),('200','Mike Piazza','Los Angeles Dodgers'),('235','Magglio Ordonez RC','Chicago White Sox'),('391','Mike Piazza','Florida Marlins'),('503','Mike Piazza','New York Mets'),('558','Mike Lowell RC','New York Yankees'),('591','Andy Pettitte','New York Yankees'),('592','Paul Molitor','Minnesota Twins')]:
        require(base[n][2:4]==[name,team],'Number/name/team/RC anchor failed #'+n)
    require(base['63'][4]=='','Fletcher has no Debut badge')
    require({r[1] for r in cards if r[0]=='base' and r[2].endswith(' RC')}==ROOKIES and sum(r[2].endswith(' RC') for r in cards)==25,'True RC suffix audit failed')
    for subset,numbers in [("Smoke 'n Heat",range(301,311)),('Golden Memories',range(311,321)),('Tale of the Tape',range(321,341)),('Unforgettable Moments',range(576,601))]:
        require({int(n) for n,r in base.items() if r[4]==subset}==set(numbers),'Complete base subset range failed: '+subset)
    require({int(n) for n,r in base.items() if r[4]=='Checklist'}==set(range(341,351))|set(range(571,576)),'Base checklist range audit failed')
    blank={('vintage','NNO-A'),('vintage','NNO-B'),('classic','NNO1C'),('classic','NNO2C'),('million-dollar-moments','1')}|{(f'diamond-ink-{p}',f'NNO-{i:02d}') for p in [1,5,10,25] for i in range(1,11)}
    require({(r[0],r[1]) for r in cards if not r[3]}==blank,'Unexpected missing team')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV format')
        require(not row[3] or is_team(row[3]),'Invalid team')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into variant')

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1,'Invalid source schema')
    base,rookies=base_and_rookies(snapshot)
    cards=[]
    for spec in bundle['productSets']:
        key=spec['key']
        raw=base if key=='base' else [r for i in [1,2] for r in records(snapshot,f'{key}-{i}')] if key in {'vintage','classic'} else records(snapshot,key)
        if key.startswith('diamond-ink-'):
            require(len(raw)==10 and {clean_name(r[1]) for r in raw}==set(INK_PLAYERS),'Points-card inventory changed')
            raw=sorted(raw,key=lambda r:clean_name(r[1]).casefold())
        for i,(n,label,team,note) in enumerate(raw,1):
            if key=='vintage' and n=='NNO':
                require(label in {'Checklist: 1-63 CL','Checklist: 64-126 CL'} and not team,'Unreviewed Vintage checklist identity')
                n='NNO-A' if '1-63' in label else 'NNO-B'
            if key.startswith('diamond-ink-'):
                require(n=='NNO','Unreviewed printed points-card number')
                n=f'NNO-{i:02d}'
            cards.append(row_for(key,n,label,team,note,key=='base' and n in rookies))
    validate(bundle,cards)
    verify_independent(snapshot,cards)
    return cards

def self_test(bundle,snapshot):
    fixture='<table><tr><td><a href="/ViewCard.cfm/sid/1149/cid/1">1 DE</a></td><td>Roberto Alomar<br><figcaption>Card note</figcaption></td><td>Baltimore Orioles</td></tr></table>'
    require(parse(fixture,expected_sid=1149)==[['1 DE','Roberto Alomar','Baltimore Orioles','Card note']],'Suffix-number/caption parsing regression')
    try:parse(fixture.replace('/sid/1149/','/sid/929/'),expected_sid=1149)
    except ValueError:pass
    else:raise ValueError('Wrong source namespace accepted')
    try:parse(fixture.replace('>1 DE<','>UNKNOWN-ID<'),expected_sid=1149)
    except ValueError:pass
    else:raise ValueError('Unparsed linked source row was silently dropped')
    for raw,wanted in [('Ken Boswell','Ken Boswell'),('Ken Boswell LL','Ken Boswell'),('Marshall','Marshall'),('John Marshall LL','John Marshall'),('Jim Hall CL','Jim Hall'),('Todd Erdos ED, RC','Todd Erdos'),('Roberto Alomar SN63','Roberto Alomar')]:
        require(clean_name(raw)==wanted,'Whole-token name parsing failed: '+raw)
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-1']['records'].pop()),
        ('wrong player',lambda s:s['sources']['base-2']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong known team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'Boston Red Sox')),
        ('missing team',lambda s:s['sources']['base-2']['records'][0].__setitem__(2,'')),
        ('wrong rookie',lambda s:s['sources']['rookies-1']['records'][0].__setitem__(1,'Wrong Rookie RC')),
        ('missing Vintage header',lambda s:s['sources']['vintage-2']['records'].pop()),
        ('missing Classic header',lambda s:s['sources']['classic-2']['records'].pop()),
        ('wrong Classic print run',lambda s:s['sources']['classic-1']['records'][0].__setitem__(1,'Jason Dickson SN100')),
        ('wrong Mantle Gold print run',lambda s:s['sources']['mantle-gold']['records'][0].__setitem__(1,'Mickey Mantle SN63')),
        ('changed point-card roster',lambda s:s['sources']['diamond-ink-5']['records'][0].__setitem__(1,'Wrong Player RDM')),
        ('invented point-card affiliation',lambda s:s['sources']['diamond-ink-1']['records'][0].__setitem__(2,'Seattle Mariners')),
        ('missing regular insert',lambda s:s['sources']['zone']['records'].pop()),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot);mutate(changed)
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption test accepted: '+name)
    print('PASS: full checklist/RC/parallel audit, source namespace, complete-row parsing, whole-token names and twelve corruption tests')


def csv_text(cards):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(HEADER)
    writer.writerows(cards)
    return stream.getvalue()


def atomic_write(path, text):
    temporary = path.with_suffix(path.suffix + '.tmp')
    try:
        temporary.write_text(text, encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--refresh-sources', action='store_true')
    args = parser.parse_args()
    bundle = json.loads(BUNDLE.read_text())
    snapshot = json.loads(SOURCE.read_text())
    if args.refresh_sources:
        snapshot = refresh_sources(snapshot)
    self_test(bundle, snapshot)
    cards = assemble(bundle, snapshot)
    text = csv_text(cards)
    if args.check:
        require(OUT.read_text() == text, 'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:
            atomic_write(SOURCE, json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
        atomic_write(OUT, text)
    print(f'PASS: {len(cards)} catalogued cards / {len(bundle["productSets"])} collector sets / 25 verified base RCs; Flashback inventory unresolved; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
