// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for background.js module
const { createMockCrypto } = require('../mocks/testHelpers');

describe('Background Module (background.js)', () => {
    let mockChrome;
    let mockCrypto;
    let onMessageCallback;
    let onInstalledCallback;
    let actionClickCallback;

    beforeAll(() => {
        mockCrypto = createMockCrypto();

        global.self = global;
        global.Lidar = {
            db: {},
            badge: {}
        };

        require('../../src/db.js');
        require('../../src/badge.js');
    });

    beforeEach(async () => {
        onMessageCallback = null;
        onInstalledCallback = null;
        actionClickCallback = null;

        mockChrome = {
            runtime: {
                onMessage: {
                    addListener: jest.fn((callback) => {
                        onMessageCallback = callback;
                    })
                },
                onInstalled: {
                    addListener: jest.fn((callback) => {
                        onInstalledCallback = callback;
                    })
                },
                getURL: jest.fn((path) => `chrome-extension://ext-id/${path}`)
            },
            tabs: {
                query: jest.fn((params, callback) => callback([])),
                sendMessage: jest.fn((tabId, message, callback) => {
                    if (callback) callback();
                })
            },
            action: {
                onClicked: {
                    addListener: jest.fn((callback) => {
                        actionClickCallback = callback;
                    })
                }
            },
            browserAction: undefined,
            scripting: {
                executeScript: jest.fn().mockResolvedValue([])
            }
        };

        global.chrome = mockChrome;

        jest.resetModules();
        require('../../src/background.js');

        if (global.Lidar.db && global.Lidar.db.closeDB) {
            global.Lidar.db.closeDB();
        }
        try {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('lidar-db');
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
            });
        } catch (e) {}

        await global.Lidar.db.initDB(indexedDB);
    });

    afterEach(() => {
        delete global.chrome;
    });

    describe('Message Handler - getRules', () => {
        test('should return rules array', async () => {
            await global.Lidar.db.createRule(
                { name: 'Test Rule', urlPattern: 'https://example.com/*' },
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'getRules' },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result).toBeDefined();
            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Test Rule');
        });
    });

    describe('Message Handler - getRule', () => {
        test('should return specific rule by id', async () => {
            const created = await global.Lidar.db.createRule(
                { name: 'Specific Rule', urlPattern: 'https://specific.com/*' },
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'getRule', id: created.id },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result.name).toBe('Specific Rule');
        });
    });

    describe('Message Handler - createRule', () => {
        test('should create rule and broadcast update', async () => {
            mockChrome.tabs.query.mockImplementation((params, callback) => {
                callback([{ id: 1 }, { id: 2 }]);
            });

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    {
                        action: 'createRule',
                        rule: { name: 'New Rule', urlPattern: 'https://new.com/*' }
                    },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result.name).toBe('New Rule');
            expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
        });
    });

    describe('Message Handler - updateRule', () => {
        test('should update rule and broadcast update', async () => {
            mockChrome.tabs.query.mockImplementation((params, callback) => {
                callback([{ id: 1 }]);
            });

            const created = await global.Lidar.db.createRule(
                { name: 'Original', urlPattern: 'https://original.com/*' },
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    {
                        action: 'updateRule',
                        rule: { id: created.id, name: 'Updated' }
                    },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result.name).toBe('Updated');
            expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('Message Handler - deleteRule', () => {
        test('should delete rule', async () => {
            mockChrome.tabs.query.mockImplementation((params, callback) => {
                callback([{ id: 1 }]);
            });

            const created = await global.Lidar.db.createRule(
                { name: 'To Delete', urlPattern: 'https://delete.com/*' },
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'deleteRule', id: created.id },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result).toBe(true);
        });
    });

    describe('Message Handler - saveData', () => {
        test('should save data', async () => {
            const rule = await global.Lidar.db.createRule(
                { name: 'Data Rule', urlPattern: 'https://data.com/*' },
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    {
                        action: 'saveData',
                        ruleId: rule.id,
                        ruleName: rule.name,
                        data: { identifier: 'item-1', title: 'Test' },
                        sourceUrl: 'https://data.com/page'
                    },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result.identifier).toBe('item-1');
        });
    });

    describe('Message Handler - getDataByRule', () => {
        test('should return data for specific rule', async () => {
            const rule = await global.Lidar.db.createRule(
                { name: 'Get Data Rule', urlPattern: 'https://getdata.com/*' },
                indexedDB,
                mockCrypto
            );

            await global.Lidar.db.saveData(
                rule.id,
                rule.name,
                { identifier: 'item-1', title: 'Title 1' },
                'https://getdata.com/page1',
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'getDataByRule', ruleId: rule.id },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result.length).toBe(1);
        });
    });

    describe('Message Handler - deleteData', () => {
        test('should delete specific data record', async () => {
            const rule = await global.Lidar.db.createRule(
                { name: 'Delete Data Rule', urlPattern: 'https://deldata.com/*' },
                indexedDB,
                mockCrypto
            );

            const data = await global.Lidar.db.saveData(
                rule.id,
                rule.name,
                { identifier: 'to-delete' },
                'https://deldata.com/page',
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'deleteData', id: data.id },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result).toBe(true);
        });
    });

    describe('Message Handler - deleteDataByRule', () => {
        test('should delete all data for rule', async () => {
            const rule = await global.Lidar.db.createRule(
                { name: 'Delete By Rule Rule', urlPattern: 'https://delbyrule.com/*' },
                indexedDB,
                mockCrypto
            );

            await global.Lidar.db.saveData(
                rule.id,
                rule.name,
                { identifier: 'item-1' },
                'https://delbyrule.com/page1',
                indexedDB,
                mockCrypto
            );

            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'deleteDataByRule', ruleId: rule.id },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result).toBe(true);
        });
    });

    describe('Message Handler - updateBadge', () => {
        beforeEach(() => {
            global.Lidar.badge.updateBadge = jest.fn();
            global.Lidar.badge.clearBadge = jest.fn();
        });

        test('should update badge with valid tab', async () => {
            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'updateBadge', count: 5 },
                    { tab: { id: 123 } },
                    (response) => resolve(response)
                );
            });

            expect(result).toEqual({ success: true });
            expect(global.Lidar.badge.updateBadge).toHaveBeenCalledWith(5, 123, mockChrome);
        });

        test('should skip badge update without tab', async () => {
            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'updateBadge', count: 5 },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result).toEqual({ success: true });
            expect(global.Lidar.badge.updateBadge).not.toHaveBeenCalled();
        });
    });

    describe('Message Handler - clearBadge', () => {
        beforeEach(() => {
            global.Lidar.badge.updateBadge = jest.fn();
            global.Lidar.badge.clearBadge = jest.fn();
        });

        test('should clear badge with valid tab', async () => {
            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'clearBadge' },
                    { tab: { id: 456 } },
                    (response) => resolve(response)
                );
            });

            expect(result).toEqual({ success: true });
            expect(global.Lidar.badge.clearBadge).toHaveBeenCalledWith(456, mockChrome);
        });
    });

    describe('Message Handler - unknown action', () => {
        test('should return error for unknown action', async () => {
            const result = await new Promise((resolve) => {
                onMessageCallback(
                    { action: 'unknownAction' },
                    {},
                    (response) => resolve(response)
                );
            });

            expect(result.error).toBe('Unknown action: unknownAction');
        });
    });


    describe('Browser Action Click Handler', () => {
        test('should have action listener registered', () => {
            expect(actionClickCallback).toBeDefined();
        });

        test('should register listener on browserAction when action API is absent', async () => {
            // reinitialize environment with only browserAction
            mockChrome.action = undefined;
            mockChrome.browserAction = {
                onClicked: {
                    addListener: jest.fn((callback) => {
                        actionClickCallback = callback;
                    })
                }
            };
            jest.resetModules();
            // re-require dependencies
            require('../../src/background.js');
            expect(actionClickCallback).toBeDefined();
        });

        test('should skip injection for blocked URLs', async () => {
            await actionClickCallback({ id: 1, url: 'chrome://extensions' });
            expect(mockChrome.scripting.executeScript).not.toHaveBeenCalled();

            await actionClickCallback({ id: 1, url: 'about:blank' });
            expect(mockChrome.scripting.executeScript).not.toHaveBeenCalled();
        });

        test('should inject scripts for valid URLs', async () => {
            mockChrome.scripting.executeScript.mockResolvedValue([]);
            mockChrome.tabs.executeScript = jest.fn((tabId, opts, cb) => { if (cb) cb(); });

            await actionClickCallback({ id: 1, url: 'https://example.com/page' });

            expect(mockChrome.scripting.executeScript).toHaveBeenCalledTimes(2);
        });

        test('should skip when tab has no id', async () => {
            await actionClickCallback({ url: 'https://example.com/page' });
            expect(mockChrome.scripting.executeScript).not.toHaveBeenCalled();
        });

        test('should fall back to tabs.executeScript sequentially when scripting API is missing', async () => {
            // simulate MV2/Firefox by removing the scripting API
            delete mockChrome.scripting;
            const injected = [];
            mockChrome.tabs.executeScript = jest.fn((tabId, opts, cb) => {
                injected.push(opts.file);
                if (cb) cb();
            });

            await actionClickCallback({ id: 1, url: 'https://example.com/page' });

            expect(injected).toEqual([
                'src/messaging.js',
                'src/rules.js',
                'src/scraping.js',
                'src/panel.js'
            ]);
        });

        test('should log an error when tabs.executeScript fails with runtime.lastError', async () => {
            delete mockChrome.scripting;
            mockChrome.tabs.executeScript = jest.fn((tabId, opts, cb) => {
                chrome.runtime.lastError = { message: 'injection failed' };
                if (cb) cb();
            });
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

            await actionClickCallback({ id: 1, url: 'https://example.com/page' });

            expect(consoleError).toHaveBeenCalledWith(
                expect.stringContaining('Error injecting panel:'),
                expect.any(Error)
            );
            consoleError.mockRestore();
        });
    });

    describe('Extension Installation Handler', () => {
        test('should have onInstalled listener registered', () => {
            expect(onInstalledCallback).toBeDefined();
        });

        test('should initialize DB on install', async () => {
            const dbInitSpy = jest.spyOn(global.Lidar.db, 'initDB');
            dbInitSpy.mockResolvedValue({});

            await onInstalledCallback({ reason: 'install' });

            expect(dbInitSpy).toHaveBeenCalled();
            dbInitSpy.mockRestore();
        });
    });
});
