import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type DataQueryParams = NonNullable<
  paths['/v1/{workspace_id}/query/{schema}/{table}']['get']['parameters']['query']
>
export type WorkspaceQueryRequest =
  components['schemas']['src__routes__workspace_tables__execute_workspace_query__Request']
export type WorkspaceQueryResponse =
  components['schemas']['src__routes__workspace_tables__execute_workspace_query__Response']

/**
 * Data queries over the workspace's Lakebase tables: `run` reads rows from one whitelisted
 * schema/table with PostgREST-style filters, and `execute` runs one SQL statement.
 *
 * Used by the developer console's data-explorer and SQL editor surfaces.
 *
 * @beta New in this release; surface may evolve.
 */
export class DataQueryResource extends WorkspaceScopedResource {
  /** Run a tabular query against a workspace dataset */
  async run(schema: string, table: string, params?: DataQueryParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/query/{schema}/{table}', {
        params: {
          path: { workspace_id: this.workspaceId, schema, table },
          query: params,
        },
      }),
    )
  }

  /**
   * Run one SQL statement as the workspace's own database role, which can read and write only
   * what its grants allow. Needs workspace update permission. Multi-statement SQL and session
   * commands such as `SET ROLE` throw `ValidationError`. Anything else the role can't run, DDL
   * included, throws `BadRequestError` with the Postgres message. A statement that returns no
   * rows still reports its `row_count`.
   */
  async execute(body: WorkspaceQueryRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/query', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
