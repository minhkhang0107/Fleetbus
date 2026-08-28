---
description: Implement ONLY the selected task.
---

# Implement Next Task

Read:

* .ai/MASTER_PLAN.md
* .ai/TASKS.md
* .ai/STATE.md
* .ai/DECISIONS.md

## 1. Select task

Determine the next executable PENDING task.

Never choose a task whose dependencies are incomplete.

## 2. Understand before coding

Read only the relevant parts of:

* original plan files
* MASTER_PLAN
* task specification
* related source code

Do not blindly load every plan into the context again.

## 3. Implement

Implement ONLY the selected task.

Do not:

* refactor unrelated code
* modify unrelated modules
* add speculative features
* rewrite large parts of the project

## 4. Verify locally

Run the smallest useful test/build commands.

## 5. Invoke reviewer

Invoke the `reviewer` subagent.

Provide:

* task ID
* task acceptance criteria
* current git diff
* relevant architecture context

Wait for the review result.

## 6. If review fails

Fix ONLY the reported issues.

Run the relevant tests again.

Invoke reviewer again.

Maximum review/fix cycles: 3.

If still failing after 3 cycles:

* mark task BLOCKED
* write the reason to `.ai/STATE.md`
* stop

## 7. Invoke tester

After reviewer passes, invoke `tester`.

If tester fails:

* fix the issue
* rerun tester
* maximum 2 additional attempts

## 8. Complete task

When reviewer and tester both pass:

Update `.ai/TASKS.md`:
Status: DONE

Update `.ai/STATE.md`:

* Current Task
* Completed Tasks
* Next Task
* Last Review
* Last Test

Update `.ai/DECISIONS.md` when new architectural decisions were made.

Create a commit:

feat(<task-id>): <task title>

Then stop.
