import { createClient } from '../shared.js'

const client = createClient()

const dashboard = await client.analytics.getDashboard({ days: 7 })
const calls = await client.analytics.getCalls({ days: 30 })

console.log('Dashboard summary:')
console.log(JSON.stringify(dashboard, null, 2))

console.log('Call analytics:')
console.log(JSON.stringify(calls, null, 2))
