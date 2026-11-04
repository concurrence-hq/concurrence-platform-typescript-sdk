import type { components } from '../generated/api.js'
import type { WorkspaceId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

/**
 * Manage Amigo Platform workspaces.
 * Workspaces are the top-level tenancy boundary for all resources.
 *
 * Note: ``list`` operates at account level (``/v1/workspaces``).
 * Creation lives at ``/v1/me/workspaces`` — see ``MeResource``
 * (``client.me.createWorkspace``). The legacy
 * ``POST /v1/workspaces/self-service`` was removed in platform-api
 * PR #2472; ``/v1/workspaces/<x>`` paths now exclusively operate on
 * a specific workspace, so URL-parsing consumers can never confuse
 * an account-level operation with a workspace-scoped one.
 * Get/update/archive/provision operate on a specific workspace.
 */
export class WorkspacesResource extends WorkspaceScopedResource {
  /** List workspaces accessible to the current API key */
  async list(params?: ListParams) {
    return extractData(
      await this.client.GET('/v1/workspaces', {
        params: { query: params },
      }),
    )
  }

  listAutoPaging(params?: ListParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Get a single workspace by ID */
  async get(id?: WorkspaceId | string) {
    return extractData(
      await this.client.GET('/v1/workspaces/{workspace_id}', {
        params: { path: { workspace_id: id ?? this.workspaceId } },
      }),
    )
  }

  /** Update workspace metadata */
  async update(body: components['schemas']['UpdateWorkspaceRequest'], id?: WorkspaceId | string) {
    return extractData(
      await this.client.PATCH('/v1/workspaces/{workspace_id}', {
        params: { path: { workspace_id: id ?? this.workspaceId } },
        body,
      }),
    )
  }

  /** Archive (soft-delete) a workspace */
  async archive(body: components['schemas']['ArchiveWorkspaceRequest'], id?: WorkspaceId | string) {
    return extractData(
      await this.client.POST('/v1/workspaces/{workspace_id}/archive', {
        params: { path: { workspace_id: id ?? this.workspaceId } },
        body,
      }),
    )
  }

  /** Provision a workspace (seed integrations, mark as provisioned) */
  async provision(id?: WorkspaceId | string) {
    return extractData(
      await this.client.POST('/v1/workspaces/{workspace_id}/provision', {
        params: { path: { workspace_id: id ?? this.workspaceId } },
      }),
    )
  }

  /**
   * Workspace-allowlisted phone numbers that can place test calls into voice
   * agents. The list is read-mostly; writes overwrite the entire allowlist.
   *
   * Always operates on the bound workspace. Use `client.withOptions(...)` or
   * construct a second `AmigoClient` if you need to act on a different
   * workspace.
   */
  readonly testCallerNumbers = {
    /** Get the workspace's test caller allowlist */
    get: async () =>
      extractData(
        await this.client.GET('/v1/workspaces/{workspace_id}/test-caller-numbers', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),

    /**
     * Replace the workspace's test caller allowlist.
     *
     * **Replace-all semantics:** the request body fully replaces the existing
     * allowlist; numbers omitted from `body` are removed. Read first, mutate,
     * then write to add/remove individual entries safely.
     */
    update: async (body: components['schemas']['TestCallerNumbersRequest']) =>
      extractData(
        await this.client.PUT('/v1/workspaces/{workspace_id}/test-caller-numbers', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  /** Get the credential IDs configured as test principals for this workspace's text channel. */
  async getTestCredentialIds() {
    return extractData(
      await this.client.GET('/v1/workspaces/{workspace_id}/test-credential-ids', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Set credential IDs to be treated as test principals. Text turns from these credentials are tagged source='test' and excluded from billing, scores, analytics, outbound EHR sync, and entity views. */
  async updateTestCredentialIds(body: components['schemas']['TestCredentialIdsRequest']) {
    return extractData(
      await this.client.PUT('/v1/workspaces/{workspace_id}/test-credential-ids', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
