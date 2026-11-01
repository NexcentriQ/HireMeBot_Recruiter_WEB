# HireMeBot Recruiter Portal (V1)

Desktop-first web app for the **HireMeBot** platform by **NexcentriQ**. Lets authorized recruiters sign in with Google through Amazon Cognito, view their assigned students, create job applications on their behalf, and track those applications.

- **Repository:** `NexcentriQ/HireMeBot_RECRUITER_WEB`
- **Production domain:** `https://recruiter.hiremebot.com`
- **Hosting:** Vercel

## Tech stack

React 18 · Vite · TypeScript · Tailwind CSS · Radix UI (shadcn-style primitives) · React Router · TanStack Query · React Hook Form · Zod · Axios · Vitest + React Testing Library.

## Features (V1)

1. Google sign-in via Amazon Cognito (OAuth 2.0 Authorization Code + PKCE)
2. Protected recruiter dashboard with totals + today + assigned-student counts
3. Create Application form with validation and typed API adapter
4. My Applications table with search, student + date filters, sort, and backend-driven pagination
5. Shared sidebar + header layout
6. Development mock mode so the UI is fully usable before Cognito or backend endpoints are wired up

Explicitly **out of scope** for V1: recruiter signup, application edit/delete, bulk actions, analytics, resume parsing, AI matching, email notifications.

## Getting started

```bash
# install dependencies
npm install

# copy environment template
cp .env.example .env.local

# run the dev server (http://localhost:5173)
npm run dev
```

By default `.env.local` ships with `VITE_USE_MOCK_API=true`, so the app runs end-to-end on in-memory sample data — you can sign in, see the dashboard, create applications, and page through them.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Watch mode |

## Environment variables

See [`.env.example`](./.env.example). All variables are read via `import.meta.env` and must be prefixed with `VITE_`.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API (no trailing slash). |
| `VITE_COGNITO_REGION` | AWS region for the Cognito user pool. |
| `VITE_COGNITO_USER_POOL_ID` | Cognito user pool ID. |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client ID. |
| `VITE_COGNITO_DOMAIN` | Cognito Hosted UI domain (`<prefix>.auth.<region>.amazoncognito.com`). |
| `VITE_COGNITO_REDIRECT_URI` | OAuth redirect — must be `.../auth/callback`. |
| `VITE_COGNITO_LOGOUT_URI` | Sign-out redirect — usually `.../login`. |
| `VITE_USE_MOCK_API` | `true` enables in-memory mock mode. **Set to `false` in production.** |

### Production values

For `recruiter.hiremebot.com`:

```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://api.hiremebot.com
VITE_COGNITO_REDIRECT_URI=https://recruiter.hiremebot.com/auth/callback
VITE_COGNITO_LOGOUT_URI=https://recruiter.hiremebot.com/login
```

The matching URIs must be whitelisted as **Allowed callback URL** and **Allowed sign-out URL** on the Cognito app client, and the Cognito app client must have **Google** enabled as an identity provider.

## Running against the real backend (dev integration mode)

The HireMeBot backend currently supports a **local-dev-only** identity header, `X-Dev-Recruiter-Id`, which is accepted when the backend is started with `ALLOW_DEV_RECRUITER_HEADER=true`. The frontend has first-class support for this mode so you can exercise the real `POST /api/v1/recruiter/applications` endpoint without Cognito.

### 1. Start the backend (separate repo)

```powershell
cd ..\HireMeBot
sam local start-api --env-vars env.json
# http://127.0.0.1:3000
```

Ensure `ALLOW_DEV_RECRUITER_HEADER=true` is set for the RecruiterLambda in `env.json`.

### 2. Configure the frontend

In `.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_USE_MOCK_API=false
VITE_DEV_RECRUITER_ID=1000000001   # must exist in dev MySQL
```

### 3. Run

```powershell
npm run dev
```

The sign-in button becomes a one-click dev login (no OAuth). All API calls now attach `X-Dev-Recruiter-Id` instead of a Bearer token.

### Guard rails

- The dev header is only attached when `VITE_USE_MOCK_API=false` **and** `VITE_DEV_RECRUITER_ID` is a positive safe integer **and** Vite is running in dev mode (`import.meta.env.DEV`). It is never attached in a production build.
- Only requests to the configured `VITE_API_BASE_URL` are sent; the dev header never leaks to arbitrary origins.
- 401 responses in dev mode are **not** treated as "session expired" — they indicate a rejected dev header, so the user is not logged out.

### Known backend dependencies for the full flow

The Create Application form submits the exact `POST /api/v1/recruiter/applications` contract (studentId, application, documents, questions). It depends on two companion lookups that **may or may not exist** in the current backend:

| Dependency | Frontend behavior if missing |
|---|---|
| `GET /api/v1/recruiter/students` (assigned students) | The student dropdown will show an error. Workaround: temporarily hard-code a student ID in [`studentService.ts`](src/features/students/studentService.ts), or stay in mock mode. |
| A student-documents / resume-objects endpoint | None was found in the spec. The form takes a **numeric Resume Object ID** as a dev fixture — the recruiter must enter a resume `objectId` that already exists in MySQL. Replacing this with a document picker UI requires a backend endpoint that lists a student's uploaded documents. |

