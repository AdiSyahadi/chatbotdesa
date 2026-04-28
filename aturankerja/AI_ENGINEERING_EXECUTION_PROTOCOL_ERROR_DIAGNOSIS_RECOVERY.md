# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- ERROR DIAGNOSIS & RECOVERY

This document is a HARD RULESET for diagnosing and recovering from errors during work.

Panic fixing = compounding errors.
Fixing symptoms = hiding root cause.
Stacking fixes on failed fixes = guaranteed disaster.

If your fix attempt failed → STOP, REVERT, RETHINK.

---

# CORE PRINCIPLE

An error is INFORMATION, not an emergency.

Read the error. Understand the error. THEN fix the error.

The sequence is ALWAYS:
```
READ → UNDERSTAND → TRACE → FIX → VERIFY
```

NEVER:
```
SEE → GUESS → FIX → HOPE
```

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Fix an error without reading the FULL error message first
- Fix an error without identifying what YOU changed that caused it
- Stack a second fix on top of a failed first fix
- Fix more than 3 errors in a row without stopping to re-analyze
- Apply a fix "from memory" without verifying it matches this specific error
- Say "this should fix it" — only "this fixes [specific cause]"
- Skip reading build output because "it's too long"
- Assume build success means runtime success
- Fix a symptom without finding the root cause
- Try the same fix twice

---

# ERROR READING PROTOCOL

## Step 1: READ THE FULL ERROR

When an error appears:

```
READ THE COMPLETE ERROR MESSAGE.
NOT just the last line.
NOT just the error code.
THE FULL MESSAGE — including file path, line number, and context.
```

### For Build Errors:
- Read from the FIRST error line (not the last)
- Build tools often show the CASCADE — first error causes the rest
- Fix the FIRST error, rebuild. Other errors may disappear.

