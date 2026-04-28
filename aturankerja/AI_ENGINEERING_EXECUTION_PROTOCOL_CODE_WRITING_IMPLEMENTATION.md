# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- CODE WRITING & IMPLEMENTATION

This document is a HARD RULESET for writing and implementing code.

Code that compiles is NOT necessarily correct code.
Code that works is NOT necessarily good code.
Code that is fast-written is NOT necessarily production-ready code.

Every line you write must be INTENTIONAL, CONSISTENT, and VERIFIED.

---

# CORE PRINCIPLE

Writing code is a PRECISION activity, not a speed activity.

The cost of a bug introduced during writing is 10x the cost of writing slowly.
The cost of a copy-paste error is 10x the cost of typing from scratch.

SLOW IS FAST. CAREFUL IS PRODUCTIVE.

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Write code without reading the existing file first
- Copy-paste code from another file without reviewing every token
- Add new code without adding its required imports
- Leave placeholder values ("TODO", "fix later", hardcoded test data)
- Write code that shadows existing variables or function names
- Introduce a new pattern when the project already has a pattern for that
- Write complex code when simple code achieves the same result
- Skip type annotations in TypeScript files
- Forget await on async function calls
- Trust that your bracket/tag nesting is correct without counting

---

# PRE-WRITING PROTOCOL

## Before Writing ANY Code:

### Step 1: READ THE TARGET FILE FULLY

```
Before editing a file, read it COMPLETELY.
Not the first 50 lines. THE ENTIRE FILE.
```

Why:
- Line 200 might have code that conflicts with your change at line 30
- There might be existing functions that do what you're about to write
- The file might have patterns you need to follow
- There might be comments explaining WHY something is the way it is

Minimum reading:
- Files under 200 lines → read entire file
- Files over 200 lines → read imports + exports + all function signatures + the area you're editing + 50 lines above and below

### Step 2: IDENTIFY EXISTING PATTERNS

Before writing new code in a file, answer:

| Question | What to Check |
|---|---|
| How are variables named? | camelCase? snake_case? UPPER_CASE? |
| How are functions structured? | arrow functions? regular functions? async pattern? |
| How is error handling done? | try/catch? .catch()? error boundary? |
| How are types defined? | inline? separate interface? imported? |
| What import style is used? | named imports? default? path aliases? |
| What API pattern is used? | api.get()? fetch()? axios? |
| How is state managed? | useState? useQuery? Zustand? |

YOUR NEW CODE MUST MATCH THESE PATTERNS EXACTLY.

### Step 3: CHECK FOR EXISTING CODE

Before writing a new function, hook, helper, or utility:

```
grep_search the codebase for similar functionality.
```

If something similar exists → REUSE or EXTEND it.
Do NOT create a duplicate.

---

# COPY-PASTE PROTOCOL

## The #1 Source of My Bugs: Careless Copy-Paste

### Rule 1: NEVER BLIND COPY

When copying code from another file:

```
1. Copy the code
2. IMMEDIATELY review EVERY LINE of the copied code
3. Identify ALL values specific to the SOURCE context
4. Replace ALL of them with values for the TARGET context
5. Check EVERY variable name, route path, function name, type
```

### Rule 2: COPY-PASTE CHECKLIST

After pasting, check each item:

| Check | What to Look For |
|---|---|
| Variable names | Are ALL names correct for this context? Not leftover from source? |
| Route paths | Is the URL path correct? Not the source file's path? |
| Function names | Do they match this feature? Not the source feature? |
| Type annotations | Do types match this data? Not the source data? |
| Error messages | Do messages reference the right entity? |
| API endpoints | Is the endpoint correct for this feature? |
| Import paths | Do imports point to the right modules? |
| Comments | Do comments describe THIS code, not the source code? |

### Rule 3: THE THREE-SECOND SCAN

