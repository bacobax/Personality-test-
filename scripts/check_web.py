"""Check that web/scoring.js gives the same numbers as scripts/scoring.py.

Usage: python3 scripts/check_web.py   (needs node; run scripts/build_web.py first)
"""
import json
import subprocess
import sys

import numpy as np

from scoring import ROOT, Bank

bank = Bank()
n = len(bank.questions)
rng = np.random.default_rng(0)

cases = []
for i in range(200):
    r = rng.integers(1, 6, n).astype(float)
    r[rng.random(n) < (0.0 if i < 50 else rng.random())] = np.nan  # some partial / mostly empty sessions
    cases.append(r)

js = """
const DATA = require('./web/data.js'); const S = require('./web/scoring.js').make(DATA);
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = cases.map(r => { const u = S.score(r); return { u, m: S.matches(u).map(x => [x.cosine, x.strength]), xy: S.project(u) }; });
console.log(JSON.stringify(out));
"""
payload = json.dumps([[None if np.isnan(x) else x for x in r] for r in cases])
res = subprocess.run(["node", "-e", js], input=payload, capture_output=True, text=True, cwd=ROOT)
if res.returncode:
    sys.exit(res.stderr)
got = json.loads(res.stdout)

P, _ = bank.pca2()
worst = 0.0
for r, g in zip(cases, got):
    u = bank.score(r)
    cos, strength = bank.matches(u)
    worst = max(worst,
                np.abs(u - g["u"]).max(),
                np.abs(cos - np.array(g["m"])[:, 0]).max(),
                np.abs(strength - np.array(g["m"])[:, 1]).max(),
                np.abs(u @ P - g["xy"]).max())
print(f"{len(cases)} cases, worst absolute difference {worst:.2e}")
sys.exit(0 if worst < 1e-5 else 1)  # data.js is rounded to 6 decimals
