# HireMeBot Recruiter Portal (V1)

Desktop-first web app for the **HireMeBot** platform by **NexcentriQ**. Lets authorized recruiters sign in with Google through Amazon Cognito, view their assigned students, create job applications on their behalf, and track those applications.

- **Repository:** `NexcentriQ/HireMeBot_RECRUITER_WEB`
- **Production domain:** `https://recruiter.hiremebot.com`
- **Hosting:** Vercel

## Tech stack

React 18 · Vite · TypeScript · Tailwind CSS · Radix UI (shadcn-style primitives) · React Router · TanStack Query · React Hook Form · Zod · Axios · Vitest + React Testing Library.

## Features (V1)

1. One **Continue with Google** button for new and returning recruiters (Amazon Cognito + AWS Amplify, OAuth 2.0 Authorization Code + PKCE), recruiter registration, and a waiting-for-approval screen
2. Create Application form with validation and typed API adapter
3. Shared sidebar + header layout
4. Development mock mode so the UI is fully usable before Cognito or backend endpoints are wired up

Explicitly **out of scope** for V1: an approval UI (the owner approves recruiters manually in MySQL), application edit/delete, bulk actions, analytics, resume parsing, AI matching, email notifications.

## Getting started

```bash
# install dependencies
npm install

# copy environment template
cp .env.example .env.local

# run the dev server (http://localhost:5173)
npm run dev
```

By default `.env.local` ships with `VITE_USE_MOCK_API=true`, so the app runs end-to-end on in-memory sample data — you can sign in and create applications.

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
| `VITE_COGNITO_USER_POOL_ID` | Cognito user pool ID. |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client ID. |
| `VITE_COGNITO_DOMAIN` | Cognito Hosted UI domain (`<prefix>.auth.<region>.amazoncognito.com`). |
| `VITE_COGNITO_REDIRECT_URL` | OAuth redirect — must be `.../auth/callback` and registered on the app client. (`VITE_COGNITO_REDIRECT_URI` is still read as a fallback.) |
| `VITE_COGNITO_SIGNOUT_URL` | Sign-out redirect — the portal **root** (`.../`), registered on the app client. (`VITE_COGNITO_LOGOUT_URI` is still read as a fallback.) |
| `VITE_TERMS_URL` | Optional http(s) link to the recruiter Terms and Conditions on the registration form. |
| `VITE_USE_MOCK_API` | `true` enables in-memory mock mode (no real sign-in). Local only; a production build never enables it on its own. |
| `VITE_DEV_RECRUITER_ID` | Local-only dev header mode (see below). Leave blank to use Google sign-in. |

### Production values

For `recruiter.hiremebot.com`:

```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://api.hiremebot.com
VITE_COGNITO_REDIRECT_URL=https://recruiter.hiremebot.com/auth/callback
VITE_COGNITO_SIGNOUT_URL=https://recruiter.hiremebot.com/
```

The matching URLs must be whitelisted as **Allowed callback URL** and **Allowed sign-out URL** on the Cognito app client, and the Cognito app client must have **Google** enabled as an identity provider. The API Gateway CORS origin must allow the portal origin too. Today only `http://localhost:5173` is registered for the callback, the sign-out URL and CORS, so a deployed portal needs those extended first (and a deployed API URL in `VITE_API_BASE_URL`; the backend recruiter auth routes are not deployed yet).

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

The sign-in button becomes a one-click dev login (no OAuth, no account lookup). All API calls now attach `X-Dev-Recruiter-Id` instead of a Bearer token.

To exercise the real Google sign-in, registration and approval flow instead, **clear `VITE_DEV_RECRUITER_ID`** (see "Google sign-in, registration and approval" below): the two modes are mutually exclusive.

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

Mock mode never silently activates in a production build — if `VITE_USE_MOCK_API` is unset there, the real auth + API paths are used. (In dev and tests an unset value still means mock mode.)

## Google sign-in, registration and approval

One **Continue with Google** button serves new and returning recruiters. Anyone with a verified Google account can register as a recruiter, but a new recruiter is never active: the account is created `PENDING` and the owner approves it manually in MySQL. There is no approval API and no approval UI in this app.

