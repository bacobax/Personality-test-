# Question bank

`data/questions.json` is generated. Don't edit it by hand. Edit `data/item_mapping.json` and rebuild:

```sh
pip install pandas
python3 scripts/fetch_datasets.py          # downloads ~435 MB into data/raw/ (git-ignored)
python3 scripts/build_questions.py --check
```

## How an item becomes a question

1. **Mapping** (`data/item_mapping.json`, written by hand): which dataset column, the sentence text (copied from the
   dataset's codebook), which of our 12 dimensions it measures, and `sign`. The sign is +1 if agreeing with the sentence moves the user
   toward the dimension's high pole, -1 otherwise. `key` records why.
2. **Loading:** `sign × 0.8` on that one dimension (a placeholder magnitude, `loadings_source: "default"`).
3. **Baseline:** mean of valid answers (1..points) among the dataset's filtered respondents, converted to the app's 1–5
   scale with `1 + 4·(mean − 1)/(points − 1)`. HEXACO uses 7 points and Rosenberg uses 4.
4. **Sign check** (`--check`): any two items from the same dataset and dimension must correlate in the direction
   `sign_i × sign_j` predicts. Currently 73/73 pairs pass.

## Datasets (Open Psychometrics raw data)

| id | Covers | Respondents used | Filter |
|---|---|---|---|
| ipip-ffm | sociability, anxiety, empathy, discipline, openness, +1 hostility, +1 admiration | 696,845 | `IPC == 1` (one submission per IP) |
| hexaco | honesty, hostility, risk_taking, self_image, admiration, +1 anxiety | 20,365 | both validity items answered 6–7 |
| mach-iv | trust, +1 honesty | 54,976 | no fake words ticked in the vocabulary check |
| hsns-dd | admiration_seeking, +1 honesty, +1 trust | 53,981 | dataset already filtered |
| sd3 | self_image, hostility, risk_taking, admiration | 18,192 | dataset already filtered |
| rse | self_image | 47,974 | none |
| as-sc-ad-do | dominance, +1 openness | 1,005 | none (small sample, so less reliable baselines) |

## Known limitations

- **Self-selected samples:** people who take a "Dark Triad test" answer darker than the general population (for example,
  "I tend to be cynical" has a baseline of 3.81). Baselines from sd3, hsns-dd and mach-iv are therefore probably too dark, which makes
  users look *less* dark than they are on those items.
- **Mixed populations:** baselines come from different populations, so they're comparable only roughly.
- **Placeholder loadings:** all loadings are 0.8 and single-dimension. They can't be fitted until the same people answer all 60 items (a pilot).
