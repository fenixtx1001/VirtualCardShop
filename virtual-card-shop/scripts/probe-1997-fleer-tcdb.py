#!/usr/bin/env python3
"""Read-only TCDB access probe; no scraping loop, writes, or database changes."""
import urllib.error
import urllib.request
URLS = [
    ("1997 Fleer Football", "https://www.tcdb.com/Checklist.cfm/sid/3961/1997-Fleer?PageIndex=1"),
    ("1997 Fleer Traditions Crystal", "https://www.tcdb.com/Checklist.cfm/sid/34307/1997-Fleer-Traditions-Crystal?PageIndex=1"),
]
for label, url in URLS:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            data = response.read(500)
            print(f"{label}: HTTP {response.status}; sample bytes {len(data)}; TCDB reachable")
    except urllib.error.HTTPError as exc:
        print(f"{label}: HTTP {exc.code}; blocked from Codespace")
    except Exception as exc:
        print(f"{label}: request failed: {type(exc).__name__}: {exc}")
