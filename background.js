// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Background Service Worker
// Manages IndexedDB for rules and scraped data

const DB_NAME = 'lidar-db';
const DB_VERSION = 1;

let db = null;

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
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
function generateId() {
    return crypto.randomUUID();
}

// CRUD Operations for Rules
async function createRule(rule) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['rules'], 'readwrite');
        const store = transaction.objectStore('rules');

        const newRule = {
            id: generateId(),
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

async function getRules() {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['rules'], 'readonly');
        const store = transaction.objectStore('rules');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getRule(id) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['rules'], 'readonly');
        const store = transaction.objectStore('rules');
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateRule(rule) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['rules'], 'readwrite');
        const store = transaction.objectStore('rules');

        rule.updatedAt = new Date().toISOString();
        const request = store.put(rule);

        request.onsuccess = () => resolve(rule);
        request.onerror = () => reject(request.error);
    });
}

async function deleteRule(id) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['rules'], 'readwrite');
        const store = transaction.objectStore('rules');
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// CRUD Operations for Scraped Data
async function saveData(ruleId, ruleName, scrapedData, sourceUrl) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['data'], 'readwrite');
        const store = transaction.objectStore('data');
        const index = store.index('ruleId_identifier');

        // Check for existing record with same ruleId and identifier (upsert)
        const lookupRequest = index.get([ruleId, scrapedData.identifier]);

        lookupRequest.onsuccess = () => {
            const existing = lookupRequest.result;
            const record = {
                id: existing ? existing.id : generateId(),
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

async function getDataByRule(ruleId) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['data'], 'readonly');
        const store = transaction.objectStore('data');
        const index = store.index('ruleId');
        const request = index.getAll(ruleId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteData(id) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['data'], 'readwrite');
        const store = transaction.objectStore('data');
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function deleteDataByRule(ruleId) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['data'], 'readwrite');
        const store = transaction.objectStore('data');
        const index = store.index('ruleId');

        // We need to delete by primary key, so first get all keys for the rule
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

// Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handleAsync = async () => {
        try {
            switch (message.action) {
                case 'getRules':
                    return await getRules();

                case 'getRule':
                    return await getRule(message.id);

                case 'createRule':
                    return await createRule(message.rule);

                case 'updateRule':
                    return await updateRule(message.rule);

                case 'deleteRule':
                    return await deleteRule(message.id);

                case 'saveData':
                    return await saveData(
                        message.ruleId,
                        message.ruleName,
                        message.data,
                        message.sourceUrl
                    );

                case 'getDataByRule':
                    return await getDataByRule(message.ruleId);

                case 'deleteData':
                    return await deleteData(message.id);

                case 'deleteDataByRule':
                    return await deleteDataByRule(message.ruleId);

                case 'updateBadge':
                    // Update badge with count for the sender tab
                    if (sender.tab?.id) {
                        const badgeApi = chrome.action || chrome.browserAction;
                        const count = message.count || 0;
                        const badgeText = count > 0 ? String(count) : '';

                        // MV3 style (with tabId) or MV2 style
                        if (badgeApi.setBadgeText.length > 1 || chrome.action) {
                            badgeApi.setBadgeText({ text: badgeText, tabId: sender.tab.id });
                            badgeApi.setBadgeBackgroundColor({ color: '#34d399', tabId: sender.tab.id });
                        } else {
                            badgeApi.setBadgeText({ text: badgeText });
                            badgeApi.setBadgeBackgroundColor({ color: '#34d399' });
                        }
                    }
                    return { success: true };

                case 'clearBadge':
                    // Clear badge for the sender tab
                    if (sender.tab?.id) {
                        const badgeApi = chrome.action || chrome.browserAction;
                        if (badgeApi.setBadgeText.length > 1 || chrome.action) {
                            badgeApi.setBadgeText({ text: '', tabId: sender.tab.id });
                        } else {
                            badgeApi.setBadgeText({ text: '' });
                        }
                    }
                    return { success: true };

                default:
                    throw new Error(`Unknown action: ${message.action}`);
            }
        } catch (error) {
            console.error('Background error:', error);
            return { error: error.message };
        }
    };

    handleAsync().then(sendResponse);
    return true; // Keep message channel open for async response
});

// Initialize DB on install
chrome.runtime.onInstalled.addListener(() => {
    initDB().then(() => {
        console.log('Lidar: Database initialized');
    });
});

// Cross-browser compatibility for action API
const browserAction = chrome.action || chrome.browserAction;

// Handle extension icon click - inject panel directly
browserAction.onClicked.addListener(async (tab) => {
    // Check if we can inject into this tab
    const url = tab?.url || '';
    if (!tab?.id || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url.startsWith('moz-extension://')) {
        console.log('Cannot inject into this page');
        return;
    }

    try {
        // Use chrome.scripting (MV3) or chrome.tabs.executeScript (MV2/Firefox)
        if (chrome.scripting && chrome.scripting.executeScript) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['panel.js']
            });
        } else {
            // Fallback for Firefox/MV2
            await new Promise((resolve, reject) => {
                chrome.tabs.executeScript(tab.id, { file: 'panel.js' }, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error injecting panel:', error);
    }
});
