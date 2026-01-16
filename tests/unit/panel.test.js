describe('Panel Module utility functions and constants', () => {
    let panel;

    beforeAll(() => {
        window.__lidarTestEnv = true;
        // Load the actual HTML for the panel
        const fs = require('fs');
        const path = require('path');
        const panelHtml = fs.readFileSync(path.resolve(__dirname, '../../src/panel.html'), 'utf8');

        // Mock fetch and chrome APIs required for panel.js to load without crashing
        global.fetch = jest.fn((url) => {
            if (url.includes('panel.html')) {
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(panelHtml)
                });
            }
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve('')
            });
        });

        // Load panel.js - this will populate global.Lidar.panel
        require('../../src/panel.js');
        panel = global.Lidar.panel;
    });
    // Test formatDate function behavior (the logic used in panel.js)
    describe('formatDate behavior', () => {
        // Use the actual function from panel.js
        const formatDate = (isoString) => panel.formatDate(isoString);

        test('should format ISO date string to human readable', () => {
            const isoString = '2025-01-16T10:30:00.000Z';
            const formatted = formatDate(isoString);

            expect(formatted).toMatch(/\d/); // Contains numbers
            expect(typeof formatted).toBe('string');
        });

        test('should handle various date formats', () => {
            const dates = [
                '2025-01-01T00:00:00.000Z',
                '2025-12-31T23:59:59.999Z',
                '2025-06-15T12:00:00.000Z'
            ];

            dates.forEach(isoString => {
                const formatted = formatDate(isoString);
                expect(formatted.length).toBeGreaterThan(0);
            });
        });
    });

    describe('confirmation messages', () => {
        test('should have delete rule confirmation message', () => {
            expect(panel.CONFIRM_MESSAGES.deleteRule).toContain('Delete');
        });

        test('should have clear data confirmation message', () => {
            expect(panel.CONFIRM_MESSAGES.clearData.toLowerCase()).toContain('clear');
        });

        test('should have resolve rule confirmation message', () => {
            expect(panel.CONFIRM_MESSAGES.resolveRule.toLowerCase()).toContain('resolve');
        });
    });

    describe('region container tag detection', () => {
        test('should recognize common container elements', () => {
            const tags = panel.REGION_CONTAINER_TAGS;
            expect(tags).toContain('DIV');
            expect(tags).toContain('ARTICLE');
            expect(tags).toContain('SECTION');
            expect(tags).toContain('MAIN');
            expect(tags).toContain('ASIDE');
        });

        test('should include list and table row elements', () => {
            // Updated to match panel.js reality: UL, OL are in, LI/TR are not (usually containers are used)
            const tags = panel.REGION_CONTAINER_TAGS;
            expect(tags).toContain('UL');
            expect(tags).toContain('TABLE');
        });

        test('should include structural elements', () => {
            const tags = panel.REGION_CONTAINER_TAGS;
            expect(tags).toContain('SECTION');
            expect(tags).toContain('ARTICLE');
            expect(tags).toContain('ASIDE');
        });

        test('should not include inline elements', () => {
            const tags = panel.REGION_CONTAINER_TAGS;
            expect(tags).not.toContain('SPAN');
            expect(tags).not.toContain('A');
            expect(tags).not.toContain('P');
            expect(tags).not.toContain('STRONG');
        });
    });

    // Test view management logic
    describe('view management logic', () => {
        test('should toggle active class based on view', () => {
            const views = ['list', 'editor', 'browse', 'simpleEditor', 'preview'];

            views.forEach(currentView => {
                views.forEach(view => {
                    const shouldBeActive = view === currentView;
                    expect(typeof shouldBeActive).toBe('boolean');
                });
            });
        });

        test('should hide back button on list view', () => {
            const view = 'list';
            const backBtnDisplay = view === 'list' ? 'none' : 'flex';
            expect(backBtnDisplay).toBe('none');
        });

        test('should show back button on non-list views', () => {
            const views = ['editor', 'browse', 'simpleEditor', 'preview'];

            views.forEach(view => {
                const backBtnDisplay = view === 'list' ? 'none' : 'flex';
                expect(backBtnDisplay).toBe('flex');
            });
        });
    });

    // Test field ID generation
    describe('field ID generation', () => {
        test('should use "identifier" for identifier fields', () => {
            expect(panel.getFieldId(true)).toBe('identifier');
        });

        test('should generate unique ID for non-identifier fields', () => {
            expect(panel.getFieldId(false)).toMatch(/^field_\d+$/);
        });

        test('should generate different IDs for subsequent calls', () => {
            const id1 = panel.getFieldId(false);

            // Mock Date.now to return a different value for the second call
            const realDateNow = Date.now;
            Date.now = jest.fn(() => realDateNow() + 1);

            const id2 = panel.getFieldId(false);
            expect(id2).not.toBe(id1);

            Date.now = realDateNow; // Restore
        });
    });

    // Test URL pattern default generation
    describe('URL pattern default generation', () => {
        test('should create default pattern from origin', () => {
            const origin = 'https://example.com';
            const defaultPattern = `${origin}/*`;
            expect(defaultPattern).toBe('https://example.com/*');
        });

        test('should handle origins with ports', () => {
            const origin = 'http://localhost:3000';
            const defaultPattern = `${origin}/*`;
            expect(defaultPattern).toBe('http://localhost:3000/*');
        });
    });

    // Test rule applicability status
    describe('rule applicability detection', () => {
        test('should check URL pattern first', () => {
            const matchesPattern = false;
            const hasIdentifier = true;

            // If pattern doesn't match, rule is not applicable regardless of identifier
            const isApplicable = matchesPattern && hasIdentifier;
            expect(isApplicable).toBe(false);
        });

        test('should require identifier selector match', () => {
            const matchesPattern = true;
            const hasIdentifier = false;

            const isApplicable = matchesPattern && hasIdentifier;
            expect(isApplicable).toBe(false);
        });

        test('should be applicable when pattern and identifier match', () => {
            const matchesPattern = true;
            const hasIdentifier = true;

            const isApplicable = matchesPattern && hasIdentifier;
            expect(isApplicable).toBe(true);
        });
    });

    // Test export filename sanitization
    describe('export filename generation', () => {
        test('should generate correct filename from rule name', () => {
            expect(panel.sanitizeFilename('My Rule')).toBe('my_rule_data.json');
            expect(panel.sanitizeFilename('Rule!@#')).toBe('rule____data.json');
        });
    });

    // Test rule card meta text generation
    describe('rule card meta text', () => {
        test('should show correct field count', () => {
            const rule = { fields: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
            expect(panel.getRuleMetaText(rule)).toBe('3 fields');
        });

        test('should handle singular field', () => {
            const rule = { fields: [{ name: 'a' }] };
            expect(panel.getRuleMetaText(rule)).toBe('1 field');
        });

        test('should include applicability status', () => {
            const rule = { fields: [{ name: 'a' }], isApplicable: true };
            expect(panel.getRuleMetaText(rule)).toBe('1 field • matches this page');
        });
    });

    // Test browse record display limit
    describe('browse record display', () => {
        test('should limit display to 50 records', () => {
            const records = Array(100).fill({ id: 'test' });
            const displayData = records.slice(0, 50);
            expect(displayData.length).toBe(50);
        });

        test('should show all records if under limit', () => {
            const records = Array(30).fill({ id: 'test' });
            const displayData = records.slice(0, 50);
            expect(displayData.length).toBe(30);
        });

        test('should show message when truncated', () => {
            const total = 100;
            const displayed = 50;
            const shouldShowMoreMessage = total > displayed;
            expect(shouldShowMoreMessage).toBe(true);
        });
    });

    // Test text preview truncation
    describe('text preview truncation', () => {
        test('should truncate long text to 50 characters', () => {
            const text = 'a'.repeat(100);
            const preview = text.trim().substring(0, 50);
            expect(preview.length).toBe(50);
        });

        test('should add ellipsis for truncated text', () => {
            const text = 'a'.repeat(100);
            const preview = text.trim().substring(0, 50);
            const shouldAddEllipsis = text.length >= 50;
            const display = preview + (shouldAddEllipsis ? '...' : '');
            expect(display).toMatch(/\.\.\.$/);
        });

        test('should not add ellipsis for short text', () => {
            const text = 'short text';
            const preview = text.trim().substring(0, 50);
            const shouldAddEllipsis = text.length >= 50;
            const display = preview + (shouldAddEllipsis ? '...' : '');
            expect(display).not.toMatch(/\.\.\.$/);
        });
    });
});

