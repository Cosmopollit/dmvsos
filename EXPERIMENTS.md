# A/B framework

Lightweight, in-house. No third-party SDK. Lives in `lib/experiments.js`.

## Quick start

```jsx
'use client';
import { useExperiment } from '@/lib/experiments';
import { useAuth } from '@/lib/AuthContext';

export default function Hero() {
  const { user } = useAuth();
  const variant = useExperiment('hero_copy', user?.id);

  return variant === 'retake_pain'
    ? <h1>$50+ retake fee. Days of waiting. Prep with us. Pass first try.</h1>
    : <h1>Pass your DMV test the first time.</h1>;
}
```

That's it. Assignment is sticky per user (or per anon cookie). Exposure is logged once per (user, experiment, day) — the unique index in `migrations/006_experiments.sql` makes the API idempotent.

## Defining experiments

Edit `EXPERIMENTS` in [lib/experiments.js](lib/experiments.js):

```js
my_experiment: {
  status: 'running',              // 'running' | 'paused' | 'shipped' | 'killed'
  description: 'human-readable',
  variants: { control: 0.5, treatment: 0.5 },  // weights must sum to 1
  primary_metric: 'purchase',
}
```

Weights are not validated at runtime — keep them honest. Add new variants only at the end; reordering re-shuffles assignment.

## Reading results

```sql
select * from experiment_results where experiment = 'hero_copy';
```

The `experiment_results` view in the migration joins exposures against `auth.users` and `purchases`. For richer metrics (test starts, hit-the-wall, refund rate) extend the view.

## Sample-size rule of thumb

For a binary conversion metric (e.g. signup rate), per-variant N needed:

| Baseline | Detect lift | N per variant |
|----------|-------------|---------------|
| 5%       | +20% rel    | ~6,300        |
| 5%       | +50% rel    | ~1,100        |
| 10%      | +20% rel    | ~3,000        |
| 1%       | +50% rel    | ~5,500        |

At 485 visitors/week, a +20% lift on signup requires ~12 weeks per variant. Until traffic grows, run only **two-variant tests with large expected lifts** (copy rewrites, pricing changes), not subtle button colors.

## Active experiments

See `EXPERIMENTS` in [lib/experiments.js](lib/experiments.js):

1. **hero_copy** — current hero vs "$50 retake pain" framing. Metric: signup.
2. **pricing_anchor** — current $19.99/$29.99/$49.99 vs +$5 each. Metric: purchase.
3. **free_questions_cap** *(paused)* — 20 vs 30 vs 50 free questions before paywall.

## Workflow

1. **Hypothesis** — write it in `description`. "Higher pricing won't kill conversion because customers compare against $50 retake fee."
2. **Ship the variants.** Keep diff small — one experiment per code change.
3. **Wait for power.** Check the table above. Don't peek and ship early.
4. **Decide.** Update `status` to `shipped` (winner replaces control in code) or `killed` (revert and document).
5. **Don't run >3 simultaneously.** Interaction effects + low traffic = noise.

## When NOT to A/B

- Bug fixes — just ship.
- Strategic bets that need months to evaluate (e.g. pricing model change) — those are decisions, not tests.
- Anything where the loser variant would actively damage UX or trust.
