#!/usr/bin/env python3
"""Generate and audit the unreleased 2002 Topps Baseball draft.

Complete base, parallels, variations and insert collector inventories.
Audit independent catalogues, teams, true RCs, source failures and release gates.
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
STEM = '2002-topps-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 3761
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

PRODUCT='2002_Topps_Baseball'
KNOWN_CLUBS|={'Cincinnati Redlegs','Houston Colt .45s','Kansas City Athletics','Los Angeles Angels','USA'}
TOKENS=r'RC|UER|AU|MEM|CL|ASR|PROS|DPK|VAR|COR|ERR|FOIL|PB|UWS|LL|TC|GG|CY|MVP|ROY|MGR|AS|WS|IA|RS|RP|ALCS|CO|P/CO|BP|ACL|5000K|RB|HERO|TL|SV|BT|SH|DP|SN\d+|PR\d+|SER\d+|PROMO'
BASE_SIDS={1562,13909,13912,1571}
SUPPLEMENT_SIDS=[1562,13892,13893,13894,13895,13896,13897,13898,13899,13900,13937,13901,134874,13902,13903,13904,13905,13907,13908,13906,13910,13911,13913,174710,13914,13915,13916,13917,13918,13919,13920,13921,13922,13923,13924,99187,539727,9056,115211,13925,78567]


def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def split_label(label):
    tags=[]
    while m:=re.search(r' ('+TOKENS+r')$',label):
        tags.append(m[1]);label=label[:m.start()].rstrip(',')
    return label,set(tags)

def normalized(name):
    name=split_label(name)[0]
    name=re.split(r' (?:UER:|ERR:|1952 #|Reprint:|PB, FOIL|VAR|\"David\" on front|\"Javier\" on front)',name)[0]
    aliases={'Sandy Alomar, Jr.':'Sandy Alomar','Sandy Alomar Jr.':'Sandy Alomar','Wendell Magee, Jr.':'Wendell Magee','Len DiNardo':'Lenny DiNardo','Ramon E. Martinez':'Ramon Martinez','Bob Abreu':'Bobby Abreu','Ron Belliard':'Ronnie Belliard','Ken Griffey, Jr.':'Ken Griffey Jr.','Jerry Hairston':'Jerry Hairston Jr.','Fernando Tatis, Sr.':'Fernando Tatis','Sandy Alomar, Jr.':'Sandy Alomar','Jose Cruz, Jr.':'Jose Cruz Jr.','J.T. Snow':'J.T. Snow Jr.','James Harden':'Rich Harden','Leonard DiNardo':'Lenny DiNardo','John Martin':'J.D. Martin','Ichiro Suzuki':'Ichiro','Javy Lopez':'Javier Lopez','Jim Journell':'Jimmy Journell','Ferguson Jenkins':'Fergie Jenkins','B.Robinson':'Brooks Robinson','Orl Cepeda':'Orlando Cepeda','Napolean Calzado':'Napoleon Calzado','Jim Piersall':'Jimmy Piersall','Cletis Boyer':'Clete Boyer','Bobby Brown':'Bob Brown'}
    return sorted(re.sub(r'[^a-z0-9]','',aliases.get(p,p).lower()) for p in name.split(' / '))

def digest(rows):return hashlib.sha256(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def is_checklist(name,subset=''):return 'checklist' in (name+' '+subset).lower()

def parse_primary(raw,sid):
    rows=parse(raw,sid);links=[]
    for tr in re.findall(r'<tr\b[^>]*>.*?</tr>',raw,re.S):
        m=re.search(r'href="([^"]*ViewCard.cfm/sid/(\d+)/cid/(\d+)/[^"]*)"',tr)
        if m:links.append(['https://www.tcdb.com'+m[1],m[3]])
    require(len(rows)==len(links),'Unparsed source card links');return [r+l for r,l in zip(rows,links)]

def all_li(raw):return [plain(s) for s in re.findall(r'<li\b[^>]*>(.*?)</li>',raw,re.S)]

def supplementary_rows(raw):
    tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==len(SUPPLEMENT_SIDS),'Independent table scope changed');out=[]
    for sid,tb in zip(SUPPLEMENT_SIDS,tables):
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',tb,re.S):
            cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
            if cells:require(len(cells)==3,'Unexpected independent columns');out.append([sid,*cells])
    return out

def cbc_rows(raw):
    out=[]
    for part in re.split(r'<h3[^>]*>',raw)[1:]:
        if '</h3>' not in part:continue
        title,part=part.split('</h3>',1);title=plain(title)
        if 'Set Checklist' not in title:continue
        for div in re.findall(r'<div[^>]*class="[^"]*tablechecklist[^"]*"[^>]*>(.*?)</div>',part,re.S):
            for line in re.split(r'<br\s*/?>',div):
                if v:=plain(line):out.append([title,v])
    return out

def bcp_base(raw):
    start=raw.index('id="Base_Set"');end=raw.index('id="Errors"',start);return [x for x in all_li(raw[start:end]) if re.match(r'^\d+ ',x)]

def bcp_rates(raw):
    rows=[]
    start=raw.index('id="Insertion_Ratios"');end=raw.index('id="Checklist"',start)
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',raw[start:end],re.S):
        cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
        if cells:require(len(cells)==6,'Unexpected physical odds columns');rows.append(cells)
    return rows

def extract(key,raw,entry):
    if key.startswith('tcdb-'):return parse_primary(raw,entry['namespace'])
    if key=='rookies':return parse(raw,1562)
    if key=='supplement':return supplementary_rows(raw)
    if key=='cbc':return cbc_rows(raw)
    if key=='bcp-base':return bcp_base(raw)
    if key=='bcp-buybacks':return list_items(section(raw,'Checklist'))
    if key=='bcp-legends':return list_items(section(raw,'Checklist'))
    if key=='bcp-rates':return bcp_rates(raw)
    if key=='bcp-distribution':return [plain(section(raw,'Distribution','Reviews'))]
    if key=='scope-index':return sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1562})
    if key=='scope-details':
        text=plain(raw);i=text.index('Insert Sets (41)');return [text[i:text.index('Add Insert or',i)]]
    if key=='ford-original':
        require('1962 Topps #315 Ford Tosses a Curve' in plain(raw) and 'Whitey Ford' in plain(raw),'Missing original Ford identification');return ['1962 Topps #315 Ford Tosses a Curve','Whitey Ford']
    raise ValueError('Unknown source '+key)

def raw_family(snapshot,sid):
    entries=[(k,e) for k,e in snapshot['sources'].items() if k.startswith(f'tcdb-{sid}-')]
    entries.sort(key=lambda kv:int(kv[0].rsplit('-',1)[1]));require(entries,'Missing family '+str(sid));rows=[]
    for key,e in entries:
        require(e['namespace']==(13056 if sid==539727 else sid),'Wrong canonical namespace');rows+=records(snapshot,key)
    require(len(rows)==snapshot['expectedRawCounts'][str(sid)],'Incomplete primary family '+str(sid));require(len(rows)==len({r[5] for r in rows}),'Duplicate primary card IDs');return rows

def subset_for(n,tags):
    n=int(re.match(r'\d+',n)[0])
    if 'DPK' in tags or 327<=n<=331 or 691<=n<=695:return 'Draft Picks'
    for lo,hi,title in [(277,306,'Managers'),(307,326,'Prospects'),(332,336,'Season Highlights'),(337,348,'League Leaders'),(349,356,'Playoff Bound'),(357,364,'United We Stand'),(365,365,'Barry Bonds Home Run Tribute'),(641,670,'Team Cards'),(671,690,'Prospects'),(696,713,'Gold Glove Awards'),(714,715,'Cy Young Awards'),(716,717,'Most Valuable Player Awards'),(718,719,'Rookie of the Year Awards')]:
        if lo<=n<=hi:return title
    return 'Veterans'

def correct_primary(sid,row):
    row=list(row)
    if sid==1562 and row[0]=='358':
        require(row[2]=='New York Mets','Reviewed Mets/Pirates source changed');row[2]='New York Mets / Pittsburgh Pirates'
    if sid==1571 and row[0]=='340':
        require(row[1]=='Aaron Boone / Juan Gonzalez / Alex Rodriguez LL, FOIL','Reviewed Boone leader source changed');row[1]=row[1].replace('Aaron Boone','Bret Boone',1)
    if sid==1571 and row[0]=='345':row[2]='San Francisco Giants / Chicago Cubs / Arizona Diamondbacks'
    return row

def row_for(sid,row,rc):
    row=correct_primary(sid,row)
    n,label,team,note,url,cid=row;name,tags=split_label(label);number=n;subset='';notes=[]
    key=str(sid)
    if sid in BASE_SIDS:
        key={1562:'base',13909:'gold',13912:'hta',1571:'limited'}[sid]
        if n.startswith('365'):
            hr=int(re.search(r'(?:HR |HR )(\d+)',note)[1]);require(1<=hr<=73,'Invalid Bonds HR variant')
            if hr==73:number='365'
            else:key+='-variations' if sid!=13909 else '-invalid'
            notes+=['Barry Bonds home run '+str(hr)+' of 73','Printed number 365; source variation identifier '+n]
        if sid==1562 and n=='446A':number='446'
        if sid==1562 and n=='446B':key='base-variations'
        if sid==13912 and n=='160':key='hta-variations';number='160-ERR'
        if sid==13912 and n=='160B':number='160'
        subset=subset_for(n,tags)
        if name=='James Harden':name='Rich Harden';notes.append('Printed name James Harden; Rich Harden identity')
        if name=='Napolean Calzado':name='Napoleon Calzado'
        if key=='base' and n in rc:name+=' RC'
        if sid==13909:require('SN2002' in tags,'Gold must be serial numbered /2002');notes.append('Serial numbered /2002')
        if sid==13912:notes.append('Home Team Advantage factory-set foil stamp')
        if sid==1571:notes.append('Limited Edition glossy factory-set parallel; 1950 sets; not serial numbered')
        if 'ASR' in tags:notes.append('Topps All-Star Rookie cup; not a true RC designation')
    else:
        if sid in {223172,151203,134874}:
            m=re.match(r'Series ([12]) Checklist (\d): (.*)',name);require(m is not None,'Unknown checklist format');number='S'+m[1]+'-'+m[2];name='Series '+m[1]+' Checklist '+m[2];subset='Checklist';notes.append('Checklist coverage: '+m[3]);notes.append('Printed number '+n+'; local series prefix prevents duplicate IDs')
        if sid in {99187,174710,115211}:number='NNO-'+cid;notes.append('Unnumbered card; local catalogue card ID '+cid)
        if sid==13910:
            year=re.search(r'(?:19|20)\d\d',note)[0];brand='BOWMAN' if 'Bowman' in note else 'OPC' if 'O-Pee-Chee' in note else 'TOPPS';number=year+'-'+brand+'-'+n+'-CID'+cid
            notes.append('Original printed number '+n+'; local year/brand prefix distinguishes vintage issues')
            if '(' in name and name.endswith(')'):
                caption,name=name.split('(',1);name=name[:-1];notes.append('Original subject: '+caption.strip())
            notes.append('Certified autograph buyback; Topps authentication hologram')
            limits=[v[2:] for v in tags if v.startswith('SN')];require(len(limits)==1,'Unverified buyback serial limit');notes.append('Hand numbered /'+limits[0])
        if sid==13913:
            names={'FS-AL':'Sandy Alomar Sr. / Sandy Alomar Jr. / Roberto Alomar','FS-BON':'Bobby Bonds / Barry Bonds','FS-BOO':'Bob Boone / Aaron Boone / Bret Boone','FS-CR':'Jose Cruz Sr. / Jose Cruz Jr.'}
            name=names.get(n,name)
            if n=='FS-AL':require(team=='Atlanta Braves','Reviewed Alomar source changed');team='Atlanta Braves / Chicago White Sox / Cleveland Indians'
            if n=='FS-BOO':require(team=='Seattle Mariners / Cincinnati Reds / Cincinnati Reds','Reviewed Boone source changed');team='Philadelphia Phillies / Cincinnati Reds / Seattle Mariners'
            material={'FS-AL':'Game-used bats: Sandy Alomar Sr. / Sandy Alomar Jr. / Roberto Alomar','FS-BE':'Game-worn uniforms: Yogi Berra / Dale Berra','FS-BON':'Game-worn uniforms: Bobby Bonds / Barry Bonds','FS-BOO':'Game-worn uniform / Game-worn uniform / Game-used bat: Bob Boone / Aaron Boone / Bret Boone','FS-CR':'Game-used bat / Game-worn jersey: Jose Cruz Sr. / Jose Cruz Jr.'};notes.append(material[n])
        elif sid==13915:
            notes.append('Certified autograph on game-used bat relic; published limit /'+('60' if n=='PCABB' else '50')+'; actual serial denominator pending original-scan confirmation')
            if n=='PCABB':notes.append('Reported original example numbered /47 conflicts with published /60; unresolved')
        elif sid==13907:
            notes.append('Ebbets Field / Yankee Stadium seat relics')
            notes.append('Hand numbered /52' if n=='SB' else 'Reported print run 52; not serial numbered')
        elif sid==13908:notes.append('Certified dual autograph; Ebbets Field / Yankee Stadium seat relics; hand numbered /25')
        elif sid in {13906,13925}:notes.append('Stadium seat relic; not player-used equipment')
        elif sid in {13917,13918}:notes.append('Game-used bat '+('pine tar' if sid==13917 else 'trademark')+' relic; hand numbered /'+('200' if sid==13917 else '100'))
        elif sid==13916:notes.append('Game-used bat barrel relic; serial numbered /50')
        elif sid==13910:pass
        else:
            if 'AU' in tags:notes.append('Certified autograph')
            if 'MEM' in tags:
                if note:notes.append(note)
                elif sid==13896 and n=='5D-WH':notes.append('Game-used bats: Larry Walker / Todd Helton')
                elif sid==13896 and n=='5D-JG':notes.append('Game-worn jersey / Game-used bat: Randy Johnson / Luis Gonzalez')
                elif sid==13898 and n=='5K-PO':notes.append('Memorabilia relic; exact material unverified, original scan required')
                else:raise ValueError('Unverified relic material '+str(sid)+' '+n)
        roles={'AS':'Original All-Star','LL':'Original League Leaders','WS':'Original World Series','IA':'Original In Action','RS':'Original Rookie Stars','CL':'Original Checklist','RB':'Original Record Breaker'}
        role_tags=[t for t in roles if t in tags]
        if role_tags:subset=' / '.join(roles[t] for t in role_tags)
        extra_tags=sorted(tags-{'AU','MEM','UER','ERR','COR'}-set(roles)-{t for t in tags if re.fullmatch(r'SN\d+',t)})
        if extra_tags:notes.append('Original card designation: '+', '.join(extra_tags))
        if sid in {539727,9056}:notes.append('Team Topps Legends shared cross-product reprint program; '+('2001' if sid==539727 else '2002')+' copyright; Topps autograph authentication hologram')
        if sid==13937:notes.append('Topps Archives factory-set reprint; not a new rookie card')
        if sid==13903:notes.append('2002 Draft Picks factory-set bonus; no RC status inferred')
        if sid==115211:notes.append('Expired Ticket to History sweepstakes collector card; no current redemption')
        if sid==174710:notes.append('Expired Logo Race game card; no current redemption')
        if sid==99187:notes.append('Team Logo Sticker')
        if sid==78567:notes.append('Pre-production promotional card; not pack inserted')
    if note and note not in notes:notes.append(note)
    require(name and not re.search(r'\b(?:UER|AU|MEM|EXCH|SN\d+|PR\d+)\b',name),'Unclean subject '+name)
    require(team or is_checklist(name,subset),'Missing non-checklist team '+str((sid,n,name)))
    require(all(t in KNOWN_CLUBS for t in team.split(' / ')) if team else is_checklist(name,subset),'Unknown historical team '+team)
    return [key,number,name,team,subset,'; '.join(notes)]

def verify_independent_tuples(snapshot):
    # All 1,421 independent tuples must find the same primary card number,
    # subject and team, with explicit prefix conventions (not fuzzy matching).
    for sid,n,name,team in records(snapshot,'supplement'):
        rows=raw_family(snapshot,sid)
        compact=lambda value:re.sub(r'[^A-Z0-9]','',value.upper())
        target=compact(n)
        if sid==539727:target='TT'+target
        if sid in {13901,13906,13911,13914,13915,13925}:
            target={13901:'TA',13906:'EFR',13911:'HM',13914:'OG',13915:'PCA',13925:'YSR'}[sid]+target
        candidates=[r for r in rows if compact(r[0])==target]
        if sid==1562:
            candidates=[r for r in rows if (re.match(r'\d+',r[0])[0]==n if n.isdigit() else compact(r[0])==target)]
        require(any(normalized(name)==normalized(r[1]) and team==r[2] for r in candidates),'Independent number/name/team mismatch '+str((sid,n,name,team)))
    rawbase={r[0]:r for r in raw_family(snapshot,1562)}
    for text in records(snapshot,'bcp-base'):
        n,name=text.split(' ',1)
        if n=='365':
            hr=int(name.rsplit(' ',1)[1]);candidates=[r for r in rawbase.values() if r[0].startswith('365') and r[3]=='VAR: HR '+str(hr)];require(len(candidates)==1,'Independent HR variation mismatch');actual=candidates[0];name='Barry Bonds'
        elif n=='446':actual=rawbase['446B' if name.endswith(' COR') else '446A']
        else:actual=rawbase[n]
        name=re.split(r' UER:| ERR:| COR:',name)[0];name=re.sub(r' (?:RC\*?|RCup|PROS|DPK|MGR)(?= |$)','',name)
        if 357<=int(n)<=364:
            # BCP names pictured subjects; TCDB describes the corresponding games.
            # #357 BCP Astros conflicts with the actual Diamondbacks/Rockies event.
            require('UWS' in split_label(actual[1])[1],'Reviewed tribute subset changed')
        else:require(normalized(name)==normalized(actual[1]),'Independent base subject mismatch '+n)

def verify_catalogues(snapshot,cards):
    # Audit all independent team tuples. Known catalogue discrepancies are explicit
    # and pinned, rather than accepted by fuzzy name/team matching.
    verify_independent_tuples(snapshot)
    for key,e in snapshot['sources'].items():require(digest(records(snapshot,key))==snapshot['reviewedRecordDigests'][key],'Reviewed source rows changed; re-review required: '+key)
    for sid in BASE_SIDS- {1562}:
        base={re.match(r'\d+',r[0])[0]:r for r in raw_family(snapshot,1562) if r[0] not in {'446B'} and not r[0].startswith('365')}
        for n,label,team,note,url,cid in raw_family(snapshot,sid):
            if n.startswith('365') or n=='160B':continue
            other=correct_primary(1562,base[re.match(r'\d+',n)[0]]);resolved=correct_primary(sid,[n,label,team,note,url,cid]);require(normalized(resolved[1])==normalized(other[1]) and resolved[2]==other[2],'Parallel identity/team mismatch '+str((sid,n)))
    require(len(records(snapshot,'bcp-base'))==791 and len({int(s.split()[0]) for s in records(snapshot,'bcp-base')})==718,'Independent base inventory incomplete')
    rawbase=raw_family(snapshot,1562);bcp_rc={s.split()[0] for s in records(snapshot,'bcp-base') if re.search(r'\bRC\*?(?: |$)',s)}
    index={r[0] for r in records(snapshot,'rookies')};require(bcp_rc==index,'Independent true rookie inventory mismatch')
    require(len(records(snapshot,'supplement'))==1421,'Independent supplementary inventory changed')
    # The full independent buyback checklist supplies the missing Ford IA card.
    cbc=[s for title,s in records(snapshot,'cbc') if title=='Hall of Fame Vintage BuyBacks AutoProofs Set Checklist'];require(len(cbc)==330 and 'WF10 Whitey Ford 62 IA' in cbc,'Incomplete 330-card independent buyback roster')
    require('Whitey Ford 62 IA 100' in records(snapshot,'bcp-buybacks') and records(snapshot,'ford-original')==['1962 Topps #315 Ford Tosses a Curve','Whitey Ford'],'Missing independent Ford resolution')
    from collections import Counter
    expected=Counter()
    for text in cbc:
        m=re.match(r'[A-Z]+\d+ (.*?) (\d\d)',text);require(m is not None,'Unparsed independent buyback');expected[(tuple(normalized(m[1])),m[2])]+=1
    actual=Counter()
    special=snapshot['buybackEventSigners']
    for n,label,team,note,url,cid in raw_family(snapshot,13910):
        m=re.search(r'(?:Autographed|Signed) by (.*?) only',note,re.I)
        signer=m[1] if m else special.get(cid,split_label(label)[0]);year=re.search(r'(?:19|20)\d\d',note)[0][-2:];actual[(tuple(normalized(signer)),year)]+=1
    actual[(tuple(normalized('Whitey Ford')),'62')]+=1
    require(actual==expected,'Full buyback signer/year checklist mismatch '+str((expected-actual,actual-expected)))

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1 and snapshot['productId']==PRODUCT,'Wrong source product')
    rcrows=records(snapshot,'rookies');rc={r[0] for r in rcrows};require(len(rcrows)==len(rc)==39,'Expected 39 true rookie cards')
    cards=[row_for(int(sid),r,rc) for sid in snapshot['expectedRawCounts'] for r in raw_family(snapshot,int(sid))]
    cards.append(['13910','1962-TOPPS-315','Whitey Ford','New York Yankees','Original In Action','Certified autograph buyback; 1962 Topps In Action #315 Ford Tosses a Curve; hand numbered /100; Topps authentication hologram; missing from TCDB, independently listed as WF10 by CBC and BCP'])
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['id']==PRODUCT and p['year']==2002 and p['brand']=='Topps' and p['sport']=='Baseball' and p['released'] is False,'Wrong product or released manifest');require(p['cardsPerPack']==10 and p['packsPerBox']==36 and bundle['review']['release']=='BLOCKED_PENDING_QA','Wrong pack/release configuration')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==49 and {s['key'] for s in specs}==set(snapshot['expectedOutputCounts']),'Wrong collector family inventory');require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Incomplete or duplicate cards')
    for spec in specs:
        k=spec['key'];rows=[r for r in cards if r[0]==k];require(len(rows)==spec['expectedCards']==snapshot['expectedOutputCounts'][k],'Family card count mismatch '+k)
        require(spec['oddsPerPack']==snapshot['expectedOdds'][k] and spec['kind']==snapshot['expectedKinds'][k],'Unreviewed odds/kind '+k)
    by={r[1]:r for r in cards if r[0]=='base'};require(set(by)==set(map(str,range(1,720)))-{'7'} and sum(r[2].endswith(' RC') for r in cards)==39,'Base positions/rookie total incorrect')
    require({n for n,r in by.items() if r[2].endswith(' RC')}==rc,'True RC placement mismatch')
    for n,label,team,note in rcrows:require(normalized(by[n][2].removesuffix(' RC'))==normalized(label) and by[n][3]==team,'RC identity/team mismatch '+n)
    require({r[1] for r in cards if r[0]=='gold'}==set(map(str,range(1,332))) - {'7'} | set(map(str,range(366,696))),'Gold partial parallel invented or incomplete')
    for r in cards:require(len(r)==6 and all(isinstance(v,str) for v in r) and (r[3] or is_checklist(r[2],r[4])) and not re.search(r'\b1\s*:\s*\d+',r[5]),'Invalid card/team or set-wide odds in variant')
    verify_catalogues(snapshot,cards);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#')[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=5) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for k,e in changed['sources'].items():
        raw=cache[e['url'].split('#')[0]];e['records']=extract(k,raw,e);e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print('Retrieved',k,len(e['records']),flush=True)
    def image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed image bytes changed '+e['key'])
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,want in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall LL','John Marshall'),('Jim Hall CL','Jim Hall'),('Joe Mauer DPK, RC','Joe Mauer')]:require(split_label(raw)[0]==want,'Whole-token name cleanup failed')
    require(is_checklist('Checklist') and is_checklist('Subject','Checklist') and not is_checklist('Joe Mauer'),'Checklist exception failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failure',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Source retrieval failure bypassed')
            require(mock.call_count==calls,'Unbounded retry')
    assemble(bundle,snapshot)
    mutations=[('tcdb-1562-1',0,1,'Wrong Player'),('tcdb-1562-1',0,2,''),('tcdb-13909-1',0,1,'Pedro Martinez SN1950'),('tcdb-13913-1',0,2,'Chicago Cubs'),('rookies',0,2,'Boston Red Sox')]
    for key,i,col,value in mutations:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'][i][col]=value
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corrupted source accepted '+key)
    for key in ['tcdb-1562-8','tcdb-13909-7','tcdb-13912-7','tcdb-1571-8','tcdb-13910-4','cbc','bcp-base','supplement']:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'].pop()
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Incomplete source accepted '+key)
    for key,value in [('released',True),('gold',19),('limited',1950),('13915',8927),('13913',1304)]:
        changed=copy.deepcopy(bundle)
        if key=='released':changed['product']['released']=value
        else:next(s for s in changed['productSets'] if s['key']==key)['oddsPerPack']=value
        try:assemble(changed,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted '+key)
    print('PASS: strict name boundaries, missing-team/checklist gate, bounded source failures, 13 corrupt-source and five unsafe-manifest rejection cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args();bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);text=csv_text(assemble(bundle,snapshot))
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 3761 cards / 49 collector families / 718 base positions / 39 true base RCs; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
