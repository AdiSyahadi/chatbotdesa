# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- ASSET & DEPENDENCY INTEGRITY

This document is a HARD RULESET for managing file references, assets, and dependencies.

Referencing something that doesn't exist = guaranteed 404 / runtime crash.

If the target doesn't exist → CREATE IT FIRST.

---

# CORE PRINCIPLE

Code references must point to EXISTING targets.
Every `import`, `href`, `src`, `url()` must resolve to a real file.
Every dependency must be installed before usage.

"I'll create it later" = VIOLATION.
"It might already exist" = VIOLATION (verify first).

---

# ABSOLUTE PROHIBITIONS

You MUST NOT:

- Reference a file in code before the file exists
- Import a package that is not in package.json
- Use an API endpoint that doesn't exist yet
- Reference an image/icon/font that hasn't been created
- Assume public/ folder has files without checking
- Add meta tags pointing to non-existent assets

---

# FILE REFERENCE PROTOCOL

## Before Adding ANY file reference in code:

### Step 1: CHECK EXISTS

```
file_search or list_dir to verify the file exists
```

### Step 2: IF NOT EXISTS → CREATE FIRST

Create the file BEFORE writing code that references it.

Order:
1. Create the target file (image, config, icon, etc.)
2. Verify file exists
3. THEN add the reference in code
4. Verify reference works (build + browser)

### Step 3: VERIFY ACCESSIBILITY

For public/ folder assets:
```
After deploy, verify URL returns 200:
http://localhost:3002/[filename]
```

For imports:
```
Build must pass — import errors are caught at build time
```

---

# ASSET CHECKLIST

When adding meta tags, manifests, or configs that reference files:

| Meta Tag / Config | Required File |
|---|---|
| `og:image` | `/public/og-image.png` |
| `favicon` | `/public/favicon.ico` + `/public/favicon.svg` |
| `apple-touch-icon` | `/public/icon-192.png` |
| `manifest` | `/public/site.webmanifest` |
| `msapplication-config` | `/public/browserconfig.xml` |
| `manifest icons` | `/public/icon-192.png` + `/public/icon-512.png` |

Before adding ANY of these → verify the target file exists.

---

# DEPENDENCY PROTOCOL

## Before Using ANY new package/library:

1. Check if already in `package.json`
2. If not → `npm install` first
3. Verify import works in build
4. Check version compatibility

## Before Using ANY new API endpoint:

1. Check if the route exists in backend routes
2. Check if the controller method exists
3. Check if the service method exists
4. If not → create backend first, then frontend

Order: Backend → Frontend (NEVER reverse)

---

# ENVIRONMENT VARIABLE PROTOCOL

## Hardcoded Values That MUST Be Environment Variables:

- API URLs / Base URLs
- Port numbers
- Domain names
- Secret keys
- Database connection strings
- External service URLs

## Pattern:

```typescript
// ❌ WRONG
const BASE_URL = "http://localhost:3002";

// ✅ CORRECT  
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
```

## Rules:

- Frontend env vars MUST start with `NEXT_PUBLIC_`
- Backend env vars accessed via `process.env.VARIABLE`
- ALWAYS provide sensible default for development
- Default MUST match current development setup
- NEVER hardcode production values in source code

---

# INTEGRITY VERIFICATION

After ANY change involving file references or assets:

1. Build passes ✅
2. Container starts ✅
3. Referenced URLs return 200 (not 404) ✅
4. No console errors about missing resources ✅
5. Meta tags appear correctly in View Source ✅

If ANY check fails → fix before moving on.

---
