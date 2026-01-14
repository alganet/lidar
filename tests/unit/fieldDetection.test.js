// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Unit tests for fieldDetection.js module

describe('Field Detection Module (fieldDetection.js)', () => {
    beforeAll(() => {
        // Set up global context
        global.self = global;
        global.Lidar = global.Lidar || {};

        // Mock CSS.escape
        global.CSS = {
            escape: (str) => str.replace(/([ #;?%&,.+*~':\"!^$[\]()=>|/@])/g, '\\$1')
        };

        // Load the modules
        require('../../src/rules.js');
        require('../../src/scraping.js');
        require('../../src/fieldDetection.js');
    });

    describe('sanitizeFieldName', () => {
        test('should convert to lowercase', () => {
            expect(Lidar.fieldDetection.sanitizeFieldName('UserName')).toBe('username');
        });

        test('should replace special characters with underscores', () => {
            expect(Lidar.fieldDetection.sanitizeFieldName('user@name.com')).toBe('user_name_com');
        });

        test('should trim leading/trailing underscores', () => {
            expect(Lidar.fieldDetection.sanitizeFieldName('__name__')).toBe('name');
        });

        test('should handle spaces', () => {
            expect(Lidar.fieldDetection.sanitizeFieldName('First Name')).toBe('first_name');
        });

        test('should truncate long names', () => {
            const longName = 'a'.repeat(100);
            expect(Lidar.fieldDetection.sanitizeFieldName(longName).length).toBe(50);
        });

        test('should return "field" for empty input', () => {
            expect(Lidar.fieldDetection.sanitizeFieldName('!!!')).toBe('field');
        });
    });

    describe('parseHtml', () => {
        test('should parse simple HTML', () => {
            const container = Lidar.fieldDetection.parseHtml('<span>Hello</span>');
            expect(container.querySelector('span').textContent).toBe('Hello');
        });

        test('should parse nested HTML', () => {
            const container = Lidar.fieldDetection.parseHtml('<div><p>Nested</p></div>');
            expect(container.querySelector('div p').textContent).toBe('Nested');
        });

        test('should handle tables', () => {
            const html = '<table><tr><td>Cell</td></tr></table>';
            const container = Lidar.fieldDetection.parseHtml(html);
            expect(container.querySelector('td').textContent).toBe('Cell');
        });
    });

    describe('getStructuralPath', () => {
        test('should generate path for simple element', () => {
            const container = Lidar.fieldDetection.parseHtml('<span>Test</span>');
            const span = container.querySelector('span');
            const path = Lidar.fieldDetection.getStructuralPath(span);
            expect(path).toContain('span[0]');
        });

        test('should include parent elements in path', () => {
            const container = Lidar.fieldDetection.parseHtml('<div><p><span>Test</span></p></div>');
            const span = container.querySelector('span');
            const path = Lidar.fieldDetection.getStructuralPath(span);
            expect(path).toContain('div[0]');
            expect(path).toContain('p[0]');
            expect(path).toContain('span[0]');
        });

        test('should use index for siblings', () => {
            const container = Lidar.fieldDetection.parseHtml('<div><span>A</span><span>B</span></div>');
            const spans = container.querySelectorAll('span');
            const path0 = Lidar.fieldDetection.getStructuralPath(spans[0]);
            const path1 = Lidar.fieldDetection.getStructuralPath(spans[1]);
            expect(path0).toContain('span[0]');
            expect(path1).toContain('span[1]');
        });
    });

    describe('generateSelector', () => {
        test('should generate selector for element with class', () => {
            const container = Lidar.fieldDetection.parseHtml('<div><span class="highlight">Test</span></div>');
            const span = container.querySelector('span');
            const selector = Lidar.fieldDetection.generateSelector(span, container);
            expect(selector).toContain('span.highlight');
        });

        test('should include nth-of-type for siblings', () => {
            const container = Lidar.fieldDetection.parseHtml('<div><span>A</span><span>B</span></div>');
            const spans = container.querySelectorAll('span');
            const selector = Lidar.fieldDetection.generateSelector(spans[1], container);
            expect(selector).toContain('nth-of-type(2)');
        });

        test('should limit to 2 classes', () => {
            const container = Lidar.fieldDetection.parseHtml('<span class="a b c d">Test</span>');
            const span = container.querySelector('span');
            const selector = Lidar.fieldDetection.generateSelector(span, container);
            expect(selector).toContain('.a');
            expect(selector).toContain('.b');
            expect(selector).not.toContain('.c');
        });
    });

    describe('findVaryingElements', () => {
        test('should find elements with varying text', () => {
            const snapshots = [
                '<div><span class="name">Alice</span></div>',
                '<div><span class="name">Bob</span></div>',
                '<div><span class="name">Charlie</span></div>'
            ];

            const varying = Lidar.fieldDetection.findVaryingElements(snapshots);
            expect(varying.length).toBeGreaterThan(0);
            expect(varying[0].values).toContain('Alice');
            expect(varying[0].values).toContain('Bob');
            expect(varying[0].values).toContain('Charlie');
        });

        test('should ignore elements with constant text', () => {
            const snapshots = [
                '<div><span class="label">Name:</span><span class="value">Alice</span></div>',
                '<div><span class="label">Name:</span><span class="value">Bob</span></div>',
                '<div><span class="label">Name:</span><span class="value">Charlie</span></div>'
            ];

            const varying = Lidar.fieldDetection.findVaryingElements(snapshots);

            // Should only find the value span, not the label
            const valueElements = varying.filter(v =>
                v.values.includes('Alice') || v.values.includes('Bob')
            );
            expect(valueElements.length).toBeGreaterThan(0);
        });

        test('should prefer inner-most element when values are identical (specificity filter)', () => {
            const snapshots = [
                '<table><tr><td class="cell"><a class="link">Alice</a></td></tr></table>',
                '<table><tr><td class="cell"><a class="link">Bob</a></td></tr></table>',
                '<table><tr><td class="cell"><a class="link">Charlie</a></td></tr></table>'
            ];

            const varying = Lidar.fieldDetection.findVaryingElements(snapshots);

            // Should find the <a>, but NOT the <td> because <a> has all the content
            const aElements = varying.filter(v => v.element.tagName === 'A');
            const tdElements = varying.filter(v => v.element.tagName === 'TD');

            expect(aElements.length).toBe(1);
            expect(tdElements.length).toBe(0);
        });

        test('should return empty for single snapshot', () => {
            const snapshots = ['<div><span>Test</span></div>'];
            const varying = Lidar.fieldDetection.findVaryingElements(snapshots);
            expect(varying).toEqual([]);
        });

        test('should return empty for null input', () => {
            const varying = Lidar.fieldDetection.findVaryingElements(null);
            expect(varying).toEqual([]);
        });

        test('should handle table structures', () => {
            const snapshots = [
                '<table><tr><td>user:</td><td>alice123</td></tr><tr><td>karma:</td><td>100</td></tr></table>',
                '<table><tr><td>user:</td><td>bob456</td></tr><tr><td>karma:</td><td>200</td></tr></table>',
                '<table><tr><td>user:</td><td>charlie789</td></tr><tr><td>karma:</td><td>300</td></tr></table>'
            ];

            const varying = Lidar.fieldDetection.findVaryingElements(snapshots);

            // Should find username and karma cells
            const userValues = varying.find(v => v.values.includes('alice123'));
            const karmaValues = varying.find(v => v.values.includes('100'));

            expect(userValues).toBeDefined();
            expect(karmaValues).toBeDefined();
        });
    });

    describe('Naming Heuristics', () => {
        describe('labelDetector heuristic', () => {
            test('should detect label with for attribute', () => {
                const html = '<div><label for="username">Username</label><input id="username" value="test"></div>';
                const container = Lidar.fieldDetection.parseHtml(html);
                const input = container.querySelector('input');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(input, context);
                expect(name).toBe('username');
            });

            test('should detect colon pattern in previous cell', () => {
                const html = '<table><tr><td>email:</td><td><span id="emailValue">test@example.com</span></td></tr></table>';
                const container = Lidar.fieldDetection.parseHtml(html);
                const span = container.querySelector('#emailValue');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(span, context);
                expect(name).toBe('email');
            });

            test('should detect colon pattern in previous sibling', () => {
                const html = '<div><span>Status:</span><span id="statusValue">Active</span></div>';
                const container = Lidar.fieldDetection.parseHtml(html);
                const span = container.querySelector('#statusValue');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(span, context);
                expect(name).toBe('status');
            });
        });

        describe('tableHeader heuristic', () => {
            test('should use th headers', () => {
                const html = '<table><thead><tr><th>Name</th><th>Age</th></tr></thead><tbody><tr><td id="nameCell">Alice</td><td>25</td></tr></tbody></table>';
                const container = Lidar.fieldDetection.parseHtml(html);
                const cell = container.querySelector('#nameCell');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(cell, context);
                expect(name).toBe('name');
            });
        });

        describe('attributeBased heuristic', () => {
            test('should use aria-label', () => {
                const html = '<input aria-label="Email Address" value="test">';
                const container = Lidar.fieldDetection.parseHtml(html);
                const input = container.querySelector('input');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(input, context);
                expect(name).toBe('email_address');
            });

            test('should use name attribute', () => {
                const html = '<input name="first_name" value="test">';
                const container = Lidar.fieldDetection.parseHtml(html);
                const input = container.querySelector('input');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(input, context);
                expect(name).toBe('first_name');
            });

            test('should use placeholder', () => {
                const html = '<input placeholder="Enter your email">';
                const container = Lidar.fieldDetection.parseHtml(html);
                const input = container.querySelector('input');
                const context = { document: container.ownerDocument || document };

                const name = Lidar.fieldDetection.inferFieldName(input, context);
                expect(name).toBe('enter_your_email');
            });
        });
    });

    describe('detectFieldsFromSnapshots', () => {
        test('should detect fields from HN-style table', () => {
            const snapshot1 = {
                regionHtml: '<table><tr><td>user:</td><td>alice123</td></tr><tr><td>karma:</td><td>100</td></tr></table>',
                sourceUrl: 'http://hn.com/user?id=alice123'
            };
            const snapshot2 = {
                regionHtml: '<table><tr><td>user:</td><td>bob456</td></tr><tr><td>karma:</td><td>200</td></tr></table>',
                sourceUrl: 'http://hn.com/user?id=bob456'
            };
            const snapshot3 = {
                regionHtml: '<table><tr><td>user:</td><td>charlie789</td></tr><tr><td>karma:</td><td>300</td></tr></table>',
                sourceUrl: 'http://hn.com/user?id=charlie789'
            };
            const snapshot4 = {
                regionHtml: '<table><tr><td>user:</td><td>delta012</td></tr><tr><td>karma:</td><td>400</td></tr></table>',
                sourceUrl: 'http://hn.com/user?id=delta012'
            };

            const result = Lidar.fieldDetection.detectFieldsFromSnapshots([snapshot1, snapshot2, snapshot3, snapshot4]);

            expect(result.error).toBeUndefined();
            expect(result.fields.length).toBeGreaterThan(0);

            // Should detect a field named "user" (from colon pattern)
            const userField = result.fields.find(f => f.name === 'user');
            expect(userField).toBeDefined();
            expect(userField.sampleValues).toContain('alice123');
        });

        test('should merge named fields and suffix unnamed fields', () => {
            const snapshot1 = {
                regionHtml: '<div><span class="about">Info 1</span><div class="bio">Bio 1</div><p>Other 1</p><p>Extra 1</p></div>',
                sourceUrl: 'http://a.com/user1'
            };
            const snapshot2 = {
                regionHtml: '<div><span class="about">Info 2</span><div class="bio">Bio 2</div><p>Other 2</p><p>Extra 2</p></div>',
                sourceUrl: 'http://a.com/user2'
            };

            // Mock inferFieldName to produce clashing names
            // 1st element -> "about"
            // 2nd element -> "about" (should merge)
            // 3rd element -> null -> "field_1"
            // 4th element -> null -> "field_2" (should suffix)
            const originalInfer = Lidar.fieldDetection.inferFieldName;
            let callCount = 0;
            Lidar.fieldDetection.inferFieldName = jest.fn(() => {
                callCount++;
                if (callCount === 1) return 'about';
                if (callCount === 2) return 'about';
                return null;
            });

            try {
                const result = Lidar.fieldDetection.detectFieldsFromSnapshots([snapshot1, snapshot2]);
                const names = result.fields.map(f => f.name);

                // Should have "about", and some field_N ones, but NOT about_2
                expect(names).toContain('about');
                expect(names).not.toContain('about_2');

                // Verify "about" appears exactly once
                const aboutCount = names.filter(n => n === 'about').length;
                expect(aboutCount).toBe(1);
            } finally {
                Lidar.fieldDetection.inferFieldName = originalInfer;
            }
        });

        test('should treat semantic names starting with "field_" as named fields', () => {
            const snapshot1 = {
                regionHtml: '<div><span class="field_one">A1</span><span class="field_one">A2</span></div>',
                sourceUrl: 'http://a.com'
            };
            const snapshot2 = {
                regionHtml: '<div><span class="field_one">B1</span><span class="field_one">B2</span></div>',
                sourceUrl: 'http://b.com'
            };

            const originalInfer = Lidar.fieldDetection.inferFieldName;
            Lidar.fieldDetection.inferFieldName = jest.fn().mockReturnValue('field_one');

            try {
                const result = Lidar.fieldDetection.detectFieldsFromSnapshots([snapshot1, snapshot2]);
                const names = result.fields.map(f => f.name);

                // Should merge "field_one" instead of suffixing it as "field_one_2"
                expect(names).toEqual(['field_one']);
            } finally {
                Lidar.fieldDetection.inferFieldName = originalInfer;
            }
        });

        test('should identify unique field as identifier', () => {
            const snapshot1 = {
                regionHtml: '<div><span class="id">ID001</span><span class="status">Active</span></div>',
                sourceUrl: 'http://a.com'
            };
            const snapshot2 = {
                regionHtml: '<div><span class="id">ID002</span><span class="status">Pending</span></div>',
                sourceUrl: 'http://b.com'
            };
            const snapshot3 = {
                regionHtml: '<div><span class="id">ID003</span><span class="status">Active</span></div>',
                sourceUrl: 'http://c.com'
            };

            const result = Lidar.fieldDetection.detectFieldsFromSnapshots([snapshot1, snapshot2, snapshot3]);

            // Both fields vary, but ID field has all unique values
            // Status has "Active" twice, so ID should be identifier
            expect(result.identifier).toBeDefined();
        });

        test('should deduplicate field names', () => {
            const snapshot1 = {
                regionHtml: '<div><span>Value1</span><span>Value2</span></div>',
                sourceUrl: 'http://a.com'
            };
            const snapshot2 = {
                regionHtml: '<div><span>Value3</span><span>Value4</span></div>',
                sourceUrl: 'http://b.com'
            };
            const snapshot3 = {
                regionHtml: '<div><span>Value5</span><span>Value6</span></div>',
                sourceUrl: 'http://c.com'
            };

            const result = Lidar.fieldDetection.detectFieldsFromSnapshots([snapshot1, snapshot2, snapshot3]);

            // All fields should have unique names (field_1, field_2, etc. or with suffix)
            const names = result.fields.map(f => f.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });

        test('should handle empty snapshots gracefully', () => {
            const result = Lidar.fieldDetection.detectFieldsFromSnapshots([
                { regionHtml: '', sourceUrl: 'http://a.com' },
                { regionHtml: '', sourceUrl: 'http://b.com' },
                { regionHtml: '', sourceUrl: 'http://c.com' },
                { regionHtml: '', sourceUrl: 'http://d.com' }
            ]);
            expect(result.fields).toEqual([]);
            expect(result.urlPattern).toBe('*');
        });

        test('should return subsetIndices', () => {
            const snapshot1 = { regionHtml: '<div>A</div>', sourceUrl: 'http://a.com' };
            const snapshot2 = { regionHtml: '<div>B</div>', sourceUrl: 'http://b.com' };
            const result = Lidar.fieldDetection.detectFieldsFromSnapshots([snapshot1, snapshot2]);
            expect(result.subsetIndices).toEqual([0, 1]);
        });
    });

    describe('Custom heuristic registration', () => {
        test('should allow registering custom heuristics', () => {
            Lidar.fieldDetection.registerNamingHeuristic('testHeuristic', 5, (element) => {
                if (element.hasAttribute('data-custom-name')) {
                    return element.getAttribute('data-custom-name');
                }
                return null;
            });

            const html = '<input data-custom-name="my_custom_field">';
            const container = Lidar.fieldDetection.parseHtml(html);
            const input = container.querySelector('input');
            const context = { document: container.ownerDocument || document };

            const name = Lidar.fieldDetection.inferFieldName(input, context);
            expect(name).toBe('my_custom_field');
        });
    });

    describe('Module exports', () => {
        test('should export all expected functions', () => {
            expect(Lidar.fieldDetection).toHaveProperty('detectFieldsFromSnapshots');
            expect(Lidar.fieldDetection).toHaveProperty('registerNamingHeuristic');
            expect(Lidar.fieldDetection).toHaveProperty('inferFieldName');
            expect(Lidar.fieldDetection).toHaveProperty('findVaryingElements');
            expect(Lidar.fieldDetection).toHaveProperty('sanitizeFieldName');
            expect(Lidar.fieldDetection).toHaveProperty('parseHtml');
            expect(Lidar.fieldDetection).toHaveProperty('getStructuralPath');
            expect(Lidar.fieldDetection).toHaveProperty('generateSelector');
        });
    });
});
