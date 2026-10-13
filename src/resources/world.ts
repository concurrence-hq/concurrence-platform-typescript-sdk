import type { operations } from '../generated/api.js'
import type { EntityId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * World Model — entities, events, relationships, and the entity timeline.
 *
 * The world model is the core knowledge graph of the platform. Entities
 * represent real-world objects (patients, contacts, calls). Events record
 * observations about entities over time.
 */
export class WorldResource extends WorkspaceScopedResource {
  // ---- Entities ----

  /** List entities with optional filtering */
  async listEntities(params?: {
    entity_type?: string[] | null
    q?: string | null
    limit?: number
    offset?: number
    order?: string | null
    has_projection?: boolean | null
    source?: string | null
    source_system?: string | null
    fhir_resource_type?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listEntitiesAutoPaging(params?: {
    entity_type?: string[] | null
    q?: string | null
    limit?: number
    offset?: number
    order?: string | null
    has_projection?: boolean | null
    source?: string | null
    source_system?: string | null
    fhir_resource_type?: string | null
  }) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.listEntities(pageParams),
      (page) => page.entities,
      params,
    )
  }

  /** Get a single entity */
  async getEntity(entityId: EntityId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId } },
      }),
    )
  }

  /** Get all relationships for an entity */
  async getRelationships(entityId: EntityId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/relationships', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId } },
      }),
    )
  }

  /** Get the knowledge graph centered on an entity (entity + neighbors + edges) */
  async getGraph(entityId: EntityId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/graph', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId } },
      }),
    )
  }

  /** Get provenance — which source systems contributed data for an entity */
  async getProvenance(entityId: EntityId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/provenance', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId } },
      }),
    )
  }

  /** Get lineage — merge history and canonical identity for an entity */
  async getLineage(entityId: EntityId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/lineage', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId } },
      }),
    )
  }

  /** Get merged entities for a canonical entity */
  async getMerged(entityId: EntityId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/merged', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId } },
      }),
    )
  }

  // ---- Connectors ----

  /** List entities from a specific connector / data source */
  async getConnectorEntities(
    dataSourceId: string,
    params?: {
      entity_type?: string | null
      q?: string | null
      limit?: number
      offset?: number
    },
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/connectors/{data_source_id}/entities', {
        params: {
          path: { workspace_id: this.workspaceId, data_source_id: dataSourceId },
          query: params,
        },
      }),
    )
  }

  /** Search FHIR resources from a specific data source */
  async getConnectorResources(
    dataSourceId: string,
    params: {
      resource_type: string
      _count?: number
      _offset?: number
    },
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/connectors/{data_source_id}/resources', {
        params: {
          path: { workspace_id: this.workspaceId, data_source_id: dataSourceId },
          query: params,
        },
      }),
    )
  }

  // ---- Entity Types ----

  /** List registered entity types with counts and schemas */
  async listEntityTypes() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entity-types', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  // ---- Duplicate Detection ----

  /** List potential duplicate entity pairs for review or merging */
  async listDuplicates(params?: { entity_type?: string | null; confidence_max?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/duplicates', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  // ---- Semantic Search ----

  /** Semantic (vector) search over entities */
  async search(params: {
    q: string
    entity_type?: string | null
    source?: string | null
    confidence_min?: number | null
    limit?: number
    offset?: number
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/search', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  // ---- Timeline ----

  /** Get the event timeline for an entity (reverse-chronological) */
  async getTimeline(
    entityId: EntityId | string,
    params?: {
      domain?: string | null
      limit?: number
      offset?: number
    },
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/timeline', {
        params: {
          path: { workspace_id: this.workspaceId, entity_id: entityId },
          query: params,
        },
      }),
    )
  }

  getTimelineAutoPaging(
    entityId: EntityId | string,
    params?: {
      domain?: string | null
      limit?: number
      offset?: number
    },
  ) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.getTimeline(entityId, pageParams),
      (page) => page.events,
      params,
    )
  }

  // ---- Enrichment ----

  /**
   * List an entity's current enrichment values, one per key with its provenance, sorted by
   * key. Page with `limit` (default 200, max 500) and `offset`. A fresh write can take a moment
   * to appear. A missing entity throws `NotFoundError`.
   */
  async listEnrichment(
    entityId: EntityId | string,
    params?: NonNullable<operations['list-entity-enrichment']['parameters']['query']>,
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entities/{entity_id}/enrichment', {
        params: {
          path: { workspace_id: this.workspaceId, entity_id: entityId },
          query: params,
        },
      }),
    )
  }

  /**
   * Get the audit trail of one enrichment key on an entity, newest first, up to `limit` entries
   * (default 50, max 200). `dropped_count` counts entries left out for missing provenance. A
   * missing entity throws `NotFoundError`.
   */
  async getEnrichmentHistory(
    entityId: EntityId | string,
    key: string,
    params?: NonNullable<operations['get-entity-enrichment-history']['parameters']['query']>,
  ) {
    return extractData(
      await this.client.GET(
        '/v1/{workspace_id}/world/entities/{entity_id}/enrichment/{key}/history',
        {
          params: {
            path: { workspace_id: this.workspaceId, entity_id: entityId, key },
            query: params,
          },
        },
      ),
    )
  }

  // ---- Statistics ----

  /** Get aggregate entity and event statistics */
  async getStats() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/entity-stats', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Get entity counts broken down by source system */
  async getSourceBreakdown() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/source-breakdown', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }
}
