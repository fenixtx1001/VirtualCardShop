/**
 * Historical reference odds are informational, NOT VCS pack-engine odds.
 *
 * The 1998 Ultra manifest intentionally leaves productSet.oddsPerPack null:
 * its Series 1/2 and hobby/retail configurations are not yet modeled as
 * independent pack products. Never copy these references into a draft or save.
 *
 * Source: data/set-factory/1998-ultra-baseball.bundle.json, verified notes.
 * Add reference data for other sets only after verifying their pack formats.
 */

export type PublishedOdds = {
  series: "S1" | "S2" | "S1/S2";
  hobby?: number;
  retail?: number;
  note?: string;
};

const sourceUrl = "https://baseballcardpedia.com/index.php/1998_Ultra";

const ultra1998: Record<string, PublishedOdds> = {
  gold_medallion: { series: "S1/S2", hobby: 1, note: "One per hobby pack in both series." },
  big_shots: { series: "S1", hobby: 4, retail: 4 },
  double_trouble: { series: "S1", hobby: 4, retail: 4 },
  back_to_the_future: { series: "S1", hobby: 6, retail: 6 },
  artistic_talents: { series: "S1", hobby: 8, retail: 8 },
  kid_gloves: { series: "S1", hobby: 8, retail: 8 },
  fall_classics: { series: "S1", hobby: 18, retail: 18 },
  power_plus: { series: "S1", hobby: 36, retail: 36 },
  prime_leather: { series: "S1", hobby: 144, retail: 144 },
  diamond_producers: { series: "S1", hobby: 288, retail: 288 },
  top_30: { series: "S2", retail: 1, note: "Retail-only insert: one per pack." },
  notables: { series: "S2", hobby: 4, retail: 6 },
  rocket_to_stardom: { series: "S2", hobby: 15, retail: 30 },
  millennium_men: { series: "S2", hobby: 35, note: "Hobby-only insert." },
  win_now: { series: "S2", hobby: 72, retail: 104 },
  ticket_studs: { series: "S2", hobby: 144, retail: 206 },
  diamond_immortals: { series: "S2", hobby: 288, retail: 412 },
  million_dollar_moments: {
    series: "S1", hobby: 1,
    note: "One shared game card per pack; individual cards #46–50 are rarer.",
  },
};

export function getPublishedOdds(productSetId: string): (PublishedOdds & { sourceUrl: string }) | null {
  const prefix = "1998_Ultra_Baseball_";
  if (!productSetId.startsWith(prefix)) return null;
  const ref = ultra1998[productSetId.slice(prefix.length)];
  return ref ? { ...ref, sourceUrl } : null;
}

export function formatPublishedOdds(ref: PublishedOdds): string {
  if (ref.hobby !== undefined && ref.retail !== undefined && ref.hobby === ref.retail) {
    return ref.series + " · H/R 1:" + ref.hobby;
  }
  const parts = [ref.series];
  if (ref.hobby !== undefined) parts.push("H 1:" + ref.hobby);
  if (ref.retail !== undefined) parts.push("R 1:" + ref.retail);
  return parts.join(" · ");
}
