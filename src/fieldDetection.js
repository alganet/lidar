// SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
//
// SPDX-License-Identifier: ISC

// Lidar Field Detection Module
// Diff-based field detection from DOM snapshots with extensible naming heuristics

(function () {
    'use strict';

    const globalObj = (typeof globalThis.__getLidarGlobal === 'function')
        ? globalThis.__getLidarGlobal()
        : ((typeof Lidar !== 'undefined' && typeof Lidar._getGlobal === 'function')
            ? Lidar._getGlobal()
            : (function () { throw new Error('Global accessor not initialized. Ensure src/global.js is loaded before this module.'); }()));

    // Threshold for minimum presence of a value across snapshots (fraction between 0 and 1).
    // Controls how many snapshots must contain a value for an element to be considered "present".
    const FIELD_PRESENCE_THRESHOLD = 0.5;

    // Minimum number of snapshots required for subset-based comparisons (e.g., diffs).
    // Many heuristics require at least a pair of snapshots to detect changes.
    const MIN_SUBSET_SNAPSHOTS = 2; 

    // Default CSS class names to ignore when deriving a name from element classes.
    // Exposed as a module-level constant so it can be adjusted in one place or replaced in tests.
    const IGNORED_CLASS_NAMES = new Set([
        'active', 'hidden', 'visible', 'wrapper', 'container', 'row', 'col',
        'clearfix', 'btn', 'button', 'input', 'form-control', 'text-muted'
    ]);

    // =========================================================================
    // NAMING HEURISTICS REGISTRY
    // =========================================================================

    const namingHeuristics = [];

    /**
     * Register a naming heuristic for field name inference.
     * @param {string} name - Heuristic identifier
     * @param {number} priority - Lower runs first
     * @param {function} fn - (element, context) => string|null
     */
    function registerNamingHeuristic(name, priority, fn) {
        namingHeuristics.push({ name, priority, fn });
        namingHeuristics.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Try all heuristics to infer a field name for an element.
     * @param {Element} element - The varying element
     * @param {object} context - Additional context (e.g., parsed DOM)
     * @returns {string} - Inferred field name or fallback
     */
    function inferFieldName(element, context) {
        for (const heuristic of namingHeuristics) {
            try {
                const name = heuristic.fn(element, context);
                if (name && typeof name === 'string' && name.trim()) {
                    return sanitizeFieldName(name.trim());
                }
            } catch {
                // Continue to next heuristic
            }
        }
        return null;
    }

    /**
     * Sanitize a string to be a valid field name.
     */
    function sanitizeFieldName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 50) || 'field';
    }

    // =========================================================================
    // BUILT-IN NAMING HEURISTICS
    // =========================================================================

    // 3. ID/Class detector: fallback signal
    registerNamingHeuristic('elementIdClass', 20, (element) => {
        // ID is strongest
        if (element.id && typeof element.id === 'string') {
            const id = element.id.trim();
            // Skip generated/generic IDs
            if (id && !/^(content|main|wrapper|container|root|app)$/i.test(id) && !/\d{5,}/.test(id)) {
                return id;
            }
        }

        // Class is good if meaningful
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/);
            // Find the most meaningful class (not generic styling)
            // Skip: btn, active, hidden, visible, wrapper, container, etc.
            const ignored = IGNORED_CLASS_NAMES;

            for (const cls of classes) {
                if (!ignored.has(cls) && cls.length > 2) {
                    return cls;
                }
            }
        }
        return null;
    });

    // 0. Label detector: <label for="id"> or adjacent "text:" pattern
    registerNamingHeuristic('labelDetector', 5, (element, context) => {
        const doc = context.document;

        // Check for <label for="elementId">
        if (element.id) {
            const label = doc.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) {
                return label.textContent;
            }
        }

        // Check for wrapping <label>
        const parentLabel = element.closest('label');
        if (parentLabel) {
            // Get text that's not from the element itself
            const clone = parentLabel.cloneNode(true);
            const elementClone = clone.querySelector(element.tagName.toLowerCase());
            if (elementClone) elementClone.remove();
            const labelText = clone.textContent?.trim();
            if (labelText) return labelText;
        }

        // Check for colon pattern in adjacent sibling (e.g., "user:" in HN table)
        const prevSibling = element.previousElementSibling;
        if (prevSibling) {
            const text = prevSibling.textContent?.trim();
            if (text && text.endsWith(':')) {
                return text.slice(0, -1);
            }
        }

        // Check parent's previous sibling (for table cells: <td>label:</td><td>value</td>)
        const parent = element.parentElement;
        if (parent && parent.tagName === 'TD') {
            const prevCell = parent.previousElementSibling;
            if (prevCell && prevCell.tagName === 'TD') {
                const text = prevCell.textContent?.trim();
                // Ensure it's not too long and looks like a label
                if (text && text.endsWith(':') && text.length < 40) {
                    return text.slice(0, -1);
                }
            }
        }

        return null;
    });

    // 1. Table header: use <th> at same column index
    registerNamingHeuristic('tableHeader', 10, (element) => {
        // Find containing TD
        const td = element.closest('td');
        if (!td) return null;

        const tr = td.parentElement;
        if (!tr || tr.tagName !== 'TR') return null;

        const table = tr.closest('table');
        if (!table) return null;

        // Get column index
        const cells = Array.from(tr.children);
        const colIndex = cells.indexOf(td);
        if (colIndex < 0) return null;

        // Find header row
        const thead = table.querySelector('thead');
        const headerRow = thead?.querySelector('tr') || table.querySelector('tr:first-child');
        if (!headerRow) return null;

        const headerCells = Array.from(headerRow.children);
        const th = headerCells[colIndex];
        if (th && (th.tagName === 'TH' || headerRow.parentElement?.tagName === 'THEAD')) {
            return th.textContent?.trim();
        }

        return null;
    });

    // 3. Sibling text: use preceding sibling's text content
    registerNamingHeuristic('siblingText', 30, (element) => {
        // Skip for large structural elements to avoid over-naming parents with child text
        if (/^(TABLE|THEAD|TBODY|TR|DIV|FORM|SECTION)$/.test(element.tagName)) {
            return null;
        }

        let prev = element.previousSibling;
        while (prev) {
            if (prev.nodeType === 3) { // Text node
                const text = prev.textContent?.trim();
                // Only use short text that looks like a label
                if (text && text.length > 2 && text.length < 30) {
                    return text.replace(/:$/, '');
                }
            } else if (prev.nodeType === 1) { // Element node
                // If it's a small element (span, b, i, strong), use its text
                if (/^(SPAN|B|I|STRONG|LABEL|TH)$/.test(prev.tagName)) {
                    const text = prev.textContent?.trim();
                    if (text && text.length > 2 && text.length < 30) {
                        return text.replace(/:$/, '');
                    }
                }
                break; // Only check immediate previous element if it's not a small text element
            }
            prev = prev.previousSibling;
        }
        return null;
    });

    // 2. Attribute-based: aria-label, name, data-field, placeholder
    registerNamingHeuristic('attributeBased', 15, (element) => {
        const attrs = ['aria-label', 'name', 'data-field', 'data-name', 'placeholder', 'title'];
        for (const attr of attrs) {
            const value = element.getAttribute?.(attr);
            if (value && value.trim()) {
                return value;
            }
        }
        return null;
    });

    // 5. Fallback: will be handled in detectFields with counter

    // =========================================================================
    // DIFF ENGINE
    // =========================================================================

    /**
     * Parse HTML string into a document fragment.
     */
    function parseHtml(html) {
        if (typeof DOMParser !== 'undefined') {
            const parser = new DOMParser();
            return parser.parseFromString(`<div>${html}</div>`, 'text/html').body.firstChild;
        }
        // Fallback for non-browser environments (testing)
        if (typeof document !== 'undefined') {
            const div = document.createElement('div');
            div.innerHTML = html;
            return div;
        }
        throw new Error('DOMParser and document are not available (cannot parse HTML in this environment)');
    }

    /**
     * Generate a structural path for an element (position-based, ignoring content).
     */
    function getStructuralPath(node) {
        const path = [];
        let current = node;
        while (current && current.parentNode) {
            const parent = current.parentNode;
            if (parent.nodeType === 9) break; // Stop at Document

            const siblings = Array.from(parent.childNodes);
            const index = siblings.indexOf(current);
            const name = current.nodeType === 3 ? 'text' : (current.tagName ? current.tagName.toLowerCase() : 'node');
            path.unshift(`${name}[${index}]`);
            current = parent;
            if (current.tagName === 'BODY') break;
        }
        return path.join('/');
    }


    /**
     * Get text content of an element (direct text only, not children).
     * Reserved for future use with more advanced heuristics.
     */
    // eslint-disable-next-line no-unused-vars
    function getDirectTextContent(element) {
        let text = '';
        for (const node of element.childNodes) {
            if (node.nodeType === 3) { // Text node
                text += node.textContent;
            }
        }
        return text.trim();
    }

    /**
     * Get all text-bearing elements in a container.
     * Reserved for future use with more advanced heuristics.
     */
    // eslint-disable-next-line no-unused-vars
    function getTextBearingElements(container) {
        const elements = [];
        const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (!doc) return [];

        const walker = doc.createTreeWalker(
            container,
            1, // NodeFilter.SHOW_ELEMENT
            null,
            false
        );

        let node = walker.nextNode();
        while (node) {
            const text = node.textContent?.trim();
            if (text && text.length > 0) {
                elements.push(node);
            }
            node = walker.nextNode();
        }
        return elements;
    }


    /**
     * Find elements that vary across a specific subset of snapshots.
     * @param {string[]} allSnapshots - All HTML strings
     * @param {number[]} subsetIndices - Indices of snapshots to use
     * @param {Map} pathToValues - Pre-computed path-to-values map
     * @returns {Array<{structuralPath, selector, values}>}
     */
    function findVaryingElements(snapshots, subsetIndices, pathToValues) {
        if (!snapshots || snapshots.length === 0) return [];

        const indices = subsetIndices || snapshots.map((_, i) => i);
        if (indices.length < MIN_SUBSET_SNAPSHOTS) return [];

        const parsedSnapshots = snapshots.map(html => parseHtml(html));

        // If pathToValues not provided, compute it for the given snapshots
        const valuesMap = pathToValues || new Map();
        if (!pathToValues) {
            parsedSnapshots.forEach((container, snapshotIndex) => {
                const walker = document.createTreeWalker(container, 5, null, false);
                let node = walker.nextNode();
                while (node) {
                    const path = getStructuralPath(node);
                    if (!valuesMap.has(path)) {
                        valuesMap.set(path, { structuralPath: path, element: node, nodeType: node.nodeType, values: [] });
                    }
                    valuesMap.get(path).values[snapshotIndex] = node.nodeType === 3 ? node.textContent : Lidar.scraping.getElementValue(node);
                    node = walker.nextNode();
                }
            });
        }

        const varyingElements = [];

        for (const [, entry] of valuesMap) {
            if (entry.nodeType !== 1) continue;

            const subsetValues = indices.map(i => entry.values[i]);
            const definedValues = subsetValues.filter(v => v !== undefined);

            if (definedValues.length < indices.length * FIELD_PRESENCE_THRESHOLD) continue;

            // Must have varying content within the subset
            const uniqueValues = new Set(definedValues);
            if (uniqueValues.size <= 1) continue;
            if (definedValues.every(v => !v)) continue;

            const firstExistingIndex = subsetValues.findIndex(v => v !== undefined);
            const sourceSnapshotIndex = indices[firstExistingIndex];
            const sourceContainer = parsedSnapshots[sourceSnapshotIndex];
            const root = sourceContainer?.body?.firstElementChild || sourceContainer;

            varyingElements.push({
                structuralPath: entry.structuralPath,
                element: entry.element,
                values: definedValues,
                selector: Lidar.scraping.generateSelector(entry.element, root)
            });
        }

        // Specificity Filter (refined for subset)
        return varyingElements.filter(parent => {
            const children = varyingElements.filter(child =>
                parent !== child && parent.element.contains(child.element)
            );

            if (children.length === 0) return true;

            for (const [path, entry] of valuesMap) {
                if (path === parent.structuralPath) continue;
                if (!path.startsWith(parent.structuralPath + '/')) continue;

                const subsetValues = indices.map(i => entry.values[i]);
                const vals = subsetValues.filter(v => v !== undefined);
                if (vals.length !== indices.length) continue;
                if (new Set(vals).size <= 1) continue;

                const insideChildren = children.some(child =>
                    path === child.structuralPath || path.startsWith(child.structuralPath + '/')
                );

                if (!insideChildren) return true;
            }
            return false;
        });
    }

    // =========================================================================
    // MAIN DETECTION FUNCTION
    // =========================================================================

    /**
     * Detect fields from multiple DOM snapshots.
     * @param {Array<{regionHtml: string, sourceUrl: string}>} snapshots
     * @returns {{fields: Array<{name, selector, sampleValues}>, identifier: string|null}}
     */
    function detectFieldsFromSnapshots(snapshots) {
        if (!snapshots || snapshots.length === 0) {
            return { fields: [], identifier: null, error: 'No snapshots provided' };
        }

        const htmlSnapshots = snapshots.map(s => s.regionHtml);
        const parsedSnapshots = htmlSnapshots.map(html => parseHtml(html));
        const pathToValues = new Map();

        // 1. Collect all paths and values across all snapshots
        parsedSnapshots.forEach((container, snapshotIndex) => {
            const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
            if (!doc) return;
            const walker = doc.createTreeWalker(container, 5, null, false);
            let node = walker.nextNode();
            while (node) {
                const path = getStructuralPath(node);
                if (!pathToValues.has(path)) {
                    pathToValues.set(path, { structuralPath: path, element: node, nodeType: node.nodeType, values: [] });
                }
                pathToValues.get(path).values[snapshotIndex] = node.nodeType === 3 ? node.textContent : Lidar.scraping.getElementValue(node);
                node = walker.nextNode();
            }
        });

        // 2. Identify snapshots with structural overlap > 50% anchored to first snapshot
        const snapshotStructures = parsedSnapshots.map((_, i) => {
            const paths = new Set();
            for (const [path, entry] of pathToValues) {
                if (entry.values[i] !== undefined) paths.add(path);
            }
            return paths;
        });

        const referencePaths = snapshotStructures[0];
        let bestSubset = [0]; // Always include the anchor

        // If the first snapshot has no paths and all snapshots are empty,
        // consider all snapshots as the subset (handle empty pages gracefully)
        const allEmpty = snapshotStructures.every(s => s.size === 0);
        if (referencePaths.size === 0 && allEmpty) {
            bestSubset = snapshots.map((_, i) => i);
        } else if (referencePaths.size > 0) {
            for (let i = 1; i < snapshotStructures.length; i++) {
                const paths = snapshotStructures[i];
                let intersection = 0;
                for (const path of paths) {
                    if (referencePaths.has(path)) intersection++;
                }

                const overlap = intersection / referencePaths.size;
                if (overlap > FIELD_PRESENCE_THRESHOLD) {
                    bestSubset.push(i);
                }
            }
        }

        if (bestSubset.length < MIN_SUBSET_SNAPSHOTS) {
            return {
                fields: [],
                identifier: null,
                error: `Need at least ${MIN_SUBSET_SNAPSHOTS} consistent snapshots for robust detection (Found: ${bestSubset.length})`
            };
        }

        // 3. Find varying elements for the best subset
        const varyingElements = findVaryingElements(htmlSnapshots, bestSubset, pathToValues);

        if (varyingElements.length === 0) {
            const subsetSnapshots = bestSubset.map(i => snapshots[i]);
            return {
                fields: [],
                identifier: null,
                urlPattern: Lidar.rules.crystallizeUrlPattern(subsetSnapshots.map(s => s.sourceUrl))
            };
        }

        const subsetSnapshots = bestSubset.map(i => snapshots[i]);
        const firstContainer = parsedSnapshots[bestSubset[0]];
        const doc = firstContainer.ownerDocument || (typeof document !== 'undefined' ? document : null);
        const context = { document: doc };

        let fallbackCounter = 1;
        const fields = varyingElements.map(el => {
            let name = inferFieldName(el.element, context);
            if (!name) name = `field_${fallbackCounter++}`;
            return { name, selector: el.selector, sampleValues: el.values };
        });

        // Deduplicate
        const nameCount = {};
        for (const field of fields) {
            if (nameCount[field.name]) {
                nameCount[field.name]++;
                field.name = `${field.name}_${nameCount[field.name]}`;
            } else {
                nameCount[field.name] = 1;
            }
        }

        return {
            fields,
            identifier: detectBestIdentifier(fields, subsetSnapshots),
            urlPattern: Lidar.rules.crystallizeUrlPattern(subsetSnapshots.map(s => s.sourceUrl))
        };
    }

    /**
     * Select the best identifier field based on uniqueness and URL presence.
     */
    function detectBestIdentifier(fields, snapshots) {
        if (!fields || fields.length === 0) return null;

        let bestField = null;
        let maxScore = -1;

        for (const field of fields) {
            let score = 0;
            const uniqueValues = new Set(field.sampleValues);

            // Constraint: Must be unique across all snapshots
            if (uniqueValues.size !== field.sampleValues.length) {
                continue; // Cannot be an identifier if not unique
            }

            score += 10; // Base score for uniqueness

            // Heuristic: Value appears in the source URL
            let matchesUrlCount = 0;
            for (let i = 0; i < snapshots.length; i++) {
                const val = field.sampleValues[i];
                const url = snapshots[i].sourceUrl;
                if (val && url && url.includes(val)) {
                    matchesUrlCount++;
                }
            }

            if (matchesUrlCount === snapshots.length) {
                score += 50; // Strong signal: appearances in all URLs
            } else if (matchesUrlCount > 0) {
                score += 5 * matchesUrlCount; // Weak signal
            }

            // Heuristic: Prefer "id" or "uid" or "username" in field name
            if (/^(id|uid|uuid|username|identifier)$/i.test(field.name)) {
                score += 20;
            } else if (/id/i.test(field.name)) {
                score += 5;
            }

            // Heuristic: Prefer shorter values (ids are usually short)
            const avgLength = field.sampleValues.reduce((sum, v) => sum + (v ? v.length : 0), 0) / field.sampleValues.length;
            if (avgLength < 20) {
                score += 5;
            }

            if (score > maxScore) {
                maxScore = score;
                bestField = field.name;
            }
        }

        // Fallback: if no field is perfectly unique, we might not have a reliable identifier
        // But for now, if no candidate passed the uniqueness check, fall back to first field?
        // The original logic picked the first unique field. Our loop above filters by uniqueness.
        // If maxScore is still -1, it means no unique field was found.

        if (bestField) return bestField;

        // Fallback to first field if nothing is unique (legacy behavior, though technically bad for ID)
        return fields[0]?.name || null;
    }
    // =========================================================================
    // EXPORTS
    // =========================================================================

    globalObj.Lidar.fieldDetection = {
        // Main API
        detectFieldsFromSnapshots,

        // For testing / extensibility
        registerNamingHeuristic,
        inferFieldName,
        findVaryingElements,
        sanitizeFieldName,

        // Utilities
        parseHtml,
        getStructuralPath,
        generateSelector: (element, root) => globalObj.Lidar.scraping.generateSelector(element, root)
    };
})();
