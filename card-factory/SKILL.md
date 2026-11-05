---
name: vcs-card-factory
description: Research and reconstruct historically accurate missing sports card images for VirtualCardShop. Trigger when user says "Use Card Factory on [card]" or requests a VCS missing card reconstruction.
---
# VCS Card Factory

## Mission
Find the genuine card scan first. If genuinely unavailable, create the closest evidence-backed digital reconstruction for private VCS display. Never claim a reconstruction is an authentic scan. Keep source attribution and reconstruction provenance.

## Invocation
"Use Card Factory on <year product variation player>" in any chat where this skill is installed or its instructions are accessible. Do not claim the skill is globally installed merely because this file exists in GitHub.

## Mandatory workflow
1. Parse year, manufacturer, product, sport, player, variation, card number. Research ambiguous identity; ask only when unavoidable.
2. Verify the exact checklist entry, variation, year, player, team, position, card number. Prefer TCDB, manufacturer checklists, Beckett, COMC, auction archives, credible collector listings. Cross-check conflicting claims. Do not assume a card exists.
3. Search exhaustively for a genuine scan of the exact card, including alternate spellings and front/back. If a usable authentic scan is available and rights/access permit, favor it over generating a substitute.
4. Retrieve multiple genuine examples of the *same* insert/parallel plus their matching base versions where possible. Record URL, card identity, date accessed, confidence, and usage rights/access notes. Never imply search results are authenticated solely because they appear online.
5. Classify invariant elements (border, frame, logo, typography, layout, foil texture, orientation) and variable elements (player photograph, name, team, position, number, stats). Verify every variable against the checklist and period sources.
6. Select least generative method: original scan > deterministic parallel transformation of verified base scan > insert-template compositing with licensed/usable era-correct player photography > constrained image generation. Preserve original design. No invented autographs, serial stamps, holograms, foil placement, player details, or fabricated claims of physical authenticity.
7. Generate only after evidence is sufficient. For simple color/foil variants, use image editing and masks rather than full-scene generation. For inserts, isolate player-specific regions. Keep exact aspect ratio and legible spelling.
8. QA visually against each genuine reference; check design geometry, team, player, spelling, card number, crop, logos, and foil effects. Rework substantial errors. If evidence insufficient, report blocked/low confidence rather than silently hallucinate.
9. Deliver image for user review and manual VCS upload. Report source links, genuine-vs-reconstructed status, remaining uncertainty, confidence, and proposed library additions. Never publish directly to production without explicit approval.
10. After user approves a template, store versioned source metadata and approved transformations in the library. Avoid duplicate research on later cards of same variation.

## Guardrails
- No production database or live image changes by default.
- No scraping behind login, bypassing site access controls, or assuming image reuse permission.
- Source scans and outputs should be marked as references/reconstructions in internal metadata; do not add visible marks unless requested.
- A saved ChatGPT image reference is a visual aid, not a deterministic design constraint or model training.
- Reuse repository records when accessible; if not accessible, disclose limitation and ask for the approved template or use verifiable web sources.
- Be explicit about whether an image was actually generated and whether references were actually retrieved.


## HARD GATE: Reference-first, no speculative image generation (v1.1)
**This section overrides any softer instruction above.**

When the user invokes Card Factory, DO NOT call an image-generation tool merely because the request is to create an image. Complete the following before any generation:
- [ ] Verify the exact card identity and checklist number with a trustworthy source.
- [ ] Obtain and actually VISUALLY INSPECT a genuine front image of the exact card OR (for a missing parallel) the exact player's correct base card PLUS at least one genuine front of the exact parallel from the same product and year. A search snippet, thumbnail query, or inaccessible URL is not visual inspection.
- [ ] Verify the layout: photo(s), framing, borders, logos, nameplate, typography, card numbering, and variation-specific treatment. Explicitly note unresolved design elements.
- [ ] For parallel conversion, preserve the actual player's source photograph(s), original crop, exact layout, and printed text. Use deterministic image manipulation or masked editing as the default; do not reimagine a player in a new pose or uniform.
- [ ] If a card's exact genuine scan is available, prefer using that scan within usage rights rather than recreating it.
- [ ] Only after the checklist is complete may image generation proceed. If any required evidence is unavailable, STOP, report precisely what is missing, and request the minimum needed reference or offer to continue research.
- [ ] After generation, compare output with inspected references. If the template, photograph, text, or layout differs substantially, label the attempt FAILED and do not present it as a successful Card Factory result.

**Do not use image-search queries alone as the reference material for image generation.** Tool-produced plausible artwork is not evidence of authenticity.

## Regression test: 2000 Bowman Chrome Chad Pennington #173
The initial attempt invented an unrelated chrome border, player photograph, and nameplate without inspecting authentic 2000 Bowman Chrome references. Treat this as a known failure. Before retrying, inspect an authentic 2000 Bowman Chad Pennington #173 base and a genuine 2000 Bowman Chrome football card from the same product. Preserve the original composition and derive only evidence-backed Chrome treatment. Never reuse the failed generated card as a design reference.
