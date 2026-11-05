#!/usr/bin/env python3
"""Generate and audit the 2001 Fleer E-X Baseball unreleased draft.

Reconstruct all original-product base/parallel/insert rows from committed sources.
Verify independent rosters, published signed/unsigned allocations and true RCs.
The ten Platinum-issued paper update cards are audited separately and excluded
from original E-X packs. Unknown odds stay null. No database or deployment access.
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
STEM = '2001-fleer-ex-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 426
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


NUM = re.compile(r'^(?:\d{1,3}(?:\s?[A-Z]{1,3})?|NNO)$', re.I)


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



COUNTS = {'base':130,'essential':130,'rookie-autographs':29,'jerseys':44,
    'jersey-autographs':42,'wall-of-fame':30,'extra-innings':10,'jeter-monumental':1,
    'jeter-monumental-auto':1,'jeter-base-inks':1,'season-pass':6,'checklists':2}
SIDS = dict(zip(COUNTS,[1455,12771,12773,12769,12770,12774,12772,324253,324254,324261,152530,264410]))
ODDS = {k:24 if k=='wall-of-fame' else 33 if k=='jerseys' else None for k in COUNTS}
ROOKIES = {'105','109','115','117'}
SECTIONS = {'base':'Base_Set','rookie-autographs':'Autographed_Rookie/Prospects',
    'jerseys':'Behind_the_Numbers','jersey-autographs':'Autographed',
    'wall-of-fame':'Wall_of_Fame','extra-innings':'Extra_Innings'}
TRAILING = re.compile(r'\s+((?:RC|AU|MEM|SN\d+|PR\d+|CL|RDM)(?:,?\s+(?:RC|AU|MEM|SN\d+|PR\d+|CL|RDM))*)$',re.I)

def require(condition,message):
    if not condition: raise ValueError(message)

def split_label(label):
    label=' '.join(label.split()); match=TRAILING.search(label)
    return (label[:match.start()],set(re.split(r',?\s+',match[1].upper()))) if match else (label,set())

def clean_name(label): return split_label(label)[0]
def local_id(name): return 'NNO-'+re.sub('[^A-Z0-9]+','-',name.upper()).strip('-')
def normalized(name):
    aliases={'Dave Justice':'David Justice'}
    return re.sub('[^a-z0-9]','',aliases.get(name,name).lower())

def fetch_bytes(url):
    for attempt in range(1,4):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(request,timeout=35) as response: return response.read()
        except (OSError,URLError) as exc:
            transient=not isinstance(exc,HTTPError) or exc.code in {429,502,503,504}
            if not transient or attempt==3:
                raise RuntimeError(f'Source retrieval failed after {attempt} attempt(s): {url}: {exc}; no partial CSV written') from exc
            print(f'Transient source failure; retry {attempt}/2: {url}',flush=True); time.sleep(attempt)

def fetch(url): return fetch_bytes(url).decode('utf8','replace')
def list_items(raw):
    return [' '.join(html.unescape(re.sub('<[^>]+>',' ',r)).split()) for r in re.findall(r'<li>(.*?)</li>',raw,re.S)]

def section(raw,name,end=None):
    part=raw[raw.index('id="'+name+'"'):]
    if end: return part[:part.index('id="'+end+'"')]
    boundary=re.search(r'<h[1-4](?:\s|>)',part)
    return part[:boundary.start()] if boundary else part[:part.index('</ul>')+5]

def independent_rows(raw,key):
    if key=='base': return list_items(section(raw,'Base_Set','Parallels'))
    return list_items(section(raw,SECTIONS[key]))

def shared_jeter_rows(raw):
    # Keep every brand's entries to audit product membership, not only E-X.
    part=raw[raw.index('id="Checklist"'):raw.index('Retrieved from')]
    rows=[r for r in list_items(part) if re.fullmatch(r'(?:MM\d+|NNO)?\s*Derek Jeter (?:PREM|EX|GAME|AUTH|SHOW) \d+',r)]
    require(len(rows)==11,'Shared Jeter program changed')
    return rows

def shared_season_rows(raw):
    rows=list_items(section(raw,'Checklist'))
    require(len(rows)==30 and all(re.search(r' (?:E-X|FOC|PREM|TRAD|ULT)$',r) for r in rows),'Shared Season Pass program changed')
    return rows

def supplementary_rows(raw):
    out=[]
    tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S)
    for key,table in zip(['base','rookie-autographs'],tables[:2]):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if len(cells)==3 and cells[0].isdigit(): rows.append([key,*cells])
        require(len(rows)==COUNTS[key],'Incomplete supplementary team table: '+key); out+=rows
    require(len(out)==159,'Supplementary tables missing')
    return out

def configuration_rows(raw):
    text=' '.join(html.unescape(re.sub('<[^>]+>',' ',section(raw,'Distribution','Reviews'))).split())
    require('Hobby: 24 packs per box, five cards per pack' in text,'Hobby configuration source changed')
    require('8-pack retail Blaster: 8 packs per box, three cards per pack' in text,'Retail configuration source changed')
    table=section(raw,'Insertion_Ratios','Checklist'); rows=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
        cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells: require(len(cells)==5,'Unparsed insertion-ratio row'); rows.append(cells)
    require(len(rows)==14,'Insertion-ratio inventory changed')
    return [['Hobby configuration','24','5'],['Retail blaster configuration','8','3'],*rows]

def scope_rows(raw):
    observed=set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1455}
    require(observed==set(SIDS.values())-{1455},'Related-family scope changed')
    require(parse(raw,1455)==[],'Unexpected promo checklist rows')
    return sorted(observed)

def records(snapshot,key):
    entry=snapshot['sources'][key]
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid provenance: '+key)
    return entry['records']

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot); urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool: cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,entry in changed['sources'].items():
        raw=cache[entry['url'].split('#',1)[0]]
        if key=='bcp-configuration': rows=configuration_rows(raw)
        elif key=='bcp-jeter': rows=shared_jeter_rows(raw)
        elif key=='bcp-season': rows=shared_season_rows(raw)
        elif key.startswith('bcp-'): rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key=='supplementary-teams': rows=supplementary_rows(raw)
        elif key=='scope-index': rows=scope_rows(raw)
        else: rows=parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',entry['url'])[1]))
        entry['records']=rows; entry['sha256']=hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def check_scan(entry): require(hashlib.sha256(fetch_bytes(entry['url'])).hexdigest()==entry['sha256'],'Reviewed scan changed: '+entry['key'])
    with ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(check_scan,changed['reviewedScanEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat(); return changed

def raw_family(snapshot,key):
    pages=[key+'-1',key+'-2'] if key in {'base','essential'} else [key]
    for page in pages: require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])==SIDS[key],'Wrong namespace: '+page)
    rows=[r for page in pages for r in records(snapshot,page)]
    require(len(rows)==COUNTS[key],'Incomplete source family: '+key)
    return rows

def attributes(tags):
    sn=[int(t[2:]) for t in tags if t.startswith('SN')]; pr=[int(t[2:]) for t in tags if t.startswith('PR')]
    require(len(sn)<=1 and len(pr)<=1,'Ambiguous serial/print-run tokens')
    return (sn[0] if sn else None,pr[0] if pr else None)

def row_for(key,number,label,team,note):
    name,tags=split_label(label); sn,pr=attributes(tags); subset=''; notes=[]
    if key=='base':
        if int(number)<=100: require(not tags and not note,'Unexpected veteran attribute')
        else:
            subset='Rookies/Prospects'
            expected={f'SN{sn}'} | ({f'PR{pr}'} if number!='105' else set()) | ({'RC'} if number in ROOKIES else set())
            require(tags==expected and sn in {1999,2499,2999} and (pr is not None or number=='105'),'Invalid prospect attributes')
            notes.append(f'Serial numbered /{sn}')
            if pr is not None: notes.append(f'Published unsigned allocation {pr}; shared numbered pool with autographs')
            if number in ROOKIES: name+=' RC'
    elif key=='essential':
        expected_run=299 if int(number)<=100 else 29
        require(tags=={f'SN{expected_run}'},'Wrong Essential Credentials print run')
        subset='Essential Credentials Now' if int(number)<=100 else 'Essential Credentials Future'
        notes.append(f'Serial numbered /{sn}')
    elif key=='rookie-autographs':
        require(tags=={'AU',f'SN{sn}',f'PR{pr}'} and sn in {1999,2499,2999} and pr is not None,'Invalid prospect autograph attributes')
        subset='Rookies/Prospects'; notes=[f'Autograph; serial numbered /{sn}',f'Published signed allocation {pr}; shared numbered pool with unsigned cards']
    elif key in {'jerseys','jersey-autographs','wall-of-fame'}:
        require(number=='NNO','Unexpected printed memorabilia number')
        expected={'MEM'} | ({'AU',f'SN{sn}'} if key=='jersey-autographs' else set())
        require(tags==expected,'Unexpected memorabilia attributes'); number=local_id(name)
        notes.append('Milwaukee County Stadium outfield-wall memorabilia' if key=='wall-of-fame' else 'Game-used jersey memorabilia')
        if key=='jersey-autographs':
            notes.append('Autograph')
            if name=='Rollie Fingers':
                require(sn==34,'Rollie Fingers catalogue run changed')
                notes.append('Serial run pending verification: catalogue /34; independent listing /24')
            else: notes.append(f'Hand numbered /{sn}')
        if note=='Die-cut': notes.append(note)
        else: require(note in {'','MEM: Outfield Wall'},'Unexpected memorabilia annotation')
    elif key=='extra-innings': require(not tags and not note,'Unexpected Extra Innings attribute')
    elif key.startswith('jeter-'):
        require(name=='Derek Jeter' and team=='New York Yankees','Wrong E-X Jeter subject/team')
        if key=='jeter-monumental':
            require(number=='2 MM' and tags=={'SN1996'},'Wrong E-X Monumental Moments issue'); notes.append('Serial numbered /1996')
        elif key=='jeter-monumental-auto':
            require(number=='NNO' and tags=={'AU','SN96'},'Wrong E-X Jeter autograph issue'); number=local_id(name); notes.append('Autograph; hand numbered /96')
        else:
            require(number=='NNO' and tags=={'AU','MEM'} and note=='MEM: Base','Wrong Base Inks attribute'); number=local_id(name); notes.append('Autograph; game-used base memorabilia; published print run 500')
    elif key=='season-pass':
        require(number=='NNO' and tags=={'RDM','PR1'} and not note,'Wrong Season Pass attributes')
        number=local_id(name); notes.append('Season Pass exchange card; published print run 1; historical redemption expired December 1, 2001')
    elif key=='checklists':
        require(number=='NNO' and tags=={'CL'} and not team and not note,'Invalid generic checklist')
        require(name in {'Checklist: 1-121','Checklist: 122-140 and Inserts'},'Unexpected checklist range')
        number='NNO-A' if name=='Checklist: 1-121' else 'NNO-B'
        notes.append(name if number=='NNO-A' else 'Checklist: 122-130 and Inserts; source catalogue range 122-140 corrected from scans')
        name='Checklist'; subset='Checklist'
    require(name and not re.search(r'\b(?:AU|MEM|RDM|SN\d+|PR\d+)\b',name),'Unclean subject: '+name)
    require(team or 'checklist' in (name+' '+subset).lower(),'Missing non-checklist team')
    require(not team or team in KNOWN_CLUBS,'Invalid historical franchise: '+team)
    return [key,number,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    by_key={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS}
    base=by_key['base']; numbered={}; independent_rc=set()
    configuration=records(snapshot,'bcp-configuration')
    require(len(configuration)==len({r[0] for r in configuration})==16,'Incomplete configuration provenance')
    config={r[0]:r[1:] for r in configuration}
    for key,expected in {'Hobby configuration':['24','5'], 'Retail blaster configuration':['8','3'],
        'Wall of Fame':['30','-','1:24','?'], 'Behind the Numbers':['44','-','1:33','?'],
        'Extra Innings':['10','-','N/A','1:20'], 'Essential Credentials Now':['100','299','?','?'],
        'Essential Credentials Future':['30','29','?','?']}.items(): require(config.get(key)==expected,'Pack/odds source changed: '+key)
    for raw in records(snapshot,'bcp-base'):
        m=re.fullmatch(r'(\d+) (.+?)(?: (RC\*?))?(?: (\d+))?',raw); require(bool(m),'Unparsed independent base row: '+raw)
        n,name,rc,sn=m.groups(); require(n not in numbered,'Independent duplicate number'); numbered[n]=(name,rc,int(sn) if sn else None)
        if rc: independent_rc.add(n)
    require(set(numbered)=={str(i) for i in range(1,141)},'Independent 140-card combined scope incomplete')
    update=records(snapshot,'platinum-update')
    require(len(update)==10 and {r[0] for r in update}=={str(i) for i in range(131,141)},'Missing separately issued Platinum extension audit')
    require(independent_rc==ROOKIES|{str(i) for i in range(131,141)},'Independent rookie inventory changed')
    exceptions={'109':(2499,1999),'121':(2499,2999),'129':(2499,2999)}
    for n,label,team,_ in [r for k in ['base-1','base-2'] for r in records(snapshot,k)]+update:
        name,tags=split_label(label); sn,pr=attributes(tags); other,rc,other_sn=numbered[n]
        require(normalized(name)==normalized(other),'Independent base/update name mismatch #'+n)
        require(('RC' in tags)==bool(rc),'Independent RC mismatch #'+n)
        if n in exceptions: require((other_sn,sn)==exceptions[n],'Reviewed serial correction changed #'+n)
        elif int(n)<=130: require(sn==other_sn,'Independent base serial mismatch #'+n)
        else: require(sn==499 and tags=={'RC','SN499'},'Unexpected Platinum update attributes')
    require(len(records(snapshot,'bcp-base'))==140,'Incomplete independent base listing')
    for n,row in by_key['essential'].items(): require(row[2]==base[n][2].removesuffix(' RC') and row[3]==base[n][3],'Parallel identity/team mismatch #'+n)
    auto=by_key['rookie-autographs']; runs={}
    for raw in records(snapshot,'bcp-rookie-autographs'):
        m=re.fullmatch(r'(\d+) (.+) (\d+)',raw); require(bool(m),'Invalid independent autograph allocation')
        n,name,run=m.groups(); require(n not in runs,'Duplicate independent autograph'); runs[n]=int(run)
        require(n in auto and normalized(name)==normalized(auto[n][2]),'Autograph identity mismatch')
    require(set(runs)==set(auto)=={str(i) for i in range(101,131)}-{'105'},'Wrong autograph roster; Ichiro must be excluded')
    bsource={r[0]:r for r in raw_family(snapshot,'base')}
    for n,label,team,_ in raw_family(snapshot,'rookie-autographs'):
        name,tags=split_label(label); sn,pr=attributes(tags); bname,btags=split_label(bsource[n][1]); bsn,bpr=attributes(btags)
        require(pr==runs[n] and sn==bsn and pr+bpr==sn,'Shared serial pool/allocation mismatch #'+n)
        require(name==bname and team==bsource[n][2],'Prospect autograph identity/team mismatch #'+n)
    supplementary=records(snapshot,'supplementary-teams')
    require(len(supplementary)==len({(r[0],r[1]) for r in supplementary})==159,'Incomplete/duplicate supplementary identities')
    for key,n,name,team in supplementary:
        actual=by_key[key][n]; require(normalized(name.removesuffix(' RC'))==normalized(actual[2].removesuffix(' RC')) and team==actual[3],'Supplementary number/name/team mismatch '+key+' #'+n)
    for key in ['jerseys','wall-of-fame']:
        names=records(snapshot,'bcp-'+key)
        require(len(names)==COUNTS[key] and {normalized(n) for n in names}=={normalized(r[2]) for r in by_key[key].values()},'Independent memorabilia roster mismatch: '+key)
    bcp_auto={}
    for raw in records(snapshot,'bcp-jersey-autographs'):
        m=re.fullmatch(r'(.+) (\d+)',raw); require(bool(m),'Unparsed jersey autograph run'); name,run=m.groups(); bcp_auto[normalized(name)]=int(run)
    require(len(bcp_auto)==42,'Independent jersey autograph inventory changed')
    jerseys={normalized(r[2]):r for r in by_key['jerseys'].values()}
    for n,label,team,_ in raw_family(snapshot,'jersey-autographs'):
        name,tags=split_label(label); sn,_=attributes(tags); ident=normalized(name)
        require(ident in bcp_auto and ident in jerseys and team==jerseys[ident][3],'Jersey autograph identity/team mismatch')
        require((bcp_auto[ident],sn)==(24,34) if name=='Rollie Fingers' else bcp_auto[ident]==sn,'Jersey autograph run mismatch')
    require(set(jerseys)-set(bcp_auto)=={normalized('Willie Mays'),normalized('Ted Williams')},'Wrong unsigned-only jersey subjects')
    extra=records(snapshot,'bcp-extra-innings'); require(len(extra)==10,'Independent Extra Innings inventory changed')
    for raw in extra:
        n,name=raw.split(' ',1); require(n in by_key['extra-innings'] and normalized(name)==normalized(by_key['extra-innings'][n][2]),'Extra Innings identity mismatch')
    season=records(snapshot,'bcp-season'); expected={normalized(n.removesuffix(' E-X')) for n in season if n.endswith(' E-X')}
    require(len(season)==30 and len(expected)==6 and expected=={normalized(r[2]) for r in by_key['season-pass'].values()},'Wrong product-specific Season Pass scope')
    jeter=records(snapshot,'bcp-jeter'); require(len(jeter)==11 and [r for r in jeter if ' EX ' in r]==['MM2 Derek Jeter EX 1996','Derek Jeter EX 96','NNO Derek Jeter EX 500'],'Wrong product-specific Jeter scope')
    subjects={normalized(r[2].removesuffix(' RC')):r[3] for r in base.values()}
    for key in ['wall-of-fame','extra-innings','season-pass']:
        for row in by_key[key].values():
            subject=normalized(row[2]); expected_team=subjects.get(subject)
            if subject in {normalized('Paul Molitor'),normalized('Robin Yount')}: expected_team='Milwaukee Brewers'
            if subject==normalized('Nolan Ryan'): expected_team='Texas Rangers'
            require(row[3]==expected_team,'Insert historical team mismatch '+key+' '+row[2])
    # Jersey subjects may depict earlier teams, e.g. Grace CHC vs base ARI.
    for row in by_key['jerseys'].values():
        expected_team=subjects.get(normalized(row[2]))
        if expected_team and row[2] not in {'Mark Grace','Ben Grieve'}: require(row[3]==expected_team,'Contemporary jersey/base team mismatch '+row[2])

def validate(bundle,snapshot,cards):
    p=bundle['product']; review=bundle['review']; specs=bundle['productSets']
    require(snapshot['schemaVersion']==1 and snapshot['productId']=='2001_Fleer_EX_Baseball','Wrong source schema/identity')
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased DRAFT')
    require(p['id']=='2001_Fleer_EX_Baseball' and p['year']==2001 and p['brand']=='Fleer E-X' and p['sport']=='Baseball','Wrong product identity')
    require(p['cardsPerPack']==5 and p['packsPerBox']==24,'Wrong Hobby configuration')
    require(review['teamData']=='COMPLETE' and review['printRuns']=='PENDING_ROLLIE_FINGERS_JERSEY_AUTOGRAPH' and review['release']=='BLOCKED_PENDING_QA','Review gates changed')
    require(len(specs)==len({s['id'] for s in specs})==12 and {s['key'] for s in specs}==set(COUNTS),'Wrong family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==426,'Expected 426 unique explicit cards')
    for spec in specs:
        key=spec['key']; rows=[r for r in cards if r[0]==key]
        require(len(rows)==spec['expectedCards']==COUNTS[key] and spec['sourceSetId']==SIDS[key],'Incomplete family/namespace')
        expected={str(i) for i in range(1,131)} if key in {'base','essential'} else {str(i) for i in range(101,131)}-{'105'} if key=='rookie-autographs' else {str(i)+'XI' for i in range(1,11)} if key=='extra-innings' else {'2 MM'} if key=='jeter-monumental' else {'NNO-A','NNO-B'} if key=='checklists' else {local_id(clean_name(r[1])) for r in raw_family(snapshot,key)}
        require({r[1] for r in rows}==expected,'Wrong collector identity inventory: '+key)
        require(spec.get('oddsPerPack')==ODDS[key],'Unverified product-set odds')
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key=='essential' else 'INSERT'),'Wrong collector kind')
    indexed={n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies')}
    tagged={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==4 and set(indexed)==ROOKIES and indexed==tagged,'Rookie-index mismatch')
    require(sum(r[2].endswith(' RC') for r in cards)==4,'Unexpected parallel/insert RC')
    require({int(r[1]) for r in cards if r[0]=='base' and r[4]=='Rookies/Prospects'}==set(range(101,131)),'Base subset mismatch')
    for subset,start,end in [('Essential Credentials Now',1,101),('Essential Credentials Future',101,131)]: require({int(r[1]) for r in cards if r[0]=='essential' and r[4]==subset}==set(range(start,end)),'Essential subset mismatch')
    require({(r[0],r[1]) for r in cards if not r[3]}=={('checklists','NNO-A'),('checklists','NNO-B')},'Unexpected blank team')
    require(records(snapshot,'scope-index')==sorted(set(SIDS.values())-{1455}),'Related-family scope changed')
    evidence=snapshot['reviewedScanEvidence']; require(len(evidence)==len({r['key'] for r in evidence})==23,'Reviewed evidence inventory changed')
    for e in evidence: require(e['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',e['sha256']),'Invalid scan provenance')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV format')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into variant')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[row_for(spec['key'],*row) for spec in bundle['productSets'] for row in raw_family(snapshot,spec['key'])]
    validate(bundle,snapshot,cards); return cards

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    with patch.object(urllib.request,'urlopen',side_effect=[HTTPError('https://example.test',503,'temporary',None,None),io.BytesIO(b'verified')]) as mock, patch.object(time,'sleep'), redirect_stdout(io.StringIO()): require(fetch_bytes('https://example.test')==b'verified' and mock.call_count==2,'Transient retry failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'unavailable',None,None)) as mock, patch.object(time,'sleep'), redirect_stdout(io.StringIO()):
            try: fetch_bytes('https://example.test')
            except RuntimeError: pass
            else: raise ValueError('Retrieval failure bypassed')
            require(mock.call_count==calls,'Retries not bounded')
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('Jim Hall CL','Jim Hall'),('John Marshall MEM','John Marshall'),('Ken Boswell AU','Ken Boswell')]: require(clean_name(raw)==expected,'Whole-token name cleanup failed')
    raw='<tr><td><a href="/ViewCard.cfm/sid/1455/cid/1">105</a></td><td>Ichiro Suzuki RC, SN1999<figcaption>Caption without separator</figcaption></td><td>Seattle Mariners</td></tr>'
    require(parse(raw,1455)==[['105','Ichiro Suzuki RC, SN1999','Seattle Mariners','Caption without separator']],'Caption separation failed')
    for number in ['1XI','10XI','2 MM','NNO']: require(parse(raw.replace('>105<','>'+number+'<'),1455)[0][0]==number,'Collector-number parser failed')
    for invalid in [raw.replace('/sid/1455/','/sid/9999/'),raw.replace('>105<','>UNKNOWN<')]:
        try: parse(invalid,1455)
        except ValueError: pass
        else: raise ValueError('Namespace/unparsed linked row accepted')
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-2']['records'].pop()),
        ('duplicate number',lambda s:s['sources']['base-1']['records'][1].__setitem__(0,'1')),
        ('wrong player',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'New York Yankees')),
        ('missing team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),
        ('false rookie',lambda s:s['sources']['base-2']['records'][0].__setitem__(1,'Jason Hart RC, SN1999, PR1749')),
        ('wrong rookie index',lambda s:s['sources']['rookies']['records'][0].__setitem__(1,'Wrong Player RC, SN1999')),
        ('wrong parallel run',lambda s:s['sources']['essential-2']['records'][0].__setitem__(1,'Jason Hart SN299')),
        ('missing full parallel',lambda s:s['sources']['essential-1']['records'].pop()),
        ('wrong autograph allocation',lambda s:s['sources']['rookie-autographs']['records'][0].__setitem__(1,'Jason Hart AU, SN1999, PR251')),
        ('invented Ichiro autograph',lambda s:s['sources']['rookie-autographs']['records'][0].__setitem__(0,'105')),
        ('wrong prospect serial',lambda s:s['sources']['base-2']['records'][8].__setitem__(1,'Esix Snead RC, SN2499, PR1999')),
        ('wrong insert number',lambda s:s['sources']['extra-innings']['records'][0].__setitem__(0,'1 F')),
        ('cross-brand Jeter',lambda s:s['sources']['jeter-monumental']['records'][0].__setitem__(0,'1 MM')),
        ('missing Season Pass',lambda s:s['sources']['season-pass']['records'].pop()),
        ('wrong namespace',lambda s:s['sources']['essential-1'].__setitem__('url',s['sources']['base-1']['url'])),
        ('missing Platinum scope audit',lambda s:s['sources']['platinum-update']['records'].pop()),
        ('missing checklist',lambda s:s['sources']['checklists']['records'].pop()),
        ('odds in variant',lambda s:s['sources']['wall-of-fame']['records'][0].__setitem__(3,'Inserted 1:24 packs')),
        ('wrong source odds',lambda s:next(r for r in s['sources']['bcp-configuration']['records'] if r[0]=='Wall of Fame').__setitem__(3,'1:12')),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot); mutate(changed)
        try: assemble(bundle,changed)
        except (ValueError,KeyError): pass
        else: raise ValueError('Corruption accepted: '+name)
    for mutate in [lambda b:b['product'].__setitem__('released',True),lambda b:b['productSets'][1].__setitem__('oddsPerPack',24),lambda b:b['review'].__setitem__('printRuns','VERIFIED')]:
        changed=copy.deepcopy(bundle); mutate(changed)
        try: assemble(changed,snapshot)
        except ValueError: pass
        else: raise ValueError('Unsafe manifest accepted')
    print('PASS: parser, whole-token names, bounded source retries, 20 source corruption and 3 manifest safety cases')

def csv_text(cards):
    stream=io.StringIO(newline=''); writer=csv.writer(stream,lineterminator='\n'); writer.writerow(HEADER); writer.writerows(cards); return stream.getvalue()

def atomic_write(path,text):
    temp=path.with_suffix(path.suffix+'.tmp')
    try: temp.write_text(text,encoding='utf8'); temp.replace(path)
    finally: temp.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true'); parser.add_argument('--self-test',action='store_true'); parser.add_argument('--refresh-sources',action='store_true'); args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text()); snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources: snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot); cards=assemble(bundle,snapshot); text=csv_text(cards)
    if args.check: require(OUT.read_text()==text,'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources: atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print(f'PASS: {len(cards)} explicit cards / 12 collector families / 4 base RCs; Rollie Fingers run pending; released=false')
    for spec in bundle['productSets']: print(f"  {spec['key']}: {spec['expectedCards']}")

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr); sys.exit(1)
