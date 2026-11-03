"""Generate an offline 1974 Topps Baseball Set Factory draft.

The checked-in source fixture contains numbered checklist facts from the
1974 Topps checklist project, cross-checked with TCDB, BaseballCardPedia,
and KeyMan Collectibles. No website is contacted when this script runs.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
STEM = "1974-topps-baseball"
SOURCE = DATA / f"{STEM}.source.json"
CSV = DATA / f"{STEM}.cards.csv"
BUNDLE = DATA / f"{STEM}.bundle.json"

TEAM = dict(zip(
    "ATL BAL BOS ANA CHC CHW CIN CLE DET HOU KCR LAD MIL MIN MON NYM NYY OAK PHI PIT SDP SFG STL TEX MBR".split(),
    "Atlanta Braves|Baltimore Orioles|Boston Red Sox|California Angels|Chicago Cubs|Chicago White Sox|Cincinnati Reds|Cleveland Indians|Detroit Tigers|Houston Astros|Kansas City Royals|Los Angeles Dodgers|Milwaukee Brewers|Minnesota Twins|Montreal Expos|New York Mets|New York Yankees|Oakland Athletics|Philadelphia Phillies|Pittsburgh Pirates|San Diego Padres|San Francisco Giants|St. Louis Cardinals|Texas Rangers|Milwaukee Braves".split("|"),
))

# TCDB's 69 rookie-index records represent 63 unique numbers after the
# Washington and error/correction versions of several cards are collapsed.
ROOKIES = set(map(int, """
8 17 18 21 23 26 32 33 37 47 48 54 77 93 96 106 121 124 133 161
169 171 173 188 252 279 288 294 341 421 429 431 436 448 456 457
481 492 519 533 554 573 577 582 587 592 596 597 598 599 600 601
602 603 604 605 606 607 608 614 647 649 655
""".split()))
WASHINGTON = {32, 53, 77, 102, 125, 148, 173, 197, 226, 241, 250, 309, 364, 387, 599}
CHECKLISTS = {126, 263, 273, 414, 637}

# All names and clubs on multi-player cards are recorded in the order printed
# in the reviewed checklists. Statistic/game detail belongs in Variant.
FEATURES = {
    201: ("Rod Carew / Pete Rose", "MIN CIN", "League Leaders", "1973 Batting"),
    202: ("Reggie Jackson / Willie Stargell", "OAK PIT", "League Leaders", "1973 Home Runs"),
    203: ("Reggie Jackson / Willie Stargell", "OAK PIT", "League Leaders", "1973 Runs Batted In"),
    204: ("Tommy Harper / Lou Brock", "BOS STL", "League Leaders", "1973 Stolen Bases"),
    205: ("Ron Bryant / Wilbur Wood", "SFG CHW", "League Leaders", "1973 Wins"),
    206: ("Jim Palmer / Tom Seaver", "BAL NYM", "League Leaders", "1973 Earned Run Average"),
    207: ("Nolan Ryan / Tom Seaver", "ANA NYM", "League Leaders", "1973 Strikeouts"),
    208: ("John Hiller / Mike Marshall", "DET MON", "League Leaders", "1973 Leading Firemen"),
    331: ("Carlton Fisk / Johnny Bench", "BOS CIN", "All-Star", "Catchers"),
    332: ("Dick Allen / Hank Aaron", "CHW ATL", "All-Star", "First Basemen"),
    333: ("Rod Carew / Joe Morgan", "MIN CIN", "All-Star", "Second Basemen"),
    334: ("Brooks Robinson / Ron Santo", "BAL CHC", "All-Star", "Third Basemen"),
    335: ("Bert Campaneris / Chris Speier", "OAK SFG", "All-Star", "Shortstops"),
    336: ("Bobby Murcer / Pete Rose", "NYY CIN", "All-Star", "Left Fielders"),
    337: ("Cesar Cedeno / Amos Otis", "HOU KCR", "All-Star", "Center Fielders"),
    338: ("Reggie Jackson / Billy Williams", "OAK CHC", "All-Star", "Right Fielders"),
    339: ("Jim Hunter / Rick Wise", "OAK STL", "All-Star", "Pitchers"),
    470: ("Reggie Jackson", "OAK", "League Championship Series", "1973 American League Playoffs"),
    471: ("Jerry Koosman", "NYM", "League Championship Series", "1973 National League Playoffs"),
    472: ("Darold Knowles", "OAK", "World Series", "1973 Game 1"),
    473: ("Willie Mays", "NYM", "World Series", "1973 Game 2"),
    474: ("Bert Campaneris", "OAK", "World Series", "1973 Game 3"),
    475: ("Ray Fosse / Rusty Staub", "OAK NYM", "World Series", "1973 Game 4"),
    476: ("Ray Fosse / Jerry Grote / Cleon Jones", "OAK NYM NYM", "World Series", "1973 Game 5"),
    477: ("Reggie Jackson", "OAK", "World Series", "1973 Game 6"),
    478: ("Bert Campaneris", "OAK", "World Series", "1973 Game 7"),
    479: ("Ray Fosse / Darold Knowles", "OAK OAK", "World Series", "1973 Champions"),
    596: ("Wayne Garland / Fred Holdsworth / Mark Littell / Dick Pole", "BAL DET KCR BOS", "Rookie Prospects", "Pitchers"),
    597: ("Dave Chalk / John Gamble / Pete Mackanin / Manny Trillo", "ANA DET TEX OAK", "Rookie Prospects", "Shortstops"),
    598: ("Dave Augustine / Ken Griffey / Steve Ontiveros / Jim Tyrone", "PIT CIN SFG CHC", "Rookie Prospects", "Outfielders"),
    599: ("Ron Diorio / Dave Freisleben / Frank Riccelli / Greg Shanahan", "PHI SDP SFG LAD", "Rookie Prospects", "Pitchers; small San Diego type"),
    600: ("Ron Cash / Jim Cox / Bill Madlock / Reggie Sanders", "DET MON CHC DET", "Rookie Prospects", "Infielders"),
    601: ("Ed Armbrister / Rich Bladt / Brian Downing / Bake McBride", "CIN NYY CHW STL", "Rookie Prospects", "Outfielders"),
    602: ("Glenn Abbott / Rick Henninger / Craig Swan / Dan Vossler", "OAK TEX NYM MIN", "Rookie Prospects", "Pitchers"),
    603: ("Barry Foote / Tom Lundstedt / Charlie Moore / Sergio Robles", "MON CHC MIL BAL", "Rookie Prospects", "Catchers"),
    604: ("Terry Hughes / John Knox / Andy Thornton / Frank White", "STL DET CHC KCR", "Rookie Prospects", "Infielders"),
    605: ("Vic Albury / Ken Frailing / Kevin Kobel / Frank Tanana", "MIN CHW MIL ANA", "Rookie Prospects", "Pitchers"),
    606: ("Jim Fuller / Wilbur Howard / Tommy Smith / Otto Velez", "BAL MIL CLE NYY", "Rookie Prospects", "Outfielders"),
    607: ("Leo Foster / Tom Heintzelman / Dave Rosello / Frank Taveras", "ATL STL CHC PIT", "Rookie Prospects", "Shortstops"),
    608: ("Bob Apodaca / Dick Baney / John D'Acquisto / Mike Wallace", "NYM CIN SFG PHI", "Rookie Prospects", 'Pitchers; printed "Apodaco" error'),
}

# 43 numbered Traded cards plus the unnumbered Traded checklist. Teams are
# the destinations shown on the Traded cards, not the base card teams.
TRADED = """
23 ATL,42 HOU,43 LAD,51 STL,59 BAL,62 OAK,63 NYY,73 LAD,123 KCR,
139 PHI,151 BOS,165 MON,175 BOS,182 KCR,186 HOU,249 CHC,262 PIT,
269 CLE,270 CHW,313 ATL,319 MIN,330 BOS,348 STL,373 STL,390 NYY,
428 DET,454 PIT,458 DET,485 MIL,486 CHC,496 MIL,516 CHC,534 PHI,
538 TEX,544 PHI,579 CLE,585 CIN,612 DET,616 TEX,618 NYY,630 LAD,
648 TEX,649 KCR
"""

TEAM_CHECKLIST_ORDER = "ATL BAL BOS ANA CHC CHW CIN CLE DET HOU KCR LAD MIL MIN MON NYM NYY OAK PHI PIT SDP SFG STL TEX".split()


def row(key: str, number: str, player: str, team: str, subset: str, variant: str = "") -> dict[str, str]:
    if not team and "checklist" not in (player + " " + subset).lower():
        raise ValueError(f"Missing team: {key} #{number} {player}")
    return dict(setKey=key, cardNumber=number, player=player, team=team, subset=subset, variant=variant)


def base_card(number: int, raw: str) -> dict[str, str]:
    if number in FEATURES:
        player, codes, subset, variant = FEATURES[number]
        team = " / ".join(TEAM[code] for code in codes.split())
    elif number in CHECKLISTS:
        player, team, subset, variant = "Checklist", "", "Checklist", raw.replace("Checklist", "Cards", 1)
    else:
        parts = raw.split(" -- ")
        if len(parts) != 2:
            raise ValueError(f"Unparsed source #{number}: {raw}")
        player, team = parts[0].strip(), parts[1].strip().removeprefix("with the ")
        subset, variant = "", ""
        if 1 <= number <= 6:
            player, subset = "Hank Aaron", "Hank Aaron Special"
            variant = "New All-Time Home Run King" if number == 1 else parts[0].replace("Hank Aaron Special ", "")
        elif "Mgr." in player or "Coaches" in player or "Mgr" in player:
            player, subset = team + " Manager and Coaches", "Manager and Coaches"
        elif player.endswith(" Team"):
            player, subset = team, "Team Card"
        elif number == 608:
            variant = 'Printed "Apodaco" error'
        elif number == 654:
            variant = "No position on front"
    if number in ROOKIES:
        player += " RC"
    return row("base", str(number), player, team, subset, variant)


def product_set(key: str, name: str, kind: str, count: int, url: str, notes: str, **extra):
    return dict(key=key, id="1974_Topps_Baseball_" + name.replace(" ", "_"), name=name,
                kind=kind, oddsPerPack=None, defaultGradeability="COMMON",
                sourceUrl=url, expectedCards=count, notes=notes, **extra)


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    if {int(n) for n in source} != set(range(1, 661)) or len(ROOKIES) != 63 or len(WASHINGTON) != 15:
        raise ValueError("Base, rookie, or Washington variation checklist count changed")
    rows = [base_card(n, source[str(n)]) for n in range(1, 661)]
    by_number = {int(card["cardNumber"]): card for card in rows}

    for number in sorted(WASHINGTON):
        card = by_number[number]
        if TEAM["SDP"] not in card["team"]:
            raise ValueError(f"Washington variant #{number} does not include San Diego")
        rows.append(row("washington", str(number), card["player"], card["team"],
                        card["subset"], "Washington Nat'l Lea. team-name variation"))
    for number, variant in ((599, 'Large "San Diego Padres" type'),
                            (608, 'Corrected "Apodaca" spelling'),
                            (654, "Position on front")):
        card = by_number[number]
        rows.append(row("base-variations", str(number), card["player"], card["team"], card["subset"], variant))

    for index, code in enumerate(TEAM_CHECKLIST_ORDER, start=1):
        team = TEAM[code]
        rows.append(row("team-checklists", f"NNO-{index:02d}", f"{team} Checklist", team,
                        "Team Checklist", "One asterisk before copyright"))
    traded = {}
    for piece in TRADED.replace("\n", "").split(","):
        if piece.strip():
            number, code = piece.strip().split()
            traded[int(number)] = TEAM[code]
    if len(traded) != 43:
        raise ValueError(f"Expected 43 numbered Traded cards, got {len(traded)}")
    for number, team in sorted(traded.items()):
        card = by_number[number]
        rows.append(row("traded", f"{number}T", card["player"].removesuffix(" RC"), team, "Traded"))
    rows.append(row("traded", "NNO", "Checklist", "", "Traded Checklist"))

    sets = [
        product_set("base", "Base", "BASE", 660,
                    "https://www.tcdb.com/Checklist.cfm/sid/74/1974-Topps",
                    "Complete #1-660 single-series base checklist; equal base-card availability."),
        product_set("washington", "Washington Variations", "PARALLEL", 15,
                    "https://www.tcdb.com/Errors.cfm/sid/74/1974-Topps",
                    "15 San Diego Padres-related cards printed with Washington Nat'l Lea. team name. #456 Dave Winfield is not among them."),
        product_set("base-variations", "Base Variations", "PARALLEL", 3,
                    "https://www.tcdb.com/Errors.cfm/sid/74/1974-Topps",
                    "#599 larger San Diego type, #608 corrected Apodaca spelling, and #654 position on front. Base retains the other printing of each."),
        product_set("team-checklists", "Team Checklists", "INSERT", 24,
                    "https://www.tcdb.com/Checklist.cfm/sid/10108/1974-Topps-Team-Checklists",
                    "24 unnumbered red-border team checklists. Synthetic NNO-01 through NNO-24 preserve uniqueness; one-asterisk backs."),
        product_set("team-checklists-two-stars", "Team Checklists Two Stars", "PARALLEL", 24,
                    "https://www.tcdb.com/Checklist.cfm/sid/10108/1974-Topps-Team-Checklists",
                    "Same 24 teams with two asterisks before the copyright line.",
                    deriveCardsFrom="team-checklists", derivedVariant="Two asterisks before copyright"),
        product_set("traded", "Traded", "INSERT", 44,
                    "https://www.tcdb.com/Checklist.cfm/sid/75/1974-Topps---Traded",
                    "43 T-suffixed cards with destination clubs plus one unnumbered Traded Checklist; late-run packs and catalog factory set."),
    ]
    if len(rows) != 746 or sum(s["expectedCards"] for s in sets) != 770:
        raise ValueError("Resolved card totals differ from 660+15+3+24+24+44")
    with CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["setKey", "cardNumber", "player", "team", "subset", "variant"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    bundle = dict(
        schemaVersion=2, status="DRAFT",
        source=dict(requestedUrl="https://www.tcdb.com/ViewSet.cfm/sid/74/1974-Topps",
                    checklistUrl="https://www.tcdb.com/Checklist.cfm/sid/74/1974-Topps",
                    rookiesUrl="https://www.tcdb.com/Rookies.cfm/sid/74/1974-Topps",
                    insertsUrl="https://www.tcdb.com/Inserts.cfm/sid/74/1974-Topps",
                    researchReferences=["https://baseballcardpedia.com/index.php/1974_Topps",
                                        "https://1974topps.blogspot.com/p/checklist.html",
                                        "https://keymancollectibles.com/baseballcards/1974toppsbaseballcardchecklist.htm"],
                    note="Offline, reviewed checklist facts; no image copying or automated TCDB retrieval."),
        decisions=dict(baseStructure="One 660-card base ProductSet; all base cards equally available in the VCS pack.",
                       canonicalPackFormat="Four cards per VCS pack, 36 packs per box, following the original wax-box format for box count.",
                       packChannelAbstraction="Specially marked team-checklist packs and late-run Traded distribution are combined into one VCS draft. Their canonical VCS odds require review and are null.",
                       rookieNaming="RC labels appear only on the 63 unique TCDB rookie-indexed base numbers; shared rookie cards receive one RC label per card.",
                       variationHandling="Fifteen Washington-name cards and three other base printing variations live outside Base, preserving 660-card base completion. The two team-checklist back variants are separate ProductSets.",
                       checklistHandling="Five numbered base checklists and the Traded Checklist have clean Checklist subjects. Team checklists use synthetic stable NNO numbers and explicit teams.",
                       excludedRelatedItems="Topps Vault file copies, Canadian O-Pee-Chee, stamps, wrapper offers, and the catalog factory-set packaging are excluded.",
                       releaseSafety="Images, pricing, and canonical mixed-pack odds must be reviewed before release."),
        product=dict(id="1974_Topps_Baseball", year=1974, brand="Topps", sport="Baseball",
                     cardsPerPack=4, packsPerBox=36, packPriceCents=0, autoPackPricing=True,
                     packImageUrl=None, boxImageUrl=None, released=False),
        review=dict(teamData="COMPLETE", rookieData="VERIFIED_AFTER_GENERATION", packImage="PENDING",
                    cardImages="PENDING", pricing="PENDING", release="BLOCKED"),
        cardsFile=CSV.name, productSets=sets,
    )
    BUNDLE.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} explicit, {sum(s['expectedCards'] for s in sets)} resolved cards in {len(sets)} ProductSets")


if __name__ == "__main__":
    main()
