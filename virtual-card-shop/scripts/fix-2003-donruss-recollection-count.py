from pathlib import Path

path = Path(__file__).with_name("generate-2003-donruss-baseball.py")
source = path.read_text(encoding="utf-8")
changed = False

old = '''        "key": "recollection-collection",
        "name": "Recollection Collection",
        "expected": 302,
'''
new = '''        "key": "recollection-collection",
        "name": "Recollection Collection",
        "expected": 303,
'''

if old in source:
    source = source.replace(old, new, 1)
    changed = True
    print("Updated Recollection Collection expected count from 302 to 303 live linked cards.")
elif new in source:
    print("Recollection Collection expected count already set to 303.")
else:
    raise SystemExit("Could not find Recollection Collection expected-count block.")

old_comment = '''        # TCDB reports 302 Recollection cards, but its paginated HTML currently
        # exposes one extra valid-looking row. Collapse only rows that resolve to
'''
new_comment = '''        # TCDB's summary header may lag behind its live checklist. If the live
        # checklist ever exceeds the expected count, collapse only rows that resolve to
'''

if old_comment in source:
    source = source.replace(old_comment, new_comment, 1)
    changed = True
elif new_comment in source:
    pass

if changed:
    path.write_text(source, encoding="utf-8")
    print("2003 Donruss Recollection count patch complete.")
else:
    print("2003 Donruss Recollection count already aligned.")
