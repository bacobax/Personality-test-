"""Scoring formulas from docs/MATH.md, vectorized over the whole question bank."""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
K0 = 1.0


class Bank:
    def __init__(self, k0=K0):
        model = json.loads((ROOT / "data" / "model.json").read_text())
        qs = json.loads((ROOT / "data" / "questions.json").read_text())["questions"]
        self.k0 = k0
        self.dims = [d["id"] for d in model["dimensions"]]
        self.tags = model["tags"]
        self.T = np.array([[t["vector"].get(d, 0.0) for d in self.dims] for t in self.tags])
        self.questions = qs
        self.W = np.array([[q["loadings"].get(d, 0.0) for d in self.dims] for q in qs])
        self.mu = np.array([q["baseline"] for q in qs])
        self.lo, self.hi = self.reachable_range()

    def profile(self, r):
        """Raw profile u (steps 1-4): r holds one 1-5 answer per question."""
        a = (r - self.mu) / np.maximum(self.mu - 1, 5 - self.mu)
        c = 0.5 + 0.5 * np.abs(a)
        return (a @ self.W) / (c @ np.abs(self.W) + self.k0)

    def extreme_answers(self, direction):
        """Answer each question at the extreme that pushes the profile along `direction`."""
        push = self.W @ direction
        return np.where(push > 0, 5.0, np.where(push < 0, 1.0, np.round(self.mu)))

    def reachable_range(self):
        """Per dimension, the lowest and highest u_d any answer pattern can produce.
        Extreme answers are optimal: raising |a_i| adds |w| to S but only |w|/2 to W."""
        eye = np.eye(len(self.dims))
        hi = np.array([self.profile(self.extreme_answers(e))[d] for d, e in enumerate(eye)])
        lo = np.array([self.profile(self.extreme_answers(-e))[d] for d, e in enumerate(eye)])
        return lo, hi

    def normalize(self, u):
        """Step 4b: rescale each dimension so its reachable range becomes [-1, 1]."""
        return np.where(u >= 0, u / self.hi, u / -self.lo)

    def score(self, r):
        return self.normalize(self.profile(r))
