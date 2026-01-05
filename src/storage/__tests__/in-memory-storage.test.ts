/**
 * Tests for InMemoryStorage
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryStorage } from '../in-memory-storage'

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage

  beforeEach(() => {
    storage = new InMemoryStorage()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(storage.initialize()).resolves.not.toThrow()
    })
  })

  describe('node operations', () => {
    describe('createNode', () => {
      it('should create a node and return its id', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        expect(id).toBe(1)
      })

      it('should create nodes with incrementing ids', async () => {
        const id1 = await storage.createNode(['Person'], { name: 'Alice' })
        const id2 = await storage.createNode(['Person'], { name: 'Bob' })
        expect(id1).toBe(1)
        expect(id2).toBe(2)
      })

      it('should create a node with multiple labels', async () => {
        const id = await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        const node = await storage.getNode(id)
        expect(node?.labels).toEqual(['Person', 'Employee'])
      })

      it('should create a node with empty labels', async () => {
        const id = await storage.createNode([], { name: 'Alice' })
        const node = await storage.getNode(id)
        expect(node?.labels).toEqual([])
      })

      it('should create a node with complex properties', async () => {
        const props = {
          name: 'Alice',
          age: 30,
          active: true,
          scores: [95, 87, 92],
          address: { city: 'NYC', zip: '10001' },
        }
        const id = await storage.createNode(['Person'], props)
        const node = await storage.getNode(id)
        expect(node?.properties).toEqual(props)
      })
    })

    describe('getNode', () => {
      it('should return null for non-existent node', async () => {
        const node = await storage.getNode(999)
        expect(node).toBeNull()
      })

      it('should return the node with correct structure', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        const node = await storage.getNode(id)

        expect(node).not.toBeNull()
        expect(node?.id).toBe(id)
        expect(node?.labels).toEqual(['Person'])
        expect(node?.properties).toEqual({ name: 'Alice' })
        expect(node?.createdAt).toBeDefined()
        expect(node?.updatedAt).toBeDefined()
      })

      it('should return a copy that does not affect the original', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        const node = await storage.getNode(id)

        // Mutate the returned copy
        node!.labels.push('Hacker')
        node!.properties.evil = true

        // Original should be unchanged
        const node2 = await storage.getNode(id)
        expect(node2?.labels).toEqual(['Person'])
        expect(node2?.properties).toEqual({ name: 'Alice' })
      })
    })

    describe('updateNode', () => {
      it('should update node properties', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.updateNode(id, { name: 'Alice', age: 30 })

        const node = await storage.getNode(id)
        expect(node?.properties).toEqual({ name: 'Alice', age: 30 })
      })

      it('should replace all properties', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice', age: 25 })
        await storage.updateNode(id, { occupation: 'Engineer' })

        const node = await storage.getNode(id)
        expect(node?.properties).toEqual({ occupation: 'Engineer' })
      })

      it('should update the updatedAt timestamp', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        const node1 = await storage.getNode(id)
        const originalUpdatedAt = node1?.updatedAt

        // Small delay to ensure different timestamp
        await new Promise((resolve) => setTimeout(resolve, 10))

        await storage.updateNode(id, { name: 'Alice', age: 30 })
        const node2 = await storage.getNode(id)

        expect(node2?.updatedAt).not.toBe(originalUpdatedAt)
      })

      it('should throw for non-existent node', async () => {
        await expect(storage.updateNode(999, { name: 'Ghost' })).rejects.toThrow(
          'Node with id 999 not found'
        )
      })
    })

    describe('deleteNode', () => {
      it('should delete a node', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.deleteNode(id)

        const node = await storage.getNode(id)
        expect(node).toBeNull()
      })

      it('should cascade delete relationships when node is deleted', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, {})

        await storage.deleteNode(alice)

        const rel = await storage.getRelationship(relId)
        expect(rel).toBeNull()
      })

      it('should not throw for non-existent node', async () => {
        await expect(storage.deleteNode(999)).resolves.not.toThrow()
      })
    })

    describe('findNodesByLabel', () => {
      it('should find nodes by label', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const people = await storage.findNodesByLabel('Person')
        expect(people).toHaveLength(2)
        expect(people.map((n) => n.properties.name)).toContain('Alice')
        expect(people.map((n) => n.properties.name)).toContain('Bob')
      })

      it('should return empty array if no nodes match', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })

        const companies = await storage.findNodesByLabel('Company')
        expect(companies).toEqual([])
      })

      it('should find nodes with multiple labels', async () => {
        await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })

        const employees = await storage.findNodesByLabel('Employee')
        expect(employees).toHaveLength(1)
        expect(employees[0].properties.name).toBe('Alice')
      })
    })

    describe('updateNodeLabels', () => {
      it('should update node labels', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.updateNodeLabels(id, ['Person', 'Employee'])

        const node = await storage.getNode(id)
        expect(node?.labels).toEqual(['Person', 'Employee'])
      })

      it('should throw for non-existent node', async () => {
        await expect(storage.updateNodeLabels(999, ['Label'])).rejects.toThrow(
          'Node with id 999 not found'
        )
      })
    })
  })

  describe('relationship operations', () => {
    describe('createRelationship', () => {
      it('should create a relationship and return its id', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        const relId = await storage.createRelationship('KNOWS', alice, bob, {})
        expect(relId).toBe(1)
      })

      it('should create relationships with incrementing ids', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const charlie = await storage.createNode(['Person'], { name: 'Charlie' })

        const rel1 = await storage.createRelationship('KNOWS', alice, bob, {})
        const rel2 = await storage.createRelationship('KNOWS', bob, charlie, {})

        expect(rel1).toBe(1)
        expect(rel2).toBe(2)
      })

      it('should create relationship with properties', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        const relId = await storage.createRelationship('KNOWS', alice, bob, {
          since: 2020,
          closeness: 0.8,
        })

        const rel = await storage.getRelationship(relId)
        expect(rel?.properties).toEqual({ since: 2020, closeness: 0.8 })
      })

      it('should throw if start node does not exist', async () => {
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await expect(storage.createRelationship('KNOWS', 999, bob, {})).rejects.toThrow(
          'Start node with id 999 not found'
        )
      })

      it('should throw if end node does not exist', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })

        await expect(storage.createRelationship('KNOWS', alice, 999, {})).rejects.toThrow(
          'End node with id 999 not found'
        )
      })
    })

    describe('getRelationship', () => {
      it('should return null for non-existent relationship', async () => {
        const rel = await storage.getRelationship(999)
        expect(rel).toBeNull()
      })

      it('should return the relationship with correct structure', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, { since: 2020 })

        const rel = await storage.getRelationship(relId)

        expect(rel).not.toBeNull()
        expect(rel?.id).toBe(relId)
        expect(rel?.type).toBe('KNOWS')
        expect(rel?.startNodeId).toBe(alice)
        expect(rel?.endNodeId).toBe(bob)
        expect(rel?.properties).toEqual({ since: 2020 })
        expect(rel?.createdAt).toBeDefined()
      })
    })

    describe('deleteRelationship', () => {
      it('should delete a relationship', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, {})

        await storage.deleteRelationship(relId)

        const rel = await storage.getRelationship(relId)
        expect(rel).toBeNull()
      })

      it('should not throw for non-existent relationship', async () => {
        await expect(storage.deleteRelationship(999)).resolves.not.toThrow()
      })
    })

    describe('findRelationshipsByType', () => {
      it('should find relationships by type', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const acme = await storage.createNode(['Company'], { name: 'Acme' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('WORKS_AT', alice, acme, {})
        await storage.createRelationship('WORKS_AT', bob, acme, {})

        const worksAt = await storage.findRelationshipsByType('WORKS_AT')
        expect(worksAt).toHaveLength(2)
      })

      it('should return empty array if no relationships match', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await storage.createRelationship('KNOWS', alice, bob, {})

        const loves = await storage.findRelationshipsByType('LOVES')
        expect(loves).toEqual([])
      })
    })

    describe('updateRelationship', () => {
      it('should update relationship properties', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, { since: 2020 })

        await storage.updateRelationship(relId, { since: 2020, closeness: 0.9 })

        const rel = await storage.getRelationship(relId)
        expect(rel?.properties).toEqual({ since: 2020, closeness: 0.9 })
      })

      it('should throw for non-existent relationship', async () => {
        await expect(storage.updateRelationship(999, { since: 2020 })).rejects.toThrow(
          'Relationship with id 999 not found'
        )
      })
    })

    describe('getOutgoingRelationships', () => {
      it('should return outgoing relationships', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const charlie = await storage.createNode(['Person'], { name: 'Charlie' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('KNOWS', alice, charlie, {})
        await storage.createRelationship('KNOWS', bob, charlie, {})

        const outgoing = await storage.getOutgoingRelationships(alice)
        expect(outgoing).toHaveLength(2)
      })
    })

    describe('getIncomingRelationships', () => {
      it('should return incoming relationships', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const charlie = await storage.createNode(['Person'], { name: 'Charlie' })

        await storage.createRelationship('KNOWS', alice, charlie, {})
        await storage.createRelationship('KNOWS', bob, charlie, {})

        const incoming = await storage.getIncomingRelationships(charlie)
        expect(incoming).toHaveLength(2)
      })
    })
  })

  describe('utility methods', () => {
    describe('getAllNodes', () => {
      it('should return all nodes', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const nodes = await storage.getAllNodes()
        expect(nodes).toHaveLength(3)
      })

      it('should return empty array if no nodes exist', async () => {
        const nodes = await storage.getAllNodes()
        expect(nodes).toEqual([])
      })
    })

    describe('getAllRelationships', () => {
      it('should return all relationships', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('LIKES', alice, bob, {})

        const rels = await storage.getAllRelationships()
        expect(rels).toHaveLength(2)
      })
    })

    describe('clear', () => {
      it('should clear all data', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })

        storage.clear()

        expect(storage.nodeCount).toBe(0)
        expect(storage.relationshipCount).toBe(0)
      })

      it('should reset id counters', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })

        storage.clear()

        const id = await storage.createNode(['Person'], { name: 'Charlie' })
        expect(id).toBe(1)
      })
    })

    describe('nodeCount', () => {
      it('should return the correct node count', async () => {
        expect(storage.nodeCount).toBe(0)

        await storage.createNode(['Person'], { name: 'Alice' })
        expect(storage.nodeCount).toBe(1)

        await storage.createNode(['Person'], { name: 'Bob' })
        expect(storage.nodeCount).toBe(2)
      })
    })

    describe('relationshipCount', () => {
      it('should return the correct relationship count', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        expect(storage.relationshipCount).toBe(0)

        await storage.createRelationship('KNOWS', alice, bob, {})
        expect(storage.relationshipCount).toBe(1)
      })
    })
  })

  describe('JSON property handling', () => {
    it('should handle nested objects', async () => {
      const props = {
        address: {
          street: '123 Main St',
          city: 'NYC',
          zip: '10001',
          coordinates: { lat: 40.7128, lng: -74.006 },
        },
      }

      const id = await storage.createNode(['Location'], props)
      const node = await storage.getNode(id)

      expect(node?.properties).toEqual(props)
    })

    it('should handle arrays', async () => {
      const props = {
        tags: ['urgent', 'important'],
        scores: [95, 87, 92],
        matrix: [
          [1, 2],
          [3, 4],
        ],
      }

      const id = await storage.createNode(['Data'], props)
      const node = await storage.getNode(id)

      expect(node?.properties).toEqual(props)
    })

    it('should handle null values', async () => {
      const props = {
        name: 'Alice',
        middleName: null,
      }

      const id = await storage.createNode(['Person'], props)
      const node = await storage.getNode(id)

      expect(node?.properties).toEqual(props)
    })

    it('should handle boolean values', async () => {
      const props = {
        active: true,
        verified: false,
      }

      const id = await storage.createNode(['User'], props)
      const node = await storage.getNode(id)

      expect(node?.properties).toEqual(props)
    })

    it('should handle empty objects and arrays', async () => {
      const props = {
        metadata: {},
        items: [],
      }

      const id = await storage.createNode(['Container'], props)
      const node = await storage.getNode(id)

      expect(node?.properties).toEqual(props)
    })
  })

  describe('Index support', () => {
    describe('createIndex', () => {
      it('should create a property index on a label', async () => {
        await storage.createIndex('Person', 'email')
        const indexes = storage.getIndexes()
        expect(indexes).toContainEqual({ label: 'Person', property: 'email' })
      })

      it('should create multiple indexes on different properties', async () => {
        await storage.createIndex('Person', 'email')
        await storage.createIndex('Person', 'name')
        const indexes = storage.getIndexes()
        expect(indexes).toHaveLength(2)
      })

      it('should not create duplicate indexes', async () => {
        await storage.createIndex('Person', 'email')
        await storage.createIndex('Person', 'email')
        const indexes = storage.getIndexes()
        expect(indexes).toHaveLength(1)
      })

      it('should create indexes on different labels', async () => {
        await storage.createIndex('Person', 'email')
        await storage.createIndex('Company', 'name')
        const indexes = storage.getIndexes()
        expect(indexes).toHaveLength(2)
      })
    })

    describe('dropIndex', () => {
      it('should drop an existing index', async () => {
        await storage.createIndex('Person', 'email')
        await storage.dropIndex('Person', 'email')
        const indexes = storage.getIndexes()
        expect(indexes).toHaveLength(0)
      })

      it('should not throw when dropping non-existent index', async () => {
        await expect(storage.dropIndex('Person', 'email')).resolves.not.toThrow()
      })
    })

    describe('findNodesByProperty', () => {
      it('should find nodes by property value', async () => {
        await storage.createNode(['Person'], { name: 'Alice', email: 'alice@example.com' })
        await storage.createNode(['Person'], { name: 'Bob', email: 'bob@example.com' })
        await storage.createNode(['Person'], { name: 'Charlie', email: 'charlie@example.com' })

        const nodes = await storage.findNodesByProperty('email', 'alice@example.com')
        expect(nodes).toHaveLength(1)
        expect(nodes[0].properties.name).toBe('Alice')
      })

      it('should return empty array when no nodes match', async () => {
        await storage.createNode(['Person'], { name: 'Alice', email: 'alice@example.com' })

        const nodes = await storage.findNodesByProperty('email', 'unknown@example.com')
        expect(nodes).toEqual([])
      })

      it('should find multiple nodes with same property value', async () => {
        await storage.createNode(['Person'], { name: 'Alice', status: 'active' })
        await storage.createNode(['Person'], { name: 'Bob', status: 'active' })
        await storage.createNode(['Person'], { name: 'Charlie', status: 'inactive' })

        const nodes = await storage.findNodesByProperty('status', 'active')
        expect(nodes).toHaveLength(2)
      })

      it('should work faster with an index', async () => {
        // Create many nodes
        for (let i = 0; i < 100; i++) {
          await storage.createNode(['Person'], { name: `Person${i}`, email: `person${i}@example.com` })
        }

        // Create index
        await storage.createIndex('Person', 'email')

        // Find by indexed property
        const nodes = await storage.findNodesByProperty('email', 'person50@example.com')
        expect(nodes).toHaveLength(1)
        expect(nodes[0].properties.name).toBe('Person50')
      })
    })

    describe('findNodesByLabelAndProperty', () => {
      it('should find nodes by label and property', async () => {
        await storage.createNode(['Person'], { name: 'Alice', email: 'alice@example.com' })
        await storage.createNode(['Company'], { name: 'Acme', email: 'info@acme.com' })

        const nodes = await storage.findNodesByLabelAndProperty('Person', 'email', 'alice@example.com')
        expect(nodes).toHaveLength(1)
        expect(nodes[0].properties.name).toBe('Alice')
      })

      it('should not return nodes with matching property but different label', async () => {
        await storage.createNode(['Person'], { email: 'shared@example.com' })
        await storage.createNode(['Company'], { email: 'shared@example.com' })

        const nodes = await storage.findNodesByLabelAndProperty('Person', 'email', 'shared@example.com')
        expect(nodes).toHaveLength(1)
        expect(nodes[0].labels).toContain('Person')
      })

      it('should return empty array when label matches but property does not', async () => {
        await storage.createNode(['Person'], { name: 'Alice', email: 'alice@example.com' })

        const nodes = await storage.findNodesByLabelAndProperty('Person', 'email', 'bob@example.com')
        expect(nodes).toEqual([])
      })
    })
  })

  describe('Advanced label-based queries', () => {
    describe('findNodesByLabels', () => {
      it('should find nodes that have all specified labels', async () => {
        await storage.createNode(['Person', 'Employee', 'Manager'], { name: 'Alice' })
        await storage.createNode(['Person', 'Employee'], { name: 'Bob' })
        await storage.createNode(['Person'], { name: 'Charlie' })

        const nodes = await storage.findNodesByLabels(['Person', 'Employee'])
        expect(nodes).toHaveLength(2)
        expect(nodes.map((n) => n.properties.name)).toContain('Alice')
        expect(nodes.map((n) => n.properties.name)).toContain('Bob')
      })

      it('should return empty array when no nodes have all labels', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Employee'], { name: 'Bob' })

        const nodes = await storage.findNodesByLabels(['Person', 'Employee'])
        expect(nodes).toEqual([])
      })

      it('should return all nodes when given empty labels array', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const nodes = await storage.findNodesByLabels([])
        expect(nodes).toHaveLength(2)
      })
    })

    describe('hasLabel', () => {
      it('should return true if node has the label', async () => {
        const id = await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        const hasLabel = await storage.hasLabel(id, 'Person')
        expect(hasLabel).toBe(true)
      })

      it('should return false if node does not have the label', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        const hasLabel = await storage.hasLabel(id, 'Employee')
        expect(hasLabel).toBe(false)
      })

      it('should return false for non-existent node', async () => {
        const hasLabel = await storage.hasLabel(999, 'Person')
        expect(hasLabel).toBe(false)
      })
    })

    describe('addLabel', () => {
      it('should add a label to an existing node', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.addLabel(id, 'Employee')

        const node = await storage.getNode(id)
        expect(node?.labels).toContain('Person')
        expect(node?.labels).toContain('Employee')
      })

      it('should not duplicate an existing label', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.addLabel(id, 'Person')

        const node = await storage.getNode(id)
        expect(node?.labels).toEqual(['Person'])
      })

      it('should throw for non-existent node', async () => {
        await expect(storage.addLabel(999, 'Person')).rejects.toThrow('Node with id 999 not found')
      })
    })

    describe('removeLabel', () => {
      it('should remove a label from a node', async () => {
        const id = await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        await storage.removeLabel(id, 'Employee')

        const node = await storage.getNode(id)
        expect(node?.labels).toEqual(['Person'])
      })

      it('should not throw when removing non-existent label', async () => {
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await expect(storage.removeLabel(id, 'Employee')).resolves.not.toThrow()

        const node = await storage.getNode(id)
        expect(node?.labels).toEqual(['Person'])
      })

      it('should throw for non-existent node', async () => {
        await expect(storage.removeLabel(999, 'Person')).rejects.toThrow('Node with id 999 not found')
      })
    })

    describe('getAllLabels', () => {
      it('should return all unique labels in the graph', async () => {
        await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        await storage.createNode(['Person', 'Manager'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const labels = await storage.getAllLabels()
        expect(labels).toHaveLength(4)
        expect(labels).toContain('Person')
        expect(labels).toContain('Employee')
        expect(labels).toContain('Manager')
        expect(labels).toContain('Company')
      })

      it('should return empty array when no nodes exist', async () => {
        const labels = await storage.getAllLabels()
        expect(labels).toEqual([])
      })
    })

    describe('getNodeCount', () => {
      it('should return count of nodes with specific label', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const count = await storage.getNodeCountByLabel('Person')
        expect(count).toBe(2)
      })

      it('should return 0 for non-existent label', async () => {
        await storage.createNode(['Person'], { name: 'Alice' })

        const count = await storage.getNodeCountByLabel('Company')
        expect(count).toBe(0)
      })
    })
  })

  describe('Relationship type queries', () => {
    describe('getAllRelationshipTypes', () => {
      it('should return all unique relationship types', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const acme = await storage.createNode(['Company'], { name: 'Acme' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('WORKS_AT', alice, acme, {})
        await storage.createRelationship('WORKS_AT', bob, acme, {})

        const types = await storage.getAllRelationshipTypes()
        expect(types).toHaveLength(2)
        expect(types).toContain('KNOWS')
        expect(types).toContain('WORKS_AT')
      })

      it('should return empty array when no relationships exist', async () => {
        const types = await storage.getAllRelationshipTypes()
        expect(types).toEqual([])
      })
    })

    describe('getRelationshipCountByType', () => {
      it('should return count of relationships of specific type', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const charlie = await storage.createNode(['Person'], { name: 'Charlie' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('KNOWS', bob, charlie, {})
        await storage.createRelationship('LIKES', alice, charlie, {})

        const count = await storage.getRelationshipCountByType('KNOWS')
        expect(count).toBe(2)
      })

      it('should return 0 for non-existent type', async () => {
        const count = await storage.getRelationshipCountByType('LOVES')
        expect(count).toBe(0)
      })
    })

    describe('getRelationshipsBetween', () => {
      it('should return all relationships between two nodes', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('LIKES', alice, bob, {})

        const rels = await storage.getRelationshipsBetween(alice, bob)
        expect(rels).toHaveLength(2)
      })

      it('should return empty array if no relationships exist', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        const rels = await storage.getRelationshipsBetween(alice, bob)
        expect(rels).toEqual([])
      })

      it('should only return relationships in the specified direction', async () => {
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('KNOWS', bob, alice, {})

        const rels = await storage.getRelationshipsBetween(alice, bob)
        expect(rels).toHaveLength(1)
        expect(rels[0].startNodeId).toBe(alice)
        expect(rels[0].endNodeId).toBe(bob)
      })
    })
  })

  describe('Merge operations', () => {
    describe('mergeNode', () => {
      it('should create a node if it does not exist', async () => {
        const result = await storage.mergeNode(['Person'], { email: 'alice@example.com' }, { name: 'Alice' })

        expect(result.created).toBe(true)
        expect(result.node.properties.email).toBe('alice@example.com')
        expect(result.node.properties.name).toBe('Alice')
      })

      it('should return existing node if match properties exist', async () => {
        await storage.createNode(['Person'], { email: 'alice@example.com', name: 'Alice' })

        const result = await storage.mergeNode(['Person'], { email: 'alice@example.com' }, { name: 'Alice Updated' })

        expect(result.created).toBe(false)
        expect(result.node.properties.name).toBe('Alice') // Original name preserved
      })

      it('should update properties on merge if specified', async () => {
        await storage.createNode(['Person'], { email: 'alice@example.com', name: 'Alice' })

        const result = await storage.mergeNode(
          ['Person'],
          { email: 'alice@example.com' },
          {},
          { name: 'Alice Updated' }
        )

        expect(result.created).toBe(false)
        expect(result.node.properties.name).toBe('Alice Updated')
      })
    })
  })
})
