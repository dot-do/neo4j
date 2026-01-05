/**
 * InMemoryStorage - In-memory storage for graph database
 *
 * This class provides the same interface as GraphStorage but uses
 * in-memory Map structures instead of SQLite. Useful for testing
 * and URI mode without database dependencies.
 */

import type { IGraphStorage, Node, Relationship } from './types'

/**
 * Represents an index definition
 */
export interface IndexDefinition {
  label: string
  property: string
}

/**
 * Result from a merge operation
 */
export interface MergeResult {
  node: Node
  created: boolean
}

/**
 * InMemoryStorage provides Map-based storage for graph data
 */
export class InMemoryStorage implements IGraphStorage {
  private nodes: Map<number, Node> = new Map()
  private relationships: Map<number, Relationship> = new Map()
  private nextNodeId: number = 1
  private nextRelationshipId: number = 1
  private initialized: boolean = false

  // Index storage: Map<"label:property", Map<propertyValue, Set<nodeId>>>
  private indexes: Map<string, Map<unknown, Set<number>>> = new Map()
  private indexDefinitions: IndexDefinition[] = []

  /**
   * Initialize the storage (no-op for in-memory storage)
   */
  async initialize(): Promise<void> {
    this.initialized = true
  }

  /**
   * Create a new node with the given labels and properties
   * @param labels - Array of labels for the node
   * @param properties - Key-value properties for the node
   * @returns The ID of the created node
   */
  async createNode(labels: string[], properties: Record<string, unknown>): Promise<number> {
    const id = this.nextNodeId++
    const now = new Date().toISOString()

    const node: Node = {
      id,
      labels: [...labels],
      properties: { ...properties },
      createdAt: now,
      updatedAt: now,
    }

    this.nodes.set(id, node)
    return id
  }

  /**
   * Get a node by its ID
   * @param id - The node ID
   * @returns The node if found, null otherwise
   */
  async getNode(id: number): Promise<Node | null> {
    const node = this.nodes.get(id)
    if (!node) {
      return null
    }

    // Return a deep copy to prevent external mutation
    return {
      ...node,
      labels: [...node.labels],
      properties: { ...node.properties },
    }
  }

  /**
   * Update a node's properties
   * @param id - The node ID
   * @param properties - New properties to set
   */
  async updateNode(id: number, properties: Record<string, unknown>): Promise<void> {
    const node = this.nodes.get(id)
    if (!node) {
      throw new Error(`Node with id ${id} not found`)
    }

    node.properties = { ...properties }
    node.updatedAt = new Date().toISOString()
  }

  /**
   * Delete a node by its ID
   * Note: This will cascade delete all relationships connected to this node
   * @param id - The node ID
   */
  async deleteNode(id: number): Promise<void> {
    // Delete all relationships connected to this node (cascade)
    for (const [relId, rel] of this.relationships) {
      if (rel.startNodeId === id || rel.endNodeId === id) {
        this.relationships.delete(relId)
      }
    }

    this.nodes.delete(id)
  }

  /**
   * Create a new relationship between two nodes
   * @param type - The relationship type
   * @param startId - The source node ID
   * @param endId - The target node ID
   * @param properties - Key-value properties for the relationship
   * @returns The ID of the created relationship
   */
  async createRelationship(
    type: string,
    startId: number,
    endId: number,
    properties: Record<string, unknown>
  ): Promise<number> {
    // Verify that both nodes exist
    if (!this.nodes.has(startId)) {
      throw new Error(`Start node with id ${startId} not found`)
    }
    if (!this.nodes.has(endId)) {
      throw new Error(`End node with id ${endId} not found`)
    }

    const id = this.nextRelationshipId++
    const now = new Date().toISOString()

    const relationship: Relationship = {
      id,
      type,
      startNodeId: startId,
      endNodeId: endId,
      properties: { ...properties },
      createdAt: now,
    }

    this.relationships.set(id, relationship)
    return id
  }

  /**
   * Get a relationship by its ID
   * @param id - The relationship ID
   * @returns The relationship if found, null otherwise
   */
  async getRelationship(id: number): Promise<Relationship | null> {
    const relationship = this.relationships.get(id)
    if (!relationship) {
      return null
    }

    // Return a deep copy to prevent external mutation
    return {
      ...relationship,
      properties: { ...relationship.properties },
    }
  }

  /**
   * Delete a relationship by its ID
   * @param id - The relationship ID
   */
  async deleteRelationship(id: number): Promise<void> {
    this.relationships.delete(id)
  }

