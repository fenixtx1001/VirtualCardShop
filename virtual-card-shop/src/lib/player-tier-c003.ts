// C003 owner-approved manifest v1. Exact card and historical-profile preimages; never write card data here.
import type { PlayerTier } from "@prisma/client";
export type ProfilePreimage={id:number;sport:string;canonicalName:string;normalizedName:string;tier:PlayerTier|null};
export type CardTierContext={id:number;player:string|null;productSetId?:string|null;cardNumber?:string|null;team?:string|null;year?:number|null};
export const C003_TARGETS = [
  {
    "sport": "Baseball",
    "canonicalName": "Alex Sanchez (Pitcher)",
    "normalizedName": "alex sanchez pitcher",
    "tier": "COMMON"
  },
  {
    "sport": "Baseball",
    "canonicalName": "Alex Sanchez (Outfielder)",
    "normalizedName": "alex sanchez outfielder",
    "tier": "COMMON"
  },
  {
    "sport": "Basketball",
    "canonicalName": "Mike Dunleavy Sr.",
    "normalizedName": "mike dunleavy sr",
    "tier": "COMMON"
  },
  {
    "sport": "Basketball",
    "canonicalName": "Mike Dunleavy Jr",
    "normalizedName": "mike dunleavy jr",
    "tier": "COMMON",
    "id": 235202
  }
] as const;
export const C003_CARDS = [
  {
    "id": 12864,
    "player": "Alex Sanchez RR",
    "team": "Toronto Blue Jays",
    "productSetId": "1989_Donruss_Base_Baseball",
    "cardNumber": "47",
    "year": 1989,
    "sport": "Baseball",
    "target": 0
  },
  {
    "id": 14105,
    "player": "Alex Sanchez RR",
    "team": "Toronto Blue Jays",
    "productSetId": "1990_Donruss_Base_Baseball",
    "cardNumber": "45",
    "year": 1990,
    "sport": "Baseball",
    "target": 0
  },
  {
    "id": 18327,
    "player": "Mike Dunleavy CO",
    "team": "Los Angeles Lakers",
    "productSetId": "1991-92_Fleer_Base_Basketball",
    "cardNumber": "98",
    "year": 1991,
    "sport": "Basketball",
    "target": 2
  },
  {
    "id": 21599,
    "player": "Alex Sanchez FBC RC",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1997_Bowman_Base_Baseball",
    "cardNumber": "333",
    "year": 1997,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 22305,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1997_Bowman_International_Baseball",
    "cardNumber": "333",
    "year": 1997,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 38327,
    "player": "Mike Dunleavy HC",
    "team": "Los Angeles Lakers",
    "productSetId": "1990-91_Skybox_Base_Basketball",
    "cardNumber": "313",
    "year": 1990,
    "sport": "Basketball",
    "target": 2
  },
  {
    "id": 38591,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1998_Bowman_Base_Baseball",
    "cardNumber": "152",
    "year": 1998,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 38988,
    "player": "Alex Sanchez AU",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1998_Bowman_Certified_Autographs_Blue_Baseball",
    "cardNumber": "64",
    "year": 1998,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 39060,
    "player": "Alex Sanchez AU",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1998_Bowman_Certified_Autographs_Silver_Baseball",
    "cardNumber": "64",
    "year": 1998,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 39132,
    "player": "Alex Sanchez AU",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1998_Bowman_Certified_Autographs_Gold_Baseball",
    "cardNumber": "64",
    "year": 1998,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 39579,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1998_Bowman_International_Baseball",
    "cardNumber": "152",
    "year": 1998,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 39732,
    "player": "Alex Sanchez SN50",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1998_Bowman_Golden_Anniversary_Baseball",
    "cardNumber": "152",
    "year": 1998,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 56876,
    "player": "Mike Dunleavy CO",
    "team": "Milwaukee Bucks",
    "productSetId": "1992-93_Fleer_Base_Basketball",
    "cardNumber": "125",
    "year": 1992,
    "sport": "Basketball",
    "target": 2
  },
  {
    "id": 69893,
    "player": "Alex Sanchez",
    "team": "Toronto Blue Jays",
    "productSetId": "1990_Topps_Baseball_Base",
    "cardNumber": "563",
    "year": 1990,
    "sport": "Baseball",
    "target": 0
  },
  {
    "id": 99546,
    "player": "Mike Dunleavy",
    "team": "San Antonio Spurs / Los Angeles Lakers",
    "productSetId": "1990_91_Hoops_Basketball_Base",
    "cardNumber": "351",
    "year": 1990,
    "sport": "Basketball",
    "target": 2
  },
  {
    "id": 99605,
    "player": "Mike Dunleavy",
    "team": "Los Angeles Lakers",
    "productSetId": "1990_91_Hoops_Basketball_Base",
    "cardNumber": "410",
    "year": 1990,
    "sport": "Basketball",
    "target": 2
  },
  {
    "id": 116271,
    "player": "Mike Dunleavy",
    "team": "Los Angeles Lakers",
    "productSetId": "1991_92_SkyBox_Basketball_base",
    "cardNumber": "390",
    "year": 1991,
    "sport": "Basketball",
    "target": 2
  },
  {
    "id": 116760,
    "player": "Mike Dunleavy Jr. MVPR RC",
    "team": "Golden State Warriors",
    "productSetId": "2002_03_Upper_Deck_MVP_Basketball_base",
    "cardNumber": "214",
    "year": 2002,
    "sport": "Basketball",
    "target": 3
  },
  {
    "id": 116980,
    "player": "Mike Dunleavy Jr. MVPR",
    "team": "Golden State Warriors",
    "productSetId": "2002_03_Upper_Deck_MVP_Basketball_classic",
    "cardNumber": "214",
    "year": 2002,
    "sport": "Basketball",
    "target": 3
  },
  {
    "id": 117200,
    "player": "Mike Dunleavy Jr. MVPR",
    "team": "Golden State Warriors",
    "productSetId": "2002_03_Upper_Deck_MVP_Basketball_classic_black",
    "cardNumber": "214",
    "year": 2002,
    "sport": "Basketball",
    "target": 3
  },
  {
    "id": 117420,
    "player": "Mike Dunleavy Jr. MVPR",
    "team": "Golden State Warriors",
    "productSetId": "2002_03_Upper_Deck_MVP_Basketball_gold",
    "cardNumber": "214",
    "year": 2002,
    "sport": "Basketball",
    "target": 3
  },
  {
    "id": 126121,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Bowman_Baseball_base",
    "cardNumber": "241",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 126561,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Bowman_Baseball_retro_future",
    "cardNumber": "241",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 127001,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Bowman_Baseball_gold",
    "cardNumber": "241",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 128558,
    "player": "Alex Sanchez",
    "team": "Toronto Blue Jays",
    "productSetId": "1990_Upper_Deck_Baseball_base",
    "cardNumber": "757",
    "year": 1990,
    "sport": "Baseball",
    "target": 0
  },
  {
    "id": 130253,
    "player": "Alex Sanchez RC",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1997_Bowman_Chrome_Baseball_base",
    "cardNumber": "229",
    "year": 1997,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 130553,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1997_Bowman_Chrome_Baseball_international",
    "cardNumber": "229",
    "year": 1997,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 130853,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1997_Bowman_Chrome_Baseball_international_refractors",
    "cardNumber": "229",
    "year": 1997,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 131153,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "1997_Bowman_Chrome_Baseball_refractors",
    "cardNumber": "229",
    "year": 1997,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 171878,
    "player": "Alex Sanchez",
    "team": "Milwaukee Brewers",
    "productSetId": "2003_Bowman_Baseball_Base",
    "cardNumber": "40",
    "year": 2003,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 172208,
    "player": "Alex Sanchez",
    "team": "Milwaukee Brewers",
    "productSetId": "2003_Bowman_Baseball_Gold",
    "cardNumber": "40",
    "year": 2003,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 172538,
    "player": "Alex Sanchez",
    "team": "Milwaukee Brewers",
    "productSetId": "2003_Bowman_Baseball_Uncirculated_Silver",
    "cardNumber": "40",
    "year": 2003,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 186780,
    "player": "Alex Sanchez",
    "team": "Toronto Blue Jays",
    "productSetId": "1990_Fleer_Baseball_base",
    "cardNumber": "92",
    "year": 1990,
    "sport": "Baseball",
    "target": 0
  },
  {
    "id": 203856,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Ultra_Baseball_base",
    "cardNumber": "273",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 204337,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Ultra_Baseball_gold_medallion",
    "cardNumber": "273G",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 204637,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Ultra_Baseball_platinum_medallion",
    "cardNumber": "273P",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 204937,
    "player": "Alex Sanchez",
    "team": "Tampa Bay Devil Rays",
    "productSetId": "2000_Ultra_Baseball_masterpiece",
    "cardNumber": "273M",
    "year": 2000,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 207842,
    "player": "Alex Sanchez",
    "team": "Detroit Tigers",
    "productSetId": "2004_Ultra_Baseball_base",
    "cardNumber": "108",
    "year": 2004,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 207843,
    "player": "Alex Sanchez",
    "team": "Detroit Tigers",
    "productSetId": "2004_Ultra_Baseball_gold_medallion",
    "cardNumber": "108",
    "year": 2004,
    "sport": "Baseball",
    "target": 1
  },
  {
    "id": 207844,
    "player": "Alex Sanchez",
    "team": "Detroit Tigers",
    "productSetId": "2004_Ultra_Baseball_platinum_medallion",
    "cardNumber": "108",
    "year": 2004,
    "sport": "Baseball",
    "target": 1
  }
] as const;
export const C003_REVIEWS: ReadonlyArray<{sport:string;key:string;effective:PlayerTier;members:ProfilePreimage[];active:ProfilePreimage}> = [
  {
    "sport": "Baseball",
    "key": "bruce sutter",
    "effective": "COMMON",
    "members": [
      {
        "id": 2949,
        "sport": "Baseball",
        "canonicalName": "Bruce Sutter",
        "normalizedName": "bruce sutter",
        "tier": "COMMON"
      },
      {
        "id": 43325,
        "sport": "Baseball",
        "canonicalName": "Bruce Sutter SV",
        "normalizedName": "bruce sutter sv",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 2949,
      "sport": "Baseball",
      "canonicalName": "Bruce Sutter",
      "normalizedName": "bruce sutter",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Baseball",
    "key": "dale murphy",
    "effective": "UNLISTED_STAR",
    "members": [
      {
        "id": 702,
        "sport": "Baseball",
        "canonicalName": "Dale Murphy",
        "normalizedName": "dale murphy",
        "tier": "UNLISTED_STAR"
      },
      {
        "id": 4161,
        "sport": "Baseball",
        "canonicalName": "Dale Murphy AS",
        "normalizedName": "dale murphy as",
        "tier": null
      },
      {
        "id": 4891,
        "sport": "Baseball",
        "canonicalName": "Dale Murphy CH",
        "normalizedName": "dale murphy ch",
        "tier": null
      },
      {
        "id": 37048,
        "sport": "Baseball",
        "canonicalName": "Dale Murphy ERR",
        "normalizedName": "dale murphy err",
        "tier": "COMMON"
      },
      {
        "id": 37049,
        "sport": "Baseball",
        "canonicalName": "Dale Murphy COR",
        "normalizedName": "dale murphy cor",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 702,
      "sport": "Baseball",
      "canonicalName": "Dale Murphy",
      "normalizedName": "dale murphy",
      "tier": "UNLISTED_STAR"
    }
  },
  {
    "sport": "Baseball",
    "key": "carl yastrzemski",
    "effective": "STAR_2",
    "members": [
      {
        "id": 2903,
        "sport": "Baseball",
        "canonicalName": "Carl Yastrzemski TBC",
        "normalizedName": "carl yastrzemski tbc",
        "tier": null
      },
      {
        "id": 4254,
        "sport": "Baseball",
        "canonicalName": "Carl Yastrzemski",
        "normalizedName": "carl yastrzemski",
        "tier": "STAR_2"
      },
      {
        "id": 6045,
        "sport": "Baseball",
        "canonicalName": "Carl Yastrzemski PUZ",
        "normalizedName": "carl yastrzemski puz",
        "tier": null
      },
      {
        "id": 43725,
        "sport": "Baseball",
        "canonicalName": "Carl Yastrzemski SV",
        "normalizedName": "carl yastrzemski sv",
        "tier": "UNLISTED_STAR"
      },
      {
        "id": 48130,
        "sport": "Baseball",
        "canonicalName": "Carl Yastrzemski SPOT",
        "normalizedName": "carl yastrzemski spot",
        "tier": null
      },
      {
        "id": 83244,
        "sport": "Baseball",
        "canonicalName": "Carl Yastrzemski IA",
        "normalizedName": "carl yastrzemski ia",
        "tier": null
      }
    ],
    "active": {
      "id": 4254,
      "sport": "Baseball",
      "canonicalName": "Carl Yastrzemski",
      "normalizedName": "carl yastrzemski",
      "tier": "STAR_2"
    }
  },
  {
    "sport": "Baseball",
    "key": "johnny bench",
    "effective": "STAR_2",
    "members": [
      {
        "id": 4256,
        "sport": "Baseball",
        "canonicalName": "Johnny Bench",
        "normalizedName": "johnny bench",
        "tier": "COMMON"
      },
      {
        "id": 43235,
        "sport": "Baseball",
        "canonicalName": "Johnny Bench SV",
        "normalizedName": "johnny bench sv",
        "tier": "SEMI_STAR"
      },
      {
        "id": 82994,
        "sport": "Baseball",
        "canonicalName": "Johnny Bench IA",
        "normalizedName": "johnny bench ia",
        "tier": null
      }
    ],
    "active": {
      "id": 4256,
      "sport": "Baseball",
      "canonicalName": "Johnny Bench",
      "normalizedName": "johnny bench",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketball",
    "key": "danny ainge",
    "effective": "COMMON",
    "members": [
      {
        "id": 1278,
        "sport": "Basketball",
        "canonicalName": "Danny Ainge",
        "normalizedName": "danny ainge",
        "tier": "COMMON"
      },
      {
        "id": 230097,
        "sport": "Basketball",
        "canonicalName": "Danny Ainge SM",
        "normalizedName": "danny ainge sm",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 1278,
      "sport": "Basketball",
      "canonicalName": "Danny Ainge",
      "normalizedName": "danny ainge",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketball",
    "key": "mark jackson",
    "effective": "COMMON",
    "members": [
      {
        "id": 1381,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson",
        "normalizedName": "mark jackson",
        "tier": "COMMON"
      },
      {
        "id": 2269,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson RC",
        "normalizedName": "mark jackson rc",
        "tier": null
      },
      {
        "id": 2279,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson AS",
        "normalizedName": "mark jackson as",
        "tier": null
      },
      {
        "id": 5844,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson SN99",
        "normalizedName": "mark jackson sn99",
        "tier": null
      },
      {
        "id": 5954,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson SN24",
        "normalizedName": "mark jackson sn24",
        "tier": null
      },
      {
        "id": 110023,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson OTM",
        "normalizedName": "mark jackson otm",
        "tier": null
      },
      {
        "id": 230093,
        "sport": "Basketball",
        "canonicalName": "Mark Jackson SM",
        "normalizedName": "mark jackson sm",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 1381,
      "sport": "Basketball",
      "canonicalName": "Mark Jackson",
      "normalizedName": "mark jackson",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketball",
    "key": "phil jackson",
    "effective": "COMMON",
    "members": [
      {
        "id": 7611,
        "sport": "Basketball",
        "canonicalName": "Phil Jackson CO",
        "normalizedName": "phil jackson co",
        "tier": "SEMI_STAR"
      },
      {
        "id": 74972,
        "sport": "Basketball",
        "canonicalName": "Phil Jackson HC",
        "normalizedName": "phil jackson hc",
        "tier": "COMMON"
      },
      {
        "id": 144278,
        "sport": "Basketball",
        "canonicalName": "Phil Jackson",
        "normalizedName": "phil jackson",
        "tier": "COMMON"
      }
    ],
    "active": {
      "id": 144278,
      "sport": "Basketball",
      "canonicalName": "Phil Jackson",
      "normalizedName": "phil jackson",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketball",
    "key": "charles barkley",
    "effective": "STAR_1",
    "members": [
      {
        "id": 1253,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley UER",
        "normalizedName": "charles barkley uer",
        "tier": null
      },
      {
        "id": 1426,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley",
        "normalizedName": "charles barkley",
        "tier": "STAR_1"
      },
      {
        "id": 2323,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley AS",
        "normalizedName": "charles barkley as",
        "tier": null
      },
      {
        "id": 5062,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley LL",
        "normalizedName": "charles barkley ll",
        "tier": null
      },
      {
        "id": 5964,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley SN99",
        "normalizedName": "charles barkley sn99",
        "tier": null
      },
      {
        "id": 6000,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley SN24",
        "normalizedName": "charles barkley sn24",
        "tier": null
      },
      {
        "id": 7726,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley TL",
        "normalizedName": "charles barkley tl",
        "tier": null
      },
      {
        "id": 7737,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley PV",
        "normalizedName": "charles barkley pv",
        "tier": "COMMON"
      },
      {
        "id": 49723,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley JS",
        "normalizedName": "charles barkley js",
        "tier": null
      },
      {
        "id": 144102,
        "sport": "Basketball",
        "canonicalName": "Charles Barkley SD",
        "normalizedName": "charles barkley sd",
        "tier": null
      }
    ],
    "active": {
      "id": 1426,
      "sport": "Basketball",
      "canonicalName": "Charles Barkley",
      "normalizedName": "charles barkley",
      "tier": "STAR_1"
    }
  },
  {
    "sport": "Basketball",
    "key": "allen iverson",
    "effective": "STAR_2",
    "members": [
      {
        "id": 5687,
        "sport": "Basketball",
        "canonicalName": "Allen Iverson",
        "normalizedName": "allen iverson",
        "tier": "STAR_2"
      },
      {
        "id": 5808,
        "sport": "Basketball",
        "canonicalName": "Allen Iverson SN99",
        "normalizedName": "allen iverson sn99",
        "tier": null
      },
      {
        "id": 5914,
        "sport": "Basketball",
        "canonicalName": "Allen Iverson SN24",
        "normalizedName": "allen iverson sn24",
        "tier": null
      },
      {
        "id": 66669,
        "sport": "Basketball",
        "canonicalName": "Allen Iverson AR",
        "normalizedName": "allen iverson ar",
        "tier": "STAR_1"
      },
      {
        "id": 110139,
        "sport": "Basketball",
        "canonicalName": "Allen Iverson FF",
        "normalizedName": "allen iverson ff",
        "tier": null
      },
      {
        "id": 146548,
        "sport": "Basketball",
        "canonicalName": "Allen Iverson STAR",
        "normalizedName": "allen iverson star",
        "tier": null
      }
    ],
    "active": {
      "id": 5687,
      "sport": "Basketball",
      "canonicalName": "Allen Iverson",
      "normalizedName": "allen iverson",
      "tier": "STAR_2"
    }
  },
  {
    "sport": "Basketbal",
    "key": "alton lister",
    "effective": "SEMI_STAR",
    "members": [
      {
        "id": 95661,
        "sport": "Basketbal",
        "canonicalName": "Alton Lister",
        "normalizedName": "alton lister",
        "tier": "COMMON"
      }
    ],
    "active": {
      "id": 5074,
      "sport": "Basketball",
      "canonicalName": "Alton Lister",
      "normalizedName": "alton lister",
      "tier": "SEMI_STAR"
    }
  },
  {
    "sport": "Basketbal",
    "key": "rick mahorn",
    "effective": "SEMI_STAR",
    "members": [
      {
        "id": 95660,
        "sport": "Basketbal",
        "canonicalName": "Rick Mahorn",
        "normalizedName": "rick mahorn",
        "tier": "COMMON"
      }
    ],
    "active": {
      "id": 1270,
      "sport": "Basketball",
      "canonicalName": "Rick Mahorn",
      "normalizedName": "rick mahorn",
      "tier": "SEMI_STAR"
    }
  },
  {
    "sport": "Basketbal",
    "key": "charles oakley",
    "effective": "COMMON",
    "members": [
      {
        "id": 95575,
        "sport": "Basketbal",
        "canonicalName": "Charles Oakley",
        "normalizedName": "charles oakley",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 1395,
      "sport": "Basketball",
      "canonicalName": "Charles Oakley",
      "normalizedName": "charles oakley",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketbal",
    "key": "derrick coleman",
    "effective": "COMMON",
    "members": [
      {
        "id": 95416,
        "sport": "Basketbal",
        "canonicalName": "Derrick Coleman",
        "normalizedName": "derrick coleman",
        "tier": "SEMI_STAR"
      },
      {
        "id": 95467,
        "sport": "Basketbal",
        "canonicalName": "Derrick Coleman CYL",
        "normalizedName": "derrick coleman cyl",
        "tier": null
      },
      {
        "id": 95593,
        "sport": "Basketbal",
        "canonicalName": "Derrick Coleman CB",
        "normalizedName": "derrick coleman cb",
        "tier": null
      }
    ],
    "active": {
      "id": 7632,
      "sport": "Basketball",
      "canonicalName": "Derrick Coleman",
      "normalizedName": "derrick coleman",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketbal",
    "key": "jalen rose",
    "effective": "COMMON",
    "members": [
      {
        "id": 95613,
        "sport": "Basketbal",
        "canonicalName": "Jalen Rose",
        "normalizedName": "jalen rose",
        "tier": "SEMI_STAR"
      },
      {
        "id": 95622,
        "sport": "Basketbal",
        "canonicalName": "Jalen Rose CB",
        "normalizedName": "jalen rose cb",
        "tier": null
      }
    ],
    "active": {
      "id": 5088,
      "sport": "Basketball",
      "canonicalName": "Jalen Rose",
      "normalizedName": "jalen rose",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketbal",
    "key": "james worthy",
    "effective": "UNLISTED_STAR",
    "members": [
      {
        "id": 95408,
        "sport": "Basketbal",
        "canonicalName": "James Worthy",
        "normalizedName": "james worthy",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 1365,
      "sport": "Basketball",
      "canonicalName": "James Worthy",
      "normalizedName": "james worthy",
      "tier": "UNLISTED_STAR"
    }
  },
  {
    "sport": "Basketbal",
    "key": "john starks",
    "effective": "COMMON",
    "members": [
      {
        "id": 95664,
        "sport": "Basketbal",
        "canonicalName": "John Starks",
        "normalizedName": "john starks",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 5673,
      "sport": "Basketball",
      "canonicalName": "John Starks",
      "normalizedName": "john starks",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketbal",
    "key": "robert parish",
    "effective": "UNLISTED_STAR",
    "members": [
      {
        "id": 95581,
        "sport": "Basketbal",
        "canonicalName": "Robert Parish",
        "normalizedName": "robert parish",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 1304,
      "sport": "Basketball",
      "canonicalName": "Robert Parish",
      "normalizedName": "robert parish",
      "tier": "UNLISTED_STAR"
    }
  },
  {
    "sport": "Basketbal",
    "key": "rod strickland",
    "effective": "COMMON",
    "members": [
      {
        "id": 95374,
        "sport": "Basketbal",
        "canonicalName": "Rod Strickland CYL",
        "normalizedName": "rod strickland cyl",
        "tier": null
      },
      {
        "id": 95531,
        "sport": "Basketbal",
        "canonicalName": "Rod Strickland",
        "normalizedName": "rod strickland",
        "tier": "SEMI_STAR"
      }
    ],
    "active": {
      "id": 1408,
      "sport": "Basketball",
      "canonicalName": "Rod Strickland",
      "normalizedName": "rod strickland",
      "tier": "COMMON"
    }
  },
  {
    "sport": "Basketbal",
    "key": "dominique wilkins",
    "effective": "STAR_1",
    "members": [
      {
        "id": 95541,
        "sport": "Basketbal",
        "canonicalName": "Dominique Wilkins",
        "normalizedName": "dominique wilkins",
        "tier": "UNLISTED_STAR"
      },
      {
        "id": 95642,
        "sport": "Basketbal",
        "canonicalName": "Dominique Wilkins CB",
        "normalizedName": "dominique wilkins cb",
        "tier": null
      }
    ],
    "active": {
      "id": 1297,
      "sport": "Basketball",
      "canonicalName": "Dominique Wilkins",
      "normalizedName": "dominique wilkins",
      "tier": "STAR_1"
    }
  },
  {
    "sport": "Basketbal",
    "key": "scottie pippen",
    "effective": "STAR_1",
    "members": [
      {
        "id": 95441,
        "sport": "Basketbal",
        "canonicalName": "Scottie Pippen",
        "normalizedName": "scottie pippen",
        "tier": "STAR_1"
      }
    ],
    "active": {
      "id": 5007,
      "sport": "Basketball",
      "canonicalName": "Scottie Pippen",
      "normalizedName": "scottie pippen",
      "tier": "UNLISTED_STAR"
    }
  },
  {
    "sport": "Basketbal",
    "key": "ervin johnson",
    "effective": "COMMON",
    "members": [
      {
        "id": 95437,
        "sport": "Basketbal",
        "canonicalName": "Ervin Johnson",
        "normalizedName": "ervin johnson",
        "tier": "STAR_2"
      }
    ],
    "active": {
      "id": 46604,
      "sport": "Basketball",
      "canonicalName": "Ervin Johnson",
      "normalizedName": "ervin johnson",
      "tier": "COMMON"
    }
  }
];
const cardMap=new Map<number,(typeof C003_CARDS)[number]>(C003_CARDS.map(c=>[c.id,c]));
export const contextualKey=(sport:string,key:string)=> (sport==="Baseball"&&key==="alex sanchez")||(sport==="Basketball"&&key==="mike dunleavy");
export const contextualTarget=(sport:string,key:string)=>C003_TARGETS.find(t=>t.sport===sport&&t.normalizedName===key);
export const historicalKey=(sport:string,key:string)=>contextualKey(sport,key);
export const protectedContextKey=(sport:string,key:string)=>historicalKey(sport,key)||!!contextualTarget(sport,key);
export const protectedContextId=(id:number)=>[5503,7627,14115,14555,74981,144375,235202,234982].includes(id);
export function contextualAssignment(sport:string,player:string|null|undefined,key:string,card?:CardTierContext) {
  const approved=card?cardMap.get(card.id):undefined;
  if(approved){
    if(approved.sport!==sport||approved.player!==player||card!.player!==player||approved.productSetId!==card!.productSetId||approved.cardNumber!==card!.cardNumber||approved.team!==card!.team||approved.year!==card!.year) return {blocked:true as const};
    return {blocked:false as const,target:C003_TARGETS[approved.target]};
  }
  if(contextualKey(sport,key)|| (contextualTarget(sport,key)&&key!=="mike dunleavy jr"))return {blocked:true as const};
  return {blocked:false as const};
}
export function contextProfileMatches(target:(typeof C003_TARGETS)[number],profile:ProfilePreimage|null|undefined){
  return !!profile&&profile.sport===target.sport&&profile.canonicalName===target.canonicalName&&profile.normalizedName===target.normalizedName&&profile.tier===target.tier&&(!("id" in target)||profile.id===target.id);
}
export function samePreimage(a:ProfilePreimage|undefined|null,b:ProfilePreimage){return !!a&&a.id===b.id&&a.sport===b.sport&&a.canonicalName===b.canonicalName&&a.normalizedName===b.normalizedName&&a.tier===b.tier}
const reviews=new Map(C003_REVIEWS.map(r=>[r.sport+"::"+r.key,r]));
export function reviewedConflict(sport:string,key:string,members:ProfilePreimage[],all:Map<number,ProfilePreimage>,effective:PlayerTier|null){
  const r=reviews.get(sport+"::"+key);
  if(!r)return false;
  return members.length===r.members.length&&r.members.every(expected=>samePreimage(all.get(expected.id),expected)&&members.some(m=>m.id===expected.id))&&samePreimage(all.get(r.active.id),r.active)&&effective===r.effective;
}
export function reviewedDecision(sport:string,key:string){return reviews.get(sport+"::"+key)}
