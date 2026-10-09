# Personality model

Data lives in [`data/model.json`](../data/model.json).

## Dimensions (N = 12)

Each dimension is bipolar on `[-1, +1]`, where 0 means neutral or average.

| id | low pole | high pole | roots |
|---|---|---|---|
| empathy | Cold | Empathic | Agreeableness, callousness (psychopathy) |
| honesty | Manipulative | Sincere | HEXACO Honesty-Humility, Machiavellianism |
| self_image | Self-doubting | Grandiose | Grandiose narcissism, self-esteem |
| admiration_seeking | Self-contained | Attention-seeking | Narcissistic admiration, exhibitionism |
| dominance | Deferential | Dominant | Extraversion: assertiveness |
| sociability | Reserved | Outgoing | Extraversion: gregariousness |
| anxiety | Calm | Anxious | Neuroticism: anxiety / vulnerability |
| hostility | Easygoing | Hostile | Neuroticism: angry hostility, low Agreeableness |
| discipline | Spontaneous | Disciplined | Conscientiousness, impulse control |
| risk_taking | Cautious | Thrill-seeking | Sensation seeking, boldness |
| openness | Conventional | Curious | Openness to experience |
| trust | Suspicious | Trusting | Agreeableness: trust, cynicism |

Design choices:
- **Behavioural sub-facets instead of the Big Five themselves.** If "narcissism" were an axis, the Narcissist tag would just be that axis. Tags should be *combinations* of the dimensions.
- **Narcissism is split** into `self_image` and `admiration_seeking`, and emotional stability is split into `anxiety` and `hostility`. These splits are what separate grandiose from vulnerable narcissism, and the Worrier from the Rebel.
- **Bipolar and centred** around 0, so cosine similarity is meaningful. Each dimension's mean across all tags is close to 0, so the tag set has no built-in bias.

## Tags (15)

| Category | Tags |
|---|---|
| dark | Grandiose Narcissist, Vulnerable Narcissist, Strategist (Machiavellian), Daredevil (Psychopathic) |
| bright | Caregiver, Leader, Performer, Thinker, Adventurer, Peacemaker, Guardian |
| neutral | Worrier, Perfectionist, Rebel, Loner |

Each tag is a prototype vector. Dimensions it doesn't list are 0, meaning the tag says nothing about them.
Dark tags get friendly display names, and they are prototypes, not diagnoses.

### Sanity checks
- Pairwise cosine between tags is at most 0.72. The closest pairs are Performer/Adventurer, Grandiose Narcissist/Daredevil and Narcissist/Performer, which are also overlaps found in real life.
- Every dimension is used by several tags (sum of |weights| per dimension is between 3.7 and 5.9), so no question axis is wasted.

## Matching (planned)
- User vector = per-dimension weighted mean of answers × question loadings.
- **Direction:** cosine(user, tag) decides which tags you resemble.
- **Strength:** the projection of the user onto the tag's unit vector decides how strongly.
- If the user's vector norm is small, show "balanced profile" instead of forcing a tag.
- Show the top 3 tags plus a 12-axis radar chart of the raw dimensions.
