# 1993–94 Leaf Hockey

| Checklist | Cards |
| --- | ---: |
| Base | 440 |
| Freshman Phenoms | 10 |
| Gold Leaf All-Stars | 10 |
| Gold Leaf Rookie | 15 |
| Hat Trick Artists | 10 |
| Mario Lemieux Collection | 10 |
| Painted Warriors | 10 |
| Studio Signature Series | 10 |
| Authentic Autograph | 1 |
| Total | 516 |

## Verification

TCDB's complete Base and insert checklists are frozen in the source
snapshot. All 440 base numbers and all 75 numbered insert entries
were matched against the Hobby Insider checklist. Base differences
are player aliases or naming choices for the Stanley Cup card.
The Gold Leaf All-Stars #2 team follows the card-specific TCDB
entry, Pittsburgh Penguins / Chicago Blackhawks, correcting the
Detroit assignment for Chris Chelios in the secondary checklist.

The 29 TCDB rookie entries match the corresponding base subjects
and teams. Beckett independently reports 29 rookies. The two title
cards and six awards checklists are retained. The Mike Needham #214
photo error remains in variant metadata. The separately cataloged
unnumbered Lemieux autograph carries SN2000. Studio Signature
Series cards carry facsimile signatures. The oversized pre-release
Lemieux promotion is outside the sealed-pack checklist.

## Pack model

The combined VCS product uses 14 cards per pack and 36 packs per box.
This is the documented U.S. Series One configuration. Both U.S.
series have photographed wrappers marked 14 cards. Other listings
describe 10-card configurations, and a Canadian Series Two box is
documented with 24 packs of 14.

The sources identify insert families and the autograph's print
run but do not establish reliable per-pack rates. All eight insert
families remain in the draft with odds unset, so VCS packs would
draw base cards only until insert odds are configured. The autograph
print run alone cannot determine odds without the eligible pack count.

Generator reproducibility, offline VCS importer validation and
import script syntax passed. Artwork, pricing and insert odds are
pending. The import creates the product unreleased.

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/4954/1993-94-Leaf) ·
[TCDB inserts](https://www.tcdb.com/Inserts.cfm/sid/4954/1993-94-Leaf---Studio-Signature-Series) ·
[TCDB packaging](https://www.tcdb.com/Packaging.cfm/sid/4954/1993-94-Leaf) ·
[Hobby Insider checklist](https://www.hobbyinsider.net/forum/threads/checklist-1993-94-leaf.436420/) ·
[Beckett](https://www.beckett.com/hockey/1993-94/leaf/) ·
[U.S. Series One box configuration](https://bbcexchange.com/products/1993-94-leaf-hockey-series-1-box-us-36)

## Import from GitHub

Run from the configured VCS Codespace. The helper validates the
bundle and dry-runs against the database before applying.
Omit `--apply` for verification and dry run only.

```bash
git fetch origin codex/set-factory-1993-94-leaf-hockey &&
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-1993-94-leaf-hockey.sh) --apply
```
