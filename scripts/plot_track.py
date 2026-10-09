"""Draw the path a test session's profile followed, on the tag PCA plane.

Usage: python3 scripts/plot_track.py sessions/<session>.json [output.png]
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection

from scoring import Bank

SURFACE, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#9a9893", "#e4e3df"
CAT = {"dark": "#2a78d6", "bright": "#eb6834", "neutral": "#1baf7a"}
TOP_STYLES = [(INK, "-"), (INK2, "--"), (MUTED, ":")]


def plot(session, out, bank=None):
    bank = bank or Bank()
    P, explained = bank.pca2()
    track = np.array(session["track"])  # (steps + 1) x D, row 0 = before any answer
    steps = np.arange(len(track))
    xy = track @ P
    tag_xy = bank.T @ P
    top = [m["index"] for m in session["matches"][:3]]

    plt.rcParams.update({"font.size": 9, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                         "xtick.color": MUTED, "ytick.color": MUTED, "text.color": INK})
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(17, 8), facecolor=SURFACE,
                                  gridspec_kw={"width_ratios": [1.15, 1]})

    # Left: path on the PCA plane.
    lim = 1.1 * max(np.abs(tag_xy).max(), np.abs(xy).max())
    ax.set_facecolor(SURFACE)
    ax.axhline(0, color=GRID, lw=1, zorder=0)
    ax.axvline(0, color=GRID, lw=1, zorder=0)
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.set_aspect("equal")
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.set_xlabel(f"PC1 ({explained[0]:.0%} of tag variance)")
    ax.set_ylabel(f"PC2 ({explained[1]:.0%} of tag variance)")
    ax.set_title("Your path through the test (light = early answers, dark = late)", loc="left", fontsize=11)

    for i, ((x, y), t) in enumerate(zip(tag_xy, bank.tags)):
        ax.scatter(x, y, s=70, color=CAT[t["category"]], edgecolor=SURFACE, linewidth=2, zorder=4)
        if i in top:
            ax.scatter(x, y, s=260, facecolor="none", edgecolor=INK, linewidth=1.5, zorder=4)
        ax.annotate(t["name"].split(" (")[0], (x, y), xytext=(7, -12) if t["id"] == "adventurer" else (7, 5),
                    textcoords="offset points",
                    fontsize=9 if i in top else 8.5, fontweight="bold" if i in top else "normal", zorder=5)

    # Time is encoded by lightness only (gray ramp), so it never competes with the tag colors.
    shade = plt.cm.Greys(0.25 + 0.7 * steps / max(steps[-1], 1))
    segs = np.stack([xy[:-1], xy[1:]], axis=1)
    ax.add_collection(LineCollection(segs, colors=shade[1:], linewidths=1.6, zorder=2))
    ax.scatter(xy[1:-1, 0], xy[1:-1, 1], s=12, color=shade[1:-1], zorder=3)
    ax.scatter(*xy[0], s=70, facecolor=SURFACE, edgecolor=INK2, linewidth=2, zorder=5)
    ax.annotate("start: typical person", xy[0], xytext=(8, -12), textcoords="offset points", color=INK2, fontsize=8.5)
    ax.scatter(*xy[-1], s=110, color=INK, edgecolor=SURFACE, linewidth=2, zorder=6)
    ax.annotate(f"you, after {len(track) - 1} answers", xy[-1], xytext=(8, -12), textcoords="offset points",
                fontsize=9, fontweight="bold")

    # Right: cosine with the final top-3 tags over time.
    cos_t = np.array([bank.matches(u)[0] if np.linalg.norm(u) > 0 else np.zeros(len(bank.tags)) for u in track])
    ax2.set_facecolor(SURFACE)
    for sp in ("top", "right"):
        ax2.spines[sp].set_visible(False)
    ax2.axhline(0, color=GRID, lw=1, zorder=0)
    ax2.grid(axis="y", color=GRID, lw=0.6)
    for k, (color, ls) in zip(top, TOP_STYLES):
        ax2.plot(steps, cos_t[:, k], color=color, ls=ls, lw=2)
        ax2.annotate(f"{bank.tags[k]['name'].split(' (')[0]} {cos_t[-1, k]:.0%}", (steps[-1], cos_t[-1, k]),
                     xytext=(6, 0), textcoords="offset points", va="center", fontsize=9)
    ax2.set_xlim(0, steps[-1] * 1.22 + 1)
    ax2.set_ylim(-1, 1)
    ax2.set_xlabel("questions answered")
    ax2.set_ylabel("cosine similarity with tag")
    ax2.set_title("How your top 3 matches built up", loc="left", fontsize=11)

    fig.tight_layout()
    fig.savefig(out, dpi=110, facecolor=SURFACE)
    plt.close(fig)
    return out


if __name__ == "__main__":
    path = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else path.with_suffix(".png")
    print(f"saved {plot(json.loads(path.read_text()), out)}")
