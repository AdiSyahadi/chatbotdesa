# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- PRE-COMMIT SAFETY

This document is a HARD RULESET for validating changes before declaring done.

No shortcut. No assumption. No "should work".

If any validation step is skipped → PATCH IS NOT COMPLETE.

---

# CORE PRINCIPLE

A change is NOT done when code is written.
A change is DONE when it is **proven working**.

"It should work" = INVALID.
"I verified it works" = VALID.

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Declare a patch complete without build success
- Declare a patch complete without container restart
- Declare a patch complete without browser verification
- Reference files that do not exist yet
- Hardcode environment-specific values (ports, domains, URLs)
- Skip grep check before deleting any code
- Assume removal has no side effects
- Batch multiple unrelated changes and test only one

If you cannot prove it works → DO NOT DECLARE DONE.

---

# MANDATORY PRE-COMMIT CHECKLIST

Before declaring ANY patch complete, execute ALL steps in order:

## Step 1: REFERENCE CHECK

Before modifying or deleting any function, variable, type, or file:

```
grep_search the EXACT name across the ENTIRE codebase
```

Rules:
- If references exist → update ALL references FIRST
- If references > 5 files → split into separate patch
- If unsure about references → DO NOT DELETE, mark as TODO
- NEVER delete then fix — ALWAYS fix references first then delete

## Step 2: ASSET CHECK

Before referencing any file in code (images, icons, manifests, configs):

```
Verify the file EXISTS in the filesystem
```

Rules:
- If file does not exist → CREATE IT FIRST before referencing
- If file is a placeholder → mark clearly in commit note
- NEVER reference a file path that does not exist
- NEVER assume "it will be created later"

## Step 3: BUILD CHECK

```
docker compose build [service] 
```

Rules:
- Build MUST exit with success
- If build fails → fix immediately, do not move on
- Read the FULL error message, not just last line
- If error is in a different file than you edited → you caused a regression

## Step 4: DEPLOY CHECK

```
docker compose up -d [service]
```

Rules:
- Container MUST start and stay running
- Check container logs for runtime errors
- If container restarts repeatedly → you have a runtime error

## Step 5: BROWSER CHECK

Open the affected page in browser and verify:

- Page loads without error
- No console errors (React errors, 404s, network errors)
- Feature works as expected
- Related features still work (regression check)

Rules:
- Test at minimum the page you changed
- Test at minimum 1 related page
- If change is global (layout, config, middleware) → test 3+ pages

## Step 6: ENVIRONMENT VALUE CHECK

Scan your changes for any hardcoded values:

```
localhost, 127.0.0.1, specific port numbers, absolute file paths
```

Rules:
- ALL environment-dependent values MUST use env variables
- Use `process.env.NEXT_PUBLIC_*` for frontend
- Use `process.env.*` for backend
- Provide fallback defaults that match development setup
- NEVER hardcode production URLs in code

---

# FAILURE RECOVERY PROTOCOL

If any step above fails:

1. STOP — do not continue to next step
2. DIAGNOSE — read the exact error
3. FIX — apply minimal correction
4. RESTART — go back to Step 1 and run ALL steps again

Do not skip steps on retry. Full validation every time.

---

# DECLARATION FORMAT

Only after ALL 6 steps pass, declare:

```
PATCH [ID] — VERIFIED
- Build: ✅
- Deploy: ✅  
- Browser: ✅
- No hardcoded env: ✅
- No orphan references: ✅
```

If ANY step is ❌ → PATCH STATUS = INCOMPLETE

---
