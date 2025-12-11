// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for rules.js module

describe('Rules Module (rules.js)', () => {
    beforeAll(() => {
        // Set up global context for browser extension
        global.self = global;
        global.Lidar = global.Lidar || {};
        
        // Load the rules module
        require('../../src/rules.js');
    });
    
    // Removed beforeEach that was causing issues
    
    describe('matchesUrlPattern', () => {
        test.each([
            ['', 'https://example.com', true],
            [null, 'https://example.com', true],
            [undefined, 'https://example.com', true],
            ['https://example.com', 'https://example.com', true],
            ['https://example.com', 'https://other.com', false],
            ['https://*.example.com', 'https://sub.example.com', true],
            ['https://*.example.com', 'https://test.sub.example.com', true],
            ['https://*.example.com', 'https://other.com', false],
            ['https://*.example.*', 'https://sub.example.com', true],
            ['https://*.example.*', 'https://sub.example.org', true],
            ['https://*.example.*', 'https://other.example.com', true],
            ['HTTPS://EXAMPLE.COM', 'https://example.com', true],
            ['https://example.com', 'HTTPS://EXAMPLE.COM', true],
            ['https://*.EXAMPLE.COM', 'https://sub.example.com', true],
            ['https://example.com/path?query=value', 'https://example.com/path?query=value', true],
            ['https://example.com/path?query=value', 'https://example.com/pathXquery=value', false],
            ['[invalid', 'https://example.com', false],
            ['(?:invalid', 'https://example.com', false],
            ['https://github.com/*', 'https://github.com/user/repo', true],
            ['https://github.com/*', 'https://github.com/user/repo/issues/1', true],
            ['https://github.com/*', 'https://gitlab.com/user/repo', false],
            ['https://*.google.com', 'https://docs.google.com', true],
            ['https://*.google.com', 'https://drive.google.com', true],
            ['https://*.google.com', 'https://google.com', false]
        ])('matchesUrlPattern(%s, %s) should be %s', (pattern, url, expected) => {
            expect(Lidar.rules.matchesUrlPattern(pattern, url)).toBe(expected);
        });
    });
    
    describe('sortRules', () => {
        test('should sort rules by applicability and then by name', () => {
            const rules = [
                { id: 1, name: 'Z Rule', isApplicable: false },
                { id: 2, name: 'A Rule', isApplicable: true },
                { id: 3, name: 'M Rule', isApplicable: true },
                { id: 4, name: 'B Rule', isApplicable: false }
            ];
            
            const sorted = Lidar.rules.sortRules(rules);
            
            expect(sorted).toHaveLength(4);
            expect(sorted[0].name).toBe('A Rule'); // Applicable, first alphabetically
            expect(sorted[1].name).toBe('M Rule'); // Applicable, second alphabetically
            expect(sorted[2].name).toBe('B Rule'); // Not applicable, first alphabetically
            expect(sorted[3].name).toBe('Z Rule'); // Not applicable, second alphabetically
        });
        
        test('should handle rules with only applicability difference', () => {
            const rules = [
                { id: 1, name: 'Rule A', isApplicable: false },
                { id: 2, name: 'Rule B', isApplicable: true }
            ];
            
            const sorted = Lidar.rules.sortRules(rules);
            
            expect(sorted[0].name).toBe('Rule B'); // Applicable comes first
            expect(sorted[1].name).toBe('Rule A'); // Not applicable comes second
        });
        
        test('should handle rules with only name difference', () => {
            const rules = [
                { id: 1, name: 'Z Rule', isApplicable: true },
                { id: 2, name: 'A Rule', isApplicable: true }
            ];
            
            const sorted = Lidar.rules.sortRules(rules);
            
            expect(sorted[0].name).toBe('A Rule');
            expect(sorted[1].name).toBe('Z Rule');
        });
        
        test('should not mutate original array', () => {
            const originalRules = [
                { id: 1, name: 'B Rule', isApplicable: true },
                { id: 2, name: 'A Rule', isApplicable: true }
            ];
            
            const originalOrder = [...originalRules];
            Lidar.rules.sortRules(originalRules);
            
            expect(originalRules).toEqual(originalOrder); // Original should be unchanged
        });
        
        test('should handle empty array', () => {
            const sorted = Lidar.rules.sortRules([]);
            expect(sorted).toEqual([]);
        });
        
        test('should handle single rule', () => {
            const rules = [{ id: 1, name: 'Only Rule', isApplicable: true }];
            const sorted = Lidar.rules.sortRules(rules);
            
            expect(sorted).toHaveLength(1);
            expect(sorted[0]).toEqual(rules[0]);
        });
    });
    
    describe('sortData', () => {
        test('should sort data by scrapedAt in descending order', () => {
            const data = [
                { id: 1, scrapedAt: '2025-01-01T10:00:00.000Z' },
                { id: 2, scrapedAt: '2025-01-01T12:00:00.000Z' },
                { id: 3, scrapedAt: '2025-01-01T08:00:00.000Z' }
            ];
            
            const sorted = Lidar.rules.sortData(data);
            
            expect(sorted).toHaveLength(3);
            expect(sorted[0].scrapedAt).toBe('2025-01-01T12:00:00.000Z'); // Latest first
            expect(sorted[1].scrapedAt).toBe('2025-01-01T10:00:00.000Z');
            expect(sorted[2].scrapedAt).toBe('2025-01-01T08:00:00.000Z'); // Earliest last
        });
        
        test('should handle missing scrapedAt values', () => {
            const data = [
                { id: 1, scrapedAt: '2025-01-01T10:00:00.000Z' },
                { id: 2, scrapedAt: null },
                { id: 3, scrapedAt: '2025-01-01T08:00:00.000Z' },
                { id: 4 } // undefined scrapedAt
            ];
            
            const sorted = Lidar.rules.sortData(data);
            
            expect(sorted[0].scrapedAt).toBe('2025-01-01T10:00:00.000Z');
            // The items with null/undefined scrapedAt should come last
            expect(sorted[sorted.length - 1].scrapedAt).toBeUndefined();
        });
        
        test('should not mutate original array', () => {
            const originalData = [
                { id: 1, scrapedAt: '2025-01-01T10:00:00.000Z' },
                { id: 2, scrapedAt: '2025-01-01T08:00:00.000Z' }
            ];
            
            const originalOrder = [...originalData];
            Lidar.rules.sortData(originalData);
            
            expect(originalData).toEqual(originalOrder);
        });
        
        test('should handle empty array', () => {
            const sorted = Lidar.rules.sortData([]);
            expect(sorted).toEqual([]);
        });
        
        test('should handle single item', () => {
            const data = [{ id: 1, scrapedAt: '2025-01-01T10:00:00.000Z' }];
            const sorted = Lidar.rules.sortData(data);
            
            expect(sorted).toHaveLength(1);
            expect(sorted[0]).toEqual(data[0]);
        });
    });
    
    describe('getApplyKey', () => {
        test.each([
            [{ id: 'rule-123' }, 'item-456', 'rule-123:item-456'],
            [{ id: 'abc' }, 'def', 'abc:def'],
            [{ id: 'test-rule' }, 'test-id', 'test-rule:test-id'],
            [{ id: '123' }, '456', '123:456'],
            [{ id: 'rule-with-dashes' }, 'id:with:colons', 'rule-with-dashes:id:with:colons'],
            [{ id: '' }, 'identifier', ':identifier'],
            [{ id: 'rule' }, '', 'rule:'],
            [{ id: '' }, '', ':']
        ])('getApplyKey(%o, %s) should return %s', (rule, identifier, expected) => {
            expect(Lidar.rules.getApplyKey(rule, identifier)).toBe(expected);
        });
    });
    
    describe('Module exports', () => {
        test('should export all expected functions', () => {
            expect(Lidar.rules).toHaveProperty('matchesUrlPattern');
            expect(Lidar.rules).toHaveProperty('sortRules');
            expect(Lidar.rules).toHaveProperty('sortData');
            expect(Lidar.rules).toHaveProperty('getApplyKey');
        });
        
        test('should export functions as callable', () => {
            expect(typeof Lidar.rules.matchesUrlPattern).toBe('function');
            expect(typeof Lidar.rules.sortRules).toBe('function');
            expect(typeof Lidar.rules.sortData).toBe('function');
            expect(typeof Lidar.rules.getApplyKey).toBe('function');
        });
    });
});