#!/usr/bin/env python3
"""Generate the 1999 Fleer Brilliants Baseball unreleased Set Factory draft.

The complete catalogued CSV is reconstructed from committed source records and
validated before writing. --check compares exact committed bytes; --self-test
also runs parser and corruption cases. --refresh-sources retrieves every source
and checks reviewed scan hashes. Missing/unexpected rows fail closed.
Unknown rare/checklist odds remain explicitly pending in the manifest.
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
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'set-factory'
STEM = '1999-fleer-brilliants-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 747
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


NUM = re.compile(r'^(?:\d{1,3}(?:\s?[a-z]{1,3})?|NNO(?:\d+C?|[ -]?[AB])?)$', re.I)


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



EXPECTED_COUNTS = {'base':175,'blue':175,'gold':175,'24kt-gold':175,'illuminators':15,'shining-stars':15,'shining-stars-pulsars':15,'checklists':2}
EXPECTED_ODDS = {'base':None,'blue':2,'gold':None,'24kt-gold':None,'illuminators':10,'shining-stars':20,'shining-stars-pulsars':400,'checklists':None}
PARALLELS = {'blue','gold','24kt-gold','shining-stars-pulsars'}
ROOKIES = {'140','141','151','152','156','159','160','161','170','172','174','175'}
SECTIONS = {'base':'Base_Set','illuminators':'Illuminators','shining-stars':'Shining_Stars'}
SUFFIXES = {'base':'','blue':'B','gold':'G','24kt-gold':'TG','illuminators':' I','shining-stars':' SS','shining-stars-pulsars':' P'}
FAMILY_IDS = {'checklists':437446,'illuminators':11488,'shining-stars':11489,'shining-stars-pulsars':11490,'24kt-gold':11485,'blue':11486,'gold':11487}
SIDS = {'base':1309,**FAMILY_IDS}
EXPECTED_IDS = {k: {str(n)+SUFFIXES[k] for n in range(1,c+1)} if k!='checklists' else {'NNO-A','NNO-B'} for k,c in EXPECTED_COUNTS.items()}
TAGS = r'(?:RC|ROO|CL|UER|ERR|COR|LL|AS|SN\d+)'
TRAILING = re.compile(r'\s+(' + TAGS + r'(?:,?\s+' + TAGS + r')*)$',re.I)

def require(condition,message):
    if not condition:raise ValueError(message)

def split_label(label):
    label=' '.join(label.split())
    match=TRAILING.search(label)
    return (label[:match.start()],set(re.split(r',?\s+',match[1].upper()))) if match else (label,set())

def clean_name(label):return split_label(label)[0]

def is_checklist(name,subset=''):return 'checklist' in (name+' '+subset).lower()

def fetch(url):
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=35) as response:return response.read().decode('utf8','replace')
    except Exception as exc:raise RuntimeError(f'Source retrieval failed: {url}: {exc}; no partial CSV written') from exc

def independent_rows(raw,key):
    part=raw[raw.index('id="'+SECTIONS[key]+'"'):]
    if key=='base':part=part[:part.index('id="Parallels"')]
    else:
        boundary=re.search(r'<h[23](?:\s|>)',part)
        if boundary:part=part[:boundary.start()]
    rows=[html.unescape(re.sub('<[^>]+>','',r)).strip() for r in re.findall('<li>(.*?)</li>',part,re.S)]
    return [r for r in rows if re.match(r'^\d+(?:SS|I)?\s',r)]

def scope_rows(raw,key):
    plain=' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())
    if key=='scope-trivia':
        require('#128 Gabe Kapler' in plain and 'Born "8/31/75", should be "7/31/75"' in plain,'Reviewed Kapler trivia changed')
        return ['#128 Gabe Kapler - UER: Born "8/31/75", should be "7/31/75"']
    observed=set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1309}
    require(observed==set(FAMILY_IDS.values()),'Collector family index changed: '+repr(observed))
    promos=Rows(expected_sid=1309);promos.feed(raw)
    require(len(promos.rows)==1 and 'SAMPLE' in plain and 'J.D. Drew' in plain and 'SAM' in plain,'Promotional scope changed')
    return [[key,sid] for key,sid in FAMILY_IDS.items()]

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot)
    urls=sorted({entry['url'].split('#',1)[0] for entry in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=4) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,entry in changed['sources'].items():
        raw=cache[entry['url'].split('#',1)[0]]
        if key.startswith('bcp-'):rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key.startswith('scope-'):rows=scope_rows(raw,key)
        else:rows=parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',entry['url'])[1]))
        entry['records']=rows;entry['sha256']=hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(rows)} records',flush=True)
    for entry in changed['reviewedScanEvidence']:
        request=urllib.request.Request(entry['url'],headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=35) as response:
            require(hashlib.sha256(response.read()).hexdigest()==entry['sha256'],'Reviewed scan changed: '+entry['key'])
    changed['retrievedAt']=datetime.now(timezone.utc).date().isoformat()
    return changed

def records(snapshot,key):
    entry=snapshot['sources'][key]
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid provenance: '+key)
    return entry['records']

def normalized(name):
    aliases={'Bob Abreu':'Bobby Abreu','Bob Higginson':'Bobby Higginson','Dave Justice':'David Justice'}
    return re.sub('[^a-z0-9]','',aliases.get(name,name).lower())

def raw_family(snapshot,key):
    pages=[key+'-1',key+'-2'] if key in {'base','blue','gold','24kt-gold'} else [key]
    for page in pages:
        expected_sid=int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])
        require(expected_sid==SIDS[key],'Wrong committed source namespace: '+page)
    rows=[r for page in pages for r in records(snapshot,page)]
    require(len(rows)==EXPECTED_COUNTS[key],'Incomplete source family: '+key)
    return rows

def row_for(key,number,label,team,note):
    name,tags=split_label(label)
    require(tags <= {'RC','ROO','CL','SN24','SN99'},'Unexpected source tag: '+label)
    subset='';notes=[note] if note else []
    if key in {'base','blue','gold','24kt-gold'}:
        n=int(re.match(r'^\d+',number)[0]);rookie_subset=n>=126
        if key in {'blue','gold','24kt-gold'} and n==132:
            require(name=='Rob Fick' and team=='Detroit Tigers','Reviewed Fick nickname changed')
            name='Robert Fick'
        require(('ROO' in tags)==rookie_subset,'Source subset/range mismatch '+key+' #'+number)
        subset='Rookie' if rookie_subset else ''
        if key=='base':
            require(('RC' in tags)==(number in ROOKIES),'Unverified base rookie tag #'+number)
            if number in ROOKIES:name+=' RC'
            if rookie_subset:notes.append('Short-printed Rookie subset')
            if number=='128':
                require(name=='Gabe Kapler' and team=='Detroit Tigers','Kapler error anchor changed')
                notes.append('UER: Born 8/31/75 on back; actual birth date 7/31/1975')
        else:require('RC' not in tags,'Unexpected parallel RC designation')
        if key=='blue':notes.append('Blue parallel')
        if key in {'gold','24kt-gold'}:
            run=99 if key=='gold' else 24
            require(f'SN{run}' in tags,'Unverified print run '+key+' #'+number)
            require({t for t in tags if t.startswith('SN')}=={f'SN{run}'},'Conflicting print run')
            notes.append(f'Serial numbered /{run}')
        else:require(not any(t.startswith('SN') for t in tags),'Unexpected serial attribute')
    elif key=='checklists':
        require('CL' in tags and not team,'Invalid generic checklist source')
        require(label in {'Checklist: 1-106 CL','Checklist: 107-175 and Inserts CL'},'Unknown checklist range')
        require(number==('NNO-A' if name=='Checklist: 1-106' else 'NNO-B'),'Wrong checklist ID')
        notes.append(name);name='Checklist';subset='Checklist'
    else:
        require(not tags,'Unexpected insert attributes: '+label)
        if key=='shining-stars-pulsars':notes.append('Pulsars parallel')
    require(name and not re.search(r'\b(?:ROO|SN\d+|UER|ERR|COR)\b',name),'Unclean subject: '+name)
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
            match=re.fullmatch(r'(\d+(?:SS|I)?)\s+(.+)',raw)
            require(bool(match),'Unparsed independent row: '+raw)
            number,subject=match.groups()
            if key!='base':number=re.sub(r'^(\d+)(I|SS)$',r'\1 \2',number)
            require(number not in seen and number in by_key[key],'Independent number mismatch: '+raw)
            seen.add(number)
            subject=re.sub(r'\s+RC\*?$','',subject)
            actual=by_key[key][number][2].removesuffix(' RC')
            if key=='base' and number=='153':require(subject=='Mark Johnson' and actual=='Mark L. Johnson','Reviewed #153 identity changed')
            else:require(normalized(subject)==normalized(actual),f'Independent name mismatch {key} #{number}: {subject!r} vs {actual!r}')
    require({r.split(' ',1)[0] for r in records(snapshot,'bcp-base') if re.search(r'\sRC\*?$',r)}==ROOKIES,'BCP true rookie set changed')
    base=by_key['base']
    for key in ['blue','gold','24kt-gold']:
        for number,row in by_key[key].items():
            parent=base[re.match(r'^\d+',number)[0]]
            require(row[2]==parent[2].removesuffix(' RC') and row[3:5]==parent[3:5],'Parallel player/team/subset mismatch '+key+' #'+number)
    subjects={r[2].removesuffix(' RC'):r[3] for r in base.values()}
    for key in ['illuminators','shining-stars','shining-stars-pulsars']:
        for row in by_key[key].values():require(subjects.get(row[2])==row[3],'Insert/base team mismatch '+key+' #'+row[1])
    for i in range(1,16):
        require(by_key['shining-stars'][f'{i} SS'][2:5]==by_key['shining-stars-pulsars'][f'{i} P'][2:5],'Pulsars/Stars identity/team mismatch')

def validate(bundle,snapshot,cards):
    require(snapshot['schemaVersion']==1,'Invalid source schema')
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and bundle['product']['released'] is False,'Must remain unreleased DRAFT')
    require(bundle['product']['id']=='1999_Fleer_Brilliants_Baseball' and bundle['product']['year']==1999 and bundle['product']['sport']=='Baseball','Wrong product identity')
    require(bundle['product']['cardsPerPack']==5 and bundle['product']['packsPerBox']==24,'Wrong pack configuration')
    require(bundle['review']['teamData']=='COMPLETE','Team review changed')
    require(bundle['review']['insertOdds']=='PENDING_UNKNOWN_RARE_AND_CHECKLIST_ODDS','Unknown odds cannot silently clear')
    specs=bundle['productSets']
    require(len(specs)==len({s['id'] for s in specs})==8 and {s['key'] for s in specs}==set(EXPECTED_COUNTS),'Wrong collector-family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==747,'Expected 747 unique explicit cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(spec['sourceSetId']==SIDS[key],'Manifest source namespace mismatch')
        require(len(rows)==spec['expectedCards']==EXPECTED_COUNTS[key] and {r[1] for r in rows}==EXPECTED_IDS[key],'Incomplete/duplicate family: '+key)
        require(spec.get('oddsPerPack')==EXPECTED_ODDS[key],'Unverified set odds: '+key)
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Wrong kind: '+key)
    base={r[1]:r for r in cards if r[0]=='base'}
    indexed={n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies')}
    tagged={r[1]:(r[2].removesuffix(' RC'),r[3]) for r in cards if r[0]=='base' and r[2].endswith(' RC')}
    require(len(records(snapshot,'rookies'))==12 and set(indexed)==ROOKIES and indexed==tagged,'Rookie index/name/team mismatch')
    require(sum(r[2].endswith(' RC') for r in cards)==12,'Unexpected parallel/insert RC')
    for n,name,team in [('1','Mark McGwire','St. Louis Cardinals'),('30','Mike Piazza','New York Mets'),('39','Alex Rodriguez','Seattle Mariners'),('102','David Wells','Toronto Blue Jays'),('113','Roger Clemens','New York Yankees'),('126','J.D. Drew','St. Louis Cardinals'),('140','Pat Burrell RC','Philadelphia Phillies'),('151','A.J. Burnett RC','Florida Marlins'),('153','Mark L. Johnson','Chicago White Sox'),('155','Roy Halladay','Toronto Blue Jays'),('165','Mike Lowell','Florida Marlins'),('175','Roosevelt Brown RC','Chicago Cubs')]:
        require(base[n][2:4]==[name,team],'Number/name/team/RC anchor failed #'+n)
    for key in ['base','blue','gold','24kt-gold']:
        require({int(re.match(r'^\d+',r[1])[0]) for r in cards if r[0]==key and r[4]=='Rookie'}==set(range(126,176)),'Incomplete Rookie subset: '+key)
    require({(r[0],r[1]) for r in cards if not r[3]}=={('checklists','NNO-A'),('checklists','NNO-B')},'Unexpected blank team')
    require(records(snapshot,'scope-index')==[[k,v] for k,v in FAMILY_IDS.items()],'Family index scope mismatch')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV format')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into variant')
    evidence=snapshot['reviewedScanEvidence']
    require({x['key'] for x in evidence}=={'pack','box','checklist-0-0','checklist-0-1','checklist-1-0','checklist-1-1','base-2-0','base-2-1','shining-stars-pulsars-0','shining-stars-pulsars-1'},'Missing reviewed scan evidence')
    for entry in evidence:require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid scan provenance')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[]
    for spec in bundle['productSets']:
        key=spec['key']
        for number,label,team,note in raw_family(snapshot,key):
            if key=='checklists':
                require(number=='NNO','Unexpected printed checklist number')
                number='NNO-A' if label=='Checklist: 1-106 CL' else 'NNO-B'
            cards.append(row_for(key,number,label,team,note))
    validate(bundle,snapshot,cards)
    return cards

def self_test(bundle,snapshot):
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall LL','John Marshall'),('Jim Hall CL','Jim Hall'),('Ken Boswell LL','Ken Boswell')]:
        require(clean_name(raw)==expected,'Whole-token cleanup damaged a name')
    raw='<tr><td><a href="/ViewCard.cfm/sid/1309/cid/1">140</a></td><td>Pat Burrell ROO, RC<figcaption>Caption without separator</figcaption></td><td>Philadelphia Phillies</td></tr>'
    require(parse(raw,1309)==[['140','Pat Burrell ROO, RC','Philadelphia Phillies','Caption without separator']],'Parser caption separation failed')
    for num in ['1B','175TG','1 I','15 SS','1 P','NNO']:
        require(parse(raw.replace('>140<','>'+num+'<'),1309)[0][0]==num,'Suffix/unnumbered parser failed')
    for invalid in [raw.replace('/sid/1309/','/sid/9999/'),raw.replace('>140<','>UNKNOWN<')]:
        try:parse(invalid,1309)
        except ValueError:pass
        else:raise ValueError('Parser accepted wrong namespace/unparsed linked row')
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-2']['records'].pop()),
        ('duplicate number',lambda s:s['sources']['base-2']['records'][0].__setitem__(0,'1')),
        ('wrong base identity',lambda s:s['sources']['base-1']['records'][10].__setitem__(1,'Wrong Player')),
        ('wrong historical team',lambda s:s['sources']['base-1']['records'][10].__setitem__(2,'New York Yankees')),
        ('missing team',lambda s:s['sources']['base-1']['records'][10].__setitem__(2,'')),
        ('wrong Rookie subset',lambda s:s['sources']['base-2']['records'][25].__setitem__(1,'J.D. Drew')),
        ('false RC',lambda s:s['sources']['base-2']['records'][25].__setitem__(1,'J.D. Drew ROO, RC')),
        ('wrong rookie index',lambda s:s['sources']['rookies']['records'][0].__setitem__(1,'Wrong Player ROO, RC')),
        ('wrong Gold print run',lambda s:s['sources']['gold-1']['records'][0].__setitem__(1,'Mark McGwire SN24')),
        ('wrong 24KT print run',lambda s:s['sources']['24kt-gold-1']['records'][0].__setitem__(1,'Mark McGwire SN99')),
        ('wrong Pulsars number',lambda s:s['sources']['shining-stars-pulsars']['records'][0].__setitem__(0,'1 SS')),
        ('missing generic checklist',lambda s:s['sources']['checklists']['records'].pop()),
        ('wrong collector namespace',lambda s:s['sources']['blue-1'].__setitem__('url',s['sources']['gold-1']['url'])),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot);mutate(changed)
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption test accepted: '+name)
    print('PASS: complete row/parallel/RC audit, namespace and caption parser, whole-token names, thirteen corruption tests')


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
    print(f'PASS: {len(cards)} catalogued cards / {len(bundle["productSets"])} collector sets / 12 verified base RCs; unknown rare/checklist odds pending; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