After any copy-paste, scan the pasted code for 3 seconds looking ONLY for:
- Names that don't belong (e.g., "contact" in a "deal" file)
- Paths that don't belong (e.g., "/contacts" in deal routes)
- Types that don't belong (e.g., ContactType in deal service)

If ANYTHING looks like it's from the source context → FIX IT.

---

# IMPORT MANAGEMENT PROTOCOL

## Rule 1: IMPORT BEFORE USE

```
When you add ANY new element to code:
- New component → add import FIRST
- New icon → add to lucide import FIRST
- New hook → add import FIRST
- New type → add import FIRST
- New utility → add import FIRST
```

Order of operations:
1. Identify what you need to import
2. Add the import statement
3. THEN write the code that uses it

NEVER write code first and "add imports later." You WILL forget.

## Rule 2: CHECK EXISTING IMPORTS

Before adding a new import:
- Is this already imported in the file? (avoid duplicate imports)
- Is this the correct import path for this project?
- Is this a named or default export?

## Rule 3: CLEAN UNUSED IMPORTS

After editing, check:
- Did your change make any existing imports unnecessary?
- If yes → remove them in the same edit

---

# BRACKET & TAG NESTING PROTOCOL

## The Problem:

Deep nesting = miscounted closing brackets/tags = broken code.

## Rule 1: COUNT OPEN AND CLOSE

After writing JSX with nesting deeper than 3 levels:

```
Count opening tags: <div>, <Card>, <Dialog>, etc.
Count closing tags: </div>, </Card>, </Dialog>, etc.
They MUST be equal.
```

## Rule 2: CLOSE AS YOU OPEN

When writing nested JSX:

```tsx
// Write the opening AND closing tag together FIRST
<Dialog>
</Dialog>

// THEN fill in the content between them
<Dialog>
  <DialogContent>
  </DialogContent>
</Dialog>
```

Do NOT write 10 opening tags and then try to close them all at the end.

## Rule 3: MATCH INDENTATION

Each closing tag must be at the same indentation level as its opening tag.
If indentation doesn't match → nesting is wrong.

---

# ASYNC/AWAIT PROTOCOL

## Rule 1: EVERY ASYNC CALL NEEDS AWAIT

When calling any function that returns a Promise:

```typescript
// ❌ WRONG — silent failure, no error, no data
someAsyncFunction();

// ✅ CORRECT
await someAsyncFunction();

// ✅ ALSO CORRECT (if you need the promise)
const result = await someAsyncFunction();
```

## Rule 2: CHECK THE FUNCTION SIGNATURE

Before calling ANY function, check:
- Is it async?
- Does it return a Promise?
- If yes → you MUST await it or handle the promise

## Rule 3: ERROR HANDLING FOR ASYNC

```typescript
// In controllers/handlers:
try {
  const result = await service.doSomething();
  res.json(result);
} catch (error) {
  next(error);
}

// In React components (with react-query):
// useQuery/useMutation handle errors automatically
// For manual async: wrap in try/catch
```

---

# NAMING PROTOCOL

## Rule 1: FOLLOW EXISTING CONVENTION

Do NOT invent your own naming style. Match the project:

| Context | Check Existing Pattern |
|---|---|
| Backend service method | Is it `getAll` or `list` or `findMany`? |
| Controller handler | Is it `getAll` or `list` or `index`? |
| Route path | Is it `/list` or just `/`? Plural or singular? |
| Database fields | Is it `created_at` or `createdAt`? |
| React component | Is it `PageName` or `PageNamePage`? |
| State variable | Is it `isOpen` or `open`? |

## Rule 2: NO SHADOWING

Before creating any new variable or function name:

```
Check if that name already exists in:
1. The same file (local scope)
2. Imported modules
3. Global scope
```

If the name already exists → choose a different name.

## Rule 3: MEANINGFUL NAMES

```
// ❌ WRONG
const d = await api.get('/deals');
const r = d.data;

// ✅ CORRECT
const dealsResponse = await api.get('/deals');
const deals = dealsResponse.data;
```

---

