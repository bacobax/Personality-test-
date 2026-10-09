"""Build data/questions.json from data/item_mapping.json and the raw datasets.

Usage:
  python3 scripts/fetch_datasets.py              # once, downloads into data/raw/
  python3 scripts/build_questions.py [--check]

For each item:
  loading  = sign * default_loading on its dimension
  baseline = mean valid answer (1..points) among filtered respondents,
             converted to the app's 1-5 scale: 1 + 4 * (mean - 1) / (points - 1)

--check prints, for every pair of items from the same dataset and dimension,
their correlation; it should have the same sign as sign_i * sign_j.
"""
import itertools
import json
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
check = "--check" in sys.argv

mapping = json.loads((ROOT / "data" / "item_mapping.json").read_text())
datasets, items = mapping["datasets"], mapping["items"]

by_dataset = defaultdict(list)
for it in items:
    by_dataset[it["dataset"]].append(it)

frames, used = {}, {}
for name, its in by_dataset.items():
    ds = datasets[name]
    cols = {it["item"]: ds["column"].format(item=it["item"]) for it in its}
    df = pd.read_csv(RAW / ds["file"], sep=ds["sep"], low_memory=False)
    total = len(df)
    if ds["filter"]:
        df = df.query(ds["filter"])
    df = df[list(cols.values())].rename(columns={v: k for k, v in cols.items()})
    df = df.where((df >= 1) & (df <= ds["points"]))  # 0 / blank = missing
    frames[name] = df
    used[name] = {"title": ds["title"], "url": ds["url"], "filter": ds["filter"],
                  "points": ds["points"], "respondents": len(df), "rows_in_file": total}

questions = []
for n, it in enumerate(items, 1):
    ds = datasets[it["dataset"]]
    resp = frames[it["dataset"]][it["item"]].dropna()
    raw_mean = float(resp.mean())
    baseline = 1 + 4 * (raw_mean - 1) / (ds["points"] - 1)
    questions.append({
        "id": f"q{n:03d}",
        "text": it["text"],
        "dimension": it["dimension"],
        "source": {"dataset": it["dataset"], "item": it["item"], "key": it["key"]},
        "loadings": {it["dimension"]: round(it["sign"] * mapping["default_loading"], 2)},
        "loadings_source": "default",
        "baseline": round(baseline, 2),
        "baseline_source": "data",
        "baseline_n": int(resp.size),
        "baseline_raw": {"mean": round(raw_mean, 3), "points": ds["points"]},
    })

out = {"version": 2, "datasets": used, "questions": questions}
(ROOT / "data" / "questions.json").write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote data/questions.json ({len(questions)} questions)")

if check:
    bad = 0
    groups = defaultdict(list)
    for it in items:
        groups[(it["dataset"], it["dimension"])].append(it)
    for (name, dim), its in groups.items():
        for a, b in itertools.combinations(its, 2):
            r = frames[name][a["item"]].corr(frames[name][b["item"]])
            ok = r * a["sign"] * b["sign"] > 0
            bad += not ok
            print(f"{'ok ' if ok else 'BAD'} {dim:18s} {name:12s} {a['item']:>7s}({a['sign']:+d}) "
                  f"{b['item']:>7s}({b['sign']:+d})  r={r:+.2f}")
    print(f"{bad} sign mismatches")
    sys.exit(1 if bad else 0)
