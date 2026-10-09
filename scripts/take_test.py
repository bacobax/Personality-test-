"""Take the personality test in the terminal.

Usage:
  python3 scripts/take_test.py                    # interactive
  python3 scripts/take_test.py --simulate caregiver --seed 1   # auto-answer like a tag (for testing)

Answers: 1-5 (1 = disagree, 3 = neutral, 5 = agree), b = back, s = skip, q = finish early.
After each answer the current profile (normalized weighted mean, docs/MATH.md step 4b)
is recorded; the session and a chart of its path are saved in sessions/.
"""
import argparse
import datetime
import json

import numpy as np

from plot_track import plot
from scoring import ROOT, Bank

SCALE = "1 disagree · 2 · 3 neutral · 4 · 5 agree   (b back, s skip, q finish)"


def bar(v, width=10):
    """Diverging text bar: negative fills left of the center line, positive fills right."""
    n = int(round(min(abs(v), 1) * width))
    left = " " * (width - n) + "█" * n if v < 0 else " " * width
    right = "█" * n + " " * (width - n) if v > 0 else " " * width
    return f"{left}│{right}"


def simulated_answer(bank, q_index, tag, rng):
    """An answer a person shaped like `tag` might give: inverts the signal formula so the
    answer's signal matches the tag's value on the question's dimension, plus noise."""
    w = bank.W[q_index]
    target = np.clip(w @ bank.T[tag] / np.abs(w).sum(), -1, 1)  # desired signal a_i
    mu = bank.mu[q_index]
    ideal = mu + target * max(mu - 1, 5 - mu)
    return float(np.clip(np.round(ideal + rng.normal(0, 0.7)), 1, 5))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=None, help="question order seed")
    ap.add_argument("--tau", type=float, default=0.5, help="balanced-profile threshold on |u| (provisional)")
    ap.add_argument("--simulate", metavar="TAG_ID", help="answer automatically like this tag")
    ap.add_argument("--no-chart", action="store_true")
    args = ap.parse_args()

    bank = Bank()
    n = len(bank.questions)
    rng = np.random.default_rng(args.seed)
    order = rng.permutation(n)
    sim = None
    if args.simulate:
        sim = next(i for i, t in enumerate(bank.tags) if t["id"] == args.simulate)

    r = np.full(n, np.nan)
    history = []  # question indices in the order they were handled (answered or skipped)
    while len(history) < n:
        qi = order[len(history)]
        q = bank.questions[qi]
        prompt = f"\n[{len(history) + 1}/{n}] {q['text']}\n  {SCALE}\n> "
        if sim is not None:
            raw = str(int(simulated_answer(bank, qi, sim, rng)))
            print(prompt + raw)
        else:
            try:
                raw = input(prompt).strip().lower()
            except EOFError:
                break
        if raw == "q":
            break
        if raw == "b":
            if history:
                r[history.pop()] = np.nan
            continue
        if raw == "s":
            history.append(qi)
            continue
        if raw in {"1", "2", "3", "4", "5"}:
            r[qi] = float(raw)
            history.append(qi)
            continue
        print("  please type 1-5, b, s or q")

    # Track: profile after each handled question, starting from the typical person (all zeros).
    track, partial = [np.zeros(len(bank.dims))], np.full(n, np.nan)
    for qi in history:
        partial[qi] = r[qi]
        track.append(bank.score(partial))
    u = track[-1]
    cos, strength = bank.matches(u)
    ranked = np.argsort(-cos)
    answered = int((~np.isnan(r)).sum())

    print(f"\n{'=' * 60}\nYour profile ({answered} answered, {len(history) - answered} skipped)\n")
    names = {d["id"]: d for d in json.loads((ROOT / "data" / "model.json").read_text())["dimensions"]}
    for d, v in zip(bank.dims, u):
        print(f"  {names[d]['low']:>15s} {bar(v)} {names[d]['high']:<17s} {v:+.2f}")
    norm = float(np.linalg.norm(u))
    print(f"\n  profile strength |u| = {norm:.2f}")
    if norm < args.tau:
        print(f"  Balanced profile: |u| is below {args.tau}, so no tag stands out.")
    print("\nClosest tags (cosine = how similar the direction is, strength = how strongly):")
    for k in ranked[:3]:
        t = bank.tags[k]
        print(f"  {t['name']:30s} cosine {cos[k]:5.0%}   strength {strength[k]:+.2f}   {t['description']}")
    print("\nThese labels are rough archetypes, not a diagnosis.")

    stamp = datetime.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    out_dir = ROOT / "sessions"
    out_dir.mkdir(exist_ok=True)
    session = {
        "timestamp": stamp, "seed": args.seed, "simulated": args.simulate,
        "answers": [{"id": bank.questions[qi]["id"], "text": bank.questions[qi]["text"],
                     "answer": None if np.isnan(r[qi]) else int(r[qi])} for qi in history],
        "profile": dict(zip(bank.dims, np.round(u, 4).tolist())),
        "matches": [{"index": int(k), "tag": bank.tags[k]["id"], "cosine": round(float(cos[k]), 4),
                     "strength": round(float(strength[k]), 4)} for k in ranked],
        "track": np.round(np.array(track), 4).tolist(),
    }
    path = out_dir / f"{stamp}.json"
    path.write_text(json.dumps(session, indent=1) + "\n")
    print(f"\nSession saved to {path.relative_to(ROOT)}")
    if not args.no_chart:
        print(f"Chart saved to {plot(session, path.with_suffix('.png'), bank).relative_to(ROOT)}")


if __name__ == "__main__":
    main()
