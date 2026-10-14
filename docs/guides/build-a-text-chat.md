# Build a Text Chat Integration

This guide walks through building a real-time text chat frontend that connects to an Amigo agent via WebSocket. By the end, you will be able to stream agent responses, display tool call activity, and resume frozen conversations.

## Concepts

**Conversations** are persistent, multi-turn text sessions with an agent. They support two transports:

- **REST** (`POST /v1/{workspace_id}/conversations/{id}/turns`) — synchronous request-response. Good for server-to-server integrations.
- **WebSocket** (`/agent/text-stream`) — real-time bidirectional. Good for chat UIs. This is what this guide covers.

Both transports share the same conversation state. You can start over REST and resume over WebSocket, or vice versa.

**Tool calls** happen when the agent needs to fetch data or perform actions (search appointments, check insurance, look up medications). When `tool_events=true`, the WebSocket surfaces these as `tool_call_started` and `tool_call_completed` frames so your UI can show what the agent is doing.

### Conversation lifecycle

```
[New] --> Active --> Frozen --> Active --> ... --> Closed
                 (turn done)        (next turn)
```

After every turn, the conversation freezes. The next message thaws it. This is invisible — just keep sending messages.

## Step 1: Create a conversation

Use the SDK to create a conversation. This gives you a `conversation_id` for the WebSocket connection.

```typescript
import { AmigoClient } from '@amigo-ai/platform-sdk'

const client = new AmigoClient({
  apiKey: process.env.AMIGO_API_KEY!,
  workspaceId: process.env.AMIGO_WORKSPACE_ID!,
})

const conversation = await client.conversations.create({
  service_id: 'your-service-id',
  entity_id: 'optional-patient-entity-id', // for world model context
})

console.log(conversation.id) // UUID — save this
```

## Step 2: Connect via WebSocket

The SDK provides `textStreamUrl()` and `textStreamAuthProtocols()` helpers.

### Browser

```typescript
import { AmigoClient, textStreamAuthProtocols } from '@amigo-ai/platform-sdk'

const client = new AmigoClient({
  apiKey: API_KEY,
  workspaceId: WORKSPACE_ID,
})

const url = client.conversations.textStreamUrl({
  serviceId: SERVICE_ID,
  conversationId: conversation.id, // optional — omit for new conversation
  entityId: ENTITY_ID, // optional — patient context
})

// Authenticate via subprotocol (keeps token out of URL)
const protocols = textStreamAuthProtocols(API_KEY)
const ws = new WebSocket(url, protocols)
```

### Node.js

```typescript
import WebSocket from 'ws'

const url = client.conversations.textStreamUrl({
  serviceId: SERVICE_ID,
  toolEvents: true,
  token: API_KEY, // query param fallback for Node.js
})

const ws = new WebSocket(url)
```

### Query parameters

| Parameter         | Required | Description                                          |
| ----------------- | -------- | ---------------------------------------------------- |
| `workspace_id`    | Yes      | Workspace ID                                         |
| `service_id`      | Yes      | Which agent to talk to                               |
| `token`           | Yes\*    | API key or JWT (\*or use subprotocol auth)           |
| `conversation_id` | No       | Resume a frozen conversation                         |
| `entity_id`       | No       | Patient entity ID for world model context            |
| `tool_events`     | No       | `true` to receive tool call frames (default `false`) |

## Step 3: Handle streaming events

### Wire protocol

**Client sends:**

| Frame                                | Description         |
| ------------------------------------ | ------------------- |
| `{"type": "message", "text": "..."}` | Send a user message |
| `{"type": "stop"}`                   | End the session     |

**Server sends:**

| Frame                                                                                                       | When                                               |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `{"type": "session_started", "session_id": "...", "conversation_id": "..."}`                                | First frame after connection                       |
| `{"type": "typing"}`                                                                                        | Agent is thinking                                  |
| `{"type": "tool_call_started", "tool_name": "...", "call_id": "...", "input": {...}}`                       | Agent started a tool (requires `tool_events=true`) |
| `{"type": "tool_call_completed", "tool_name": "...", "call_id": "...", "result": "...", "succeeded": true}` | Tool finished (requires `tool_events=true`)        |
| `{"type": "message", "text": "..."}`                                                                        | Agent's response                                   |
| `{"type": "error", "message": "..."}`                                                                       | Error (connection stays open)                      |
| `{"type": "session_ended", "reason": "..."}`                                                                | Session ended, socket closing                      |

