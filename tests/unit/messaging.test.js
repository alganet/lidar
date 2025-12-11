// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for messaging.js module

describe('Messaging Module (messaging.js)', () => {
    beforeAll(() => {
        // Set up global context for browser extension
        global.self = global;
        
        // Set up Lidar global object
        global.Lidar = global.Lidar || {};
        
        // Load the messaging module
        require('../../src/messaging.js');
    });
    
    describe('sendMessage', () => {
        let mockRuntime;
        let testMessage;
        
        beforeEach(() => {
            // Create fresh mock runtime for each test
            mockRuntime = {
                sendMessage: jest.fn()
            };
            
            testMessage = {
                action: 'testAction',
                data: 'testData'
            };
        });
        
        test('should resolve promise when sendMessage succeeds', async () => {
            const mockResponse = { success: true, data: 'test response' };
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(testMessage, mockRuntime);
            
            expect(result).toEqual(mockResponse);
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(testMessage, expect.any(Function));
        });
        
        test('should reject promise when sendMessage fails', async () => {
            mockRuntime.lastError = { message: 'Connection failed' };
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback();
            });
            
            await expect(Lidar.messaging.sendMessage(testMessage, mockRuntime))
                .rejects.toThrow('Connection failed');
            
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(testMessage, expect.any(Function));
        });
        
        test('should handle null lastError gracefully', async () => {
            const mockResponse = { success: true };
            mockRuntime.lastError = null;
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(testMessage, mockRuntime);
            
            expect(result).toEqual(mockResponse);
        });
        
        test('should handle undefined lastError gracefully', async () => {
            const mockResponse = { success: true };
            mockRuntime.lastError = undefined;
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(testMessage, mockRuntime);
            
            expect(result).toEqual(mockResponse);
        });
        
        test('should pass correct message to sendMessage', async () => {
            const message = { action: 'getRules', id: '123' };
            const mockResponse = [];
            mockRuntime.sendMessage.mockImplementation((msg, callback) => {
                callback(mockResponse);
            });
            
            await Lidar.messaging.sendMessage(message, mockRuntime);
            
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(message, expect.any(Function));
        });
        
        test('should handle complex message objects', async () => {
            const complexMessage = {
                action: 'saveData',
                ruleId: 'rule-123',
                data: {
                    title: 'Test Title',
                    description: 'Test Description',
                    fields: [
                        { name: 'field1', selector: '.selector1' },
                        { name: 'field2', selector: '.selector2' }
                    ]
                },
                sourceUrl: 'https://example.com/page'
            };
            
            const mockResponse = { success: true, id: 'data-456' };
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(complexMessage, mockRuntime);
            
            expect(result).toEqual(mockResponse);
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(complexMessage, expect.any(Function));
        });
        
        test('should handle empty message object', async () => {
            const emptyMessage = {};
            const mockResponse = { success: true };
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(emptyMessage, mockRuntime);
            
            expect(result).toEqual(mockResponse);
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(emptyMessage, expect.any(Function));
        });
        
        test('should handle null message gracefully', async () => {
            const mockResponse = { success: true };
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(null, mockRuntime);
            
            expect(result).toEqual(mockResponse);
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(null, expect.any(Function));
        });
        
        test('should handle undefined message gracefully', async () => {
            const mockResponse = { success: true };
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });
            
            const result = await Lidar.messaging.sendMessage(undefined, mockRuntime);
            
            expect(result).toEqual(mockResponse);
            expect(mockRuntime.sendMessage).toHaveBeenCalledWith(undefined, expect.any(Function));
        });
        
        test('should reject when no runtime parameter is provided', async () => {
            await expect(Lidar.messaging.sendMessage(testMessage))
                .rejects.toThrow();
        });
        
        test('should handle various error message types', async () => {
            const errorTypes = [
                { message: 'Network error' },
                { message: 'Timeout occurred' },
                { message: 'Invalid permissions' },
                { message: '' },
                { message: null }
            ];
            
            for (const error of errorTypes) {
                mockRuntime.lastError = error;
                mockRuntime.sendMessage.mockImplementation((message, callback) => {
                    callback();
                });
                
                await expect(Lidar.messaging.sendMessage(testMessage, mockRuntime))
                    .rejects.toThrow();
            }
        });
        
        test('should handle async behavior correctly', async () => {
            let callOrder = [];
            mockRuntime.sendMessage.mockImplementation((message, callback) => {
                callOrder.push('sendMessage called');
                setTimeout(() => {
                    callOrder.push('callback called');
                    callback({ success: true });
                }, 10);
            });
            
            const promise = Lidar.messaging.sendMessage(testMessage, mockRuntime);
            
            // Promise should be pending immediately
            expect(callOrder).toEqual(['sendMessage called']);
            
            const result = await promise;
            
            // Callback should have been called
            expect(callOrder).toEqual(['sendMessage called', 'callback called']);
            expect(result).toEqual({ success: true });
        });
    });
    
    describe('Module exports', () => {
        test('should export messaging module', () => {
            expect(Lidar.messaging).toBeDefined();
        });
        
        test('should export sendMessage function', () => {
            expect(Lidar.messaging).toHaveProperty('sendMessage');
            expect(typeof Lidar.messaging.sendMessage).toBe('function');
        });
        
        test('should export sendMessage as callable function', () => {
            expect(typeof Lidar.messaging.sendMessage).toBe('function');
        });
    });
});