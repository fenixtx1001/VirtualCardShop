#!/usr/bin/env python3
"""Generate the 2000 Pacific Private Stock Baseball unreleased draft.

Audit all 800 explicit cards across twelve original collector families against
independent listings. Preserve scattered short prints, one true base RC, full
parallel inventories and exact historical rates. Unsupported mini/fractional
pack rates remain null pending pack-model QA. No database access or deployment.
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
STEM = '2000-pacific-private-stock-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 800
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


NUM = re.compile(r'^(?:\d{1,3}(?:\s?[A-Z]{1,3})?|NNO|SF1)$', re.I)


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

COUNTS={'base':150,'gold':150,'premiere':150,'silver':150,'canvas':20,'canvas-proofs':20,'extreme':20,'action':60,'new-wave':20,'rookie-minis':20,'stars':20,'reserve':20}
SIDS=dict(zip(COUNTS,[1401,12207,12208,12214,12204,12205,12206,12209,12210,12211,12212,12213]))
RUNS={'gold':99,'premiere':34,'silver':199,'canvas-proofs':1,'new-wave':199,'rookie-minis':99,'stars':299}
PARALLELS={'gold','premiere','silver','canvas-proofs'}
ODDS={k: {'premiere':24,'reserve':25,'canvas':49}.get(k) for k in COUNTS}
SP=set(map(str,[23,27,38,47,48,53,55,58,67,70,73,85,86,93,95,100,102,113,116,118,122,133,138,143,150]))
SECTIONS={'base':'Base_Set','canvas':"Artist's_Canvas",'extreme':'Extreme_Action','action':'Action','new-wave':'New_Wave','rookie-minis':'Rookies','stars':'Stars','reserve':'Reserve'}
CONFIG=[['Base','150','-','?','?'],['short set','125','-','?','?'],['Prospects','25','-','1:4','1:6'],['Silver Portrait','150','199','N/A','?'],['Gold Portrait','150','99','?','N/A'],['Premiere Date','150','34','1:24','N/A'],['PS-2000 Action','60','-','2:1','2:1'],['PS-2000 Stars','20','299','?','?'],['PS-2000 New Wave','20','199','?','?'],['PS-2000 Rookies','20','99','?','?'],['Extreme Action','20','-','2:25','2:25'],['Reserve','20','-','1:25','N/A'],["Artist's Canvas",'20','-','1:49','1:49'],["Artist's Canvas Proof",'20','one-of-one','?','?']]

def split_label(label):
    tags=set()
    while re.search(r' (?:ROO|RC|SP|SAM|SN\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normalized(name):
    name={'Bob Abreu':'Bobby Abreu','Tony Armas':'Tony Armas Jr.','David Nilsson':'Dave Nilsson'}.get(name,name)
    return re.sub(r'[^a-z0-9]','',name.lower())

def supplementary_rows(raw):
    keys=['base','canvas','canvas-proofs','extreme','action','new-wave','rookie-minis','stars','reserve','samples'];tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S)
    require(len(tables)==10,'Supplementary scope changed');out=[]
    for key,table in zip(keys,tables):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if cells:require(len(cells)==3,'Unexpected supplementary columns');rows.append([key,*cells])
        require(len(rows)==COUNTS.get(key,20),'Incomplete independent table '+key);out+=rows
    return out

def configuration_rows(raw):
    require('24 packs per box, seven cards per pack' in ' '.join(html.unescape(re.sub('<[^>]+>',' ',section(raw,'Distribution','Reviews'))).split()),'Catalogue distribution changed')
    out=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells:require(len(cells)==5,'Unexpected odds columns');out.append(cells)
    return out

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,e in changed['sources'].items():
        raw=cache[e['url'].split('#',1)[0]]
        if key=='bcp-configuration':rows=configuration_rows(raw)
        elif key.startswith('bcp-'):rows=list_items(section(raw,SECTIONS[key[4:]]))
        elif key=='supplement':rows=supplementary_rows(raw)
        elif key=='scope-index':rows=sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1401})
        elif key in {'trivia','packaging'}:rows=[' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())]
        else:rows=parse(raw,int(re.search(r'/sid/(\d+)/',e['url'])[1]))
        e['records']=rows;e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def verify_image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed evidence changed '+e['key'])
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(verify_image,changed['reviewedPackaging']+changed['reviewedCardEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat();return changed

def raw_family(snapshot,key):
    pages=[key+'-1',key+'-2'] if key in {'base','gold','premiere','silver'} else [key]
    for page in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])==SIDS[key],'Wrong source namespace '+page)
    rows=[r for p in pages for r in records(snapshot,p)];require(len(rows)==COUNTS[key],'Incomplete family '+key);return rows

def is_checklist_card(player,subset=''):
    return 'checklist' in (player+' '+subset).lower()

def row_for(key,n,label,team,note):
    name,tags=split_label(label)
    if key=='gold' and n=='44':
        require(name=='Dante Bichette' and team=='Colorado Rockies','Reviewed Gold #44 source exception changed');name='Pedro Astacio'
    require(not note,'Unreviewed annotation '+repr(note))
    expected=({'ROO','SP'} if n in SP else set())|({'RC'} if n=='48' else set()) if key=='base' else {f'SN{RUNS[key]}'} if key in RUNS else set()
    if key in {'gold','premiere','silver'} and n in SP:expected.add('ROO')
    require(tags==expected,'Unexpected source tags '+key+' #'+n+': '+repr(tags))
    require((team in KNOWN_CLUBS or (not team and is_checklist_card(name))) and name and not re.search(r'\b(?:SN\d+|RC|ROO|SP|SAM)\b',name),'Invalid clean name/team')
    if key=='base' and n=='48':name+=' RC'
    subset='Rookies/Prospects' if key in {'base','gold','premiere','silver'} and n in SP else ''
    notes=[]
    if key in RUNS:notes.append(f'Serial numbered /{RUNS[key]}')
    if key in {'action','stars','new-wave','rookie-minis'}:notes.append('PS-2000 mini')
    return [key,n,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    indexed={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS};base=indexed['base']
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key);require(len(rows)==COUNTS[key],'Incomplete independent roster '+key);seen=set()
        for text in rows:
            n,name=text.split(' ',1);require(n not in seen and n in indexed[key],'Independent numbering mismatch');seen.add(n)
            require(normalized(name)==normalized(indexed[key][n][2].removesuffix(' RC')),'Independent name mismatch '+key+' #'+n+': '+name+' / '+indexed[key][n][2])
    for key in {'gold','silver','premiere'}:
        for n,row in indexed[key].items():require(row[2]==base[n][2].removesuffix(' RC') and row[3]==base[n][3],'Parallel subject/team differs '+key+' #'+n)
    for n,row in indexed['canvas-proofs'].items():require(row[2:4]==indexed['canvas'][n][2:4],'Canvas Proof parent mismatch')
    supplementary=records(snapshot,'supplement');require(len(supplementary)==len({(r[0],r[1]) for r in supplementary})==370,'Independent table inventory incomplete')
    for key,n,name,team in supplementary:
        if key=='samples':
            expected=next(r for r in records(snapshot,'samples') if r[0]==n);expected_name=split_label(expected[1])[0];expected_team=expected[2]
        else:expected=indexed[key][n];expected_name=expected[2].removesuffix(' RC');expected_team=expected[3]
        require(normalized(split_label(name)[0])==normalized(expected_name) and team==expected_team,'Independent tuple mismatch '+key+' #'+n+': '+repr((name,team,expected_name,expected_team)))
    subjects={normalized(r[2].removesuffix(' RC')):r[3] for r in base.values()}
    for key in set(COUNTS)-{'base','gold','silver','premiere'}:
        for row in indexed[key].values():require(subjects.get(normalized(row[2]))==row[3],'Insert historical team mismatch '+key+' #'+row[1])
    require(records(snapshot,'bcp-configuration')==CONFIG,'Source configuration changed')
    require(records(snapshot,'scope-index')==sorted((set(SIDS.values())-{1401})|{285943}),'Related set scope changed')
    samples=records(snapshot,'samples');require(len(samples)==20 and {r[0] for r in samples}=={str(i) for i in range(1,21)},'Incomplete excluded promotional inventory')
    for n,label,team,note in samples:
        name,tags=split_label(label);parent=indexed['rookie-minis'][n];require(tags=={'SAM'} and not note and [name,team]==parent[2:4],'Promo scope mismatch')

def validate(bundle,snapshot,cards):
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased draft')
    require(p['id']==snapshot['productId']=='2000_Pacific_Private_Stock_Baseball' and p['year']==2000 and p['brand']=='Pacific Private Stock' and p['sport']=='Baseball','Wrong identity')
    require(p['cardsPerPack']==7 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Draft pack configuration/release changed')
    require(snapshot['schemaVersion']==1 and len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Expected 800 unique cards')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==12 and {s['key'] for s in specs}==set(COUNTS),'Wrong set inventory')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(len(rows)==spec['expectedCards']==COUNTS[key] and {r[1] for r in rows}=={str(i) for i in range(1,COUNTS[key]+1)},'Number inventory mismatch '+key)
        require(spec['sourceSetId']==SIDS[key] and spec['oddsPerPack']==ODDS[key] and spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Set kind/namespace/odds mismatch '+key)
        if key in {'base','gold','premiere','silver'}:require({r[1] for r in rows if r[4]}==SP,'Scattered prospects missing')
    require(records(snapshot,'rookies')==[['48','Juan Sosa ROO, RC, SP','Colorado Rockies','']],'True RC index changed')
    require([(r[0],r[1],r[2],r[3]) for r in cards if r[2].endswith(' RC')]==[('base','48','Juan Sosa RC','Colorado Rockies')],'Incorrect true RC')
    require(all(len(r)==6 and all(isinstance(v,str) for v in r) and (r[3] or is_checklist_card(r[2],r[4])) for r in cards),'Malformed CSV')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[row_for(spec['key'],*r) for spec in bundle['productSets'] for r in raw_family(snapshot,spec['key'])];validate(bundle,snapshot,cards);return cards

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Retrieval failure bypassed')
            require(mock.call_count==calls,'Unbounded source retries')
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('Darin Erstad RC','Darin Erstad'),('Juan Sosa ROO, RC, SP','Juan Sosa')]:require(split_label(raw)[0]==expected,'Whole-token cleanup damaged subject')
    require(is_checklist_card('Checklist 1-100') and is_checklist_card('Player','Checklist') and not is_checklist_card('Darin Erstad'),'Checklist exception failed')
    assemble(bundle,snapshot)
    cases=[('base-2',-1,0,'1'),('base-1',0,1,'Wrong Player'),('base-1',0,2,'New York Yankees'),('base-1',0,1,'Darin Erstad RC'),('base-1',47,1,'Juan Sosa ROO, SP'),('gold-1',0,1,'Darin Erstad SN34'),('canvas-proofs',0,1,'Wrong Player SN1'),('action',0,0,'1A'),('rookies',0,2,'Boston Red Sox'),('samples',0,1,'Jason Dellaero SN99')]
    for key,i,col,val in cases:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'][i][col]=val
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption accepted '+key)
    for key in ['base-2','silver-2','action','supplement']:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'].pop()
        try:assemble(bundle,changed)
        except ValueError:pass
        else:raise ValueError('Incomplete checklist accepted')
    for key,value in [('action',1),('extreme',12),('silver',199)]:
        changed=copy.deepcopy(bundle);next(s for s in changed['productSets'] if s['key']==key)['oddsPerPack']=value
        try:assemble(changed,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsupported/retail odds accepted')
    print('PASS: fail-closed retrieval, 14 source-corruption cases and 3 unsupported-odds cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);cards=assemble(bundle,snapshot);text=csv_text(cards)
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 800 cards / 12 complete families / 1 true base RC; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
