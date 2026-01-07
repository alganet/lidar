// tests/unit/consistency.test.js

describe('Consistency-Aware Field Detection', () => {
    beforeAll(() => {
        global.self = global;
        global.Lidar = global.Lidar || {};
        global.CSS = {
            escape: (str) => str.replace(/([ #;?%&,.+*~':\"!^$[\]()=>|/@])/g, '\\$1')
        };
        require('../../src/rules.js');
        require('../../src/scraping.js');
        require('../../src/fieldDetection.js');
    });

    test('should identify the most consistent subset of snapshots (e.g. Profile vs Home)', () => {
        const snapshots = [
            // Subset A: Profiles (3 snapshots)
            {
                sourceUrl: 'https://news.ycombinator.com/user?id=alice',
                regionHtml: '<div class="profile"><h1>Alice</h1><p>Karma: 100</p></div>'
            },
            {
                sourceUrl: 'https://news.ycombinator.com/user?id=bob',
                regionHtml: '<div class="profile"><h1>Bob</h1><p>Karma: 200</p></div>'
            },
            {
                sourceUrl: 'https://news.ycombinator.com/user?id=charlie',
                regionHtml: '<div class="profile"><h1>Charlie</h1><p>Karma: 300</p></div>'
            },
            {
                sourceUrl: 'https://news.ycombinator.com/user?id=delta',
                regionHtml: '<div class="profile"><h1>Delta</h1><p>Karma: 400</p></div>'
            },
            // Subset B: Home/Other (2 snapshots - less than 3, so should be ignored)
            {
                sourceUrl: 'https://news.ycombinator.com/',
                regionHtml: '<div class="home">Welcome to HN</div>'
            },
            {
                sourceUrl: 'https://news.ycombinator.com/news',
                regionHtml: '<div class="home">Top Stories</div>'
            }
        ];

        const result = Lidar.fieldDetection.detectFieldsFromSnapshots(snapshots);

        // Should have found fields from the Profile subset
        expect(result.fields.length).toBeGreaterThanOrEqual(2);

        const values = result.fields.flatMap(f => f.sampleValues);
        expect(values).toContain('Alice');
        expect(values).toContain('Karma: 100');
        expect(values).not.toContain('Welcome to HN');

        // URL Pattern should crystallize around the profile subset
        expect(result.urlPattern).toBe('https://news.ycombinator.com/user?id=*');
    });

    test('should handle completely inconsistent snapshots by falling back to all', () => {
        const snapshots = [
            { sourceUrl: 'https://a.com/1', regionHtml: '<div>A</div>' },
            { sourceUrl: 'https://b.com/1', regionHtml: '<span>B</span>' },
            { sourceUrl: 'https://c.com/1', regionHtml: '<p>C</p>' },
            { sourceUrl: 'https://d.com/1', regionHtml: '<b>D</b>' }
        ];

        const result = Lidar.fieldDetection.detectFieldsFromSnapshots(snapshots);
        expect(result.error).toContain('Found: 1'); // Every snapshot has a different structure, so bestSubset is size 1
    });
});
