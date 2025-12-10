<!--
SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>

SPDX-License-Identifier: ISC
-->

## Database migrations

To allow safe schema upgrades, Lidar exposes a migration registry on `Lidar.db.registerMigration(version, fn)`.
Register migrations before initializing the DB (before calling `Lidar.db.initDB`). When the DB version is bumped, Lidar will run all migrations
from the existing version to the new version in order.

Migration function signature: `(database, transaction, context) => void`, where `context` is `{ from, to }`.

Example: add a new index to the `data` store and normalize existing records.

```js
// In src/background.js, before calling Lidar.db.initDB(indexedDB)
Lidar.db.registerMigration(2, (database, txn, context) => {
	// Create or update the `data` store
	if (database.objectStoreNames.contains('data')) {
		const dataStore = txn.objectStore('data');
		// Create new index (will throw if already exists; wrap in try-catch)
		try {
			dataStore.createIndex('sourceUrl', 'sourceUrl', { unique: false });
		} catch (e) {
			// Index may already exist in older DBs or in other migration paths
		}

		// Optionally migrate records: e.g. ensure `sourceUrl` exists
		const cursorReq = dataStore.openCursor();
		cursorReq.onsuccess = (evt) => {
			const cursor = evt.target.result;
			if (!cursor) return;
			const record = cursor.value;
			if (!record.sourceUrl) {
				record.sourceUrl = record.sourceUrl || '';
				cursor.update(record);
			}
			cursor.continue();
		};
	}
});

// Then bump DB_VERSION in `src/db.js` from 1 to 2 and call initDB as usual
// Lidar.db.initDB(indexedDB);
```

Notes:
- Migrations run inside the IndexedDB `onupgradeneeded` transaction. Use the `txn` parameter to operate on object stores.
- Keep migrations synchronous or use request callbacks inside the `txn` life-cycle; avoid using async/await that depends on external promises which may outlive the transaction.
- If a migration throws, the upgrade will be aborted and the DB won't be updated (so be careful).
- Always register migrations for each version increment and increase the `DB_VERSION` constant in `src/db.js`.