  /**
   * Find all nodes with a specific label
   * @param label - The label to search for
   * @returns Array of nodes with the label
   */
  async findNodesByLabel(label: string): Promise<Node[]> {
    const result: Node[] = []

    for (const node of this.nodes.values()) {
      if (node.labels.includes(label)) {
        result.push({
          ...node,
          labels: [...node.labels],
          properties: { ...node.properties },
        })
      }
    }

    return result
  }

  /**
   * Find all relationships of a specific type
   * @param type - The relationship type to search for
   * @returns Array of relationships of the type
   */
  async findRelationshipsByType(type: string): Promise<Relationship[]> {
    const result: Relationship[] = []

    for (const rel of this.relationships.values()) {
      if (rel.type === type) {
        result.push({
          ...rel,
          properties: { ...rel.properties },
        })
      }
    }

    return result
  }

  /**
   * Get all nodes in the storage
   * @returns Array of all nodes
   */
  async getAllNodes(): Promise<Node[]> {
    return Array.from(this.nodes.values()).map((node) => ({
      ...node,
      labels: [...node.labels],
      properties: { ...node.properties },
    }))
  }

  /**
   * Get all relationships in the storage
   * @returns Array of all relationships
   */
  async getAllRelationships(): Promise<Relationship[]> {
    return Array.from(this.relationships.values()).map((rel) => ({
      ...rel,
      properties: { ...rel.properties },
    }))
  }

  /**
   * Get all relationships starting from a specific node
   * @param nodeId - The source node ID
   * @returns Array of outgoing relationships
   */
  async getOutgoingRelationships(nodeId: number): Promise<Relationship[]> {
    const result: Relationship[] = []

    for (const rel of this.relationships.values()) {
      if (rel.startNodeId === nodeId) {
        result.push({
          ...rel,
          properties: { ...rel.properties },
        })
      }
    }

    return result
  }

  /**
   * Get all relationships ending at a specific node
   * @param nodeId - The target node ID
   * @returns Array of incoming relationships
   */
  async getIncomingRelationships(nodeId: number): Promise<Relationship[]> {
    const result: Relationship[] = []

    for (const rel of this.relationships.values()) {
      if (rel.endNodeId === nodeId) {
        result.push({
          ...rel,
          properties: { ...rel.properties },
        })
      }
    }

    return result
  }

  /**
   * Update a node's labels
   * @param id - The node ID
   * @param labels - New labels to set
   */
  async updateNodeLabels(id: number, labels: string[]): Promise<void> {
    const node = this.nodes.get(id)
    if (!node) {
      throw new Error(`Node with id ${id} not found`)
    }

    node.labels = [...labels]
    node.updatedAt = new Date().toISOString()
  }

  /**
   * Update a relationship's properties
   * @param id - The relationship ID
   * @param properties - New properties to set
   */
  async updateRelationship(id: number, properties: Record<string, unknown>): Promise<void> {
    const relationship = this.relationships.get(id)
    if (!relationship) {
      throw new Error(`Relationship with id ${id} not found`)
    }

    relationship.properties = { ...properties }
  }

  /**
   * Clear all data from the storage
   * Useful for testing
   */
  clear(): void {
    this.nodes.clear()
    this.relationships.clear()
    this.indexes.clear()
    this.indexDefinitions = []
    this.nextNodeId = 1
    this.nextRelationshipId = 1
  }

  /**
   * Get the current node count
   */
  get nodeCount(): number {
    return this.nodes.size
  }

  /**
   * Get the current relationship count
   */
  get relationshipCount(): number {
    return this.relationships.size
  }

  // =====================
  // Index Support Methods
  // =====================

  /**
   * Create an index on a property for nodes with a specific label
   * @param label - The label to index
   * @param property - The property to index
   */
  async createIndex(label: string, property: string): Promise<void> {
    const indexKey = `${label}:${property}`

    // Check if index already exists
    if (this.indexes.has(indexKey)) {
      return
    }

    // Create the index
    const indexMap = new Map<unknown, Set<number>>()
    this.indexes.set(indexKey, indexMap)
    this.indexDefinitions.push({ label, property })

    // Populate index with existing nodes
    for (const node of this.nodes.values()) {
      if (node.labels.includes(label) && property in node.properties) {
        const value = node.properties[property]
        if (!indexMap.has(value)) {
          indexMap.set(value, new Set())
        }
        indexMap.get(value)!.add(node.id)
      }
    }
  }