### Event sequence for a turn with tool calls

```
Client: {"type": "message", "text": "What appointments are available?"}
Server: {"type": "typing"}
Server: {"type": "tool_call_started", "tool_name": "search_appointments", "call_id": "c1", "input": {"date": "2026-04-29"}}
Server: {"type": "tool_call_completed", "tool_name": "search_appointments", "call_id": "c1", "result": "[{\"time\": \"2pm\", ...}]", "succeeded": true}
Server: {"type": "message", "text": "I found 3 available appointments for tomorrow..."}
```

### Message handler

```typescript
ws.onmessage = (event) => {
  const frame = JSON.parse(event.data)

  switch (frame.type) {
    case 'session_started':
      // Save conversation_id for reconnection
      localStorage.setItem('conversationId', frame.conversation_id)
      break

    case 'typing':
      showTypingIndicator()
      break

    case 'tool_call_started':
      // Show tool activity: "Searching appointments..."
      showToolCard(frame.call_id, frame.tool_name, frame.input)
      break

    case 'tool_call_completed':
      // Update tool card with result or error
      updateToolCard(frame.call_id, frame.result, frame.succeeded)
      break

    case 'message':
      hideTypingIndicator()
      appendMessage('agent', frame.text)
      break

    case 'error':
      showError(frame.message)
      break

    case 'session_ended':
      disableInput()
      showStatus(`Session ended: ${frame.reason}`)
      break
  }
}
```

## Step 4: Display tool calls

When a tool call starts, create a card showing the tool name and input. When it completes, update the card with the result.

```typescript
function showToolCard(callId: string, toolName: string, input: Record<string, unknown>) {
  const card = document.createElement('div')
  card.id = `tool-${callId}`
  card.className = 'tool-card loading'
  card.innerHTML = `
    <span class="tool-name">${toolName}</span>
    <span class="tool-input">${JSON.stringify(input)}</span>
    <span class="tool-status">Running...</span>
  `
  chatLog.appendChild(card)
}

function updateToolCard(callId: string, result: string, succeeded: boolean) {
  const card = document.getElementById(`tool-${callId}`)
  if (!card) return
  card.classList.remove('loading')
  card.classList.add(succeeded ? 'success' : 'failure')
  const status = card.querySelector('.tool-status')!
  status.textContent = succeeded ? result.slice(0, 200) : `Failed: ${result}`
}
```

## Step 5: Resume a frozen conversation

When the WebSocket disconnects, the conversation freezes. To resume, reconnect with the same `conversation_id`:

```typescript
const url = client.conversations.textStreamUrl({
  serviceId: SERVICE_ID,
  conversationId: localStorage.getItem('conversationId')!,
})
const ws = new WebSocket(url, textStreamAuthProtocols(API_KEY))
// No greeting — agent waits for your message
```

## Step 6: REST turns (alternative)

For server-to-server integrations, use `POST /turns` instead of WebSocket. Tool calls are returned in the response when `include_tool_calls=true`:

```typescript
const response = await client.conversations.createTurn(conversationId, {
  message: 'What appointments are available?',
})

// response.output — agent's response messages
// response.tool_calls — tool call details (when include_tool_calls=true)
```

```bash
curl -X POST "https://platform.api-us.concurrence.com/v1/$WS/conversations/$CONV/turns?include_tool_calls=true" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What appointments are available?"}'
```

## Complete reference implementation

