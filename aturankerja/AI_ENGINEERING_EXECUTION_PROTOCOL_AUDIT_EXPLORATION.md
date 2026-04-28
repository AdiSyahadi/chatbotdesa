# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- AUDIT & EXPLORATION

This document is a HARD RULESET for performing code audits, system exploration, and status verification.

An audit based on assumption = FALSE CONFIDENCE.
An exploration that skips files = BLIND SPOTS.
A status report based on memory = UNRELIABLE.

If you did not READ the actual code → you do NOT know its state.

---

# CORE PRINCIPLE

Audit = READ and VERIFY, not RECALL and ASSUME.

Every claim you make about the codebase must be backed by:
- A file you actually read in this session, OR
- A grep/search result you actually received, OR
- A build/runtime output you actually observed

"I believe it works" = INVALID.
"I read the file and confirmed at line X" = VALID.

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Claim a feature exists without reading the actual file
- Claim a feature works without build or runtime proof
- Mark an audit item as "done" based on memory from earlier in the session
- Mark an audit item as "done" because you wrote the code (writing ≠ working)
- Assume file contents based on file name alone
- Assume a function works based on its name alone
- Skip files because "they are probably fine"
- Report "X out of X complete" without verifying each X individually
- Combine multiple audit items into one check
- Use the word "should" in audit results — only "confirmed" or "not confirmed"

---

# AUDIT EXECUTION PROTOCOL

## Step 1: DEFINE AUDIT SCOPE

Before starting any audit, write:

```
AUDIT OBJECTIVE: [what are we checking]
AUDIT ITEMS: [numbered list of specific things to verify]
AUDIT METHOD: [how each item will be verified]
```

Each item must be:
- Specific (not "check backend" → "check auth.service.ts has login method")
- Verifiable (can be proven true/false by reading code or running test)
- Independent (each item checked separately)

## Step 2: VERIFY EACH ITEM INDIVIDUALLY

For EACH audit item:

1. **READ** the actual source file (not from memory)
2. **LOCATE** the specific code (line number, function name)
3. **VERIFY** it does what is claimed
4. **RECORD** the evidence: file path + line number + what was found

```
ITEM [N]: [description]
STATUS: ✅ CONFIRMED / ❌ NOT FOUND / ⚠️ PARTIAL
EVIDENCE: [file path] line [N] — [what the code actually does]
```

## Step 3: DO NOT BATCH

```
WRONG: "Items 1-5 all confirmed ✅" (without individual evidence)
CORRECT: Each item has its own evidence line
```

## Step 4: REPORT HONESTLY

- If something is missing → say it is missing
- If something is broken → say it is broken
- If something is partial → say what part works and what doesn't
- If you cannot verify → say "unable to verify" with reason
- NEVER round up ("mostly done" = NOT done)

---

# EXPLORATION PROTOCOL

## When Exploring Unknown Code:

### Step 1: MAP BEFORE DIVE

Before reading individual files:

1. `list_dir` the relevant folders to understand structure
2. Identify ALL files in the scope (not just the ones you expect)
3. Count total files to review
4. Plan reading order (entry point → dependencies → details)

### Step 2: READ, DON'T SKIM

For each file in scope:

- Read the FULL file (or at minimum: imports, exports, function signatures, main logic)
- Do NOT read only the first 20 lines and assume the rest
- If file is large (>200 lines) → read in sections, cover ALL sections
- Note what each file exports and what it imports

### Step 3: FOLLOW THE CHAIN

When verifying a feature end-to-end:

```
Route → Controller → Service → Database/External
```

Read EACH layer. Do not assume layer N works because layer N-1 calls it.

For frontend:
```
Page → Component → Hook → API call → Backend route
```

### Step 4: CHECK CONNECTIONS

After reading individual files, verify:

- Do imports resolve to real exports?
- Do function calls match function signatures?
- Do API calls match backend route definitions?
- Do database queries match schema fields?

---

# EVIDENCE STANDARD

## What Counts as Evidence:

| Evidence Type | Valid? | Example |
|---|---|---|
| "I read the file at line 45" | ✅ | Specific, verifiable |
| "The grep returned 3 matches" | ✅ | Actual tool output |
| "Build output shows success" | ✅ | Actual command output |
| "Browser shows the page" | ✅ | Actual observation |
| "I wrote this code earlier" | ❌ | Writing ≠ working |
| "It should work because..." | ❌ | Assumption |
| "Based on the file name..." | ❌ | Name ≠ content |
| "I remember from before..." | ❌ | Memory ≠ verification |
| "This is standard practice" | ❌ | Standard ≠ implemented |

## Evidence Rule:

```
NO EVIDENCE = NO CLAIM
```

If you cannot point to a file, line, or output → do not make the claim.

---

# AUDIT ANTI-PATTERNS (NEVER DO)

### Anti-Pattern 1: THE OPTIMISTIC AUDIT
```
❌ "All 20 items confirmed complete ✅"
(but only actually read 5 files — assumed the rest)
```

### Anti-Pattern 2: THE MEMORY AUDIT
```
❌ "I implemented this earlier so it works"
(but didn't verify after build/deploy — could have been overwritten or broken)
```

### Anti-Pattern 3: THE NAME AUDIT
```
❌ "appointment.service.ts exists so appointments feature is complete"
(but didn't check if the file has actual working code, correct imports, matching routes)
```

### Anti-Pattern 4: THE PARTIAL AUDIT
```
❌ "Backend complete ✅" (checked routes but not service logic)
❌ "Frontend complete ✅" (checked page exists but not that it compiles)
```

### Anti-Pattern 5: THE BATCHED AUDIT
```
❌ "Items 1-10: all done"
(lumped together without individual verification — hides failures)
```

---

# EXPLORATION DEPTH LEVELS

When asked to audit or explore, clarify depth:

| Level | What to Check | When to Use |
|---|---|---|
| **Quick** | File exists + exports match | Quick sanity check |
| **Standard** | File exists + logic correct + imports resolve | Normal audit |
| **Thorough** | Full end-to-end: route → controller → service → DB + frontend page → API call → displays correctly | Feature verification |
| **Deep** | All of Thorough + edge cases, error handling, security, performance | Pre-release audit |

Default = **Standard** unless user specifies otherwise.

For each level, the number of files you must ACTUALLY READ:

| Level | Minimum Files Read |
|---|---|
| Quick | Entry point file only |
| Standard | All files in the feature (route + controller + service + page) |
| Thorough | All feature files + related files (shared utils, types, middleware) |
| Deep | Everything in Thorough + test files + config + similar features for consistency |

---

# COMPLETENESS CHECK

Before reporting audit results:

1. Count total items in audit scope
2. Count items with INDIVIDUAL evidence
3. If evidence count < total count → audit is INCOMPLETE
4. Report: "Verified X of Y items. Z items could not be verified because [reason]."

NEVER report 100% unless you have evidence for 100%.

---

# HONEST REPORTING FORMAT

```
AUDIT REPORT: [objective]
Date: [date]
Depth: [quick/standard/thorough/deep]

RESULTS:
[1] Feature A — ✅ CONFIRMED
    Evidence: [file] line [N] — [description]

[2] Feature B — ❌ NOT FOUND  
    Evidence: Searched [file], grep returned 0 matches

[3] Feature C — ⚠️ PARTIAL
    Evidence: Backend exists ([file] line [N]), frontend page missing

SUMMARY: [X] confirmed, [Y] missing, [Z] partial
OVERALL: [PASS / FAIL / INCOMPLETE]
```

---

# THE GOLDEN RULE

```
If you did not open the file and read the code in THIS session,
you do not know what is in the file.

Period.
```

---
