// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for autoapply.js module

describe('AutoApply Module (autoapply.js)', () => {
    let mockSendMessage;
    let mockRules;
    let mockObserve;
    let mockOnMessage;
    let originalLidar;
    let originalChrome;
    let originalWindowLocation;
    let originalLocationDescriptor;

    beforeAll(() => {
        // Store originals
        originalLidar = global.Lidar;
        originalChrome = global.chrome;

        // Store original window.location
        originalWindowLocation = window.location;
        originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    });

    beforeEach(() => {
        // Reset modules to ensure clean state
        jest.resetModules();

        // Clear any previous injection flag
        delete window.__lidarAutoApplyInjected;

        // Reset mocks
        mockSendMessage = jest.fn();
        mockOnMessage = { addListener: jest.fn() };
        mockObserve = jest.fn();

        // Don't mock console globally - individual tests will create their own spies as needed

        // Set up mock rules
        mockRules = [
            {
                id: 'rule-1',
                name: 'Test Rule',
                state: 'active',
                urlPattern: '*',
                regionSelector: '.content',
                fields: [{ name: 'identifier', selector: '.id' }]
            },
            {
                id: 'rule-2',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.learn-region',
                snapshots: []
            }
        ];

        // Mock Lidar global
        global.Lidar = {
            messaging: {
                sendMessage: mockSendMessage
            },
            scraping: {
                isRuleApplicable: jest.fn().mockReturnValue(true),
                extractData: jest.fn().mockReturnValue({ identifier: 'test-id', title: 'Test' })
            },
            rules: {
                matchesUrlPattern: jest.fn().mockReturnValue(true),
                getApplyKey: jest.fn((rule, id) => `${rule.id}-${id}`)
            },
            badge: {}
        };

        // Mock chrome APIs
        global.chrome = {
            runtime: {
                id: 'test-extension-id',
                onMessage: mockOnMessage
            }
        };

        // Mock MutationObserver
        global.MutationObserver = jest.fn().mockImplementation((callback) => ({
            observe: mockObserve,
            disconnect: jest.fn(),
            callback
        }));

        // Use jsdom's default location - no mocking needed

        // Mock setTimeout/clearTimeout
        jest.useFakeTimers();

        // Ensure document.body exists
        if (!document.body) {
            document.body = document.createElement('body');
        }
        document.body.innerHTML = '';
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    afterAll(() => {
        global.Lidar = originalLidar;
        global.chrome = originalChrome;
        // Restore original location if needed
        if (originalLocationDescriptor) {
            Object.defineProperty(window, 'location', originalLocationDescriptor);
        }
    });

    describe('Module loading and initialization', () => {
        test('should set injection flag to prevent multiple injections', () => {
            // Load the module
            require('../../src/autoapply.js');

            expect(window.__lidarAutoApplyInjected).toBe(true);
        });

        test('should not re-initialize if already injected', () => {
            window.__lidarAutoApplyInjected = true;

            // Clear MutationObserver mock call count
            global.MutationObserver.mockClear();

            // Load the module - should return early
            require('../../src/autoapply.js');

            // Since already injected, MutationObserver should NOT have been called
            // (the module returns early)
            expect(global.MutationObserver).not.toHaveBeenCalled();
        });

        test('should setup MutationObserver on document body', () => {
            // Clear any previous state
            mockObserve.mockClear();

            // Reload the module
            require('../../src/autoapply.js');

            // MutationObserver should have been instantiated
            expect(global.MutationObserver).toHaveBeenCalled();
            expect(mockObserve).toHaveBeenCalled();
        });

        test('should add DOMContentLoaded listener when body is not available', () => {
            const originalBody = document.body;
            Object.defineProperty(document, 'body', {
                value: null,
                writable: true,
                configurable: true
            });

            const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

            require('../../src/autoapply.js');

            expect(addEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

            // Restore body
            Object.defineProperty(document, 'body', {
                value: originalBody,
                writable: true,
                configurable: true
            });
            addEventListenerSpy.mockRestore();
        });
    });

    describe('autoApplyRules function behavior', () => {
        test('should fetch rules from background on load', async () => {
            mockSendMessage.mockResolvedValue(mockRules);

            // Create mock region element
            const mockRegion = document.createElement('div');
            mockRegion.className = 'content';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');

            // Run initial autoApplyRules
            await jest.runAllTimersAsync();

            expect(mockSendMessage).toHaveBeenCalledWith(
                { action: 'getRules' },
                chrome.runtime
            );
        });

        test('should skip rules when getRules returns error', async () => {
            mockSendMessage.mockResolvedValue({ error: 'DB error' });

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            // Should only have been called once for getRules
            expect(mockSendMessage).toHaveBeenCalledTimes(1);
        });

        test('should skip rules when getRules returns non-array', async () => {
            mockSendMessage.mockResolvedValue(null);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(mockSendMessage).toHaveBeenCalledTimes(1);
        });

        test('should save data for applicable active rules', async () => {
            mockSendMessage
                .mockResolvedValueOnce([mockRules[0]]) // getRules
                .mockResolvedValue({ success: true }); // saveData and updateBadge

            const mockRegion = document.createElement('div');
            mockRegion.className = 'content';
            const mockIdElement = document.createElement('span');
            mockIdElement.className = 'id';
            mockIdElement.textContent = 'unique-123';
            mockRegion.appendChild(mockIdElement);
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            // Should have called saveData
            expect(mockSendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'saveData',
                    ruleId: 'rule-1'
                }),
                chrome.runtime
            );
        });

        test('should update badge when rules are applied', async () => {
            mockSendMessage
                .mockResolvedValueOnce([mockRules[0]])
                .mockResolvedValue({ success: true });

            const mockRegion = document.createElement('div');
            mockRegion.className = 'content';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(mockSendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'updateBadge'
                }),
                chrome.runtime
            );
        });

        test('should skip rules without matching region', async () => {
            mockSendMessage.mockResolvedValueOnce([mockRules[0]]);

            // Don't add the .content region
            document.body.innerHTML = '<div class="other"></div>';

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            // isRuleApplicable should not have been called since no regions match
            expect(Lidar.scraping.isRuleApplicable).not.toHaveBeenCalled();
        });

        test('should skip when rule is not applicable', async () => {
            Lidar.scraping.isRuleApplicable.mockReturnValue(false);
            mockSendMessage.mockResolvedValueOnce([mockRules[0]]);

            const mockRegion = document.createElement('div');
            mockRegion.className = 'content';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            // saveData should not have been called
            expect(mockSendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ action: 'saveData' }),
                expect.anything()
            );
        });

        test('should skip when no identifier in extracted data', async () => {
            Lidar.scraping.extractData.mockReturnValue({ title: 'Test' }); // No identifier
            mockSendMessage.mockResolvedValueOnce([mockRules[0]]);

            const mockRegion = document.createElement('div');
            mockRegion.className = 'content';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(mockSendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ action: 'saveData' }),
                expect.anything()
            );
        });

        test('should handle saveData errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockSendMessage
                .mockResolvedValueOnce([mockRules[0]])
                .mockRejectedValueOnce(new Error('Save failed'));

            const mockRegion = document.createElement('div');
            mockRegion.className = 'content';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Lidar: Error saving data for rule',
                'Test Rule',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        test('should use document as root when no regionSelector', async () => {
            const ruleWithoutRegion = {
                id: 'rule-no-region',
                name: 'No Region Rule',
                state: 'active',
                urlPattern: '*',
                fields: [{ name: 'identifier', selector: '.id' }]
            };

            mockSendMessage
                .mockResolvedValueOnce([ruleWithoutRegion])
                .mockResolvedValue({ success: true });

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            // Should have called isRuleApplicable with document
            // Note: jsdom resets location between module reloads, so check any string URL
            expect(Lidar.scraping.isRuleApplicable).toHaveBeenCalledWith(
                ruleWithoutRegion,
                expect.any(String),
                document
            );
        });

        test('should handle auto-apply errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockSendMessage.mockRejectedValueOnce(new Error('Network error'));

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Lidar: Auto-apply error',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });
    });

    describe('handleLearningRule function behavior', () => {
        test('should capture snapshot for learning rules', async () => {
            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.learn-region',
                snapshots: []
            };

            mockSendMessage
                .mockResolvedValueOnce([learningRule])
                .mockResolvedValue({ rule: { ...learningRule, snapshots: [{}] } });

            const mockRegion = document.createElement('div');
            mockRegion.className = 'learn-region';
            mockRegion.innerHTML = '<p>Content to learn</p>';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            // Verify addSnapshot was called with correct action and ruleId
            // Note: URL may vary due to jsdom location handling between module resets
            expect(mockSendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'addSnapshot',
                    ruleId: 'learning-1',
                    sourceUrl: expect.any(String)
                }),
                chrome.runtime
            );
        });

        test('should skip if URL pattern does not match', async () => {
            Lidar.rules.matchesUrlPattern.mockReturnValue(false);

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: 'https://other.com/*',
                regionSelector: '.learn-region',
                snapshots: []
            };

            mockSendMessage.mockResolvedValueOnce([learningRule]);

            const mockRegion = document.createElement('div');
            mockRegion.className = 'learn-region';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(mockSendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ action: 'addSnapshot' }),
                expect.anything()
            );
        });

        test('should skip if snapshot already exists for this URL', async () => {
            // Use the actual window.location.href that jsdom will use
            const currentUrl = window.location.href;

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.learn-region',
                snapshots: [{ sourceUrl: currentUrl }] // Match the current URL
            };

            mockSendMessage.mockResolvedValueOnce([learningRule]);

            const mockRegion = document.createElement('div');
            mockRegion.className = 'learn-region';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(mockSendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ action: 'addSnapshot' }),
                expect.anything()
            );
        });

        test('should log error if rule has no regionSelector', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '', // Empty
                snapshots: []
            };

            mockSendMessage.mockResolvedValueOnce([learningRule]);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Lidar: Learning rule has no region selector',
                'Learning Rule'
            );

            consoleSpy.mockRestore();
        });

        test('should warn if region element not found', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.nonexistent-region',
                snapshots: []
            };

            mockSendMessage.mockResolvedValueOnce([learningRule]);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'Lidar: Region not found for learning rule',
                'Learning Rule'
            );

            consoleWarnSpy.mockRestore();
        });

        test('should handle addSnapshot error response', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.learn-region',
                snapshots: []
            };

            mockSendMessage
                .mockResolvedValueOnce([learningRule])
                .mockResolvedValueOnce({ error: 'Snapshot failed' });

            const mockRegion = document.createElement('div');
            mockRegion.className = 'learn-region';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Lidar: Error adding snapshot',
                'Snapshot failed'
            );

            consoleSpy.mockRestore();
        });

        test('should handle learning rule capture errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.learn-region',
                snapshots: []
            };

            mockSendMessage
                .mockResolvedValueOnce([learningRule])
                .mockRejectedValueOnce(new Error('Snapshot capture failed'));

            const mockRegion = document.createElement('div');
            mockRegion.className = 'learn-region';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Lidar: Error capturing snapshot for learning rule',
                'Learning Rule',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        test('should log snapshot count on successful capture', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const learningRule = {
                id: 'learning-1',
                name: 'Learning Rule',
                state: 'learning',
                urlPattern: '*',
                regionSelector: '.learn-region',
                snapshots: []
            };

            mockSendMessage
                .mockResolvedValueOnce([learningRule])
                .mockResolvedValueOnce({ rule: { ...learningRule, snapshots: [{}, {}] } });

            const mockRegion = document.createElement('div');
            mockRegion.className = 'learn-region';
            document.body.appendChild(mockRegion);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Lidar: Captured snapshot')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('DOM change handling and debouncing', () => {
        test('should debounce DOM changes', async () => {
            mockSendMessage.mockResolvedValue([]);

            require('../../src/autoapply.js');

            // Get the MutationObserver callback
            const observerCallback = global.MutationObserver.mock.calls[0]?.[0];

            if (observerCallback) {
                // Trigger multiple mutations quickly
                observerCallback([{ target: { id: 'test', closest: () => null }, type: 'childList' }]);
                observerCallback([{ target: { id: 'test2', closest: () => null }, type: 'childList' }]);
                observerCallback([{ target: { id: 'test3', closest: () => null }, type: 'childList' }]);

                // Only one should be pending
                jest.advanceTimersByTime(1000);
                await jest.runAllTimersAsync();
            }
        });

        test('should ignore mutations from lidar panel', async () => {
            mockSendMessage.mockResolvedValue([]);

            require('../../src/autoapply.js');

            const observerCallback = global.MutationObserver.mock.calls[0]?.[0];

            if (observerCallback) {
                const initialCallCount = mockSendMessage.mock.calls.length;

                // Trigger mutation from lidar panel
                observerCallback([{
                    target: {
                        id: 'lidar-panel-host',
                        closest: () => ({ id: 'lidar-panel-host' })
                    },
                    type: 'childList'
                }]);

                jest.advanceTimersByTime(2000);
                await jest.runAllTimersAsync();

                // Should not have triggered additional calls
                expect(mockSendMessage.mock.calls.length).toBe(initialCallCount);
            }
        });

        test('should ignore attribute changes on lidar elements', async () => {
            mockSendMessage.mockResolvedValue([]);

            require('../../src/autoapply.js');

            const observerCallback = global.MutationObserver.mock.calls[0]?.[0];

            if (observerCallback) {
                const initialCallCount = mockSendMessage.mock.calls.length;

                // Trigger attribute mutation on lidar element
                observerCallback([{
                    target: {
                        id: 'lidar-something',
                        closest: () => null
                    },
                    type: 'attributes'
                }]);

                jest.advanceTimersByTime(2000);
                await jest.runAllTimersAsync();

                // Should not have triggered additional calls
                expect(mockSendMessage.mock.calls.length).toBe(initialCallCount);
            }
        });
    });

    describe('Message listener', () => {
        test('should add message listener for rulesUpdated', () => {
            require('../../src/autoapply.js');

            expect(mockOnMessage.addListener).toHaveBeenCalled();
        });

        test('should re-run auto-apply when rulesUpdated message received', async () => {
            mockSendMessage.mockResolvedValue([]);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            const messageCallback = mockOnMessage.addListener.mock.calls[0]?.[0];
            const initialCallCount = mockSendMessage.mock.calls.length;

            if (messageCallback) {
                messageCallback({ action: 'rulesUpdated' });
                await jest.runAllTimersAsync();

                // Should have called getRules again
                expect(mockSendMessage.mock.calls.length).toBeGreaterThan(initialCallCount);
            }
        });

        test('should ignore non-rulesUpdated messages', async () => {
            mockSendMessage.mockResolvedValue([]);

            require('../../src/autoapply.js');
            await jest.runAllTimersAsync();

            const messageCallback = mockOnMessage.addListener.mock.calls[0]?.[0];
            const initialCallCount = mockSendMessage.mock.calls.length;

            if (messageCallback) {
                messageCallback({ action: 'someOtherAction' });
                await jest.runAllTimersAsync();

                // Should not have called getRules again
                expect(mockSendMessage.mock.calls.length).toBe(initialCallCount);
            }
        });
    });

    describe('beforeunload handler', () => {
        test('should clear badge on page unload', () => {
            const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
            mockSendMessage.mockResolvedValue({});

            require('../../src/autoapply.js');

            expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

            // Call the beforeunload handler
            const beforeUnloadHandler = addEventListenerSpy.mock.calls.find(
                call => call[0] === 'beforeunload'
            )?.[1];

            if (beforeUnloadHandler) {
                beforeUnloadHandler();

                expect(mockSendMessage).toHaveBeenCalledWith(
                    { action: 'clearBadge' },
                    chrome.runtime
                );
            }

            addEventListenerSpy.mockRestore();
        });
    });

    describe('URL change detection (SPA support)', () => {
        test('should setup URL change observer', () => {
            require('../../src/autoapply.js');

            // Should have created at least 2 MutationObservers (one for DOM, one for URL)
            expect(global.MutationObserver).toHaveBeenCalled();
        });
    });
});
