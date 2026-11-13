import { DEFAULT_IDENTITY_URL } from '../core/device-code.js'
import { createPlatformClient } from '../core/openapi-client.js'
import { IdentityResource } from './identity/base.js'

export type WorkspaceAuthenticationCoverage = 'all_human_members' | 'managed_members'

export interface WorkspaceAuthenticationPolicy {
  workspace_id: string
  mode: 'optional' | 'required'
  revision: string | null
  configuration_revision: string | null
  connection_id: string | null
  coverage: WorkspaceAuthenticationCoverage | null
}

export interface ConfigureWorkspaceAuthentication {
  expected_revision: string | null
  connection_id: string | null
  coverage: WorkspaceAuthenticationCoverage | null
}

export interface WorkspaceAuthenticationRevision {
  expected_revision: string
}

export interface WorkspaceAuthenticationOwnerConfirmation {
  workspace_id: string
  configuration_revision: string
  connection_id: string
  connection_revision: string
  membership_id: string
  binding_id: string
  confirmed_at: string
}

export interface WorkspaceCredentialInventory {
  workspace_id: string
  policy_revision: string
  configuration_revision: string
  complete: boolean
  fingerprint: string | null
  total_credentials: number
  machine_credentials: number
  human_credentials: number
  raw_api_keys: number
  unclassified_credentials: number
}

export interface ReviewWorkspaceCredentials extends WorkspaceAuthenticationRevision {
  inventory_fingerprint: string
}

export interface WorkspaceCredentialReview {
  workspace_id: string
  configuration_revision: string
  inventory_fingerprint: string
  membership_id: string
  reviewed_at: string
}

export interface ConfigureWorkspaceAuthenticationRecovery {
  policy_revision: string
  membership_id: string
}

export interface WorkspaceAuthenticationRecoveryCodes {
  workspace_id: string
  policy_revision: string
  configuration_revision: string
  recovery_revision: string
  membership_id: string
  /** Returned once. Keep outside query caches, logs, URLs and browser storage. */
  codes: string[]
}

export interface WorkspaceAuthenticationRecoverySecret {
  recovery_revision: string
  code: string
}

export interface WorkspaceAuthenticationRecoveryTest {
  policy_revision: string
  remaining_codes: number
}

export interface RecoveredWorkspaceAuthentication {
  mode: 'optional'
  policy_revision: string
}

export interface RecoverWorkspaceAuthenticationOptions extends WorkspaceAuthenticationRecoverySecret {
  workspaceId: string
  identityBaseUrl?: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  timeout?: number
}

/** Disables the policy using a recovery code. Does not sign in or issue tokens. */
export function recoverWorkspaceAuthentication(
  options: RecoverWorkspaceAuthenticationOptions,
): Promise<RecoveredWorkspaceAuthentication> {
  const identityBaseUrl = options.identityBaseUrl ?? DEFAULT_IDENTITY_URL
  const client = createPlatformClient({
    apiKey: 'unused-recovery-credential',
    baseUrl: identityBaseUrl,
    identityBaseUrl,
    fetch: options.fetch,
  })
  return new WorkspaceAuthenticationResource(client, options.workspaceId)
    .withOptions({ signal: options.signal, timeout: options.timeout })
    .recover({ recovery_revision: options.recovery_revision, code: options.code })
}

export interface WorkspaceAuthenticationReadiness {
  workspace_id: string
  policy_revision: string
  configuration_revision: string
  connection_id: string
  connection_revision: string
  ready: boolean
  blockers: string[]
  covered_members: number
  observed_at: string
  valid_until: string | null
  /** Diagnostic evidence reference, never an authorization token. */
  evidence_fingerprint: string | null
}

/** Current human administrator operations, enforced by Identity. */
export class WorkspaceAuthenticationResource extends IdentityResource {
  get(): Promise<WorkspaceAuthenticationPolicy> {
    return this.request('GET', 'authentication-policy')
  }

  configure(body: ConfigureWorkspaceAuthentication): Promise<WorkspaceAuthenticationPolicy> {
    return this.request('PUT', 'authentication-policy', body)
  }

  confirmOwner(
    body: WorkspaceAuthenticationRevision,
  ): Promise<WorkspaceAuthenticationOwnerConfirmation> {
    return this.request('POST', 'authentication-policy/owner-confirmation', body)
  }

  credentialInventory(): Promise<WorkspaceCredentialInventory> {
    return this.request('GET', 'authentication-policy/credential-inventory')
  }

  reviewCredentials(body: ReviewWorkspaceCredentials): Promise<WorkspaceCredentialReview> {
    return this.request('POST', 'authentication-policy/credential-review', body)
  }

  configureRecovery(
    body: ConfigureWorkspaceAuthenticationRecovery,
  ): Promise<WorkspaceAuthenticationRecoveryCodes> {
    return this.request('POST', 'authentication-policy/recovery', body)
  }

  /** Consumes one code. Must be called by the selected recovery administrator. */
  testRecovery(
    body: WorkspaceAuthenticationRecoverySecret,
  ): Promise<WorkspaceAuthenticationRecoveryTest> {
    return this.request('POST', 'authentication-policy/recovery/test', body)
  }

  /** Optional-policy preparation; only fresh server evidence can authorize activation. */
  readiness(body: WorkspaceAuthenticationRevision): Promise<WorkspaceAuthenticationReadiness> {
    return this.request('POST', 'authentication-policy/readiness', body)
  }

  /** Rechecks readiness on the server. Never accepts client evidence claims. */
  activate(body: WorkspaceAuthenticationRevision): Promise<WorkspaceAuthenticationPolicy> {
    return this.request('POST', 'authentication-policy/activate', body)
  }

  disable(body: WorkspaceAuthenticationRevision): Promise<WorkspaceAuthenticationPolicy> {
    return this.request('POST', 'authentication-policy/disable', body)
  }

  /** Uses no bearer token or cookies and never creates a session. */
  recover(body: WorkspaceAuthenticationRecoverySecret): Promise<RecoveredWorkspaceAuthentication> {
    return this.request('POST', 'authentication-recovery', body, { anonymous: true })
  }
}
