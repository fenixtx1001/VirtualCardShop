import type { PricingRow, PriceField } from "./pricing-advisor";
export function initialPrices(target:PricingRow, history:PricingRow[]):{prices:Partial<Record<PriceField,number>>;comparables:string[];confidence:string};
