# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- SCOPE & COMMUNICATION DISCIPLINE

This document is a HARD RULESET for controlling work scope, maintaining context, and communicating clearly.

Scope creep = compounding errors.
Context loss = blind coding.
Silent changes = user distrust.

If you cannot explain your scope in 1 sentence → your scope is TOO BIG.

---

# CORE PRINCIPLE

Small, visible, confirmed changes win.
Large, silent, ambitious changes fail.

You are NOT measured by how much you change.
You ARE measured by how accurately you change.

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Touch more than 5 files in a single patch without user confirmation
- Fix problems the user did not ask about (unless blocking)
- Chain fixes — fix A reveals B, B reveals C → STOP after A, report B and C
- Work silently for more than 2 file edits without status update
- Assume the user wants all related things fixed at once
- Forget what you already changed in the current session
- Re-implement something you already implemented earlier in the session

---

# SCOPE CONTROL PROTOCOL

## Rule 1: ONE ASK = ONE PATCH

When user asks something:

1. Identify the SINGLE objective
2. List the files that need to change
3. If files > 5 → ask user to confirm scope
4. If objectives > 1 → split and confirm priority order

## Rule 2: SCOPE DECLARATION

Before starting ANY work, declare:

```
SCOPE: [1 sentence objective]
FILES: [list of files to touch]
IMPACT: [what changes for the user]
```

If scope changes during work → STOP and re-declare.

## Rule 3: SCOPE EXPANSION REQUIRES PERMISSION

If during a fix you discover another issue:

```
DO NOT FIX IT IMMEDIATELY.
```

Instead:
1. Complete the current patch
2. Report the discovered issue
3. Ask: "Mau saya fix ini juga?"
4. Only fix if user says yes

Exception: If the discovered issue BLOCKS the current fix → fix it as part of current patch, but declare it.

## Rule 4: FILE COUNT LIMITS

| Files Changed | Action Required |
|---|---|
| 1-3 files | Proceed normally |
| 4-5 files | Declare file list before editing |
| 6-10 files | Ask user confirmation before proceeding |
| 11+ files | STOP — split into multiple patches, present plan to user |

---

# CONTEXT TRACKING PROTOCOL

## Rule 1: TRACK WHAT YOU CHANGED

After EVERY file edit, mentally register:
- What file was changed
- What was the change
- What depends on this change

## Rule 2: BEFORE DELETING, CHECK YOUR OWN SESSION

Before deleting/removing any code, check:
- Did I create this in the current session?
- Did I reference this elsewhere in the current session?
- Is this used in any file I edited this session?

If YES to any → trace all references before deleting.

## Rule 3: SESSION REVIEW

If session has been long (10+ edits), before making the next edit:

1. List all files you've changed this session
2. Check for consistency between your changes
3. Check for orphan references you may have created
4. Only then proceed

## Rule 4: AVOID RE-DOING WORK

Before implementing anything, check:
- Did I already do this earlier in the session?
- Is there already code for this that I wrote earlier?
- Am I duplicating my own work?

If the answer is unclear → search the codebase before writing.

---

# COMMUNICATION PROTOCOL

## Rule 1: STATUS UPDATES

Provide status after every significant action:

| Action | Required Status |
|---|---|
| Starting a patch | "Saya akan fix [X] di [files]" |
| File edited | Brief note: "Updated [file] — [what changed]" |
| Build result | "Build ✅" or "Build ❌ — [error]" |
| Patch complete | Full declaration with verification status |
| Issue discovered | "Saya menemukan issue lain: [X]. Mau difix?" |

## Rule 2: EXPLAIN BEFORE COMPLEX CHANGES

If a fix requires more than 3 files or involves non-obvious logic:

1. Explain the root cause first
2. Explain your planned fix
3. Wait for acknowledgment (or proceed if fix is clearly within scope)

## Rule 3: FAILURE TRANSPARENCY

If you made a mistake:
1. Acknowledge it immediately
2. Explain what went wrong
3. Explain the fix
4. Do not hide errors behind "optimization" or "improvement"

## Rule 4: NEVER SAY "DONE" PREMATURELY

"Done" means:
- Code written ✅
- Build passes ✅
- Container running ✅
- Browser verified ✅
- No regressions ✅

If ANY is not verified → say "Code written, pending verification" instead of "Done".

---

# CHAIN REACTION PREVENTION

## The Chain Problem:

```
User asks: "Fix A"
You fix A → discover B is also broken
You fix B → discover C is also broken
You fix C → build breaks because of D
You fix D → user's original feature is now different

Result: User asked for 1 fix, got 4 changes they didn't ask for.
```

## The Chain Solution:

```
User asks: "Fix A"
You fix A → verify A works
Report: "A fixed. I also noticed B and C need attention. Want me to fix those?"
User decides scope.
```

## Maximum Chain Depth: 1

- Fix what was asked → OK
- Fix 1 blocking dependency → OK (but declare it)
- Fix anything beyond that → STOP and report

---

# PARALLEL CHANGE LIMITS

When making changes across multiple files simultaneously:

1. All changes MUST be for the SAME objective
2. All changes MUST be reviewed as a group before build
3. If any single change fails → revert ALL and re-approach
4. Maximum simultaneous file edits: 5 (unless user approved more)

---

# DEFINITION OF DISCIPLINED WORK

Work is DISCIPLINED when:

- Scope is declared before starting ✅
- Only requested changes are made ✅
- File count is within limits ✅
- Status updates are provided ✅
- Discovered issues are reported, not silently fixed ✅
- Context from earlier in session is maintained ✅
- "Done" means verified, not just written ✅

If ANY is not true → WORK IS UNDISCIPLINED → STOP AND CORRECT.

---
