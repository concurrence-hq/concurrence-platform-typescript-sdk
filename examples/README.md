# SDK Examples

These examples are intentionally small and map directly to the public package surface.

- Primary product docs: [docs.amigo.ai](https://docs.amigo.ai/)
- API reference: [docs.amigo.ai/api-reference](https://docs.amigo.ai/api-reference)

Unlike the broader docs estate, these files live with the SDK and are typechecked in CI so they stay aligned with the shipped client.

## Environment

Copy [`.env.example`](./.env.example) into your local environment or export the same variables in your shell:

- `AMIGO_API_KEY`
- `AMIGO_WORKSPACE_ID`
- `AMIGO_BASE_URL` (optional)
- `AMIGO_SERVICE_ID` (conversation examples)
- `AMIGO_EXTERNAL_INTEGRATION_CLIENT_ID` (external-user session example)
- `AMIGO_EXTERNAL_INTEGRATION_CLIENT_SECRET` (external-user session example)
- `AMIGO_EXTERNAL_SUBJECT_KEY` (external-user session example)
- `AMIGO_CONSUMER_ENTITY_ID` (optional, external-user session example)
- `AMIGO_WEBHOOK_SECRET` (webhook example)
- `AMIGO_WEBHOOK_SIGNATURE` (webhook example)
- `AMIGO_WEBHOOK_TIMESTAMP` (optional, webhook example)
- `AMIGO_WEBHOOK_BODY` (optional, webhook example)

## Examples

- [examples/auth/exchange-api-key.ts](./auth/exchange-api-key.ts): exchange a long-lived API key for a short-lived identity-issued JWT, then use it with `AmigoClient`
- [examples/auth/external-user-session.ts](./auth/external-user-session.ts): exchange external-integration client credentials, mint an external-user session, send turns, refresh, and continue the conversation
- [examples/basic/list-agents.ts](./basic/list-agents.ts): list agents with the public client
- [examples/analytics/dashboard.ts](./analytics/dashboard.ts): read dashboard and call analytics
- [examples/advanced/scoped-request-control.ts](./advanced/scoped-request-control.ts): apply timeout, retry, and header overrides on the normal resource surface
- [examples/advanced/request-control.ts](./advanced/request-control.ts): use low-level typed request helpers with timeout, retries, headers, and raw response access
- [examples/world/search-entities.ts](./world/search-entities.ts): query entities and inspect timelines
- [examples/webhooks/verify-webhook.ts](./webhooks/verify-webhook.ts): verify and parse a webhook delivery
- [examples/surfaces/create-and-deliver.ts](./surfaces/create-and-deliver.ts): create a patient intake form and deliver it via SMS
- [examples/surfaces/render-form.ts](./surfaces/render-form.ts): fetch a surface spec by token and display the field structure (uses public token routes)
- [examples/conversations/text-chat.ts](./conversations/text-chat.ts): connect to a text agent via WebSocket, send a message, and display streaming tool calls + responses

For full walkthroughs, see the guides:

- [Build a Custom Patient Form](../docs/guides/build-a-form.md)
- [External User Text Conversations](../docs/guides/external-user-text-conversations.md)
