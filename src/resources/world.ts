import type { components, operations, paths } from '../generated/api.js'
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

  /** Composite world health dashboard — entity counts by type, event velocity (24h/7d), average confidence, and source breakdown. All computation server-side. */
  async getDashboard() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/dashboard', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Optionally filter by entity_type. */
  async listEnrichmentKeys(
    params?: paths['/v1/{workspace_id}/world/enrichment-keys']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/enrichment-keys', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Registers a new (entity_type, key) in this workspace's enrichment key registry. Future writes against this key will pass validation. value_type governs what values are accepted; enum types require allowed_values. Tag a person key with 'memory_extract' (description required) to make it a workspace-custom memory dimension the conversation extractor infers from transcripts. */
  async createEnrichmentKey(body: components['schemas']['EnrichmentKeyCreateBody']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/world/enrichment-keys', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Update allowed_values, source_hint, description, min_confidence, is_pii, or tags. key and value_type are immutable. */
  async updateEnrichmentKey(keyId: string, body: components['schemas']['EnrichmentKeyPatchBody']) {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/world/enrichment-keys/{key_id}', {
        params: { path: { workspace_id: this.workspaceId, key_id: keyId } },
        body,
      }),
    )
  }

  /** Existing entity.enriched events are not deleted (append-only); only future writes against this key will be rejected. */
  async deleteEnrichmentKey(keyId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/world/enrichment-keys/{key_id}', {
      params: { path: { workspace_id: this.workspaceId, key_id: keyId } },
    })
  }

  /** Polymorphic identifier → ranked entity candidates. Accepts any subset of {phone, email, canonical_id, external_id, entity_id} plus a required ``entity_type``. Served from the SDP serving surfaces: entity rows from the entity projection; canonical_id and external_id resolve through the canonical entity map by point reads. Returns matches ranked by confidence + number of identifiers matched. Summary narrowing: ``external_ids`` is always ``{}``, ``tags`` is always ``[]``, and ``canonical_id`` is the canonical-map value or the entity's MRN. */
  async resolveEntity(body: components['schemas']['EntityResolveRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/world/entities/resolve', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Write an enrichment value on an entity. Pass `idempotencyKey` to make a retry safe. */
  async putEntityEnrichment(
    entityId: EntityId | string,
    key: string,
    body: components['schemas']['EnrichmentWriteBody'],
    idempotencyKey?: string,
  ) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/world/entities/{entity_id}/enrichment/{key}', {
        params: {
          path: { workspace_id: this.workspaceId, entity_id: entityId, key },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body,
      }),
    )
  }

  /** Returns distinct event types in the workspace with counts, domains, and source breakdown. Enables the World Explorer to show what kinds of events flow through the world model. */
  async listEventTypes() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/world/event-types', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Writes one terminal conversation record per v1 conversation (real dates, provider='v1-migration'), giving the returning-user greeting and the real conversation list. Admin-only, idempotent + correctable per (workspace, v1 conversation id), memory-safe (no world events emitted → the memory extractor never re-derives from these). Transcript content (turns) is a separate follow-up. Batch size <= 500. */
  async importMigrationConversations(body: components['schemas']['MigrationConversationsBody']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/world/migration/conversations', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Imports in-flight v1 text threads with their transcripts. Each thread resolves or creates the active conversation an inbound reply from the recipient would resolve to, stores the context on it, and appends the v1 messages in sent_at order. A re-run appends only messages not yet imported; threads that conflict with the live path or arrive out of order are reported, not written. Sends no message and ends no session. Admin-only; at most 100 threads of 500 messages each. */
  async importMigrationTextThreads(body: components['schemas']['MigrationTextThreadsBody']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/world/migration/text-threads', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
