import { Amplify } from 'aws-amplify'
import { cognitoIsConfigured, env } from '@/lib/env'

/**
 * The OAuth scopes the shared Cognito app client allows. Requesting any other
 * scope (for example `profile`) makes Cognito reject the authorize request.
 */
export const COGNITO_SCOPES = ['openid', 'email']

let configured = false

/**
 * Configure Amplify with the existing HireMeBot Cognito user pool. Called once
 * from main.tsx BEFORE the first render: Amplify finishes an in-flight OAuth
 * redirect (the `/auth/callback?code=…` page load) as soon as it is configured.
 *
 * Returns false (and configures nothing) when the VITE_COGNITO_* variables are
 * missing, so mock / dev-header modes and unconfigured builds keep working.
 */
export function configureAmplify(): boolean {
  if (configured) return true
  if (!cognitoIsConfigured()) return false

  const { userPoolId, clientId, domain, redirectUri, logoutUri } = env.cognito

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
        loginWith: {
          oauth: {
            domain,
            scopes: COGNITO_SCOPES,
            redirectSignIn: [redirectUri],
            redirectSignOut: [logoutUri],
            // Authorization code grant; Amplify adds PKCE (S256) itself.
            responseType: 'code',
          },
        },
      },
    },
  })
  configured = true
  return true
}
