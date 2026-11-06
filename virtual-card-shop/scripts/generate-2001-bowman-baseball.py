#!/usr/bin/env python3
"""Generate and verify the unreleased 2001 Bowman Baseball Set Factory draft.

Audit all 1032 explicit cards in twelve families, including both full 440-card
base/Gold rosters. Check independent subjects, teams, 104 true RCs, printed-code
corrections, original buyback numbering and honest serial/print-run metadata.
No production access or deployment. Retrieval and metadata failures fail closed.
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
STEM = '2001-bowman-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1032
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

COUNTS={'base':440,'gold':440,'reprints':25,'futures':34,'multiple':18,'reprint-bats':5,'roy':1,'autographs':40,'reprint-autographs':9,'autoproofs':10,'multiple-autographs':5,'bat-autographs':5}
SIDS=dict(zip(COUNTS,[1441,12604,12607,12603,12605,12609,1441,12601,12608,12602,12606,12610]))
ODDS={k:{'gold':1,'reprints':12,'futures':82,'multiple':1476,'reprint-bats':1954,'roy':2202,'autographs':74,'reprint-autographs':2467,'multiple-autographs':18259,'bat-autographs':18259}.get(k) for k in COUNTS}
TITLES={'base':'Base Set Checklist','autographs':'Autographs Set Checklist','autoproofs':'Autoproofs Set Checklist','futures':'Futures Game Relics Set Checklist','multiple':'Multiple Game Relics Set Checklist','multiple-autographs':'Multiple Game Relics Autograph Set Checklist','promos':'Promos Set Checklist','reprints':'Rookie Reprints Set Checklist','reprint-bats':'Rookie Reprints Relic Bat Set Checklist','bat-autographs':'Rookie Reprints Relic Bat Autographs Set Checklist','reprint-autographs':'Rookie Reprints Autographs Set Checklist','roy':'Rookie of the Year Dual Game Worn Jersey Set Checklist','redemption':'Autographed Game Used Baseball Redemption Set Checklist'}
SECTIONS={'base-veterans':'Veterans_(reds)','base-prospects':'Rookies_&amp;_Prospects_(blues)','reprints':'Rookie_Reprints','futures':'Futures_Game_Relics','multiple':'Futures_Game_Multiple_Relics','reprint-bats':'Rookie_Reprints_Relic_Bat','roy':'2000_ROY_Dual_Jersey_Relic','autographs':'Autographs','reprint-autographs':'Rookie_Reprints_Autographs','autoproofs':'Autoproofs','multiple-autographs':'Futures_Game_Multiple_Relics_Autograph','bat-autographs':'Rookie_Reprints_Relic_Bat_Autographs','promos':'Promos'}
AUTO_NUMBERS={'Hank Bauer':'219','Pat Burrell':'175','Carlos Delgado':'127','Carl Erskine':'260','Rafael Furcal':'364','Chipper Jones':'569','Ralph Kiner':'3','Don Larsen':'101','Gil McDougald':'33','Ivan Rodriguez':'272'}
AUTO_YEARS={'3':'1948','33':'1952','101':'1954','127':'1992','175':'1999','219':'1950','260':'1951','272':'1991','364':'1999','569':'1991'}
ERRORS={'254':'UER: Last name misspelled "Jacobsen" on front and back','299':'UER: Photos actually Denny Bautista','345':'UER: Name misspelled "Ranier" on front and back','397':'UER: Last name misspelled "Peavey" on front and back','429':'Marked as Bowman Rookie Card but first Bowman card is 2000'}
PRODUCT='2001_Bowman_Baseball'
REPRINT_ORIGINS=['1948 Bowman #6','1948 Bowman #3','1948 Bowman #36','1948 Bowman #18','1949 Bowman #75','1949 Bowman #238','1949 Bowman #46','1949 Bowman #226','1949 Bowman #110','1949 Bowman #214','1949 Bowman #100','1950 Bowman #219','1950 Bowman #23','1950 Bowman #232','1951 Bowman #305','1951 Bowman #122','1951 Bowman #1','1952 Bowman #244','1952 Bowman #33','1952 Bowman #5','1953 Bowman #97','1954 Bowman #23','1954 Bowman #101','1955 Bowman #68','1955 Bowman #65']

def plain(raw):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())

def cbc_rows(raw,key):
    headings=list(re.finditer(r'<h3\b[^>]*>.*?</h3>',raw,re.S));matches=[(i,m) for i,m in enumerate(headings) if plain(m[0])==TITLES[key]]
    require(len(matches)==1,'Independent heading missing/ambiguous '+key);i,m=matches[0];part=raw[m.end():headings[i+1].start() if i+1<len(headings) else len(raw)]
    blocks=re.findall(r'<div[^>]*class="[^"]*\btablechecklist\b[^"]*"[^>]*>(.*?)</div>',part,re.S)
    rows=[plain(line) for block in blocks for line in re.split(r'<br\s*/?>',block) if plain(line)]
    if key=='roy':require(rows==['ROYR Kazuhiro Sasaki','Rafael Furcal'],'Dual ROY source changed');rows=['ROYR Kazuhiro Sasaki / Rafael Furcal']
    require(bool(rows),'Empty independent roster '+key);return rows

def cbc_errors(raw):
    part=raw[raw.index('Uncorrected Error Cards:</h3>'):]
    return list_items(part[:part.index('</ul>')+5])

def supplementary_rows(raw):
    keys=['base','autoproofs','autographs','futures','multiple','multiple-autographs','reprints','reprint-autographs','reprint-bats','bat-autographs','promos','vault'];tables=re.findall(r'<table[^>]*>.*?</table>',raw,re.S);require(len(tables)==len(keys),'Independent table scope changed');out=[]
    for key,table in zip(keys,tables):
        rows=[]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
            cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
            if cells:require(len(cells)==3,'Unexpected table columns');rows.append([key,*cells])
        require(len(rows)==(3 if key=='promos' else 1 if key=='vault' else COUNTS[key]),'Independent family incomplete '+key);out+=rows
    return out

def configuration_rows(raw):
    distribution=plain(section(raw,'Distribution','Reviews'));require('24 packs per box, 10 cards per pack' in distribution and '12 packs per box, 21 cards per pack' in distribution,'Distribution changed');out=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section(raw,'Insertion_Ratios','Checklist'),re.S):
        cells=[plain(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if cells:require(len(cells)==5,'Unexpected odds columns');out.append(cells)
    require(len(out)==13,'Incomplete physical rate evidence');return out

def split_label(label):
    tags=set()
    while re.search(r' (?:RC|SP|UER|VAR|AU|MEM|CL|ROY|EXCH|PROMO|SN\d+|PR\d+)$',label):
        label,tag=label.rsplit(' ',1);tags.add(tag);label=label.rstrip(',')
    return label,tags

def canonical(name):
    return {'Larry "Yogi" Berra':'Yogi Berra','Edwin "Duke" Snider':'Duke Snider','Al "Flip" Rosen':'Al Rosen','Ed "Whitey" Ford':'Whitey Ford'}.get(name,name)

def normalized(name):
    name=canonical(split_label(name)[0]);aliases={'Bob Abreu':'Bobby Abreu','Jimmy Journell':'Jim Journell','Eduardo F. Figueroa':'Eduardo Figueroa','Stephen Smitherman':'Steve Smitherman','Pasqual':'Pasqual Coco','Dave Justice':'David Justice','Jerry Hairston':'Jerry Hairston Jr.','Tim Raines':'Timothy Raines Jr.','J.T. Snow':'J.T. Snow Jr.','Ntema Ndungidi':'Pappy Ndungidi','Brad Baker':'Bradley Baker','Greg Nash':'Greg "Toe" Nash','Tim Raines Jr.':'Timothy Raines Jr.','Ranier Olmedo':'Rainer Olmedo','Pat Strange':'Patrick Strange','Brian Barnowski':'Bryan Barnowski','Dave Krynzel':'David Krynzel','Travis Dawkins':'Gookie Dawkins','Tomokazu Ohka':'Tomo Ohka','Minnie Minoso':'Orestes Minoso','Rafeal Furcal':'Rafael Furcal','Don Laresen':'Don Larsen','Cal Ripken':'Cal Ripken Jr.','Sandy Alomar':'Sandy Alomar Jr.','Tony Armas':'Tony Armas Jr.','Lou Montanez':'Luis Montanez','Rob Bowen':'Robert Bowen','Rudy Lugo':'Ruddy Lugo','Matt DeWitt':'Matt Dewitt','Randy Dorame':'Randey Dorame'}
    return re.sub(r'[^a-z0-9]','',aliases.get(name,name).lower())

def is_checklist(player,subset=''):return 'checklist' in (player+' '+subset).lower()

def raw_family(snapshot,key):
    pages=[key+'-'+str(i) for i in range(1,6)] if key in {'base','gold'} else ['scope-cards'] if key=='roy' else ['sid-'+str(SIDS[key])]
    for p in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][p]['url'])[1])==SIDS[key],'Wrong checklist namespace '+key)
    rows=[r for p in pages for r in records(snapshot,p)]
    if key=='roy':rows=[r for r in rows if r[0]=='ROY-R']
    require(len(rows)==COUNTS[key],'Incomplete family '+key);return rows

def row_for(key,n,label,team,note,rc):
    name,tags=split_label(label);name=canonical(name);subset='';notes=[]
    if key in {'base','gold'}:
        error_ids=set(ERRORS) if key=='base' else {'254','299','345'};expected=({'RC'} if key=='base' and n in rc else set())|({'UER'} if n in error_ids else set());require(tags==expected,'Unexpected base/Gold attributes '+n)
        require(note==(ERRORS[n] if n in error_ids else ''),'Unreviewed base/Gold annotation '+n)
        if note:
            notes.append('UER: Photo depicts another player; pictured identity disputed across catalogues' if n=='299' else note)
        if key=='base' and n=='271':notes.append('Source-reported UER: Missing facsimile signature')
        if key=='base' and n=='382':notes.append('Source-reported UER: Incorrect position')
        if key=='base' and n in rc:name+=' RC'
        subset='Veterans' if int(n)<=140 else 'Rookies/Prospects'
        if key=='gold':notes.append('Gold-foil facsimile signature; not a certified autograph')
    else:
        expected={'AU'} if key=='autographs' else {'AU','SN25'} if key=='autoproofs' else {'AU','PR100'} if key=='reprint-autographs' else {'AU','MEM'} if key in {'multiple-autographs','bat-autographs'} else {'ROY','MEM'} if key=='roy' else {'MEM'} if key in {'futures','multiple','reprint-bats'} else set();require(tags==expected,'Unexpected insert tags '+key+' '+n)
        if key=='futures':
            require(note=='MEM: Jersey','Unexpected jersey material');notes.append('2000 All-Star Futures Game jersey relic')
            if n=='FGR-CP':require(name=='Corey Patterson','Reviewed FGR code correction changed');n='FGR-DCP'
            elif n=='FGR-CP2':require(name=='Carlos Pena','Reviewed FGR code correction changed');n='FGR-CP'
        elif key in {'multiple','multiple-autographs'}:
            require(note==('MEM: Helmet, Base & Jersey' if key=='multiple' else 'MEM: Helmet, Bases & Jersey'),'Unexpected multi material');notes.append('2000 All-Star Futures Game helmet, base and jersey relics')
            if key=='multiple-autographs':require(re.fullmatch(r'AMGR[A-Z]+',n),'Unknown AMGR code');n=n[:4]+'-'+n[4:]
        elif key=='roy':require(n=='ROY-R' and note=='MEM: Jersey / Jersey','ROY metadata changed');notes.append('2000 AL/NL Rookie of the Year dual game-worn jersey relic')
        elif key=='autoproofs':
            require(n in AUTO_YEARS and note==AUTO_YEARS[n]+' Bowman' and AUTO_NUMBERS.get(name)==n,'Original buyback numbering/year mismatch');notes.append(f'Buyback: {note} #{n}; hand numbered /25')
        elif key=='reprints':
            require(n.isdigit() and 1<=int(n)<=25 and note==REPRINT_ORIGINS[int(n)-1],'Unknown reprint origin');notes.append('Reprint of '+note)
        elif key in {'reprint-bats','bat-autographs'}:
            require(re.fullmatch(r'MEM: Bat; 19\d{2} #\d+',note),'Unknown bat reprint origin');notes.append('Game-used bat; reprint of '+note[10:].replace(' #',' Bowman #'))
        elif key=='reprint-autographs':
            require(re.fullmatch(r'19\d{2} #\d+',note),'Unknown signed reprint origin');notes.append('Reprint of '+note.replace(' #',' Bowman #'));notes.append('Reported print run 100; not serial numbered')
        else:require(not note,'Unexpected autograph annotation')
        if 'AU' in tags:notes.append('Certified autograph')
        if key=='autographs' and n=='BA-DM':notes.append('Originally packed as exchange; fulfilled signed card verified')
    require(name and not re.search(r'\b(?:SN\d+|PR\d+|UER|AU|MEM|EXCH)\b',name),'Unclean subject name')
    require(team or is_checklist(name,subset),'Missing non-checklist team');require(all(t in KNOWN_CLUBS for t in team.split(' / ')) if team else is_checklist(name,subset),'Invalid historical franchise '+team)
    return [key,n,name,team,subset,'; '.join(notes)]

def independent_identity(text,key):
    n,name=text.split(' ',1)
    if key=='futures':code,name=name.split(' ',1);n+='-'+code
    if key=='multiple':require(n.startswith('MGR'),'MGR prefix changed');n='MGR-'+n[3:]
    if key=='multiple-autographs':require(n.startswith('AMGR'),'AMGR prefix changed');n='AMGR-'+n[4:]
    if key=='roy':require(n=='ROYR','Independent ROY code changed');n='ROY-R'
    if key=='autoproofs':n=AUTO_NUMBERS.get({'Rafeal Furcal':'Rafael Furcal','Don Laresen':'Don Larsen'}.get(name,name),'UNKNOWN')
    return n,name

def verify_independent(snapshot,cards,rc):
    by={k:{r[1]:r for r in cards if r[0]==k} for k in COUNTS}
    for key in TITLES:
        rows=records(snapshot,'cbc-'+key);expected=41 if key=='autographs' else 3 if key=='promos' else 1 if key=='redemption' else COUNTS[key];require(len(rows)==expected,'Independent inventory incomplete '+key);seen=set()
        if key=='promos':require(rows==['PP1 Barry Bonds','PP2 Roger Clemens','PP3 Adrian Gonzalez'],'Promo scope changed');continue
        if key=='redemption':require(rows==['NNO Sean Burroughs'],'Physical baseball ticket changed');continue
        for text in rows:
            n,name=independent_identity(text,key)
            if key=='autographs' and n=='BA-KS':require(name=='Kazuhiro Sasaki','Unsupported signer changed');continue
            require(n not in seen and n in by[key],'Independent number mismatch '+key+' '+n);seen.add(n)
            require(normalized(name)==normalized(by[key][n][2].removesuffix(' RC')),'Independent subject mismatch '+key+' '+n+': '+name+' / '+by[key][n][2])
        if key=='base':require({r.split(' ',1)[0] for r in rows if r.endswith(' RC')}==rc-{'283','334','397','419'},'Independent CBC rookie-tag gaps changed')
    independent_base=records(snapshot,'bcp-base-veterans')+records(snapshot,'bcp-base-prospects')
    require(len(independent_base)==440 and {r.split(' ',1)[0] for r in independent_base if re.search(r' RC\*?$',r)}==rc|{'180'},'Independent BCP true RC evidence changed')
    for text in independent_base:
        n,name=text.split(' ',1);name=re.sub(r' RC\*?$','',name);name=re.sub(r' UER$','',name)
        require(n in by['base'] and normalized(name)==normalized(by['base'][n][2].removesuffix(' RC')),'Independent BCP subject mismatch '+n+': '+name)
    require(records(snapshot,'cbc-errors')==['Pedro Feliz #271 (Missing facsimile signature)','Miguel Cabrera RC #299 (Wrong Player Photo)','Adam Dunn #382 (Incorrect Position)','Jake Peavy #397 (Misspelled Name)'],'Independent error evidence changed')
    supplementary=records(snapshot,'supplement');require(len(supplementary)==len({(r[0],r[1]) for r in supplementary})==595,'Supplementary table inventory incomplete')
    for key,n,name,team in supplementary:
        if key=='promos':continue
        if key=='vault':require((n,name,team)==('NNO','Ralph Kiner','Pittsburgh Pirates'),'Excluded proof scope changed');continue
        if key=='multiple-autographs':n='AMGR-'+n
        if key=='futures':n={'FGR-CP':'FGR-DCP','FGR-CP2':'FGR-CP'}.get(n,n)
        if key=='reprints':name=re.sub(r' 19\d{2} Bowman #\d+$','',name)
        actual=by[key].get(n);require(actual is not None,'Supplementary number mismatch '+key+' '+n)
        require(normalized(name)==normalized(actual[2].removesuffix(' RC')) and team==actual[3],'Independent subject/team mismatch '+key+' '+n+': '+repr((name,team,actual[2],actual[3])))
    for n,row in by['gold'].items():require(normalized(row[2])==normalized(by['base'][n][2].removesuffix(' RC')) and row[3]==by['base'][n][3],'Gold subject/team mismatch '+n)
    for key in {'reprint-autographs','reprint-bats','bat-autographs'}:
        origins={normalized(canonical(split_label(r[1])[0])):r[3] for r in raw_family(snapshot,'reprints')}
        for n,label,team,note in raw_family(snapshot,key):
            original=note.removeprefix('MEM: Bat; ').replace(' #',' Bowman #')
            require(origins.get(normalized(split_label(label)[0]))==original,'Signed/relic reprint origin mismatch '+key+' '+n)
        parents={normalized(r[2]):r[3] for r in by['reprints'].values()}
        for row in by[key].values():require(parents.get(normalized(row[2]))==row[3],'Historical reprint team mismatch '+key+' '+row[1])
    require(records(snapshot,'scope-index')==[12601,12602,12603,12604,12605,12606,12607,12608,12609,12610,73083,376386],'Related family scope changed')
    require(records(snapshot,'bcp-configuration')==snapshot['expectedPhysicalConfiguration'],'Physical rate evidence changed')
    require(records(snapshot,'distributor-configuration')==['24 packs per box, 10 cards per pack','Autoproofs 1:18259'],'Distributor evidence changed')

def validate(bundle,snapshot,cards,rc):
    p=bundle['product'];require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and p['released'] is False,'Must remain unreleased draft')
    require(snapshot['schemaVersion']==1 and snapshot['productId']==p['id']==PRODUCT and p['year']==2001 and p['brand']=='Bowman' and p['sport']=='Baseball','Wrong product identity')
    require(p['cardsPerPack']==10 and p['packsPerBox']==24 and bundle['review']['release']=='BLOCKED_PENDING_QA','Pack/release configuration changed')
    specs=bundle['productSets'];require(len(specs)==len({s['id'] for s in specs})==12 and {s['key'] for s in specs}==set(COUNTS),'Collector-family inventory mismatch')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==TOTAL,'Expected 1032 unique cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key];require(len(rows)==spec['expectedCards']==COUNTS[key],'Incomplete collector family '+key)
        require(spec['sourceSetId']==SIDS[key] and spec['oddsPerPack']==ODDS[key] and spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in {'gold','reprint-autographs','bat-autographs','multiple-autographs'} else 'INSERT'),'Manifest namespace/kind/odds mismatch '+key)
        if key in {'base','gold'}:require({r[1] for r in rows}=={str(i) for i in range(1,441)} and sum(r[4]=='Veterans' for r in rows)==140 and sum(r[4]=='Rookies/Prospects' for r in rows)==300,'Base/Gold range/subset mismatch')
    rookie_rows=records(snapshot,'rookies')+records(snapshot,'rookies-2');indexed={n:(split_label(label)[0],team) for n,label,team,note in rookie_rows};actual={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(rookie_rows)==len(indexed)==len(actual)==104 and indexed==actual and sum(r[2].endswith(' RC') for r in cards)==104,'True RC identity/team inventory mismatch')
    require({r[1] for r in cards if r[0]=='reprint-autographs'}==set(map(str,[1,2,3,4,5,6,8,9,10])),'Invented missing signed-reprint #7')
    for row in cards:require(len(row)==6 and all(isinstance(v,str) for v in row) and (row[3] or is_checklist(row[2],row[4])) and not re.search(r'\b1\s*:\s*\d+',row[5]),'CSV format/team/set-wide odds invalid')
    verify_independent(snapshot,cards,rc)

def assemble(bundle,snapshot):
    rc={r[0] for r in records(snapshot,'rookies')+records(snapshot,'rookies-2')}
    cards=[row_for(spec['key'],*r,rc) for spec in bundle['productSets'] for r in raw_family(snapshot,spec['key'])];validate(bundle,snapshot,cards,rc);return cards

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot);urls=sorted({e['url'].split('#',1)[0] for e in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,e in changed['sources'].items():
        raw=cache[e['url'].split('#',1)[0]]
        if key=='cbc-errors':rows=cbc_errors(raw)
        elif key.startswith('cbc-'):rows=cbc_rows(raw,key[4:])
        elif key=='supplement':rows=supplementary_rows(raw)
        elif key=='bcp-configuration':rows=configuration_rows(raw)
        elif key.startswith('bcp-'):rows=list_items(section(raw,SECTIONS[key[4:]]))
        elif key=='scope-index':rows=sorted(set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1441})
        elif key=='distributor-configuration':
            text=plain(raw);require('24 packs per box, 10 cards per pack' in text and 'Autoproofs 1:18259' in text,'Distributor configuration changed');rows=['24 packs per box, 10 cards per pack','Autoproofs 1:18259']
        else:rows=parse(raw,int(re.search(r'/sid/(\d+)/',e['url'])[1]))
        e['records']=rows;e['sha256']=hashlib.sha256(raw.encode()).hexdigest();print(f'Retrieved {key}: {len(rows)} records',flush=True)
    def check_image(e):require(hashlib.sha256(fetch_bytes(e['url'])).hexdigest()==e['sha256'],'Reviewed original image changed '+e['key'])
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(check_image,changed['reviewedImageEvidence']))
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat();return changed

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall AU','John Marshall'),('Jim Hall CL','Jim Hall'),('Willie Mays AU, PR100','Willie Mays')]:require(split_label(raw)[0]==expected,'Whole-token surname cleanup failed')
    require(is_checklist('Checklist 1') and is_checklist('Player','Checklist') and not is_checklist('Jason Giambi'),'Checklist exception failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'failed',None,None)) as mock,patch.object(time,'sleep'),redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Retrieval failure bypassed')
            require(mock.call_count==calls,'Unbounded retries')
    assemble(bundle,snapshot)
    cases=[('base-1',0,1,'Wrong Player'),('base-1',0,2,''),('base-1',0,1,'Jason Giambi RC'),('gold-1',0,1,'Jason Giambi RC'),('gold-1',0,2,'New York Yankees'),('sid-12608',0,1,'Yogi Berra AU, SN100'),('sid-12602',0,0,'1'),('sid-12603',11,1,'Carlos Pena MEM'),('sid-12607',0,3,'1952 Bowman #6'),('sid-12605',0,3,'MEM: Bat'),('base-3',98,3,'Unreviewed photo claim'),('rookies-2',0,2,'Boston Red Sox')]
    for key,i,col,val in cases:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'][i][col]=val
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption accepted '+key)
    for key in ['base-5','gold-5','rookies-2','sid-12608','supplement','cbc-base']:
        changed=copy.deepcopy(snapshot);changed['sources'][key]['records'].pop()
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Incomplete roster accepted '+key)
    for mutate in [lambda b:b['product'].__setitem__('released',True),lambda b:next(s for s in b['productSets'] if s['key']=='autoproofs').__setitem__('oddsPerPack',18239),lambda b:next(s for s in b['productSets'] if s['key']=='gold').__setitem__('oddsPerPack',24)]:
        changed=copy.deepcopy(bundle);mutate(changed)
        try:assemble(changed,snapshot)
        except ValueError:pass
        else:raise ValueError('Unsafe manifest accepted')
    print('PASS: whole-token names/checklist exception, bounded failures, 18 source corruption and 3 manifest safety cases')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--refresh-sources',action='store_true');args=parser.parse_args()
    bundle=json.loads(BUNDLE.read_text());snapshot=json.loads(SOURCE.read_text())
    if args.refresh_sources:snapshot=refresh_sources(snapshot)
    self_test(bundle,snapshot);cards=assemble(bundle,snapshot);text=csv_text(cards)
    if args.check:require(OUT.read_text()==text,'CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:atomic_write(SOURCE,json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
        atomic_write(OUT,text)
    print('PASS: 1032 cards / 12 collector families / 104 true base RCs; released=false')
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'FAIL CLOSED: {exc}; no partial checklist written',file=sys.stderr);sys.exit(1)
