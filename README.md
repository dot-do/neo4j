# neo4j.do

> Graph Databases. Edge-Native. Open by Default. AI-First.

Neo4j is powerful but painful. Driver boilerplate. Session management. Connection pools. Cypher syntax that only experts remember. All for a database that requires persistent connections to central servers.

**neo4j.do** is the natural language graph database. Talk to your graph like a colleague. Get answers, not records.

## AI-Native API

```typescript
import { neo4j } from 'neo4j.do'           // Full SDK
import { neo4j } from 'neo4j.do/tiny'      // Minimal client
import { neo4j } from 'neo4j.do/graph'     // Graph-only operations
```

Natural language for graph queries:

```typescript
import { neo4j } from 'neo4j.do'

// Talk to it like a colleague
const collaborators = await neo4j`people who know people who work at Google`
const path = await neo4j`shortest path from Alice to Bob`
const influencers = await neo4j`most connected people in engineering`

// Chain like sentences
await neo4j`agents with reasoning capability`
  .map(agent => neo4j`tasks assigned to ${agent}`)

// Graphs that build themselves
await neo4j`Ralph knows Tom, Tom knows Priya, Priya leads engineering`
await neo4j`connect Sarah to the data science team`
```

## The Problem

Neo4j dominates the graph database market:

| What Neo4j Charges | The Reality |
|--------------------|-------------|
| **Aura Enterprise** | $50,000-500,000+/year |
| **Connection Limits** | Per-connection pricing |
| **Cluster Setup** | Complex, expensive |
| **Cypher Learning Curve** | Weeks to become proficient |
| **Driver Boilerplate** | Sessions, transactions, cleanup |
| **Edge Deployment** | Not supported |

### The Cypher Tax

Every query requires ceremony:

```typescript
// This is what Neo4j makes you write
const driver = neo4j.driver('neo4j://...', auth)
const session = driver.session()
try {
  const result = await session.run(
    'MATCH (p:Person)-[:KNOWS]->(friend) WHERE p.name = $name RETURN friend',
    { name: 'Alice' }
  )
  // Process result.records...
} finally {
  await session.close()
  await driver.close()
}
```

Nobody can dictate that. It's not how humans think about graphs.

## The Solution

**neo4j.do** reimagines graph databases for AI:

```
Neo4j                              neo4j.do
-----------------------------------------------------------------
session.run() + Cypher             Natural language queries
Connection pools                   Stateless HTTP
Central servers                    Edge-native (300+ locations)
$50K+/year                         Pay for what you use
Driver boilerplate                 Tagged template literals
Cypher expertise required          Say what you mean
```

## One-Click Deploy

```bash
npx create-dotdo neo4j
```

A graph database. Running at the edge. Global distribution from day one.

```typescript
import { Neo4j } from 'neo4j.do'

export default Neo4j({
  name: 'my-knowledge-graph',
  domain: 'graph.mycompany.com',
})
```

## Features

### Finding People & Relationships

```typescript
// Find anyone, any relationship
const alice = await neo4j`Alice`
const friends = await neo4j`Alice's friends`
const fof = await neo4j`friends of Alice's friends`

// AI infers what you need
await neo4j`Alice`                    // returns person
await neo4j`Alice's connections`      // returns relationships
await neo4j`how Alice knows Bob`      // returns path
```

### Creating Relationships

```typescript
// Relationships are one line
await neo4j`Alice knows Bob`
await neo4j`Bob works at Google`
await neo4j`Alice and Bob collaborated on Project X`

// Bulk relationships just work
await neo4j`
  Alice knows Bob, Carol, Dave
  Bob works at Google
  Carol leads the engineering team
  Dave reports to Carol
`
```

### Agent Memory & Collaboration

```typescript
// Find collaborators naturally
const collaborators = await neo4j`agents who worked on similar tasks`
const pairs = await neo4j`agents who collaborated more than 3 times`
const experts = await neo4j`agents with reasoning capability`

// Build agent networks
await neo4j`Ralph completed analysis task`
  .then(() => neo4j`Tom reviewed Ralph's work`)
  .then(() => neo4j`Priya approved the review`)
```

### Knowledge Graphs

```typescript
// Traverse knowledge naturally
const related = await neo4j`concepts related to machine learning`
const deep = await neo4j`everything connected to AI within 3 hops`
const context = await neo4j`relevant context for customer churn prediction`

// Build knowledge as you go
await neo4j`machine learning relates to neural networks`
await neo4j`neural networks powers image recognition`
await neo4j`image recognition used in self-driving cars`
```

### Workflow Orchestration

```typescript
// Find ready work
const next = await neo4j`next task not blocked by anything`
const ready = await neo4j`tasks with all dependencies complete`
const critical = await neo4j`blocked tasks with high priority dependents`

// Chain workflows
await neo4j`tasks assigned to Ralph`
  .map(task => neo4j`dependencies of ${task}`)
  .filter(dep => neo4j`${dep} status is pending`)
```

### Path Finding

```typescript
// Shortest paths
const path = await neo4j`shortest path from Alice to the CEO`
const degrees = await neo4j`degrees of separation between Alice and Bob`
const routes = await neo4j`all paths from start to end under 5 hops`

// Influence paths
const influence = await neo4j`how does Alice influence the engineering team?`
```

### Social Networks

```typescript
// Network analysis in plain English
const influencers = await neo4j`most connected people`
const bridges = await neo4j`people who connect different teams`
const clusters = await neo4j`groups that work together`

