// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Database Module
// IndexedDB operations for rules and scraped data

(function() {
    'use strict';

    // Initialize Lidar namespace
    window.Lidar = window.Lidar || {};

    const DB_NAME = 'lidar-db';
    const DB_VERSION = 1;

    let dbCache = null;

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
            const index = store.index('ruleId_identifier');

            // Check for existing record with same ruleId and identifier (upsert)
            const lookupRequest = index.get([ruleId, scrapedData.identifier]);

            lookupRequest.onsuccess = () => {
                const existing = lookupRequest.result;
                const record = {
                    id: existing ? existing.id : generateId(crypto),
                    ruleId,
                    ruleName,
                    identifier: scrapedData.identifier,
                    data: scrapedData,
                    sourceUrl,
                    scrapedAt: new Date().toISOString()
                };

                const saveRequest = store.put(record);
                saveRequest.onsuccess = () => resolve(record);
                saveRequest.onerror = () => reject(saveRequest.error);
            };

            lookupRequest.onerror = () => reject(lookupRequest.error);
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

    // Export database functions
    window.Lidar.db = {
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
        deleteDataByRule
    };
})();
