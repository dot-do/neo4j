# neo4j.do

A Neo4j-compatible graph database running on Cloudflare Workers with D1 (SQLite) storage.

[![CI](https://github.com/drivly/neo4j.do/actions/workflows/ci.yml/badge.svg)](https://github.com/drivly/neo4j.do/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/neo4j.do.svg)](https://www.npmjs.com/package/neo4j.do)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Neo4j-compatible Cypher query language** - Parse and execute Cypher queries
- **Graph-to-SQL translation** - Translates Cypher to optimized SQL for D1/SQLite
- **Neo4j driver API compatibility** - Drop-in replacement for the official Neo4j JavaScript driver
- **Edge-native** - Runs on Cloudflare Workers with global distribution
- **Type-safe** - Full TypeScript support with Neo4j-compatible types

## Installation

```bash
npm install neo4j.do
```

## Quick Start

### Using the Driver API (Neo4j-compatible)

```typescript
import neo4j from 'neo4j.do'

// Connect to your neo4j.do instance
const driver = neo4j.driver('neo4j://your-worker.workers.dev')
const session = driver.session()

try {
  // Create nodes
  await session.run(
    'CREATE (p:Person {name: $name, age: $age}) RETURN p',
    { name: 'Alice', age: 30 }
  )

  // Query with relationships
  const result = await session.run(`
    MATCH (a:Person)-[:KNOWS]->(b:Person)
    WHERE a.name = $name
    RETURN b.name AS friend, b.age AS age
  `, { name: 'Alice' })

  for (const record of result.records) {
    console.log(`${record.get('friend')} is ${record.get('age')} years old`)
  }
} finally {
  await session.close()
  await driver.close()
}
```

### Using the HTTP Client

```typescript
import { Neo4jHttpClient } from 'neo4j.do/client'

const client = new Neo4jHttpClient({
  url: 'https://your-worker.workers.dev',
  database: 'neo4j'
})

const result = await client.query(
  'MATCH (n:Person) RETURN n.name AS name LIMIT 10'
)

console.log(result.records)
```

## Supported Cypher Features

### Clauses

- `MATCH` - Pattern matching with node and relationship patterns
- `OPTIONAL MATCH` - Left outer join semantics
- `WHERE` - Filtering with expressions
- `RETURN` - Result projection with aliases
- `CREATE` - Node and relationship creation
- `MERGE` - Upsert with ON CREATE/ON MATCH
- `DELETE` / `DETACH DELETE` - Node and relationship deletion
- `SET` - Property updates
- `REMOVE` - Property and label removal
- `UNWIND` - List expansion
- `WITH` - Query chaining and aggregation
- `CALL` - Procedure calls with YIELD
- `UNION` / `UNION ALL` - Query combination

### Patterns

```cypher
// Node patterns
(n)                    // Any node
(n:Person)             // Labeled node
(n:Person:Employee)    // Multiple labels
(n {name: 'Alice'})    // With properties

// Relationship patterns
(a)-[:KNOWS]->(b)      // Directed relationship
(a)<-[:KNOWS]-(b)      // Reverse direction
(a)-[:KNOWS|LIKES]->(b) // Multiple types
(a)-[r:KNOWS]->(b)     // With variable
```

### Expressions

- Comparison: `=`, `<>`, `<`, `>`, `<=`, `>=`
- Logical: `AND`, `OR`, `NOT`, `XOR`
- Null checks: `IS NULL`, `IS NOT NULL`
- List operations: `IN`, list literals `[1, 2, 3]`
- Property access: `n.name`, `n['name']`
- Functions: `count()`, `sum()`, `avg()`, `min()`, `max()`, `collect()`

## Neo4j Types

neo4j.do provides Neo4j-compatible types for working with graph data:

```typescript
import { Integer, Date, Time, DateTime, Point } from 'neo4j.do/types'

// Integer for large numbers (Neo4j stores all integers as 64-bit)
const bigNum = Integer.fromNumber(9007199254740993n)

// Temporal types
const date = new Date(2024, 1, 15)
const time = new Time(14, 30, 0, 0)
const dateTime = new DateTime(2024, 1, 15, 14, 30, 0, 0)

// Spatial types
const point2d = new Point(4326, -122.4194, 37.7749) // WGS84
const point3d = new Point(4979, -122.4194, 37.7749, 10) // WGS84-3D
```

## Deployment

### Cloudflare Workers

1. Create a D1 database:
```bash
wrangler d1 create neo4j-do
```

2. Update `wrangler.jsonc` with your database ID

3. Deploy:
```bash
npm run deploy
```

### Configuration

```jsonc
// wrangler.jsonc
{
  "name": "neo4j-do",
  "main": "src/index.ts",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "neo4j-do",
      "database_id": "your-database-id"
    }
  ]
}
```

## Architecture

neo4j.do translates Cypher queries to SQL and executes them against D1 (SQLite):

```
Cypher Query → Lexer → Parser → AST → SQL Generator → D1/SQLite
```

### Storage Schema

```sql
-- Nodes table
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  labels TEXT NOT NULL,  -- JSON array
  properties TEXT NOT NULL  -- JSON object
);

-- Relationships table
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  start_node_id TEXT NOT NULL,
  end_node_id TEXT NOT NULL,
  properties TEXT NOT NULL,
  FOREIGN KEY (start_node_id) REFERENCES nodes(id),
  FOREIGN KEY (end_node_id) REFERENCES nodes(id)
);
```

## API Reference

### Driver

```typescript
import neo4j from 'neo4j.do'

const driver = neo4j.driver(uri, auth?, config?)
const session = driver.session({ database: 'neo4j' })
const result = await session.run(query, parameters?)
await session.close()
await driver.close()
```

### Result

```typescript
const result = await session.run('MATCH (n) RETURN n')

// Access records
for (const record of result.records) {
  const node = record.get('n')
  console.log(node.properties)
}

// Streaming
for await (const record of result) {
  console.log(record.toObject())
}

// Summary
const summary = await result.summary()
console.log(summary.counters)
```

### Record

```typescript
record.get('key')        // Get by key
record.get(0)            // Get by index
record.has('key')        // Check key exists
record.keys              // Column names
record.values()          // All values
record.entries()         // Key-value pairs
record.toObject()        // Plain object
record.forEach(callback) // Iterate fields
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Format
npm run format

# Type check
npm run typecheck

# Build
npm run build
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Documentation](https://neo4j.do)
- [GitHub](https://github.com/drivly/neo4j.do)
- [npm](https://www.npmjs.com/package/neo4j.do)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
