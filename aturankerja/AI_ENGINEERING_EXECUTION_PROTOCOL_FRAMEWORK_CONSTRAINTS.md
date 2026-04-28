# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- FRAMEWORK CONSTRAINTS

This document is a HARD RULESET for framework-specific rules.
This protocol is UNIVERSAL — applies to ANY framework, ANY language.

Framework rules are NOT suggestions. They are LAWS.
Violating framework rules causes runtime errors that cannot be caught at build time.

If you do not know the framework rule → STOP and verify before coding.

---

# CORE PRINCIPLE

Every framework has constraints that CANNOT be violated.
These constraints exist at RUNTIME, not just compile time.
A build success does NOT mean the code is correct.

You MUST identify and respect the framework's constraints BEFORE writing code.
This applies equally to React, Laravel, Vue, Django, Spring, Rails, or any other framework.

---

# ABSOLUTE PROHIBITIONS (UNIVERSAL)

You MUST NOT:

- Write code that violates the framework's lifecycle rules
- Mix concerns that the framework separates (e.g., view logic in model, server code in client)
- Ignore the framework's routing conventions
- Bypass the framework's built-in security features
- Use deprecated APIs without checking current version
- Assume patterns from Framework A work in Framework B
- Skip reading existing project patterns before writing new code

---

# UNIVERSAL FRAMEWORK PROTOCOL

## Step 1: IDENTIFY THE FRAMEWORK

Before writing ANY code, confirm:

- What framework is this project using? (and exact version)
- What language? What runtime?
- What ORM/database layer?
- What template/view engine?
- What folder structure convention?

## Step 2: IDENTIFY FRAMEWORK CONSTRAINTS

Every framework has non-negotiable rules. Before coding, answer:

| Question | Example |
|---|---|
| What is the component/module lifecycle? | React: hooks order. Laravel: request lifecycle. Vue: setup → mounted. |
| What runs server-side vs client-side? | Next.js: Server/Client Components. Laravel: Blade = server, JS = client. Nuxt: SSR vs CSR. |
| How does routing work? | File-based (Next.js, Nuxt), config-based (Laravel, Express), decorator-based (NestJS, Spring). |
| How does state management work? | React: hooks/context. Laravel: session/cache. Vue: reactive refs/Pinia. |
| What is the ORM pattern? | Prisma: schema-first. Eloquent: model-first. TypeORM: decorator-based. |
| What are the naming conventions? | Laravel: snake_case models, PascalCase controllers. React: PascalCase components. |
| What security is built-in? | Laravel: CSRF, middleware. Next.js: middleware. Django: CSRF, ORM injection protection. |

## Step 3: STUDY EXISTING PROJECT PATTERNS

Before writing new code:

```
Search existing code for similar patterns.
Follow what the project already does.
DO NOT introduce new patterns without reason.
```

## Step 4: RESPECT FRAMEWORK BOUNDARIES

| Concept | Rule |
|---|---|
| Lifecycle | Code MUST follow the framework's execution order |
| Separation of concerns | Server code stays server-side, client code stays client-side |
| Conventions | File naming, folder structure, method naming → follow framework standard |
| Built-in features | USE them. Do not reinvent auth, validation, caching if framework provides it |
| Security | NEVER bypass CSRF, auth middleware, input validation, or sanitization |

---

# FRAMEWORK-SPECIFIC QUICK REFERENCE

Below are constraint summaries for common frameworks.
Use the section matching the current project. Ignore the rest.

---

## REACT / NEXT.JS

### Rules of Hooks (NON-NEGOTIABLE)
- ALL hooks MUST be called at the TOP of the component function
- ALL hooks MUST be called in the SAME ORDER every render
- ALL hooks MUST be called BEFORE any conditional return
- NO hooks inside conditions, loops, or nested functions

### Hook Order Template:
```tsx
export default function MyComponent() {
  // 1. ALL useState/useRef hooks
  // 2. ALL useCallback/useMemo hooks
  // 3. ALL useEffect hooks
  // 4. ALL useQuery/useMutation hooks
  // 5. ONLY NOW — conditional returns (if loading, if error)
  // 6. Derived values
  // 7. Return JSX
}
```

### Server vs Client Components (Next.js)
- Default = Server Component (no hooks, no state, no browser APIs)
- Client Component MUST have `'use client'` at top of file
- Metadata export only in Server Components

