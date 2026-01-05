# neo4j.do

**The graph database reimagined for AI agents at the edge.**

[![CI](https://github.com/dot-do/neo4j/actions/workflows/ci.yml/badge.svg)](https://github.com/dot-do/neo4j/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/neo4j.do)](https://www.npmjs.com/package/neo4j.do)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

neo4j.do is an AI-native graph database built from the ground up to run on Cloudflare Workers. It brings Neo4j-compatible Cypher queries to the edge, enabling millions of AI agents to query interconnected data simultaneously with zero cold starts and global distribution.

## Why neo4j.do?

Traditional graph databases weren't built for the AI era. They require persistent connections, central servers, and can't scale to handle millions of concurrent agent queries.

**neo4j.do changes that:**

- **Edge-Native** — Runs on Cloudflare's global network. Sub-millisecond latency from anywhere.
- **AI-First** — Designed for AI agents to query, traverse, and reason over graphs.
- **Infinitely Scalable** — Durable Objects provide automatic sharding. No connection limits.
- **Zero Cold Starts** — Always warm, always ready. Critical for real-time AI workflows.
- **Neo4j Compatible** — Full Cypher query language. Drop-in driver replacement.

## Installation

```bash
npm install neo4j.do
```

## Quick Start

### Using the Neo4j-Compatible Driver

```typescript
import neo4j from 'neo4j.do'

const driver = neo4j.driver('neo4j://your-worker.workers.dev')
const session = driver.session()

// Create a knowledge graph for your AI agents
await session.run(`
  CREATE (agent:Agent {id: $agentId, capabilities: $capabilities})
  CREATE (task:Task {id: $taskId, description: $description})
  CREATE (agent)-[:ASSIGNED_TO]->(task)
`, {
  agentId: 'agent-001',
  capabilities: ['reasoning', 'code-generation'],
  taskId: 'task-42',
  description: 'Analyze customer feedback patterns'
})

// Query the graph
const result = await session.run(`
  MATCH (a:Agent)-[:ASSIGNED_TO]->(t:Task)
  WHERE 'reasoning' IN a.capabilities
  RETURN a.id AS agent, t.description AS task
`)

for (const record of result.records) {
  console.log(`${record.get('agent')} → ${record.get('task')}`)
}

await session.close()
await driver.close()
```

### Using the HTTP Client

```typescript
import { Neo4jHttpClient } from 'neo4j.do/client'

const client = new Neo4jHttpClient({
  url: 'https://your-worker.workers.dev'
})

const result = await client.query(`
  MATCH (n:Agent)-[r:KNOWS]->(m:Agent)
  RETURN n, r, m LIMIT 100
`)
```

## Use Cases

### Agent Memory & Relationships
Store and query complex relationships between agents, their knowledge, and interactions.

```cypher
// Find all agents that have collaborated on similar tasks
MATCH (a1:Agent)-[:COMPLETED]->(t1:Task)-[:SIMILAR_TO]->(t2:Task)<-[:COMPLETED]-(a2:Agent)
WHERE a1 <> a2
RETURN a1.id, a2.id, count(*) AS collaborations
ORDER BY collaborations DESC
```

### Knowledge Graphs
Build and traverse knowledge graphs that AI agents can reason over.

```cypher
// Traverse a knowledge graph to find relevant context
MATCH path = (concept:Concept {name: 'machine-learning'})-[:RELATED_TO*1..3]->(related)
RETURN path, length(path) AS depth
ORDER BY depth
```

### Workflow Orchestration
Model complex multi-agent workflows as graphs.

```cypher
// Find next available task in a workflow
MATCH (current:Task {status: 'completed'})-[:NEXT]->(next:Task {status: 'pending'})
WHERE NOT (next)<-[:BLOCKED_BY]-(:Task {status: 'in_progress'})
RETURN next
LIMIT 1
```

## Cypher Support

neo4j.do implements a comprehensive subset of the Cypher query language:

| Clause | Status |
|--------|--------|
| `MATCH` | ✓ Pattern matching with nodes and relationships |
| `OPTIONAL MATCH` | ✓ Left outer join semantics |
| `CREATE` | ✓ Node and relationship creation |
| `MERGE` | ✓ Upsert with `ON CREATE` / `ON MATCH` |
| `DELETE` | ✓ Node and relationship deletion |
| `SET` | ✓ Property updates |
| `REMOVE` | ✓ Property and label removal |
| `WHERE` | ✓ Filtering with expressions |
| `RETURN` | ✓ Projection with aliases |
| `WITH` | ✓ Query chaining and aggregation |
| `UNWIND` | ✓ List expansion |
| `UNION` | ✓ Query combination |
| `CALL` | ✓ Procedure calls |

### Expressions & Functions

```cypher
// Aggregations
RETURN count(*), sum(n.value), avg(n.score), collect(n.name)

// Comparisons
WHERE n.age > 18 AND n.status IN ['active', 'pending']

// Pattern expressions
WHERE (n)-[:KNOWS]->(:Person {name: 'Alice'})
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers Edge                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Worker     │  │   Worker     │  │   Worker     │   ...    │
│  │  (Tokyo)     │  │  (London)    │  │  (NYC)       │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Durable Objects (Auto-Sharded)               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │ GraphDO     │  │ GraphDO     │  │ GraphDO     │  ...  │  │
│  │  │ (SQLite)    │  │ (SQLite)    │  │ (SQLite)    │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

- **Workers**: Handle HTTP requests globally with <1ms cold start
- **Durable Objects**: Provide strong consistency and SQLite storage
- **Cypher Engine**: Parses Cypher and generates optimized SQL

## Deployment

### 1. Create a Durable Object namespace

```bash
wrangler d1 create neo4j-do
```

### 2. Configure `wrangler.jsonc`

```jsonc
{
  "name": "my-graph-api",
  "main": "src/index.ts",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      { "name": "GRAPH", "class_name": "GraphDO" }
    ]
  }
}
```

### 3. Deploy

```bash
npm run deploy
```

## Performance

| Metric | Value |
|--------|-------|
| Cold Start | <1ms |
| P50 Query Latency | ~5ms |
| Max Concurrent Connections | Unlimited* |
| Geographic Distribution | 300+ edge locations |

*Cloudflare Workers have no connection limits. Each request is independent.

## Roadmap

- [ ] Full-text search with vector embeddings
- [ ] Graph algorithms (PageRank, shortest path, community detection)
- [ ] Real-time subscriptions via WebSockets
- [ ] Multi-graph federation
- [ ] Time-travel queries (point-in-time recovery)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://neo4j.do">neo4j.do</a> ·
  <a href="https://github.com/dot-do/neo4j">GitHub</a> ·
  <a href="https://www.npmjs.com/package/neo4j.do">npm</a>
</p>
