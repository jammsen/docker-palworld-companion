# Todo: add a linter

The repo currently has **no linter** - the quality gates are typecheck (`tsc --noEmit`), unit tests and the bundle/image build. That leaves a gap: code that is type-correct and passes tests but still contains foot-guns or clutter goes unnoticed.

## What linting adds over the existing gates

- Bugs the type system cannot see: unawaited promises, unreachable code, `==` vs `===`, variable shadowing, ignored return values
- Dead weight: unused imports/variables/functions that compile fine
- Consistency: naming, import order, formatting - clean diffs no matter who wrote the code
- Runs deterministically in CI, including on lines no test executes (today this depends on CodeRabbit reviews)

## Options (pick one when implementing)

| | **Biome** | **ESLint 9 + typescript-eslint** |
| --- | --- | --- |
| Scope | Lint + format in one tool | Lint only (formatting separate, e.g. Prettier) |
| Speed / footprint | Single fast binary, near-zero config | Node-based, more config surface |
| Rule ecosystem | Smaller, curated | Largest, many plugins |
| Fit for this repo | Lightweight favourite for a small single-package repo | Pick if specific plugin rules are wanted |

## Implementation sketch

1. Add the tool as an exact-pinned devDependency + `"lint"` script in package.json
2. Extend the Dockerfile build stage: `npm run typecheck && npm run lint && npm test && npm run build`
3. Add a lint step to `.github/workflows/unittest-on-pr.yml`
4. First run will produce a findings backlog on the existing code - fix or explicitly disable rules, no blanket ignores
