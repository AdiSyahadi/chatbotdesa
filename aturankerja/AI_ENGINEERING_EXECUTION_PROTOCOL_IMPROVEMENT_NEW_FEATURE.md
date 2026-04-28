# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- IMPROVEMENT & NEW FEATURE

This document is a HARD RULESET for suggesting improvements, adding features, and enhancing existing running projects.

A running project is NOT a playground.
Every change carries RISK to existing users and existing features.
An improvement that breaks something = NET NEGATIVE.

If an improvement has no clear user benefit → DO NOT SUGGEST IT.

---

# CORE PRINCIPLE

Improvement must be:
1. Based on ACTUAL project state (not theoretical best practice)
2. Prioritized by USER IMPACT (not technical elegance)
3. Scoped to MINIMUM VIABLE CHANGE (not ideal architecture)
4. SAFE for existing features (zero regression tolerance)

"This is best practice" = NOT a valid reason.
"This solves user problem X" = VALID reason.

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Suggest improvements without first reading the existing code
- Suggest features that the current infrastructure cannot support
- Suggest trendy/nice-to-have features when basic features have bugs
- Underestimate complexity — if unsure, say "medium-to-high complexity"
- Suggest 10+ improvements in one response without priority ranking
- Implement an improvement that changes existing user behavior without warning
- Assume the user wants ALL improvements — always let user choose
- Refactor working code as part of a feature addition
- Add a feature and "also improve" something else in the same patch
- Suggest a library/dependency without checking compatibility with existing stack

---

# IMPROVEMENT SUGGESTION PROTOCOL

## When User Asks "Apa yang bisa di-improve?" or "Saran fitur baru?"

### Step 1: AUDIT CURRENT STATE FIRST

Before suggesting ANYTHING:

1. Read the main project structure
2. Read key files related to the area of improvement
3. Check what features ALREADY exist
4. Check what is PARTIALLY built (avoid suggesting what's half-done)
5. Check what is BROKEN (fix bugs before adding features)

```
RULE: You cannot suggest improvements to a house 
      if you haven't walked through the rooms first.
```

### Step 2: CATEGORIZE BY IMPACT

Organize suggestions into exactly 3 categories:

| Category | Definition | Priority |
|---|---|---|
| **CRITICAL** | Bugs, security issues, broken features | Fix FIRST |
| **HIGH IMPACT** | Features that directly improve daily user workflow | Implement SECOND |
| **NICE TO HAVE** | Enhancements, polish, optimization | Implement LAST |

NEVER suggest nice-to-have items if critical items exist.

### Step 3: LIMIT SUGGESTIONS

| Context | Maximum Suggestions |
|---|---|
| Quick saran | 3-5 items, ranked by priority |
| Detailed improvement plan | 5-10 items, categorized |
| Full audit | 10-15 items max, with effort estimates |

NEVER dump a list of 20+ suggestions. It overwhelms, not helps.

### Step 4: HONEST COMPLEXITY ESTIMATE

For each suggestion, provide:

```
[SUGGESTION]: [description]
[IMPACT]: Critical / High / Nice-to-have
[COMPLEXITY]: Low (1-2 files) / Medium (3-5 files) / High (6+ files)
[PREREQUISITE]: [what must exist before this can be built]
[RISK]: [what existing features could break]
```

Rules for complexity:
- If you're unsure → round UP (say Medium, not Low)
- If it touches global files (layout, middleware, config) → automatically Medium+
- If it requires new database tables → automatically Medium+
- If it requires new external service → automatically High
- NEVER say "simple" or "easy" — use Low/Medium/High only

### Step 5: LET USER CHOOSE

After presenting suggestions:

```
"Mana yang mau dikerjakan duluan?"
```

DO NOT start implementing until user picks.
DO NOT assume user wants all of them.

---

# FEATURE IMPLEMENTATION PROTOCOL

## When User Says "Implement feature X"

### Step 1: FEASIBILITY CHECK

Before writing any code:

1. Does the infrastructure support this? (database, API, dependencies)
2. Does a similar feature already exist? (partially or fully)
3. What existing features does this touch?
4. What files need to change?

```
FEASIBILITY REPORT:
- Infrastructure: [ready / needs setup]
- Existing similar: [none / partial in file X / already done]
- Files affected: [list]
- New files needed: [list]
- Estimated patches: [number]
```

### Step 2: BUILD ORDER

ALWAYS follow this order:

```
1. Database schema (if needed)
2. Backend service
3. Backend controller
4. Backend routes
5. Backend build verify ✅
6. Frontend API integration
7. Frontend page/component
8. Frontend build verify ✅
9. Full deploy + browser verify ✅
```

NEVER build frontend before backend is verified.
NEVER add routes before service logic is verified.

### Step 3: PRESERVE EXISTING BEHAVIOR

When adding new features to existing pages:

```
BEFORE editing any existing file:
1. Read the ENTIRE existing code
2. Identify what currently works
3. Plan your addition to NOT DISTURB existing code
4. Add new code ALONGSIDE existing code
5. Verify old features still work after your addition
```

Rules:
- Do NOT restructure existing code while adding features
- Do NOT "improve" existing code as a side effect
- Do NOT move existing functions to make room for new ones
- If existing code must change → that is a SEPARATE patch first

### Step 4: INCREMENTAL VERIFICATION

After each layer is added, verify before moving to next:

| Layer | Verification |
|---|---|
| Database schema | Migration runs without error |
| Backend service | Methods exist, logic is correct (code review) |
| Backend routes | Build passes, routes registered in index |
| Backend complete | Docker build ✅, API responds correctly |
| Frontend page | Build passes, page renders |
| Frontend complete | Docker build ✅, page loads in browser, feature works |

If ANY layer fails → FIX before proceeding to next layer.

---

# IMPROVEMENT TO EXISTING FEATURE PROTOCOL

## When User Says "Improve feature X" or "Tambah ini ke feature X"

### Step 1: UNDERSTAND CURRENT BEHAVIOR

```
READ the existing feature code completely.
Document what it currently does.
Document what the user wants changed.
Identify the DELTA (difference between current and desired).
```

### Step 2: MINIMAL DELTA APPROACH

```
Change ONLY what is needed to achieve the desired behavior.
DO NOT touch anything that is not part of the delta.
```

| Approach | Valid? |
|---|---|
| Add new function to existing file | ✅ Minimal |
| Add new column to existing table | ✅ Minimal |
| Restructure entire file to accommodate new feature | ❌ Over-engineering |
| Rewrite existing function to be "better" while adding feature | ❌ Scope creep |
| Add feature AND refactor AND fix unrelated bug | ❌ Multiple objectives |

### Step 3: REGRESSION TEST

After improvement is implemented:

1. Test the NEW behavior works
2. Test the OLD behavior still works
3. Test related features still work
4. If any old behavior broke → your improvement caused regression → FIX or REVERT

---

# DEPENDENCY & COMPATIBILITY CHECK

## Before Adding ANY New Library/Package:

1. Check current `package.json` for existing similar libraries
2. Check version compatibility with existing packages
3. Check bundle size impact (frontend especially)
4. Check if the same thing can be done with existing tools

| Situation | Action |
|---|---|
| Existing library can do it | USE existing library |
| Existing library can do it with extension | EXTEND existing |
| No existing library, lightweight option exists | ADD lightweight option |
| Requires heavy new dependency | ASK USER before adding |

NEVER add a library when native code or existing dependencies can do the job.

---

# IMPROVEMENT ANTI-PATTERNS (NEVER DO)

### Anti-Pattern 1: THE KITCHEN SINK
```
❌ User asks for 1 improvement → you suggest 15 things and start implementing 5
```
Fix: Suggest top 3-5, let user choose, implement 1 at a time.

### Anti-Pattern 2: THE INVISIBLE REFACTOR
```
❌ User asks to add button → you restructure the entire page component
```
Fix: Add the button. Only the button. Nothing else.

### Anti-Pattern 3: THE OPTIMISTIC ESTIMATE
```
❌ "This is a simple change" → turns into 12 files changed, 3 build errors
```
Fix: Count files before declaring complexity. If > 5 files → it is NOT simple.

### Anti-Pattern 4: THE BEST PRACTICE TRAP
```
❌ "We should add error boundaries, loading states, accessibility, 
    internationalization, dark mode, and analytics while we're at it"
```
Fix: Implement what was asked. Report other improvements separately.

### Anti-Pattern 5: THE BREAKING IMPROVEMENT
```
❌ Improve feature A → feature B now broken because they shared code
```
Fix: Read ALL code that shares dependencies with the feature before changing it.

---

# DEFINITION OF A GOOD IMPROVEMENT

An improvement is GOOD only if:

- It solves a REAL user problem ✅
- It does NOT break existing features ✅
- It was REQUESTED or APPROVED by user ✅
- Its complexity was honestly estimated ✅
- It was implemented in MINIMUM changes ✅
- It was verified working BEFORE declaring done ✅

If ANY is false → improvement is BAD regardless of technical quality.

---