  /**
   * Drop an index
   * @param label - The label of the index
   * @param property - The property of the index
   */
  async dropIndex(label: string, property: string): Promise<void> {
    const indexKey = `${label}:${property}`
    this.indexes.delete(indexKey)
    this.indexDefinitions = this.indexDefinitions.filter(
      (def) => !(def.label === label && def.property === property)
    )
  }

  /**
   * Get all current index definitions
   */
  getIndexes(): IndexDefinition[] {
    return [...this.indexDefinitions]
  }

  /**
   * Find nodes by a property value (uses index if available)
   * @param property - The property name
   * @param value - The value to search for
   * @returns Array of matching nodes
   */
  async findNodesByProperty(property: string, value: unknown): Promise<Node[]> {
    const result: Node[] = []

    // Check if there's an index for this property
    for (const [indexKey, indexMap] of this.indexes) {
      if (indexKey.endsWith(`:${property}`)) {
        const nodeIds = indexMap.get(value)
        if (nodeIds) {
          for (const nodeId of nodeIds) {
            const node = this.nodes.get(nodeId)
            if (node) {
              result.push({
                ...node,
                labels: [...node.labels],
                properties: { ...node.properties },
              })
            }
          }
        }
        return result
      }
    }

    // Fall back to linear scan if no index
    for (const node of this.nodes.values()) {
      if (node.properties[property] === value) {
        result.push({
          ...node,
          labels: [...node.labels],
          properties: { ...node.properties },
        })
      }
    }

    return result
  }

  /**
   * Find nodes by label and property value (uses index if available)
   * @param label - The label to filter by
   * @param property - The property name
   * @param value - The value to search for
   * @returns Array of matching nodes
   */
  async findNodesByLabelAndProperty(label: string, property: string, value: unknown): Promise<Node[]> {
    const indexKey = `${label}:${property}`
    const result: Node[] = []

    // Check if there's an exact index for this label:property
    const indexMap = this.indexes.get(indexKey)
    if (indexMap) {
      const nodeIds = indexMap.get(value)
      if (nodeIds) {
        for (const nodeId of nodeIds) {
          const node = this.nodes.get(nodeId)
          if (node) {
            result.push({
              ...node,
              labels: [...node.labels],
              properties: { ...node.properties },
            })
          }
        }
      }
      return result
    }

    // Fall back to linear scan
    for (const node of this.nodes.values()) {
      if (node.labels.includes(label) && node.properties[property] === value) {
        result.push({
          ...node,
          labels: [...node.labels],
          properties: { ...node.properties },
        })
      }
    }

    return result
  }

  // ===========================
  // Advanced Label-Based Methods
  // ===========================

  /**
   * Find nodes that have ALL specified labels
   * @param labels - Array of labels that must all be present
   * @returns Array of matching nodes
   */
  async findNodesByLabels(labels: string[]): Promise<Node[]> {
    const result: Node[] = []

    for (const node of this.nodes.values()) {
      // Check if node has all required labels
      const hasAllLabels = labels.every((label) => node.labels.includes(label))
      if (hasAllLabels) {
        result.push({
          ...node,
          labels: [...node.labels],
          properties: { ...node.properties },
        })
      }
    }

    return result
  }

  /**
   * Check if a node has a specific label
   * @param id - The node ID
   * @param label - The label to check for
   * @returns True if the node has the label
   */
  async hasLabel(id: number, label: string): Promise<boolean> {
    const node = this.nodes.get(id)
    if (!node) {
      return false
    }
    return node.labels.includes(label)
  }

  /**
   * Add a label to a node
   * @param id - The node ID
   * @param label - The label to add
   */
  async addLabel(id: number, label: string): Promise<void> {
    const node = this.nodes.get(id)
    if (!node) {
      throw new Error(`Node with id ${id} not found`)
    }

    if (!node.labels.includes(label)) {
      node.labels.push(label)
      node.updatedAt = new Date().toISOString()

      // Update any indexes that might apply
      this.updateIndexesForNode(node)
    }
  }

  /**
   * Remove a label from a node
   * @param id - The node ID
   * @param label - The label to remove
   */
  async removeLabel(id: number, label: string): Promise<void> {
    const node = this.nodes.get(id)
    if (!node) {
      throw new Error(`Node with id ${id} not found`)
    }

    const index = node.labels.indexOf(label)
    if (index !== -1) {
      // Remove from indexes first
      this.removeNodeFromIndexes(node, label)

      node.labels.splice(index, 1)
      node.updatedAt = new Date().toISOString()
    }
  }

