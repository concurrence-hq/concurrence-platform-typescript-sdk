import type { Middleware } from 'openapi-fetch'
import type { IdentityTokenResponse } from '../core/device-code.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export const EXTERNAL_USER_SESSION_CREATE_SCOPE = 'external_user_sessions:create'

export interface ApiKeyTokenExchangeRequest {
  /** API key to exchange for an identity-issued JWT. */
  apiKey: string
  /** Optional space-delimited OAuth scope restriction. */
  scope?: string
}

export type ApiKeyTokenExchangeResponse = IdentityTokenResponse

export interface ClientCredentialsTokenRequest {
  /** OAuth client ID for a workspace credential or external integration credential. */
  clientId: string
  /** OAuth client secret. Plaintext secrets are shown only when credentials are created or rotated. */
  clientSecret: string
  /** Optional space-delimited OAuth scope restriction. */
  scope?: string
}

export type ClientCredentialsTokenResponse = IdentityTokenResponse

export interface ExternalUserSessionTokenRequest {
  /**
   * Workspace to bind the external-user token to. Defaults to the client's
   * configured workspace ID.
   */
  workspaceId?: string
  /**
   * Stable customer-side subject key for the external user. The platform
   * stores only a keyed hash of this value.
   */
  externalSubjectKey: string
  /** Subject class for the external user. */
  subjectType: 'user' | 'anonymous'
  /** Service the external-user token may use. */
  serviceId: string
  /** Optional materialized world entity UUID when the subject is already linked. */
  consumerEntityId?: string
  /** Optional child-token TTL in seconds. Server accepts 900-3600 seconds. */
  ttlSeconds?: number
  /** Optional space-delimited external-user scope restriction. */
  scope?: string
  /**
   * Parent external-integration access token. When omitted, the SDK uses the
   * bearer token configured on this AmigoClient instance.
   */
  parentAccessToken?: string
}

export interface ExternalUserSessionTokenResponse extends IdentityTokenResponse {
  session_id: string
  consumer_subject_id: string
  subject_type: 'user' | 'anonymous'
  consumer_entity_id?: string | null
}

export interface RefreshTokenRequest {
  refreshToken: string
  /** Workspace for workspace-scoped refresh flows. Defaults to omitted. */
  workspaceId?: string
  /** Optional space-delimited OAuth scope restriction. */
  scope?: string
}

export type RefreshTokenResponse = IdentityTokenResponse

const omitAuthorizationHeader: Middleware = {
  onRequest({ request }) {
    request.headers.delete('Authorization')
    return request
  },
}

function setAuthorizationHeader(accessToken: string): Middleware {
  return {
    onRequest({ request }) {
      request.headers.set('Authorization', `Bearer ${accessToken}`)
      return request
    },
  }
}

function formBody(fields: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(key, value)
  }
  return body
}

/**
 * Identity token operations.
 *
 * Every call is `POST /token` on the client's `identityBaseUrl`, not on the
 * platform API host: the hosted platform serves identity on its own host.
 */
export class TokensResource extends WorkspaceScopedResource {
  /** Exchange an API key for an identity-issued JWT access token. */
  async exchangeApiKey(request: ApiKeyTokenExchangeRequest): Promise<ApiKeyTokenExchangeResponse> {
    const body = formBody({
      grant_type: 'api_key',
      api_key: request.apiKey,
      scope: request.scope,
    })

    return extractData(
      await this.client.POST(
        '/token' as never,
        {
          baseUrl: this.identityBaseUrl,
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          middleware: [omitAuthorizationHeader],
        } as never,
      ),
    ) as ApiKeyTokenExchangeResponse
  }

  /**
   * Exchange OAuth client credentials for a parent JWT.
   *
   * External integration credentials must request only
   * `external_user_sessions:create`; that parent token is a delegation
   * credential for minting external-user sessions, not a general platform API
   * token.
   */
  async exchangeClientCredentials(
    request: ClientCredentialsTokenRequest,
  ): Promise<ClientCredentialsTokenResponse> {
    const body = formBody({
      grant_type: 'client_credentials',
      client_id: request.clientId,
      client_secret: request.clientSecret,
      scope: request.scope,
    })

    return extractData(
      await this.client.POST(
        '/token' as never,
        {
          baseUrl: this.identityBaseUrl,
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          middleware: [omitAuthorizationHeader],
        } as never,
      ),
    ) as ClientCredentialsTokenResponse
  }

  /**
   * Mint a short-lived external-user session token from a parent
   * external-integration JWT.
   */
  async createExternalUserSession(
    request: ExternalUserSessionTokenRequest,
  ): Promise<ExternalUserSessionTokenResponse> {
    const body = formBody({
      grant_type: 'external_user_session',
      workspace_id: request.workspaceId ?? this.workspaceId,
      external_subject_key: request.externalSubjectKey,
      subject_type: request.subjectType,
      service_id: request.serviceId,
      consumer_entity_id: request.consumerEntityId,
      ttl_seconds: request.ttlSeconds === undefined ? undefined : String(request.ttlSeconds),
      scope: request.scope,
    })

    return extractData(
      await this.client.POST(
        '/token' as never,
        {
          baseUrl: this.identityBaseUrl,
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          ...(request.parentAccessToken && {
            middleware: [setAuthorizationHeader(request.parentAccessToken)],
          }),
        } as never,
      ),
    ) as ExternalUserSessionTokenResponse
  }

  /** Rotate a refresh token for a new access-token and refresh-token pair. */
  async refresh(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const body = formBody({
      grant_type: 'refresh_token',
      refresh_token: request.refreshToken,
      workspace_id: request.workspaceId,
      scope: request.scope,
    })

    return extractData(
      await this.client.POST(
        '/token' as never,
        {
          baseUrl: this.identityBaseUrl,
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          middleware: [omitAuthorizationHeader],
        } as never,
      ),
    ) as RefreshTokenResponse
  }
}
