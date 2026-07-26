# Parked: major dependency upgrades

Status as of 2026-07-26 (`npm audit`: 0 vulnerabilities - none of these is security-relevant, they are majors deferred on purpose). All versions in `package.json` are exact-pinned; Dependabot (weekly) delivers the bump PRs, each verified by the PR workflow (typecheck, unit tests, bundle, Docker image build + health smoke test).

| Package      | Pinned  | Parked target | Notes for the upgrade |
| ------------ | ------- | ------------- | --------------------- |
| `typescript` | 5.9.3   | 7.x           | Major generation jump (native compiler). Used for typechecking only, but majors can tighten checks - expect new errors to fix, no runtime risk. |
| `vitest`     | 3.2.7   | 4.x           | Test-runner major - config/API changes possible. Watch `test/` for deprecated matchers or config keys. |
| `esbuild`    | 0.25.12 | 0.28.x        | esbuild treats 0.x minors as potentially breaking. Bundler-output changes need the runtime smoke test, not just unit tests - check `build.mjs` options still exist. |

## Not an upgrade candidate

- `@types/node` stays on **22.x** - the types must match the digest-pinned Node 22 runtime in the Dockerfile and CI. It only moves together with a base-image bump to a newer Node LTS (then Dockerfile digest, CI `node-version` and `@types/node` change in one PR).

## How to take one

1. Accept the Dependabot PR (or bump the pin manually - exact version, no `^`/`~`).
2. `npm install` to sync the lockfile, then typecheck + tests + build.
3. Build the image and run the health smoke test (`docker build`, boot, `GET /api/health`).
4. One major per PR - do not batch them.
