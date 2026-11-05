#!/usr/bin/env python3
"""Generate the 2000 Metal Baseball unreleased Set Factory draft.

Reconstruct all 674 catalogue rows from committed, provenance-tracked source
records; compare independent checklists, product-specific autograph membership,
teams, subset ranges and true RCs before writing. --check compares exact CSV
bytes; --refresh-sources retrieves every listing and checks reviewed scan hashes.
Unverified Purple Foil Cedeno/Kapler team affiliations are explicitly flagged.
Unknown/unrepresentable odds remain null. No database access or deployment.
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
STEM = '2000-metal-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 674
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



EXPECTED_COUNTS = {'base':250, 'emerald':250, 'fusion':15, 'heavy-metal':10,
    'hit-machines':10, 'platinum-portraits':10, 'talent-show':15,
    'autographics':47, 'autographics-purple':47, 'base-shredders':18, 'checklists':2}
EXPECTED_ODDS = dict(zip(EXPECTED_COUNTS, [None,None,4,20,20,8,4,96,None,288,None]))
PARALLELS = {'emerald', 'autographics-purple'}
ROOKIES = {'223','228','245','248'}
SECTIONS = {'base':'Base_Set','fusion':'Fusion','heavy-metal':'Heavy_Metal',
    'hit-machines':'Hit_Machines','platinum-portraits':'Platinum_Portraits',
    'talent-show':'Talent_Show','base-shredders':'Base_Shredders'}
SIDS = dict(zip(EXPECTED_COUNTS, [1386,12085,12086,12087,12088,12089,12090,12241,12242,1387,179850]))
SUFFIXES = {'fusion':' F','heavy-metal':' HM','hit-machines':' H',
    'platinum-portraits':' PP','talent-show':' TS'}
PENDING_TEAMS = {'Roger Cedeno':('New York Mets','Houston Astros'),
    'Gabe Kapler':('Detroit Tigers','Texas Rangers')}
TAGS = r'(?:RC|CL|SAM|AU|PROS|MEM|SN\d+)'
TRAILING = re.compile(r'\s+('+TAGS+r'(?:,?\s+'+TAGS+r')*)$', re.I)

def require(condition, message):
    if not condition: raise ValueError(message)

def split_label(label):
    label=' '.join(label.split()); match=TRAILING.search(label)
    return (label[:match.start()],set(re.split(r',?\s+',match[1].upper()))) if match else (label,set())

def clean_name(label): return split_label(label)[0]
def is_checklist(name, subset=''): return 'checklist' in (name+' '+subset).lower()
def local_id(name): return 'NNO-'+re.sub('[^A-Z0-9]+','-',name.upper()).strip('-')

def fetch_bytes(url):
    for attempt in range(1,4):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(request,timeout=35) as response: return response.read()
        except (OSError,URLError) as exc:
            transient=not isinstance(exc,HTTPError) or exc.code in {429,502,503,504}
            if not transient or attempt==3:
                raise RuntimeError(f'Source retrieval failed after {attempt} attempt(s): {url}: {exc}; no partial CSV written') from exc
            print(f'Transient source failure; retry {attempt}/2: {url}',flush=True)
            time.sleep(attempt)

def fetch(url): return fetch_bytes(url).decode('utf8','replace')

def list_items(raw):
    return [' '.join(html.unescape(re.sub('<[^>]+>',' ',r)).split())
            for r in re.findall(r'<li>(.*?)</li>',raw,re.S)]

def independent_rows(raw,key):
    section=SECTIONS[key]; part=raw[raw.index('id="'+section+'"'):]
    if key=='base': part=part[:part.index('id="Parallels"')]
    elif key=='base-shredders': part=part[:part.index('</ul>')]
    else:
        boundary=re.search(r'<h[23](?:\s|>)',part)
        if boundary: part=part[:boundary.start()]
    return [r for r in list_items(part) if key=='base-shredders' or re.match(r'^\d+\s',r)]

def program_rows(raw):
    part=raw[raw.index('id="Checklist"'):raw.index('id="Parallels"')]
    rows=[]
    for label in list_items(part):
        match=re.fullmatch(r'(.+?)\s+((?:(?:EX|IM|MT|SB|DM)(?:\s|$))+|\*)',label)
        require(bool(match),'Unparsed program brand row: '+label)
        name,brands=match.groups(); rows.append([name,brands.split()])
    require(len(rows)==132,'Shared program roster changed')
    return rows

def supplementary_rows(raw):
    out=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',raw,re.S):
        cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if len(cells)==3 and cells[0].isdigit(): out.append(cells)
    require(len(out)==250,'Supplementary team listing changed')
    return out

def scope_rows(raw):
    observed=set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1386}
    # Metal's Autographics links redirect to the cross-product program namespaces.
    expected={12085,12086,12087,12088,12089,12090,1387,179850,266579,273437}
    require(observed==expected,'Related-family scope changed: '+repr(observed))
    require(parse(raw,1386)==[['100','Alex Rodriguez SAM','Seattle Mariners','']],'Promotional scope changed')
    return sorted(observed)

def prior_rookie_rows(raw):
    rows=[r for r in list_items(raw) if re.match(r'^U92\s',r)]
    require(rows==['U92 Rob Ramsay RC'],'Earlier Rob Ramsay true RC no longer verifiable')
    return rows

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot)
    urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool: cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,entry in changed['sources'].items():
        raw=cache[entry['url'].split('#',1)[0]]
        if key=='bcp-program': rows=program_rows(raw)
        elif key.startswith('bcp-'): rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key=='supplementary-teams': rows=supplementary_rows(raw)
        elif key=='scope-index': rows=scope_rows(raw)
        elif key=='prior-rookie-ramsay': rows=prior_rookie_rows(raw)
        else: rows=parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',entry['url'])[1]))
        entry['records']=rows; entry['sha256']=hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def check_scan(entry):
        require(hashlib.sha256(fetch_bytes(entry['url'])).hexdigest()==entry['sha256'], 'Reviewed scan changed: '+entry['key'])
    with ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(check_scan,changed['reviewedScanEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat()
    return changed

def records(snapshot,key):
    entry=snapshot['sources'][key]
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid provenance: '+key)
    return entry['records']

def normalized(name):
    aliases={'Bob Higginson':'Bobby Higginson','Bob Abreu':'Bobby Abreu','David Nilsson':'Dave Nilsson'}
    return re.sub('[^a-z0-9]','',aliases.get(name,name).lower())

def metal_issued(note): return bool(re.search(r'\bMetal\b',note) or note=='Issued in all five brands')

def raw_family(snapshot,key):
    prefix={'autographics':'autographics-all','autographics-purple':'autographics-purple-all'}.get(key,key)
    pages=[f'{prefix}-{i}' for i in range(1,4)] if key in {'base','emerald'} else [f'{prefix}-{i}' for i in [1,2]] if key.startswith('autographics') else [key]
    for page in pages: require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])==SIDS[key],'Wrong source namespace: '+page)
    rows=[r for page in pages for r in records(snapshot,page)]
    if key.startswith('autographics'):
        require(len(rows)==(132 if key=='autographics' else 123),'Incomplete shared Autographics source')
        require(len({clean_name(r[1]) for r in rows})==len(rows),'Duplicate shared autograph subject')
        rows=[r for r in rows if metal_issued(r[3])]
    require(len(rows)==EXPECTED_COUNTS[key],'Incomplete product-specific family: '+key)
    return rows

def row_for(key,number,label,team,note):
    name,tags=split_label(label); subset=''; notes=[]
    if key in {'base','emerald'}:
        subset='Prospects' if int(number)>=201 else ''
        expected=({'PROS'} if subset else set()) | ({'RC'} if key=='base' and number in ROOKIES else set())
        require(tags==expected,'Unverified numbered-card attributes: '+key+' #'+number)
        if key=='base' and number in ROOKIES: name+=' RC'
        if key=='emerald': notes.append('Emerald foil; circled E on back')
        if number=='88':
            require(name=='Kenny Rogers' and team==('New York Mets' if key=='emerald' else 'Texas Rangers'),'Reviewed Rogers source affiliation changed')
            team='Texas Rangers'; notes.append('New York Mets uniform; Texas Rangers affiliation')
        if number=='76':
            require(name=='Ken Griffey Jr.' and team=='Cincinnati Reds','Griffey base affiliation changed')
            notes.append('Seattle Mariners uniform; Cincinnati Reds affiliation')
        if key=='base' and number=='249': notes.append('Earlier true RC: 1999 Fleer Tradition Update U-92')
    elif key.startswith('autographics'):
        require(number=='NNO','Unexpected printed autograph number')
        expected={'AU'} | ({'SN50'} if key=='autographics-purple' else set())
        require(tags==expected and metal_issued(note),'Unverified Metal autograph attributes')
        number=local_id(name); notes.append('Autograph; Metal-issued shared 2000 SkyBox program')
        if key=='autographics-purple':
            notes.append('Purple foil; serial numbered /50')
            if name in PENDING_TEAMS: notes.append('Team affiliation pending scan verification; catalogue differs from regular Autographics')
    elif key=='base-shredders':
        require(number=='NNO' and tags=={'MEM'},'Unverified Base Shredders attribute')
        number=local_id(name); notes.append('Game-used base memorabilia')
    elif key=='checklists':
        require(number=='NNO' and tags=={'CL'} and not team,'Invalid unnumbered checklist')
        require(name in {'Checklist: 1-192','Checklist: 193-250 and Inserts'},'Unexpected checklist range')
        number='NNO-A' if name=='Checklist: 1-192' else 'NNO-B'
        notes.append(name); name='Checklist'; subset='Checklist'
    else: require(not tags and not note,'Unexpected regular insert attribute')
    require(not note or key.startswith('autographics'),'Unexpected unreviewed source annotation: '+note)
    require(name and not re.search(r'\b(?:SAM|AU|PROS|MEM|SN\d+)\b',name),'Unclean subject: '+name)
    require(team or is_checklist(name,subset),'Missing non-checklist team: '+key+' #'+number)
    require(not team or team in KNOWN_CLUBS,'Invalid historical team: '+team)
    return [key,number,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    by_key={key:{r[1]:r for r in cards if r[0]==key} for key in EXPECTED_COUNTS}
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key)
        require(len(rows)==EXPECTED_COUNTS[key],'Independent inventory incomplete: '+key)
        if key=='base-shredders':
            require({normalized(n) for n in rows}=={normalized(r[2]) for r in by_key[key].values()},'Independent Base Shredders roster mismatch')
            continue
        seen=set()
        for raw in rows:
            match=re.fullmatch(r'(\d+(?:\s[A-Z]{1,2})?)\s+(.+)',raw)
            require(bool(match),'Unparsed independent row: '+raw)
            number,subject=match.groups()
            require(number not in seen and number in by_key[key],'Independent numbering mismatch: '+raw); seen.add(number)
            subject=re.sub(r'\s+RC$','',subject)
            actual=by_key[key][number][2].removesuffix(' RC')
            if key=='base' and number=='220':
                require(subject=='Tony Armas' and actual=='Tony Armas, Jr.','Reviewed junior-name omission changed'); subject=actual
            require(sorted(normalized(n.strip()) for n in subject.split('/'))==sorted(normalized(n.strip()) for n in actual.split('/')),'Independent subject mismatch '+key+' #'+number+': '+subject+' / '+actual)
    require({r.split(' ',1)[0] for r in records(snapshot,'bcp-base') if re.search(r'\sRC$',r)}==ROOKIES|{'249'},'Independent RC discrepancy changed')
    require(records(snapshot,'prior-rookie-ramsay')==['U92 Rob Ramsay RC'],'Missing earlier true RC evidence')
    base=by_key['base']; supplementary=records(snapshot,'supplementary-teams')
    require(len(supplementary)==len({r[0] for r in supplementary})==250 and {r[0] for r in supplementary}==set(base),'Supplementary team inventory incomplete')
    for n,name,team in supplementary:
        require(normalized(name.removesuffix(' RC'))==normalized(base[n][2].removesuffix(' RC')) and team==base[n][3],'Supplementary identity/team mismatch #'+n)
    for number,row in by_key['emerald'].items():
        parent=base[number]
        require(row[2]==parent[2].removesuffix(' RC') and row[3:5]==parent[3:5],'Emerald identity/team/subset mismatch #'+number)
    program=records(snapshot,'bcp-program')
    require(len(program)==132 and len({normalized(n) for n,_ in program})==132,'Incomplete independent shared program')
    metal={normalized(n) for n,brands in program if 'MT' in brands}
    require(len(metal)==47,'Independent Metal program membership changed')
    for key in ['autographics','autographics-purple']:
        require({normalized(r[2]) for r in by_key[key].values()}==metal,'Cross-product contamination or missing Metal autograph: '+key)
    regular={r[2]:r[3] for r in by_key['autographics'].values()}
    purple={r[2]:r[3] for r in by_key['autographics-purple'].values()}
    require({n:(regular[n],purple[n]) for n in regular if regular[n]!=purple[n]}==PENDING_TEAMS,'Autograph team discrepancy inventory changed')
    subjects={normalized(r[2].removesuffix(' RC')):r[3] for r in base.values()}
    for key in [*SUFFIXES,'base-shredders']:
        for row in by_key[key].values():
            for name in row[2].split('/'):
                subject=normalized(name.strip()); expected=subjects.get(subject)
                if subject==normalized('Ken Griffey, Jr.'): expected='Seattle Mariners'
                if subject==normalized('Miguel Tejada'): expected='Oakland Athletics'
                if subject==normalized('Ugueth Urbina'): expected='Montreal Expos'
                require(expected==row[3],'Insert identity/team mismatch '+key+' #'+row[1])

def validate(bundle,snapshot,cards):
    require(snapshot['schemaVersion']==1,'Invalid source schema')
    p=bundle['product']; review=bundle['review']
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased DRAFT')
    require(p['id']=='2000_Metal_Baseball' and p['year']==2000 and p['brand']=='Metal' and p['sport']=='Baseball','Wrong product identity')
    require(p['cardsPerPack']==10 and p['packsPerBox']==28,'Wrong Hobby configuration')
    require(review['teamData']=='COMPLETE' and review['teamAffiliation']=='PENDING_TWO_PURPLE_AUTOGRAPH_SCANS' and review['release']=='BLOCKED_PENDING_QA','Review status changed')
    require(review['insertOdds']=='PENDING_EMERALD_MODEL_PURPLE_AND_CHECKLIST_ODDS','Unknown odds must stay pending')
    specs=bundle['productSets']
    require(len(specs)==len({s['id'] for s in specs})==11 and {s['key'] for s in specs}==set(EXPECTED_COUNTS),'Wrong family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==674,'Expected 674 unique explicit cards')
    for spec in specs:
        key=spec['key']; rows=[r for r in cards if r[0]==key]
        require(spec['sourceSetId']==SIDS[key],'Wrong manifest namespace')
        expected_ids={str(i) for i in range(1,251)} if key in {'base','emerald'} else {'NNO-A','NNO-B'} if key=='checklists' else {str(i)+SUFFIXES[key] for i in range(1,EXPECTED_COUNTS[key]+1)} if key in SUFFIXES else {local_id(clean_name(r[1])) for r in raw_family(snapshot,key)}
        require(len(rows)==spec['expectedCards']==EXPECTED_COUNTS[key] and {r[1] for r in rows}==expected_ids,'Incomplete or duplicate family: '+key)
        require(spec.get('oddsPerPack')==EXPECTED_ODDS[key],'Unverified odds: '+key)
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Wrong set kind')
    indexed={n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies')}
    tagged={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==4 and set(indexed)==ROOKIES and indexed==tagged,'Rookie index identity/team mismatch')
    require(sum(r[2].endswith(' RC') for r in cards)==4,'Unexpected parallel or insert RC')
    for key in ['base','emerald']:
        require({int(r[1]) for r in cards if r[0]==key and r[4]=='Prospects'}==set(range(201,251)),'Prospects subset range mismatch')
    require({(r[0],r[1]) for r in cards if not r[3]}=={('checklists','NNO-A'),('checklists','NNO-B')},'Unexpected blank team')
    require(records(snapshot,'scope-index')==sorted({12085,12086,12087,12088,12089,12090,1387,179850,266579,273437}),'Related-family scope changed')
    require(records(snapshot,'scope-promo')==[['100','Alex Rodriguez SAM','Seattle Mariners','']],'Promo exclusion changed')
    require(len(snapshot['reviewedScanEvidence'])==24 and len({s['key'] for s in snapshot['reviewedScanEvidence']})==24,'Incomplete scan evidence')
    for entry in snapshot['reviewedScanEvidence']: require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid scan provenance')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV row')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into card variant')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[row_for(spec['key'],*record) for spec in bundle['productSets'] for record in raw_family(snapshot,spec['key'])]
    validate(bundle,snapshot,cards)
    return cards

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    with patch.object(urllib.request,'urlopen',side_effect=[HTTPError('https://example.test',503,'temporary',None,None),io.BytesIO(b'verified')]) as mock, patch.object(time,'sleep'), redirect_stdout(io.StringIO()):
        require(fetch_bytes('https://example.test')==b'verified' and mock.call_count==2,'Transient retry failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'unavailable',None,None)) as mock, patch.object(time,'sleep'), redirect_stdout(io.StringIO()):
            try: fetch_bytes('https://example.test')
            except RuntimeError: pass
            else: raise ValueError('Source failure was bypassed')
            require(mock.call_count==calls,'Source retries are not bounded')
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall MEM','John Marshall'),('Jim Hall CL','Jim Hall'),('Ken Boswell AU','Ken Boswell')]: require(clean_name(raw)==expected,'Whole-token cleanup damaged a name')
    raw='<tr><td><a href="/ViewCard.cfm/sid/1386/cid/1">223</a></td><td>Danys Baez PROS, RC<figcaption>Caption without separator</figcaption></td><td>Cleveland Indians</td></tr>'
    require(parse(raw,1386)==[['223','Danys Baez PROS, RC','Cleveland Indians','Caption without separator']],'Caption separation failed')
    for number in ['1 F','10 HM','10 H','10 PP','15 TS','NNO']: require(parse(raw.replace('>223<','>'+number+'<'),1386)[0][0]==number,'Collector number parsing failed')
    for invalid in [raw.replace('/sid/1386/','/sid/9999/'),raw.replace('>223<','>UNKNOWN<')]:
        try: parse(invalid,1386)
        except ValueError: pass
        else: raise ValueError('Parser accepted wrong namespace or unparsed row')
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-3']['records'].pop()),
        ('duplicate number',lambda s:s['sources']['base-2']['records'][0].__setitem__(0,'1')),
        ('wrong player',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'New York Yankees')),
        ('missing team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),
        ('false Ramsay RC',lambda s:s['sources']['base-3']['records'][48].__setitem__(1,'Rob Ramsay PROS, RC')),
        ('missing PROS',lambda s:s['sources']['base-3']['records'][0].__setitem__(1,'Mark Quinn')),
        ('wrong rookie index',lambda s:s['sources']['rookies']['records'][0].__setitem__(1,'Wrong Player RC')),
        ('missing Emerald',lambda s:s['sources']['emerald-3']['records'].pop()),
        ('wrong Emerald team',lambda s:s['sources']['emerald-1']['records'][87].__setitem__(2,'Oakland Athletics')),
        ('wrong insert number',lambda s:s['sources']['heavy-metal']['records'][0].__setitem__(0,'1 H')),
        ('wrong purple run',lambda s:s['sources']['autographics-purple-all-1']['records'][0].__setitem__(1,'Chad Allen AU, SN100')),
        ('non-Metal auto contamination',lambda s:s['sources']['autographics-all-1']['records'][0].__setitem__(3,'Issued in Metal')),
        ('missing brand membership',lambda s:s['sources']['bcp-program']['records'][1].__setitem__(1,['SB'])),
        ('invented Shredders number',lambda s:s['sources']['base-shredders']['records'][0].__setitem__(0,'1')),
        ('missing checklist',lambda s:s['sources']['checklists']['records'].pop()),
        ('wrong namespace',lambda s:s['sources']['autographics-all-1'].__setitem__('url',s['sources']['base-1']['url'])),
        ('missing earlier RC evidence',lambda s:s['sources']['prior-rookie-ramsay'].__setitem__('records',[])),
        ('odds in variant',lambda s:s['sources']['base-1']['records'][0].__setitem__(3,'Inserted 1:4 packs')),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot); mutate(changed)
        try: assemble(bundle,changed)
        except (ValueError,KeyError): pass
        else: raise ValueError('Corruption test accepted: '+name)
    for mutate in [lambda b:b['product'].__setitem__('released',True),lambda b:b['productSets'][1].__setitem__('oddsPerPack',3),lambda b:b['review'].__setitem__('teamAffiliation','VERIFIED')]:
        changed=copy.deepcopy(bundle); mutate(changed)
        try: assemble(changed,snapshot)
        except ValueError: pass
        else: raise ValueError('Unsafe manifest accepted')
    print('PASS: strict parser, whole-token names, bounded retrieval retries, 19 source corruption cases, 3 manifest safety cases')

def csv_text(cards):
    stream=io.StringIO(newline=''); writer=csv.writer(stream,lineterminator='\n')
    writer.writerow(HEADER); writer.writerows(cards); return stream.getvalue()

def atomic_write(path,text):
    temporary=path.with_suffix(path.suffix+'.tmp')
    try:
        temporary.write_text(text,encoding='utf8'); temporary.replace(path)
    finally: temporary.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test',action='store_true'); parser.add_argument('--check',action='store_true'); parser.add_argument('--refresh-sources',action='store_true')
    args=parser.parse_args(); bundle=json.loads(BUNDLE.read_text()); snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources: snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot); cards=assemble(bundle,snapshot); text=csv_text(cards)
    if args.check: require(OUT.read_text()==text,'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources: atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print(f'PASS: {len(cards)} catalogued cards / 11 families / 4 verified base RCs; 2 purple teams pending scans; released=false')
    for spec in bundle['productSets']: print(f"  {spec['key']}: {spec['expectedCards']}")

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr); sys.exit(1)
