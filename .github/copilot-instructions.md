Project: Lidar — AI Agent Instructions

This repository is a browser extension (Chrome/Firefox) that auto-scrapes pages using user-defined rules.

Key Architecture
- Background (service worker): `src/background.js` - handles runtime messages, DB operations and badge updates.
- Content scripts: `src/panel.js`, `src/autoapply.js` - UI injection + automatic scraping observer.
- UI: `src/panel.html` + `src/panel.css` rendered inside a closed Shadow DOM in `panel.js`.
- Scraping/logic: `src/scraping.js`, `src/rules.js`, `src/messaging.js` - DOM scraping, rule matching, and runtime messaging.
- DB: `src/db.js` - IndexedDB with a simple migration registry via `registerMigration()` and `DB_VERSION`.

Developer Workflows
- Tests: `npm test` (unit tests in `tests/unit`), `npm run test:watch`, `npm run test:coverage`.
- Lint: `npm run lint` (ESLint configured to validate `src` files).
- Packaging: `make chrome` / `make firefox` (uses `manifest_chrome.json`/ `manifest_firefox.json` and zips `src` + `icons`).
- Run in dev browser: load unpacked extension from repo root; for packaged, use created zip/xpi.

Project Conventions and Patterns
- Global namespace: every module attaches to the global `Lidar` object (`self.Lidar` / `window.Lidar`) — use this when adding modules.
- IIFE modules: JS files use IIFE wrappers; maintain compatibility import patterns (no ES module exports).
- Tests: `tests/setup.js` sets up `fake-indexeddb`, `global.chrome`, `global.crypto`, and `global.Lidar`. Tests expect `global.self = global` for modules that read `self`.
- IndexedDB migrations: add migrations via `Lidar.db.registerMigration(version, fn)` and bump `DB_VERSION` in `src/db.js`.
- ID generation: based on `crypto.randomUUID()` (mocked in tests), use `Lidar.db.generateId()` where appropriate.
- MV3 vs MV2 compatibility: prefer `chrome.action`, fallback to `chrome.browserAction`. See `src/badge.js` and `src/background.js` for detection patterns.
- Script injection: `background.js` injects `messaging.js`, `rules.js`, `scraping.js` before `panel.js` (order matters).
- Selector generation: `scraping.generateSelector` avoids elements with `lidar` prefixes and limits class tokens — follow this style if modifying selector strategies.

Integration Points & APIs
- Chrome extension APIs: `chrome.runtime`, `chrome.scripting.executeScript`, `chrome.tabs.*`, `chrome.action/browserAction` used throughout.
- IndexedDB: `src/db.js` defines stores `rules` and `data` with indexes `ruleId`, `identifier`, `ruleId_identifier`.
- Messaging contract: Background listens for messages with { action } and responds with async responses (see `background.js`); content scripts use `Lidar.messaging.sendMessage(...)`.

Testing Notes for AI Changes
- Unit tests use `fake-indexeddb` and run in Node + jsdom; keep external DOM/API usage minimal and mockable.
- When editing DB schema, add a migration and test via `tests/unit/db.test.js` to ensure `initDB` and endpoints behave.
- For cross-browser behavior, add unit tests that mock both `chrome.action` and `chrome.browserAction` (see `tests/unit/badge.test.js`).
- Module-loading: many modules assume `global.Lidar` exists and export into it; unit tests call `require('../../src/foo.js')` after setting up the global object.

Helpful Short Examples
- Inject scripts in tests/mocks: require `src/messaging.js`, `src/rules.js`, `src/scraping.js` before testing `panel.js` behavior.
- Add DB migration:
  - Call `Lidar.db.registerMigration(2, (db, txn) => { /* use txn.objectStore('data') */ })` then bump `DB_VERSION` in `src/db.js`.
- Simulate MV2/MV3 in tests: set `global.chrome.action` or `global.chrome.browserAction` and adjust `spy.length` to mimic API parameter differences.

If anything here is ambiguous or you'd like it expanded (e.g. add more examples, test patterns, or a troubleshooting section), say which part and I’ll iterate.
