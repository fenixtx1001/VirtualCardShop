#!/usr/bin/env python3
"""Generate the 1999 Metal Universe Baseball unreleased Set Factory draft.

The complete catalogued CSV is reconstructed from committed source records and
validated before writing. --check compares exact committed bytes; --self-test
also runs parser and corruption cases. --refresh-sources retrieves every source
and checks reviewed scan hashes. Missing/unexpected rows fail closed.
Three disputed PMG checklist cards are excluded; scope and rare odds pending.
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
STEM = '1999-metal-universe-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 968
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


NUM = re.compile(r'^(?:\d{1,3}(?:\s?[a-z]{1,3})?|NNO(?:\d+C?|[ -]?[AB])?|SAMPLE)$', re.I)


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



EXPECTED_COUNTS={'base':300,'precious-metal-gems':297,'gem-masters':300,'neophytes':15,'boyz-with-the-wood':15,'planet-metal':15,'diamond-soul':15,'linchpins':10,'drew-autograph':1}
EXPECTED_ODDS={'base':None,'precious-metal-gems':None,'gem-masters':None,'neophytes':6,'boyz-with-the-wood':18,'planet-metal':36,'diamond-soul':72,'linchpins':360,'drew-autograph':None}
PARALLELS={'precious-metal-gems','gem-masters'}
SECTIONS={'base':'Base_Set','neophytes':'Neophytes','boyz-with-the-wood':'Boyz_with_the_Wood','planet-metal':'Planet_Metal','diamond-soul':'Diamond_Soul','linchpins':'Linchpins','drew-autograph':'J.D._Drew_Autograph'}
FAMILY_IDS={'boyz-with-the-wood':11527,'diamond-soul':11528,'linchpins':11530,'neophytes':11531,'planet-metal':11532,'gem-masters':11529,'precious-metal-gems':11533,'scope-samples':307220,'scope-panels':307221}
SIDS={'base':1314,'drew-autograph':1314,**FAMILY_IDS}
SUFFIXES={'base':'','precious-metal-gems':'','gem-masters':'','neophytes':' NP','boyz-with-the-wood':' BW','planet-metal':' PM','diamond-soul':'DS','linchpins':'LP'}
EXPECTED_IDS={k:{str(n)+SUFFIXES[k] for n in range(1,c+1)} if k!='drew-autograph' else {'SAMPLE'} for k,c in EXPECTED_COUNTS.items()}
TAGS=r'(?:RC|FLY|BB|MLPD|CL|AU|SAM|LL|AS|SN\d+)'
TRAILING=re.compile(r'\s+('+TAGS+r'(?:,?\s+'+TAGS+r')*)$',re.I)

def require(condition,message):
    if not condition:raise ValueError(message)

def split_label(label):
    label=' '.join(label.split());match=TRAILING.search(label)
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
    return [r for r in rows if re.match(r'^(?:\d+(?: [A-Z]+)?|SAMPLE)\s',r)]

def cc_rows(raw):
    part=raw[raw.index('1999 Metal Universe Baseball PMG Checklist'):]
    part=part[:part.index('<h3',1)]
    plain=html.unescape(re.sub('<[^>]+>','\n',part))
    out=[]
    for line in plain.splitlines():
        match=re.fullmatch(r'\s*(\d+)\s+(.+?) - (.+?)\s*',line)
        if match:out.append(list(match.groups()))
    require(len(out)==300,'Independent 300-card PMG guide changed')
    return out

def scope_rows(raw):
    observed=set(map(int,re.findall(r'href="/Checklist.cfm/sid/(\d+)/',raw)))-{1314}
    require(observed==set(FAMILY_IDS.values()),'Related-family inventory changed: '+repr(observed))
    require(parse(raw,1314)==[['SAMPLE','J.D. Drew AU, SN35','St. Louis Cardinals','']],'Pack autograph source changed')
    return [[key,sid] for key,sid in FAMILY_IDS.items()]

def refresh_sources(snapshot):
    from concurrent.futures import ThreadPoolExecutor
    changed=copy.deepcopy(snapshot)
    urls=sorted({entry['url'].split('#',1)[0] for entry in changed['sources'].values()})
    with ThreadPoolExecutor(max_workers=4) as pool:cache=dict(zip(urls,pool.map(fetch,urls)))
    for key,entry in changed['sources'].items():
        raw=cache[entry['url'].split('#',1)[0]]
        if key.startswith('bcp-'):rows=independent_rows(raw,key.removeprefix('bcp-'))
        elif key=='cc-pmg':rows=cc_rows(raw)
        elif key=='scope-index':rows=scope_rows(raw)
        else:
            rows=parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',entry['url'])[1]))
            if key=='rookies':
                require('Rookie Cards' in raw and '0 record(s)' in raw,'Empty rookie source must explicitly report zero')
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
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid source provenance: '+key)
    return entry['records']

def normalized(name):
    aliases={'Dave Justice':'David Justice','Bob Higginson':'Bobby Higginson','Bob Abreu':'Bobby Abreu','Dennis Reyes':'Dennys Reyes'}
    return re.sub('[^a-z0-9]','',aliases.get(name,name).lower())

def subset_for(n):
    if 233<=n<=247:return 'Caught on the Fly','FLY'
    if 248<=n<=272:return 'Building Blocks','BB'
    if 273<=n<=297:return 'MLPD','MLPD'
    if 298<=n<=300:return 'Checklist','CL'
    return '',''

def raw_family(snapshot,key):
    pages=[f'{key}-{i}' for i in [1,2,3]] if key in {'base','precious-metal-gems','gem-masters'} else [key]
    for page in pages:require(int(re.search(r'/sid/(\d+)/',snapshot['sources'][page]['url'])[1])==SIDS[key],'Wrong source namespace: '+page)
    rows=[r for page in pages for r in records(snapshot,page)]
    require(len(rows)==EXPECTED_COUNTS[key],'Incomplete source family: '+key)
    return rows

def row_for(key,number,label,team,note):
    name,tags=split_label(label);subset='';notes=[note] if note else []
    require('RC' not in tags,'No true RC independently verified in this issue: '+label)
    if key in {'base','precious-metal-gems','gem-masters'}:
        n=int(number);subset,tag=subset_for(n)
        require(tags.intersection({'FLY','BB','MLPD','CL'})==({tag} if tag else set()),'Subset/tag range mismatch '+key+' #'+number)
        run=50 if key=='precious-metal-gems' else 1 if key=='gem-masters' else None
        expected=({tag} if tag else set())|({f'SN{run}'} if run else set())
        require(tags==expected,'Unverified attributes/serial run '+key+' #'+number)
        if run:notes.append('One of one; Gem Masters' if run==1 else 'Serial numbered /50')
    elif key=='drew-autograph':
        require(number=='SAMPLE' and name=='J.D. Drew' and team=='St. Louis Cardinals' and tags=={'AU','SN35'},'Wrong pack-issued autograph: do not substitute /325 promo')
        notes.append('Autograph; hand numbered /35; embossed SkyBox authentication seal')
    else:
        require(not tags,'Unexpected insert attribute: '+label)
        if key=='neophytes' and number=='7 NP':
            require(name=='Paul Konerko' and team=='Chicago White Sox','Reviewed Konerko insert affiliation changed')
            notes.append('Cincinnati Reds uniform; Chicago White Sox affiliation')
        if key=='boyz-with-the-wood':notes.append('Foldable card; original packed-out form')
        if key=='planet-metal':notes.append('Holographic foil; die-cut')
        if key=='diamond-soul':notes.append('Lenticular')
        if key=='linchpins':notes.append('Die-cut')
    require(name and not re.search(r'\b(?:FLY|BB|MLPD|CL|AU|SN\d+)\b',name),'Unclean display name: '+name)
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
            match=re.fullmatch(r'(SAMPLE|\d+(?: [A-Z]{2})?)\s+(.+)',raw)
            require(bool(match),'Unparsed independent row: '+raw)
            number,subject=match.groups()
            if key in {'diamond-soul','linchpins'}:number=number.replace(' ','')
            require(number not in seen and number in by_key[key],'Independent numbering mismatch: '+raw);seen.add(number)
            if key=='drew-autograph':
                require(subject=='J.D. Drew 35','Independent autograph run changed');subject='J.D. Drew'
            require(normalized(subject)==normalized(by_key[key][number][2]),f'Independent name mismatch {key} #{number}: {subject!r} vs {by_key[key][number][2]!r}')
    require(not any(re.search(r'\sRC\*?$',r) for r in records(snapshot,'bcp-base')),'Independent RC marks changed')
    base=by_key['base']
    cc=records(snapshot,'cc-pmg')
    require(len(cc)==len({r[0] for r in cc})==300 and {r[0] for r in cc}==set(base),'Independent team listing incomplete')
    for number,name,team in cc:
        team_name,team_tags=split_label(team);row=base[number]
        require(normalized(name)==normalized(row[2]) and team_name==row[3],'Independent number/player/team mismatch #'+number)
        require(team_tags==({subset_for(int(number))[1]} if subset_for(int(number))[1] else set()),'Independent subset mismatch #'+number)
    for key in PARALLELS:
        for number,row in by_key[key].items():
            parent=base[number]
            require(normalized(row[2])==normalized(parent[2]) and row[3:5]==parent[3:5],'Parallel player/team/subset mismatch '+key+' #'+number)
    subjects={normalized(r[2]):r[3] for r in base.values()}
    for key in ['neophytes','boyz-with-the-wood','planet-metal','diamond-soul','linchpins']:
        for row in by_key[key].values():
            if key=='neophytes' and row[1] in {'3 NP','4 NP','5 NP'}:
                # These three subjects are not in the numbered base checklist.
                require((row[2],row[3]) in {('Scott Elarton','Houston Astros'),('Ricky Ledee','New York Yankees'),('Richard Hidalgo','Houston Astros')},'Non-base insert team anchor failed')
            elif key=='neophytes' and row[1]=='7 NP':require(row[3]=='Chicago White Sox','Konerko insert team mismatch')
            else:require(subjects.get(normalized(row[2]))==row[3],'Insert/base team mismatch '+key+' #'+row[1])

def validate(bundle,snapshot,cards):
    require(snapshot['schemaVersion']==1,'Invalid source schema')
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and bundle['product']['released'] is False,'Must remain unreleased DRAFT')
    require(bundle['product']['id']=='1999_Metal_Universe_Baseball' and bundle['product']['year']==1999 and bundle['product']['sport']=='Baseball','Wrong product identity')
    require(bundle['product']['cardsPerPack']==8 and bundle['product']['packsPerBox']==24,'Wrong Hobby pack configuration')
    require(bundle['review']['teamData']=='COMPLETE' and bundle['review']['checklistScope']=='PENDING_THREE_DISPUTED_PMG_CHECKLIST_CARDS','Scope/team review cannot silently clear')
    require(bundle['review']['insertOdds']=='PENDING_UNKNOWN_PMG_GEM_MASTERS_AUTOGRAPH_ODDS','Unknown odds cannot silently clear')
    specs=bundle['productSets']
    require(len(specs)==len({s['id'] for s in specs})==9 and {s['key'] for s in specs}==set(EXPECTED_COUNTS),'Wrong collector-family inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==968,'Expected 968 unique explicit cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(spec['sourceSetId']==SIDS[key],'Manifest source namespace mismatch')
        require(len(rows)==spec['expectedCards']==EXPECTED_COUNTS[key] and {r[1] for r in rows}==EXPECTED_IDS[key],'Incomplete/duplicate current-source family: '+key)
        require(spec.get('oddsPerPack')==EXPECTED_ODDS[key],'Unverified set odds: '+key)
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key in PARALLELS else 'INSERT'),'Wrong set kind: '+key)
    require(not records(snapshot,'rookies') and not any(r[2].endswith(' RC') for r in cards),'True rookie audit changed')
    base={r[1]:r for r in cards if r[0]=='base'}
    for n,name,team in [('1','Mark McGwire','St. Louis Cardinals'),('21','David Ortiz','Minnesota Twins'),('111','Paul Konerko','Cincinnati Reds'),('139','Randy Johnson','Houston Astros'),('195','Mike Piazza','New York Mets'),('197','Mo Vaughn','Boston Red Sox'),('206','Roger Clemens','Toronto Blue Jays'),('269','J.D. Drew','St. Louis Cardinals'),('298','Ken Griffey Jr.','Seattle Mariners'),('299','Kerry Wood','Chicago Cubs'),('300','Alex Rodriguez','Seattle Mariners')]:require(base[n][2:4]==[name,team],'Number/name/team anchor failed #'+n)
    for key in ['base','gem-masters','precious-metal-gems']:
        for subset,numbers in [('Caught on the Fly',range(233,248)),('Building Blocks',range(248,273)),('MLPD',range(273,298)),('Checklist',range(298,301) if key!='precious-metal-gems' else [])]:
            require({int(r[1]) for r in cards if r[0]==key and r[4]==subset}==set(numbers),'Subset inventory mismatch '+key+' '+subset)
    require(all(r[3] for r in cards),'Every source-catalogued card in this draft has an actual team')
    require(records(snapshot,'scope-index')==[[k,v] for k,v in FAMILY_IDS.items()],'Related-family scope changed')
    samples=records(snapshot,'scope-samples');panels=records(snapshot,'scope-panels')
    require(len(samples)==7 and len(panels)==2,'Promo exclusion scope changed')
    require(sum('SN325' in label for _,label,_,_ in samples)==1 and sum('SN325' in label for _,label,_,_ in panels)==1,'Promo /325 distinction changed')
    disputed=snapshot['disputedCards']
    require([(r['setKey'],r['cardNumber'],r['subject'],r['team'],r['status']) for r in disputed]==[('precious-metal-gems','298','Ken Griffey Jr.','Seattle Mariners','EXCLUDED_PENDING_EVIDENCE'),('precious-metal-gems','299','Kerry Wood','Chicago Cubs','EXCLUDED_PENDING_EVIDENCE'),('precious-metal-gems','300','Alex Rodriguez','Seattle Mariners','EXCLUDED_PENDING_EVIDENCE')],'Disputed inventory cannot silently clear')
    for row in cards:
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid CSV format')
        require(not re.search(r'\b1\s*:\s*\d+|Inserted .*pack',row[5],re.I),'Set odds leaked into variant')
    evidence=snapshot['reviewedScanEvidence']
    require({x['key'] for x in evidence}=={'pack','box','box-side','gem-masters-0','gem-masters-1','precious-metal-gems-0','precious-metal-gems-1','neophytes-0','neophytes-1','base-3-0','base-3-1'},'Reviewed scan inventory changed')
    for entry in evidence:require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']),'Invalid scan provenance')
    verify_independent(snapshot,cards)

def assemble(bundle,snapshot):
    cards=[]
    for spec in bundle['productSets']:
        key=spec['key']
        for number,label,team,note in raw_family(snapshot,key):cards.append(row_for(key,number,label,team,note))
    validate(bundle,snapshot,cards)
    return cards

def self_test(bundle,snapshot):
    for raw,expected in [('Ken Boswell','Ken Boswell'),('Marshall','Marshall'),('Jim Hall','Jim Hall'),('John Marshall LL','John Marshall'),('Jim Hall CL','Jim Hall'),('Ken Boswell LL','Ken Boswell')]:require(clean_name(raw)==expected,'Whole-token cleanup damaged a name')
    raw='<tr><td><a href="/ViewCard.cfm/sid/1314/cid/1">269</a></td><td>J.D. Drew BB<figcaption>Caption without separator</figcaption></td><td>St. Louis Cardinals</td></tr>'
    require(parse(raw,1314)==[['269','J.D. Drew BB','St. Louis Cardinals','Caption without separator']],'Caption separation failed')
    for num in ['1 NP','15 BW','1 PM','15DS','10LP','SAMPLE']:
        require(parse(raw.replace('>269<','>'+num+'<'),1314)[0][0]==num,'Suffix/SAMPLE parser failed')
    for invalid in [raw.replace('/sid/1314/','/sid/9999/'),raw.replace('>269<','>UNKNOWN<')]:
        try:parse(invalid,1314)
        except ValueError:pass
        else:raise ValueError('Parser accepted wrong namespace/unparsed linked row')
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-3']['records'].pop()),
        ('duplicate base',lambda s:s['sources']['base-2']['records'][0].__setitem__(0,'1')),
        ('wrong identity',lambda s:s['sources']['base-1']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong historical team',lambda s:s['sources']['base-2']['records'][38].__setitem__(2,'Arizona Diamondbacks')),
        ('missing player team',lambda s:s['sources']['base-1']['records'][0].__setitem__(2,'')),
        ('wrong subset',lambda s:s['sources']['base-3']['records'][32].__setitem__(1,'Ken Griffey, Jr. BB')),
        ('false RC',lambda s:s['sources']['base-3']['records'][68].__setitem__(1,'J.D. Drew BB, RC')),
        ('false rookie index',lambda s:s['sources']['rookies']['records'].append(['269','J.D. Drew RC','St. Louis Cardinals',''])),
        ('wrong PMG print run',lambda s:s['sources']['precious-metal-gems-1']['records'][0].__setitem__(1,'Mark McGwire SN99')),
        ('wrong Gem Masters run',lambda s:s['sources']['gem-masters-1']['records'][0].__setitem__(1,'Mark McGwire SN50')),
        ('missing Gem checklist',lambda s:s['sources']['gem-masters-3']['records'].pop()),
        ('fabricated disputed PMG',lambda s:s['sources']['precious-metal-gems-3']['records'].append(['298','Ken Griffey Jr. CL, SN50','Seattle Mariners',''])),
        ('wrong pack autograph',lambda s:s['sources']['drew-autograph']['records'][0].__setitem__(1,'J.D. Drew SAM, AU, SN325')),
        ('wrong Konerko affiliation',lambda s:s['sources']['neophytes']['records'][6].__setitem__(2,'Cincinnati Reds')),
        ('wrong namespace',lambda s:s['sources']['gem-masters-1'].__setitem__('url',s['sources']['precious-metal-gems-1']['url'])),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot);mutate(changed)
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption test accepted: '+name)
    print('PASS: all delivered card fields/parallel/RC/auto audits, source/parser boundaries and fifteen corruption tests')


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
    print(f'PASS: {len(cards)} catalogued cards / {len(bundle["productSets"])} collector sets / no verified base RCs; disputed PMG checklists / rare odds pending; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
