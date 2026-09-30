"""Build the combined 1997 Donruss Baseball Set Factory card CSV.

The numerical lists come from BaseballCardPedia. Team assignments are frozen in
the adjacent reviewed fixture, so regeneration never silently changes a card's
team when a live statistics source updates. No TCDB pages are fetched here.
"""

from __future__ import annotations

import argparse
import csv
from html import unescape
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/set-factory"
SOURCE = "https://baseballcardpedia.com/index.php/1997_Donruss"
OUT = DATA / "1997-donruss-baseball.cards.csv"
TEAMS = DATA / "1997-donruss-baseball.teams.json"
TRUE_ROOKIES = {166, 361, 364, 377, 379, 380, 384, 388, 394, 396}
BASE_SECTIONS = [
    ("Series_One_2", 1, 266), ("Checklists", 267, 270),
    ("Update_Series_2", 271, 352), ("Rookies", 353, 397),
    ("Hit_List", 398, 422), ("King_of_the_Hill", 423, 437),
    ("Interleague_Showdown", 438, 447), ("Checklists_2", 448, 450),
]
INSERT_SECTIONS = [
    ("rated-rookies", "Rated_Rookies", 30),
    ("diamond-kings", "Diamond_Kings", 10),
    ("elite-series", "Elite_Series", 12),
    ("armed-and-dangerous", "Armed_and_Dangerous", 15),
    ("long-ball-leaders", "Long_Ball_Leaders", 15),
    ("rocket-launchers", "Rocket_Launchers", 15),
    ("dominators", "Dominators", 20),
    ("rookie-diamond-kings", "Rookie_Diamond_Kings", 10),
    ("cal-ripken-the-only-way-i-know", "Cal_Ripken:_The_Only_Way_I_Know", 9),
    ("power-alley", "Die-Cut", 24),
    ("power-alley-die-cuts", "Die-Cut", 24),
    ("franchise-features", "Franchise_Features", 15),
]
# Series One Rated Rookies include prospects not in the base checklist. This
# ordered team list was checked against the linked 30-card insert checklist.
RATED_TEAMS = [
    "San Diego Padres", "Minnesota Twins", "Philadelphia Phillies",
    "Pittsburgh Pirates", "Detroit Tigers", "Baltimore Orioles",
    "Milwaukee Brewers", "Colorado Rockies", "Oakland Athletics",
    "Chicago Cubs", "Cincinnati Reds", "Chicago Cubs", "Detroit Tigers",
    "Montreal Expos", "Los Angeles Dodgers", "Detroit Tigers",
    "Chicago Cubs", "Florida Marlins", "Florida Marlins", "Atlanta Braves",
    "Cincinnati Reds", "Seattle Mariners", "Detroit Tigers",
    "California Angels", "Minnesota Twins", "California Angels",
    "Montreal Expos", "Los Angeles Dodgers", "Colorado Rockies",
    "Oakland Athletics",
]
NAME_FIXES = {
    "Ken Griffey, Jr.": "Ken Griffey Jr.",
    "Cal Ripken, Jr.": "Cal Ripken Jr.",
    "Jose Cruz, Jr.": "Jose Cruz Jr.",
    "Sandy Alomar, Jr.": "Sandy Alomar Jr.",
    "Wendell Magee, Jr.": "Wendell Magee Jr.",
    "Andres Gallaraga": "Andres Galarraga",
    "Mac Suzuki": "Makoto Suzuki",
}


def section(html: str, heading: str) -> list[tuple[int, str]]:
    marker = re.search(rf'<h[34] id="{re.escape(heading)}">', html)
    if not marker:
        raise ValueError(f"Missing source section: {heading}")
    content = html[marker.end():]
    next_heading = re.search(r'<h[234] id="', content)
    content = content[:next_heading.start()] if next_heading else content
    source_list = re.search(r'<ul style="list-style-type:none;">(.*?)</ul>', content, re.S)
    if not source_list:
        raise ValueError(f"Missing numerical list: {heading}")
    result = []
    for li in re.findall(r'<li>(.*?)</li>', source_list.group(1), re.S):
        value = unescape(re.sub(r'<[^>]*>', '', li)).strip()
        match = re.fullmatch(r'(\d+)\s+(.+)', value)
        if not match:
            raise ValueError(f"Bad {heading} entry: {value}")
        result.append((int(match.group(1)), match.group(2).strip()))
    return result


def clean(name: str) -> str:
    name = re.sub(r'\s+RC$', '', name)
    return ' / '.join(NAME_FIXES.get(piece.strip(), piece.strip()) for piece in name.split(' / '))


