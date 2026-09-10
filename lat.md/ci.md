# CI and merge gates

GitHub Actions runs the test/compile matrix on both push and PR; the merge gate on develop is deliberately soft — required checks only bind PR merges, direct pushes stay allowed.

## Workflow matrix

Four workflows under `.github/workflows/`, split by what they can see:

- `ci.yml` — host-side matrix (~1 min, ubuntu): graphics/react vitest + tsc, native C++ gtest via cmake/ctest. Job id `tests`.
- `native-build.yml` — compile smoke for what gtest cannot see (podspec/prefab/JNI/OC, skity version bumps): `Android assembleDebug` (~3 min) and `iOS xcodebuild` (~27 min, Lynx pods compile from source every run).
- `deploy-website.yml` — docs site deploy; push to develop only, never on PR.
- `release.yml` — tag `v*` triggered; npm OIDC trusted publishing (staged) + git-cliff notes.

## PR gate policy

Decided 2026-09-10: a soft gate. develop branch protection requires THREE checks — `tests`, `Android assembleDebug`, `iOS xcodebuild (iphonesimulator)` — and direct pushes are not blocked: the gate guards PR merges, not the maintainer.

Single-maintainer repo, so requiring reviews would deadlock (you cannot approve your own PR). Both platform compile jobs are required because podspec/prefab/JNI/OC regressions are invisible to the host gtest matrix; the iOS ~27 min cost is contained by the per-job change probe (see [[ci#CI and merge gates#Why pull_request has no paths filter]]) — PRs that touch no native input see both jobs finish green in seconds.

Consequences:

- Normal flow: feature branch → PR → all three green → merge. CI failures surface before merge, not after.
- Hotfix path: direct push to develop remains available and intentionally unguarded.
- `enforce_admins` is off, so the maintainer can bypass a red check in an emergency — bypassing is a conscious act, not a habit.

## Why pull_request has no paths filter

A required status check whose workflow was skipped by path filtering never reports, leaving the check stuck on "Expected — Waiting for status" and blocking the merge.

So neither `ci.yml` nor `native-build.yml` filters `pull_request` by paths (`push` keeps the filter to save runner time). `ci.yml` just runs everything (~1 min). `native-build.yml` instead probes inside each job: a first step diffs `origin/<base>...HEAD` against that platform's input paths (native sources, that platform's example app, lockfiles, DEPS.py, habitat tooling, the workflow itself); when nothing matches, every later step is skipped and the job reports green in seconds. Push events skip the probe: the workflow-level paths filter already guaranteed relevance.
