---
description: # Prepare Implementation Plan
---

# Prepare Implementation Plan

Read all files under `plans/`.

The files may be very large. Do NOT attempt to implement code.

Your job is to convert the entire plan set into a structured execution plan.

## Step 1 — Read and understand

Inspect every file under:

plans/

Identify:

* goals
* functional requirements
* architecture
* data models
* APIs
* UI requirements
* dependencies
* constraints
* acceptance criteria
* testing requirements
* unresolved decisions

Do not assume information that is not present in the plans.

## Step 2 — Create `.ai/MASTER_PLAN.md`

Create a concise but complete normalized specification.

It must contain:

1. Project goal
2. Scope
3. Architecture
4. Major components
5. Important technical decisions
6. Cross-cutting constraints
7. Dependencies
8. Acceptance criteria
9. Testing strategy
10. References back to the original plan files

Do not copy the plans verbatim.
Summarize and normalize them.

## Step 3 — Create `.ai/TASKS.md`

Break the implementation into small executable tasks.

Rules:

* One task should ideally be implementable in one agent session.
* Avoid huge tasks spanning the entire application.
* Each task must have explicit dependencies.
* Each task must have measurable acceptance criteria.
* Each task must identify likely files/modules affected.
* Each task must identify tests required.

Use this format:

### T001 — <title>

Status: PENDING

Depends on:

* Txxx

Scope:

* ...

Files/modules:

* ...

Implementation:

* ...

Acceptance criteria:

* [ ] ...

Tests:

* [ ] ...

Risk:

* LOW | MEDIUM | HIGH

## Step 4 — Create `.ai/STATE.md`

Use:

# Current Task

NONE

# Completed Tasks

None

# In Progress

None

# Blocked

None

# Next Task

T001

# Last Review

None

# Last Test

None

# Important Decisions

None

## Step 5 — Create `.ai/DECISIONS.md`

Record architectural decisions and ambiguities discovered while reading the plans.

Do not implement code.

At the end, print:

* number of tasks
* dependency order
* blocked decisions
* estimated implementation phases
* highest-risk tasks
