#!/usr/bin/env python3
"""Generate and audit the unreleased 2000 Donruss Football draft.

1278 staged cards across 22 collector families; 53 disputed Authentic Stamp
entries are retained as evidence but withheld from import. Audit all number,
identity, team, subset, true RC, serial and print-run attributes.
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
STEM = '2000-donruss-football'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1278
KNOWN_CLUBS = {'Chicago Bears', 'Oakland Raiders', 'Philadelphia Eagles', 'Washington Redskins', 'Pittsburgh Steelers', 'Jacksonville Jaguars', 'Denver Broncos', 'Green Bay Packers', 'San Diego Chargers', 'Arizona Cardinals', 'Tennessee Titans', 'New York Giants', 'Detroit Lions', 'New Orleans Saints', 'Cincinnati Bengals', 'Baltimore Ravens', 'Indianapolis Colts', 'Cleveland Browns', 'Seattle Seahawks', 'Carolina Panthers', 'Los Angeles Rams', 'New York Jets', 'New England Patriots', 'Atlanta Falcons', 'Minnesota Vikings', 'Buffalo Bills', 'St. Louis Rams', 'San Francisco 49ers', 'Miami Dolphins', 'Tampa Bay Buccaneers', 'Kansas City Chiefs', 'Dallas Cowboys'}
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

PRODUCT='2000_Donruss_Football'
# These are collector families, never probability groups.
FAMILIES=[('base',4374,250),('all-time-kings',35784,10),('all-time-autographs',35785,9),('dominators',35786,60),('elite-series',35810,40),('kings',35787,10),('kings-studio',35788,10),('kings-autographs',35789,10),('jersey-autographs',35790,10),('rated-rookies',35791,40),('rated-medalist',35792,40),('rookie-kings',35793,10),('rookie-studio',35794,10),('rookie-autographs',35795,10),('signature-blue',35796,31),('signature-gold',35797,53),('signature-red',185739,53),('zoning',35801,60),('zoning-red',35802,60),('career',35799,250),('season',35800,250),('promos',4374,2)]
PARALLELS={'kings-studio','kings-autographs','rated-medalist','rookie-studio','rookie-autographs','signature-blue','signature-gold','zoning-red','career','season'}
SUP_SIDS=[4374,35784,35785,35786,35810,35787,35788,35790,35791,35793,35794,35796,35797,35801]
LS_MAP={'Base card':'base','Rookie':'base','All-Time Gridiron Kings':'all-time-kings','All-Time Gridiron Kings / Studio Autographs':'all-time-autographs','Dominators':'dominators','Elite Series':'elite-series','Gridiron Kings':'kings','Gridiron Kings / Studio Autographs':'kings-autographs','Jersey King Autographs':'jersey-autographs','Rated Rookies':'rated-rookies','Rookie Gridiron Kings':'rookie-kings','Rookie Gridiron Kings / Studio Autographs':'rookie-autographs','Signature Series / Gold':'signature-gold','Zoning Commission':'zoning','Promos':'promos'}

def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|ROO|UER|AU|MEM|CL|EXCH|SN\d+|PR\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def normal(name):return re.sub(r'[^a-z0-9]','',split_label(name)[0].removesuffix(' RC').lower())

def linked(raw,sid):
    rows=parse(raw,sid);links=[]
    for tr in re.findall(r'<tr\b[^>]*>.*?</tr>',raw,re.S):
        m=re.search(r'href="([^"]*ViewCard.cfm/sid/(\d+)/cid/(\d+)/[^"]*)"',tr)
        if m:
            require(int(m[2])==sid,'Cross-namespace card link');links.append(['https://www.tcdb.com'+m[1],m[3]])
    require(len(rows)==len(links),'Unmatched original card links');return [r+l for r,l in zip(rows,links)]

def supplementary(raw):
    tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==14,'Independent scope changed');out=[]
    for sid,tb in zip(SUP_SIDS,tables):
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',tb,re.S):
            c=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
            if c:require(len(c)==3,'Independent columns changed');out.append([sid,*c])
    return out

def laststicker(raw):
    out=[]
    for tr in re.findall(r'<tr\b[^>]*>.*?</tr>',raw,re.S):
        c=re.findall(r'<td\b[^>]*>(.*?)</td>',tr,re.S)
        if len(c)==8:
            sn=re.search(r'class="sn">(\d+)',c[1]);out.append([plain(c[0]),plain(c[1].split('<div')[0]),plain(c[2]),plain(c[3]),sn[1] if sn else ''])
    return out

def extract(key,raw,e):
    if key=='scope':return sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{4374})
    if key=='supplement':return supplementary(raw)
    if key=='laststicker':return laststicker(raw)
    if key=='dealer':
        text=plain(re.sub(r'<script\b[^>]*>.*?</script>','',raw,flags=re.S));start=text.index('Base set: 100 Rookies');end=text.index('Product Highlights',start);require('18 packs per box, 16 cards per pack' in text,'Missing dealer pack configuration');return ['18 packs per box; 16 cards per pack',text[start:end].strip()]
    if key=='rookies':return parse(raw,4374)
    return linked(raw,e['namespace'])

def family(snapshot,key,sid,count):
    keys=['promos'] if key=='promos' else [str(sid)+'-'+str(i) for i in range(1,(count+99)//100+1)]
    out=[]
    for k in keys:
        e=snapshot['sources'][k];require(e['namespace']==sid and '/sid/'+str(sid)+'/' in e['url'],'Wrong source namespace '+k);out+=records(snapshot,k)
    require(len(out)==count and len({r[5] for r in out})==count,'Missing/duplicate source rows '+key)
    return out

def row_for(key,r):
    n,label,team,note,url,cid=r;name,tags=split_label(label);name=name.replace('R.Jay Soward','R. Jay Soward');notes=[];subset=''
    require(team in KNOWN_CLUBS,'Missing/invalid team '+key+' '+n)
    require(note==('SN2500' if key=='elite-series' and n=='ES-3' else 'Meet Kurt Warner' if key=='promos' and 'Super Bowl' in name else 'Kurt Warner' if key=='promos' else ''),'Unreviewed caption '+key+' '+n)
    sn=[int(v[2:]) for v in tags if v.startswith('SN')];pr=[int(v[2:]) for v in tags if v.startswith('PR')]
    require(len(sn)<=1 and len(pr)<=1,'Multiple serial/PR fields');sn=sn[0] if sn else None;pr=pr[0] if pr else None
    allowed={'AU','MEM','EXCH'}|({f'SN{sn}'} if sn else set())|({f'PR{pr}'} if pr else set())
    if key=='base':allowed.add('RC')
    if key in {'base','career','season'} and n=='245':allowed.add('ROO')
    require(tags<=allowed,'Unexpected source tags '+key+' '+n)
    if key in {'base','career','season'}:
        require(n.isdigit() and 1<=int(n)<=250,'Bad base/parallel number');subset='Veterans' if int(n)<=150 else 'Rookies'
        if key=='base':require(tags==(({'RC','SN1325'}|({'ROO'} if n=='245' else set())) if int(n)>=151 else set()),'Wrong base RC/SN '+n)
        else:require(sn is not None and tags==({f'SN{sn}'}|({'ROO'} if n=='245' else set())),'Missing parallel serial '+n)
        if key=='base' and int(n)>=151:name+=' RC'
    elif key=='promos':
        require(not tags and n=='NNO','Unreviewed promo');name='Kurt Warner';subset='Promotional Cards';notes.append(label+'; expired promotion; no current redemption rights')
    else:
        expected={'AU'} if key in {'all-time-autographs','kings-autographs','jersey-autographs','rookie-autographs','signature-blue','signature-gold','signature-red'} else set()
        if key=='jersey-autographs':expected.add('MEM')
        if key=='rookie-autographs' and n=='GK-9':expected.add('EXCH')
        require(tags-({f'SN{sn}'} if sn else set())-({f'PR{pr}'} if pr else set())==expected,'Wrong signature/material flags '+key+' '+n)
        fixed={'all-time-kings':2500,'all-time-autographs':250,'dominators':5000,'elite-series':2500,'kings':2500,'kings-studio':250,'kings-autographs':250,'jersey-autographs':50,'rated-rookies':2500,'rated-medalist':100,'rookie-kings':2500,'rookie-studio':250,'rookie-autographs':50,'signature-blue':100,'signature-gold':25,'zoning':1000}
        if key in fixed:require(sn==fixed[key],'Serial changed '+key+' '+n)
        if key=='signature-red':require(sn is None and pr is not None,'Red announced PR is not serial')
        if key=='zoning-red':require(sn is not None and 1<=sn<=41,'Invalid Zoning Red serial')
        if 'AU' in tags:notes.append('Certified autograph')
        if 'MEM' in tags:notes.append('Game-worn jersey relic')
        if key=='rookie-autographs':sn=250;notes.append('Signed allocation 50; source SN50 describes allocation, independent originals print /250')
        if key=='kings-autographs':
            require(pr==(19 if n=='GK-7' else 50),'Signed allocation changed');notes.append('First-50 signed allocation; printed denominator /250')
        if key=='kings-studio':require(pr==200,'Unsigned allocation changed');notes.append('Unsigned Studio; serials 051-250 of printed /250')
        if key=='rookie-studio':notes.append('Unsigned Studio; separate first-50 signed allocation')
        if 'EXCH' in tags:notes.append('Catalogued EXCH; fulfilled signed Sylvester Morris original front independently observed; original exchange ticket not separately imported')
    if key=='signature-blue' and name=='Doug Chapman':
        require(team=='Atlanta Falcons','Reviewed Chapman correction changed');team='Minnesota Vikings';notes.append('Source team corrected from Atlanta; original Blue back prints Minnesota Vikings')
    if key=='signature-red' and name in {'Danny Farmer','Kevin Faulk'}:
        wrong,right=('New England Patriots','Pittsburgh Steelers') if name=='Danny Farmer' else ('Pittsburgh Steelers','New England Patriots')
        require(team==wrong,'Reviewed switched team changed');team=right;notes.append('Source swapped team corrected using independent Gold roster and original Blue/Red images')
    if sn:notes.append('Serial numbered /'+str(sn))
    if pr:notes.append('Reported print run '+str(pr)+(' signed copies' if key=='kings-autographs' else ' unsigned copies' if key=='kings-studio' else '; not serial numbered'))
    if n=='NNO':n='NNO-'+cid;notes.append('Unnumbered original; local NNO-CID identifier is not a printed card number')
    require(name and not re.search(r'\b(?:ROO|AU|MEM|EXCH|SN\d+|PR\d+)\b',name),'Unclean player '+name)
    return [key,n,name,team,subset,'; '.join(notes)]

def validate_independent(snapshot,cards):
    by={k:[r for r in cards if r[0]==k] for k,_,_ in FAMILIES};sidkey={sid:k for k,sid,_ in FAMILIES if k!='promos'}
    sup=records(snapshot,'supplement');require(len(sup)==521,'Incomplete independent MCB');seen=set()
    for sid,n,name,team in sup:
        k=sidkey[sid];candidates=[r for r in by[k] if (n=='NNO' or r[1]==n) and normal(r[2])==normal(name)];require(len(candidates)==1 and candidates[0][3]==team,'MCB subject/team/number mismatch '+str((sid,n,name,team)));require((sid,n,normal(name)) not in seen,'Duplicate MCB row');seen.add((sid,n,normal(name)))
    ls=records(snapshot,'laststicker');require(len(ls)==574,'Incomplete independent LastSticker');seen=set()
    for n,name,team,group,sn in ls:
        k=LS_MAP[group]
        if k=='promos':require(team=='-' and name in {'Super Bowl Promotion / Kurt Warner','Win Original Artwork!'},'Unreviewed promo');continue
        c=[r for r in by[k] if normal(r[2])==normal(name)];require(len(c)==1 and c[0][3]==team,'LastSticker identity/team mismatch '+str((n,name,team,group)));require((group,normal(name)) not in seen,'Duplicate LastSticker row');seen.add((group,normal(name)))
        if k=='base':require(n==c[0][1] and (sn=='1325')==(int(n)>=151),'Independent base number/RC mismatch')
        if sn:require('Serial numbered /'+('250' if k in {'kings-autographs','rookie-autographs'} else sn) in c[0][5],'Independent serial mismatch '+str((n,name,sn)))
    base={r[1]:r for r in by['base']}
    for k in ['career','season']:
        for r in by[k]:require(r[2]==base[r[1]][2].removesuffix(' RC') and r[3:5]==base[r[1]][3:5],'Complete Stat Line identity/team/subset mismatch '+k+' '+r[1])
    for a,b in [('all-time-kings','all-time-autographs'),('kings','kings-studio'),('kings','kings-autographs'),('rated-rookies','rated-medalist'),('rookie-kings','rookie-studio'),('rookie-kings','rookie-autographs')]:
        ref={r[1]:r for r in by[a]}
        for r in by[b]:require(r[1] in ref and r[2:5]==ref[r[1]][2:5],'Insert parallel identity mismatch '+b+' '+r[1])
    for r in by['zoning-red']:
        a=next(x for x in by['zoning'] if x[1]=='ZC-'+r[1]);require(r[2:5]==a[2:5],'Zoning Red identity mismatch')
    gold={normal(r[2]):r for r in by['signature-gold']}
    for k in ['signature-red','signature-blue']:
        for r in by[k]:require(normal(r[2]) in gold and r[3]==gold[normal(r[2])][3],'Signature identity/team mismatch '+r[2])
    rookie=records(snapshot,'rookies');require(len(rookie)==100 and {r[0] for r in rookie}==set(map(str,range(151,251))),'Incomplete true rookie index')
    for n,label,team,note in rookie:require(base[n][2]==split_label(label)[0]+' RC' and base[n][3]==team,'True RC subject/team mismatch '+n)
    require(records(snapshot,'scope')==sorted({sid for k,sid,c in FAMILIES if sid!=4374}|{35798}),'Related inventory changed')
    require(len(records(snapshot,'35798-1'))==53 and snapshot['withheld']['cards']==53,'Missing disputed family evidence')
    dealer=' '.join(records(snapshot,'dealer'));require(re.search(r'18.{0,80}16|18.{0,80}packs',dealer) is not None,'Dealer pack count evidence missing')

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1 and snapshot['productId']==PRODUCT,'Wrong snapshot product')
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['id']==PRODUCT and p['year']==2000 and p['sport']=='Football' and p['brand']=='Donruss' and p['released'] is False,'Wrong product/release state');require(p['cardsPerPack']==16 and p['packsPerBox']==18 and bundle['review']['release']=='BLOCKED_PENDING_QA','Invalid pack/release configuration')
    require('WITHHELD' in bundle['review']['checklist'],'Unresolved evidence must remain visible')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==len(FAMILIES) and {s['key'] for s in specs}=={f[0] for f in FAMILIES},'Wrong collector families')
    cards=[]
    for k,sid,count in FAMILIES:
        rs=[row_for(k,r) for r in family(snapshot,k,sid,count)];cards+=rs;spec=next(s for s in specs if s['key']==k)
        require(spec['expectedCards']==count and spec['sourceSetId']==sid and spec['kind']==('BASE' if k=='base' else 'PARALLEL' if k in PARALLELS else 'INSERT') and spec['oddsPerPack']==(192 if k=='season' else None),'Wrong count/kind/source/odds '+k)
        if k in {'base','career','season'}:require({r[1] for r in rs}==set(map(str,range(1,251))),'Wrong full base/parallel numbers')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Incomplete/duplicate output');require(sum(r[2].endswith(' RC') for r in cards)==100,'Unexpected RC suffixes')
    for r in cards:require(len(r)==6 and r[3] in KNOWN_CLUBS and not re.search(r'\b1\s*:\s*\d+',r[5]),'Bad row/team/odds')
    validate_independent(snapshot,cards);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=4) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for k,e in changed['sources'].items():
        raw=cache[e['url']];new=extract(k,raw,e);require(new==e['records'],'Live source data changed; review required before regeneration: '+k);e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print('Retrieved',k,len(new),flush=True)
    def check_image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed image changed '+e['key'])
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check_image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for name,want in [('Marshall','Marshall'),('Jim Hall','Jim Hall'),('Ken Boswell','Ken Boswell'),('Kevin McDougal ROO, RC, SN1325','Kevin McDougal'),('Player EXCH, AU, SN50','Player')]:require(split_label(name)[0]==want,'Trailing-token boundary failure')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Retrieval failure bypassed')
            require(mock.call_count==calls,'Unbounded retries')
    assemble(bundle,snapshot)
    for k,i,col,v in [('4374-1',0,1,'Wrong Player'),('4374-1',0,2,''),('4374-3',29,1,'Tom Brady RC, SN1000'),('35799-3',29,2,'Dallas Cowboys'),('35789-1',6,1,'Randy Moss AU, PR19, SN19'),('rookies',0,1,'Wrong Player RC'),('supplement',0,2,'Wrong Player'),('laststicker',0,2,'Wrong Team')]:
        s=copy.deepcopy(snapshot);s['sources'][k]['records'][i][col]=v
        try:assemble(bundle,s)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corrupt evidence accepted '+k)
    for k in ['4374-3','35799-3','35800-3','35796-1','rookies','supplement','laststicker']:
        s=copy.deepcopy(snapshot);s['sources'][k]['records'].pop()
        try:assemble(bundle,s)
        except ValueError:pass
        else:raise ValueError('Truncated source accepted '+k)
    for k in ['released','career','signature-gold']:
        b=copy.deepcopy(bundle)
        if k=='released':b['product']['released']=True
        else:next(s for s in b['productSets'] if s['key']==k)['oddsPerPack']=25
        try:assemble(b,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted '+k)
    print('PASS: strict names, bounded failures, 15 corrupt/incomplete source cases, three unsafe manifest cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args();bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);text=csv_text(assemble(bundle,snapshot))
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2)+'\n')
        atomic_write(OUT,text)
    print('PASS: 1278 staged cards / 22 families / 100 true base RCs; 53 disputed entries withheld; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