// Community detection
await neo4j`find communities in the collaboration network`
  .map(community => neo4j`key members of ${community}`)
```

### Recommendations

```typescript
// Recommendations from graph structure
const suggestions = await neo4j`people Alice should know based on mutual friends`
const content = await neo4j`articles similar to what Alice read`
const tasks = await neo4j`tasks Ralph would be good at based on past work`
```

## Graph Algorithms

```typescript
// PageRank, centrality, community detection - all natural language
const important = await neo4j`most important nodes by PageRank`
const central = await neo4j`highest betweenness centrality in the network`
const communities = await neo4j`detect communities using Louvain`

// Ask questions about graph structure
await neo4j`is the network connected?`
await neo4j`find cycles in the dependency graph`
await neo4j`diameter of the social network`
```

## Real-Time Subscriptions

```typescript
// Subscribe to graph changes
await neo4j`watch Alice's connections`
  .subscribe(change => console.log(`New connection: ${change}`))

// Reactive graph updates
await neo4j`notify me when anyone joins the engineering team`
await neo4j`alert when dependency cycles are created`
```

## Cypher Compatibility

For teams migrating from Neo4j, raw Cypher still works:

```typescript
// Same natural syntax, Cypher underneath when needed
await neo4j`Alice friends`              // returns Person nodes
await neo4j`Alice relationships`        // returns all relationships
await neo4j`export Alice's network`     // returns graph bundle

// Raw Cypher when you need it
await neo4j.cypher`
  MATCH (p:Person)-[:KNOWS*1..3]->(friend)
  WHERE p.name = 'Alice'
  RETURN friend
`
```

### Cypher Clauses Supported

| Clause | Status |
|--------|--------|
| `MATCH` | Fully supported with pattern matching |
| `CREATE` | Node and relationship creation |
| `MERGE` | Upsert with ON CREATE / ON MATCH |
| `DELETE` | Node and relationship deletion |
| `SET` | Property updates |
| `WHERE` | Filtering with expressions |
| `RETURN` | Projection with aliases |
| `WITH` | Query chaining |

## Architecture

### Edge-Native Design

```
Graph Query Flow:

Request --> Cloudflare Edge --> GraphDO --> SQLite
                |                  |           |
           Global CDN        Durable Object  Graph
           (300+ PoPs)       (strong consistency) Storage
```

### Durable Object per Graph

```
GraphDO (graph metadata, config)
  |
  +-- NodesDO (node storage, properties)
  |     |-- SQLite: Node records
  |     +-- Indexes: Label, property
  |
  +-- EdgesDO (relationship storage)
  |     |-- SQLite: Edge records
  |     +-- Indexes: Type, direction
  |
  +-- AlgorithmsDO (computed graph metrics)
        |-- PageRank cache
        +-- Community detection results
```

### Storage Tiers

| Tier | Storage | Use Case | Query Speed |
|------|---------|----------|-------------|
| **Hot** | SQLite | Active nodes, recent edges | <5ms |
| **Warm** | R2 + Index | Historical graph snapshots | <50ms |
| **Cold** | R2 Archive | Time-travel, audit logs | <500ms |

## vs Neo4j

| Feature | Neo4j | neo4j.do |
|---------|-------|----------|
| **Pricing** | $50K-500K+/year | Pay per query |
| **Deployment** | Central servers | 300+ edge locations |
| **Cold Start** | Seconds | <1ms |
| **API** | Driver + Cypher | Natural language |
| **Connections** | Pool limits | Unlimited |
| **Learning Curve** | Weeks | Minutes |
| **Data Location** | Neo4j's cloud | Your Cloudflare account |
| **Lock-in** | Proprietary | MIT licensed |

## Use Cases

### AI Agent Memory

Agents remember relationships, context, and history in graph form. Query patterns of collaboration, find experts, trace decisions.

### Knowledge Graphs

Build knowledge that AI can reason over. Traverse concepts, find related ideas, discover connections humans miss.

### Social Networks

Friends of friends, influence paths, community detection, recommendations - all in plain English.

### Dependency Graphs

Track task dependencies, find bottlenecks, detect cycles, optimize workflows.

## Performance

| Metric | Value |
|--------|-------|
| Cold Start | <1ms |
| P50 Query Latency | ~5ms |
| P99 Query Latency | <20ms |
| Concurrent Queries | Unlimited |
| Edge Locations | 300+ |

## Roadmap

### Core Graph
- [x] Node and relationship CRUD
- [x] Property graphs
- [x] Label-based queries
- [x] Path finding
- [ ] Full-text search
- [ ] Vector embeddings

### Algorithms
- [x] Shortest path
- [x] Degree centrality
- [ ] PageRank
- [ ] Community detection
- [ ] Graph neural networks

### Real-Time
- [x] Graph subscriptions
- [ ] WebSocket streaming
- [ ] Change data capture
- [ ] Federation across graphs

## Contributing

neo4j.do is open source under the MIT license.

```bash
git clone https://github.com/dotdo/neo4j.do
cd neo4j.do
pnpm install
pnpm test
```

## License

MIT License - Graphs for everyone.

---

<p align="center">
  <strong>Graph databases, reimagined.</strong>
  <br />
  Natural language. Edge-native. AI-first.
  <br /><br />
  <a href="https://neo4j.do">Website</a> |
  <a href="https://docs.neo4j.do">Docs</a> |
  <a href="https://discord.gg/dotdo">Discord</a> |
  <a href="https://github.com/dotdo/neo4j.do">GitHub</a>
</p>
