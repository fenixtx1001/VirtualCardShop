#!/usr/bin/env python3
"""Generate and audit the unreleased 2003 Bowman Baseball draft.

1317 explicit cards in eleven collector families. Independently audit full
base/parallel/insert rosters, all teams, 165 true RCs, aliases, redemption
exclusions, memorabilia provenance and actual serial versus print-run attributes.
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
STEM = '2003-bowman-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1317
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

COUNTS={'base':330,'gold':330,'silver':330,'metallic-gold':165,'bats':33,'jerseys':46,'autographs':40,'red-ink':40,'dual-autographs':1,'futures-autograph':1,'roy-relic':1}
SIDS={'base':1597,'gold':14263,'silver':14268,'metallic-gold':14267,'bats':14260,'jerseys':14262,'autographs':14264,'red-ink':14266,'dual-autographs':14265,'futures-autograph':14261,'roy-relic':1597}
RAW_COUNTS={**COUNTS,'silver':331,'metallic-gold':166}
ODDS={'base':None,'gold':1,'silver':None,'metallic-gold':None,'bats':None,'jerseys':26,'autographs':None,'red-ink':687,'dual-autographs':9220,'futures-autograph':None,'roy-relic':765}
PARALLELS={'gold','silver','metallic-gold','red-ink'}
PRODUCT='2003_Bowman_Baseball'
ALIASES={'171':('Ramon A. Martinez','Ramon Nivar',29716),'190':('Eny Cabreja','Wandy Rodriguez',5023),'217':('Jairo Garcia','Santiago Casilla',28313),'258':('Aneudis Mateo','Willy Corporan',98797),'293':('Carlos Rijo','Rafael Diaz',80389),'317':('Denny Tussen','Carlos Morla',190776)}
SECTIONS={'bats':'Future_Fiber_Bats','jerseys':'Futures_Game_Gear_Jersey_Relics','autographs':'Signs_of_the_Future','dual-autographs':'Dual','futures-autograph':'Jose_Reyes_Futures_Game_Base_Autograph','roy-relic':'Dual_ROY_Relic'}


def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|UER|AU|MEM|CL|EXCH|SN\d+|PR\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normalized(name):
    name=split_label(name)[0];name=re.split(r' UER:| ERR:',name)[0]
    aliases={old:new for old,new,pid in ALIASES.values()}
    aliases.update({'Ramon Nivar-Martinez':'Ramon Nivar','Jacabo Meque':'Jacobo Meque','Bob Abreu':'Bobby Abreu','Ichiro':'Ichiro Suzuki','Wilfredo Ledezma':'Wil Ledezma','Rob Hammock':'Robby Hammock','Matthew Peterson':'Matt Peterson','Jon Schuerholz, Jr.':'Jon Schuerholz','Andy Dominique':'Andrew Dominique','Zach Segovia':'Zack Segovia'})
    return sorted(re.sub(r'[^a-z0-9]','',aliases.get(p,p).lower()) for p in name.split(' / '))

def is_checklist(name,subset=''):return 'checklist' in (name+' '+subset).lower()

def supplementary_rows(raw):
    keys=['base','bats','futures-autograph','jerseys','autographs','dual-autographs','red-ink','metallic-gold'];tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==8,'Independent table scope changed');out=[]
    for key,tb in zip(keys,tables):
        rows=[]
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',tb,re.S):
            cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
            if cells:require(len(cells)==3,'Unexpected independent columns');rows.append([key,*cells])
        require(len(rows)==RAW_COUNTS[key],'Incomplete independent '+key);out+=rows
    return out

def keyman_rows(raw):return [plain(s) for s in re.findall(r'<li\b[^>]*>(.*?)</li>',raw,re.S) if re.match(r'^\d+ [A-Za-z]',plain(s))]

def bcp_rows(raw,key):
    if key=='base':return list_items(section(raw,'Veterans_.28Reds.29'))+list_items(section(raw,'Rookies_.26_Prospects_.28Blues.29'))
    prefix={'bats':'FF-','jerseys':'FG-','autographs':'SOF-','dual-autographs':'DSF-','futures-autograph':'FCAB-','roy-relic':'ROY-'}[key]
    return [s for s in list_items(section(raw,SECTIONS[key])) if s.startswith(prefix)]

def configuration_rows(raw):
    out=[]
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
        if cells:require(len(cells)==6,'Unexpected odds columns');out.append(cells)
    require(len(out)==10,'Incomplete physical odds table');return out

def extract(key,raw,entry):
    if key=='supplement':return supplementary_rows(raw)
    if key=='keyman':return keyman_rows(raw)
    if key.startswith('identity-'):
        title=plain(re.search(r'<title>(.*?)</title>',raw,re.S)[1]);return [title.split('Cards | Trading Card Database')[0].strip()]
    if key.startswith('bcp-'):
        if key=='bcp-configuration':return configuration_rows(raw)
        if key=='bcp-distribution':return [plain(section(raw,'Distribution','Reviews'))]
        if key=='bcp-parallels':
            return [plain(section(raw,'Gold')),plain(section(raw,'Uncirulated_Silver')),plain(section(raw,'Uncirculated_Metallic_Gold'))]
        return bcp_rows(raw,key[4:])
    if key=='scope-index':return sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1597})
    if key=='scope-details':
        text=plain(raw);i=text.index('Insert Sets (6)');return [text[i:text.index('Add Insert or',i)]]
    if key=='dealer-hobby':
        text=plain(raw);require('(24) packs, each with (10) cards' in text,'Independent Hobby pack configuration changed');return ['24 packs per box','10 cards per pack']
    if key=='dealer-jumbo':
        text=plain(raw);require('12 packs per box, 21 cards per pack' in text,'Independent HTA pack configuration changed');return ['12 packs per box','21 cards per pack']
    return parse(raw,entry['namespace'])

def raw_family(snapshot,key):
    if key=='roy-relic':return records(snapshot,'inline-roy')
    pages=range(1,5) if key in {'base','gold','silver'} else range(1,3) if key=='metallic-gold' else [1];rows=[]
    for i in pages:
        k=f'{key}-{i}';e=snapshot['sources'][k];require(e['namespace']==SIDS[key] and int(re.search(r'/sid/(\d+)/',e['url'])[1])==SIDS[key],'Wrong source namespace '+key)
        page=records(snapshot,k);expected=min(100,RAW_COUNTS[key]-(i-1)*100);require(len(page)==expected,'Incomplete source page '+k);rows+=page
    require(len(rows)==RAW_COUNTS[key] and len(rows)==len({r[0] for r in rows}),'Incomplete/duplicate family '+key);return rows

def row_for(key,n,label,team,note,rc):
    name,tags=split_label(label);subset='';notes=[]
    if key in {'base','gold','silver','metallic-gold'}:
        if n=='NNO':
            expected=['NNO','Set Exchange Card SN250','Colorado Rockies',''] if key=='silver' else ['NNO','Exchange Card','Colorado Rockies','']
            require([n,label,team,note]==expected and key in {'silver','metallic-gold'},'Unreviewed redemption ticket');return None
        expected=({'RC'} if n in rc else set()) if key=='base' else {'SN250'} if key=='silver' else set()
        if key=='base' and n=='240':expected|={'UER'}
        require(tags==expected,'Unexpected base/parallel tags '+key+' '+n)
        require(note==('UER: Position listed as P for pitcher, should be 2B' if key=='base' and n=='240' else '1st Year Card' if key=='base' and n=='327' else ''),'Unreviewed annotation '+key+' '+n)
        subset='Veterans' if int(n)<=155 else 'Rookies/Prospects'
        if n in ALIASES:
            printed,canonical,pid=ALIASES[n];require(name==printed,'Reviewed printed identity changed '+n);name=canonical;notes.append('Printed name '+printed+'; verified catalogue identity '+canonical)
        name={'CC Sabathia':'C.C. Sabathia','Ichiro':'Ichiro Suzuki','Wilfredo Ledezma':'Wil Ledezma','Rob Hammock':'Robby Hammock'}.get(name,name)
        if key=='base' and n in rc:name+=' RC'
        if note:notes.append(note)
        if key=='gold':notes.append('Thicker cardstock; gold-foil facsimile signature; not a certified autograph')
        if key=='silver':notes.append('Uncirculated Silver sealed holder; serial numbered /250; box topper')
        if key=='metallic-gold':notes.append('Uncirculated Metallic Gold sealed holder; stated print run 230; not serial numbered; fulfilled mail-in card')
    elif key=='bats':
        require(tags=={'MEM'} and note=='MEM: Game-used bat','Unverified bat material');notes.append('Game-used bat relic')
    elif key=='jerseys':
        require(tags=={'MEM'} and not note,'Unreviewed jersey metadata');notes.append('Game-worn jersey relic from 2002 All-Star Futures Game')
        if n=='FG-VD':notes.append('Card back lists Cleveland Indians; printed affiliation retained despite historical-club discrepancy')
    elif key in {'autographs','red-ink','dual-autographs'}:
        require(tags=={'AU'} and not note,'Unreviewed signature metadata');notes.append('Certified dual autograph' if key=='dual-autographs' else 'Certified autograph')
        if key=='red-ink':notes.append('Red ink signature parallel')
    elif key=='futures-autograph':
        require(n=='FGAB-JR' and tags=={'AU','MEM'} and note=='MEM: Base','Unverified Reyes signed relic');notes.append('Certified autograph; game-used base relic from 2002 All-Star Futures Game; HTA Jumbo exclusive')
    elif key=='roy-relic':
        require(n=='ROY-JH' and tags=={'MEM'} and note=='Jennings Jersey/Hinske Bat','Unverified ROY materials/order');notes.append('2002 Rookies of the Year; game-worn jersey of Jason Jennings / game-used bat of Eric Hinske')
    else:raise ValueError('Unknown family '+key)
    require(name and not re.search(r'\b(?:UER|AU|MEM|EXCH|SN\d+|PR\d+)\b',name),'Unclean subject '+name)
    require(team or is_checklist(name,subset),'Missing non-checklist team '+key+' '+n)
    require(all(t in KNOWN_CLUBS for t in team.split(' / ')) if team else is_checklist(name,subset),'Invalid historical team '+team)
    return [key,n,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards,rc):
    by={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS}
    for key in ['base','bats','jerseys','autographs','dual-autographs','futures-autograph','roy-relic']:
        rows=records(snapshot,'bcp-'+key);require(len(rows)==COUNTS[key],'Incomplete independent family '+key);seen=set()
        for text in rows:
            n,name=text.split(' ',1)
            if key=='base':name=re.sub(r' RC\*?(?= |$)','',name);name=re.sub(r' \(.*','',name);name=re.split(r' UER:',name)[0]
            if key in {'bats','autographs'}:name=re.sub(r' [ABC]$','',name)
            if key=='roy-relic':name=name.removesuffix(' JSY / BAT')
            if key=='futures-autograph':require(n=='FCAB-JR','Reviewed BCP prefix changed');n='FGAB-JR'
            require(n not in seen and n in by[key],'Independent number mismatch '+key+' '+n);seen.add(n)
            require(normalized(name)==normalized(by[key][n][2].removesuffix(' RC')),'Independent subject mismatch '+key+' '+n+': '+name+' / '+by[key][n][2])
        if key=='base':require({r.split()[0] for r in rows if ' RC' in r}==rc,'Independent true RC inventory mismatch')
    supplemental=records(snapshot,'supplement');require(len(supplemental)==657,'Incomplete independent tuple source');seen=set()
    for key,n,name,team in supplemental:
        if n=='NNO':require(key=='metallic-gold' and name=='Exchange Card' and team=='Colorado Rockies','Unreviewed exchange ticket');continue
        require((key,n) not in seen,'Independent duplicate tuple');seen.add((key,n));r=by[key].get(n)
        require(r is not None and normalized(name)==normalized(r[2].removesuffix(' RC')) and team==r[3],'Independent number/name/team mismatch '+str((key,n,name,team,r)))
    base=by['base']
    for key in ['gold','silver','metallic-gold']:
        for n,r in by[key].items():require(r[2]==base[n][2].removesuffix(' RC') and r[3:5]==base[n][3:5],'Parallel identity/team/subset mismatch '+key+' '+n)
    for n,r in by['red-ink'].items():require(r[2:5]==by['autographs'][n][2:5],'Red Ink checklist mismatch '+n)
    keyman=records(snapshot,'keyman');require(len(keyman)==330,'Incomplete independent Keyman base');seen=set()
    for text in keyman:
        n,name=text.split(' ',1);require(n not in seen and n in base,'Independent Keyman numbering mismatch');seen.add(n);require(normalized(name)==normalized(base[n][2].removesuffix(' RC')),'Independent Keyman identity mismatch '+n+': '+name)
    for n,(printed,canonical,pid) in ALIASES.items():
        e=snapshot['sources']['identity-'+n];require('/pid/'+str(pid)+'/' in e['url'] and records(snapshot,'identity-'+n)==[canonical],'Independent alias identity mismatch '+n)
    require(records(snapshot,'scope-index')==sorted(set(SIDS.values())-{1597}),'Wrong related family inventory')
    require(records(snapshot,'bcp-configuration')==snapshot['expectedPhysicalConfiguration'] and records(snapshot,'bcp-distribution')==snapshot['expectedDistribution'] and records(snapshot,'bcp-parallels')==snapshot['expectedParallelEvidence'] and records(snapshot,'scope-details')==snapshot['expectedScopeDetails'],'Historical collation/odds/scope changed')
    require(records(snapshot,'dealer-hobby')==['24 packs per box','10 cards per pack'] and records(snapshot,'dealer-jumbo')==['12 packs per box','21 cards per pack'],'Independent pack configuration changed')
    draft=records(snapshot,'draft-signs');require(len(draft)==5 and any(r[0]=='SOF-AT' and r[1]=='Andres Torres AU' for r in draft),'Separate Draft release exclusion evidence changed')
    require('SOF-AT' not in by['autographs'] and 'SOF-AT' not in by['red-ink'],'Planned box checklist/Draft-only card wrongly added')

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1 and snapshot['productId']==PRODUCT,'Wrong snapshot product')
    rcs=records(snapshot,'rookies-1')+records(snapshot,'rookies-2');rc={r[0] for r in rcs};require(len(rcs)==len(rc)==165,'Incomplete true RC index')
    cards=[row for k in COUNTS for r in raw_family(snapshot,k) if (row:=row_for(k,*r,rc)) is not None]
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['id']==PRODUCT and p['year']==2003 and p['brand']=='Bowman' and p['sport']=='Baseball' and p['released'] is False,'Incorrect product or released manifest');require(p['cardsPerPack']==10 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Pack/release configuration changed')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==11 and {s['key'] for s in specs}==set(COUNTS),'Wrong collector families');require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Duplicate or incomplete cards')
    for spec in specs:
        k=spec['key'];rows=[r for r in cards if r[0]==k];require(len(rows)==spec['expectedCards']==COUNTS[k] and spec['sourceSetId']==SIDS[k] and spec['oddsPerPack']==ODDS[k] and spec['kind']==('BASE' if k=='base' else 'PARALLEL' if k in PARALLELS else 'INSERT'),'Invalid count/source/odds/kind '+k)
        if k in {'base','gold','silver'}:require({r[1] for r in rows}==set(map(str,range(1,331))) and sum(r[4]=='Veterans' for r in rows)==155 and sum(r[4]=='Rookies/Prospects' for r in rows)==175,'Wrong full checklist/subsets '+k)
        if k=='metallic-gold':require({r[1] for r in rows}==set(map(str,range(166,331))),'Uncirculated Metallic Gold partial inventory mismatch')
    actual={r[1]:(normalized(r[2].removesuffix(' RC')),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')};indexed={n:(normalized(label),team) for n,label,team,note in rcs};require(actual==indexed and sum(r[2].endswith(' RC') for r in cards)==165,'True RC number/name/team mismatch')
    for row in cards:require(len(row)==6 and all(isinstance(v,str) for v in row) and (row[3] or is_checklist(row[2],row[4])) and not re.search(r'\b1\s*:\s*\d+',row[5]),'Invalid card/team or set-wide odds in variant')
    verify_independent(snapshot,cards,rc);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#')[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=4) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for k,e in changed['sources'].items():
        raw=cache[e['url'].split('#')[0]];e['records']=extract(k,raw,e);e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print('Retrieved',k,len(e['records']),flush=True)
    def image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed original image changed '+e['key'])
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,want in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall AU','John Marshall'),('Jim Hall CL','Jim Hall'),('Kevin Youkilis RC','Kevin Youkilis')]:require(split_label(raw)[0]==want,'Strict trailing token cleanup failed')
    require(is_checklist('Checklist') and is_checklist('Subject','Checklist') and not is_checklist('Kevin Youkilis'),'Checklist exception failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Source failure bypassed')
            require(mock.call_count==calls,'Unbounded retries')
    assemble(bundle,snapshot)
    cases=[('base-1',0,1,'Wrong Player'),('base-1',0,2,''),('base-1',0,1,'Garret Anderson RC'),('gold-1',0,1,'Garret Anderson SN230'),('silver-1',0,1,'Garret Anderson SN230'),('metallic-gold-1',0,1,'Jose Contreras SN230'),('bats-1',0,3,'MEM: Jersey'),('futures-autograph-1',0,3,'MEM: Bat'),('inline-roy',0,3,'Jennings Bat/Hinske Jersey'),('identity-190',0,None,'Wrong Identity'),('jerseys-1',0,2,'New York Yankees')]
    for key,i,col,value in cases:
        s=copy.deepcopy(snapshot)
        if col is None:s['sources'][key]['records'][i]=value
        else:s['sources'][key]['records'][i][col]=value
        try:assemble(bundle,s)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corrupt source accepted '+key)
    for key in ['base-4','gold-4','silver-4','metallic-gold-2','rookies-2','autographs-1','red-ink-1','supplement','bcp-base','keyman']:
        s=copy.deepcopy(snapshot);s['sources'][key]['records'].pop()
        try:assemble(bundle,s)
        except (ValueError,KeyError):pass
        else:raise ValueError('Incomplete source accepted '+key)
    for key,value in [('released',True),('silver',24),('metallic-gold',49),('bats',96),('autographs',39),('futures-autograph',141)]:
        b=copy.deepcopy(bundle)
        if key=='released':b['product']['released']=value
        else:next(s for s in b['productSets'] if s['key']==key)['oddsPerPack']=value
        try:assemble(b,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted '+key)
    print('PASS: name boundaries/checklist exception, bounded retrieval failures, 21 corrupt-source and six unsafe-manifest rejection cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args();bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);text=csv_text(assemble(bundle,snapshot))
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 1317 cards / 11 collector families / 165 true base RCs; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
