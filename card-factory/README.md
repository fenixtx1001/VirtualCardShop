# VCS Card Factory — hybrid foundation

This folder holds the reusable Card Factory workflow and reference catalog. It does **not** change the live VCS application, its database, or existing image-upload process.

## Start
Use the phrase: **Use Card Factory on 1998 Ultra Platinum Medallion Ken Griffey Jr.**

The assistant should follow [SKILL.md](./SKILL.md), research real cards and authentic examples, then deliver a candidate image for **manual drag-and-drop into VCS**. The phrase is not a guaranteed global skill invocation: load the instructions in a ChatGPT Project/custom GPT or supported skill environment, or explicitly provide this file to a chat.

## Library
- `references/<set-slug>/<variation-slug>/manifest.json`: approved examples, source provenance, design specification, and asset pointers
- `templates/`: reusable, versioned transformation recipes
- `outputs/`: reconstruction metadata, not necessarily large image binaries

Prefer Cloudflare R2 for image assets (with appropriate permissions); keep stable object keys and hashes in GitHub metadata. Do not copy third-party reference scans to public storage without suitable rights. Avoid committing large binary images or secrets to Git.

## First test
1. Identify and verify one card.
2. Find exact genuine scan, or at least two same-variation references and the player's base card.
3. Generate a candidate; compare against references.
4. User approves or requests revision.
5. Only after approval, save reusable design metadata and any permitted assets.

## Future integration
An optional VCS admin workflow can read the existing missing-image queue, prepare candidates, and require review before publication. This is **not implemented** by this foundation.