```text
Continue with Google -> Cognito Hosted UI -> Google -> /auth/callback (Amplify finishes the code exchange)
   -> GET /api/v1/recruiters/auth/me          (Authorization: Bearer <Cognito ACCESS token>)
        RECRUITER_DASHBOARD    -> /applications/new   (existing workspace)
        APPROVAL_PENDING       -> /pending            (Check again / Sign out)
        RECRUITER_SIGNUP_FORM  -> /register           (first name, last name, phone, Terms)
                                   -> POST /api/v1/recruiters/register -> 201 APPROVAL_PENDING -> /pending
        403 / 409 account errors -> /restricted       (suspended, deleted, wrong account type, email conflict)
```

The backend contract is `RECRUITER_AUTH_API.md` (backend repo) and is the source of truth. The frontend never trusts a stored "approved" flag: **the account lookup runs on every app start and after every sign-in**, and only `RECRUITER_DASHBOARD` for an ACTIVE recruiter opens the workspace.

### Routes

| Route | Shown when |
|---|---|
| `/login` | no session; the **Continue with Google** button |
| `/auth/callback` | Cognito redirect target (Amplify completes sign-in, then the lookup decides where to go) |
| `/register` | lookup said `RECRUITER_SIGNUP_FORM` |
| `/pending` | lookup (or registration) said `APPROVAL_PENDING` |
| `/restricted` | suspended, deleted, student/manager Google account, email conflict, unverified email (`/access-denied` redirects here) |
| `/applications/new` | approved recruiters only (existing workspace) |

Each account route renders only in the state the backend reported; anything else is redirected to the route that accepts it. A failed lookup (network, 5xx, unexpected response) shows an in-place error with *Try again* / *Sign out* instead of redirecting, so it can never loop or grant access.

### How it is built

- `src/features/auth/amplifyConfig.ts` configures Amplify against the existing user pool (scopes `openid email`, code grant + PKCE). Called from `main.tsx` before the first render.
- `src/features/auth/cognitoAuth.ts` is a thin Amplify wrapper (`signInWithRedirect`, `signOut`, `fetchAuthSession`). Amplify stores and refreshes the tokens; this app never reads, stores or logs them. The access token is fetched immediately before each protected request.
- `src/features/auth/AuthContext.tsx` owns the single, deduplicated account lookup (safe under React Strict Mode) and the account state the route guards read.
- `src/features/auth/recruiterService.ts` calls the two recruiter endpoints. A 503 on the lookup is retried at 1 s / 2 s / 4 s. The registration POST is **never** retried: after a lost response or a 5xx it is resolved with a lookup.
- The registration draft (names, phone, Terms only) lives in `sessionStorage`, is tied to the Cognito subject, expires after 30 minutes and is cleared on success, sign-out and restricted accounts. A different Google account never sees it.

### Running it locally

