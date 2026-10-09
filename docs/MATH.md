# Scoring model

Notation: $D=12$ dimensions, $K=15$ tags, $\mathcal A$ = questions answered so far.

| Symbol | Meaning |
|---|---|
| $\mathbf t_k \in [-1,1]^D$ | prototype vector of tag $k$ (`data/model.json`) |
| $r_i \in \{1,\dots,5\}$ | raw Likert answer to question $i$ |
| $\mu_i \in [1,5]$ | typical (population) answer to question $i$ |
| $\mathbf w_i \in [-1,1]^D$ | loading vector of question $i$ (reverse-keyed = negative loading) |
| $k_0 > 0$ | shrinkage constant (prior strength) |

## 1. Answer signal (relative to the typical answer)

$$a_i = \frac{r_i - \mu_i}{\max(\mu_i - 1,\; 5 - \mu_i)} \in [-1,1]$$

$a_i = 0$ means "answered like a typical person", not "no information at all" (see the confidence weight).

## 2. Confidence weight (v1 heuristic, to be replaced by IRT)

$$c_i = \tfrac12 + \tfrac12\,|a_i| \in [\tfrac12, 1]$$

## 3. Accumulators (order-independent, incremental)

$$\mathbf S \leftarrow \mathbf S + a_i\,\mathbf w_i, \qquad \mathbf W \leftarrow \mathbf W + c_i\,|\mathbf w_i|$$

## 4. Profile: every component is a weighted mean

$$u_d = \frac{S_d}{W_d + k_0} = \frac{\sum_i a_i\,w_{id}}{\sum_i c_i\,|w_{id}| + k_0}$$

With $c_i = 1$ and $k_0=0$ this is exactly a weighted mean: weights $|w_{id}|$, values $\operatorname{sign}(w_{id})\,a_i$.
$k_0$ shrinks scores toward 0 when evidence is thin. $|a_i| \le c_i$, so $u_d \in [-1,1]$.

## 4b. Range normalization

Baselines make some dimensions lopsided. For example, most people already agree with "I sympathize with others' feelings",
so even "strongly agree" barely moves `empathy` up. Let $hi_d$ and $lo_d$ be the highest and lowest $u_d$ any answer pattern
can produce: every question on $d$ answered at the extreme that pushes $d$ up, or down. Extreme answers are optimal,
since raising $|a_i|$ adds $|w_{id}|$ to $S_d$ but only $|w_{id}|/2$ to $W_d$. Then

$$\tilde u_d = \begin{cases} u_d / hi_d & u_d \ge 0 \\ u_d / |lo_d| & u_d < 0 \end{cases} \in [-1, 1]$$

0 still means "typical person". Matching uses $\tilde{\mathbf u}$. The code is `scripts/scoring.py` (`Bank.score`).

## 5. Matching

Direction: $\cos(\tilde{\mathbf u},\mathbf t_k)$ (computed on the normalized profile)

Strength: $s_k = \mathbf u^\top \hat{\mathbf t}_k$, with $\hat{\mathbf t}_k = \mathbf t_k / \lVert\mathbf t_k\rVert$

If $\lVert\mathbf u\rVert < \tau$, report a balanced profile. Otherwise show the top 3 tags by cosine.

## Open parameters

- $\mu_i$: hand-set priors at first, then replace with pilot-data means.
- $k_0$ and $\tau$: tune on simulated users.
- $c_i$: heuristic; replace with an IRT posterior once real responses exist.