Copy this HTML file, fill in your credentials, and open it in a browser. It demonstrates the complete WebSocket text chat flow with tool call display.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Amigo Text Chat</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: system-ui, sans-serif;
        background: #f5f5f5;
        height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .config {
        padding: 12px 16px;
        background: #fff;
        border-bottom: 1px solid #ddd;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: end;
      }
      .config label {
        font-size: 12px;
        color: #666;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .config input {
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 13px;
        width: 180px;
      }
      .config button {
        padding: 6px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }
      .config .connect {
        background: #2563eb;
        color: #fff;
      }
      .config .disconnect {
        background: #dc2626;
        color: #fff;
      }
      .status {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 12px;
        align-self: center;
      }
      .status.connected {
        background: #dcfce7;
        color: #166534;
      }
      .status.disconnected {
        background: #fee2e2;
        color: #991b1b;
      }
      .chat {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .msg {
        max-width: 70%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .msg.user {
        align-self: flex-end;
        background: #2563eb;
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .msg.agent {
        align-self: flex-start;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-bottom-left-radius: 4px;
      }
      .msg.system {
        align-self: center;
        background: #f3f4f6;
        color: #6b7280;
        font-size: 12px;
        border-radius: 8px;
      }
      .tool-card {
        align-self: stretch;
        background: #fefce8;
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 13px;
      }
      .tool-card.success {
        background: #f0fdf4;
        border-color: #bbf7d0;
      }
      .tool-card.failure {
        background: #fef2f2;
        border-color: #fecaca;
      }
      .tool-card .name {
        font-weight: 600;
      }
      .tool-card .result {
        color: #374151;
        margin-top: 4px;
        font-size: 12px;
        max-height: 80px;
        overflow: hidden;
      }
      .typing {
        align-self: flex-start;
        color: #9ca3af;
        font-size: 13px;
        padding: 4px 0;
      }
      .input-bar {
        padding: 12px 16px;
        background: #fff;
        border-top: 1px solid #ddd;
        display: flex;
        gap: 8px;
      }
      .input-bar input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #ccc;
        border-radius: 8px;
        font-size: 14px;
      }
      .input-bar button {
        padding: 10px 20px;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
      }
      .input-bar button:disabled {
        background: #93c5fd;
        cursor: not-allowed;
      }
    </style>
  </head>
  <body>
    <div class="config">
      <label>API URL <input id="apiUrl" value="wss://agent-engine.api-us.concurrence.com" /></label>
      <label>Token <input id="token" type="password" /></label>
      <label>Workspace <input id="workspace" /></label>
      <label>Service <input id="service" /></label>
      <label>Conversation ID <input id="convId" placeholder="(optional — resume)" /></label>
      <label>Entity ID <input id="entityId" placeholder="(optional)" /></label>
      <button class="connect" onclick="connect()">Connect</button>
      <button class="disconnect" onclick="disconnect()">Disconnect</button>
      <span id="status" class="status disconnected">Disconnected</span>
    </div>
    <div class="chat" id="chat"></div>
    <div class="input-bar">
      <input
        id="msgInput"
        placeholder="Type a message..."
        onkeydown="if(event.key==='Enter')send()"
        disabled
      />
      <button id="sendBtn" onclick="send()" disabled>Send</button>
    </div>
    <script>
      let ws = null
      let conversationId = null

      function connect() {
        const base = document.getElementById('apiUrl').value
        const token = document.getElementById('token').value
        const workspace = document.getElementById('workspace').value
        const service = document.getElementById('service').value
        const convId = document.getElementById('convId').value
        const entityId = document.getElementById('entityId').value
        if (!token || !workspace || !service)
          return alert('Token, workspace, and service are required')

        const url = new URL(base.replace(/^http/, 'ws') + '/agent/text-stream')
        url.searchParams.set('token', token)
        url.searchParams.set('workspace_id', workspace)
        url.searchParams.set('service_id', service)
        url.searchParams.set('tool_events', 'true')
        if (convId) url.searchParams.set('conversation_id', convId)
        if (entityId) url.searchParams.set('entity_id', entityId)

        ws = new WebSocket(url.toString())
        setStatus('connecting')

        ws.onopen = () => setStatus('connected')
        ws.onclose = (e) => {
          setStatus('disconnected')
          addSystem(`Disconnected (${e.code}: ${e.reason || 'clean'})`)
          document.getElementById('msgInput').disabled = true
          document.getElementById('sendBtn').disabled = true
        }
        ws.onerror = () => addSystem('WebSocket error')
        ws.onmessage = (e) => {
          const f = JSON.parse(e.data)
          switch (f.type) {
            case 'session_started':
              conversationId = f.conversation_id
              document.getElementById('convId').value = conversationId
              addSystem(`Session ${f.session_id} | Conversation ${f.conversation_id}`)
              document.getElementById('msgInput').disabled = false
              document.getElementById('sendBtn').disabled = false
              document.getElementById('msgInput').focus()
              break
            case 'typing':
              showTyping()
              break
            case 'tool_call_started':
              hideTyping()
              addToolStart(f.call_id, f.tool_name, f.input)
              break
            case 'tool_call_completed':
              updateTool(f.call_id, f.result, f.succeeded)
              break
            case 'message':
              hideTyping()
              addAgent(f.text)
              break
            case 'error':
              addSystem('Error: ' + f.message)
              break
            case 'session_ended':
              addSystem('Session ended: ' + f.reason)
              document.getElementById('msgInput').disabled = true
              document.getElementById('sendBtn').disabled = true
              break
          }
        }
      }

      function disconnect() {
        if (ws) {
          ws.send(JSON.stringify({ type: 'stop' }))
          ws.close()
        }
      }

      function send() {
        const input = document.getElementById('msgInput')
        const text = input.value.trim()
        if (!text || !ws || ws.readyState !== 1) return
        ws.send(JSON.stringify({ type: 'message', text }))
        addUser(text)
        input.value = ''
      }

      function setStatus(s) {
        const el = document.getElementById('status')
        el.textContent = s.charAt(0).toUpperCase() + s.slice(1)
        el.className = 'status ' + (s === 'connected' ? 'connected' : 'disconnected')
      }

      function addUser(text) {
        const d = document.createElement('div')
        d.className = 'msg user'
        d.textContent = text
        document.getElementById('chat').appendChild(d)
        scrollBottom()
      }

      function addAgent(text) {
        const d = document.createElement('div')
        d.className = 'msg agent'
        d.textContent = text
        document.getElementById('chat').appendChild(d)
        scrollBottom()
      }

      function addSystem(text) {
        const d = document.createElement('div')
        d.className = 'msg system'
        d.textContent = text
        document.getElementById('chat').appendChild(d)
        scrollBottom()
      }

      function addToolStart(callId, name, input) {
        const d = document.createElement('div')
        d.className = 'tool-card'
        d.id = 'tool-' + callId
        d.innerHTML =
          '<span class="name">' +
          name +
          '</span> <span style="color:#6b7280">running...</span>' +
          '<div class="result" style="color:#92400e">' +
          JSON.stringify(input) +
          '</div>'
        document.getElementById('chat').appendChild(d)
        scrollBottom()
      }

      function updateTool(callId, result, succeeded) {
        const d = document.getElementById('tool-' + callId)
        if (!d) return
        d.className = 'tool-card ' + (succeeded ? 'success' : 'failure')
        const label = succeeded ? 'done' : 'failed'
        d.querySelector('span:last-of-type').textContent = label
        d.querySelector('.result').textContent = result.slice(0, 300)
      }

      let typingEl = null
      function showTyping() {
        if (typingEl) return
        typingEl = document.createElement('div')
        typingEl.className = 'typing'
        typingEl.textContent = 'Agent is typing...'
        document.getElementById('chat').appendChild(typingEl)
        scrollBottom()
      }
      function hideTyping() {
        if (typingEl) {
          typingEl.remove()
          typingEl = null
        }
      }

      function scrollBottom() {
        const c = document.getElementById('chat')
        c.scrollTop = c.scrollHeight
      }
    </script>
  </body>
</html>
```

## Error handling

| Close code | Meaning                     | Action                                                  |
| ---------- | --------------------------- | ------------------------------------------------------- |
| `1000`     | Normal close                | Session ended cleanly                                   |
| `4001`     | Missing params or bad token | Check credentials                                       |
| `4003`     | Token workspace mismatch    | Token doesn't match workspace_id                        |
| `4200`     | Engine init failed          | Retry once, then investigate                            |
| `4400`     | Invalid conversation_id     | Must be a valid UUID                                    |
| `4404`     | Conversation not found      | Wrong ID or different workspace                         |
| `4409`     | Conversation already active | Another client owns it — wait or use a new conversation |

## Reconnection

```typescript
ws.onclose = (event) => {
  if (event.code === 1000) return // clean close, don't reconnect

  setTimeout(() => {
    connect({
      conversationId: localStorage.getItem('conversationId'),
      // ... other params
    })
  }, 3000)
}
```

The `retry: 3000` SSE directive equivalent for WebSocket — reconnect after 3 seconds. The conversation is frozen, not lost.
