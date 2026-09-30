"""Rebuild the reviewed 1993 Topps Baseball Set Factory draft offline.

The numbered source fixture was transcribed from LastSticker and compared with
BaseballCardPedia/KeyMan. No website is contacted during generation.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
STEM = "1993-topps-baseball"
SOURCE = DATA / f"{STEM}.source.json"
CSV = DATA / f"{STEM}.cards.csv"
BUNDLE = DATA / f"{STEM}.bundle.json"

CLUBS = {
    "Angels": "California Angels", "Astros": "Houston Astros",
    "Athletics": "Oakland Athletics", "Blue Jays": "Toronto Blue Jays",
    "Braves": "Atlanta Braves", "Brewers": "Milwaukee Brewers",
    "Cardinals": "St. Louis Cardinals", "Cubs": "Chicago Cubs",
    "Dodgers": "Los Angeles Dodgers", "Expos": "Montreal Expos",
    "Giants": "San Francisco Giants", "Indians": "Cleveland Indians",
    "Mariners": "Seattle Mariners", "Marlins": "Florida Marlins",
    "Mets": "New York Mets", "Orioles": "Baltimore Orioles",
    "Padres": "San Diego Padres", "Phillies": "Philadelphia Phillies",
    "Pirates": "Pittsburgh Pirates", "Rangers": "Texas Rangers",
    "Red Sox": "Boston Red Sox", "Reds": "Cincinnati Reds",
    "Rockies": "Colorado Rockies", "Royals": "Kansas City Royals",
    "Tigers": "Detroit Tigers", "Twins": "Minnesota Twins",
    "White Sox": "Chicago White Sox", "Yankees": "New York Yankees",
}
SUFFIXES = sorted(CLUBS, key=len, reverse=True)
CHECKLISTS = {394: "1-132", 395: "133-264", 396: "265-396",
              823: "397-540", 824: "541-691", 825: "692-825"}
GOLD_REPLACEMENTS = {
    394: ("Bernardo Brito", "Minnesota Twins"),
    395: ("Jim McNamara", "San Francisco Giants"),
    396: ("Rich Sauveur", "Kansas City Royals"),
    823: ("Keith Brown", "Cincinnati Reds"),
    824: ("Russ McGinnis", "Texas Rangers"),
    825: ("Mike Walker", "Seattle Mariners"),
}
# Only individually verified subjects receive RC. Multi-player RC candidates
# are preserved without a blanket suffix until player-by-player review.
SINGLE_ROOKIES = set(map(int, """
46 56 98 118 126 132 145 158 191 197 215 269 307 320 334 353
419 422 432 438 447 454 459 461 468 479 481 483 486 489 518
523 530 538 543 559 569 574 586 593 594 606 612 613 623 627
632 646 647 649 651 667 669 687 690 691 697 702 706 723 732
735 738 743 767 774 787 799 800 801 803 804 807 810 812
816 818 821
""".split()))
ROOKIE_TEAM_CODES = """
46 Athletics,56 Reds,98 Yankees,118 Rangers,126 Phillies,132 Mets,
145 Dodgers,158 Royals,191 Cardinals,197 Rangers,215 Mets,269 Blue_Jays,
307 Twins,320 Angels,334 Pirates,353 Tigers,419 Rockies,422 Yankees,
432 Expos,438 Rangers,447 Rockies,454 Marlins,459 Cubs,461 Rockies,
468 Rangers,479 Phillies,481 Dodgers,483 Marlins,486 Rockies,489 Rockies,
518 Athletics,523 Rockies,530 Yankees,538 Padres,543 Angels,559 Braves,
569 Mariners,574 Angels,586 Marlins,593 Rockies,594 Yankees,606 Rockies,
612 White_Sox,613 Marlins,623 Pirates,627 Marlins,632 Mariners,646 Astros,
647 Orioles,649 Phillies,651 Dodgers,667 Giants,669 Marlins,687 Red_Sox,
690 Cardinals,691 Rockies,697 Marlins,702 Reds,706 Royals,723 Brewers,
732 Rockies,735 Royals,738 Rockies,743 Astros,767 Marlins,774 Rockies,
787 Indians,799 Angels,800 White_Sox,801 Indians,803 Royals,804 Brewers,
807 Athletics,810 Blue_Jays,812 Cubs,816 Expos,818 Phillies,821 Padres
"""
ROOKIE_TEAMS = {
    int(pair.strip().split(maxsplit=1)[0]): CLUBS[pair.strip().split(maxsplit=1)[1].replace("_", " ")]
    for pair in ROOKIE_TEAM_CODES.replace("\n", "").split(",") if pair.strip()
}
MULTI_ROOKIE_CANDIDATES = {423, 433, 441, 451, 476, 494, 497, 537,
    558, 576, 579, 599, 616, 621, 633, 641, 658, 661, 683, 704,
    726, 742, 746, 782, 786}
ALL_STARS = {
    401: ("Fred McGriff / Frank Thomas", "Padres White Sox"),
    402: ("Ryne Sandberg / Carlos Baerga", "Cubs Indians"),
    403: ("Gary Sheffield / Edgar Martinez", "Padres Mariners"),
    404: ("Barry Larkin / Travis Fryman", "Reds Tigers"),
    405: ("Andy Van Slyke / Ken Griffey Jr.", "Pirates Mariners"),
    406: ("Larry Walker / Kirby Puckett", "Expos Twins"),
    407: ("Barry Bonds / Joe Carter", "Pirates Blue Jays"),
    408: ("Darren Daulton / Brian Harper", "Phillies Twins"),
    409: ("Greg Maddux / Roger Clemens", "Cubs Red Sox"),
    410: ("Tom Glavine / Dave Fleming", "Braves Mariners"),
    411: ("Lee Smith / Dennis Eckersley", "Cardinals Athletics"),
}
PROSPECTS = {
    423: ("Ryan Klesko / Ivan Cruz / Bubba Smith / Larry Sutton", "Braves Tigers Mariners Royals", "First Basemen"),
    451: ("Ramon Caraballo / Jon Shave / Brent Gates / Quinton McCracken", "Rockies Braves Rangers Athletics", "Second Basemen"),
    494: ("Kevin Young / Adell Davenport / Eduardo Perez / Lou Lucca", "Pirates Giants Angels Marlins", "Third Basemen"),
    529: ("Dave Silvestri / Chipper Jones / Benji Gil / Jeff Patzke", "Yankees Braves Rangers Blue Jays", "Shortstops"),
    576: ("Darrell Sherman / Damon Buford / Cliff Floyd / Michael Moore", "Padres Orioles Expos Dodgers", "Outfielders"),
    616: ("Matt Mieske / Tracy Sanders / Midre Cummings / Ryan Freeburg", "Brewers Indians Pirates Rockies", "Outfielders"),
    658: ("Jeromy Burnitz / Melvin Nieves / Rich Becker / Shon Walker", "Mets Braves Twins Pirates", "Outfielders"),
    701: ("Mike Piazza / Brook Fordyce / Carlos Delgado / Donnie Leshnock", "Dodgers Mets Blue Jays Yankees", "Catchers"),
    742: ("Rene Arocha / Alan Embree / Brien Taylor / Tim Crabtree", "Cardinals Indians Yankees Blue Jays", "Pitchers"),
    786: ("Mike Christopher / Ken Ryan / Aaron Taylor / Gus Gandarillas", "Indians Red Sox Cubs Twins", "Relief Pitchers"),
}
FUTURE_STARS = {
    433: "Roger Bailey / Tom Schmidt", 441: "Don Lemon / Todd Pridy",
    476: "Mark Voisard / Will Scalzitti", 497: "Matt Petersen / Willie Brown",
    537: "Jason Hutchins / Ryan Turner", 558: "Ryan Whitman / Mark Skeels",
    579: "Neil Garrett / Jason Bates", 599: "Clemente Nunez / Daniel Robinson",
    621: "Mike Kotarski / Greg Boyd", 641: "Pat Leahy / Gavin Baugh",
    661: "Garvin Alston / Michael Case", 683: "Jerry Stafford / Eddie Christian",
    704: "Jon Goodrich / Danny Figueroa", 726: "Mike Veneziale / Ken Kendrena",
    746: "Mark Strittmatter / Lamarr Rogers", 782: "Reynol Mendoza / Dan Roman",
}
DRAFT_TEAMS = {
    33: "Expos", 56: "Reds", 98: "Yankees", 132: "Mets",
    161: "Phillies", 191: "Cardinals", 233: "Tigers",
    269: "Blue Jays", 307: "Twins", 334: "Pirates",
    438: "Rangers", 459: "Cubs", 481: "Dodgers",
    518: "Athletics", 538: "Padres", 559: "Braves",
    574: "Angels", 612: "White Sox", 632: "Mariners",
    647: "Orioles", 667: "Giants", 687: "Red Sox",
    706: "Royals", 723: "Brewers", 743: "Astros",
    767: "Marlins", 787: "Indians",
}
# Sources disagree on traded players' later club. These identify the club
# printed on the card, confirmed from the set checklist or individual listings.
TEAM_CORRECTIONS = {
    2: "Pirates", 7: "Astros", 290: "Athletics", 390: "Red Sox",
    720: "Blue Jays",
}
BLACK_GOLD = """
Barry Bonds|Will Clark|Darren Daulton|Andre Dawson|Delino DeShields|Tom Glavine|
Marquis Grissom|Tony Gwynn|Eric Karros|Ray Lankford|Barry Larkin|Greg Maddux|
Fred McGriff|Joe Oliver|Terry Pendleton|Bip Roberts|Ryne Sandberg|Gary Sheffield|
Lee Smith|Ozzie Smith|Andy Van Slyke|Larry Walker|Roberto Alomar|Brady Anderson|
Carlos Baerga|Joe Carter|Roger Clemens|Mike Devereaux|Dennis Eckersley|Cecil Fielder|
Travis Fryman|Juan Gonzalez|Ken Griffey Jr.|Brian Harper|Pat Listach|Kenny Lofton|
Edgar Martinez|Jack McDowell|Mark McGwire|Kirby Puckett|Mickey Tettleton|
Frank Thomas|Robin Ventura|Dave Winfield
""".replace("\n", "").split("|")
BLACK_GOLD_TEAMS = """
Pirates Giants Phillies Cubs Expos Braves Expos Padres Dodgers Cardinals Reds Cubs
Padres Reds Braves Reds Cubs Padres Cardinals Cardinals Pirates Expos
Blue_Jays Orioles Indians Blue_Jays Red_Sox Orioles Athletics Tigers Tigers Rangers
Mariners Twins Brewers Indians Mariners White_Sox Athletics Twins Tigers White_Sox
White_Sox Blue_Jays
""".split()


def row(key: str, number: str, player: str, team: str, subset: str = "", variant: str = "") -> dict[str, str]:
    if not player or (not team and "checklist" not in (player + subset).lower()):
        raise ValueError(f"Missing player/team in {key} #{number}: {player!r}, {team!r}")
    return dict(setKey=key, cardNumber=number, player=player, team=team,
                subset=subset, variant=variant)


def previous_clubs() -> dict[int, str]:
    """Reviewed earlier clubs from the 1992 Ultra checklist, stored offline."""
    path = DATA / f"{STEM}.early-teams.json"
    return {int(n): team for n, team in json.loads(path.read_text(encoding="utf-8")).items()}


def base_card(number: int, raw: str, previous: dict[int, str]) -> dict[str, str]:
    if number in CHECKLISTS:
        return row("base", str(number), "Checklist", "", "Checklist", f"Cards {CHECKLISTS[number]}")
    if number in ALL_STARS:
        name, codes = ALL_STARS[number]
        return row("base", str(number), name,
                   " / ".join(CLUBS[code.replace("_", " ")] for code in re.findall(
                       r"Blue Jays|Red Sox|White Sox|\w+", codes)),
                   "All-Stars")
    if number in PROSPECTS:
        name, codes, position = PROSPECTS[number]
        pattern = r"Blue Jays|Red Sox|White Sox|\w+"
        return row("base", str(number), name,
                   " / ".join(CLUBS[code] for code in re.findall(pattern, codes)),
                   "Top Prospects", position)
    if number in DRAFT_TEAMS:
        name = raw.split(" (Draft Pick)", 1)[0]
        return row("base", str(number), name + (" RC" if number in SINGLE_ROOKIES else ""),
                   CLUBS[DRAFT_TEAMS[number]], "Draft Picks")
    if number == 814:
        return row("base", "814", "Scooter Tucker", CLUBS["Astros"], "Coming Attractions")
    if number == 633:
        return row("base", "633", "Rudy Razjigaev / Eugneyi Puchkov / Ilya Bogatyrev",
                   CLUBS["Angels"], "Three Russians", "Pitching statistics header on Ilya Bogatyrev")
    if number in range(501, 515):
        match = re.fullmatch(r"Managers \((.*?)\) (.*?) / (.*)", raw)
        if not match:
            raise ValueError(f"Unparsed manager #{number}: {raw}")
        first, second = match.group(1).split(" / ")
        second = {"Jim Lefebure": "Jim Lefebvre", "Tom Lasorda": "Tommy Lasorda"}.get(second, second)
        first_club, second_club = match.group(2), match.group(3)
        return row("base", str(number), f"{first} / {second}",
                   f"{CLUBS[first_club]} / {CLUBS[second_club]}", "Managers")
    for suffix in SUFFIXES:
        if raw.endswith(" " + suffix):
            name = raw[:-(len(suffix) + 1)]
            club = CLUBS[suffix]
            break
    else:
        raise ValueError(f"Unparsed base card #{number}: {raw}")
    subset = ""
    if number in FUTURE_STARS:
        name, subset = FUTURE_STARS[number], "Future Stars"
    elif number in range(799, 823):
        subset = "Coming Attractions"
    if number <= 396 and " / " not in name:
        club = previous.get(number, club)
    if number in TEAM_CORRECTIONS:
        club = CLUBS[TEAM_CORRECTIONS[number]]
    if number in SINGLE_ROOKIES:
        club = ROOKIE_TEAMS[number]
        name += " RC"
    variant = 'Double-printed pitching record on back' if number == 96 else ""
    return row("base", str(number), name, club, subset, variant)


def product_set(key: str, name: str, kind: str, count: int, sid: int,
                odds: int | None, notes: str, **extra: object) -> dict:
    return dict(key=key, id="1993_Topps_Baseball_" + name.replace(" ", "_"),
                name=name, kind=kind, oddsPerPack=odds, defaultGradeability="COMMON",
                sourceUrl=f"https://www.tcdb.com/Checklist.cfm/sid/{sid}",
                expectedCards=count, notes=notes, **extra)


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    if set(map(int, source)) != set(range(1, 826)):
        raise ValueError("Base source must cover #1-825 without gaps")
    previous = previous_clubs()
    rows = [base_card(n, source[str(n)], previous) for n in range(1, 826)]
    for card in rows[:]:
        number = int(card["cardNumber"])
        if number in GOLD_REPLACEMENTS:
            name, team = GOLD_REPLACEMENTS[number]
            rows.append(row("gold", str(number), name, team, variant="Topps Gold"))
        else:
            rows.append(row("gold", str(number), card["player"], card["team"],
                            card["subset"], "Topps Gold"))
    for n, (name, code) in enumerate(zip(BLACK_GOLD, BLACK_GOLD_TEAMS, strict=True), 1):
        rows.append(row("black-gold", str(n), name, CLUBS[code.replace("_", " ")]))
    # Gold is derived from Base and its six checklist numbers overridden below.
    sets = [
        product_set("base", "Base", "BASE", 825, 291, None,
                    "Full #1-825 base checklist, Series One #1-396 and Series Two #397-825. One combined VCS checklist."),
        product_set("gold", "Gold", "PARALLEL", 825, 10327, 1,
                    "One per standard wax pack. Six numbered checklists are replaced by six player cards."),
        product_set("black-gold", "Black Gold", "INSERT", 44, 292, 72,
                    "One per 72 standard Hobby/Retail packs; #1-22 Series One and #23-44 Series Two."),
    ]
    bundle = {
        "schemaVersion": 2, "status": "DRAFT",
        "source": {
            "requestedUrl": "https://www.tcdb.com/ViewSet.cfm/sid/291/1993-Topps",
            "checklistUrl": "https://www.tcdb.com/Checklist.cfm/sid/291/1993-Topps",
            "rookiesUrl": "https://www.tcdb.com/Rookies.cfm/sid/291/1993-Topps",
            "insertsUrl": "https://www.tcdb.com/Inserts.cfm/sid/291/1993-Topps",
            "researchReferences": [
                "https://baseballcardpedia.com/index.php/1993_Topps",
                "https://keymancollectibles.com/baseballcards/1993toppsbaseballcardchecklist.htm",
                "https://www.laststicker.com/cards/topps_major_league_baseball_1993/",
            ],
            "note": "Offline source fixture; no automated TCDB extraction or image copying.",
        },
        "decisions": {
            "baseStructure": "One complete 825-card Base checklist. Both physical series are flattened into one equal-availability VCS ProductSet.",
            "canonicalPackFormat": "Four VCS cards per pack; 36 packs per box follows original standard wax distribution.",
            "goldHandling": "Gold is one complete 825-card parallel at 1:1 standard-pack odds, with six checklist substitutions.",
            "blackGoldHandling": "One 44-card Black Gold checklist at the standard 1:72 Hobby/Retail pack odds; series-specific ranges are combined.",
            "rookieNaming": "RC is appended to independently rookie-indexed individual cards. Multi-player RC subjects are pending player-by-player confirmation and have no blanket RC suffix.",
            "teamReconciliation": "LastSticker's later-player clubs were reconciled with the offline 1992 Ultra checklist for Series One and spot-checked against individual 1993 Topps listings. Multi-subject and draft-pick teams are explicitly curated. Final on-card team audit remains a release gate.",
            "excludedRelatedItems": "Inaugural Rockies/Marlins factory-only parallels, promotional samples, redeemed prizes, and expired Black Gold winner instruments are not pack-issued card checklists in this VCS draft.",
            "variationHandling": "Russ Swan #96 has its double-printed back text noted on Base. Print-code-only Terry Pendleton #650 is not split into a second completion card.",
            "releaseSafety": "Images, team spot checks, multi-player rookie labels, and pricing require review before release.",
        },
        "product": {
            "id": "1993_Topps_Baseball", "year": 1993, "brand": "Topps",
            "sport": "Baseball", "cardsPerPack": 4, "packsPerBox": 36,
            "packPriceCents": 0, "autoPackPricing": True,
            "packImageUrl": None, "boxImageUrl": None, "released": False,
        },
        "review": {
            "teamData": "COMPLETE", "packImage": "PENDING",
            "cardImages": "PENDING", "pricing": "PENDING", "release": "BLOCKED",
        },
        "cardsFile": CSV.name, "productSets": sets,
    }
    counts = Counter(r["setKey"] for r in rows)
    if counts != {"base": 825, "gold": 825, "black-gold": 44}:
        raise ValueError(f"Unexpected card counts: {counts}")
    if len(SINGLE_ROOKIES) != 78 or len(MULTI_ROOKIE_CANDIDATES) != 25 or set(ROOKIE_TEAMS) != SINGLE_ROOKIES:
        raise ValueError("Rookie source index changed")
    with CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=("setKey", "cardNumber", "player", "team", "subset", "variant"),
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    BUNDLE.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {CSV.name} ({len(rows)} explicit rows) and {BUNDLE.name}")


if __name__ == "__main__":
    main()
