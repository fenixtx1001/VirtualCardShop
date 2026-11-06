#!/usr/bin/env python3
"""Generate and audit the unreleased 2001 Topps Stars Baseball draft.

817 explicit cards across eleven intact collector families. Independently audit
full base/parallel/Elimination and insert rosters, all teams, 21 true RCs, ticket
versus player-used materials, and real serial versus print-run attributes.
No production access or deployment. Failed retrieval/validation writes no CSV.
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
STEM = '2001-topps-stars-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 817
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

COUNTS={'base':200,'gold':200,'onyx':200,'elimination':134,'progression':9,'awards':10,'awards-relics':10,'jerseys':15,'bats':21,'autographs':13,'autograph-relics':5}
SIDS=dict(zip(COUNTS,[1501,13136,13137,13132,9269,13138,13139,13135,13134,13131,13133]))
ODDS={k:{'gold':9,'onyx':48,'elimination':72,'progression':8,'awards':12,'awards-relics':530,'jerseys':61,'bats':187,'autographs':353}.get(k) for k in COUNTS}
PARALLELS={'gold','onyx','elimination','autograph-relics'}
SECTIONS={'base':'Base_Set','elimination':'Elimination','progression':'Progression','awards':"Player's_Choice_Awards",'awards-relics':"Player's_Choice_Awards_Relics",'jerseys':'Jerseys','bats':'Bats','autographs':'Autographs_2','autograph-relics':'Autographs'}
RC=set(map(str,[179,180,181,182,183,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200]))
ELIM={str(i) for i in range(1,142)}-set(map(str,[24,53,54,59,60,81,96,110]))|{'198'}
MATERIAL={'TSRA-BB':'Jersey','TSRA-CP':'Bat','TSRA-RF':'Bat','TSRA-TH':'Jersey','TSRA-TL':'Bat'}
PRODUCT='2001_Topps_Stars_Baseball'


def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|UER|AU|MEM|CL|EXCH|SN\d+|PR\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normalized(name):
    name=split_label(name)[0]
    aliases={'Jose Cruz':'Jose Cruz Jr.','Bob Higginson':'Bobby Higginson','Bob Abreu':'Bobby Abreu','Dave Justice':'David Justice','Ron Belliard':'Ronnie Belliard','Ben Molina':'Bengie Molina','Odanis Ayala':'Odannis Ayala','Odannys Ayala':'Odannis Ayala','Odannis Ayala':'Odannis Ayala','Rich Anderson':'Ryan Anderson','Cal Ripken':'Cal Ripken Jr.','J.T. Snow':'J.T. Snow Jr.'}
    parts=[' '.join(p.replace(', Jr.',' Jr.').split()) for p in name.split(' / ')]
    return sorted(re.sub(r'[^a-z0-9]','',aliases.get(p,p).lower()) for p in parts)

def is_checklist(player,subset=''):return 'checklist' in (player+' '+subset).lower()

def correct_team(key,n,team):
    if key=='awards' and n=='PCA6':
        require(team=='Chicago White Sox / Seatle Mariners / Detroit Tigers','Reviewed Seattle typo source changed');return team.replace('Seatle Mariners','Seattle Mariners')
    if key=='progression' and n=='P7':
        require(team=='Los Angeles Dodgers / St. Louis Cardinals / Toronto Blue Jays','Reviewed Snider historical source changed');return team.replace('Los Angeles Dodgers','Brooklyn Dodgers',1)
    return team

def supplementary_rows(raw):
    keys=['base','autographs','elimination','autograph-relics','bats','jerseys','awards','awards-relics','progression'];tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==len(keys),'Supplementary scope changed');out=[]
    for key,table in zip(keys,tables):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if cells:require(len(cells)==3,'Unexpected table columns');rows.append([key,*cells])
        require(len(rows)==COUNTS[key],'Incomplete independent table '+key);out+=rows
    return out

def configuration_rows(raw):
    require('24 packs per box, six cards per pack' in plain(section(raw,'Distribution','Reviews')),'Distribution changed');out=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells:require(len(cells)==4,'Unexpected odds columns');out.append(cells)
    require(len(out)==12,'Incomplete rate evidence');return out

def raw_family(snapshot,key):
    pages=[key+'-1',key+'-2'] if key in {'base','gold','onyx','elimination'} else ['sid-'+str(SIDS[key])]
    for p in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][p]['url'])[1])==SIDS[key],'Wrong checklist namespace '+key)
    rows=[r for p in pages for r in records(snapshot,p)];require(len(rows)==COUNTS[key],'Incomplete source family '+key);return rows

def subset_for(n):
    return 'Veterans' if int(n)<=141 else 'Hall of Fame' if int(n)<=150 else 'Rookies/Prospects'

def row_for(key,n,label,team,note):
    name,tags=split_label(label);subset='';notes=[]
    if key in {'base','gold','onyx','elimination'}:
        expected=({'RC'} if n in RC else set())|({'UER'} if n=='180' else set()) if key=='base' else {'SN499'} if key=='gold' else {'SN99'} if key=='onyx' else {'PR100'}
        require(tags==expected,'Unexpected base/parallel metadata '+key+' '+n)
        require(note==('UER: Name misspelled, should be Odannys.' if key=='base' and n=='180' else ''),'Unreviewed annotation '+key+' '+n)
        subset=subset_for(n)
        if note:notes.append(note)
        if key=='base' and n in RC:name+=' RC'
        if key in {'gold','onyx'}:notes.append('Serial numbered /'+('499' if key=='gold' else '99'))
        elif key=='elimination':notes.append('Reported print run 100; not serial numbered; expired Star Stats Elimination game card')
    else:
        expected={'AU','MEM','SN25'} if key=='autograph-relics' else {'AU'} if key=='autographs' else {'MEM'} if key in {'bats','jerseys','awards-relics'} else set();require(tags==expected,'Unexpected insert metadata '+key+' '+n)
        if key=='bats':require(note=='MEM: Game-used bat','Bat provenance changed');notes.append('Game-used bat relic')
        elif key=='jerseys':require(note.lower()=='mem: player-worn jersey','Jersey provenance changed');notes.append('Player-worn jersey relic')
        elif key=='autograph-relics':require(n in MATERIAL and note=='MEM: '+MATERIAL[n],'Signed relic material changed');notes.append('Certified autograph; '+('player-worn jersey relic' if MATERIAL[n]=='Jersey' else 'game-used bat relic')+'; serial numbered /25')
        else:
            require(not note,'Unreviewed insert annotation')
            if key=='autographs':notes.append('Certified autograph')
            elif key=='awards-relics':
                notes.append('Authentic Players Choice Awards ticket stub; not player-worn material')
                if n=='PCAR-1':notes.append('Ticket face printed 2000; card back refers to 2001 awards')
        team=correct_team(key,n,team)
    require(name and not re.search(r'\b(?:UER|AU|MEM|EXCH|PR\d+|SN\d+)\b',name),'Unclean display subject')
    require(team or is_checklist(name,subset),'Missing non-checklist team');require(all(t in KNOWN_CLUBS for t in team.split(' / ')) if team else is_checklist(name,subset),'Invalid historical franchise '+team)
    return [key,n,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    by={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS}
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key);require(len(rows)==COUNTS[key],'Independent family incomplete '+key);seen=set()
        for text in rows:
            n,name=text.split(' ',1)
            if key=='base':name=re.sub(r' RC\*?$','',name)
            elif key in {'bats','jerseys'}:require(name.endswith((' A',' B')),'Tier marker missing');name=name[:-2]
            elif key=='autograph-relics':name=re.sub(r' (?:BAT|JSY)$','',name)
            elif key=='autographs':name=name.removesuffix(' EXCH')
            elif key=='awards-relics':n=n.replace('PCAR','PCAR-',1)
            require(n not in seen and n in by[key],'Independent numbering mismatch '+key+' '+n);seen.add(n)
            require(normalized(name)==normalized(by[key][n][2].removesuffix(' RC')),'Independent subject mismatch '+key+' '+n+': '+name+' / '+by[key][n][2])
        if key=='base':require({r.split(' ',1)[0] for r in rows if re.search(r' RC\*?$',r)}==RC,'Independent true RC inventory changed')
    supplemental=records(snapshot,'supplement');require(len(supplemental)==len({(r[0],r[1]) for r in supplemental})==417,'Independent team inventory incomplete')
    for key,n,name,team in supplemental:
        if key=='awards':n='PCA'+n
        actual=by[key].get(n);require(actual is not None,'Independent number mismatch '+key+' '+n)
        team=correct_team(key,n,team)
        require(normalized(name)==normalized(actual[2].removesuffix(' RC')) and team==actual[3],'Independent subject/team mismatch '+key+' '+n+': '+repr((name,team,actual[2],actual[3])))
    base=by['base']
    for key in {'gold','onyx','elimination'}:
        for n,row in by[key].items():require(normalized(row[2])==normalized(base[n][2].removesuffix(' RC')) and row[3]==base[n][3],'Parallel identity/team mismatch '+key+' '+n)
    require(records(snapshot,'scope-index')==sorted(set(SIDS.values())-{1501}),'Related family inventory changed')
    require(records(snapshot,'bcp-configuration')==snapshot['expectedPhysicalConfiguration'],'Historical odds inventory changed')
    require(records(snapshot,'distributor-configuration')==['24 packs per box, 6 cards per pack'],'Independent pack configuration changed')

def validate(bundle,snapshot,cards):
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased draft')
    require(snapshot['schemaVersion']==1 and snapshot['productId']==p['id']==PRODUCT and p['year']==2001 and p['brand']=='Topps Stars' and p['sport']=='Baseball','Wrong product identity')
    require(p['cardsPerPack']==6 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Pack/release configuration changed')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==11 and {s['key'] for s in specs}==set(COUNTS),'Wrong collector family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Expected 817 unique cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(len(rows)==spec['expectedCards']==COUNTS[key],'Incomplete or duplicate family '+key)
        require(spec['sourceSetId']==SIDS[key] and spec['oddsPerPack']==ODDS[key] and spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Manifest namespace/kind/odds mismatch '+key)
        if key in {'base','gold','onyx'}:require({r[1] for r in rows}==set(map(str,range(1,201))) and sum(r[4]=='Hall of Fame' for r in rows)==9 and sum(r[4]=='Rookies/Prospects' for r in rows)==50,'Base/parallel number/subset mismatch')
        if key=='elimination':require({r[1] for r in rows}==ELIM,'Partial-parallel inventory changed')
    indexed={n:(split_label(label)[0],team) for n,label,team,note in records(snapshot,'rookies')};actual={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==len(indexed)==len(actual)==21 and set(indexed)==RC and indexed==actual and sum(r[2].endswith(' RC') for r in cards)==21,'True RC number/name/team mismatch')
    for row in cards:require(len(row)==6 and all(isinstance(v,str) for v in row) and (row[3] or is_checklist(row[2],row[4])) and not re.search(r'\b1\s*:\s*\d+',row[5]),'Invalid CSV/team or set-wide odds leaked into variant')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[row_for(spec['key'],*r) for spec in bundle['productSets'] for r in raw_family(snapshot,spec['key'])];validate(bundle,snapshot,cards);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,e in changed['sources'].items():
        raw=cache[e['url'].split('#',1)[0]]
        if key.startswith('bcp-'):rows=configuration_rows(raw) if key=='bcp-configuration' else list_items(section(raw,SECTIONS[key[4:]]))
        elif key=='supplement':rows=supplementary_rows(raw)
        elif key=='scope-index':rows=sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1501})
        elif key=='distributor-configuration':require('24 packs per box, 6 cards per pack' in plain(raw),'Distributor pack configuration changed');rows=['24 packs per box, 6 cards per pack']
        else:rows=parse(raw,int(re.search(r'/sid/(\d+)/',e['url'])[1]))
        e['records']=rows;e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def check_image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed image changed '+e['key'])
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(check_image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall AU','John Marshall'),('Jim Hall CL','Jim Hall'),('Darin Erstad SN499','Darin Erstad'),('Darin Erstad PR100','Darin Erstad')]:require(split_label(raw)[0]==expected,'Whole-token cleanup damaged surname')
    require(is_checklist('Checklist 1') and is_checklist('Player','Checklist') and not is_checklist('Darin Erstad'),'Checklist exception failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Source failure bypassed')
            require(mock.call_count==calls,'Unbounded retries')
    assemble(bundle,snapshot)
    cases=[('base-1',0,1,'Wrong Player'),('base-1',0,2,''),('base-1',0,1,'Darin Erstad RC'),('base-2',83,1,'Derek Thompson RC'),('gold-1',0,1,'Darin Erstad SN99'),('onyx-1',0,1,'Darin Erstad SN499'),('elimination-1',0,1,'Darin Erstad SN100'),('elimination-2',-1,0,'200'),('sid-13139',0,1,'Carlos Delgado AU, MEM'),('sid-13133',0,3,'MEM: Bat'),('sid-13138',0,2,'Toronto Blue Jays'),('rookies',0,2,'New York Yankees')]
    for key,i,col,val in cases:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'][i][col]=val
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption accepted '+key)
    for key in ['base-2','gold-2','onyx-2','elimination-2','supplement','bcp-base']:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'].pop()
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Incomplete checklist accepted '+key)
    for mutate in [lambda b:b['product'].__setitem__('released',True),lambda b:next(s for s in b['productSets'] if s['key']=='autograph-relics').__setitem__('oddsPerPack',12240),lambda b:next(s for s in b['productSets'] if s['key']=='gold').__setitem__('oddsPerPack',48)]:
        changed=copy.deepcopy(bundle);mutate(changed)
        try:assemble(changed,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted')
    print('PASS: whole-token names/checklist exception, bounded failures, 18 corrupt-source and 3 manifest safety cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);cards=assemble(bundle,snapshot);text=csv_text(cards)
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 817 cards / 11 collector families / 21 true base RCs; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
