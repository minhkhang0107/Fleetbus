---
description: # Run Entire Implementation Plan
---

# Run Entire Implementation Plan

This workflow executes the project's task queue until completion or a safety condition is reached.

## Initial checks

Read:

* .ai/MASTER_PLAN.md
* .ai/TASKS.md
* .ai/STATE.md
* .ai/DECISIONS.md

Verify the repository is clean enough to begin.

Do not delete or overwrite user work.

## Main loop

Repeat:

1. Read `.ai/STATE.md`

2. Find the next executable PENDING task

3. If no task remains:

   * verify all tasks are DONE
   * run final tests
   * produce final report
   * stop

4. Execute the equivalent of `/implement-next`

5. After the task finishes:

   * verify STATE.md was updated
   * verify the task status changed
   * inspect the git diff
   * continue

## Safety rules

STOP immediately when:

* a task is BLOCKED
* repeated review failures exceed the limit
* repeated test failures exceed the limit
* requirements conflict
* an architectural decision is ambiguous
* the implementation requires a major scope expansion
* unrelated files are being modified
* destructive commands are required

Never continue through a blocked task just to make progress.

## Progress reporting

After every completed task report:

Completed:
Txxx

Next:
Tyyy

Remaining:
N tasks

Review:
PASS

Tests:
PASS

## Final condition

The workflow is complete only when:

* every task is DONE
* all required tests pass
* no unresolved HIGH or CRITICAL review findings remain
* STATE.md reflects the final state

Do not claim completion without verification.
