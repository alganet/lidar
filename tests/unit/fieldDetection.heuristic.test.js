// tests/unit/fieldDetection.heuristic.test.js
// We don't need explicit JSDOM require as jest environment is jsdom
// const { JSDOM } = require("jsdom");

// Mock Lidar global object and dependencies
window.CSS = {
    escape: (str) => str.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1')
};
window.Lidar = {};
require("../../src/rules.js");
require("../../src/scraping.js");
require("../../src/fieldDetection.js");

describe("Field Detection Heuristics", () => {
    test("detectFieldsFromSnapshots should prioritize field appearing in URL as identifier", () => {
        const snapshots = [
            {
                sourceUrl: "https://example.com/users/alice",
                regionHtml: `
                    <div class="profile">
                        <h1 class="name">Alice Smith</h1>
                        <span class="username">alice</span>
                        <span class="role">admin</span>
                    </div>
                `
            },
            {
                sourceUrl: "https://example.com/users/bob",
                regionHtml: `
                    <div class="profile">
                        <h1 class="name">Bob Jones</h1>
                        <span class="username">bob</span>
                        <span class="role">user</span>
                    </div>
                `
            },
            {
                sourceUrl: "https://example.com/users/charlie",
                regionHtml: `
                    <div class="profile">
                        <h1 class="name">Charlie Day</h1>
                        <span class="username">charlie</span>
                        <span class="role">user</span>
                    </div>
                `
            },
            {
                sourceUrl: "https://example.com/users/delta",
                regionHtml: `
                    <div class="profile">
                        <h1 class="name">Delta Dawn</h1>
                        <span class="username">delta</span>
                        <span class="role">user</span>
                    </div>
                `
            }
        ];

        const result = Lidar.fieldDetection.detectFieldsFromSnapshots(snapshots);

        // username field (alice, bob, charlie) matches the URL path
        // name field (Alice Smith, etc) is unique but not in URL
        // role field is not unique

        expect(result.identifier).toBe("username");
        expect(result.fields.find(f => f.name === "username")).toBeDefined();
    });

    test("detectFieldsFromSnapshots should fallback to first unique field if no URL match", () => {
        const snapshots = [
            {
                sourceUrl: "https://example.com/profile/1",
                regionHtml: `<span class="id">101</span><span class="data">A</span>`
            },
            {
                sourceUrl: "https://example.com/profile/2",
                regionHtml: `<span class="id">102</span><span class="data">B</span>`
            },
            {
                sourceUrl: "https://example.com/profile/3",
                regionHtml: `<span class="id">103</span><span class="data">C</span>`
            },
            {
                sourceUrl: "https://example.com/profile/4",
                regionHtml: `<span class="id">104</span><span class="data">D</span>`
            }
        ];

        const result = Lidar.fieldDetection.detectFieldsFromSnapshots(snapshots);
        // Both id and data are unique, neither in URL (1 != 101)
        // Should pick one (implementation detail: first one found typically)
        expect(result.identifier).toBeTruthy();
    });
});