def subset_for(number: int) -> str:
    if number in {*range(267, 271), *range(448, 451)}:
        return 'Checklist'
    if 353 <= number <= 397:
        return 'Rookies'
    if 398 <= number <= 422:
        return 'Hit List'
    if 423 <= number <= 437:
        return 'King of the Hill'
    if 438 <= number <= 447:
        return 'Interleague Showdown'
    return ''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-html', type=Path, help='Previously saved BaseballCardPedia HTML')
    args = parser.parse_args()
    if args.source_html:
        html = args.source_html.read_text(encoding='utf-8')
    else:
        with urlopen(Request(SOURCE, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30) as response:
            html = response.read().decode('utf-8')

    teams = json.loads(TEAMS.read_text(encoding='utf-8'))
    if set(teams) != {str(n) for n in range(1, 451)}:
        raise ValueError('Team fixture must cover all 450 base numbers')
    base: dict[int, str] = {}
    for heading, start, end in BASE_SECTIONS:
        cards = section(html, heading)
        if [n for n, _ in cards] != list(range(start, end + 1)):
            raise ValueError(f'{heading}: expected consecutive #{start}-{end}')
        base.update((number, clean(name)) for number, name in cards)

    # Card-level team mapping follows the Series One or Update appearance,
    # because the same player can be pictured with different clubs in 1997.
    by_name: dict[str, list[tuple[int, str]]] = {}
    for number, name in base.items():
        if ' / ' not in name and teams[str(number)]:
            by_name.setdefault(name, []).append((number, teams[str(number)]))

    def insert_team(name: str, update: bool) -> str:
        if name.startswith('Cal Ripken') or name == 'Ripken Family':
            return 'Baltimore Orioles'
        parts = name.split(' / ')
        found = []
        for part in parts:
            if part in {'Little League Team', 'Cal Ripken Sr.', 'Billy Ripken'}:
                found.append('Baltimore Orioles')
                continue
            choices = by_name.get(part, [])
            series = [item for item in choices if (item[0] > 270) == update]
            choices = series or choices
            if not choices:
                raise ValueError(f'No team for insert subject: {part}')
            found.append((choices[-1] if update else choices[0])[1])
        return ' / '.join(found)

    rows: list[list[str]] = []
    def add(key: str, number: int, player: str, team: str, subset: str = '', variant: str = '') -> None:
        if not team and 'checklist' not in subset.lower() and 'checklist' not in player.lower():
            raise ValueError(f'Missing team: {key} #{number} {player}')
        rows.append([key, str(number), player, team, subset, variant])

    for number, name in sorted(base.items()):
        add('base', number, name + (' RC' if number in TRUE_ROOKIES else ''),
            teams[str(number)], subset_for(number))

    for key, heading, expected in INSERT_SECTIONS:
        cards = section(html, heading)
        if heading == 'Cal_Ripken:_The_Only_Way_I_Know':
            cards = cards[:9]  # #10 was distributed in a book, outside packs.
        if [n for n, _ in cards] != list(range(1, expected + 1)):
            raise ValueError(f'{heading}: expected consecutive 1-{expected}')
        for number, raw in cards:
            variant = ''
            if key == 'cal-ripken-the-only-way-i-know':
                raw = re.sub(r'\s+5000$', '', raw)
                variant = 'SN5000'
            if key.startswith('power-alley'):
                match = re.fullmatch(r'(.+)\s+(G|B|GR)', raw)
                if not match:
                    raise ValueError(f'Power Alley color missing: {raw}')
                raw, color = match.groups()
                color_name, printed = {'G': ('Gold', 1000), 'B': ('Blue', 2000), 'GR': ('Green', 4000)}[color]
                variant = f'{color_name}; SN{printed}; ' + ('die cut; copies 0001-0250' if key.endswith('die-cuts') else f'copies 0251-{printed:04d}')
            name = clean(raw)
            if key == 'rated-rookies':
                team = RATED_TEAMS[number - 1]
            else:
                team = insert_team(name, update=key in {
                    'dominators', 'rookie-diamond-kings', 'cal-ripken-the-only-way-i-know',
                    'power-alley', 'power-alley-die-cuts', 'franchise-features',
                })
            if key in {'diamond-kings', 'rookie-diamond-kings'}:
                variant = 'SN10000; copies 00501-10000'
            elif key in {'elite-series'}:
                variant = 'SN2500'
            elif key in {'armed-and-dangerous', 'long-ball-leaders', 'rocket-launchers'}:
                variant = 'SN5000'
            elif key == 'franchise-features':
                variant = 'SN3000'
            add(key, number, name, team, '', variant)

    if len(rows) != 649 or len(TRUE_ROOKIES) != 10:
        raise ValueError(f'Expected 649 explicit cards with ten true RCs; got {len(rows)}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8', newline='') as output:
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant'])
        writer.writerows(rows)
    print(f'Wrote {len(rows)} explicit cards to {OUT}')


if __name__ == '__main__':
    main()
