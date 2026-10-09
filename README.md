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
node scripts/check_insights.js    # verifies the feedback while answering can't hint at the result
```

To host it on GitHub Pages: Settings → Pages → Source: **GitHub Actions**, then run the "Deploy site" workflow
(it also runs on every push that changes `web/`). Pages on a private repo needs a paid GitHub plan; on the free plan the
repo has to be public. For a single-file copy to host anywhere, run `python3 scripts/build_single_file.py` (writes
`dist/personality-test.html`).

## Feedback while answering

The web test rewards answering without hinting at where the result is heading. The rule: **while answering you only
see what you said; what it means comes at the end.**

| When | What | Uses |
|---|---|---|
| every answer | tap feedback, a `+1`, the clarity % and a silhouette that sharpens, milestone notes at 15/30/45 answers | only *whether* you answered, never the value |
| a theme's 5 questions are all handled | a mirror card: the theme under a neutral name ("Plans and routine", not "Disciplined"), your 5 answers as dots, and a plain summary ("You agreed with most of these statements") | your raw 1–5 answers only |
| results page | the top archetype sharpens in, the path draws itself, and "What you said, what it means" compares each theme with typical answers, flags gaps between the two, situational themes and standout combinations | the model |

Rigor details:
- Every question scores exactly one dimension, so once a theme's card appears nothing can change that theme's score.
- Ring segments light up in the order themes complete, so a segment's position says nothing about which theme it is.
  The "one answer from complete" teaser never names a theme.
- Skips earn no `+1` and no milestone. The same answer 8 times in a row pauses the rewards and shows a nudge.
- No archetype names or category colors, no profile bars and no comparison with typical answers until the end.
- Plain mode (switch on the start screen) turns all feedback while answering off; results say when a test was taken
  in plain mode, so the two can be compared.
- `scripts/check_insights.js` checks that the same handled questions with different answer values give identical
  feedback, and that a scrambled scoring model changes nothing shown while answering.

Theme names, what each pole means and the combinations live in `data/insights.json`.

## Share and PDF

The results page has two buttons (at the top and at the bottom of the results):

- **Share** makes a picture of the results (top 3 archetypes, the 12 bars and the path) and opens the phone's share
  sheet, so it can go to any app. Browsers without a share sheet for files (e.g. desktop Firefox) save the image instead.
- **Save as PDF** downloads a multi-page A4 report with everything, including the explanations, the combinations and the
  match chart. Its pages are pictures, so the text can't be selected or searched.

Both are drawn in the browser by `web/share.js` (no library, nothing is sent anywhere) in a fixed light theme, in the
page's current language.

## Languages

The web page is available in English and Italian (EN/IT switch at the top; it defaults to the phone's language and
remembers the choice). Question, dimension, archetype and insight text for a language lives in `data/i18n/<lang>.json`; interface
strings live in `web/i18n.js`. To add a language, add `data/i18n/<lang>.json` (`scripts/build_web.py` refuses to build if
any question, dimension, archetype, theme or combination id is missing) and a block in `web/i18n.js`, then add its code to `LANGS` in
`web/app.js`. The command-line test is English only.

## Files

| Path | What |
|---|---|
| `data/model.json` | 12 dimensions and 15 tag vectors |
| `data/item_mapping.json` → `data/questions.json` | question bank (see `docs/QUESTIONS.md`) |
| `data/insights.json` | theme names, pole descriptions and combinations for the feedback |
| `docs/MATH.md` | scoring formulas |
| `scripts/scoring.py` | the formulas in code |
| `scripts/take_test.py`, `scripts/plot_track.py` | CLI and session chart |
| `web/` | the same test as a mobile web page (`scoring.js` mirrors `scripts/scoring.py`, `insights.js` is the feedback) |
| `scripts/pca_chart.py`, `scripts/similarity_heatmap.py` | model diagnostics |
