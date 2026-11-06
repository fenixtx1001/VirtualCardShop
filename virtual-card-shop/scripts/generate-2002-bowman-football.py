#!/usr/bin/env python3
"""Generate and audit the unreleased 2002 Bowman Football draft.

1022 explicit catalogue rows in eleven intact families. Audit full independent
base, insert and partial-parallel rosters, 165 true RCs, teams, captions and
real serial versus print-run attributes; preserve unresolved physical attributes.
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
STEM = '2002-bowman-football'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1022
KNOWN_CLUBS = {'Chicago Bears', 'Dallas Cowboys', 'San Diego Chargers', 'Seattle Seahawks', 'Jacksonville Jaguars', 'Carolina Panthers', 'Pittsburgh Steelers', 'Detroit Lions', 'Green Bay Packers', 'Kansas City Chiefs', 'San Francisco 49ers', 'Miami Dolphins', 'Cleveland Browns', 'St. Louis Rams', 'Baltimore Ravens', 'Houston Texans', 'New York Jets', 'Denver Broncos', 'Tampa Bay Buccaneers', 'Atlanta Falcons', 'Indianapolis Colts', 'Washington Redskins', 'New England Patriots', 'Arizona Cardinals', 'Buffalo Bills', 'New Orleans Saints', 'New York Giants', 'Minnesota Vikings', 'Philadelphia Eagles', 'Cincinnati Bengals', 'Tennessee Titans', 'Oakland Raiders'}
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

PRODUCT='2002_Bowman_Football'
FAMILIES=[('base',4525,275),('gold',36989,275),('silver',36992,275),('uncirculated',36993,110),('draft-relics',36985,10),('fabric',36986,17),('flashback-autographs',36987,8),('flashback-jerseys',36988,11),('autographs',36990,19),('red-ink',36991,20),('checklists',4525,2)]
PARALLELS={'gold','silver','uncirculated','red-ink'}
SUP_SIDS=[4525,36985,36986,36987,36988,36990,36991,36993]

def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def clean(raw):return plain(re.sub(r'<script\b[^>]*>.*?</script>','',raw,flags=re.S))

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|UER|AU|MEM|CL|EXCH|SN\d+|PR\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normalized(name):return re.sub(r'[^a-z0-9]','',split_label(name)[0].replace('Edward Reed','Ed Reed').lower())

def is_checklist(name,subset=''):return 'checklist' in (name+' '+subset).lower()

def digest(rows):return hashlib.sha256(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def evidence(snapshot,key):
    e=snapshot['sources'][key];rows=records(snapshot,key);require(digest(rows)==e['recordsSha256'],'Saved source rows changed without audit '+key);return rows

def linked(raw,sid):
    rows=parse(raw,sid);links=[]
    for tr in re.findall(r'<tr\b[^>]*>.*?</tr>',raw,re.S):
        m=re.search(r'href="([^"]*ViewCard.cfm/sid/(\d+)/cid/(\d+)/[^"]*)"',tr)
        if m:require(int(m[2])==sid,'Cross-namespace original');links.append(['https://www.tcdb.com'+m[1],m[3]])
    require(len(rows)==len(links),'Unpaired source links');return [r+l for r,l in zip(rows,links)]

def extract(key,raw,e):
    if key=='scope':return sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{4525})
    if key=='physical-tiers':
        text=plain(raw);start=text.index('Insert Sets (6)');return [text[start:text.index('Add Insert or',start)]]
    if key=='supplement':
        tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==8,'Independent table scope changed');out=[]
        for sid,tb in zip(SUP_SIDS,tables):
            for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',tb,re.S):
                c=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
                if c:require(len(c)==3,'Independent columns changed');out.append([sid,*c])
        return out
    if key=='dealer':
        text=clean(raw);i=text.index('24 packs per box, 10 cards per pack');return [text[i:text.index('Product Highlights',i)].strip()]
    if key=='jumbo':
        text=clean(raw);i=text.index('Each sealed box contains');return [text[i:text.index('have expired.',i)+len('have expired.')]]
    if key.startswith('rookies-'):return parse(raw,4525)
    return linked(raw,e['namespace'])

def family(snapshot,key,sid,count):
    keys=['checklists'] if key=='checklists' else [str(sid)+'-'+str(i) for i in range(1,(count+99)//100+1)];out=[]
    for i,k in enumerate(keys):
        e=snapshot['sources'][k];require(e['namespace']==sid and '/sid/'+str(sid)+'/' in e['url'],'Wrong namespace '+k);rs=evidence(snapshot,k);require(len(rs)==min(100,count-i*100),'Missing page '+k);out+=rs
    require(len(out)==count==len({r[0] for r in out})==len({r[5] for r in out}),'Incomplete/duplicate roster '+key);return out

def row_for(key,r):
    n,label,team,note,url,cid=r;name,tags=split_label(label);notes=[];subset=''
    require(team in KNOWN_CLUBS or (not team and is_checklist(name)),'Missing/invalid team '+key+' '+n)
    if key in {'base','gold','silver','uncirculated'}:
        require(n.isdigit() and 1<=int(n)<=275,'Bad base/parallel number');subset='Veterans' if int(n)<=110 else 'Rookies'
        if key=='base':
            require(tags==({'RC'} if int(n)>=111 else {'UER'} if n=='42' else set()),'Unexpected true RC/source tags '+n)
            require(note==('Passing Yards in AVG column and Passing AVG in YDS column' if n=='42' else ''),'Unreviewed base caption')
            if n=='42':notes.append('UER: '+note)
            if n=='138':require(name=='Edward Reed','Printed Reed identity changed');name='Ed Reed';notes.append('Printed name Edward Reed; canonical Ed Reed')
            if int(n)>=111:name+=' RC'
        elif key in {'gold','silver'}:
            limit=50 if key=='gold' else 250;require(tags=={f'SN{limit}'} and not note,'Bad parallel serial/caption');notes.append('Serial numbered /'+str(limit))
            if n=='197':require(team=='Miami Dolphins','Reviewed Allen correction changed');team='Minnesota Vikings';notes.append('Source Miami affiliation corrected to Minnesota Vikings; original base and independent Silver catalogues confirm')
        else:
            require(tags==({'PR290'} if n=='184' else set()) and not note,'Unexpected Uncirculated metadata');notes.append('Uncirculated redemption fulfilment; reported print run 290; physical serial stamp unverified, not asserted as /290')
    elif key=='checklists':
        require(n in {'1','2'} and tags=={'CL'} and not team and not note,'Unreviewed checklist');notes.append('Checklist range '+name.split(': ',1)[1]);name='Checklist';subset='Checklist'
    elif key=='draft-relics':
        kind='Hat' if n.startswith('DDH-') else 'Jersey' if n.startswith('DDJ-') else ''
        require(kind and tags=={'MEM'} and note=='MEM: '+kind,'Wrong draft-day material');subset='Draft Day Hats' if kind=='Hat' else 'Draft Day Jerseys';notes.append('Authentic NFL draft-day '+kind.lower()+' relic; event apparel, not claimed game-used')
    elif key=='fabric':
        require(tags=={'MEM'} and note=='MEM: Game-worn jersey (Senior Bowl)','Wrong Fabric material');notes.append('Game-worn Senior Bowl jersey relic')
    elif key=='flashback-jerseys':
        require(tags=={'MEM'} and note=='MEM: Player-worn jersey','Wrong Flashback material');notes.append('Player-worn jersey relic; not claimed game-used')
    elif key in {'autographs','flashback-autographs','red-ink'}:
        require(not note,'Unexpected autograph caption')
        if key=='red-ink':
            require(tags in ({'AU'},{'AU','SN50'}),'Unexpected Red Ink serial');notes.append('Certified red ink autograph')
            if 'SN50' in tags:notes.append('Serial numbered /50 (catalogued)')
            else:notes.append('Programme reports hand-numbered 50; individual serial stamp not verified')
            if n=='SF-DG1':require(name=='Daniel Graham','Wrong Red Ink extra subject');notes.append('Red Ink-only subject; catalogue code SF-DG1 distinguishes David Garrard SF-DG; printed code pending original back QA')
        else:require(tags=={'AU'},'Unexpected signature serial');notes.append('Certified autograph')
    else:raise ValueError('Unknown family '+key)
    require(name and not re.search(r'\b(?:AU|MEM|UER|SN\d+|PR\d+)\b',name),'Unclean player '+name)
    return [key,n,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    by={k:{r[1]:r for r in cards if r[0]==k} for k,_,_ in FAMILIES};sidkey={sid:k for k,sid,_ in FAMILIES if k!='checklists'};sup=evidence(snapshot,'supplement');require(len(sup)==470,'Incomplete independent inventory');seen=set();ind_rc=set()
    for sid,n,label,team in sup:
        k=sidkey[sid]
        if k=='draft-relics':require(re.match(r'^[HJ]-',n),'Independent material prefix changed');n='DD'+n
        r=by[k].get(n);require(r is not None and normalized(r[2])==normalized(label) and r[3]==team,'Independent number/name/team mismatch '+str((k,n,label,team,r)));require((k,n) not in seen,'Duplicate independent row');seen.add((k,n))
        if k=='base' and 'RC' in split_label(label)[1]:ind_rc.add(n)
    require(ind_rc==set(map(str,range(111,276))),'Independent true RC inventory mismatch')
    for sid in SUP_SIDS:
        k=sidkey[sid];require({n for a,n in seen if a==k}==set(by[k]),'Incomplete independent family '+k)
    base=by['base']
    for k in ['gold','silver','uncirculated']:
        for n,r in by[k].items():require(normalized(r[2])==normalized(base[n][2]) and r[3:5]==base[n][3:5],'Parallel identity/team/subset mismatch '+k+' '+n)
    for n,r in by['red-ink'].items():
        if n=='SF-DG1':continue
        require(n in by['autographs'] and r[2:5]==by['autographs'][n][2:5],'Red Ink subject roster mismatch')
    require(set(by['red-ink'])==set(by['autographs'])|{'SF-DG1'},'Autograph roster conflation')
    rc=evidence(snapshot,'rookies-1')+evidence(snapshot,'rookies-2');require(len(rc)==165 and {r[0] for r in rc}==ind_rc,'Incomplete separate rookie index')
    for n,label,team,note in rc:require(normalized(label)==normalized(base[n][2]) and team==base[n][3] and 'RC' in split_label(label)[1],'Rookie index identity/team mismatch '+n)
    require(set(by['uncirculated'])==set(snapshot['uncirculatedNumbers']) and len(snapshot['uncirculatedNumbers'])==110,'Wrong partial parallel')
    require(evidence(snapshot,'scope')==sorted({sid for k,sid,c in FAMILIES if sid!=4525}),'Related family scope changed')
    dealer=' '.join(evidence(snapshot,'dealer'));require('24 packs per box, 10 cards per pack' in dealer and '1:11' in dealer and '1:24' in dealer and '1:23' in dealer,'Hobby historical evidence changed')
    jumbo=' '.join(evidence(snapshot,'jumbo'));require('10 packs of 35 cards' in jumbo and '250' in jumbo and '50' in jumbo,'HTA historical evidence changed')
    tiers=' '.join(evidence(snapshot,'physical-tiers'));require(all(x in tiers for x in ['1:168 H','1:18,612 H','Print Run of 290']),'Physical tiers incomplete')

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1 and snapshot['productId']==PRODUCT,'Wrong snapshot')
    for k in snapshot['sources']:evidence(snapshot,k)
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['id']==PRODUCT and p['year']==2002 and p['brand']=='Bowman' and p['sport']=='Football' and p['released'] is False,'Invalid/released product');require(p['cardsPerPack']==10 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Wrong pack/release configuration')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==11 and {s['key'] for s in specs}=={k for k,_,_ in FAMILIES},'Wrong collector families');cards=[]
    for k,sid,count in FAMILIES:
        rows=[row_for(k,r) for r in family(snapshot,k,sid,count)];cards+=rows;s=next(s for s in specs if s['key']==k)
        require(s['expectedCards']==count and s['sourceSetId']==sid and s['kind']==('BASE' if k=='base' else 'PARALLEL' if k in PARALLELS else 'INSERT') and s['oddsPerPack'] is None,'Invalid count/source/kind/unverified odds '+k)
        if k in {'base','gold','silver'}:require({r[1] for r in rows}==set(map(str,range(1,276))) and sum(r[4]=='Veterans' for r in rows)==110 and sum(r[4]=='Rookies' for r in rows)==165,'Incorrect full collector family/subsets '+k)
    require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Duplicate/incomplete output');require(sum(r[2].endswith(' RC') for r in cards)==165,'Wrong true RC output')
    for r in cards:require(len(r)==6 and (r[3] in KNOWN_CLUBS or not r[3] and is_checklist(r[2],r[4])) and not re.search(r'\b1\s*:\s*\d+',r[5]),'Invalid output/team or set-wide card odds')
    require(sum(not r[3] for r in cards)==2,'Checklist team exception changed');verify_independent(snapshot,cards);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=4) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for k,e in changed['sources'].items():
        raw=cache[e['url']];new=extract(k,raw,e);require(new==e['records'],'Live source changed; review required '+k);e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print('Retrieved',k,len(new),flush=True)
    def image_check(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Original image changed '+e['key'])
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(image_check,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,want in [('Marshall','Marshall'),('Jim Hall','Jim Hall'),('Ken Boswell','Ken Boswell'),('John Marshall AU','John Marshall'),('Jim Hall CL','Jim Hall'),('Ed Reed RC','Ed Reed')]:require(split_label(raw)[0]==want,'Strict source-token boundaries')
    require(is_checklist('Checklist') and is_checklist('Subject','Checklist') and not is_checklist('Ed Reed'),'Checklist exception')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Source failure bypassed')
            require(mock.call_count==calls,'Unbounded source retries')
    assemble(bundle,snapshot)
    for k,col,value in [('4525-1',1,'Wrong Person'),('4525-1',2,''),('36989-1',1,'Emmitt Smith SN250'),('36992-1',1,'Emmitt Smith SN50'),('36985-1',3,'MEM: Bat'),('36986-1',3,'MEM: Event-worn jersey'),('36988-1',3,'MEM: Game-used jersey'),('36991-1',1,'Antonio Bryant AU, SN25')]:
        s=copy.deepcopy(snapshot);s['sources'][k]['records'][0][col]=value
        # Recompute the row checksum so semantic checks must catch corruption too.
        s['sources'][k]['recordsSha256']=digest(s['sources'][k]['records'])
        try:assemble(bundle,s)
        except ValueError:pass
        else:raise ValueError('Semantic corruption accepted '+k)
    for k in ['4525-3','36989-3','36992-3','36993-2','36990-1','36991-1','rookies-2','supplement','checklists']:
        s=copy.deepcopy(snapshot);s['sources'][k]['records'].pop()
        try:assemble(bundle,s)
        except ValueError:pass
        else:raise ValueError('Truncated source accepted '+k)
    for key in ['released','silver','uncirculated','autographs']:
        b=copy.deepcopy(bundle)
        if key=='released':b['product']['released']=True
        else:next(s for s in b['productSets'] if s['key']==key)['oddsPerPack']=11
        try:assemble(b,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted '+key)
    print('PASS: name boundaries, checklist exception, bounded failures, 17 corrupt/incomplete sources and four unsafe manifests')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args();bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);text=csv_text(assemble(bundle,snapshot))
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2)+'\n')
        atomic_write(OUT,text)
    print('PASS: 1022 catalogue rows / 11 families / 165 true base RCs / two intentional checklist blank teams; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