  /**
   * Get all unique labels in the graph
   * @returns Array of unique labels
   */
  async getAllLabels(): Promise<string[]> {
    const labelSet = new Set<string>()

    for (const node of this.nodes.values()) {
      for (const label of node.labels) {
        labelSet.add(label)
      }
    }

    return Array.from(labelSet)
  }

  /**
   * Get the count of nodes with a specific label
   * @param label - The label to count
   * @returns Number of nodes with the label
   */
  async getNodeCountByLabel(label: string): Promise<number> {
    let count = 0
    for (const node of this.nodes.values()) {
      if (node.labels.includes(label)) {
        count++
      }
    }
    return count
  }

  // ===========================
  // Relationship Type Methods
  // ===========================

  /**
   * Get all unique relationship types in the graph
   * @returns Array of unique relationship types
   */
  async getAllRelationshipTypes(): Promise<string[]> {
    const typeSet = new Set<string>()

    for (const rel of this.relationships.values()) {
      typeSet.add(rel.type)
    }

    return Array.from(typeSet)
  }

  /**
   * Get the count of relationships of a specific type
   * @param type - The relationship type to count
   * @returns Number of relationships of the type
   */
  async getRelationshipCountByType(type: string): Promise<number> {
    let count = 0
    for (const rel of this.relationships.values()) {
      if (rel.type === type) {
        count++
      }
    }
    return count
  }

  /**
   * Get all relationships between two specific nodes
   * @param startId - The source node ID
   * @param endId - The target node ID
   * @returns Array of relationships from startId to endId
   */
  async getRelationshipsBetween(startId: number, endId: number): Promise<Relationship[]> {
    const result: Relationship[] = []

    for (const rel of this.relationships.values()) {
      if (rel.startNodeId === startId && rel.endNodeId === endId) {
        result.push({
          ...rel,
          properties: { ...rel.properties },
        })
      }
    }

    return result
  }

  // ===========================
  // Merge Operations
  // ===========================

  /**
   * Merge a node - create if not exists, return existing if it does
   * @param labels - Labels for the node
   * @param matchProperties - Properties to use for matching
   * @param createProperties - Additional properties to set on creation
   * @param updateProperties - Properties to update if node exists
   * @returns The node and whether it was created
   */
  async mergeNode(
    labels: string[],
    matchProperties: Record<string, unknown>,
    createProperties: Record<string, unknown> = {},
    updateProperties?: Record<string, unknown>
  ): Promise<MergeResult> {
    // Find existing node by labels and match properties
    for (const node of this.nodes.values()) {
      const hasAllLabels = labels.every((label) => node.labels.includes(label))
      if (!hasAllLabels) continue

      const matchesAllProps = Object.entries(matchProperties).every(
        ([key, value]) => node.properties[key] === value
      )

      if (matchesAllProps) {
        // Node found - optionally update properties
        if (updateProperties && Object.keys(updateProperties).length > 0) {
          node.properties = { ...node.properties, ...updateProperties }
          node.updatedAt = new Date().toISOString()
        }

        return {
          node: {
            ...node,
            labels: [...node.labels],
            properties: { ...node.properties },
          },
          created: false,
        }
      }
    }

    // Node not found - create it
    const id = await this.createNode(labels, { ...matchProperties, ...createProperties })
    const node = await this.getNode(id)

    return {
      node: node!,
      created: true,
    }
  }

  // ===========================
  // Private Helper Methods
  // ===========================

  /**
   * Update indexes when a node's labels or properties change
   */
  private updateIndexesForNode(node: Node): void {
    for (const def of this.indexDefinitions) {
      const indexKey = `${def.label}:${def.property}`
      const indexMap = this.indexes.get(indexKey)

      if (indexMap && node.labels.includes(def.label) && def.property in node.properties) {
        const value = node.properties[def.property]
        if (!indexMap.has(value)) {
          indexMap.set(value, new Set())
        }
        indexMap.get(value)!.add(node.id)
      }
    }
  }

  /**
   * Remove a node from indexes when a label is removed
   */
  private removeNodeFromIndexes(node: Node, label: string): void {
    for (const def of this.indexDefinitions) {
      if (def.label === label) {
        const indexKey = `${def.label}:${def.property}`
        const indexMap = this.indexes.get(indexKey)

        if (indexMap && def.property in node.properties) {
          const value = node.properties[def.property]
          const nodeIds = indexMap.get(value)
          if (nodeIds) {
            nodeIds.delete(node.id)
            if (nodeIds.size === 0) {
              indexMap.delete(value)
            }
          }
        }
      }
    }
  }
}
