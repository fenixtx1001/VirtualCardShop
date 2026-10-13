# 1994 Topps Baseball — player-level rookie QA

**Status: BLOCKS RELEASE, not draft import.** Verified Oct 13, 2026, from generator's successful checklist run.

The 1,668-card Set Factory checklist successfully generated and passed database dry run. The 1994 Topps base checklist contains **115 distinct rookie-index card numbers** after print variants collapse. The following **24 multi-player cards** appear in TCDB's rookie index, but the generator's captured Base checklist row does not specify which pictured players are the rookies. Do not label every pictured player RC; obtain source-confirmed player-level designations before releasing.

| Printed card number | Base subject | Next action |
|---:|---|---|
| 79 | OF Prospects (Billy Masse / Stanton Cameron / Tim Clark / Craig McClure) | Player-specific RC(s) unverified |
| 237 | OF Prospects (Curtis Pride / Shawn Green / Mark Sweeney / Eddie Davis) | Player-specific RC(s) unverified |
| 316 | P Prospects (Chad Ogea / Duff Brumley / Terrell Wade / Chris Michalak) | Player-specific RC(s) unverified |
| 369 | 3B Prospects (Luis Ortiz / David Bell / Jason Giambi / George Arias) | Player-specific RC(s) unverified |
| 527 | 2B Prospects (Norberto Martin / Ruben Santana / Jason Hardtke / Chris Sexton) | Player-specific RC(s) unverified |
| 713 | P Prospects (Todd Williams / Ron Watson / Kirk Bullinger / Mike Welch) | Player-specific RC(s) unverified |
| 763 | John O'Donoghue / Mike Oquist | Player-specific RC(s) unverified |
| 764 | Cory Bailey / Scott Hatteberg | Player-specific RC(s) unverified |
| 765 | Mark Holzemer / Paul Swingle | Player-specific RC(s) unverified |
| 767 | Jerry DiPoto / Julian Tavarez | Player-specific RC(s) unverified |
| 768 | Danny Bautista / Sean Bergman | Player-specific RC(s) unverified |
| 769 | Bob Hamelin / Joe Vitiello | Player-specific RC(s) unverified |
| 770 | Mark Kiefer / Troy O'Leary | Player-specific RC(s) unverified |
| 771 | Denny Hocking / Oscar Munoz | Player-specific RC(s) unverified |
| 772 | Russ Davis / Brien Taylor | Player-specific RC(s) unverified |
| 773 | Kurt Abbott / Miguel Jimenez | Player-specific RC(s) unverified |
| 774 | Kevin King / Erik Plantenberg | Player-specific RC(s) unverified |
| 775 | Jon Shave / Desi Wilson | Player-specific RC(s) unverified |
| 776 | Domingo Cedeno / Paul Spoljaric | Player-specific RC(s) unverified |
| 778 | Steve Trachsel / Turk Wendell | Player-specific RC(s) unverified |
| 779 | Johnny Ruffin / Jerry Spradlin | Player-specific RC(s) unverified |
| 780 | Jason Bates / John Burke | Player-specific RC(s) unverified |
| 782 | Gary Mota / James Mouton | Player-specific RC(s) unverified |
| 783 | Raul Mondesi / Ben Van Ryn | Player-specific RC(s) unverified |

## Already-handled exceptions
- #158 prospects: only **Mike Neal** is a rookie, not Derek Jeter; TCDB note is applied.
- #448, #616, #686 and #786–790 have TCDB notes identifying the particular rookie(s); these are handled by the generator.
- #766, #777, #781, #784 and #785 explicitly say *not a rookie for either player* and are not labeled RC.
- No phantom #379. Benny Santiago and Mark McLemore each print #370; VCS stores Mark McLemore internally as `370-M` to prevent collision.
- Four Gold-only checklist replacements are maintained separately.

## Source
- https://www.tcdb.com/Rookies.cfm/sid/426/1994-Topps
- https://www.tcdb.com/Checklist.cfm/sid/426/1994-Topps?PageIndex=8

## Release checklist
- [ ] Independently verify the true rookie player(s) on all 24 cards.
- [ ] Update the generator and its regression checks; regenerate CSV.
- [ ] Dry-run import on populated product and confirm all identifiers are preserved.
- [ ] Approve scans/pack art/pricing and four-card pack distribution.
- [ ] Release only after signoff.
