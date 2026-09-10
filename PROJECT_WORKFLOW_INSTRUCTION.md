# Audit Planning System — execution instruction

## Binding working rule

Continue autonomously through implementation, repository inspection, fixes, tests that do not require the user's runtime, and coherent follow-up work.

**Do not stop merely to report progress, a commit, a green regression, an analysis result, or the next intended step.**

Stop only when René's intervention is genuinely required, for example:
- a DEV/GAS runtime execution that only René can perform;
- a real functional/governance choice with material consequences that has not already been decided;
- access/authorization that only René can provide;
- an external/manual action that cannot be performed through the available tooling.

## Intervention batching rule

Use the user's time efficiently. Do not ask for `git pull`, `clasp push -f`, or a GAS test after every small slice.

Before requesting intervention:
- bundle multiple related changes into one coherent functional batch;
- complete repository-side inspection and all structural/non-runtime checks that can be done autonomously;
- prefer one consolidated regression RUN for the batch;
- split earlier only at a genuine risk boundary, unresolved governance decision, or when a live DEV result is required before safe continuation.

Carefulness remains leading: batching must never be used to hide uncertainty or combine unrelated risky changes.

When a DEV/GAS regression is required, always provide the exact source filename containing the RUN function and the exact RUN function name.

Existing functionality must be preserved/adapted; do not silently remove existing flows.

This instruction applies throughout the Audit Planning System project and is not limited to one chat or workstream.
