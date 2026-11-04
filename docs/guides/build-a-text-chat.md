# Build a Text Chat Integration

This guide walks through building a real-time text chat frontend that talks to an Amigo agent. By the end, you will be able to stream agent responses token by token, display tool call activity, and continue a conversation across turns.

## Concepts

**Conversations** are persistent, multi-turn text sessions with an agent. Each user message is a **turn**, and a turn can be answered two ways:

- **Synchronous** (`POST /v1/{workspace_id}/conversations/{id}/turns`) returns the whole response as JSON. Good for server-to-server integrations.
- **Streaming** (`POST /v1/{workspace_id}/conversations/{id}/turns/stream`) returns server-sent events as the agent works. Good for chat UIs. This is what this guide covers; the SDK exposes it as `conversations.streamTurn()`.

Both share the same conversation state, so you can mix them.

**Tool calls** happen when the agent needs to fetch data or perform actions (search appointments, check insurance, look up medications). With `includeToolCalls: true` the stream surfaces them as `tool_call_started` and `tool_call_completed` events so your UI can show what the agent is doing.

## Step 1: Create a conversation

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

## Step 2: Stream a turn

```typescript
for await (const event of client.conversations.streamTurn(
  conversation.id,
  { message: 'What appointments are available?' },
  { includeToolCalls: true },
)) {
  switch (event.event) {
    case 'token':
      appendToAgentBubble(event.text)
      break
    case 'tool_call_started':
      showToolCard(event.call_id, event.tool_name, event.input)
      break
    case 'tool_call_completed':
      updateToolCard(event.call_id, event.result, event.succeeded)
      break
    case 'error':
      showError(event.message)
      break
    case 'done':
      enableInput()
      break
  }
}
```

Pass `signal` in the options to cancel an in-flight turn. For browsers, keep the API key on your server and call `streamTurn` from there, or use a short-lived token.

### Events

| `event`               | Fields                                        | When                                      |
| --------------------- | --------------------------------------------- | ----------------------------------------- |
| `token`               | `text`                                        | A chunk of the agent's reply              |
| `tool_call_started`   | `call_id`, `tool_name`, `input`               | Agent started a tool (`includeToolCalls`) |
| `tool_call_completed` | `call_id`, `tool_name`, `result`, `succeeded` | Tool finished (`includeToolCalls`)        |
| `message`             | `role`, `text`                                | A complete message                        |
| `error`               | `message`, `code`, `retryable`                | The turn failed                           |
| `done`                | `conversation_id`, `status`, `turn_count`     | The turn is finished                      |

The stream also carries `thinking`, `artifact`, `state_transition` and `state` events; see `TurnStreamEvent`.

## Step 3: Display tool calls

When a tool call starts, create a card showing the tool name and input. When it completes, update the card with the result.

```typescript
function showToolCard(callId: string, toolName: string, input: string) {
  const card = document.createElement('div')
  card.id = `tool-${callId}`
  card.className = 'tool-card loading'
  card.innerHTML = `
    <span class="tool-name">${toolName}</span>
    <span class="tool-input">${input}</span>
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

## Step 4: Continue a conversation

A conversation keeps its state between turns. To continue later, call `streamTurn` again with the same conversation id:

```typescript
const conversationId = localStorage.getItem('conversationId')!
for await (const event of client.conversations.streamTurn(conversationId, { message: 'Thanks' })) {
  // ...
}
```

## Step 5: Synchronous turns (alternative)

For server-to-server integrations, use `createTurn` instead of streaming. Tool calls are returned in the response when `include_tool_calls=true`:

