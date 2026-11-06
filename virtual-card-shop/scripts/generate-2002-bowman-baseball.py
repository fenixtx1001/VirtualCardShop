#!/usr/bin/env python3
"""Generate and audit the unreleased 2002 Bowman Baseball draft.

1070 explicit cards across six intact collector families. Independently audit
full base, parallel and insert rosters, all teams, 167 true RCs, card codes,
material provenance, and print-run attributes.
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
STEM = '2002-bowman-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1070
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

COUNTS={'base':440,'gold':440,'autographs':45,'relics':26,'futures':9,'uncirculated':110}
SIDS=dict(zip(COUNTS,[1522,13371,13368,13370,13369,13372]))
ODDS={'base':None,'gold':1,'autographs':40,'relics':74,'futures':None,'uncirculated':None}
PRODUCT='2002_Bowman_Baseball'
BCP_CODES={'BA-BA':'BA-BAC','BA-BBC':'BA-BB','BA-BD':'BA-BDC','BA-BJC':'BA-BJS','BA-BSS':'BA-BS','FGAJ-JH':'FGAJ-JRH','FGAJ-TH':'FGAB-TH'}

def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|UER|AU|MEM|CL|EXCH|SN\d+|PR\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normalized(name):
    name=split_label(name)[0].replace(', Jr.',' Jr.').replace(', Sr.',' Sr.')
    aliases={'Jose Cruz':'Jose Cruz Jr.','Bob Higginson':'Bobby Higginson','J.T. Snow':'J.T. Snow Jr.','Jerry Hairston':'Jerry Hairston Jr.','Ichiro Suzuki':'Ichiro','Rich Harden':'James Harden','Juan M. Gonzalez':'Juan Gonzalez','Ronald Acuña Sr.':'Ronald Acuna','Ronald Acuna Sr.':'Ronald Acuna','Tim Raines':'Tim Raines Jr.','Michael Restovich':'Mike Restovich','Richard Stahl':'Rich Stahl','Alfredo Simon':'Carlos Cabrera','Yurendell De Caster':'Yurendell DeCaster','Jimmy Journell':'Jim Journell'}
    return re.sub(r'[^a-z0-9]','',aliases.get(name,name).lower())

def is_checklist(player,subset=''):return 'checklist' in (player+' '+subset).lower()

def all_li(raw):return [plain(s) for s in re.findall(r'<li\b[^>]*>(.*?)</li>',raw,re.S)]

def bcp_rows(raw,key):
    if key=='base':return list_items(section(raw,'Veterans_.28reds.29'))+list_items(section(raw,'Rookies_.26_Prospects_.28blues.29'))
    if key=='uncirculated':return [s for s in list_items(section(raw,'Uncirculated')) if re.match(r'^\d+ ',s)]
    prefix={'autographs':'BA-','relics':'BR-','futures':'FGA'}[key]
    return [s for s in all_li(raw) if s.startswith(prefix)]

def supplementary_rows(raw):
    tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);keys=['base','autographs','futures','relics','ticket','uncirculated'];require(len(tables)==6,'Independent table scope changed');out=[]
    for key,table in zip(keys,tables):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if cells:require(len(cells)==3,'Independent columns changed');rows.append([key,*cells])
        require(len(rows)=={'base':440,'autographs':44,'futures':9,'relics':26,'ticket':1,'uncirculated':110}[key],'Incomplete independent table '+key);out+=rows
    return out

def keyman_rows(raw):return [s for s in all_li(raw) if re.match(r'^\d+ [A-Za-z]',s)]

def configuration_rows(raw):
    rows=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells:require(len(cells)==6,'Unexpected rate columns');rows.append(cells)
    return rows

def extract(key,raw,url):
    if key.startswith('bcp-'):
        if key=='bcp-configuration':return configuration_rows(raw)
        if key=='bcp-distribution':return [plain(section(raw,'Distribution','Reviews'))]
        return bcp_rows(raw,key[4:])
    if key=='supplement':return supplementary_rows(raw)
    if key=='keyman':return keyman_rows(raw)
    if key=='scope-index':return sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1522})
    if key=='scope-details':
        text=plain(raw);return [text[text.index('Insert Sets (4)'):text.index('Add Insert or',text.index('Insert Sets (4)'))]]
    return parse(raw,int(re.search(r'/sid/(\d+)/',url)[1]))

def raw_family(snapshot,key):
    pages=range(1,6) if key in {'base','gold'} else range(1,3) if key=='uncirculated' else [1]
    rows=[]
    for i in pages:
        e=snapshot['sources'][f'{key}-{i}'];require(int(re.search(r'/sid/(\d+)/',e['url'])[1])==SIDS[key],'Wrong namespace '+key);page=records(snapshot,f'{key}-{i}');require(len(page)==(40 if i==5 else 10 if key=='uncirculated' and i==2 else min(100,COUNTS[key])),'Wrong page length '+key);rows+=page
    require(len(rows)==COUNTS[key],'Incomplete '+key);return rows

def local_number(key,n,name):
    if key=='autographs' and n=='BA-RF':
        require(name in {'Randy Flores','Ryan Franklin'},'Unreviewed duplicate BA-RF');return n+('-FLORES' if name=='Randy Flores' else '-FRANKLIN')
    return n

def row_for(key,n,label,team,note,rc):
    name,tags=split_label(label);original=name;subset='';notes=[]
    if key in {'base','gold','uncirculated'}:
        expected=({'RC'} if n in rc else set()) if key=='base' else {'EXCH'} if key=='uncirculated' else set()
        if n in {'421','424'}:expected|={'UER'}
        require(tags==expected,'Unexpected source tags '+key+' '+n)
        expected_note="UER: Facsimile signature is not Bautista's" if n=='421' else ('UER: '+('Name' if key=='uncirculated' else 'First name')+' misspelled "Napolean" on front and back') if n=='424' else ''
        require(note==expected_note,'Unreviewed annotation '+key+' '+n)
        subset='Veterans' if int(n)<=110 else 'Rookies/Prospects'
        if note:notes.append(note)
        if n=='173':require(name=='James Harden','Harden identity changed');name='Rich Harden';notes.append('Printed name James Harden; Rich Harden')
        if n=='206':require(name=='Ronald Acuna','Acuna identity changed');name='Ronald Acuna Sr.';notes.append('Father of Ronald Acuna Jr.')
        if n=='420':require(name=='Carlos Cabrera','Cabrera identity changed');name='Alfredo Simon';notes.append('Printed name Carlos Cabrera; Alfredo Simon identity alias')
        if key=='gold':
            aliases={'10':('CC Sabathia','C.C. Sabathia'),'145':('Kory Dehaan','Kory DeHaan'),'188':('Luis Depaula','Luis DePaula'),'210':('Blake Mcginley','Blake McGinley'),'243':('John Vanbenschoten','John VanBenschoten'),'304':('Yurendell De Caster','Yurendell DeCaster'),'312':('Jimmy Journell','Jim Journell'),'406':('Macay Mcbride','Macay McBride'),'417':('Richard Stahl','Rich Stahl')}
            if n in aliases:
                before,after=aliases[n];require(name==before,'Reviewed Gold alias changed');name=after
            if n=='50':require(team=='Philadelphia Phillies','Reviewed Gold Thome typo changed');team='Cleveland Indians'
        if key=='uncirculated' and n=='304':require(name=='Yurendell De Caster','Reviewed Exchange alias changed');name='Yurendell DeCaster'
        if key=='base' and n in rc:name+=' RC'
        if key=='gold':notes.append('Thicker cardstock; gold-foil facsimile signature; not a certified autograph')
        if key=='uncirculated':notes.append('Uncirculated sealed holder; announced maximum 672; reported 574 claimed; not serial numbered')
    else:
        require(tags==({'AU'} if key=='autographs' else {'MEM'} if key=='relics' else {'AU','MEM'}),'Unexpected insert tags '+key+' '+n)
        if key=='autographs':
            require(not note,'Unexpected autograph note')
            if n=='BA-RF' and name=='Ryan Franklin':require(team=='Seattle Mariners','Original Franklin team changed')
            notes.append('Certified autograph')
        elif key=='relics':
            require(note in {'MEM: Bat','MEM: Jersey'},'Unknown relic material');notes.append('Game-used bat relic' if note=='MEM: Bat' else 'Game-worn jersey relic')
            if n in {'BR-AF1','BR-AF2','BR-JA1','BR-JA2'}:notes.append('Printed number '+n+'; '+('bat' if n.endswith('1') else 'jersey')+' version')
        else:
            material='Base' if n=='FGAB-TH' else 'Jersey';require(note=='MEM: '+material+' (Futures Game)','Unknown signed relic material');notes.append('Certified autograph; '+('game-used base' if material=='Base' else 'game-worn jersey')+' relic from 2001 All-Star Futures Game')
            if n=='FGAB-TH':notes.append('HTA Jumbo exclusive')
    number=local_number(key,n,original)
    if number!=n:notes.append('Printed number BA-RF; local suffix distinguishes two subjects')
    require(name and not re.search(r'\b(?:UER|AU|MEM|EXCH|PR\d+|SN\d+)\b',name),'Unclean subject')
    require(team or is_checklist(name,subset),'Missing non-checklist team');require(team in KNOWN_CLUBS or is_checklist(name,subset),'Unknown franchise '+team)
    return [key,number,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards,rc):
    by={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS}
    for key in ['base','uncirculated','autographs','relics','futures']:
        source=records(snapshot,'bcp-'+key);require(len(source)==COUNTS[key],'Independent incomplete '+key);seen=set()
        for text in source:
            n,name=text.split(' ',1)
            if key in {'base','uncirculated'}:name=re.sub(r' RC\*?(?= |$)','',name);name=re.sub(r' \(Listed.*','',name)
            if key in {'autographs','relics','futures'}:name=re.sub(r' (?:BAT|JSY|BASE)?\s*[A-G]?$','',name).strip()
            n=BCP_CODES.get(n,n)
            if key=='relics' and n in {'BR-AF','BR-JA'}:
                n+=('1' if ' BAT ' in text else '2')
            n=local_number(key,n,name)
            if key=='relics':require(by[key][n][5].startswith('Game-used bat relic' if ' BAT ' in text else 'Game-worn jersey relic'),'Independent material mismatch '+n)
            require(n not in seen and n in by[key],'Independent number mismatch '+key+' '+n);seen.add(n)
            require(normalized(name)==normalized(by[key][n][2].removesuffix(' RC')),'Independent subject mismatch '+key+' '+n+': '+name+' / '+by[key][n][2])
        if key=='base':require({s.split()[0] for s in source if re.search(r' RC\*?(?: \(.*\))?$',s)}==rc-{'332'},'BCP RC discrepancy changed')
    supp=records(snapshot,'supplement');require(len(supp)==630,'Incomplete independent team source');seen=set()
    for key,n,name,team in supp:
        if key=='ticket':require(n=='NNO' and not team,'Ticket changed');continue
        if key=='futures':n='FGA'+n
        n=local_number(key,n,name)
        require((key,n) not in seen,'Duplicate supplementary identity');seen.add((key,n));actual=by[key].get(n)
        require(actual is not None and normalized(name)==normalized(actual[2].removesuffix(' RC')) and team==actual[3],'Independent name/team mismatch '+str((key,n,name,team,actual)))
    require(('autographs','BA-RF-FRANKLIN') not in seen and ('autographs','BA-RF-FLORES') in seen,'Known 44-row supplemental omission changed')
    independent=records(snapshot,'keyman');require(len(independent)==440,'Incomplete Keyman base');ks=set();krc=set()
    for text in independent:
        n,name=text.split(' ',1);require(n not in ks and n in by['base'],'Keyman number mismatch');ks.add(n)
        if re.search(r' RC$',name):krc.add(n)
        require(normalized(name)==normalized(by['base'][n][2].removesuffix(' RC')),'Keyman name mismatch '+n+': '+name)
    require(krc==(rc-{'291'})|{'318'},'Keyman known RC discrepancies changed')
    for key in ['gold','uncirculated']:
        for n,row in by[key].items():require(row[2]==by['base'][n][2].removesuffix(' RC') and row[3:5]==by['base'][n][3:5],'Parallel name/team/subset mismatch '+key+' '+n)
    require(records(snapshot,'scope-index')==[13368,13369,13370,13371,13372,404728],'Related scope changed')
    require(records(snapshot,'bcp-configuration')==[['Base','440','-','?','?','?'],['Gold','440','-','one-per-pack','one-per-pack','one-per-pack'],['Game Used Relics','26','-','1:74','1:99','1:43'],['Autographs','45','-','1:40','1:53','1:24'],['Futures Game Autograph Relics','9','-','1:196','1:259','1:113']],'Physical odds changed')
    require(records(snapshot,'bcp-distribution')==snapshot['expectedDistribution'],'Physical pack configuration changed')
    require(records(snapshot,'scope-details')==snapshot['expectedScopeDetails'],'Card-specific eligibility/odds changed')

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1 and snapshot['productId']==PRODUCT,'Wrong snapshot')
    rookie_rows=records(snapshot,'rc-1')+records(snapshot,'rc-2');rc={r[0] for r in rookie_rows};require(len(rookie_rows)==len(rc)==167,'Incomplete rookie index')
    cards=[row_for(k,*r,rc) for k in COUNTS for r in raw_family(snapshot,k)]
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['id']==PRODUCT and p['year']==2002 and p['brand']=='Bowman' and p['sport']=='Baseball' and p['released'] is False,'Must be correct unreleased draft');require(p['cardsPerPack']==10 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Wrong pack/release configuration')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==6 and {s['key'] for s in specs}==set(COUNTS),'Wrong collector family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Duplicate/incomplete inventory')
    for s in specs:
        k=s['key'];rows=[r for r in cards if r[0]==k];require(len(rows)==s['expectedCards']==COUNTS[k] and s['sourceSetId']==SIDS[k] and s['oddsPerPack']==ODDS[k] and s['kind']==('BASE' if k=='base' else 'PARALLEL' if k in {'gold','uncirculated'} else 'INSERT'),'Wrong count/kind/source/odds '+k)
        if k in {'base','gold'}:require({r[1] for r in rows}==set(map(str,range(1,441))) and sum(r[4]=='Veterans' for r in rows)==110 and sum(r[4]=='Rookies/Prospects' for r in rows)==330,'Base numbering/subsets wrong')
    actual={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    indexed={n:(normalized(label),team) for n,label,team,note in rookie_rows};require({n:(normalized(name),team) for n,(name,team) in actual.items()}==indexed and sum(r[2].endswith(' RC') for r in cards)==167,'True RC identity/team mismatch')
    for r in cards:require(len(r)==6 and all(isinstance(v,str) for v in r) and (r[3] or is_checklist(r[2],r[4])) and not re.search(r'\b1\s*:\s*\d+',r[5]),'Invalid card/odds in variant')
    verify_independent(snapshot,cards,rc);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#')[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=4) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for k,e in changed['sources'].items():
        raw=cache[e['url'].split('#')[0]];e['records']=extract(k,raw,e['url']);e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print('Retrieved',k,len(e['records']),flush=True)
    def image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed scan changed '+e['key'])
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,want in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall AU','John Marshall'),('Jim Hall CL','Jim Hall'),('Joe Mauer RC','Joe Mauer')]:require(split_label(raw)[0]==want,'Whole-token cleanup damaged name')
    require(is_checklist('Checklist') and is_checklist('Subject','Checklist') and not is_checklist('Joe Mauer'),'Checklist exception failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Source failure bypassed')
            require(mock.call_count==calls,'Incorrect retry bounds')
    assemble(bundle,snapshot)
    cases=[('base-1',0,1,'Wrong Player'),('base-1',0,2,''),('base-1',0,1,'Adam Dunn RC'),('gold-1',0,1,'Adam Dunn SN440'),('autographs-1',0,0,'BA-INVALID'),('futures-1',0,3,'MEM: Bat'),('relics-1',0,3,'MEM: Jersey'),('uncirculated-1',0,1,'Chris Tritle EXCH, SN672'),('rc-1',0,2,'Boston Red Sox'),('base-4',31,1,'Ramon Moreta')]
    for key,i,col,val in cases:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'][i][col]=val
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption accepted '+key)
    for key in ['base-5','gold-5','uncirculated-2','autographs-1','supplement','keyman','bcp-base','rc-2']:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'].pop()
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Missing source row accepted '+key)
    for key,value in [('released',True),('futures',196),('uncirculated',24),('gold',9)]:
        b=copy.deepcopy(bundle)
        if key=='released':b['product'][key]=value
        else:next(s for s in b['productSets'] if s['key']==key)['oddsPerPack']=value
        try:assemble(b,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted '+key)
    print('PASS: name boundaries, checklist exception, bounded retrieval failures, 18 corrupt-source and four manifest rejection cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);cards=assemble(bundle,snapshot);text=csv_text(cards)
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 1070 cards / six collector families / 167 true base RCs; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
