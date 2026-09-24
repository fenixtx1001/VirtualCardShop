from pathlib import Path

path = Path(__file__).with_name("generate-2003-donruss-baseball.py")
source = path.read_text(encoding="utf-8")
changed = False

old_init = '''        self.rows: list[list[str]] = []
        self.in_tr = False
        self.in_td = False
        self.row: list[str] = []
        self.cell: list[str] = []
'''
new_init = '''        self.rows: list[list[str]] = []
        self.row_links: list[list[str]] = []
        self.in_tr = False
        self.in_td = False
        self.row: list[str] = []
        self.cell: list[str] = []
        self.links: list[str] = []
'''

if old_init in source:
    source = source.replace(old_init, new_init, 1)
    changed = True
    print("RowParser now tracks links for each table row.")
elif new_init in source:
    print("RowParser row-link tracking already present.")
else:
    raise SystemExit("Expected RowParser __init__ block not found.")

old_start = '''        if tag == "tr":
            self.in_tr = True
            self.row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.cell = []
        elif tag == "br" and self.in_td:
            self.cell.append(" ")
'''
new_start = '''        if tag == "tr":
            self.in_tr = True
            self.row = []
            self.links = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.cell = []
        elif tag == "a" and self.in_tr:
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        elif tag == "br" and self.in_td:
            self.cell.append(" ")
'''

if old_start in source:
    source = source.replace(old_start, new_start, 1)
    changed = True
    print("RowParser now captures row hrefs.")
elif new_start in source:
    print("RowParser href capture already present.")
else:
    raise SystemExit("Expected RowParser handle_starttag block not found.")

old_end = '''        elif tag == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
            self.in_tr = False
            self.row = []
'''
new_end = '''        elif tag == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
                self.row_links.append(self.links)
            self.in_tr = False
            self.row = []
            self.links = []
'''

if old_end in source:
    source = source.replace(old_end, new_end, 1)
    changed = True
    print("RowParser now preserves hrefs beside each parsed row.")
elif new_end in source:
    print("RowParser row href preservation already present.")
else:
    raise SystemExit("Expected RowParser handle_endtag block not found.")

old_signature = '''def parse_rows(html: str, number_pattern: str) -> list[tuple[str, str, str, list[str]]]:
'''
new_signature = '''def parse_rows(
    html: str,
    number_pattern: str,
    *,
    required_card_sid: int | None = None,
) -> list[tuple[str, str, str, list[str]]]:
'''

if old_signature in source:
    source = source.replace(old_signature, new_signature, 1)
    changed = True
    print("parse_rows now supports a required TCDB card-set link.")
elif new_signature in source:
    print("parse_rows card-link requirement already present.")
else:
    raise SystemExit("Expected parse_rows signature not found.")

old_loop = '''    for row in parser.rows:
        vals = [value for value in row if value]
'''
new_loop = '''    for row, links in zip(parser.rows, parser.row_links):
        if required_card_sid is not None:
            sid_fragment = f"/sid/{required_card_sid}/"
            is_real_card_row = any(
                "viewcard.cfm" in href.lower() and sid_fragment in href.lower()
                for href in links
            )
            if not is_real_card_row:
                continue

        vals = [value for value in row if value]
'''

if old_loop in source:
    source = source.replace(old_loop, new_loop, 1)
    changed = True
    print("parse_rows now rejects rows without a real ViewCard link when requested.")
elif new_loop in source:
    print("parse_rows ViewCard filtering already present.")
else:
    raise SystemExit("Expected parse_rows row loop not found.")

old_fetch_call = '''        parsed = parse_rows(fetch(page_url(url, page_index)), pattern)
'''
new_fetch_call = '''        parsed = parse_rows(
            fetch(page_url(url, page_index)),
            pattern,
            required_card_sid=14315 if sequence else None,
        )
'''

if old_fetch_call in source:
    source = source.replace(old_fetch_call, new_fetch_call, 1)
    changed = True
    print("Recollection Collection now requires TCDB ViewCard links for sid 14315.")
elif new_fetch_call in source:
    print("Recollection ViewCard filtering already present.")
else:
    raise SystemExit("Expected fetch_source_rows parse_rows call not found.")

if changed:
    path.write_text(source, encoding="utf-8")
    print("2003 Donruss structural card-row filter patch complete.")
else:
    print("2003 Donruss structural card-row filter already fully patched.")
