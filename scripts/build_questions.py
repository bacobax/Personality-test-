"""Build data/questions.json from the IPIP-FFM public dataset.

Usage:
  python3 scripts/build_questions.py <data-final.csv> <codebook.txt> [--trace]

Baseline mu_i = mean valid (1-5) response among respondents with IPC == 1.
Loadings are a placeholder (single dimension, DEFAULT_LOADING) until fitted.
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOADING = 0.8

csv_path, codebook_path = Path(sys.argv[1]), Path(sys.argv[2])
trace = "--trace" in sys.argv

mapping = json.loads((ROOT / "data" / "ipip_mapping.json").read_text())
item_ids = list(mapping["items"])

texts = {}
for line in codebook_path.read_text().splitlines():
    code, _, text = line.partition("\t")
    if code in mapping["items"]:
        texts[code] = text.strip()

df = pd.read_csv(csv_path, sep="\t", usecols=item_ids + ["IPC"])
raw_rows = len(df)
df = df[df["IPC"] == 1]
clean_rows = len(df)

questions = []
for n, item in enumerate(item_ids, 1):
    scale = mapping["scales"][item.rstrip("0123456789")]
    key = mapping["items"][item]["ipip_key"]
    sign = (1 if key == "+" else -1) * (1 if scale["same_pole"] else -1)
    resp = df[item]
    resp = resp[(resp >= 1) & (resp <= 5)]
    mu = float(resp.mean())
    q = {
        "id": f"q{n:03d}",
        "text": texts[item],
        "source": {"dataset": "ipip-ffm", "item": item, "ipip_factor": scale["ipip_factor"], "ipip_key": key},
        "loadings": {scale["dimension"]: round(sign * DEFAULT_LOADING, 2)},
        "loadings_source": "default",
        "baseline": round(mu, 2),
        "baseline_source": "data",
        "baseline_n": int(resp.size),
    }
    questions.append(q)
    if trace:
        print(f"{item}: {texts[item]!r}")
        print(f"   ipip_key={key}  scale={item[:3]}->{scale['dimension']} same_pole={scale['same_pole']}  sign={sign:+d}")
        print(f"   valid n={resp.size}  counts={dict(resp.astype(int).value_counts().sort_index())}  mean={mu:.4f}")

out = {
    "version": 1,
    "baseline_population": f"IPC==1 respondents, n={clean_rows} of {raw_rows} rows; self-selected online sample 2016-2018",
    "questions": questions,
}
(ROOT / "data" / "questions.json").write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote data/questions.json ({len(questions)} questions)")
