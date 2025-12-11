// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Comprehensive tests for db.js module
const { createMockCrypto } = require('../mocks/testHelpers');

describe('Database Module (db.js) - Comprehensive', () => {
    let mockCrypto;
    
    beforeAll(() => {
        // Set up global context
        global.self = global;
        global.Lidar = {
            messaging: {},
            db: {},
            rules: {},
            scraping: {},
            badge: {}
        };
        mockCrypto = createMockCrypto();

        // Load the db module once
        require('../../src/db.js');
    });
    
    beforeEach(async () => {
        // Close any open database connections before deleting
        if (global.Lidar.db) {
            global.Lidar.db.closeDB();
        }

        // Clean up any existing database for this test
        try {
            await new Promise((resolve, reject) => {
                const deleteRequest = indexedDB.deleteDatabase('lidar-db');
                deleteRequest.onsuccess = () => resolve();
                deleteRequest.onerror = () => resolve(); // Ignore errors, database might not exist
                deleteRequest.onblocked = () => resolve();
            });
        } catch (e) {
            // Ignore errors during cleanup
        }
    });
    
    describe('Core Functions', () => {
        test('should have all expected functions available', () => {
            expect(Lidar.db).toBeDefined();
            expect(typeof Lidar.db.initDB).toBe('function');
            expect(typeof Lidar.db.generateId).toBe('function');
            expect(typeof Lidar.db.registerMigration).toBe('function');
            expect(typeof Lidar.db.createRule).toBe('function');
            expect(typeof Lidar.db.getRules).toBe('function');
            expect(typeof Lidar.db.getRule).toBe('function');
            expect(typeof Lidar.db.updateRule).toBe('function');
            expect(typeof Lidar.db.deleteRule).toBe('function');
            expect(typeof Lidar.db.saveData).toBe('function');
            expect(typeof Lidar.db.getDataByRule).toBe('function');
            expect(typeof Lidar.db.deleteData).toBe('function');
            expect(typeof Lidar.db.deleteDataByRule).toBe('function');
        });
        
        test('should generate valid IDs', () => {
            const id = Lidar.db.generateId(mockCrypto);
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        });
        
        test('should register migrations correctly', () => {
            const migrationFn = jest.fn();
            expect(() => {
                Lidar.db.registerMigration(2, migrationFn);
            }).not.toThrow();
        });
        
        test.each([
            [0, 'version must be integer >= 1'],
            [-1, 'version must be integer >= 1'],
            [1.5, 'version must be integer >= 1']
        ])('should reject invalid migration version %s', (version, expectedError) => {
            const migrationFn = jest.fn();
            expect(() => {
                Lidar.db.registerMigration(version, migrationFn);
            }).toThrow(expectedError);
        });
    });
    
    describe('Database Initialization', () => {
        test('should initialize database successfully', async () => {
            const result = await Lidar.db.initDB(indexedDB);
            expect(result).toBeDefined();
            expect(result.objectStoreNames.contains('rules')).toBe(true);
            expect(result.objectStoreNames.contains('data')).toBe(true);
        });

        test('should cache database instance', async () => {
            const first = await Lidar.db.initDB(indexedDB);
            const second = await Lidar.db.initDB(indexedDB);
            expect(first).toBe(second);
        });
    });
    
    describe('Rule CRUD Operations', () => {
        beforeEach(async () => {
            await Lidar.db.initDB(indexedDB);
        });
        
        describe('createRule', () => {
            test('should create a new rule successfully', async () => {
                const ruleData = {
                    name: 'Test Rule',
                    urlPattern: 'https://example.com/*',
                    fields: [
                        { name: 'identifier', selector: '.main', required: true },
                        { name: 'title', selector: 'h1', required: false }
                    ]
                };
                
                const result = await Lidar.db.createRule(ruleData, indexedDB, mockCrypto);
                
                expect(result).toBeDefined();
                expect(result.id).toBeDefined();
                expect(result.name).toBe('Test Rule');
                expect(result.urlPattern).toBe('https://example.com/*');
                expect(result.fields).toEqual(ruleData.fields);
                expect(result.createdAt).toBeDefined();
                expect(result.updatedAt).toBeDefined();
            });
            
            test('should create rule with default values', async () => {
                const ruleData = {
                    name: 'Minimal Rule'
                };
                
                const result = await Lidar.db.createRule(ruleData, indexedDB, mockCrypto);
                
                expect(result.urlPattern).toBe('');
                expect(result.fields).toEqual([{ name: 'identifier', selector: '', required: true }]);
            });
        });
        
        describe('getRules', () => {
            test('should return empty array when no rules exist', async () => {
                const result = await Lidar.db.getRules(indexedDB);
                expect(result).toEqual([]);
            });
            
            test('should return all rules', async () => {
                // Create some test rules
                const rule1 = await Lidar.db.createRule(
                    { name: 'Rule 1', urlPattern: 'https://example.com/*' },
                    indexedDB,
                    mockCrypto
                );
                const rule2 = await Lidar.db.createRule(
                    { name: 'Rule 2', urlPattern: 'https://other.com/*' },
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.getRules(indexedDB);
                
                expect(result).toHaveLength(2);
                expect(result).toContainEqual(rule1);
                expect(result).toContainEqual(rule2);
            });
        });
        
        describe('getRule', () => {
            test('should return specific rule by ID', async () => {
                const createdRule = await Lidar.db.createRule(
                    { name: 'Specific Rule', urlPattern: 'https://specific.com/*' },
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.getRule(createdRule.id, indexedDB);
                
                expect(result).toEqual(createdRule);
            });
            
            test('should return undefined for non-existent rule', async () => {
                const result = await Lidar.db.getRule('non-existent-id', indexedDB);
                expect(result).toBeUndefined();
            });
        });
        
        describe('updateRule', () => {
            test('should update existing rule', async () => {
                const originalRule = await Lidar.db.createRule(
                    { name: 'Original Name', urlPattern: 'https://original.com/*' },
                    indexedDB,
                    mockCrypto
                );
                
                const updatedRule = {
                    ...originalRule,
                    name: 'Updated Name',
                    urlPattern: 'https://updated.com/*'
                };
                
                const result = await Lidar.db.updateRule(updatedRule, indexedDB);

                expect(result.name).toBe('Updated Name');
                expect(result.urlPattern).toBe('https://updated.com/*');
                expect(result.updatedAt).toBeDefined();
            });
            
            test('should handle update of non-existent rule', async () => {
                const nonExistentRule = {
                    id: 'non-existent-id',
                    name: 'Non-existent Rule'
                };
                
                const result = await Lidar.db.updateRule(nonExistentRule, indexedDB);
                
                // Should still work (upsert behavior)
                expect(result.name).toBe('Non-existent Rule');
            });
        });
        
        describe('deleteRule', () => {
            test('should delete existing rule', async () => {
                const rule = await Lidar.db.createRule(
                    { name: 'Rule to Delete', urlPattern: 'https://delete.com/*' },
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.deleteRule(rule.id, indexedDB);
                
                expect(result).toBe(true);
                
                // Verify rule is deleted
                const deletedRule = await Lidar.db.getRule(rule.id, indexedDB);
                expect(deletedRule).toBeUndefined();
            });
            
            test('should return true for non-existent rule', async () => {
                const result = await Lidar.db.deleteRule('non-existent-id', indexedDB);
                expect(result).toBe(true);
            });
        });
    });
    
    describe('Data Operations', () => {
        let testRule;
        
        beforeEach(async () => {
            await Lidar.db.initDB(indexedDB);
            testRule = await Lidar.db.createRule(
                { name: 'Data Test Rule', urlPattern: 'https://data.com/*' },
                indexedDB,
                mockCrypto
            );
        });
        
        describe('saveData', () => {
            test('should save new data successfully', async () => {
                const scrapedData = {
                    identifier: 'item-123',
                    title: 'Test Title',
                    description: 'Test Description'
                };
                
                const result = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    scrapedData,
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                expect(result).toBeDefined();
                expect(result.ruleId).toBe(testRule.id);
                expect(result.ruleName).toBe(testRule.name);
                expect(result.identifier).toBe('item-123');
                expect(result.data).toEqual(scrapedData);
                expect(result.sourceUrl).toBe('https://data.com/page1');
                expect(result.scrapedAt).toBeDefined();
            });
            
            test('should upsert data with same ruleId and identifier', async () => {
                const scrapedData1 = {
                    identifier: 'item-123',
                    title: 'Original Title'
                };
                
                const scrapedData2 = {
                    identifier: 'item-123',
                    title: 'Updated Title'
                };
                
                // Save first time
                const result1 = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    scrapedData1,
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                // Save again with same identifier (should update)
                const result2 = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    scrapedData2,
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                expect(result2.id).toBe(result1.id); // Same ID (update)
                expect(result2.data.title).toBe('Updated Title');
            });
            
            test('should handle missing identifier gracefully', async () => {
                const scrapedData = {
                    title: 'Test Title'
                    // No identifier
                };
                
                const result = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    scrapedData,
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                expect(result).toBeDefined();
                expect(result.identifier).toBeUndefined();
            });
        });
        
        describe('getDataByRule', () => {
            test('should return empty array when no data exists', async () => {
                const result = await Lidar.db.getDataByRule(testRule.id, indexedDB);
                expect(result).toEqual([]);
            });
            
            test('should return all data for a specific rule', async () => {
                // Create test data
                const data1 = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    { identifier: 'item-1', title: 'Title 1' },
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                const data2 = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    { identifier: 'item-2', title: 'Title 2' },
                    'https://data.com/page2',
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.getDataByRule(testRule.id, indexedDB);
                
                expect(result).toHaveLength(2);
                expect(result).toContainEqual(data1);
                expect(result).toContainEqual(data2);
            });
            
            test('should only return data for specified rule', async () => {
                // Create another rule
                const otherRule = await Lidar.db.createRule(
                    { name: 'Other Rule', urlPattern: 'https://other.com/*' },
                    indexedDB,
                    mockCrypto
                );
                
                // Create data for both rules
                await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    { identifier: 'item-1', title: 'Title 1' },
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                await Lidar.db.saveData(
                    otherRule.id,
                    otherRule.name,
                    { identifier: 'item-2', title: 'Title 2' },
                    'https://other.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.getDataByRule(testRule.id, indexedDB);
                
                expect(result).toHaveLength(1);
                expect(result[0].ruleId).toBe(testRule.id);
            });
        });
        
        describe('deleteData', () => {
            test('should delete specific data record', async () => {
                const data = await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    { identifier: 'item-to-delete', title: 'To Delete' },
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.deleteData(data.id, indexedDB);
                
                expect(result).toBe(true);
                
                // Verify data is deleted
                const remainingData = await Lidar.db.getDataByRule(testRule.id, indexedDB);
                expect(remainingData).toHaveLength(0);
            });
            
            test('should return true for non-existent data', async () => {
                const result = await Lidar.db.deleteData('non-existent-id', indexedDB);
                expect(result).toBe(true);
            });
        });
        
        describe('deleteDataByRule', () => {
            test('should delete all data for a specific rule', async () => {
                // Create multiple data records for the rule
                await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    { identifier: 'item-1', title: 'Title 1' },
                    'https://data.com/page1',
                    indexedDB,
                    mockCrypto
                );
                
                await Lidar.db.saveData(
                    testRule.id,
                    testRule.name,
                    { identifier: 'item-2', title: 'Title 2' },
                    'https://data.com/page2',
                    indexedDB,
                    mockCrypto
                );
                
                const result = await Lidar.db.deleteDataByRule(testRule.id, indexedDB);
                
                expect(result).toBe(true);
                
                // Verify all data is deleted
                const remainingData = await Lidar.db.getDataByRule(testRule.id, indexedDB);
                expect(remainingData).toHaveLength(0);
            });
            
            test('should return true when no data exists for rule', async () => {
                const result = await Lidar.db.deleteDataByRule('non-existent-rule-id', indexedDB);
                expect(result).toBe(true);
            });
        });
    });
});