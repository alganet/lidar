// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for background.js module

describe('Background Service Worker (background.js)', () => {
    let mockDb;
    let mockBadge;
    let mockSendResponse;
    let mockSender;
    let importScriptsSpy;

    // Store message handlers for testing
    let messageHandler;
    let installedHandler;
    let browserActionHandler;

    beforeEach(() => {
        // Mock importScripts (for service worker context)
        global.importScripts = jest.fn();
        importScriptsSpy = global.importScripts;

        // Mock indexedDB
        global.indexedDB = {};

        // Mock crypto
        global.crypto = {
            randomUUID: jest.fn(() => 'mock-uuid-123')
        };


        // Mock DB methods
        mockDb = {
            initDB: jest.fn().mockResolvedValue(undefined),
            getRules: jest.fn().mockResolvedValue([]),
            getRule: jest.fn().mockResolvedValue(null),
            createRule: jest.fn().mockResolvedValue({ id: 'new-rule' }),
            updateRule: jest.fn().mockResolvedValue({ id: 'updated-rule' }),
            deleteRule: jest.fn().mockResolvedValue(true),
            saveData: jest.fn().mockResolvedValue({ id: 'saved-data' }),
            getDataByRule: jest.fn().mockResolvedValue([]),
            deleteData: jest.fn().mockResolvedValue(true),
            deleteDataByRule: jest.fn().mockResolvedValue(true),
            addSnapshot: jest.fn().mockResolvedValue({ id: 'rule-with-snapshot' }),
            resolveRule: jest.fn().mockResolvedValue({ id: 'resolved-rule' })
        };

        // Mock Badge methods
        mockBadge = {
            updateBadge: jest.fn(),
            clearBadge: jest.fn()
        };

        // Set up Lidar global
        global.Lidar = {
            db: mockDb,
            badge: mockBadge,
            messaging: {},
            rules: {},
            scraping: {}
        };

        // Mock chrome APIs
        global.chrome = {
            runtime: {
                id: 'test-extension-id',
                onMessage: {
                    addListener: jest.fn(handler => {
                        messageHandler = handler;
                    })
                },
                onInstalled: {
                    addListener: jest.fn(handler => {
                        installedHandler = handler;
                    })
                }
            },
            action: {
                onClicked: {
                    addListener: jest.fn(handler => {
                        browserActionHandler = handler;
                    })
                }
            },
            tabs: {
                query: jest.fn((query, callback) => callback([])),
                sendMessage: jest.fn()
            },
            scripting: {
                executeScript: jest.fn().mockResolvedValue([])
            }
        };

        // Mock sender for message handling
        mockSender = {
            tab: { id: 123 }
        };

        // Mock sendResponse
        mockSendResponse = jest.fn();

        // Reset modules to ensure clean state
        jest.resetModules();
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('Script loading', () => {
        test('should load required scripts via importScripts', () => {
            require('../../src/background.js');

            expect(importScriptsSpy).toHaveBeenCalledWith(
                'global.js', 'rules.js', 'scraping.js', 'fieldDetection.js', 'db.js', 'badge.js'
            );
        });

        test('should handle importScripts failure gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            global.importScripts = jest.fn(() => {
                throw new Error('Failed to load scripts');
            });

            // Should not throw
            expect(() => require('../../src/background.js')).not.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Lidar: Failed to load background scripts:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Message handler registration', () => {
        test('should register message listener on chrome.runtime.onMessage', () => {
            require('../../src/background.js');

            expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
            expect(messageHandler).toBeDefined();
        });

        test('should return true for async response handling', () => {
            require('../../src/background.js');

            const result = window.__lidarBackgroundMessageHandler({ action: 'getRules' }, mockSender, mockSendResponse);

            expect(result).toBe(true);
        });
    });

    describe('getRules action', () => {
        test('should call Lidar.db.getRules', async () => {
            const mockRules = [{ id: 'rule-1', name: 'Test' }];
            mockDb.getRules.mockResolvedValue(mockRules);

            require('../../src/background.js');

            window.__lidarBackgroundMessageHandler({ action: 'getRules' }, mockSender, mockSendResponse);

            // Wait for async handler
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.getRules).toHaveBeenCalledWith(indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(mockRules);
        });
    });

    describe('getRule action', () => {
        test('should call Lidar.db.getRule with id', async () => {
            const mockRule = { id: 'rule-1', name: 'Test Rule' };
            mockDb.getRule.mockResolvedValue(mockRule);

            require('../../src/background.js');

            window.__lidarBackgroundMessageHandler({ action: 'getRule', id: 'rule-1' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.getRule).toHaveBeenCalledWith('rule-1', indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(mockRule);
        });
    });

    describe('createRule action', () => {
        test('should call Lidar.db.createRule and broadcast update', async () => {
            const newRule = { name: 'New Rule' };
            const createdRule = { id: 'new-id', name: 'New Rule' };
            mockDb.createRule.mockResolvedValue(createdRule);

            require('../../src/background.js');

            messageHandler({ action: 'createRule', rule: newRule }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.createRule).toHaveBeenCalledWith(newRule, indexedDB, crypto);
            expect(mockSendResponse).toHaveBeenCalledWith(createdRule);
            expect(chrome.tabs.query).toHaveBeenCalled(); // broadcastRulesUpdated
        });
    });

    describe('updateRule action', () => {
        test('should call Lidar.db.updateRule and broadcast update', async () => {
            const updatedRule = { id: 'rule-1', name: 'Updated Rule' };
            mockDb.updateRule.mockResolvedValue(updatedRule);

            require('../../src/background.js');

            messageHandler({ action: 'updateRule', rule: updatedRule }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.updateRule).toHaveBeenCalledWith(updatedRule, indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(updatedRule);
            expect(chrome.tabs.query).toHaveBeenCalled();
        });
    });

    describe('deleteRule action', () => {
        test('should call Lidar.db.deleteRule and broadcast update', async () => {
            mockDb.deleteRule.mockResolvedValue(true);

            require('../../src/background.js');

            messageHandler({ action: 'deleteRule', id: 'rule-to-delete' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.deleteRule).toHaveBeenCalledWith('rule-to-delete', indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(true);
            expect(chrome.tabs.query).toHaveBeenCalled();
        });
    });

    describe('saveData action', () => {
        test('should call Lidar.db.saveData with all parameters', async () => {
            const savedData = { id: 'data-1' };
            mockDb.saveData.mockResolvedValue(savedData);

            require('../../src/background.js');

            messageHandler({
                action: 'saveData',
                ruleId: 'rule-1',
                ruleName: 'Test Rule',
                data: { title: 'Test' },
                sourceUrl: 'https://example.com'
            }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.saveData).toHaveBeenCalledWith(
                'rule-1',
                'Test Rule',
                { title: 'Test' },
                'https://example.com',
                indexedDB,
                crypto
            );
            expect(mockSendResponse).toHaveBeenCalledWith(savedData);
        });
    });

    describe('getDataByRule action', () => {
        test('should call Lidar.db.getDataByRule with ruleId', async () => {
            const mockData = [{ id: 'data-1' }];
            mockDb.getDataByRule.mockResolvedValue(mockData);

            require('../../src/background.js');

            messageHandler({ action: 'getDataByRule', ruleId: 'rule-1' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.getDataByRule).toHaveBeenCalledWith('rule-1', indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(mockData);
        });
    });

    describe('deleteData action', () => {
        test('should call Lidar.db.deleteData with id', async () => {
            mockDb.deleteData.mockResolvedValue(true);

            require('../../src/background.js');

            messageHandler({ action: 'deleteData', id: 'data-1' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.deleteData).toHaveBeenCalledWith('data-1', indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(true);
        });
    });

    describe('deleteDataByRule action', () => {
        test('should call Lidar.db.deleteDataByRule with ruleId', async () => {
            mockDb.deleteDataByRule.mockResolvedValue(true);

            require('../../src/background.js');

            messageHandler({ action: 'deleteDataByRule', ruleId: 'rule-1' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.deleteDataByRule).toHaveBeenCalledWith('rule-1', indexedDB);
            expect(mockSendResponse).toHaveBeenCalledWith(true);
        });
    });

    describe('updateBadge action', () => {
        test('should call Lidar.badge.updateBadge with count and tab id', async () => {
            require('../../src/background.js');

            messageHandler({ action: 'updateBadge', count: 5 }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockBadge.updateBadge).toHaveBeenCalledWith(5, 123, chrome);
            expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
        });

        test('should use 0 as default count', async () => {
            require('../../src/background.js');

            messageHandler({ action: 'updateBadge' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockBadge.updateBadge).toHaveBeenCalledWith(0, 123, chrome);
        });

        test('should not call updateBadge if no tab id', async () => {
            const senderNoTab = { tab: null };

            require('../../src/background.js');

            messageHandler({ action: 'updateBadge', count: 5 }, senderNoTab, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockBadge.updateBadge).not.toHaveBeenCalled();
        });
    });

    describe('clearBadge action', () => {
        test('should call Lidar.badge.clearBadge with tab id', async () => {
            require('../../src/background.js');

            messageHandler({ action: 'clearBadge' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockBadge.clearBadge).toHaveBeenCalledWith(123, chrome);
            expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
        });

        test('should not call clearBadge if no tab id', async () => {
            const senderNoTab = { tab: null };

            require('../../src/background.js');

            messageHandler({ action: 'clearBadge' }, senderNoTab, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockBadge.clearBadge).not.toHaveBeenCalled();
        });
    });

    describe('addSnapshot action', () => {
        test('should call Lidar.db.addSnapshot and broadcast update', async () => {
            const updatedRule = { id: 'rule-1', snapshots: [{}] };
            mockDb.addSnapshot.mockResolvedValue(updatedRule);

            require('../../src/background.js');

            messageHandler({
                action: 'addSnapshot',
                ruleId: 'rule-1',
                regionHtml: '<div>Content</div>',
                sourceUrl: 'https://example.com/page'
            }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.addSnapshot).toHaveBeenCalledWith(
                'rule-1',
                '<div>Content</div>',
                'https://example.com/page',
                indexedDB
            );
            expect(mockSendResponse).toHaveBeenCalledWith({ rule: updatedRule });
            expect(chrome.tabs.query).toHaveBeenCalled();
        });
    });

    describe('resolveRule action', () => {
        test('should call Lidar.db.resolveRule and broadcast update', async () => {
            const resolvedRule = { id: 'rule-1', state: 'active' };
            mockDb.resolveRule.mockResolvedValue(resolvedRule);

            require('../../src/background.js');

            messageHandler({
                action: 'resolveRule',
                ruleId: 'rule-1',
                fields: [{ name: 'title', selector: '.title' }],
                identifier: 'id-field',
                urlPattern: 'https://example.com/*'
            }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.resolveRule).toHaveBeenCalledWith(
                'rule-1',
                [{ name: 'title', selector: '.title' }],
                'id-field',
                'https://example.com/*',
                indexedDB
            );
            expect(mockSendResponse).toHaveBeenCalledWith({ rule: resolvedRule });
            expect(chrome.tabs.query).toHaveBeenCalled();
        });
    });

    describe('rulesUpdated action', () => {
        test('should broadcast rulesUpdated to all tabs', async () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            require('../../src/background.js');

            messageHandler({ action: 'rulesUpdated' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(chrome.tabs.query).toHaveBeenCalled();
            expect(mockSendResponse).toHaveBeenCalledWith({ success: true });

            warnSpy.mockRestore();
        });
    });

    describe('Unknown action handling', () => {
        test('should return error for unknown action', async () => {
            require('../../src/background.js');

            messageHandler({ action: 'unknownAction' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockSendResponse).toHaveBeenCalledWith({
                error: 'Unknown action: unknownAction'
            });
        });
    });

    describe('Error handling', () => {
        test('should return error message when db operation fails', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockDb.getRules.mockRejectedValue(new Error('Database connection failed'));

            require('../../src/background.js');

            window.__lidarBackgroundMessageHandler({ action: 'getRules' }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockSendResponse).toHaveBeenCalledWith({
                error: 'Database connection failed'
            });
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('onInstalled handler', () => {
        test('should register onInstalled listener', () => {
            require('../../src/background.js');

            expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
        });

        test('should initialize DB on install', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            require('../../src/background.js');

            // Trigger the installed handler
            installedHandler();

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDb.initDB).toHaveBeenCalledWith(indexedDB);
            expect(consoleSpy).toHaveBeenCalledWith('Lidar: Database initialized');

            consoleSpy.mockRestore();
        });
    });

    describe('browserAction click handler', () => {
        test('should register browserAction click listener', () => {
            require('../../src/background.js');

            expect(chrome.action.onClicked.addListener).toHaveBeenCalled();
        });

        test('should inject scripts into tab on click', async () => {
            require('../../src/background.js');

            const mockTab = { id: 123, url: 'https://example.com/page' };

            await browserActionHandler(mockTab);

            expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
                target: { tabId: 123 },
                files: ['src/global.js', 'src/messaging.js', 'src/rules.js', 'src/scraping.js', 'src/fieldDetection.js']
            });
            expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
                target: { tabId: 123 },
                files: ['src/panel.js']
            });
        });

        test('should not inject into chrome:// URLs', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            require('../../src/background.js');

            const mockTab = { id: 123, url: 'chrome://extensions' };

            await browserActionHandler(mockTab);

            expect(consoleSpy).toHaveBeenCalledWith('Cannot inject into this page');
            expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        test('should not inject into chrome-extension:// URLs', async () => {
            require('../../src/background.js');

            const mockTab = { id: 123, url: 'chrome-extension://abc123/page.html' };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            await browserActionHandler(mockTab);

            expect(consoleSpy).toHaveBeenCalledWith('Cannot inject into this page');
            expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        test('should not inject into moz-extension:// URLs', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            require('../../src/background.js');

            const mockTab = { id: 123, url: 'moz-extension://abc123/page.html' };

            await browserActionHandler(mockTab);

            expect(consoleSpy).toHaveBeenCalledWith('Cannot inject into this page');
            expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        test('should not inject into tab without id', async () => {
            require('../../src/background.js');

            const mockTab = { url: 'https://example.com' }; // No id

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            await browserActionHandler(mockTab);

            expect(consoleSpy).toHaveBeenCalledWith('Cannot inject into this page');
            expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        test('should handle script injection errors', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Injection failed'));

            require('../../src/background.js');

            const mockTab = { id: 123, url: 'https://example.com' };
            await browserActionHandler(mockTab);

            expect(consoleSpy).toHaveBeenCalledWith('Error injecting panel:', expect.any(Error));

            consoleSpy.mockRestore();
        });

        test('should use MV2 fallback when chrome.scripting is not available', async () => {
            // Remove chrome.scripting to simulate MV2/Firefox
            delete chrome.scripting;
            chrome.tabs.executeScript = jest.fn((tabId, options, callback) => {
                callback?.();
            });

            require('../../src/background.js');

            const mockTab = { id: 123, url: 'https://example.com' };
            await browserActionHandler(mockTab);

            // Should have called executeScript for each file
            expect(chrome.tabs.executeScript).toHaveBeenCalled();
        });
    });

    describe('broadcastRulesUpdated helper', () => {
        test('should send rulesUpdated message to all tabs', async () => {
            const mockTabs = [
                { id: 1 },
                { id: 2 },
                { id: 3 }
            ];

            chrome.tabs.query.mockImplementation((query, callback) => callback(mockTabs));

            require('../../src/background.js');

            // Trigger an action that causes broadcast
            messageHandler({ action: 'createRule', rule: {} }, mockSender, mockSendResponse);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(chrome.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
        });

        test('should handle sendMessage errors gracefully', async () => {
            const mockTabs = [{ id: 1 }];

            chrome.tabs.query.mockImplementation((query, callback) => callback(mockTabs));
            chrome.tabs.sendMessage.mockImplementation(() => {
                throw new Error('Tab not available');
            });

            require('../../src/background.js');

            // Should not throw even when sendMessage fails
            expect(async () => {
                messageHandler({ action: 'createRule', rule: {} }, mockSender, mockSendResponse);
                await new Promise(resolve => setTimeout(resolve, 0));
            }).not.toThrow();
        });
    });

});
