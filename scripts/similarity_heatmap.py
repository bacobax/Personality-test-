"""Pairwise cosine similarity and dot product between tag vectors, as heatmaps.

Usage: python3 scripts/similarity_heatmap.py [output.png]
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "similarity.png"

model = json.loads((ROOT / "data" / "model.json").read_text())
dims = [d["id"] for d in model["dimensions"]]
tags = model["tags"]
names = [t["name"] for t in tags]
X = np.array([[t["vector"].get(d, 0.0) for d in dims] for t in tags])

dot = X @ X.T
norm = np.linalg.norm(X, axis=1)
cos = dot / np.outer(norm, norm)

fig, axes = plt.subplots(1, 2, figsize=(20, 9))
for ax, M, title, vmin, vmax in [
    (axes[0], cos, "Cosine similarity (direction)", -1, 1),
    (axes[1], dot, "Dot product (direction x magnitude)", -dot.max(), dot.max()),
]:
    im = ax.imshow(M, cmap="RdBu_r", vmin=vmin, vmax=vmax)
    ax.set_xticks(range(len(names)), names, rotation=60, ha="right", fontsize=8)
    ax.set_yticks(range(len(names)), names, fontsize=8)
    ax.set_title(title)
    for i in range(len(names)):
        for j in range(len(names)):
            v = M[i, j]
            ax.text(j, i, f"{v:.2f}" if M is cos else f"{v:.1f}", ha="center",
                    va="center", fontsize=6.5,
                    color="white" if abs(v) > 0.6 * vmax else "black")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.02)

fig.tight_layout()
out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(out, dpi=110)
print(f"saved {out}")

off = ~np.eye(len(names), dtype=bool)
iu = np.triu_indices(len(names), 1)
print(f"cosine off-diagonal: min {cos[iu].min():.2f}, mean {cos[iu].mean():.2f}, max {cos[iu].max():.2f}")
print("vector norms:", ", ".join(f"{n}={v:.2f}" for n, v in zip(names, norm)))
