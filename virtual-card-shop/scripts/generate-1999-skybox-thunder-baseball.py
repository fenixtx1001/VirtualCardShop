#!/usr/bin/env python3
"""Generate the 1999 SkyBox Thunder Baseball unreleased Set Factory draft.

The complete catalogued CSV is reconstructed from committed source records and
validated before writing. --check compares exact committed bytes; --self-test
also runs parser and corruption cases. --refresh-sources retrieves every source
and checks reviewed scan hashes. Missing/unexpected rows fail closed.
Unknown rare/checklist odds remain pending; all collector checklists included.
No database access or deployment occurs in this generator.
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
STEM = '1999-skybox-thunder-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1272
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


NUM = re.compile(r'^(?:\d{1,3}(?:\s?\([a-z]{1,2}\))?|NNO)$', re.I)


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



EXPECTED_COUNTS={'base':300,'rant':300,'rave':300,'super-rave':300,'unleashed':15,'www-batterz-com':10,'in-depth':10,'hip-no-tized':15,'turbo-charged':10,'dial-1':10,'checklists':2}
EXPECTED_ODDS={'base':None,'rant':None,'rave':None,'super-rave':None,'unleashed':6,'www-batterz-com':18,'in-depth':24,'hip-no-tized':36,'turbo-charged':72,'dial-1':300,'checklists':None}
PARALLELS={'rant','rave','super-rave'}
ROOKIES={'80','138','218'}
SECTIONS={'base':'Base_Set','unleashed':'Unleashed','www-batterz-com':'www.batterz.com','in-depth':'In_Depth','hip-no-tized':'Hip-No-Tized','turbo-charged':'Turbo-Charged','dial-1':'Dial_&quot;1&quot;'}
FAMILY_IDS={'checklists':125536,'dial-1':11658,'hip-no-tized':11659,'in-depth':11660,'turbo-charged':11664,'unleashed':11665,'www-batterz-com':11666,'rant':11661,'rave':11662,'super-rave':11663}
SIDS={'base':1332,**FAMILY_IDS}
SUFFIXES={'base':'','rant':'','rave':'','super-rave':'','unleashed':' (U)','www-batterz-com':' (WB)','in-depth':' (ID)','hip-no-tized':' (H)','turbo-charged':' (TC)','dial-1':' (D)'}
EXPECTED_IDS={k:{str(i)+SUFFIXES[k] for i in range(1,n+1)} if k!='checklists' else {'NNO-A','NNO-B'} for k,n in EXPECTED_COUNTS.items()}
TAGS=r'(?:RC|CL|SAM|AU|LL|AS|SN\d+)'
TRAILING=re.compile(r'\s+('+TAGS+r'(?:,?\s+'+TAGS+r')*)$',re.I)

def require(condition,message):
    if not condition:raise ValueError(message)

def split_label(label):
    label=' '.join(label.split());match=TRAILING.search(label)
    return (label[:match.start()],set(re.split(r',?\s+',match[1].upper()))) if match else (label,set())

def clean_name(label):return split_label(label)[0]

def is_checklist(name,subset=''):return 'checklist' in (name+' '+subset).lower()

def fetch_bytes(url):
    for attempt in range(1,4):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(request,timeout=35) as response:return response.read()
        except (OSError,URLError) as exc:
            transient=not isinstance(exc,HTTPError) or exc.code in {429,502,503,504}
            if not transient or attempt==3:
                raise RuntimeError(f'Source retrieval failed after {attempt} attempt(s): {url}: {exc}; no partial CSV written') from exc
            print(f'Transient source failure; retry {attempt}/2: {url}',flush=True)
            time.sleep(attempt)

def fetch(url):return fetch_bytes(url).decode('utf8','replace')

def independent_rows(raw,key):
    part=raw[raw.index('id="'+SECTIONS[key]+'"'):]
    if key=='base':part=part[:part.index('id="Parallels"')]
    else:
        boundary=re.search(r'<h[23](?:\s|>)',part)
        if boundary:part=part[:boundary.start()]
    rows=[html.unescape(re.sub('<[^>]+>','',r)).strip() for r in re.findall('<li>(.*?)</li>',part,re.S)]
    return [r for r in rows if re.match(r'^\d+(?:\([A-Z]+\))?\s',r)]

def supplementary_rows(raw):
    out=[]
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',raw,re.S):
        cells=[' '.join(html.unescape(re.sub('<[^>]+>',' ',c)).split()) for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if len(cells)==3 and cells[0].isdigit():out.append(cells)
    require(len(out)==300,'Supplementary team listing changed')
    return out

def scope_rows(raw):
    observed=set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1332}
    require(observed==set(FAMILY_IDS.values()),'Related-family index changed: '+repr(observed))
    require(parse(raw,1332)==[['247','Ben Grieve SAM','Oakland Athletics','']],'Promotional scope changed')
    return [[key,sid] for key,sid in FAMILY_IDS.items()]

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot)
    urls=sorted({entry['url'].split('#',1)[0] for entry in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=3) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,entry in changed['sources'].items():
        raw=cache[entry['url'].split('#',1)[0]]
        if key.startswith('bcp-'):rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key=='supplementary-teams':rows=supplementary_rows(raw)
        elif key=='scope-index':rows=scope_rows(raw)
        else:rows=parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',entry['url'])[1]))
        entry['records']=rows;entry['sha256']=hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(rows)} records',flush=True)
    for entry in changed['reviewedScanEvidence']:
        require(hashlib.sha256(fetch_bytes(entry['url'])).hexdigest()==entry['sha256'],'Reviewed scan changed: '+entry['key'])
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat()
    return changed

def records(snapshot,key):
    entry=snapshot['sources'][key]
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid provenance: '+key)
    return entry['records']

def normalized(name):
    aliases={'Dave Justice':'David Justice','Bob Higginson':'Bobby Higginson','Bob Abreu':'Bobby Abreu'}
    return re.sub('[^a-z0-9]','',aliases.get(name,name).lower())

def tier_for(number):return 'Tier 1' if int(number)<=140 else 'Tier 2' if int(number)<=240 else 'Tier 3'

def raw_family(snapshot,key):
    pages=[f'{key}-{i}' for i in [1,2,3]] if key in {'base',*PARALLELS} else [key]
    for page in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])==SIDS[key],'Wrong source namespace: '+page)
    rows=[r for page in pages for r in records(snapshot,page)]
    require(len(rows)==EXPECTED_COUNTS[key],'Incomplete source family: '+key)
    return rows

def row_for(key,number,label,team,note):
    name,tags=split_label(label);subset='';notes=[note] if note else []
    if key in {'base',*PARALLELS}:
        subset=tier_for(number)
        if key=='base':
            require(tags==({'RC'} if number in ROOKIES else set()),'Unverified base attribute/RC #'+number)
            if number in ROOKIES:name+=' RC'
            if number=='30':
                require(name=='Will Clark' and team=='Baltimore Orioles','Reviewed Will Clark affiliation changed')
                notes.append('Texas Rangers uniform; Baltimore Orioles affiliation')
        elif key=='rant':
            require(not tags,'Unexpected Rant attribute');notes.append('Rant; purple foil')
        else:
            run=150 if key=='rave' else 25
            require(tags=={f'SN{run}'},'Unverified parallel print run '+key+' #'+number)
            notes.append(f'Serial numbered /{run}')
    elif key=='checklists':
        require(tags=={'CL'} and not team,'Invalid generic checklist')
        require(label in {'Checklist: 1-230 CL','Checklist: 231-300 and Inserts CL'},'Unknown checklist range')
        require(number==('NNO-A' if label=='Checklist: 1-230 CL' else 'NNO-B'),'Wrong unnumbered checklist identifier')
        notes.append(name);name='Checklist';subset='Checklist'
    else:
        require(not tags,'Unexpected insert attribute: '+label)
        if key=='dial-1':notes.append('Die-cut plastic; cellphone design')
    require(name and not re.search(r'\b(?:SAM|AU|SN\d+)\b',name),'Unclean display subject: '+name)
    require(team or is_checklist(name,subset),'Missing non-checklist team: '+key+' #'+number)
    require(not team or team in KNOWN_CLUBS,'Invalid historical team: '+team)
    return [key,number,name,team,subset,'; '.join(notes)]

def verify_independent(snapshot,cards):
    by_key={key:{r[1]:r for r in cards if r[0]==key} for key in EXPECTED_COUNTS}
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key)
        require(len(rows)==EXPECTED_COUNTS[key],'Independent listing incomplete: '+key)
        seen=set()
        for raw in rows:
            match=re.fullmatch(r'(\d+(?:\([A-Z]+\))?)\s+(.+)',raw)
            require(bool(match),'Unparsed independent row: '+raw)
            number,subject=match.groups()
            if key!='base':number=re.sub(r'^(\d+)(\()',r'\1 \2',number)
            require(number not in seen and number in by_key[key],'Independent numbering mismatch: '+raw);seen.add(number)
            if key=='base' and number=='30':
                require(subject=='Will Clark (depicted as a Ranger)','Reviewed independent Will Clark caption changed');subject='Will Clark'
            subject=re.sub(r'\s+RC$','',subject)
            actual=by_key[key][number][2].removesuffix(' RC')
            require(normalized(subject)==normalized(actual),f'Independent name mismatch {key} #{number}: {subject!r} vs {actual!r}')
    require({r.split(' ',1)[0] for r in records(snapshot,'bcp-base') if re.search(r'\sRC$',r)}==ROOKIES,'BCP RC inventory changed')
    base=by_key['base']
    supplementary=records(snapshot,'supplementary-teams')
    require(len(supplementary)==len({r[0] for r in supplementary})==300 and {r[0] for r in supplementary}==set(base),'Supplementary team inventory incomplete')
    for n,name,team in supplementary:
        require(normalized(name.removesuffix(' RC'))==normalized(base[n][2].removesuffix(' RC')) and team==base[n][3],'Supplementary number/name/team mismatch #'+n)
    for key in PARALLELS:
        for number,row in by_key[key].items():
            parent=base[number]
            require(normalized(row[2])==normalized(parent[2].removesuffix(' RC')) and row[3:5]==parent[3:5],'Parallel number/player/team/tier mismatch '+key+' #'+number)
    subjects={normalized(r[2].removesuffix(' RC')):r[3] for r in base.values()}
    for key in SECTIONS:
        if key!='base':
            for row in by_key[key].values():require(subjects.get(normalized(row[2]))==row[3],'Insert/base team mismatch '+key+' #'+row[1])

def validate(bundle,snapshot,cards):
    require(snapshot['schemaVersion']==1,'Invalid source schema')
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and bundle['product']['released'] is False,'Must remain unreleased DRAFT')
    require(bundle['product']['id']=='1999_SkyBox_Thunder_Baseball' and bundle['product']['year']==1999 and bundle['product']['sport']=='Baseball','Wrong product identity')
    require(bundle['product']['cardsPerPack']==8 and bundle['product']['packsPerBox']==36,'Wrong Hobby pack configuration')
    require(bundle['review']['teamData']=='COMPLETE' and bundle['review']['insertOdds']=='PENDING_UNKNOWN_RAVE_SUPER_RAVE_CHECKLIST_ODDS','Review status changed')
    specs=bundle['productSets']
    require(len(specs)==len({s['id'] for s in specs})==11 and {s['key'] for s in specs}==set(EXPECTED_COUNTS),'Wrong collector-family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==1272,'Expected 1272 unique explicit cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(spec['sourceSetId']==SIDS[key],'Manifest namespace mismatch')
        require(len(rows)==spec['expectedCards']==EXPECTED_COUNTS[key] and {r[1] for r in rows}==EXPECTED_IDS[key],'Incomplete/duplicate family: '+key)
        require(spec.get('oddsPerPack')==EXPECTED_ODDS[key],'Unverified set odds: '+key)
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Wrong set kind: '+key)
    base={r[1]:r for r in cards if r[0]=='base'}
    indexed={n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies')}
    tagged={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==3 and set(indexed)==ROOKIES and indexed==tagged,'Rookie-index identity/team mismatch')
    require(sum(r[2].endswith(' RC') for r in cards)==3,'Unexpected parallel/insert RC')
    for n,name,team in [('1','John Smoltz','Atlanta Braves'),('30','Will Clark','Baltimore Orioles'),('80','Rafael Roque RC','Milwaukee Brewers'),('128','Paul Konerko','Chicago White Sox'),('138','Doug Mientkiewicz RC','Minnesota Twins'),('218','Guillermo Garcia RC','Florida Marlins'),('219','David Wells','New York Yankees'),('250','Randy Johnson','Arizona Diamondbacks'),('265','Roger Clemens','Toronto Blue Jays'),('299','J.D. Drew','St. Louis Cardinals')]:require(base[n][2:4]==[name,team],'Number/name/team/RC anchor failed #'+n)
    for key in {'base',*PARALLELS}:
        for subset,numbers in [('Tier 1',range(1,141)),('Tier 2',range(141,241)),('Tier 3',range(241,301))]:require({int(r[1]) for r in cards if r[0]==key and r[4]==subset}==set(numbers),'Tier range audit failed '+key+' '+subset)
    require({(r[0],r[1]) for r in cards if not r[3]}=={('checklists','NNO-A'),('checklists','NNO-B')},'Unexpected blank team')
    require(records(snapshot,'scope-index')==[[k,v] for k,v in FAMILY_IDS.items()],'Related-family scope changed')
    require(records(snapshot,'scope-promo')==[['247','Ben Grieve SAM','Oakland Athletics','']],'Promo exclusion changed')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV format')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into variant')
    evidence=snapshot['reviewedScanEvidence']
    require({x['key'] for x in evidence}=={'base-1-0','base-1-1','rant-0','rant-1','rave-0','rave-1','super-rave-0','super-rave-1','checklist-0-0','checklist-0-1','checklist-1-0','checklist-1-1','hobby-pack','hobby-box','hobby-box-front','retail-box','retail-box-side'},'Reviewed scan inventory changed')
    for entry in evidence:require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid scan provenance')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[]
    for spec in bundle['productSets']:
        key=spec['key']
        for number,label,team,note in raw_family(snapshot,key):
            if key=='checklists':
                require(number=='NNO','Unexpected printed checklist number')
                number='NNO-A' if label=='Checklist: 1-230 CL' else 'NNO-B'
            cards.append(row_for(key,number,label,team,note))
    validate(bundle,snapshot,cards)
    return cards

def self_test(bundle,snapshot):
    from unittest.mock import patch
    from contextlib import redirect_stdout
    with patch.object(urllib.request,'urlopen',side_effect=[HTTPError('https://example.test',503,'temporary',None,None),io.BytesIO(b'verified')]) as mock, patch.object(time,'sleep'), redirect_stdout(io.StringIO()):
        require(fetch_bytes('https://example.test')==b'verified' and mock.call_count==2,'Transient retry failed')
    for code,calls in [(403,1),(503,3)]:
        with patch.object(urllib.request,'urlopen',side_effect=HTTPError('https://example.test',code,'unavailable',None,None)) as mock, patch.object(time,'sleep'), redirect_stdout(io.StringIO()):
            try:fetch_bytes('https://example.test')
            except RuntimeError:pass
            else:raise ValueError('Source failure was bypassed')
            require(mock.call_count==calls,'Source retries are not bounded')
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall LL','John Marshall'),('Jim Hall CL','Jim Hall'),('Ken Boswell LL','Ken Boswell')]:require(clean_name(raw)==expected,'Whole-token cleanup damaged a name')
    raw='<tr><td><a href="/ViewCard.cfm/sid/1332/cid/1">80</a></td><td>Rafael Roque RC<figcaption>Caption without separator</figcaption></td><td>Milwaukee Brewers</td></tr>'
    require(parse(raw,1332)==[['80','Rafael Roque RC','Milwaukee Brewers','Caption without separator']],'Caption separation failed')
    for num in ['1 (U)','10 (WB)','1 (ID)','15 (H)','10 (TC)','1 (D)','NNO']:
        require(parse(raw.replace('>80<','>'+num+'<'),1332)[0][0]==num,'Parenthesized/unnumbered parser failed')
    for invalid in [raw.replace('/sid/1332/','/sid/9999/'),raw.replace('>80<','>UNKNOWN<')]:
        try:parse(invalid,1332)
        except ValueError:pass
        else:raise ValueError('Parser accepted wrong namespace/unparsed linked row')
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-3']['records'].pop()),
        ('duplicate number',lambda s:s['sources']['base-2']['records'][0].__setitem__(0,'1')),
        ('wrong player',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong known team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'New York Yankees')),
        ('missing player team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),
        ('false RC',lambda s:s['sources']['base-3']['records'][98].__setitem__(1,'J.D. Drew RC')),
        ('wrong rookie index',lambda s:s['sources']['rookies']['records'][0].__setitem__(1,'Wrong Player RC')),
        ('wrong Rave run',lambda s:s['sources']['rave-1']['records'][0].__setitem__(1,'John Smoltz SN25')),
        ('wrong Super Rave run',lambda s:s['sources']['super-rave-1']['records'][0].__setitem__(1,'John Smoltz SN150')),
        ('invented Rant serial',lambda s:s['sources']['rant-1']['records'][0].__setitem__(1,'John Smoltz SN150')),
        ('missing full Rant row',lambda s:s['sources']['rant-3']['records'].pop()),
        ('wrong insert number',lambda s:s['sources']['dial-1']['records'][0].__setitem__(0,'1 (H)')),
        ('missing checklist',lambda s:s['sources']['checklists']['records'].pop()),
        ('wrong namespace',lambda s:s['sources']['rave-1'].__setitem__('url',s['sources']['rant-1']['url'])),
        ('odds leaked into variant',lambda s:s['sources']['base-1']['records'][0].__setitem__(3,'Inserted 1:36 packs')),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot);mutate(changed)
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption test accepted: '+name)
    print('PASS: all card/parallel/team/tier/RC audits, strict parser/whole-token names, bounded retrieval retries, fifteen corruption tests')


def csv_text(cards):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(HEADER)
    writer.writerows(cards)
    return stream.getvalue()


def atomic_write(path, text):
    temporary = path.with_suffix(path.suffix + '.tmp')
    try:
        temporary.write_text(text, encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--refresh-sources', action='store_true')
    args = parser.parse_args()
    bundle = json.loads(BUNDLE.read_text())
    snapshot = json.loads(SOURCE.read_text())
    if args.refresh_sources:
        snapshot = refresh_sources(snapshot)
    self_test(bundle, snapshot)
    cards = assemble(bundle, snapshot)
    text = csv_text(cards)
    if args.check:
        require(OUT.read_text() == text, 'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:
            atomic_write(SOURCE, json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
        atomic_write(OUT, text)
    print(f'PASS: {len(cards)} catalogued cards / {len(bundle["productSets"])} collector sets / 3 verified base RCs; rare/checklist odds pending; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
