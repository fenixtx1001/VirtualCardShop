#!/usr/bin/env python3
"""Source-audited 2001 Fleer Ultra Baseball Set Factory generator.

Requires independent BaseballCardPedia and MyCardBatch public checklists.
No invented checklist members, player teams, RC tags or pack odds.
"""
import argparse
import csv
import gzip
import html
import io
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
BUNDLE = DATA / "2001-ultra-baseball.bundle.json"
CARDS = DATA / "2001-ultra-baseball.cards.csv.gz"
BCP = "https://baseballcardpedia.com/index.php/2001_Ultra"
MCB = "https://mycardbatch.com/checklists/fleer-ultra-2001-baseball"
TCDB = "https://www.tcdb.com/ViewSet.cfm/sid/1505/2001-Ultra"
TCDB_INSERT = "https://www.tcdb.com/Inserts.cfm/sid/1505/2001-Ultra"
PRODUCT_ID = "2001_Ultra_Baseball"
FIELDS = ("setKey", "cardNumber", "player", "team", "subset", "variant")
EXPECTED = {
    "base": 275,
    "gold-medallion": 275,
    "platinum-medallion": 275,
    "platinum-rc-2001-fleer-platinum": 5,
    "decade-of-dominance": 15,
    "decade-of-dominance-platinum": 15,
    "fall-classics": 37,
    "fall-classics-memorabilia": 26,
    "fall-classics-memorabilia-autograph": 9,
    "greatest-hits-of": 10,
    "greatest-hits-of-platinum": 10,
    "power-plus": 10,
    "power-plus-platinum": 10,
    "tomorrows-legends": 15,
    "tomorrows-legends-platinum": 15,
}
DERIVED = {
    "decade-of-dominance-platinum": "decade-of¶»§q«^