# PROJECT-SPECIFIC PATTERNS

## Before Writing Code, Check These Project-Specific Rules:

### This project (CRM-DADI) uses:

| Pattern | Correct Usage | Wrong Usage |
|---|---|---|
| User ID | `req.user!.userId` | `req.user!.id` |
| Org ID | `req.user!.organizationId` | `req.user!.orgId` |
| Route params | `req.params.id as string` | `req.params.id` (without cast) |
| Prisma client | `import { prisma } from '../config/database'` | `new PrismaClient()` |
| API client (FE) | `import api from '@/lib/api'` | `fetch()` or `axios` |
| Toast | `import { toast } from 'sonner'` | `alert()` or custom toast |
| CSS utility | `import { cn } from '@/lib/utils'` | manual className concat |
| Date formatting | `import { format } from 'date-fns'` | manual date formatting |

**HOWEVER** — these patterns are for THIS project. For other projects:
```
READ existing code → IDENTIFY patterns → FOLLOW those patterns.
```

The specific values change per project. The PROTOCOL stays the same.

---

# SIMPLICITY PROTOCOL

## Rule 1: SIMPLEST SOLUTION FIRST

```
Can it be done in 1 line? → Do it in 1 line.
Can it be done inline? → Do it inline.
Can it be done without a new function? → Don't create one.
Can it be done without a new file? → Don't create one.
Can it be done without a new dependency? → Don't add one.
```

## Rule 2: NO PREMATURE ABSTRACTION

```
// ❌ OVER-ENGINEERED — function used only once
const saveKpiPrefs = useCallback((ids: string[]) => {
  setVisibleKpiIds(ids);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}, []);
// ...later in JSX:
onClick={() => saveKpiPrefs(DEFAULT_KPI_IDS)}

// ✅ SIMPLE — inline, clear, no extra abstraction
onClick={() => { 
  setVisibleKpiIds(DEFAULT_KPI_IDS); 
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_KPI_IDS)); 
}}
```

Create a separate function only when:
- It is called from 2+ places, OR
- It is longer than 5 lines AND complex logic, OR
- It needs to be tested independently

## Rule 3: NO CLEVER CODE

```
// ❌ CLEVER — hard to read, easy to break
const x = arr.reduce((a,b) => ({...a, [b.k]: (a[b.k]||[]).concat(b)}), {});

// ✅ CLEAR — easy to read, easy to debug
const grouped: Record<string, Item[]> = {};
for (const item of arr) {
  if (!grouped[item.k]) grouped[item.k] = [];
  grouped[item.k].push(item);
}
```

Code that is hard to read = code that is hard to debug = code that will break.

---

# POST-WRITING VERIFICATION

## After Writing Code, Before Declaring Edit Complete:

### Checklist:

1. **Imports** — All new elements have import statements? ✅
2. **Unused imports** — No imports that are no longer used? ✅
3. **Naming** — All names match project convention? ✅
4. **Types** — All TypeScript types correct? No `any` without reason? ✅
5. **Async** — All async calls have `await`? ✅
6. **Brackets** — Opening count = closing count? ✅
7. **Copy-paste** — No leftover names/paths from source file? ✅
8. **Hardcoded values** — No magic strings/numbers that should be constants? ✅
9. **Pattern match** — Code follows existing project patterns? ✅
10. **Simplicity** — Is there a simpler way to do this? ✅

If ANY is ❌ → fix before moving on.

---

# DEFINITION OF WELL-WRITTEN CODE

Code is WELL-WRITTEN when:

- It follows existing project patterns ✅
- It has all required imports ✅
- It has no copy-paste artifacts ✅
- It uses existing utilities instead of duplicating ✅
- It is as simple as possible ✅
- All async calls are awaited ✅
- All brackets and tags are balanced ✅
- All names are meaningful and non-shadowing ✅
- It compiles without errors ✅
- It runs without runtime errors ✅

If ANY is not true → CODE IS NOT READY.

---
