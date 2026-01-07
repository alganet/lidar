// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Database Module
// IndexedDB operations for rules and scraped data

(function () {
    'use strict';

    const globalObj = (typeof globalThis.__getLidarGlobal === 'function')
        ? globalThis.__getLidarGlobal()
        : ((typeof Lidar !== 'undefined' && typeof Lidar._getGlobal === 'function')
            ? Lidar._getGlobal()
            : (function () { throw new Error('Global accessor not initialized. Ensure src/global.js is loaded before this module.'); }()));

    const DB_NAME = 'lidar-db';
    const DB_VERSION = 2;

    let dbCache = null;

    // INTERNAL: Migration registry
    const migrations = {};

    /**
     * Register a migration function for a specific target version.
     * The migration will be executed when upgrading to that version.
     *
     * Migration signature: (database, transaction, context) => void
     * - database: IDBDatabase instance
     * - transaction: IDBTransaction for the upgrade
     * - context: { from, to }
     */
    function registerMigration(version, fn) {
        if (!Number.isInteger(version) || version < 1) throw new Error('version must be integer >= 1');
        migrations[version] = fn;
    }

    // Initialize IndexedDB
    function initDB(indexedDB) {
        return new Promise((resolve, reject) => {
            if (dbCache) {
                resolve(dbCache);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                dbCache = request.result;
                resolve(dbCache);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                const txn = event.target.transaction;
                const oldVersion = event.oldVersion || 0;
                const newVersion = event.newVersion || DB_VERSION;

                // Apply migrations incrementally between versions
                for (let v = oldVersion + 1; v <= newVersion; v++) {
                    const m = migrations[v];
                    if (typeof m === 'function') {
                        try {
                            m(database, txn, { from: oldVersion, to: newVersion });
                        } catch (e) {
                            console.error(`Migration ${v} failed:`, e);
                            // Re-throw to abort upgrade if something went wrong
                            throw e;
                        }
                    } else {
                        // No migration registered for this version; continue
                        console.warn(`No migration registered for version ${v}`);
                    }
                }
            };
        });
    }

    // Generate UUID
    function generateId(crypto) {
        return crypto.randomUUID();
    }

    // Create a new rule
    async function createRule(rule, indexedDB, crypto) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readwrite');
            const store = transaction.objectStore('rules');

            const newRule = {
                id: generateId(crypto),
                name: rule.name,
                urlPattern: rule.urlPattern || '',
                state: rule.state,
                regionSelector: rule.regionSelector,
                snapshots: rule.snapshots,
                fields: rule.fields || [{ name: 'identifier', selector: '', required: true }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const request = store.add(newRule);
            request.onsuccess = () => resolve(newRule);
            request.onerror = () => reject(request.error);
        });
    }

    // Get all rules
    async function getRules(indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readonly');
            const store = transaction.objectStore('rules');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get a single rule by ID
    async function getRule(id, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readonly');
            const store = transaction.objectStore('rules');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Update an existing rule
    async function updateRule(rule, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readwrite');
            const store = transaction.objectStore('rules');

            rule.updatedAt = new Date().toISOString();
            const request = store.put(rule);

            request.onsuccess = () => resolve(rule);
            request.onerror = () => reject(request.error);
        });
    }

    // Delete a rule
    async function deleteRule(id, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readwrite');
            const store = transaction.objectStore('rules');
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Save scraped data (upsert based on ruleId + identifier)
    async function saveData(ruleId, ruleName, scrapedData, sourceUrl, indexedDB, crypto) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');

            const record = {
                id: generateId(crypto),
                ruleId,
                ruleName,
                identifier: scrapedData.identifier,
                data: scrapedData,
                sourceUrl,
                scrapedAt: new Date().toISOString()
            };

            // If identifier is present and valid, try to upsert based on ruleId + identifier
            if (scrapedData.identifier !== undefined && scrapedData.identifier !== null) {
                const index = store.index('ruleId_identifier');
                const lookupRequest = index.get([ruleId, scrapedData.identifier]);

                lookupRequest.onsuccess = () => {
                    const existing = lookupRequest.result;
                    if (existing) {
                        record.id = existing.id; // Use existing ID for update
                    }

                    const saveRequest = store.put(record);
                    saveRequest.onsuccess = () => resolve(record);
                    saveRequest.onerror = () => reject(saveRequest.error);
                };

                lookupRequest.onerror = () => reject(lookupRequest.error);
            } else {
                // No identifier, just upsert new record
                const saveRequest = store.put(record);
                saveRequest.onsuccess = () => resolve(record);
                saveRequest.onerror = () => reject(saveRequest.error);
            }
        });
    }

    // Get all data for a specific rule
    async function getDataByRule(ruleId, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['data'], 'readonly');
            const store = transaction.objectStore('data');
            const index = store.index('ruleId');
            const request = index.getAll(ruleId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Delete a single data record
    async function deleteData(id, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Delete all data for a specific rule
    async function deleteDataByRule(ruleId, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            const index = store.index('ruleId');

            // Get all keys for the rule, then delete each
            const keyRequest = index.getAllKeys(ruleId);

            keyRequest.onsuccess = () => {
                const keys = keyRequest.result;
                if (keys.length === 0) {
                    resolve(true);
                    return;
                }

                let deleteCount = 0;
                let errorOccurred = false;

                keys.forEach(key => {
                    const deleteRequest = store.delete(key);
                    deleteRequest.onsuccess = () => {
                        deleteCount++;
                        if (deleteCount === keys.length) resolve(true);
                    };
                    deleteRequest.onerror = (e) => {
                        if (!errorOccurred) {
                            errorOccurred = true;
                            reject(e.target.error);
                        }
                    };
                });
            };
            keyRequest.onerror = () => reject(keyRequest.error);
        });
    }

    // Register initial migration for version 1 (initial schema)
    registerMigration(1, (database) => {
        // Rules store
        if (!database.objectStoreNames.contains('rules')) {
            const rulesStore = database.createObjectStore('rules', { keyPath: 'id' });
            rulesStore.createIndex('name', 'name', { unique: true });
        }

        // Scraped data store
        if (!database.objectStoreNames.contains('data')) {
            const dataStore = database.createObjectStore('data', { keyPath: 'id' });
            dataStore.createIndex('ruleId', 'ruleId', { unique: false });
            dataStore.createIndex('identifier', 'identifier', { unique: false });
            dataStore.createIndex('ruleId_identifier', ['ruleId', 'identifier'], { unique: true });
        }
    });

    // Migration v2: Add learning mode support for rules
    // New fields: state ('learning' | 'resolved'), regionSelector, snapshots
    // Note: IndexedDB doesn't require schema changes for new fields on existing stores
    // This migration just documents the schema change - existing rules get 'resolved' state
    registerMigration(2, () => {
        // No structural changes needed - new fields are added at runtime
        // Existing rules will have undefined state, which we treat as 'resolved'
        console.log('Migration v2: Learning mode support added');
    });

    /**
     * Add a snapshot to a learning rule.
     * @param {string} ruleId
     * @param {string} regionHtml - Serialized HTML of the region
     * @param {string} sourceUrl - URL where snapshot was captured
     * @returns {Promise<object>} Updated rule
     */
    async function addSnapshot(ruleId, regionHtml, sourceUrl, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readwrite');
            const store = transaction.objectStore('rules');
            const getRequest = store.get(ruleId);

            getRequest.onsuccess = () => {
                const rule = getRequest.result;
                if (!rule) {
                    reject(new Error('Rule not found'));
                    return;
                }

                if (rule.state !== 'learning') {
                    reject(new Error('Rule is not in learning state'));
                    return;
                }

                // Initialize snapshots array if needed
                if (!Array.isArray(rule.snapshots)) {
                    rule.snapshots = [];
                }

                // Check if we already have a snapshot from this URL
                const existingUrls = new Set(rule.snapshots.map(s => s.sourceUrl));
                if (existingUrls.has(sourceUrl)) {
                    // Don't add duplicate, just return current state
                    resolve(rule);
                    return;
                }

                // Add the new snapshot
                rule.snapshots.push({
                    capturedAt: new Date().toISOString(),
                    regionHtml,
                    sourceUrl
                });
                rule.updatedAt = new Date().toISOString();

                const putRequest = store.put(rule);
                putRequest.onsuccess = () => resolve(rule);
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Clear snapshots from a rule (after detection completes).
     */
    async function clearSnapshots(ruleId, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readwrite');
            const store = transaction.objectStore('rules');
            const getRequest = store.get(ruleId);

            getRequest.onsuccess = () => {
                const rule = getRequest.result;
                if (!rule) {
                    reject(new Error('Rule not found'));
                    return;
                }

                rule.snapshots = [];
                rule.updatedAt = new Date().toISOString();

                const putRequest = store.put(rule);
                putRequest.onsuccess = () => resolve(rule);
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Transition a rule from learning to resolved state.
     */
    /**
     * Transition a rule from learning to resolved state.
     */
    async function resolveRule(ruleId, detectedFields, identifierFieldName, urlPattern, indexedDB) {
        const database = await initDB(indexedDB);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['rules'], 'readwrite');
            const store = transaction.objectStore('rules');
            const getRequest = store.get(ruleId);

            getRequest.onsuccess = () => {
                const rule = getRequest.result;
                if (!rule) {
                    reject(new Error('Rule not found'));
                    return;
                }

                // Update rule with detected fields and crystallized URL pattern
                rule.state = 'resolved';
                rule.urlPattern = urlPattern || rule.urlPattern;
                rule.fields = detectedFields.map(f => ({
                    name: f.name === identifierFieldName ? 'identifier' : f.name,
                    selector: f.selector,
                    required: f.name === identifierFieldName
                }));

                rule.snapshots = []; // Clear snapshots
                rule.updatedAt = new Date().toISOString();

                const putRequest = store.put(rule);
                putRequest.onsuccess = () => resolve(rule);
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Export database functions
    globalObj.Lidar.db = {
        initDB,
        generateId,
        createRule,
        getRules,
        getRule,
        updateRule,
        deleteRule,
        saveData,
        getDataByRule,
        deleteData,
        deleteDataByRule,
        registerMigration,
        // Learning mode functions
        addSnapshot,
        clearSnapshots,
        resolveRule,
        resetCache: () => { dbCache = null; },
        closeDB: () => { if (dbCache) { dbCache.close(); dbCache = null; } }
    };
})();
