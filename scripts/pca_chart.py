"""2D PCA of tag prototypes and question vectors, plus profiles users can actually reach.

PCA axes are fitted on the 15 tag vectors, uncentered so the origin stays the
"typical person". Question vectors and simulated user profiles are projected
onto the same axes. Scoring follows docs/MATH.md (k0 = 1).

Usage: python3 scripts/pca_chart.py [output.png]
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "pca.png"
K0 = 1.0

model = json.loads((ROOT / "data" / "model.json").read_text())
qs = json.loads((ROOT / "data" / "questions.json").read_text())["questions"]
dims = [d["id"] for d in model["dimensions"]]
D = len(dims)
tags = model["tags"]
T = np.array([[t["vector"].get(d, 0.0) for d in dims] for t in tags])
Wq = np.array([[q["loadings"].get(d, 0.0) for d in dims] for q in qs])
mu = np.array([q["baseline"] for q in qs])


def profile(r):
    """User profile u for answers r (one 1-5 answer per question), per docs/MATH.md."""
    a = (r - mu) / np.maximum(mu - 1, 5 - mu)
    c = 0.5 + 0.5 * np.abs(a)
    S = a @ Wq
    W = c @ np.abs(Wq)
    return S / (W + K0)


def best_answers(t):
    """Answer every question to push the profile as far toward tag t as possible."""
    push = Wq @ t
    return np.where(push > 0, 5.0, np.where(push < 0, 1.0, np.round(mu)))


# PCA on tags, uncentered (origin = typical person).
_, s, Vt = np.linalg.svd(T, full_matrices=False)
P = Vt[:2].T
explained = s[:2] ** 2 / (s ** 2).sum()

tag_xy = T @ P
reach = np.array([profile(best_answers(t)) for t in T])
reach_xy = reach @ P
rng = np.random.default_rng(0)
random_xy = np.array([profile(rng.integers(1, 6, len(qs)).astype(float)) for _ in range(1000)]) @ P
axis_xy = 0.8 * np.eye(D) @ P  # every question is +-0.8 on one dimension

# Reference palette, light mode (dataviz skill): first three categorical slots.
SURFACE, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#9a9893", "#e4e3df"
CAT = {"dark": "#2a78d6", "bright": "#eb6834", "neutral": "#1baf7a"}
cats = [t["category"] for t in tags]

plt.rcParams.update({"font.size": 9, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": MUTED, "ytick.color": MUTED, "text.color": INK})
fig, axes = plt.subplots(1, 2, figsize=(17, 8.5), facecolor=SURFACE)
lim = 1.08 * max(np.abs(tag_xy).max(), np.abs(reach_xy).max())


def frame(ax, title):
    ax.set_facecolor(SURFACE)
    ax.axhline(0, color=GRID, lw=1, zorder=0)
    ax.axvline(0, color=GRID, lw=1, zorder=0)
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.set_aspect("equal")
    ax.set_xlabel(f"PC1 ({explained[0]:.0%} of tag variance)")
    ax.set_ylabel(f"PC2 ({explained[1]:.0%} of tag variance)")
    ax.set_title(title, loc="left", color=INK, fontsize=11)
    for sp in ax.spines.values():
        sp.set_visible(False)


LABEL_OFFSET = {"adventurer": (6, -11)}


def draw_tags(ax):
    for (x, y), t, c in zip(tag_xy, tags, cats):
        ax.scatter(x, y, s=70, color=CAT[c], edgecolor=SURFACE, linewidth=2, zorder=4)
        ax.annotate(t["name"].split(" (")[0], (x, y), xytext=LABEL_OFFSET.get(t["id"], (6, 4)), textcoords="offset points",
                    color=INK, fontsize=8.5, zorder=5)


# Left: question axes (biplot) + tags.
ax = axes[0]
frame(ax, "Tags vs question directions")
AXIS_SCALE = 0.75 * lim / np.linalg.norm(axis_xy, axis=1).max()  # biplot convention: stretch for legibility
for d, (x, y) in enumerate(axis_xy * AXIS_SCALE):
    ax.plot([-x, x], [-y, y], color=MUTED, lw=1, zorder=1)
    ax.scatter([x, -x], [y, -y], s=12, color=MUTED, zorder=2)
    off = {"honesty": (-4, -10), "admiration_seeking": (-8, 6)}.get(dims[d], (2 if x >= 0 else -2, 2))
    ax.annotate(dims[d] + " +", (x, y), xytext=off, textcoords="offset points",
                ha="left" if off[0] >= 0 else "right", color=INK2, fontsize=7)
draw_tags(ax)

# Right: what users can actually reach.
ax = axes[1]
frame(ax, "Tags vs profiles users can reach")
ax.scatter(random_xy[:, 0], random_xy[:, 1], s=8, color=MUTED, alpha=0.35, linewidth=0, zorder=1)
for (tx, ty), (rx, ry), c in zip(tag_xy, reach_xy, cats):
    ax.plot([tx, rx], [ty, ry], color=CAT[c], lw=1, alpha=0.6, zorder=2)
    ax.scatter(rx, ry, s=60, facecolor=SURFACE, edgecolor=CAT[c], linewidth=2, zorder=3)
draw_tags(ax)

handles = [plt.Line2D([], [], marker="o", ls="", color=CAT[k], markersize=8, label=f"{k} tag")
           for k in CAT]
handles += [plt.Line2D([], [], marker="o", ls="", markerfacecolor=SURFACE, markeredgecolor=INK2,
                       markeredgewidth=2, markersize=8, label="most extreme reachable profile toward the tag"),
            plt.Line2D([], [], marker="o", ls="", color=MUTED, alpha=0.5, markersize=5,
                       label="1,000 users answering at random"),
            plt.Line2D([], [], color=MUTED, lw=1, label=f"question axis, ±0.8 on one dimension (left panel stretched ×{AXIS_SCALE:.1f})")]
fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=8.5)
fig.tight_layout(rect=(0, 0.07, 1, 0.97))
fig.savefig(out, dpi=110, facecolor=SURFACE)
print(f"saved {out}")
print(f"explained (uncentered) PC1={explained[0]:.2f} PC2={explained[1]:.2f} sum={explained.sum():.2f}")

print("\nper tag: |tag|, |best reachable|, cosine(best reachable, tag), share of tag reached along its direction")
for t, tv, rv in zip(tags, T, reach):
    cos = rv @ tv / np.linalg.norm(rv) / np.linalg.norm(tv)
    along = (rv @ tv) / (tv @ tv)
    print(f"  {t['name']:30s} |t|={np.linalg.norm(tv):.2f} |u*|={np.linalg.norm(rv):.2f} cos={cos:.2f} reached={along:.0%}")

hi = np.array([profile(np.where(Wq[:, d] > 0, 5.0, np.where(Wq[:, d] < 0, 1.0, np.round(mu))))[d] for d in range(D)])
lo = np.array([profile(np.where(Wq[:, d] > 0, 1.0, np.where(Wq[:, d] < 0, 5.0, np.round(mu))))[d] for d in range(D)])
tmax, tmin = T.max(axis=0), T.min(axis=0)
print("\nper dimension: reachable range of u_d vs range used by tags")
for d in range(D):
    print(f"  {dims[d]:18s} reachable [{lo[d]:+.2f}, {hi[d]:+.2f}]   tags use [{tmin[d]:+.1f}, {tmax[d]:+.1f}]")
print(f"\nrandom users: mean |u| = {np.linalg.norm(random_xy, axis=1).mean():.2f} in the PCA plane")