### For Runtime Errors (browser):
- Read the FULL error message including stack trace
- Note the ERROR CODE (e.g., React #310)
- Note the FILE and LINE NUMBER from stack trace
- Check browser console for additional context

### For Container/Deploy Errors:
- Read container logs: `docker compose logs [service] --tail 50`
- Check if container is restarting: `docker compose ps`
- Check if port is already in use

## Step 2: COPY THE EXACT ERROR

Before doing anything else, record:

```
ERROR TYPE: [build / runtime / deploy / network]
ERROR MESSAGE: [exact text, not paraphrased]
ERROR FILE: [file path if shown]
ERROR LINE: [line number if shown]
```

This becomes your reference. Do NOT rely on memory of the error.

---

# ROOT CAUSE IDENTIFICATION PROTOCOL

## Rule 1: CHECK YOUR OWN CHANGES FIRST

When an error appears, the FIRST question is:

```
"What did I just change?"
```

NOT "what is wrong with the code?"
NOT "let me search the internet."

90% of errors are caused by YOUR MOST RECENT CHANGE.

Steps:
1. List the files you just edited
2. List what you changed in each file
3. For each change, ask: "Could this cause the error?"
4. If yes → you found the root cause

## Rule 2: MATCH ERROR TO CHANGE

| Error Type | Most Likely Cause |
|---|---|
| `Cannot find name 'X'` | You deleted or renamed X without updating references |
| `Module not found` | You moved/deleted a file or changed an import path |
| `Type error: X is not assignable to Y` | You changed a function signature or return type |
| `Rendered more hooks than previous render` | You put hooks after a conditional return |
| `X is not a function` | You changed an export or import incorrectly |
| `Cannot read property of undefined` | You changed data structure or API response shape |
| `UNIQUE constraint failed` | You changed database schema without migrating |
| Build hangs or times out | You created a circular dependency |

## Rule 3: TRACE THE ERROR PATH

If the error is not immediately obvious:

```
Start at the ERROR LOCATION (file + line)
Read the code at that line
Trace BACKWARDS: what calls this code?
Trace FORWARDS: what does this code call?
Find where the EXPECTED meets the ACTUAL
That gap = root cause
```

## Rule 4: NEVER GUESS

If after Steps 1-3 you still don't know the root cause:

```
DO NOT GUESS.
DO NOT TRY RANDOM FIXES.
```

Instead:
1. Add temporary logging at the error point
2. Or read more surrounding code
3. Or check git diff / recent changes
4. Or ASK THE USER for more context

---

# FIX ATTEMPT PROTOCOL

## Rule 1: ONE FIX AT A TIME

```
Make ONE change to fix ONE error.
Build/test.
If fixed → move on.
If not fixed → REVERT that change before trying another approach.
```

NEVER stack multiple fix attempts without verifying each one.

## Rule 2: REVERT ON FAILURE

If your fix attempt does NOT solve the error:

```
REVERT YOUR FIX ATTEMPT IMMEDIATELY.
Return the code to the state BEFORE your fix attempt.
Then rethink.
```

DO NOT:
- Leave the failed fix in place and try adding more code
- Modify the failed fix slightly and hope it works
- Try a completely different fix without reverting the first one

WHY: Stacked failed fixes create a state that is HARDER to debug than the original error.

## Rule 3: MAXIMUM 3 ATTEMPTS

If you have tried 3 different fixes and the error persists:

```
STOP.
```

Steps:
1. Revert ALL fix attempts (return to original error state)
2. Re-read the FULL error message
3. Re-analyze root cause from scratch (your initial diagnosis was wrong)
4. If still stuck → tell the user: "I've tried X, Y, Z — none worked. The error is [message]. I need to approach this differently."

NEVER try a 4th fix without re-analyzing from scratch.

## Rule 4: FIX LOG

Track every fix attempt:

```
ATTEMPT 1: [what I tried] → [result: fixed / not fixed / new error]
ATTEMPT 2: [what I tried] → [result]
ATTEMPT 3: [what I tried] → [result]
```

This prevents:
- Trying the same fix twice
- Losing track of what you've already attempted
- Panic-cycling through random fixes

---

# ERROR CHAIN PROTOCOL

## The Chain Problem:

```
Error A appears → fix A → Error B appears → fix B → Error C appears
```

This means your fixes are CREATING new errors.

## Chain Rules:

| Chain Depth | Action |
|---|---|
| Error 1 → fix → builds clean | ✅ Normal. Proceed. |
| Error 1 → fix → Error 2 appears | ⚠️ Your fix may be wrong. Re-analyze. |
| Error 1 → fix → Error 2 → fix → Error 3 | 🛑 STOP. Revert ALL fixes. Start over. |

## Maximum Chain Depth: 2

After 2 consecutive new errors caused by your fixes:

1. STOP fixing
2. REVERT all changes back to the state before the FIRST error
3. Re-read the original error
4. Re-analyze with fresh eyes
5. Design a DIFFERENT approach

The chain means your initial diagnosis was WRONG.
More fixing will make it WORSE.

---

# BUILD ERROR vs RUNTIME ERROR

## Critical Distinction:

```
BUILD SUCCESS ≠ RUNTIME SUCCESS
```

A build checks: syntax, types, imports, compilation.
A build does NOT check: hooks order, data flow, API responses, user interaction.

### After EVERY build success, you MUST still:

1. Restart the container
2. Open the affected page in browser
3. Check for runtime errors in console
4. Test the actual feature

### Common "build passes but runtime fails":

| Situation | Build | Runtime |
|---|---|---|
| Hooks after conditional return | ✅ Passes | ❌ React Error #310 |
| Wrong API endpoint URL | ✅ Passes | ❌ 404 at runtime |
| Missing environment variable | ✅ Passes | ❌ undefined at runtime |
| Wrong data shape from API | ✅ Passes | ❌ Cannot read property of undefined |
| Asset file doesn't exist | ✅ Passes | ❌ 404 for image/icon |

---

# ERROR SEVERITY CLASSIFICATION

Not all errors need the same response:

| Severity | Description | Response |
|---|---|---|
| **BLOCKING** | Build fails, cannot deploy | Fix immediately, this is your priority |
| **RUNTIME CRASH** | Page crashes, white screen, error boundary | Fix immediately after build passes |
| **FUNCTIONAL** | Feature doesn't work but page loads | Fix as next priority |
| **VISUAL** | Wrong layout, style issue | Fix after functional issues |
| **WARNING** | Console warning, deprecation notice | Note for later, don't fix during current patch |

ALWAYS fix in order: Blocking → Runtime Crash → Functional → Visual.
NEVER fix visual issues while blocking issues exist.

---

# COMMON ERROR PATTERNS (QUICK REFERENCE)

### Pattern: "Cannot find name 'X'"
```
Root cause: X was deleted/renamed but still referenced
Diagnosis: grep_search X across codebase → find orphan references
Fix: Either restore X or update all references
```

### Pattern: "Rendered more hooks than during the previous render"
```
Root cause: useState/useCallback/useQuery called after conditional return
Diagnosis: Find all hooks in the component → check if any are after if(...) return
Fix: Move ALL hooks above any conditional return
Verify: Both build AND browser (this is a runtime error)
```

### Pattern: "Module not found: Can't resolve 'X'"
```
Root cause: Import path is wrong or file doesn't exist
Diagnosis: Check if the file exists at the import path
Fix: Correct the path or create the missing file
```

### Pattern: Build succeeds but page shows error in browser
```
Root cause: Runtime issue (not caught by TypeScript)
Diagnosis: Open browser console → read the FULL error
Fix: Based on the specific runtime error
Verify: Browser, not just build
```

### Pattern: Fix one error, different error appears
```
Root cause: Your fix was wrong or incomplete
Diagnosis: Check if new error is in the SAME file you just edited
Fix: REVERT your change → re-analyze → try different approach
```

### Pattern: Same error keeps coming back after "fixing"
```
Root cause: You're fixing the symptom, not the cause
Diagnosis: Read the error message MORE CAREFULLY
Fix: Find the actual root cause, not just where the error appears
```

---

# PANIC PREVENTION

When you see an error, your instinct is to FIX FAST.
This instinct is WRONG.

### The Calm Protocol:

1. **PAUSE** — Do not type any code for 5 seconds (mentally)
2. **READ** — Read the full error message, including file and line
3. **THINK** — What did I change? How does that relate to this error?
4. **PLAN** — What is the minimal fix?
5. **EXECUTE** — Make the one fix
6. **VERIFY** — Build + runtime check

If at step 3 you don't know the answer → go to Root Cause Identification Protocol.
Do NOT skip to step 5.

---

# DEFINITION OF PROPER ERROR HANDLING

An error is properly handled when:

- Full error message was read ✅
- Root cause was identified (not guessed) ✅
- Fix targets root cause (not symptom) ✅
- Only ONE fix was applied ✅
- Failed fixes were reverted ✅
- Build passes ✅
- Runtime verified ✅
- No new errors introduced ✅

If ANY is not true → error handling is INCOMPLETE.

---
