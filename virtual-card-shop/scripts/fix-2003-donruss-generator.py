from pathlib import Path

path = Path(__file__).with_name("generate-2003-donruss-baseball.py")
source = path.read_text(encoding="utf-8")

old = '''    if "SN206" not in lookup[("stat-line-career", "1")][5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {lookup[(\\\"stat-line-career\\\", \\\"1\\\")]}")
    if "SN111" not in lookup[("stat-line-season", "1")][5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {lookup[(\\\"stat-line-season\\\", \\\"1\\\")]}")
'''

new = '''    career_one = lookup[("stat-line-career", "1")]
    if "SN206" not in career_one[5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {career_one}")

    season_one = lookup[("stat-line-season", "1")]
    if "SN111" not in season_one[5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {season_one}")
'''

if old in source:
    path.write_text(source.replace(old, new), encoding="utf-8")
    print("Patched 2003 Donruss generator Stat Line audit syntax.")
elif new in source:
    print("2003 Donruss generator already patched.")
else:
    raise SystemExit("Expected Stat Line audit block not found; refusing to modify generator.")