The frontend does **not** invent either endpoint — if they do not exist, the Create Application form will surface a clear error for the student dropdown, and the resume field remains a dev fixture that must be removed before shipping to end-user recruiters.

## Mock mode

When `VITE_USE_MOCK_API=true`:

- A pretend recruiter is logged in automatically.
- The three sample students and seeded applications live in [`src/mocks/mockData.ts`](src/mocks/mockData.ts).
- `src/mocks/mockApi.ts` serves all queries from an in-memory store and persists newly-created applications for the session.
- A **Demo Mode** notice is shown on the login screen.

Mock mode never silently activates in production — if `VITE_USE_MOCK_API` is unset or `false`, the real auth + API paths are used.

## Authentication flow (production)

1. User clicks **Continue with Google** on `/login`.
2. Browser is redirected to Cognito `/oauth2/authorize` with PKCE + `identity_provider=Google`.
3. Cognito federates to Google, then redirects back to `/auth/callback` with `code` + `state`.
4. `AuthCallbackPage` validates the `state`, exchanges the `code` for tokens at `/oauth2/token`, and stores them.
5. `AuthContext` calls `GET /recruiter/me` to fetch the authoritative profile.
6. If the backend confirms the account is `isActive === true` and `role === 'RECRUITER'`, the user is routed to `/dashboard`. Otherwise they land on `/access-denied`.

Nothing about recruiter authorization is trusted on the client — the backend is the authority. The frontend only ever uses the Cognito response to call the backend.

## API contract (provisional)

The backend lives in a separate repo (`NexcentriQ/HireMeBot`) built on Java 21 + AWS Lambda + API Gateway + Cognito + MySQL. This frontend expects the following endpoints; adjust `src/features/*/applicationService.ts` and `src/features/students/studentService.ts` if the real shapes differ.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/recruiter/me` | `RecruiterProfile` |
| `GET` | `/recruiter/students` | `AssignedStudent[]` |
| `GET` | `/recruiter/dashboard` | `DashboardStats` |
| `GET` | `/recruiter/applications` | `Paginated<JobApplication>` |
| `POST` | `/recruiter/applications` | `JobApplication` |

Shapes are defined in [`src/types/domain.ts`](src/types/domain.ts).

**Endpoints still requiring backend implementation or verification:** all of the above. Confirm payload shapes, status enum values, and pagination query parameters against the Java/API Gateway service before shipping with `VITE_USE_MOCK_API=false`.

## Folder structure

```
src/
├── app/               App bootstrap, router, QueryClient
├── components/
│   ├── ui/            shadcn-style primitives (button, input, select, …)
│   ├── layout/        Sidebar, Header, RecruiterLayout, PageMeta
│   └── common/        Loading / Empty / Error / BrandLogo / GoogleIcon
├── features/
│   ├── auth/          Cognito client, AuthContext, Login/Callback/AccessDenied
│   ├── dashboard/     DashboardPage
│   ├── applications/  Create & My Applications pages, service, Zod schemas
│   └── students/      Assigned-student service
├── hooks/             Reusable hooks (useDebouncedValue)
├── lib/               apiClient, env, utils
├── mocks/             Mock API + seed data (dev only)
├── test/              Vitest setup
├── types/             Shared domain types
└── styles/            Tailwind globals
```

## Testing

```bash
npm run test        # one-off
npm run test:watch  # TDD loop
```

The included suite covers the Zod schema validation, mock API behavior (paging, search, create, auth checks), and utility helpers. Add component tests under `src/**/__tests__/`.

Before marking V1 complete, also run:

```bash
npm run typecheck
npm run lint
npm run build
```

## Deployment (Vercel)

1. Create a new Vercel project from the `NexcentriQ/HireMeBot_RECRUITER_WEB` repo.
2. Framework preset: **Vite**. Build command and output are already set in [`vercel.json`](./vercel.json) (`npm run build` → `dist`).
3. Set the environment variables listed above in the project's Vercel dashboard — one set for Preview, one for Production.
4. Attach the custom domain `recruiter.hiremebot.com`.
5. `vercel.json` includes an SPA rewrite so deep links like `/dashboard` and `/applications` do not 404 on refresh.

The Student Portal is a **separate** Vercel project and must not be modified from this repo.

## Security notes

- Only Cognito-federated recruiters authorized by the backend may access protected routes.
- The frontend never stores a client secret.
- Access tokens are stored in `localStorage` scoped to this origin and only sent as `Authorization: Bearer …` to `VITE_API_BASE_URL`.
- The backend remains the sole authority for role, assignment, and application-ownership checks. The frontend's role gate is a UX convenience, not a security boundary.
- CSP / HSTS / HTTPS should be enforced at the hosting layer (Vercel + the API gateway).

## Attribution

Built for the NexcentriQ HireMeBot platform.
