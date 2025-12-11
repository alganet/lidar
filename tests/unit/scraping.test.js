// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for scraping.js module

describe('Scraping Module (scraping.js)', () => {
    beforeAll(() => {
        // Set up global context for browser extension
        global.self = global;
        
        // Set up Lidar global object
        global.Lidar = global.Lidar || {};
        
        // Mock CSS.escape for jsdom environment
        global.CSS = {
            escape: (str) => str.replace(/([ #;?%&,.+*~\':"!^$[\]()=>|/@])/g,'\\$1')
        };
        
        // Mock DOM environment
        document.body = document.createElement('body');
        
        // Load the scraping module
        require('../../src/scraping.js');
    });
    
    describe('generateSelector', () => {
        let mockElement;
        
        beforeEach(() => {
            // Create fresh mock elements for each test
            mockElement = {
                id: null,
                className: '',
                tagName: 'DIV',
                parentElement: null,
                textContent: '',
                attributes: {}
            };
        });
        
        test('should generate selector for element with non-lidar ID', () => {
            mockElement.id = 'test-element';
            mockElement.parentElement = {
                tagName: 'BODY',
                parentElement: null,
                children: []
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('#test-element');
        });
        
        test('should skip lidar-prefixed IDs', () => {
            mockElement.id = 'lidar-panel';
            mockElement.tagName = 'DIV';
            mockElement.parentElement = {
                tagName: 'BODY',
                parentElement: null,
                children: []
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).not.toBe('#lidar-panel');
            expect(selector).toContain('div');
        });
        
        test('should handle elements without ID', () => {
            mockElement.tagName = 'SPAN';
            mockElement.parentElement = {
                tagName: 'DIV',
                parentElement: {
                    tagName: 'BODY',
                    parentElement: null,
                    children: []
                },
                children: [mockElement]
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > div > span');
        });
        
        test('should include classes when available', () => {
            mockElement.tagName = 'P';
            mockElement.className = 'content text-highlight';
            mockElement.parentElement = {
                tagName: 'DIV',
                parentElement: {
                    tagName: 'BODY',
                    parentElement: null,
                    children: []
                },
                children: [mockElement]
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > div > p.content.text-highlight');
        });
        
        test('should filter out lidar classes', () => {
            mockElement.tagName = 'DIV';
            mockElement.className = 'lidar-panel content';
            mockElement.parentElement = {
                tagName: 'BODY',
                parentElement: null,
                children: []
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > div.content');
            expect(selector).not.toContain('lidar');
        });
        
        test('should limit class selector to first 2 classes', () => {
            mockElement.tagName = 'SPAN';
            mockElement.className = 'class1 class2 class3 class4';
            mockElement.parentElement = {
                tagName: 'DIV',
                parentElement: {
                    tagName: 'BODY',
                    parentElement: null,
                    children: []
                },
                children: [mockElement]
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > div > span.class1.class2');
        });
        
        test('should handle sibling elements with nth-of-type', () => {
            const sibling1 = { tagName: 'P', parentElement: null };
            const sibling2 = { tagName: 'P', parentElement: null };
            const sibling3 = { tagName: 'P', parentElement: null };
            
            mockElement.tagName = 'P';
            mockElement.parentElement = {
                tagName: 'DIV',
                parentElement: {
                    tagName: 'BODY',
                    parentElement: null,
                    children: [sibling1, sibling2, sibling3, mockElement]
                },
                children: [sibling1, sibling2, sibling3, mockElement]
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > div > p:nth-of-type(4)');
        });
        
        test('should stop at document.body', () => {
            mockElement.tagName = 'SPAN';
            mockElement.parentElement = {
                tagName: 'BODY',
                parentElement: null,
                children: [mockElement]
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > span');
        });
        
        test('should handle elements with special characters in ID', () => {
            mockElement.id = 'element-with-dashes.and.dots';
            mockElement.parentElement = {
                tagName: 'BODY',
                parentElement: null,
                children: []
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toContain('element-with-dashes');
        });
        
        test('should handle empty className', () => {
            mockElement.tagName = 'DIV';
            mockElement.className = '';
            mockElement.parentElement = {
                tagName: 'BODY',
                parentElement: null,
                children: []
            };
            
            const selector = Lidar.scraping.generateSelector(mockElement);
            expect(selector).toBe('body > div');
        });
    });
    
    describe('extractData', () => {
        let mockDocument;
        let rule;
        
        beforeEach(() => {
            // Create mock document structure
            mockDocument = {
                querySelector: jest.fn()
            };
            
            rule = {
                fields: [
                    { name: 'title', selector: '.title' },
                    { name: 'description', selector: '.desc' },
                    { name: 'link', selector: 'a' },
                    { name: 'image', selector: 'img' },
                    { name: 'input', selector: 'input' },
                    { name: 'textarea', selector: 'textarea' }
                ]
            };
        });
        
        test('should extract data for all field types', () => {
            // Mock elements for different types
            const titleEl = { tagName: 'H1', textContent: 'Test Title' };
            const descEl = { tagName: 'P', textContent: 'Test Description' };
            const linkEl = { tagName: 'A', textContent: 'Click Here' };
            const imgEl = { tagName: 'IMG', src: 'image.jpg', alt: 'Alt Text' };
            const inputEl = { tagName: 'INPUT', value: 'Input Value' };
            const textareaEl = { tagName: 'TEXTAREA', value: 'Textarea Value' };
            
            mockDocument.querySelector
                .mockReturnValueOnce(titleEl)  // title
                .mockReturnValueOnce(descEl)   // description
                .mockReturnValueOnce(linkEl)   // link
                .mockReturnValueOnce(imgEl)    // image
                .mockReturnValueOnce(inputEl)  // input
                .mockReturnValueOnce(textareaEl); // textarea
            
            const result = Lidar.scraping.extractData(rule, mockDocument);
            
            expect(result).toEqual({
                title: 'Test Title',
                description: 'Test Description',
                link: 'Click Here',
                image: 'image.jpg', // Should use src first
                input: 'Input Value',
                textarea: 'Textarea Value'
            });
        });
        
        test('should use alt text when image has no src', () => {
            const imgEl = { tagName: 'IMG', alt: 'Alt Text Only' };
            mockDocument.querySelector.mockReturnValue(imgEl);
            
            const result = Lidar.scraping.extractData({
                fields: [{ name: 'image', selector: 'img' }]
            }, mockDocument);
            
            expect(result.image).toBe('Alt Text Only');
        });
        
        test('should handle missing elements gracefully', () => {
            mockDocument.querySelector.mockReturnValue(null);
            
            const result = Lidar.scraping.extractData(rule, mockDocument);
            
            expect(result).toEqual({
                title: null,
                description: null,
                link: null,
                image: null,
                input: null,
                textarea: null
            });
        });
        
        test('should handle selector errors gracefully', () => {
            mockDocument.querySelector.mockImplementation(() => {
                throw new Error('Invalid selector');
            });
            
            const result = Lidar.scraping.extractData(rule, mockDocument);
            
            expect(result.title).toBeNull();
            expect(result.description).toBeNull();
        });
        
        test('should handle empty selector fields', () => {
            const result = Lidar.scraping.extractData({
                fields: [
                    { name: 'empty', selector: '' },
                    { name: 'null', selector: null },
                    { name: 'undefined', selector: undefined }
                ]
            }, mockDocument);
            
            expect(result.empty).toBeNull();
            expect(result.null).toBeNull();
            expect(result.undefined).toBeNull();
        });
        
        test('should trim text content', () => {
            const el = { 
                tagName: 'P', 
                textContent: '  \n  Trimmed Text  \n  ' 
            };
            mockDocument.querySelector.mockReturnValue(el);
            
            const result = Lidar.scraping.extractData({
                fields: [{ name: 'text', selector: 'p' }]
            }, mockDocument);
            
            expect(result.text).toBe('Trimmed Text');
        });
        
        test('should handle null/undefined text content', () => {
            const el = { tagName: 'P', textContent: null };
            mockDocument.querySelector.mockReturnValue(el);
            
            const result = Lidar.scraping.extractData({
                fields: [{ name: 'text', selector: 'p' }]
            }, mockDocument);
            
            expect(result.text).toBeUndefined();
        });
        
        test('should use default document when no rootElement provided', () => {
            const el = { tagName: 'P', textContent: 'Test' };
            document.querySelector = jest.fn().mockReturnValue(el);
            
            const result = Lidar.scraping.extractData({
                fields: [{ name: 'text', selector: 'p' }]
            });
            
            expect(result.text).toBe('Test');
            expect(document.querySelector).toHaveBeenCalledWith('p');
        });
    });
    
    describe('isRuleApplicable', () => {
        let mockDocument;
        let rule;
        
        beforeEach(() => {
            mockDocument = {
                querySelector: jest.fn()
            };
            
            // Set up rules mock
            global.Lidar.rules = {
                matchesUrlPattern: jest.fn()
            };
            
            rule = {
                urlPattern: 'https://example.com/*',
                fields: [
                    { name: 'identifier', selector: '.main-content' }
                ]
            };
        });
        
        test('should return false when URL pattern does not match', () => {
            Lidar.rules.matchesUrlPattern.mockReturnValue(false);
            
            const result = Lidar.scraping.isRuleApplicable(
                rule, 
                'https://other.com/page', 
                mockDocument
            );
            
            expect(result).toBe(false);
            expect(Lidar.rules.matchesUrlPattern).toHaveBeenCalledWith(
                'https://example.com/*', 
                'https://other.com/page'
            );
        });
        
        test('should return false when no identifier field', () => {
            const ruleWithoutIdentifier = {
                urlPattern: 'https://example.com/*',
                fields: [
                    { name: 'title', selector: '.title' }
                ]
            };
            
            Lidar.rules.matchesUrlPattern.mockReturnValue(true);
            
            const result = Lidar.scraping.isRuleApplicable(
                ruleWithoutIdentifier, 
                'https://example.com/page', 
                mockDocument
            );
            
            expect(result).toBe(false);
        });
        
        test('should return false when identifier has no selector', () => {
            const ruleWithoutSelector = {
                urlPattern: 'https://example.com/*',
                fields: [
                    { name: 'identifier', selector: '' }
                ]
            };
            
            Lidar.rules.matchesUrlPattern.mockReturnValue(true);
            
            const result = Lidar.scraping.isRuleApplicable(
                ruleWithoutSelector, 
                'https://example.com/page', 
                mockDocument
            );
            
            expect(result).toBe(false);
        });
        
        test('should return false when identifier selector fails', () => {
            Lidar.rules.matchesUrlPattern.mockReturnValue(true);
            mockDocument.querySelector.mockReturnValue(null);
            
            const result = Lidar.scraping.isRuleApplicable(
                rule, 
                'https://example.com/page', 
                mockDocument
            );
            
            expect(result).toBe(false);
        });
        
        test('should return true when URL matches and identifier found', () => {
            Lidar.rules.matchesUrlPattern.mockReturnValue(true);
            mockDocument.querySelector.mockReturnValue({ tagName: 'DIV' });
            
            const result = Lidar.scraping.isRuleApplicable(
                rule, 
                'https://example.com/page', 
                mockDocument
            );
            
            expect(result).toBe(true);
            expect(Lidar.rules.matchesUrlPattern).toHaveBeenCalledWith(
                'https://example.com/*', 
                'https://example.com/page'
            );
            expect(mockDocument.querySelector).toHaveBeenCalledWith('.main-content');
        });
        
        test('should handle selector exceptions gracefully', () => {
            Lidar.rules.matchesUrlPattern.mockReturnValue(true);
            mockDocument.querySelector.mockImplementation(() => {
                throw new Error('Invalid selector');
            });
            
            const result = Lidar.scraping.isRuleApplicable(
                rule, 
                'https://example.com/page', 
                mockDocument
            );
            
            expect(result).toBe(false);
        });
        
        test('should use default document when no rootElement provided', () => {
            Lidar.rules.matchesUrlPattern.mockReturnValue(true);
            document.querySelector = jest.fn().mockReturnValue({ tagName: 'DIV' });
            
            const result = Lidar.scraping.isRuleApplicable(
                rule, 
                'https://example.com/page'
            );
            
            expect(result).toBe(true);
            expect(document.querySelector).toHaveBeenCalledWith('.main-content');
        });
        
        test('should handle null fields gracefully', () => {
            const ruleWithNullFields = {
                urlPattern: 'https://example.com/*',
                fields: null
            };
            
            const result = Lidar.scraping.isRuleApplicable(
                ruleWithNullFields, 
                'https://example.com/page', 
                mockDocument
            );
            
            expect(result).toBe(false);
        });
    });
    
    describe('Module exports', () => {
        test('should export all expected functions', () => {
            expect(Lidar.scraping).toHaveProperty('generateSelector');
            expect(Lidar.scraping).toHaveProperty('extractData');
            expect(Lidar.scraping).toHaveProperty('isRuleApplicable');
        });
        
        test('should export functions as callable', () => {
            expect(typeof Lidar.scraping.generateSelector).toBe('function');
            expect(typeof Lidar.scraping.extractData).toBe('function');
            expect(typeof Lidar.scraping.isRuleApplicable).toBe('function');
        });
    });
});