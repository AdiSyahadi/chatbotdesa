# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- DELETION & SIDE EFFECT SAFETY

This document is a HARD RULESET for safely deleting, renaming, or modifying shared code.

Deletion without impact analysis = guaranteed breakage.

If you cannot list ALL affected locations → DO NOT DELETE.

---

# CORE PRINCIPLE

Code is a dependency graph.
Every function, variable, type, and file is a NODE.
Every import, reference, and usage is an EDGE.

Removing a node without removing its edges = BROKEN GRAPH.

You must trace ALL edges before removing ANY node.

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Delete a function without grepping all usages first
- Rename a variable without updating all references
- Remove a file without checking all imports
- Modify a function signature without updating all callers
- Change an API response shape without updating all consumers
- Modify global config (layout, middleware, next.config) without multi-page testing
- Apply blanket changes (e.g., headers for ALL routes) without filtering

---

# DELETION PROTOCOL

## Before Deleting ANY code (function, variable, type, constant, file):

### Step 1: IMPACT SCAN

```
grep_search the EXACT name across entire codebase
```

Document:
- Total number of references
- List of files that reference it
- Whether references are in same file or cross-file

### Step 2: CLASSIFY IMPACT

| References | Action |
|---|---|
| 0 references | Safe to delete |
| 1-3 references in same file | Fix then delete in same patch |
| 1-3 references in other files | Fix all references first, then delete |
| 4+ references | Split into multiple patches |

### Step 3: FIX REFERENCES FIRST

```
Update ALL references BEFORE deleting the original.
```

Order:
1. Add replacement (if renaming/refactoring)
2. Update all references to use replacement
3. Verify build passes
4. Remove original
5. Verify build passes again

NEVER: Delete first, fix later.
ALWAYS: Fix references first, delete last.

### Step 4: VERIFY

```
grep_search again after deletion to confirm ZERO remaining references
```

If any reference remains → patch is INCOMPLETE.

---

# RENAME PROTOCOL

Renaming is deletion + creation. Same rules apply.

1. grep_search old name → list all references
2. Create new name (if needed)
3. Update ALL references to new name
4. Remove old name
5. grep_search old name → must return 0 results
6. Build verify

---

# SIDE EFFECT ANALYSIS PROTOCOL

## Before Modifying GLOBAL Code:

Global code = code that affects multiple pages/features:
- `layout.tsx`
- `middleware.ts`
- `next.config.mjs`
- `app.ts` (Express)
- `providers.tsx`
- Route index files
- Shared hooks/utils/services
- CSS globals
- Docker compose / environment files

### Step 1: LIST AFFECTED SCOPE

Before changing global code, write down:
- What pages/features use this code?
- What behavior will change?
- Can ANY page break from this change?

### Step 2: FILTER YOUR CHANGES

If your change should only affect specific routes/pages:

```
Add explicit conditions/filters — do NOT apply blanket rules.
```

Example — WRONG:
```js
// Applies to ALL routes including API
headers: [{ source: '/:path*', key: 'Content-Type', value: 'text/html; charset=utf-8' }]
```

Example — CORRECT:
```js
// Only applies to HTML pages
headers: [{ source: '/((?!api|_next).*)', key: 'Content-Type', value: 'text/html; charset=utf-8' }]
```

### Step 3: MULTI-PAGE TEST

After modifying global code:
- Test minimum 3 different pages
- Test minimum 1 API endpoint (if backend change)
- Test login flow (if auth-related change)
- Test at least 1 page with data + 1 empty state page

### Step 4: ROLLBACK PLAN

Before applying global changes, confirm:
- Can this change be reverted easily?
- Does this change affect database? (if yes → extra caution)
- Does this change affect other services? (if yes → coordinate)

---

# CONFIG FILE RULES

## next.config.mjs
- Changes affect ENTIRE frontend app
- MUST rebuild + restart after changes
- Test at minimum: dashboard, login, 1 other page

## layout.tsx  
- Changes affect EVERY page
- Metadata changes need browser cache clear to verify
- JSON-LD/script injection: verify via View Source, not DevTools

## middleware.ts
- Changes affect EVERY request
- Test: protected routes, public routes, API routes, static assets
- NEVER block static files (_next, favicon, etc.)

## docker-compose.yml
- Changes affect ALL containers
- MUST `docker compose down` then `up` for some changes
- Environment variable changes need container recreation

---

# EMERGENCY RULE

If you accidentally delete something and build breaks:

1. DO NOT PANIC-FIX by guessing
2. Read the EXACT error message
3. Identify what was deleted
4. Check git diff or recent edits
5. RESTORE the deleted code
6. Build verify
7. Then plan proper deletion with full protocol

Fast panic fixes create MORE bugs.

---