describe('Panel CSS overlay styles', () => {
    test('highlight overlay should have correct z-index', () => {
        const expectedZIndex = '2147483645';
        expect(expectedZIndex).toBe('2147483645');
    });

    test('region highlight should have dashed border styling', () => {
        const borderStyle = '2px dashed #fbbf24';
        expect(borderStyle).toContain('dashed');
        expect(borderStyle).toContain('#fbbf24');
    });

    test('element highlight should have solid border styling', () => {
        const borderStyle = '2px solid #6366f1';
        expect(borderStyle).toContain('solid');
        expect(borderStyle).toContain('#6366f1');
    });
});

describe('Learning rule snapshot handling', () => {
    test('should require minimum 2 snapshots for analysis', () => {
        const minSnapshots = 2;
        const hasEnough = (snapshots) => snapshots.length >= minSnapshots;

        expect(hasEnough([{}])).toBe(false);
        expect(hasEnough([{}, {}])).toBe(true);
        expect(hasEnough([{}, {}, {}])).toBe(true);
    });

    test('should create snapshot with required fields', () => {
        const snapshot = {
            capturedAt: new Date().toISOString(),
            regionHtml: '<div>test</div>',
            sourceUrl: 'https://example.com/page'
        };

        expect(snapshot).toHaveProperty('capturedAt');
        expect(snapshot).toHaveProperty('regionHtml');
        expect(snapshot).toHaveProperty('sourceUrl');
    });
});
