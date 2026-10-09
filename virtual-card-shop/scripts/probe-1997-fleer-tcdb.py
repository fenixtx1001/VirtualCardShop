#!/usr/bin/env python3
"""Compare original successful vs newly introduced TCDB request headers.

Read-only diagnostic: no database access or file writes.
Four requests total. Does not rotate IPs or change cloud environment.
"""
import time
import urllib.error
import urllib.request

OLD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
    "Accept": "text/html,application/xhtml+xml",
}
NEW_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/html",
}
TARGETS = [
    (
        "1997 Fleer Football (currently failing)",
        "https://www.tcdb.com/Checklist.cfm/sid/3961/1997-Fleer?PageIndex=1",
    ),
    (
        "1997 Metal Universe Football (last confirmed success)",
        "https://www.tcdb.com/Checklist.cfm/sid/3986/1997-Metal-Universe?PageIndex=1",
    ),
]
print("=== TCDB REQUEST REGRESSION CHECK ===", flush=True)
for target_label, url in TARGETS:
    print(f"\n{target_label}", flush=True)
    for label, headers in [("ORIGINAL successful headers", OLD_HEADERS),
                           ("RECENT failing headers", NEW_HEADERS)]:
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = response.read(512)
                result = f"HTTP {response.status}; sample bytes={len(payload)}"
        except urllib.error.HTTPError as error:
            result = f"HTTP {error.code}"
        except Exception as error:
            result = f"{type(error).__name__}: {str(error)[:120]}"
        print(f"  {label}: {result}", flush=True)
        time.sleep(1)
print("\n=== DIAGNOSTIC COMPLETE; NO DATA CHANGED ===")
