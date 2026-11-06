#!/usr/bin/env python3
"""Generate and audit the unreleased 2001 Topps Heritage Baseball draft.

773 explicit catalogue cards in fifteen collector families, including 80 extra
base back-color variants, completed autographs, the Mays replacement and box
buyback. No fabricated Mathews/Doby signatures or inferred pack odds. Uses only
standard-library Python; source retrieval and metadata errors fail closed.
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
from urllib.error import HTTPError, URLError
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'set-factory'
STEM = '2001-topps-heritage-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 773
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
    "Arizona Diamondbacks", "Tampa Bay Devil Rays",
    "New York Giants", "Brooklyn Dodgers", "Boston Braves",
    "Milwaukee Braves", "Philadelphia Athletics", "Washington Senators",
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


NUM = re.compile(r'^[0-9A-Z][0-9A-Z .-]*$', re.I)


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



def require(condition,message):
    if not condition:raise ValueError(message)

def fetch_bytes(url):
    for attempt in range(1,4):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(request,timeout=35) as response:return response.read()
        except (OSError,URLError) as exc:
            transient=not isinstance(exc,HTTPError) or exc.code in {429,502,503,504}
            if not transient or attempt==3:raise RuntimeError(f'Source retrieval failed after {attempt} attempt(s): {url}: {exc}; no partial CSV written') from exc
            print(f'Transient source failure; retry {attempt}/2: {url}',flush=True);time.sleep(attempt)

def fetch(url):return fetch_bytes(url).decode('utf8','replace')

def section(raw,name,end=None):
    part=raw[raw.index('id="'+name+'"'):]
    if end:return part[:part.index('id="'+end+'"')]
    boundary=re.search(r'<h[1-4](?:\s|>)',part)
    return part[:boundary.start()] if boundary else part[:part.index('</ul>')+5]

def list_items(raw):return [' '.join(html.unescape(re.sub('<[^>]+>',' ',r)).split()) for r in re.findall(r'<li>(.*?)</li>',raw,re.S)]

def records(snapshot,key):
    e=snapshot['sources'][key];require(e['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',e['sha256']),'Invalid source provenance: '+key);return e['records']

def csv_text(cards):
    stream=io.StringIO(newline='');writer=csv.writer(stream,lineterminator='\n');writer.writerow(HEADER);writer.writerows(cards);return stream.getvalue()

def atomic_write(path,text):
    temp=path.with_suffix(path.suffix+'.tmp')
    try:temp.write_text(text,encoding='utf8');temp.replace(path)
    finally:temp.unlink(missing_ok=True)

COUNTS={'base':487,'checklists':2,'chrome':110,'classic':10,'new-age':15,'then-now':10,'autographs':50,'red-ink':51,'classic-autographs':3,'clubhouse':12,'clubhouse-dual':6,'clubhouse-autographs':4,'grandstand':7,'time-capsule':5,'autoproofs':1}
SIDS=dict(zip(COUNTS,[1498,128363,13123,9220,9224,9226,9217,9218,9221,9222,536012,221176,9223,9227,9219]))
ODDS={k:{'chrome':25,'classic':5,'new-age':8,'then-now':8,'autographs':142,'classic-autographs':19710,'grandstand':211}.get(k) for k in COUNTS}
TITLES={'base':'Base Set Checklist','autographs':'Autographs Checklist','chrome':'Chrome Checklist','classic':'Classic Renditions Checklist','classic-autographs':'Classic Renditions Autographs Checklist','clubhouse':'Clubhouse Collection Checklist','clubhouse-dual':'Dual Clubhouse Collection Checklist','clubhouse-autographs':'Clubhouse Collection Autographs Checklist','grandstand':'Grandstand Glory Checklist','new-age':'New Age Performers Checklist','then-now':'Then and Now Checklist','time-capsule':'Time Capsule Checklist','promos':'Pre-Production Checklist'}
SECTIONS={'chrome':'Chrome','classic':'Classic_Renditions','new-age':'New_Age_Performers','then-now':'Then_and_Now','autographs':'Topps_Heritage_Autographs','classic-autographs':'Classic_Renditions_Autograph','clubhouse':'Clubhouse_Collection_Relics','clubhouse-dual':'Dual','clubhouse-autographs':'Autographs','grandstand':'Grandstand_Glory','time-capsule':'Time_Capsule','promos':'Promos'}
BLACK=set(map(str,[103,159,171,176,179,188,201,212,224,241]))
RC=set(map(str,[89,93,95,111,119,154,172,174,198,225,229,246,250,252,264,266,290,293,297,302,306,326]))
PRODUCT='2001_Topps_Heritage_Baseball'

def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def cbc_rows(raw,key):
    headings=list(re.finditer(r'<h3\b[^>]*>.*?</h3>',raw,re.S));matches=[(i,m) for i,m in enumerate(headings) if plain(m[0])==TITLES[key]]
    require(len(matches)==1,'Independent heading missing/ambiguous '+key);i,m=matches[0];part=raw[m.end():headings[i+1].start() if i+1<len(headings) else len(raw)]
    blocks=re.findall(r'<div[^>]*class="[^"]*\btablechecklist\b[^"]*"[^>]*>(.*?)</div>',part,re.S)
    if key=='clubhouse-dual':
        blocks=re.findall(r'<p>(THCC-.*?)</p>',part,re.S)
    rows=[plain(line) for block in blocks for line in re.split(r'<br\s*/?>',block) if plain(line)]
    require(bool(rows),'Empty independent checklist '+key);return rows

def supplementary_rows(raw):
    keys=['base','autoproofs','autographs','red-ink','checklists','chrome','classic','classic-autographs','clubhouse-autographs','clubhouse-dual','clubhouse','grandstand','new-age','promos','then-now','time-capsule'];tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S)
    require(len(tables)==len(keys),'Supplementary family scope changed');out=[]
    for key,table in zip(keys,tables):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if cells:require(len(cells)==3,'Unexpected supplementary columns');rows.append([key,*cells])
        require(len(rows)==(49 if key=='autographs' else 52 if key=='red-ink' else 3 if key=='promos' else COUNTS[key]),'Incomplete supplementary family '+key);out+=rows
    return out

def configuration_rows(raw):
    require('24 packs per box, eight cards plus one stick of gum per pack' in plain(section(raw,'Distribution','Reviews')),'Distribution changed')
    out=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells:require(len(cells)==5,'Unexpected odds columns');out.append(cells)
    require(len(out)==20,'Incomplete odds evidence');return out

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|SP|UER|VAR|AU|MEM|CL|EXCH|PROMO|SN\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normalized(name):
    name=split_label(name)[0]
    aliases={'Cal Ripken':'Cal Ripken Jr.','J.T. Snow':'J.T. Snow Jr.','Lou Montanez':'Luis Montanez','Robert Keppel':'Bob Keppel','Tony Armas':'Tony Armas Jr.','Sandy Alomar':'Sandy Alomar Jr.','Bob Higginson':'Bobby Higginson','Ron Belliard':'Ronnie Belliard','Bob Abreu':'Bobby Abreu','Minnie Minoso':'Orestes Minoso','Vern Law':'Vernon Law','Ken Griffey':'Ken Griffey Jr.'}
    name=' / '.join(aliases.get(part.strip(),part.strip()) for part in name.split(' / '))
    return re.sub(r'[^a-z0-9]','',name.lower())

def is_checklist(player,subset=''):return 'checklist' in (player+' '+subset).lower()

def raw_family(snapshot,key):
    pages=['base-'+str(i) for i in range(1,6)] if key=='base' else ['sid-13123','chrome-2'] if key=='chrome' else ['sid-'+str(SIDS[key])]
    for p in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][p]['url'])[1])==SIDS[key],'Wrong checklist namespace '+key)
    return [r for p in pages for r in records(snapshot,p)]

def row_for(key,n,label,team,note):
    name,tags=split_label(label);subset='';notes=[]
    if key=='red-ink' and n=='THA-EM':
        require((name,tags,team,note)==('Eddie Mathews',{'AU','SN52','EXCH'},'Atlanta Braves',''),'Excluded exchange changed');return None
    if key=='base':
        m=re.fullmatch(r'(\d+)([AB])?',n);require(bool(m),'Invalid base local ID');num,suffix=m.groups();i=int(num)
        expected=({'VAR'} if i<=80 else {'SP'} if i>=311 else set())|({'RC'} if num in RC else set())|({'UER'} if num=='41' else set())|({'SP'} if n=='31A' else set())
        require(tags==expected,'Unexpected base attributes '+n)
        if i<=80:
            require(suffix in {'A','B'},'Missing back variant');color='Red' if suffix=='A' else 'Black';expected_note='VAR: '+color+('' if n=='69B' else ' Back')
            if num=='41':expected_note+='; UER: Last name misspelled "Buerhle" on front and back'
            require(note==expected_note,'Unreviewed back/print annotation '+n);notes.append(color+' back; catalogue suffix '+suffix+' is not printed')
            if num=='41':notes.append('UER: Buehrle misspelled Buerhle on front and back')
            if n=='31A':notes.append('Source-designated short print')
            subset='Low Numbers'
        else:
            require(suffix is None and note==('Black Back' if num in BLACK else ''),'Unreviewed base annotation '+n)
            if num in BLACK:notes.append('Black back only; documented printing anomaly')
            if i>=311:subset='High Numbers'
        if num in RC:name+=' RC'
    elif key=='checklists':
        require(tags=={'CL'} and not team and not note and n in {'1','2'},'Checklist metadata changed')
        require(name==('Checklist 1: 1-359' if n=='1' else 'Checklist 2: 360-407 and Inserts'),'Checklist range changed');notes.append(name.split(': ',1)[1]);name='Checklist '+n;subset='Checklist'
    elif key in {'autographs','red-ink'}:
        expected={'AU'}|({'SN52'} if key=='red-ink' and n!='THA-WM' else set());require(tags==expected,'Autograph run/attribute mismatch '+n)
        require(note==('1952 Topps #81' if key=='autographs' and n=='THA-VL' else ''),'Unreviewed auto annotation')
        if note:notes.append(note)
        if n=='THA-ML' and name=='Matt Lawton':n='THA-ML2'
        if n=='THA-ML2':require(name=='Matt Lawton','Invalid duplicate ID');notes.append('Printed THA-ML; local ID THA-ML2 distinguishes Mike Lamb')
        if n=='THA-WMA':require(key=='red-ink' and name=='Willie Mays','Invalid Mays suffix');notes.append('Printed THA-WM; local ID THA-WMA distinguishes numbered red ink')
        if key=='red-ink' and n=='THA-JG':
            require(team=='St. Louis Cardinals' and name=='Joe Garagiola','Reviewed Garagiola source exception changed');team='Pittsburgh Pirates';notes.append('Back identifies Pittsburgh Pirates; front carries Cardinals logo')
        notes.append('Certified autograph; '+('blue ink; reported print run 200, not serial numbered' if key=='autographs' else 'red ink'))
        if 'SN52' in tags:notes.append('Hand numbered /52')
        elif key=='red-ink':require(n=='THA-WM' and name=='Willie Mays','Unreviewed unnumbered red');notes.append('Unnumbered Eddie Mathews redemption replacement; not a pack-issued /52 card')
    else:
        expected={'SN552'} if key=='chrome' else {'AU','SN25'} if key in {'classic-autographs','autoproofs'} else {'AU','MEM','SN25'} if key=='clubhouse-autographs' else {'MEM','SN52'} if key=='clubhouse-dual' or key=='time-capsule' and n=='THTC-WMTW' else {'MEM'} if key in {'clubhouse','grandstand','time-capsule'} else set()
        require(tags==expected,'Unexpected insert metadata '+key+' #'+n)
        if key=='then-now':require(re.fullmatch(r'TH \d+',n) and not note,'Then/Now ID changed');n=n.replace(' ','')
        if key in {'clubhouse','clubhouse-dual'}:
            material='Jersey' if n in {'THCC-FT','THCC-MM','THCC-MMFT'} else 'Bat';require(note=='MEM: '+material,'Relic material changed');notes.append('Game-used '+material.lower())
        elif key=='autoproofs':require(n=='261' and note=='1952 Topps Buy Back Autograph','Buyback identity changed');notes.append(note)
        else:require(not note,'Unreviewed insert annotation '+key)
        if key=='clubhouse-autographs':notes.append('Certified autograph; game-used '+('jersey' if n=='THCC-MM' else 'bat'))
        if key=='classic-autographs':notes.append('Certified autograph')
        if key=='grandstand':notes.append('Stadium-seat relic; not player-used equipment')
        if key=='time-capsule':notes.append('Korean War-era uniform relic; not worn by featured player(s)')
        for tag in tags:
            if tag.startswith('SN'):notes.append('Serial numbered /'+tag[2:])
    require(name and not re.search(r'\b(?:SN\d+|AU|MEM|UER|VAR|EXCH|PROMO)\b',name),'Unclean display name')
    require(team or is_checklist(name,subset),'Missing non-checklist team')
    require(all(t in KNOWN_CLUBS for t in team.split(' / ')) if team else is_checklist(name,subset),'Invalid historical franchise '+team)
    return [key,n,name,team,subset,'; '.join(notes)]

def clean_independent(text,key):
    n,name=text.split(' ',1)
    if key in {'clubhouse','clubhouse-autographs','clubhouse-dual'}:name=re.sub(r' - (?:Bat|Jersey)$','',name)
    if key=='time-capsule':name=re.sub(r' #/52$','',name)
    if key in {'clubhouse-dual','then-now','time-capsule'}:name=name.replace(', ',' / ')
    return n,name

def verify_independent(snapshot,cards):
    by={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS}
    for key in TITLES:
        rows=records(snapshot,'cbc-'+key)
        if key=='promos':require(rows==['PP1 Kevin Brown','PP2 Andres Galarraga','PP3 Roger Clemens'],'Promo scope changed');continue
        expected=407 if key=='base' else 51 if key=='autographs' else COUNTS[key];require(len(rows)==expected,'Independent inventory incomplete '+key);seen=set()
        for text in rows:
            n,name=clean_independent(text,key)
            if key=='autographs' and n=='THA-EM':require(name=='Eddie Mathews - Redemption, Not Signed','Unreviewed exchange');continue
            require(n not in seen,'Duplicate independent ID '+key+' '+n);seen.add(n)
            target=n+'A' if key=='base' and int(n)<=80 else n
            if key=='clubhouse-autographs':require(n.startswith('THCC-A'),'Independent autograph relic prefix changed');target=n.replace('THCC-A','THCC-',1)
            if key=='time-capsule':target='THTC-'+n
            require(target in by[key],'Independent number mismatch '+key+' '+target)
            actual=by[key][target];require(normalized(name)==normalized(actual[2].removesuffix(' RC')),'Independent name mismatch '+key+' '+n+': '+name+' / '+actual[2])
        if key=='base':require({r.split(' ',1)[0] for r in rows if r.endswith(' RC')}==RC,'Independent true RC inventory changed')
    supplemental=records(snapshot,'supplement')
    require({k:sum(r[0]==k for r in supplemental) for k in {*COUNTS,'promos'}}=={**COUNTS,'autographs':49,'red-ink':52,'promos':3},'Independent table inventory incomplete')
    require(len(supplemental)==len({(r[0],r[1]) for r in supplemental}),'Duplicate supplementary identity')
    for key,n,name,team in supplemental:
        if key=='promos':continue
        if key=='red-ink' and n=='THA-EM':require(name=='Eddie Mathews','Unreviewed excluded exchange');continue
        if key in {'chrome','classic','new-age','then-now'}:n={'chrome':'CP','classic':'CR','new-age':'NAP','then-now':'TH'}[key]+n
        if key=='base':n=n.upper();n=n+'A' if n.isdigit() and int(n)<=80 else n
        if key=='base' and n in BLACK:
            require(name.endswith(' Black Back'),'Independent black-back note changed');name=name.removesuffix(' Black Back')
        if key=='autographs' and n=='THA-VL':
            require(name=='Vernon Law AU 1952 Topps #81','Independent Law note changed');name='Vernon Law'
        actual=by[key].get(n);require(actual is not None,'Supplementary ID mismatch '+key+' '+n)
        if key=='checklists':require(name==('Checklist 1: 1-359' if n=='1' else 'Checklist 2: 360-407 and Inserts'),'Supplementary checklist changed');name='Checklist '+n
        if key=='red-ink' and n=='THA-JG':require(team=='St. Louis Cardinals','Raw Garagiola correction changed');team='Pittsburgh Pirates'
        require(normalized(name)==normalized(actual[2].removesuffix(' RC')) and team==actual[3],'Supplementary tuple mismatch '+key+' '+n+': '+repr((name,team,actual[2],actual[3])))
    # The supplementary autograph table omits Matt Lawton. Do not fake a row;
    # TCDB's full 50 plus the complete CBC list explicitly cover him.
    supp_autos={n for k,n,_,_ in supplemental if k=='autographs'}
    require(set(by['autographs'])-supp_autos=={'THA-ML2'},'Supplementary autograph gap changed')
    for n,r in by['red-ink'].items():
        base=by['autographs']['THA-WM' if n=='THA-WMA' else n]
        require(r[2:4]==base[2:4],'Red/blue subject or historical team mismatch '+n)
    require(records(snapshot,'scope-index')==sorted((set(SIDS.values())-{1498})|{9225}),'Related inventory changed')
    require(records(snapshot,'scope-redemptions')==[['NNO','1952 Card Redemption EXCH','',''],['NNO','Replica Hat/Jersey EXCH','','']],'Exchange scope changed')
    require(records(snapshot,'bcp-configuration')==snapshot['expectedPhysicalConfiguration'],'Historical odds source changed')
    require(len(records(snapshot,'bcp-autographs'))==52,'Independent intended signer inventory changed')
    require([r for r in records(snapshot,'bcp-autographs') if ' EXCH ' in r]==['THA-EM Eddie Mathews EXCH (fulfilled with a Willie Mays Red Ink)','THA-LD Larry Doby EXCH (never honored)'],'Unfulfilled signer exclusions changed')

def validate(bundle,snapshot,cards):
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased draft')
    require(snapshot['schemaVersion']==1 and snapshot['productId']==p['id']==PRODUCT and p['year']==2001 and p['brand']=='Topps Heritage' and p['sport']=='Baseball','Wrong product identity')
    require(p['cardsPerPack']==8 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Pack/release configuration changed')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==15 and {s['key'] for s in specs}==set(COUNTS),'Collector inventory changed')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Expected 773 unique cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key];require(len(rows)==spec['expectedCards']==COUNTS[key],'Incomplete/duplicate family '+key)
        require(spec['sourceSetId']==SIDS[key] and spec['oddsPerPack']==ODDS[key] and spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in {'chrome','red-ink','classic-autographs','clubhouse-autographs'} else 'INSERT'),'Set kind/namespace/odds mismatch '+key)
    base=[r for r in cards if r[0]=='base'];expected={str(i)+s for i in range(1,81) for s in 'AB'}|{str(i) for i in range(81,408)}
    require({r[1] for r in base}==expected,'Base 407 subjects/80 extra variants incomplete')
    require(sum(r[4]=='High Numbers' for r in base)==97 and sum(r[4]=='Low Numbers' for r in base)==160,'Base subset mismatch')
    rookies={n:(split_label(label)[0],team) for n,label,team,note in records(snapshot,'rookies')}
    actual={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in base if r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==22 and set(rookies)==set(actual)==RC and rookies==actual and sum(r[2].endswith(' RC') for r in cards)==22,'True RC identity/team inventory changed')
    require(sum(not r[3] for r in cards)==2 and all(r[3] or is_checklist(r[2],r[4]) for r in cards),'Missing non-checklist teams')
    for row in cards:require(len(row)==6 and all(isinstance(v,str) for v in row) and not re.search(r'\b1\s*:\s*\d+',row[5]),'Invalid CSV/set odds leaked into variants')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[row_for(spec['key'],*r) for spec in bundle['productSets'] for r in raw_family(snapshot,spec['key'])];cards=[r for r in cards if r is not None];validate(bundle,snapshot,cards);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,e in changed['sources'].items():
        raw=cache[e['url'].split('#',1)[0]]
        if key.startswith('cbc-'):rows=cbc_rows(raw,key[4:])
        elif key=='supplement':rows=supplementary_rows(raw)
        elif key=='bcp-configuration':rows=configuration_rows(raw)
        elif key.startswith('bcp-'):rows=list_items(section(raw,SECTIONS[key[4:]]))
        elif key=='scope-index':rows=sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1498})
        elif key=='scope-redemptions':rows=parse(raw,1498)
        elif key in {'packaging','psa'}:rows=e['records'] # Images/prose provenance; all structured conclusions separately validated.
        else:rows=parse(raw,int(re.search(r'/sid/(\d+)/',e['url'])[1]))
        e['records']=rows;e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def check_image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed image changed '+e['key'])
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(check_image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall AU','John Marshall'),('Jim Hall CL','Jim Hall'),('Carmen Cali RC','Carmen Cali')]:require(split_label(raw)[0]==expected,'Whole-token cleanup damaged surname')
    require(is_checklist('Checklist 1') and is_checklist('Player','Checklist') and not is_checklist('Kris Benson'),'Checklist team exception failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Retrieval failure bypassed')
            require(mock.call_count==calls,'Unbounded source retries')
    assemble(bundle,snapshot)
    cases=[('base-1',0,0,'1'),('base-1',0,1,'Wrong Player VAR'),('base-1',0,2,''),('base-1',0,3,'VAR: Blue Back'),('base-1',0,1,'Kris Benson RC, VAR'),('base-3',0,2,'New York Yankees'),('sid-13123',0,1,'Cal Ripken Jr. SN999'),('sid-9218',0,1,'Aubrey Huff AU, SN25'),('sid-9218',14,1,'Eddie Mathews AU, SN52'),('sid-9217',0,1,'Aubrey Huff RC, AU'),('sid-9227',4,1,'Willie Mays / Ted Williams MEM'),('sid-9222',0,3,'MEM: Jersey')]
    for key,i,col,val in cases:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'][i][col]=val
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption accepted '+key)
    for key in ['base-5','chrome-2','sid-9217','sid-536012','supplement','cbc-base']:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'].pop()
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Incomplete roster accepted '+key)
    for mutate in [lambda b:b['product'].__setitem__('released',True),lambda b:next(s for s in b['productSets'] if s['key']=='autoproofs').__setitem__('oddsPerPack',5749),lambda b:next(s for s in b['productSets'] if s['key']=='red-ink').__setitem__('oddsPerPack',545)]:
        changed=copy.deepcopy(bundle);mutate(changed)
        try:assemble(changed,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted')
    print('PASS: names/checklist exception, bounded failures, 18 source corruption and 3 manifest safety cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);cards=assemble(bundle,snapshot);text=csv_text(cards)
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 773 cards / 15 collector families / 22 true base RCs; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial CSV written',file=sys.stderr);sys.exit(1)