1. Backend: `sam local start-api --env-vars env.json` (http://127.0.0.1:3000).
2. `.env.local`: copy the Cognito block from `.env.example`, set `VITE_USE_MOCK_API=false` and **leave `VITE_DEV_RECRUITER_ID` blank**.
3. `npm run dev`, and open **http://localhost:5173** (not 127.0.0.1: the callback and CORS origin are registered for `localhost:5173` only).

Both the Student Portal and this portal use the same Cognito app client. If both run locally they cannot both own port 5173. To run this portal elsewhere, first add that origin's `/auth/callback` and `/` to the app client's callback / sign-out URLs and to the API's `PortalOrigin` CORS setting. Vite falls back to another port when 5173 is busy (`strictPort: false`); that port will fail at the Google redirect.

### Known limitation: the existing dashboard data APIs

`POST /api/v1/recruiter/applications`, `GET /api/v1/recruiter/students`, `POST /api/v1/documents/upload-url` and `POST /api/v1/documents/register` still identify the caller with the development-only `X-Dev-Recruiter-Id` header and do not accept a Cognito token yet. A deployed stack answers `403` to them. So with real Google sign-in, an approved recruiter reaches the workspace, but the student list, application submission and document upload cannot work until those routes are migrated to Cognito JWT authorization (backend task). This app does not send the dev header alongside a Cognito session, and does not fake data to hide the gap. Use dev integration mode (above) to work on those screens locally.

### Manual end-to-end test (new recruiter, then returning recruiter)

Use a Google account that is **not** already a HireMeBot student.

1. Open http://localhost:5173/login and click **Continue with Google**.
2. After Google, you land on **/register** (the Google email is shown read-only, no email field).
3. Enter first name, last name, phone (e.g. `+17135550101`), tick Terms, **Submit registration** -> **/pending** ("Registration Submitted").
4. Click **Sign out**, then **Continue with Google** again -> **/pending** again (never the form).
5. Approve the recruiter in MySQL with `Registration/db/recruiter-approval.sql` (backend repo; `ROW_COUNT()` must be 1).
6. On the pending screen click **Check again** -> **/applications/new**.
7. Optional: set the account to `SUSPENDED` in MySQL, reload -> **/restricted**; sign in with a student Google account -> **/restricted** (account type).

## API contract (provisional)

The backend lives in a separate repo (`NexcentriQ/HireMeBot`) built on Java 21 + AWS Lambda + API Gateway + Cognito + MySQL. This frontend expects the following endpoints; adjust `src/features/*/applicationService.ts` and `src/features/students/studentService.ts` if the real shapes differ.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/v1/recruiters/auth/me` | recruiter account lookup (`nextStep`); implemented, see above |
| `POST` | `/api/v1/recruiters/register` | recruiter registration; implemented, see above |
| `GET` | `/api/v1/recruiter/students` | `AssignedStudent[]` |
| `POST` | `/api/v1/recruiter/applications` | `CreateApplicationResponse` |

Shapes are defined in [`src/types/domain.ts`](src/types/domain.ts) and [`src/types/recruiterAuth.ts`](src/types/recruiterAuth.ts).

**Endpoints still requiring backend implementation or verification:** the two singular `/recruiter/...` data endpoints above (the two plural `/recruiters/...` auth endpoints are implemented but not deployed). Confirm payload shapes, status enum values, and pagination query parameters against the Java/API Gateway service before shipping with `VITE_USE_MOCK_API=false`.

## Folder structure

```
src/
├── app/               App bootstrap, router, QueryClient
├── components/
│   ├── ui/            shadcn-style primitives (button, input, select, …)
│   ├── layout/        Sidebar, Header, RecruiterLayout, PageMeta
│   └── common/        Loading / Empty / Error / BrandLogo / GoogleIcon
├── features/
│   ├── auth/          Amplify/Cognito wrapper, AuthContext, Login/Callback/Register/Pending/Restricted pages
│   ├── applications/  Create Application page, service, Zod schemas
│   └── students/      Assigned-student service
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

The included suite covers the Zod schema validation, mock API behavior (students, create, auth checks), utility helpers, and the recruiter auth flow (`src/features/auth/__tests__/`: Amplify wrapper, account lookup and registration service, routing guards for every `nextStep` and error code, registration form, session expiry and sign-out). Add component tests under `src/**/__tests__/`.

The app-level tests mock Amplify and the HTTP layer, so they do not exercise a real Google login, Cognito or the backend; use the manual end-to-end test above for that.

Note: `npm test` reads `.env.local`. With `VITE_USE_MOCK_API=false` set there, the existing wizard test "warns in mock mode" fails; run it with `VITE_USE_MOCK_API=true npx vitest run` or remove the override to see it pass.

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
5. `vercel.json` includes an SPA rewrite so deep links like `/applications/new` do not 404 on refresh.

The Student Portal is a **separate** Vercel project and must not be modified from this repo.

## Security notes

- Only Cognito-federated recruiters that the backend reports as approved (`RECRUITER_DASHBOARD`, ACTIVE) may access protected routes. A Cognito session alone grants nothing.
- The frontend never stores a client secret.
- Tokens are held by Amplify (browser storage scoped to this origin), never written, logged or copied by this app, and only sent as `Authorization: Bearer …` to `VITE_API_BASE_URL`. The registration draft in `sessionStorage` holds form fields only.
- The backend remains the sole authority for role, assignment, and application-ownership checks. The frontend's role gate is a UX convenience, not a security boundary.
- CSP / HSTS / HTTPS should be enforced at the hosting layer (Vercel + the API gateway).

## Attribution

Built for the NexcentriQ HireMeBot platform.