```typescript
const response = await client.conversations.createTurn(conversation.id, {
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

Copy this HTML file, fill in your credentials, and open it in a browser. It creates a conversation and streams each turn from `/turns/stream`, with tool call display.

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
      <label>API URL <input id="apiUrl" value="https://platform.api-us.concurrence.com" /></label>
      <label>Token <input id="token" type="password" /></label>
      <label>Workspace <input id="workspace" /></label>
      <label>Service <input id="service" /></label>
      <label>Conversation ID <input id="convId" placeholder="(optional — continue)" /></label>
      <label>Entity ID <input id="entityId" placeholder="(optional)" /></label>
      <button class="connect" onclick="start()">Start</button>
      <button class="disconnect" onclick="stop()">End</button>
      <span id="status" class="status disconnected">Idle</span>
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
      let conversationId = null
      let apiBase = null
      let workspace = null
      let token = null
      let abortController = null

      function headers() {
        return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
      }

      async function start() {
        apiBase = document.getElementById('apiUrl').value
        token = document.getElementById('token').value
        workspace = document.getElementById('workspace').value
        const service = document.getElementById('service').value
        conversationId = document.getElementById('convId').value
        const entityId = document.getElementById('entityId').value
        if (!token || !workspace || !service)
          return alert('Token, workspace, and service are required')

        if (!conversationId) {
          const body = { service_id: service }
          if (entityId) body.entity_id = entityId
          const res = await fetch(`${apiBase}/v1/${workspace}/conversations`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(body),
          })
          if (!res.ok) return addSystem('Create failed: ' + res.status)
          conversationId = (await res.json()).id
          document.getElementById('convId').value = conversationId
        }
        setStatus('ready')
        addSystem('Conversation ' + conversationId)
        document.getElementById('msgInput').disabled = false
        document.getElementById('sendBtn').disabled = false
        document.getElementById('msgInput').focus()
      }

      async function stop() {
        if (abortController) abortController.abort()
        if (conversationId) {
          await fetch(`${apiBase}/v1/${workspace}/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: headers(),
          })
        }
        setStatus('idle')
        addSystem('Conversation ended')
        document.getElementById('msgInput').disabled = true
        document.getElementById('sendBtn').disabled = true
      }

      async function send() {
        const input = document.getElementById('msgInput')
        const text = input.value.trim()
        if (!text || !conversationId) return
        addUser(text)
        input.value = ''
        showTyping()

        abortController = new AbortController()
        const res = await fetch(
          `${apiBase}/v1/${workspace}/conversations/${conversationId}/turns/stream?include_tool_calls=true`,
          {
            method: 'POST',
            headers: { ...headers(), Accept: 'text/event-stream' },
            body: JSON.stringify({ message: text }),
            signal: abortController.signal,
          },
        )
        if (!res.ok) {
          hideTyping()
          return addSystem('Turn failed: ' + res.status)
        }

        // Server-sent events: frames are separated by a blank line, with
        // `event:` and `data:` lines. A browser EventSource cannot POST, so
        // read the response body directly.
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        let agentEl = null
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          let sep
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            let name = ''
            let data = ''
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) name = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (!name || !data) continue
            const f = JSON.parse(data)
            switch (name) {
              case 'token':
                hideTyping()
                if (!agentEl) agentEl = addAgent('')
                agentEl.textContent += f.text
                scrollBottom()
                break
              case 'tool_call_started':
                hideTyping()
                addToolStart(f.call_id, f.tool_name, f.input)
                break
              case 'tool_call_completed':
                updateTool(f.call_id, f.result, f.succeeded)
                break
              case 'error':
                hideTyping()
                addSystem('Error: ' + f.message)
                break
              case 'done':
                hideTyping()
                agentEl = null
                break
            }
          }
        }
      }

      function setStatus(s) {
        const el = document.getElementById('status')
        el.textContent = s.charAt(0).toUpperCase() + s.slice(1)
        el.className = 'status ' + (s === 'ready' ? 'connected' : 'disconnected')
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
        return d
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

A failed turn emits an `error` event with `message`, `code` and `retryable`. If the request itself is rejected, `streamTurn` throws before yielding. A `retryable` error can be retried by sending the turn again; the conversation is not lost.
