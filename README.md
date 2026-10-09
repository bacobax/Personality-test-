# Personality test

A personality test that places you in a 12-dimension space and matches you to 15 archetype tags by cosine similarity.

## Take the test

```sh
pip install numpy matplotlib
python3 scripts/take_test.py
```

Answer each statement 1–5 (1 = disagree, 3 = neutral, 5 = agree). You can also type `b` to go back, `s` to skip or `q` to
finish early. At the end you get your profile, your top 3 tags, and a saved session in `sessions/` (git-ignored):

- `sessions/<time>.json`: answers, final profile, every tag's match, and the profile after each answer (`track`)
- `sessions/<time>.png`: your path on the tag PCA plane, and how your top 3 matches built up over the questions

To try it without answering yourself: `python3 scripts/take_test.py --simulate caregiver --seed 1`. Any tag id from
`data/model.json` works. `docs/example_track.png` is the chart from that run.

## Take it on your phone

`web/` is a static site (no build step, no server). It reads `web/data.js`, which is generated from the model and
question files:

```sh
python3 scripts/build_web.py      # regenerate web/data.js after changing the model or questions
python3 scripts/check_web.py      # verifies web/scoring.js matches scripts/scoring.py (needs node)
```

To host it on GitHub Pages: Settings → Pages → Source: **GitHub Actions**, then run the "Deploy site" workflow
(it also runs on every push that changes `web/`). Pages on a private repo needs a paid GitHub plan; on the free plan the
repo has to be public. For a single-file copy to host anywhere, run `python3 scripts/build_single_file.py` (writes
`dist/personality-test.html`).

## Files

| Path | What |
|---|---|
| `data/model.json` | 12 dimensions and 15 tag vectors |
| `data/item_mapping.json` → `data/questions.json` | question bank (see `docs/QUESTIONS.md`) |
| `docs/MATH.md` | scoring formulas |
| `scripts/scoring.py` | the formulas in code |
| `scripts/take_test.py`, `scripts/plot_track.py` | CLI and session chart |
| `web/` | the same test as a mobile web page (`scoring.js` mirrors `scripts/scoring.py`) |
| `scripts/pca_chart.py`, `scripts/similarity_heatmap.py` | model diagnostics |
