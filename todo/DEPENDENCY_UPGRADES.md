# Dependency upgrade policy

Status as of 2026-07-26 (`npm audit`: 0 vulnerabilities). All versions in `package.json` are exact-pinned; Dependabot (weekly, grouped) delivers the bump PRs, each verified by the PR workflow: typecheck, unit tests, bundle, Docker image build + health smoke test.

## How upgrades work here

- **Green CI = mergeable.** Dev-tooling majors (`typescript`, `vitest`, `esbuild`, ...) may be batch-merged straight from the grouped Dependabot PR when checks pass - they cannot affect the shipped image beyond what the image build + smoke already verify. Only investigate when CI is red.
- Bumps land on `develop` and reach users only through a release (develop -> main -> Release PR), so a bad bump never ships silently.

## The one coordinated upgrade: the Node runtime

The **base image major** (`node:22-bookworm-slim` -> newer) is a production-runtime change, not tooling. Rules:

- **Done 2026-08-01: on Node 26** (jumped from 22, skipping 24). 26 is Current until it becomes LTS on 2026-10-28 - decision: Current is a stable production line and the digest-pinned, fully-gated image build de-risks the early jump; nothing to do in October, the line rolls into LTS. Future majors: same pattern, jump to the next even major once comfortable, always as ONE coordinated PR.
- When bumping, change **together in one PR**: the digest-pinned `FROM` lines in the Dockerfile, `node-version` in the CI workflows, and `@types/node` to the matching major.
- `@types/node` running ahead of the runtime (e.g. 26.x types on the 22 image) is tolerated if it arrives via a batch - the typechecker just loses some too-new-API protection; tests and the smoke cover real usage.
