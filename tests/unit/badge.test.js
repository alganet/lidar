// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for badge.js module

describe('Badge Module (badge.js)', () => {
    beforeAll(() => {
        // Set up global context for browser extension
        global.self = global;
        
        // Load the badge module
        require('../../src/badge.js');
    });
    
    describe('updateBadge', () => {
        let mockChromeApi;
        let mockBadgeApi;
        
        beforeEach(() => {
            // Create fresh mocks for each test
            mockBadgeApi = {
                setBadgeText: jest.fn(),
                setBadgeBackgroundColor: jest.fn()
            };
            
            mockChromeApi = {
                action: mockBadgeApi,
                browserAction: mockBadgeApi
            };
        });
        
        test.each([
            [5, '5'],
            [0, ''],
            [42, '42'],
            [-1, ''],
            [999999, '999999']
        ])('should update badge text for count %i', (count, expectedText) => {
            const tabId = 123;

            Lidar.badge.updateBadge(count, tabId, mockChromeApi);

            expect(mockBadgeApi.setBadgeText).toHaveBeenCalledWith({
                text: expectedText,
                tabId: tabId
            });
        });

        test('should use correct color code', () => {
            const count = 1;
            const tabId = 303;

            Lidar.badge.updateBadge(count, tabId, mockChromeApi);

            expect(mockBadgeApi.setBadgeBackgroundColor).toHaveBeenCalledWith({
                color: '#34d399',
                tabId: tabId
            });
        });
        
        test('should use MV2 API when browserAction is available', () => {
            const count = 3;
            const tabId = 404;
            
            // Create a mock that doesn't support tabId parameters
            const mv2BadgeApi = {
                setBadgeText: jest.fn((options) => {
                    if (options.tabId !== undefined) {
                        throw new Error('Invalid parameter');
                    }
                }),
                setBadgeBackgroundColor: jest.fn()
            };
            
            // Remove action and use MV2 badge API
            mockChromeApi.action = undefined;
            mockChromeApi.browserAction = mv2BadgeApi;
            
            Lidar.badge.updateBadge(count, tabId, mockChromeApi);
            
            expect(mv2BadgeApi.setBadgeText).toHaveBeenCalledWith({
                text: '3'
            });
            expect(mv2BadgeApi.setBadgeBackgroundColor).toHaveBeenCalledWith({
                color: '#34d399'
            });
        });
        
        test('should use MV2 fallback when setBadgeText has fewer parameters', () => {
            const count = 7;
            const tabId = 505;
            
            // Mock MV2 API with length <= 1 (no tabId support)
            Object.defineProperty(mockBadgeApi.setBadgeText, 'length', { value: 1 });
            // Ensure no chromeApi.action to force MV2 fallback
            delete mockChromeApi.action;
            
            Lidar.badge.updateBadge(count, tabId, mockChromeApi);
            
            expect(mockBadgeApi.setBadgeText).toHaveBeenCalledWith({ text: '7' });
            expect(mockBadgeApi.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#34d399' });
        });
        
        test('should handle missing tabId parameter', () => {
            const count = 8;
            
            Lidar.badge.updateBadge(count, null, mockChromeApi);
            
            expect(mockBadgeApi.setBadgeText).toHaveBeenCalledWith({
                text: '8',
                tabId: null
            });
            expect(mockBadgeApi.setBadgeBackgroundColor).toHaveBeenCalledWith({
                color: '#34d399',
                tabId: null
            });
        });
        
        test('should handle undefined chromeApi parameter', () => {
            const count = 9;
            const tabId = 606;
            
            expect(() => {
                Lidar.badge.updateBadge(count, tabId, undefined);
            }).toThrow();
        });
        
        test('should handle missing chromeApi parameter', () => {
            const count = 10;
            const tabId = 707;
            
            expect(() => {
                Lidar.badge.updateBadge(count, tabId);
            }).toThrow();
        });
    });
    
    describe('clearBadge', () => {
        let mockChromeApi;
        let mockBadgeApi;
        
        beforeEach(() => {
            // Create fresh mocks for each test
            mockBadgeApi = {
                setBadgeText: jest.fn()
            };
            
            mockChromeApi = {
                action: mockBadgeApi,
                browserAction: mockBadgeApi
            };
        });
        
        test.each([
            ['MV3 (chrome.action)', 123, true, { text: '', tabId: 123 }],
            ['MV2 (browserAction)', 456, false, { text: '' }],
            ['MV2 fallback (length <= 1)', 789, false, { text: '' }]
        ])('should clear badge text for %s', (description, tabId, useAction, expectedCall) => {
            if (!useAction) {
                // Set up MV2-style API
                const mv2BadgeApi = {
                    setBadgeText: jest.fn()
                };

                if (description.includes('browserAction')) {
                    // True MV2 mock
                    mockChromeApi.action = undefined;
                    mockChromeApi.browserAction = mv2BadgeApi;
                    Object.defineProperty(mv2BadgeApi.setBadgeText, 'length', { value: 1 });
                } else {
                    // MV2 fallback
                    Object.defineProperty(mockBadgeApi.setBadgeText, 'length', { value: 1 });
                    delete mockChromeApi.action;
                }
            }

            Lidar.badge.clearBadge(tabId, mockChromeApi);

            if (description.includes('browserAction')) {
                expect(mockChromeApi.browserAction.setBadgeText).toHaveBeenCalledWith(expectedCall);
            } else {
                expect(mockBadgeApi.setBadgeText).toHaveBeenCalledWith(expectedCall);
            }
        });
        
        test('should handle missing tabId parameter', () => {
            Lidar.badge.clearBadge(null, mockChromeApi);
            
            expect(mockBadgeApi.setBadgeText).toHaveBeenCalledWith({
                text: '',
                tabId: null
            });
        });
        
        test('should handle undefined chromeApi parameter', () => {
            const tabId = 101;
            
            expect(() => {
                Lidar.badge.clearBadge(tabId, undefined);
            }).toThrow();
        });
        
        test('should handle missing chromeApi parameter', () => {
            const tabId = 202;
            
            expect(() => {
                Lidar.badge.clearBadge(tabId);
            }).toThrow();
        });
        
        test('should not call setBadgeBackgroundColor', () => {
            const tabId = 303;
            const setBadgeTextSpy = jest.spyOn(mockBadgeApi, 'setBadgeText');
            
            Lidar.badge.clearBadge(tabId, mockChromeApi);
            
            expect(setBadgeTextSpy).toHaveBeenCalled();
            // clearBadge should not call setBadgeBackgroundColor
            expect(mockBadgeApi.setBadgeBackgroundColor).toBeUndefined();
        });
    });
    
    describe('Cross-browser compatibility', () => {
        test('should work with MV3 Chrome API structure', () => {
            const mockChromeApi = {
                action: {
                    setBadgeText: jest.fn(),
                    setBadgeBackgroundColor: jest.fn()
                }
            };
            
            Lidar.badge.updateBadge(5, 123, mockChromeApi);
            
            expect(mockChromeApi.action.setBadgeText).toHaveBeenCalledWith({
                text: '5',
                tabId: 123
            });
        });
        
        test('should work with MV2 Chrome API structure', () => {
            const mockChromeApi = {
                browserAction: {
                    setBadgeText: jest.fn(),
                    setBadgeBackgroundColor: jest.fn()
                }
            };
            
            // For MV2 with browserAction and no action API, use MV2 style (no tabId)
            Object.defineProperty(mockChromeApi.browserAction.setBadgeText, 'length', { value: 1 });
            
            Lidar.badge.updateBadge(5, 123, mockChromeApi);
            
            // For MV2 with browserAction, it should use MV2 style (no tabId)
            expect(mockChromeApi.browserAction.setBadgeText).toHaveBeenCalledWith({
                text: '5'
            });
        });
        
        test('should work with both action and browserAction available', () => {
            const mockChromeApi = {
                action: {
                    setBadgeText: jest.fn(),
                    setBadgeBackgroundColor: jest.fn()
                },
                browserAction: {
                    setBadgeText: jest.fn(),
                    setBadgeBackgroundColor: jest.fn()
                }
            };
            
            Lidar.badge.updateBadge(5, 123, mockChromeApi);
            
            // Should prefer action over browserAction
            expect(mockChromeApi.action.setBadgeText).toHaveBeenCalled();
            expect(mockChromeApi.browserAction.setBadgeText).not.toHaveBeenCalled();
        });
    });
    
    describe('Module exports', () => {
        test('should export badge module', () => {
            expect(Lidar.badge).toBeDefined();
        });
        
        test('should export updateBadge function', () => {
            expect(Lidar.badge).toHaveProperty('updateBadge');
            expect(typeof Lidar.badge.updateBadge).toBe('function');
        });
        
        test('should export clearBadge function', () => {
            expect(Lidar.badge).toHaveProperty('clearBadge');
            expect(typeof Lidar.badge.clearBadge).toBe('function');
        });
        
        test('should export functions as callable', () => {
            expect(typeof Lidar.badge.updateBadge).toBe('function');
            expect(typeof Lidar.badge.clearBadge).toBe('function');
        });
    });
});