### HTML Nesting
- No `<div>` inside `<button>` → use `<span>`
- No `<Button>` inside `<Link>` → use `<Button asChild><Link>`
- `<img>` MUST have descriptive `alt` text

---

## LARAVEL / PHP

### Request Lifecycle (NON-NEGOTIABLE)
- HTTP Request → Middleware → Controller → Service → Model → Response
- NEVER access database in middleware (use service layer)
- NEVER put business logic in controllers (use service/action classes)
- NEVER return response in model

### Eloquent Rules
- Use model relationships, not raw joins
- Use `$fillable` or `$guarded` on every model
- Use scopes for reusable query logic
- ALWAYS use parameterized queries / Eloquent (NEVER raw SQL with user input)

### Blade Templates
- Blade = server-rendered, NO JavaScript state
- Use `@csrf` on every form
- Use `{{ $var }}` (escaped) not `{!! $var !!}` (raw) unless explicitly needed
- Use `@auth`, `@can` for authorization checks

### Route Rules
- Resource routes: `Route::resource('posts', PostController::class)`
- API routes in `routes/api.php`, web routes in `routes/web.php`
- ALWAYS use named routes: `->name('posts.index')`
- Use route model binding: `Route::get('/posts/{post}', ...)`
- Apply middleware at route group level, not per-route

### Security Built-in (NEVER bypass)
- CSRF protection (automatic for web routes)
- Mass assignment protection (`$fillable`)
- SQL injection protection (Eloquent/Query Builder)
- XSS protection (Blade `{{ }}` auto-escapes)
- Authentication middleware (`auth`, `auth:sanctum`)

---

## VUE.JS / NUXT

### Composition API Rules
- `ref()`, `reactive()`, `computed()` → declare at top of `setup()`/`<script setup>`
- `watch()`, `watchEffect()` → after refs
- `onMounted()`, `onUnmounted()` → lifecycle hooks after watchers
- Template refs → define before `onMounted`

### Reactivity Rules
- Use `ref()` for primitives, `reactive()` for objects
- NEVER destructure reactive objects (loses reactivity)
- Use `toRefs()` if destructuring is needed
- Use `computed()` for derived values, not methods

### Nuxt-specific
- `useAsyncData()`, `useFetch()` → server-side data fetching
- `useState()` → shared state across SSR/client
- Pages in `pages/` → auto-routing
- Middleware in `middleware/` → navigation guards

---

## DJANGO / PYTHON

### MVT Pattern
- Model = database schema + business logic
- View = request handler (like controller)
- Template = HTML rendering
- NEVER put view logic in template
- NEVER put template logic in model

### ORM Rules
- Use QuerySets, not raw SQL
- Use `F()` expressions for database-level operations
- Use `select_related()` / `prefetch_related()` to avoid N+1
- Use model managers for reusable queries

### Security Built-in
- CSRF middleware (always enabled)
- ORM prevents SQL injection
- Template auto-escaping prevents XSS
- `@login_required` / `LoginRequiredMixin` for auth
- Use `form.is_valid()` for input validation

---

## EXPRESS.JS / NODE.JS

### Middleware Order (NON-NEGOTIABLE)
- Body parser → CORS → Auth → Tenant → Route → Error handler
- Error handler MUST be last middleware
- ALWAYS call `next()` or send response — never leave hanging

### Route Rules
- Static routes BEFORE param routes (`/export` before `/:id`)
- Use `req.params.id as string` for TypeScript
- ALWAYS validate input before processing
- Use `async` handlers with try/catch or error-handling wrapper

### Prisma (if used)
- ALWAYS import from shared config, NEVER new PrismaClient()
- Use transactions for multi-table operations
- Use `include` for relations, not separate queries

---

# WHEN SWITCHING BETWEEN PROJECTS

When moving from one framework to another:

1. CLEAR your assumptions from the previous framework
2. READ the project's existing code for 10 minutes before writing
3. IDENTIFY the framework and version
4. REVIEW the constraint section above for that framework
5. CHECK existing patterns in the codebase
6. ONLY THEN start coding

NEVER assume Framework A patterns work in Framework B.

---

# WHEN IN DOUBT RULE

If you are unsure about a framework constraint:

1. DO NOT GUESS
2. Check existing working code in the project for patterns
3. Check the official documentation
4. If still unsure → ask the user

Guessing framework rules = guaranteed runtime errors.

---
