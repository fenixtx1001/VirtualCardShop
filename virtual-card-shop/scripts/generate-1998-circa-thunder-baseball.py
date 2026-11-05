#!/usr/bin/env python3
"""Generate and audit the 1998 Circa Thunder Baseball unreleased draft.

Rebuild all 976 original pack-issued catalogue rows from committed source
records. Audit each independent checklist, historical team, four true RCs,
Grissom numbering exception, full parallel inventories and Hobby pack odds.
Promotional samples and SportsFest giveaways are excluded. No database access.
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
STEM = '1998-circa-thunder-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 976
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



COUNTS={'base':300,'rave':296,'super-rave':296,'boss':20,'fast-track':10,'limited-access':15,'quick-strike':12,'rave-reviews':15,'thunder-boomers':12}
SIDS=dict(zip(COUNTS,[1122,11020,11021,7400,7401,11019,7402,7404,7403]))
ODDS=dict(zip(COUNTS,[None,36,216,6,24,None,36,288,96]))
PARALLELS={'rave','super-rave'}
ROOKIES={'48','133','175','198'}
SECTIONS={'base':'Base_Set','boss':'Boss','fast-track':'Fast_Track','limited-access':'Limited_Access','quick-strike':'Quick_Strike','rave-reviews':'Rave_Reviews','thunder-boomers':'Thunder_Boomers'}
SUFFIXES={'boss':'B','fast-track':' FT','limited-access':'LA','quick-strike':' QS','rave-reviews':'RR','thunder-boomers':'TB'}
CHECKLISTS={'297':('Frank Thomas','Chicago White Sox','Checklist: 1-99'),'298':('Alex Rodriguez','Seattle Mariners','Checklist: 100-198'),'299':('Ken Griffey, Jr.','Seattle Mariners','Checklist: 199-296'),'300':('Jose Cruz, Jr.','Toronto Blue Jays','Checklist: 297-300 and Inserts')}
TRAILING=re.compile(r'\s+((?:RC|CL|UER|SAM|SN\d+|PR\d+)(?:,?\s+(?:RC|CL|UER|SAM|SN\d+|PR\d+))*)$',re.I)

def require(condition,message):
    if not condition:raise ValueError(message)

def split_label(label):
    label=' '.join(label.split());m=TRAILING.search(label)
    return (label[:m.start()],set(re.split(r',?\s+',m[1].upper()))) if m else (label,set())

def clean_name(label):return split_label(label)[0]
def normalized(name):
    aliases={'Dave Justice':'David Justice','Bob Higginson':'Bobby Higginson','Bob Abreu':'Bobby Abreu','Roderick Myers':'Rod Myers','Sandy Alomar':'Sandy Alomar, Jr.','Javier Lopez':'Javy Lopez'}
    return re.sub('[^a-z0-9]','',aliases.get(name,name).lower())

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
def independent_rows(raw,key):return list_items(section(raw,SECTIONS[key]))

def supplementary_rows(raw):
    keys=['base','boss','fast-track','limited-access','quick-strike','rave-reviews','thunder-boomers'];out=[]
    tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==len(keys),'Supplementary table scope changed')
    for key,table in zip(keys,tables):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if cells:require(len(cells)==3,'Unexpected supplementary columns');rows.append([key,*cells])
        require(len(rows)==COUNTS[key],'Supplementary checklist incomplete: '+key);out+=rows
    return out

def configuration_rows(raw):
    text=' '.join(html.unescape(re.sub('<[^>]+>',' ',section(raw,'Distribution','Reviews'))).split())
    require('36 packs per box, eight cards per pack' in text,'Distribution source changed')
    out=[['Hobby configuration','36','8']]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells:require(len(cells)==5,'Unparsed odds row');out.append(cells)
    require(len(out)==10,'Odds inventory changed');return out

def scope_rows(raw):
    observed=set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1122}
    require(observed==set(SIDS.values())-{1122},'Related family index changed')
    require(parse(raw,1122)==[['8','Cal Ripken, Jr. SAM','Baltimore Orioles',''],['SF1','Scott Rolen PR5000','Philadelphia Phillies','']],'Promotional scope changed')
    return sorted(observed)

def records(snapshot,key):
    e=snapshot['sources'][key];require(e['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',e['sha256']),'Invalid source provenance: '+key);return e['records']

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,e in changed['sources'].items():
        raw=cache[e['url'].split('#',1)[0]]
        if key=='bcp-configuration':rows=configuration_rows(raw)
        elif key=='bcp-promos':rows=list_items(section(raw,'Promos','Base_Set'))
        elif key.startswith('bcp-'):rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key=='supplementary-teams':rows=supplementary_rows(raw)
        elif key=='scope-index':rows=scope_rows(raw)
        else:rows=parse(raw,int(re.search(r'/sid/(\d+)/',e['url'])[1]))
        e['records']=rows;e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def scan(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed scan changed: '+e['key'])
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(scan,changed['reviewedScanEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat();return changed

def raw_family(snapshot,key):
    pages=[key+'-'+str(i) for i in range(1,4)] if key in {'base',*PARALLELS} else [key]
    for page in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])==SIDS[key],'Wrong checklist namespace: '+page)
    rows=[r for page in pages for r in records(snapshot,page)];require(len(rows)==COUNTS[key],'Incomplete source family: '+key);return rows

def row_for(key,number,label,team,note):
    name,tags=split_label(label);subset='';notes=[]
    name=re.sub(r'(?<!,) Jr\.$', ', Jr.', name)
    name={'Roderick Myers':'Rod Myers','Sandy Alomar':'Sandy Alomar, Jr.','Javier Lopez':'Javy Lopez'}.get(name,name)
    if key=='base':
        if number=='8B':
            require(name=='Marquis Grissom' and team=='Milwaukee Brewers' and tags=={'UER'} and note=='UER: #8 on back, was supposed to be #280','Reviewed Grissom exception changed')
            notes.append('UER: printed #8; intended checklist slot #280; local ID 8B distinguishes Cal Ripken #8')
        elif number in CHECKLISTS:
            require((name,team,note)==CHECKLISTS[number] and tags=={'CL'},'Featured-player checklist changed');subset='Checklist';notes.append(note)
        else:
            require(tags==({'RC'} if number in ROOKIES else set()) and not note,'Unexpected base attribute/RC')
            if number in ROOKIES:name+=' RC'
    elif key in PARALLELS:
        run=150 if key=='rave' else 25;require(tags=={f'SN{run}'} and not note,'Wrong parallel run or unexpected attribute')
        notes.append(f'Serial numbered /{run}');notes.append('Sparkling silver foil' if key=='rave' else 'Sparkling gold foil')
    else:
        require(not tags and not note,'Unexpected insert attribute')
        if key=='limited-access':notes.append('Die-cut fold-out')
    require(name and not re.search(r'\b(?:UER|SAM|SN\d+|PR\d+)\b',name),'Unclean display name')
    require(team or 'checklist' in (name+' '+subset).lower(),'Missing non-checklist team')
    require(not team or team in KNOWN_CLUBS,'Invalid historical franchise')
    return [key,number,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    by_key={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS};base=by_key['base']
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key);require(len(rows)==COUNTS[key],'Independent family incomplete')
        seen=set()
        for raw in rows:
            m=re.fullmatch(r'(\d+)(?:\s?([A-Z]{1,2}))? (.+)',raw);require(bool(m),'Unparsed independent row: '+raw)
            n,suffix,name=m.groups()
            if key=='base':
                require(suffix is None,'Unexpected base suffix')
                if n=='280':
                    require(name=='Marquis Grissom UER (card #8 on back)','Independent Grissom note changed');n='8B';name='Marquis Grissom'
                else:name=re.sub(r' (?:RC|CL)$','',name)
            else:
                expected_suffix=SUFFIXES[key].strip() if key!='fast-track' else None
                require(suffix==expected_suffix,'Independent printed suffix changed');n=n+SUFFIXES[key]
            require(n not in seen and n in by_key[key],'Independent number mismatch');seen.add(n)
            require(normalized(name)==normalized(by_key[key][n][2].removesuffix(' RC')),'Independent subject mismatch '+key+' #'+n)
    require({r.split(' ',1)[0] for r in records(snapshot,'bcp-base') if r.endswith(' RC')}==ROOKIES,'Independent true RC inventory changed')
    for key in PARALLELS:
        for n,row in by_key[key].items():
            parent=base['8B' if n=='280' else n]
            require(row[2]==parent[2].removesuffix(' RC') and row[3]==parent[3],'Parallel identity/team mismatch')
    supplementary=records(snapshot,'supplementary-teams');require(len(supplementary)==len({(r[0],r[1].upper()) for r in supplementary})==384,'Supplementary identity inventory incomplete/duplicate')
    for key,n,name,team in supplementary:
        n=n.upper();require(n in by_key[key],'Supplementary number mismatch '+key+' #'+n);actual=by_key[key][n]
        require(normalized(clean_name(name))==normalized(actual[2].removesuffix(' RC')) and team==actual[3],'Supplementary subject/team mismatch '+key+' #'+n)
    subjects={normalized(r[2].removesuffix(' RC')):r[3] for r in base.values() if r[4]!='Checklist'}
    for key in SUFFIXES:
        for row in by_key[key].values():require(subjects.get(normalized(row[2]))==row[3],'Insert/base historical team mismatch '+key+' #'+row[1])
    conf=records(snapshot,'bcp-configuration');require(len(conf)==len({r[0] for r in conf})==10,'Configuration source incomplete')
    config={r[0]:r[1:] for r in conf}
    expected={'Hobby configuration':['36','8'],'Base':['300','-','?','?'],'Rave':['296','150','1:36','N/A'],'Super Rave':['296','25','1:216','N/A'],'Boss':['20','-','1:6','1:6'],'Limited Access':['15','-','N/A','1:18'],'Fast Track':['10','-','1:24','1:24'],'Quick Strike':['12','-','1:36','1:36'],'Thunder Boomers':['12','-','1:96','1:96'],'Rave Reviews':['15','-','1:288','1:288']}
    require(config==expected,'Pack odds/configuration evidence changed')
    require(records(snapshot,'bcp-promos')==['P8 Cal Ripken, Jr.','SF1 Scott Rolen 5000'],'Independent promo scope changed')

def validate(bundle,snapshot,cards):
    p=bundle['product'];specs=bundle['productSets']
    require(snapshot['schemaVersion']==1 and snapshot['productId']=='1998_Circa_Thunder_Baseball','Wrong source identity')
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased DRAFT')
    require(p['id']=='1998_Circa_Thunder_Baseball' and p['year']==1998 and p['brand']=='Circa Thunder' and p['sport']=='Baseball','Wrong product identity')
    require(p['cardsPerPack']==8 and p['packsPerBox']==36,'Wrong Hobby configuration')
    require(bundle['review']['teamData']=='COMPLETE' and bundle['review']['insertOdds']=='VERIFIED_HOBBY_RETAIL_LIMITED_ACCESS_EXCLUDED' and bundle['review']['release']=='BLOCKED_PENDING_QA','Review status changed')
    require(len(specs)==len({s['id'] for s in specs})==9 and {s['key'] for s in specs}==set(COUNTS),'Wrong collector family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==976,'Expected 976 unique cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        expected={str(i) for i in range(1,301)}-{'280'}|{'8B'} if key=='base' else {str(i) for i in range(1,297)} if key in PARALLELS else {str(i)+SUFFIXES[key] for i in range(1,COUNTS[key]+1)}
        require(len(rows)==spec['expectedCards']==COUNTS[key] and {r[1] for r in rows}==expected,'Incomplete or duplicate family '+key)
        require(spec['sourceSetId']==SIDS[key] and spec.get('oddsPerPack')==ODDS[key],'Manifest namespace/odds mismatch')
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Wrong set kind')
    indexed={n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies')}
    tagged={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==4 and set(indexed)==ROOKIES and indexed==tagged and sum(r[2].endswith(' RC') for r in cards)==4,'True RC identity/team mismatch')
    require({r[1] for r in cards if r[4]=='Checklist'}==set(CHECKLISTS),'Checklist subset inventory changed')
    require(all(r[3] for r in cards),'All featured-player checklists have real teams; unexpected blank')
    require(records(snapshot,'scope-index')==sorted(set(SIDS.values())-{1122}),'Related-family index changed')
    require(records(snapshot,'scope-promos')==[['8','Cal Ripken, Jr. SAM','Baltimore Orioles',''],['SF1','Scott Rolen PR5000','Philadelphia Phillies','']],'Promo exclusion changed')
    evidence=snapshot['reviewedScanEvidence']
    require(snapshot['scanReviewStatus']=='PENDING_IMAGE_HARVEST' and not evidence,'Scan-review status must remain explicit; no completed scan audit claimed')
    for e in evidence:require(e['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',e['sha256']),'Invalid scan provenance')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV format')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into variant')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[row_for(spec['key'],*r) for spec in bundle['productSets'] for r in raw_family(snapshot,spec['key'])];validate(bundle,snapshot,cards);return cards

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    with patch.object(urllib.request,'urlopen',side_effect=[HTTPError('https://example.test',503,'temporary',None,None),io.BytesIO(b'verified')]) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):require(fetch_bytes('https://example.test')==b'verified' and mock.call_count==2,'Transient retry failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'unavailable',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Retrieval failure bypassed')
            require(mock.call_count==calls,'Retry count not bounded')
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall UER','John Marshall'),('Jim Hall CL','Jim Hall'),('Ken Boswell RC','Ken Boswell')]:require(clean_name(raw)==expected,'Whole-token cleanup damaged name')
    raw='<tr><td><a href="/ViewCard.cfm/sid/1122/cid/1">8b</a></td><td>Marquis Grissom UER<figcaption>Caption without separator</figcaption></td><td>Milwaukee Brewers</td></tr>'
    require(parse(raw,1122)==[['8B','Marquis Grissom UER','Milwaukee Brewers','Caption without separator']],'Caption/duplicate-number separation failed')
    for n in ['1B','1 FT','1LA','1 QS','1RR','1TB','SF1']:require(parse(raw.replace('>8b<','>'+n+'<'),1122)[0][0]==n,'Suffix parser failed')
    for invalid in [raw.replace('/sid/1122/','/sid/9999/'),raw.replace('>8b<','>UNKNOWN<')]:
        try:parse(invalid,1122)
        except ValueError:pass
        else:raise ValueError('Wrong namespace/unparsed row accepted')
    assemble(bundle,snapshot)
    cases=[('missing base',lambda s:s['sources']['base-3']['records'].pop()),('duplicate number',lambda s:s['sources']['base-2']['records'][0].__setitem__(0,'1')),('wrong player',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),('wrong team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'New York Yankees')),('missing team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),('false RC',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Ben Grieve RC')),('wrong rookie index',lambda s:s['sources']['rookies']['records'][0].__setitem__(1,'Wrong Player RC')),('wrong Rave run',lambda s:s['sources']['rave-1']['records'][0].__setitem__(1,'Ben Grieve SN25')),('wrong Super Rave run',lambda s:s['sources']['super-rave-1']['records'][0].__setitem__(1,'Ben Grieve SN150')),('missing full parallel',lambda s:s['sources']['rave-3']['records'].pop()),('wrong Grissom ID',lambda s:next(r for r in s['sources']['base-1']['records'] if r[0]=='8B').__setitem__(0,'280')),('wrong checklist range',lambda s:s['sources']['base-3']['records'][-1].__setitem__(3,'Checklist: 1-300')),('missing checklist team',lambda s:s['sources']['base-3']['records'][-1].__setitem__(2,'')),('wrong insert number',lambda s:s['sources']['fast-track']['records'][0].__setitem__(0,'1 F')),('wrong namespace',lambda s:s['sources']['rave-1'].__setitem__('url',s['sources']['base-1']['url'])),('odds in variant',lambda s:s['sources']['boss']['records'][0].__setitem__(3,'Inserted 1:6 packs')),('wrong source odds',lambda s:next(r for r in s['sources']['bcp-configuration']['records'] if r[0]=='Boss').__setitem__(3,'1:12'))]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot);mutate(changed)
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption accepted: '+name)
    for mutate in [lambda b:b['product'].__setitem__('released',True),lambda b:b['productSets'][1].__setitem__('oddsPerPack',24),lambda b:next(s for s in b['productSets'] if s['key']=='limited-access').__setitem__('oddsPerPack',18)]:
        changed=copy.deepcopy(bundle);mutate(changed)
        try:assemble(changed,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted')
    print('PASS: parser, whole-token names, bounded source retries, 17 source corruption and 3 manifest safety cases')

def csv_text(cards):
    stream=io.StringIO(newline='');writer=csv.writer(stream,lineterminator='\n');writer.writerow(HEADER);writer.writerows(cards);return stream.getvalue()
def atomic_write(path,text):
    temp=path.with_suffix(path.suffix+'.tmp')
    try:temp.write_text(text,encoding='utf8');temp.replace(path)
    finally:temp.unlink(missing_ok=True)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);cards=assemble(bundle,snapshot);text=csv_text(cards)
    if args.check:require(OUT.read_text()==text,'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print(f'PASS: {len(cards)} cards / 9 complete families / 4 true base RCs; released=false')
    for spec in bundle['productSets']:print(f"  {spec['key']}: {spec['expectedCards']}")
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
