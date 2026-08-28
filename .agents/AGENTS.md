# AGENTS.md — Autonomous Spec-to-Test Pipeline Rules

When the user provides a Spec file (e.g., `SPEC.md`, `requirements.md`, or a design document from Stitch):

## 1. AUTO TASK BREAKDOWN
- Trigger the `planner` skill to analyze the Spec file.
- If the Spec is large, AUTOMATICALLY break it down into multiple phases and granular plan files (`implementation_plan.md`).
- MANDATORY RULE: Each plan must contain at most 2–3 small tasks (Atomic Tasks). Never bundle a large task into a single execution to prevent context drift.

## 2. AUTO EXECUTION & SELF-HEALING
- Trigger the `executor` skill to sequentially execute the task list.
- After completing each task, automatically create a small Git commit (Atomic Commit).
- If minor bugs or errors arise during execution: AUTO-FIX immediately (Auto-Fix Rule) and proceed with the task list without stopping to ask the user.

## 3. AUTO TEST & VERIFICATION
- Immediately TRIGGER the `verifier` skill upon completing each task.
- AUTOMATICALLY run the project's actual test commands (e.g., `npm test`, `npm run build`, `go test`, `pytest`, etc.).
- EMPIRICAL EVIDENCE: If tests FAIL, the Agent must self-heal and refactor the code until all tests pass (100% Green) before the task is considered complete.
- Automatically mark `[x]` on the task list, record progress in `STATE.md`, and AUTOMATICALLY PROCEED to the next task until the entire Spec is completed.
