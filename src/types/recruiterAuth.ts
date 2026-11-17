/**
 * Recruiter sign-in / registration contract.
 * Source of truth: RECRUITER_AUTH_API.md (backend). Do not add fields or
 * `nextStep` values here without a matching backend change.
 */

/** Every `nextStep` the recruiter endpoints can return. */
export type RecruiterNextStep =
  | 'RECRUITER_DASHBOARD'
  | 'APPROVAL_PENDING'
  | 'RECRUITER_SIGNUP_FORM'

/** `user` of an approved recruiter. Only ACTIVE recruiters ever get this. */
export interface ActiveRecruiterUser {
  userId: number
  recruiterId: number
  firstName?: string
  lastName?: string
  email?: string
  phoneNumber?: string
  emailVerified?: boolean
  phoneVerified?: boolean
  accountStatus: 'ACTIVE'
  accountType: 'RECRUITER'
}

/** GET /api/v1/recruiters/auth/me, 200. A discriminated union on `nextStep`. */
export type RecruiterAccountLookup =
  | { nextStep: 'RECRUITER_DASHBOARD'; user: ActiveRecruiterUser }
  | { nextStep: 'APPROVAL_PENDING'; message?: string }
  | { nextStep: 'RECRUITER_SIGNUP_FORM'; message?: string }

/**
 * POST /api/v1/recruiters/register request body. Exactly these four fields;
 * the backend ignores (and we never send) email, ids, status or OTP values.
 */
export interface RegisterRecruiterRequest {
  firstName: string
  lastName: string
  phoneNumber: string
  acceptedTerms: true
}

/** POST /api/v1/recruiters/register, 201. `nextStep` is always APPROVAL_PENDING. */
export interface RegisterRecruiterResult {
  userId: number
  recruiterId: number
  accountStatus?: string
  nextStep: 'APPROVAL_PENDING'
  message?: string
}

/** Account states that must never reach the dashboard or the registration form. */
export type RestrictionCode =
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
  | 'ACCOUNT_TYPE_MISMATCH'
  | 'ACCOUNT_IDENTITY_CONFLICT'
  | 'EMAIL_NOT_VERIFIED'
  /** A 403 carrying a backend code this client does not know. */
  | 'ACCESS_DENIED'

export interface AccountRestriction {
  code: RestrictionCode
  message: string
  requestId?: string
}

/** A failure that says nothing about the account itself (network, 5xx, bad body). */
export interface AccountFailure {
  message: string
  requestId?: string
  code: string
}
