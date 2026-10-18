/**
 * OneDrive Harvester v1.0.0
 * Automated Recursive DFS Bulk Downloader & Cockpit for modern Microsoft SharePoint & OneDrive
 *
 * https://github.com/onedrive-harvester/onedrive-harvester
 * License: MIT
 */

(async function initOneDriveHarvester() {
    'use strict';

    // ========================================================
    // 1. RESOLVE ACTIVE TARGET DOCUMENT (Main window vs Iframe)
    // ========================================================
    function getActiveDocument() {
        if (document.querySelector('[data-automationid*="crumb" i], [class*="breadcrumb" i], [data-item-key], [data-automationid="fileRowItemName"], [role="row"]')) {
            return document;
        }

        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const ifr of iframes) {
            try {
                const frameDoc = ifr.contentDocument || ifr.contentWindow?.document;
                if (frameDoc && frameDoc.querySelector('[data-automationid*="crumb" i], [class*="breadcrumb" i], [data-item-key], [data-automationid="fileRowItemName"], [role="row"]')) {
                    return frameDoc;
                }
            } catch (e) {} // Cross-origin isolation guard
        }

        return document;
    }

    let doc = getActiveDocument();

    // ========================================================
    // 2. CONFIGURATION (Live HUD adjustable)
    // ========================================================
    const config = {
        maxZipBytes: 10 * 1024 * 1024 * 1024, // 10 GB limit
        folderWaitMs: 8000,                   // Wait for MS zip creation on folders
        fileWaitMs: 4000,                     // Wait for file/batch download initiation
        stepDelayMs: 800,                     // UI selection settling delay
        fileMode: 'batch'                     // 'batch' (OneDrive_*.zip) vs 'individual' (own filenames)
    };

    let isPaused = false;
    let isStopped = false;
    let totalDownloads = 0;
    let totalFilesDownloaded = 0;
    let startTime = null;
    let timerInterval = null;

    const processedPaths = new Set();
    const downloadManifest = [];
    const skippedItems = [];

    // ========================================================
    // 3. INJECT STYLESHEET & BUILD HUD INTERFACE
    // ========================================================
    const styleId = 'odh-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #od-harvester-hud {
                position: fixed; bottom: 20px; right: 20px; width: 550px;
                background: #11121d; color: #e6e6f0; border-radius: 12px; z-index: 99999999;
                box-shadow: 0 16px 50px rgba(0,0,0,0.85); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #2a2b42;
            }
            .odh-head { padding: 10px 16px; background: #1a1b2b; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2a2b42; }
            .odh-badge { font-size: 10px; background: #22253b; color: #64b5f6; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
            .odh-status { font-size: 11px; padding: 3px 9px; border-radius: 20px; background: #3d3e54; font-weight: 600; color: #fff; }
            .odh-grid { padding: 10px 16px; background: #141524; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; border-bottom: 1px solid #212236; font-size: 12px; }
            .odh-grid span { color: #727494; }
            .odh-grid strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .odh-tabs { display: flex; background: #161726; border-bottom: 1px solid #212236; }
            .odh-tab-btn { flex: 1; padding: 7px; background: #161726; color: #888aa8; border: none; font-size: 11px; font-weight: 600; cursor: pointer; }
            .odh-tab-btn.active { color: #64b5f6; border-bottom: 2px solid #64b5f6; }
            .odh-tab-content { padding: 10px; height: 180px; overflow-y: auto; background: #0a0b12; font-size: 11px; }
            #odh-tab-logs { font-family: Consolas, monospace; color: #9da3be; }
            .odh-footer { padding: 10px 16px; background: #141524; display: flex; gap: 8px; border-top: 1px solid #212236; }
            .odh-btn { padding: 9px; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; color: #fff; }
            .odh-table { width: 100%; border-collapse: collapse; }
            .odh-table th { padding: 4px; color: #727494; text-align: left; border-bottom: 1px solid #1a1b2b; }
            .odh-table td { padding: 4px; border-bottom: 1px solid #1a1b2b; }
            .odh-input { width: 70px; background: #1a1b2b; color: #fff; border: 1px solid #33344d; border-radius: 4px; padding: 4px 6px; text-align: right; }
            .odh-select { background: #1a1b2b; color: #64b5f6; border: 1px solid #33344d; border-radius: 4px; padding: 4px 6px; }
        `;
        document.head.appendChild(style);
    }

    const oldHud = document.getElementById('od-harvester-hud') || document.getElementById('od-cockpit-hud-v13') || document.getElementById('od-cockpit-hud-v12');
    if (oldHud) oldHud.remove();

    const hud = document.createElement('div');
    hud.id = 'od-harvester-hud';
    hud.innerHTML = `
        <div class="odh-head">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">🌾</span>
                <span style="font-weight: 700; color: #fff;">OneDrive Harvester</span>
                <span class="odh-badge">v1.0</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span id="odh-badge" class="odh-status">IDLE</span>
                <button id="odh-minimize-btn" style="background: none; border: none; color: #a4b0be; cursor: pointer; font-size: 14px; padding: 0 4px;" title="Minimize">🗕</button>
            </div>
        </div>

        <div id="odh-main-body" style="display: flex; flex-direction: column;">
            <div class="odh-grid">
                <div><span>Current Folder:</span> <strong id="odh-folder" style="color: #64b5f6;">Detecting...</strong></div>
                <div><span>Status:</span> <strong id="odh-action" style="color: #81c784;">Ready</strong></div>
                <div><span>Downloads:</span> <strong id="odh-count" style="color: #ffb74d;">0</strong></div>
                <div><span>Elapsed:</span> <strong id="odh-timer" style="color: #e0e0e0;">00:00</strong></div>
            </div>

            <div class="odh-tabs">
                <button class="odh-tab-btn active" data-tab="odh-tab-logs">📋 Log</button>
                <button class="odh-tab-btn" data-tab="odh-tab-history">📦 Downloads (<span id="odh-queue-badge">0</span>)</button>
                <button class="odh-tab-btn" data-tab="odh-tab-skipped">🚫 Skipped (<span id="odh-skipped-badge" style="color: #ef5350;">0</span>)</button>
                <button class="odh-tab-btn" data-tab="odh-tab-settings">⚙️ Settings</button>
            </div>

            <div id="odh-tab-logs" class="odh-tab-content"></div>

            <div id="odh-tab-history" class="odh-tab-content" style="display: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="color: #727494; font-size: 11px;">Transfers & Archives:</span>
                    <button id="odh-btn-export" style="background: #2a2b42; color: #64b5f6; border: 1px solid #3d3e5e; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer;">📥 Export Manifest (JSON)</button>
                </div>
                <table class="odh-table">
                    <thead>
                        <tr>
                            <th>Downloaded Item / Archive</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody id="odh-history-tbody"></tbody>
                </table>
            </div>

            <div id="odh-tab-skipped" class="odh-tab-content" style="display: none;">
                <div style="color: #ef5350; font-size: 11px; margin-bottom: 6px;">🚫 Items skipped (> 10 GB limit or errors):</div>
                <table class="odh-table">
                    <thead>
                        <tr>
                            <th>Item Name</th>
                            <th>Size</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody id="odh-skipped-tbody"></tbody>
                </table>
            </div>

            <div id="odh-tab-settings" class="odh-tab-content" style="display: none; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label>File Download Mode:</label>
                    <select id="odh-cfg-file-mode" class="odh-select">
                        <option value="batch" selected>Batch ZIP (Fastest, OneDrive_*.zip)</option>
                        <option value="individual">Individual Files (Original Filenames)</option>
                    </select>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label>Zip Limit Threshold (GB):</label>
                    <input id="odh-cfg-max-gb" class="odh-input" type="number" value="10" min="1" max="15">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label>Folder Zip Wait (sec):</label>
                    <input id="odh-cfg-folder-wait" class="odh-input" type="number" value="8" min="3" max="30">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label>File/Batch Download Wait (sec):</label>
                    <input id="odh-cfg-file-wait" class="odh-input" type="number" value="4" min="1" max="15">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label>Selection Step Delay (sec):</label>
                    <input id="odh-cfg-step-delay" class="odh-input" type="number" value="0.8" step="0.1" min="0.3" max="3">
                </div>
            </div>

            <div class="odh-footer">
                <button id="odh-btn-start" class="odh-btn" style="flex: 2; background: #2e7d32; display: flex; justify-content: center; align-items: center; gap: 6px;">
                    <span>▶</span> <span id="odh-btn-start-label">Start Harvesting</span>
                </button>
                <button id="odh-btn-pause" class="odh-btn" style="flex: 1; background: #f57c00;" disabled>⏸ Pause</button>
                <button id="odh-btn-stop" class="odh-btn" style="flex: 1; background: #c62828;" disabled>⏹ Stop</button>
            </div>
        </div>
    `;
    document.body.appendChild(hud);

    const logBox = hud.querySelector('#odh-tab-logs');
    const folderTxt = hud.querySelector('#odh-folder');
    const actionTxt = hud.querySelector('#odh-action');
    const countTxt = hud.querySelector('#odh-count');
    const timerTxt = hud.querySelector('#odh-timer');
    const badge = hud.querySelector('#odh-badge');
    const queueBadge = hud.querySelector('#odh-queue-badge');
    const skippedBadge = hud.querySelector('#odh-skipped-badge');
    const historyTbody = hud.querySelector('#odh-history-tbody');
    const skippedTbody = hud.querySelector('#odh-skipped-tbody');
    const btnStart = hud.querySelector('#odh-btn-start');
    const btnStartLabel = hud.querySelector('#odh-btn-start-label');
    const btnPause = hud.querySelector('#odh-btn-pause');
    const btnStop = hud.querySelector('#odh-btn-stop');
    const btnExportManifest = hud.querySelector('#odh-btn-export');
    const mainBody = hud.querySelector('#odh-main-body');
    const minimizeBtn = hud.querySelector('#odh-minimize-btn');

    // Tab Switching
    const tabBtns = hud.querySelectorAll('.odh-tab-btn');
    const tabContents = hud.querySelectorAll('.odh-tab-content');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            hud.querySelector(`#${btn.dataset.tab}`).style.display = btn.dataset.tab === 'odh-tab-settings' ? 'flex' : 'block';
        };
    });

    let isMinimized = false;
    minimizeBtn.onclick = () => {
        isMinimized = !isMinimized;
        mainBody.style.display = isMinimized ? 'none' : 'flex';
        minimizeBtn.innerText = isMinimized ? '🗖' : '🗕';
    };

    function log(msg, color = '#9da3be') {
        const time = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.style.color = color;
        line.style.marginBottom = '2px';
        line.innerHTML = `<span style="color: #555;">[${time}]</span> ${msg}`;
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
        console.log(`[OD-Harvester] ${msg}`);
    }

    function sanitizeName(name) {
        return name.replace(/\s+/g, '_').replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
    }

    function updateDownloadStats() {
        if (config.fileMode === 'batch') {
            countTxt.innerText = `${totalDownloads} archives (${totalFilesDownloaded} files)`;
        } else {
            countTxt.innerText = `${totalDownloads} item(s)`;
        }
        queueBadge.innerText = totalDownloads;
    }

    function recordFolderDownload(folderName, folderPath, sizeBytes) {
        totalDownloads++;
        updateDownloadStats();
        const time = new Date().toLocaleTimeString();
        const diskName = `${sanitizeName(folderName)}.zip (or OneDrive_*.zip)`;

        downloadManifest.push({
            type: 'folder',
            name: folderName,
            folderPath: folderPath,
            expectedDiskName: diskName,
            sizeBytes: sizeBytes,
            timestamp: time
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Folder: ${folderName}\nPath: ${folderPath}">📁 ${sanitizeName(folderName)}.zip</td>
            <td style="color: #64b5f6;">Folder ZIP</td>
            <td style="color: #a4b0be;">${formatBytes(sizeBytes)}</td>
            <td style="color: #727494;">${time}</td>
        `;
        historyTbody.prepend(tr);
    }

    function recordBatchDownload(folderPath, batchFiles, totalBytes) {
        totalDownloads++;
        totalFilesDownloaded += batchFiles.length;
        updateDownloadStats();
        const time = new Date().toLocaleTimeString();
        const fileNames = batchFiles.map(f => f.name).join(', ');

        downloadManifest.push({
            type: 'batch_zip',
            folderPath: folderPath,
            expectedDiskName: 'OneDrive_<Date>.zip',
            fileCount: batchFiles.length,
            files: batchFiles.map(f => ({ name: f.name, size: f.sizeBytes })),
            totalBytes: totalBytes,
            timestamp: time
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Archive files (${batchFiles.length}):\n${fileNames}">📦 OneDrive_Archive.zip (${batchFiles.length} files)</td>
            <td style="color: #ba68c8;">Batch ZIP</td>
            <td style="color: #a4b0be;">${formatBytes(totalBytes)}</td>
            <td style="color: #727494;">${time}</td>
        `;
        historyTbody.prepend(tr);
    }

    function recordSingleFileDownload(fileName, filePath, sizeBytes) {
        totalDownloads++;
        totalFilesDownloaded++;
        updateDownloadStats();
        const time = new Date().toLocaleTimeString();

        downloadManifest.push({
            type: 'file',
            name: fileName,
            filePath: filePath,
            expectedDiskName: fileName,
            sizeBytes: sizeBytes,
            timestamp: time
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fileName}">📄 ${sanitizeName(fileName)}</td>
            <td style="color: #81c784;">File</td>
            <td style="color: #a4b0be;">${formatBytes(sizeBytes)}</td>
            <td style="color: #727494;">${time}</td>
        `;
        historyTbody.prepend(tr);
    }

    function recordSkipped(itemName, sizeBytes, reason) {
        skippedItems.push({ itemName, sizeBytes, reason });
        skippedBadge.innerText = skippedItems.length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ef5350;" title="${itemName}">${sanitizeName(itemName)}</td>
            <td style="color: #a4b0be;">${formatBytes(sizeBytes)}</td>
            <td style="color: #ffb74d;">${reason}</td>
        `;
        skippedTbody.prepend(tr);
    }

    btnExportManifest.onclick = () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(downloadManifest, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `onedrive_manifest_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        log(`📥 Exported download manifest with ${downloadManifest.length} archive/file records.`, '#81c784');
    };

    function syncLiveSettings() {
        const mode = hud.querySelector('#odh-cfg-file-mode').value;
        config.fileMode = mode;

        const gb = parseFloat(hud.querySelector('#odh-cfg-max-gb').value);
        if (!isNaN(gb) && gb > 0) config.maxZipBytes = gb * 1024 * 1024 * 1024;

        const fWait = parseFloat(hud.querySelector('#odh-cfg-folder-wait').value);
        if (!isNaN(fWait) && fWait > 0) config.folderWaitMs = fWait * 1000;

        const fileWait = parseFloat(hud.querySelector('#odh-cfg-file-wait').value);
        if (!isNaN(fileWait) && fileWait > 0) config.fileWaitMs = fileWait * 1000;

        const sDelay = parseFloat(hud.querySelector('#odh-cfg-step-delay').value);
        if (!isNaN(sDelay) && sDelay > 0) config.stepDelayMs = sDelay * 1000;
    }

    function updateTimer() {
        if (!startTime) return;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        timerTxt.innerText = `${mins}:${secs}`;
    }

    async function checkPause() {
        while (isPaused && !isStopped) {
            await sleep(500);
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return 'Unknown Size';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ========================================================
    // 4. BREADCRUMB & LOCATION DETECTION (PURE DOM)
    // ========================================================
    function getVisibleBreadcrumbItems() {
        const ol = doc.querySelector('ol[data-automationid="breadcrumb-root-id"], ol[class*="breadcrumbList"]');
        if (ol) {
            const lis = Array.from(ol.querySelectorAll('li'));
            if (lis.length > 0) return lis;
        }

        const nav = doc.querySelector('nav[aria-label*="Breadcrumb" i]');
        if (nav) {
            const items = Array.from(nav.querySelectorAll('li, a, button, [aria-current="page"]'));
            if (items.length > 0) return items;
        }

        const items = Array.from(doc.querySelectorAll('[data-automationid="breadcrumb-listitem"]'));
        if (items.length > 0) return items;

        const keys = Array.from(doc.querySelectorAll('[data-item-key]'));
        if (keys.length > 0) return keys;

        return [];
    }

    function getLiveLocation() {
        const crumbs = getVisibleBreadcrumbItems();
        if (crumbs.length > 0) {
            const lastCrumb = crumbs[crumbs.length - 1];
            const keyAttr = lastCrumb.getAttribute('data-item-key');
            let siteUrl = window.location.origin;
            let folderPath = null;

            if (keyAttr) {
                try {
                    const parsed = JSON.parse(keyAttr);
                    siteUrl = parsed[1] || siteUrl;
                    folderPath = parsed[4] || parsed[2];
                } catch (e) {}
            }

            const crumbNameEl = lastCrumb.querySelector('[data-automationid="breadcrumb-crumb"], button, div, h2, a') || lastCrumb;
            const folderName = (crumbNameEl ? crumbNameEl.textContent : '').trim() || (folderPath ? folderPath.split('/').filter(Boolean).pop() : 'Root');

            return {
                siteUrl,
                folderPath: folderPath || ('/' + folderName),
                folderName,
                depth: crumbs.length
            };
        }

        const id = new URLSearchParams(window.location.search).get('id');
        if (id) {
            const decoded = decodeURIComponent(id);
            const folderName = decoded.split('/').filter(Boolean).pop() || 'Folder';
            return {
                siteUrl: window.location.origin,
                folderPath: decoded,
                folderName: folderName,
                depth: decoded.split('/').filter(Boolean).length
            };
        }

        const heading = doc.querySelector('h1, h2, [data-automationid="breadcrumb-crumb"]');
        const headingText = heading ? heading.textContent.trim() : '';
        const folderName = headingText || doc.title.split('-')[0].trim() || 'Current_Folder';
        return {
            siteUrl: window.location.origin,
            folderPath: '/' + folderName,
            folderName: folderName,
            depth: 1
        };
    }

    const initialLoc = getLiveLocation();
    folderTxt.innerText = initialLoc.folderName;
    folderTxt.title = initialLoc.folderPath;

    // ========================================================
    // 5. DETAILS PANE & SIZE EXTRACTION
    // ========================================================
    function ensureDetailsPaneOpen() {
        const pane = doc.querySelector('[data-automationid="detailsPane"], aside, [class*="detailsPane" i], [class*="DetailsPanel" i], [class*="ms-Panel" i]')
                  || document.querySelector('[data-automationid="detailsPane"], aside, [class*="detailsPane" i], [class*="DetailsPanel" i]');
        if (!pane) {
            const buttons = [
                ...Array.from(doc.querySelectorAll('button')),
                ...(doc !== document ? Array.from(document.querySelectorAll('button')) : [])
            ];
            const infoBtn = buttons.find(b => {
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const title = (b.getAttribute('title') || '').toLowerCase();
                const hasInfoIcon = !!b.querySelector('[data-icon-name*="Info" i], [name*="Info" i], svg[class*="info" i]');
                return aria.includes('details') || title.includes('details') || b.getAttribute('data-automationid') === 'infoCommand' || hasInfoIcon;
            });
            if (infoBtn) {
                infoBtn.click();
            }
        }
    }

    function readLiveSizeFromDetailsPane() {
        const pane = doc.querySelector('[data-automationid="detailsPane"], aside, [class*="detailsPane" i], [class*="DetailsPanel" i], [class*="ms-Panel" i]')
                  || document.querySelector('[data-automationid="detailsPane"], aside, [class*="detailsPane" i], [class*="DetailsPanel" i]');
        if (!pane) return null;

        const text = pane.innerText || '';
        const match = text.match(/Size\s*[\n:]*\s*([\d\.,]+)\s*(GB|MB|KB|Bytes|B)/i);
        if (match) {
            const val = parseFloat(match[1].replace(',', '.'));
            const unit = match[2].toUpperCase();
            let bytes = val;
            if (unit === 'KB') bytes *= 1024;
            if (unit === 'MB') bytes *= 1024 * 1024;
            if (unit === 'GB') bytes *= 1024 * 1024 * 1024;
            return bytes;
        }
        return null;
    }

    async function queryExactFolderSize(siteUrl, serverRelativePath) {
        if (!siteUrl || !serverRelativePath) return null;
        try {
            const cleanUrl = serverRelativePath.replace(/'/g, "''");
            const apiUrl = `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(cleanUrl).replace(/'/g, "%27")}')?$select=StorageMetrics&$expand=StorageMetrics`;
            const resp = await fetch(apiUrl, { headers: { "Accept": "application/json;odata=verbose" } });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.d?.StorageMetrics?.TotalFileStreamSize ?? data.d?.StorageMetrics?.TotalSize ?? null;
        } catch {
            return null;
        }
    }

    function parseSizeFromRow(itemEl) {
        if (!itemEl) return null;
        const cells = Array.from(itemEl.querySelectorAll('[role="gridcell"], div[class*="cell"]'));
        for (const cell of cells) {
            const txt = cell.textContent.trim();
            const match = txt.match(/^(\d+(?:[\.,]\d+)?)\s*(Bytes|B|KB|MB|GB|TB)$/i);
            if (match) {
                const val = parseFloat(match[1].replace(',', '.'));
                const unit = match[2].toUpperCase();
                let bytes = val;
                if (unit === 'KB') bytes *= 1024;
                if (unit === 'MB') bytes *= 1024 * 1024;
                if (unit === 'GB') bytes *= 1024 * 1024 * 1024;
                if (unit === 'TB') bytes *= 1024 * 1024 * 1024 * 1024;
                return bytes;
            }
        }
        const fullText = itemEl.textContent || '';
        const match = fullText.match(/(\d+(?:[\.,]\d+)?)\s*(Bytes|B|KB|MB|GB|TB)\b/i);
        if (match) {
            const val = parseFloat(match[1].replace(',', '.'));
            const unit = match[2].toUpperCase();
            let bytes = val;
            if (unit === 'KB') bytes *= 1024;
            if (unit === 'MB') bytes *= 1024 * 1024;
            if (unit === 'GB') bytes *= 1024 * 1024 * 1024;
            if (unit === 'TB') bytes *= 1024 * 1024 * 1024 * 1024;
            return bytes;
        }
        return null;
    }

    // ========================================================
    // 6. ACCURATE ITEM & NAME DETECTION
    // ========================================================
    function cleanGenericName(str) {
        if (!str) return '';
        let s = str.trim();
        const lower = s.toLowerCase();
        if (['row', 'select row', 'select all', 'select', 'item', 'detailsrow', 'folder', 'file'].includes(lower)) {
            return '';
        }
        s = s.replace(/^select\s+/i, '');
        s = s.replace(/,\s*(folder|file|item)$/i, '');
        s = s.replace(/\s*\d+(?:[\.,]\d+)?\s*(GB|MB|KB|Bytes|B)$/i, '');
        return s.trim();
    }

    async function detectItemsOnScreen(maxWaitMs = 4000) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            doc = getActiveDocument();

            // Priority 1: DetailsList Rows
            let rows = Array.from(doc.querySelectorAll('[data-automationid="DetailsRow"], [role="row"]')).filter(r => {
                return !r.querySelector('[role="columnheader"]') && !r.closest('[role="columnheader"]') && !r.classList.contains('ms-DetailsHeader');
            });
            if (rows.length > 0) return rows;

            // Priority 2: Tile Cards
            let tiles = Array.from(doc.querySelectorAll('[data-telemetry-name="file-card"], [data-automationid*="tile" i], div[class*="tile_"], div[class*="card_"]'));
            if (tiles.length > 0) return tiles;

            // Priority 3: Checkbox containers
            let cbs = Array.from(doc.querySelectorAll(`
                input[type="checkbox"][aria-label*="select" i],
                input[type="checkbox"][aria-label*="Select" i],
                div[role="checkbox"],
                [data-automationid="DetailsRowCheck"],
                [data-selection-toggle="true"]
            `)).filter(cb => {
                const label = (cb.getAttribute('aria-label') || '').toLowerCase();
                return !label.includes('select all') && !label.includes('toggle selection for all');
            });
            if (cbs.length > 0) return cbs.map(cb => cb.closest('[role="row"], [role="gridcell"], div[class*="tile"], div[class*="card"]') || cb.parentElement);

            await sleep(300);
        }
        return [];
    }

    function parseItemInfo(itemEl, index) {
        let name = '';

        // Priority 1: Checkbox aria-label
        const cb = itemEl.querySelector('input[type="checkbox"], div[role="checkbox"], [data-automationid="DetailsRowCheck"]');
        if (cb) {
            name = cleanGenericName(cb.getAttribute('aria-label') || cb.getAttribute('title') || '');
        }

        // Priority 2: Title attribute on name button/link
        if (!name) {
            const nameEl = itemEl.querySelector('[data-automationid="fileRowItemName"] button, [data-automationid="fileRowItemName"] a, [data-automationid="fileRowItemName"], button.ms-Link, a[data-interception="off"], [role="link"]');
            if (nameEl) {
                name = cleanGenericName(nameEl.getAttribute('title') || nameEl.textContent || '');
            }
        }

        // Priority 3: Title attribute anywhere in the row
        if (!name) {
            const titledEls = Array.from(itemEl.querySelectorAll('[title]'));
            for (const el of titledEls) {
                const cleaned = cleanGenericName(el.getAttribute('title'));
                if (cleaned) { name = cleaned; break; }
            }
        }

        // Priority 4: Cell text inspection
        if (!name) {
            const cells = Array.from(itemEl.querySelectorAll('[role="gridcell"], div[class*="cell"]'));
            for (const cell of cells) {
                const txt = cell.textContent.trim();
                const cleaned = cleanGenericName(txt);
                if (cleaned && !/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(cleaned) && !/^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)$/i.test(cleaned)) {
                    name = cleaned;
                    break;
                }
            }
        }

        if (!name) {
            name = `Item_${index + 1}`;
        }

        const allAria = ((cb ? cb.getAttribute('aria-label') : '') + ' ' + (itemEl.getAttribute('aria-label') || '')).toLowerCase();
        const hasFolderIcon = !!itemEl.querySelector('[data-icon-name*="Folder" i], [name*="Folder" i], svg[class*="folder" i], [data-sprite-render*="Folder" i]');
        const isFolderAria = allAria.includes(', folder') || allAria.includes(' folder');
        const isFileAria = allAria.includes(', file') || allAria.includes(' file');
        const hasExtension = /\.[a-zA-Z0-9]{1,6}$/.test(name.split('?')[0]);

        let isFolder = false;
        if (isFileAria) {
            isFolder = false;
        } else if (isFolderAria || hasFolderIcon) {
            isFolder = true;
        } else {
            isFolder = !hasExtension;
        }

        const sizeBytes = parseSizeFromRow(itemEl);

        return { name, isFolder, sizeBytes };
    }

    function findRowByName(name) {
        const rows = doc.querySelectorAll('[data-automationid="DetailsRow"], [role="row"]');
        for (const r of rows) {
            const info = parseItemInfo(r, 0);
            if (info.name === name) return r;
        }
        return null;
    }

    // ========================================================
    // 7. MULTI-TIER ROBUST SELECTION & DESELECTION
    // ========================================================
    function isItemSelected(itemEl) {
        if (!itemEl) return false;
        if (itemEl.getAttribute('aria-selected') === 'true' || itemEl.getAttribute('data-is-selected') === 'true') return true;
        if (itemEl.classList.contains('is-selected')) return true;
        const cb = itemEl.querySelector('input[type="checkbox"], div[role="checkbox"], [data-automationid="DetailsRowCheck"], [data-selection-toggle="true"]');
        if (cb) {
            if (cb.checked === true) return true;
            if (cb.getAttribute('aria-checked') === 'true' || cb.getAttribute('data-is-checked') === 'true') return true;
            if (cb.classList.contains('is-checked')) return true;
        }
        return false;
    }

    async function ensureItemSelected(itemEl) {
        if (!itemEl) return false;
        if (isItemSelected(itemEl)) return true;

        itemEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
        await sleep(60);

        itemEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        itemEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        const cb = itemEl.querySelector('input[type="checkbox"], div[role="checkbox"], [data-automationid="DetailsRowCheck"], [data-selection-toggle="true"]');
        if (cb) {
            cb.click();
        } else {
            const checkTarget = itemEl.querySelector('[class*="check" i], [class*="selection" i]') || itemEl;
            checkTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }

        await sleep(100);
        return isItemSelected(itemEl);
    }

    async function clearAllSelections() {
        doc = getActiveDocument();

        // Phase 1: Dispatch Escape key
        const targets = [
            doc.activeElement, doc.body, doc, doc.defaultView || window,
            document.activeElement, document.body, document, window
        ];

        for (const target of targets) {
            if (target && target.dispatchEvent) {
                try {
                    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
                    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
                } catch (e) {}
            }
        }
        await sleep(150);

        // Phase 2: Click "Clear selection" command button
        const clearBtns = [
            ...Array.from(doc.querySelectorAll('button, div[role="button"], span[role="button"]')),
            ...(doc !== document ? Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]')) : [])
        ].filter(b => {
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            const title = (b.getAttribute('title') || '').toLowerCase();
            const text = (b.innerText || '').toLowerCase();
            const autoId = (b.getAttribute('data-automationid') || '').toLowerCase();
            return autoId === 'clearselection' ||
                   aria.includes('clear selection') || title.includes('clear selection') ||
                   text === 'clear selection' || aria.includes('unselect all') ||
                   aria.includes('deselect all');
        });
        for (const b of clearBtns) {
            try { b.click(); } catch(e){}
        }
        await sleep(150);

        // Phase 3: Uncheck any remaining checked checkboxes
        const checkedElements = Array.from(doc.querySelectorAll(`
            input[type="checkbox"]:checked,
            div[role="checkbox"][aria-checked="true"],
            [data-automationid="DetailsRowCheck"][aria-checked="true"],
            [aria-selected="true"] [role="checkbox"],
            [aria-selected="true"] input[type="checkbox"]
        `));
        for (const el of checkedElements) {
            try { el.click(); } catch(e){}
        }

        // Phase 4: Unselect aria-selected rows
        const selectedRows = Array.from(doc.querySelectorAll('[aria-selected="true"], [role="row"].is-selected'));
        for (const row of selectedRows) {
            const checkTarget = row.querySelector('[class*="check" i], [class*="selection" i]') || row;
            try { checkTarget.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e) {}
        }

        try {
            doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        } catch (e) {}

        await sleep(150);
    }

    // ========================================================
    // 8. DOWNLOAD ACTION TRIGGER (DIRECT + OVERFLOW + CONTEXT)
    // ========================================================
    function findVisibleDownloadButton() {
        const buttons = [
            ...Array.from(doc.querySelectorAll('button, div[role="button"], a[role="menuitem"], button[role="menuitem"]')),
            ...(doc !== document ? Array.from(document.querySelectorAll('button, div[role="button"], a[role="menuitem"], button[role="menuitem"]')) : [])
        ];
        return buttons.find(b => {
            if (b.offsetParent === null && b.offsetWidth === 0 && b.offsetHeight === 0) return false;
            const text = (b.innerText || b.textContent || '').trim().toLowerCase();
            const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
            const title = (b.getAttribute('title') || '').trim().toLowerCase();
            const autoId = (b.getAttribute('data-automationid') || '').toLowerCase();
            const hasDlIcon = !!b.querySelector('[data-icon-name*="Download" i], [name*="Download" i], svg[class*="download" i]');
            
            return text.startsWith('download') || aria.startsWith('download') || title.startsWith('download') || autoId.includes('download') ||
                  (hasDlIcon && (text.includes('download') || aria.includes('download') || !text));
        });
    }

    async function triggerDownloadAction() {
        // Layer 1: Primary command bar button
        let dlBtn = findVisibleDownloadButton();
        if (dlBtn) {
            log(`⚡ Clicking primary Download button...`, '#81c784');
            dlBtn.click();
            return true;
        }

        // Layer 2: Overflow "..." menu (photo/video single-item fallback)
        log(`🔍 Primary Download button not found. Checking overflow "..." menu...`, '#ce93d8');
        const moreBtns = [
            ...Array.from(doc.querySelectorAll('button, div[role="button"]')),
            ...(doc !== document ? Array.from(document.querySelectorAll('button, div[role="button"]')) : [])
        ].filter(b => {
            if (b.offsetParent === null && b.offsetWidth === 0 && b.offsetHeight === 0) return false;
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            const title = (b.getAttribute('title') || '').toLowerCase();
            const dataId = (b.getAttribute('data-automationid') || '').toLowerCase();
            const hasMoreIcon = !!b.querySelector('[data-icon-name*="More" i], [name*="More" i], [data-icon-name*="Chevron" i]');
            return dataId.includes('overflow') || aria.includes('more') || title.includes('more') || hasMoreIcon || aria.includes('see more');
        });

        for (const moreBtn of moreBtns) {
            moreBtn.click();
            await sleep(400);

            dlBtn = findVisibleDownloadButton();
            if (dlBtn) {
                log(`⚡ Found Download in overflow menu! Clicking...`, '#81c784');
                dlBtn.click();
                await sleep(300);
                return true;
            }

            doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            await sleep(150);
        }

        // Layer 3: Contextmenu right-click fallback
        const anySelected = doc.querySelector('[aria-selected="true"], [role="row"].is-selected');
        if (anySelected) {
            log(`🔍 Trying right-click context menu fallback...`, '#ce93d8');
            anySelected.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
            await sleep(400);

            dlBtn = findVisibleDownloadButton();
            if (dlBtn) {
                log(`⚡ Found Download in context menu! Clicking...`, '#81c784');
                dlBtn.click();
                await sleep(300);
                return true;
            }

            doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            await sleep(150);
        }

        return false;
    }

    // ========================================================
    // 9. VERIFIED NAVIGATION (PREVENTS LOOPS)
    // ========================================================
    async function openFolderVerified(itemEl, targetFolderName) {
        const locBefore = getLiveLocation();
        log(`Initiating navigation into "${targetFolderName}"...`, '#ce93d8');

        const link = itemEl.querySelector('a[data-interception="off"], [data-automationid="fileRowItemName"] a, [data-automationid="fileRowItemName"] button, [data-automationid="fileRowItemName"], a[role="link"], a') || itemEl;

        const opts = { bubbles: true, cancelable: true, view: window };
        link.dispatchEvent(new MouseEvent('click', opts));
        itemEl.dispatchEvent(new MouseEvent('dblclick', opts));
        itemEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

        let navigated = false;
        for (let i = 0; i < 12; i++) {
            await sleep(400);
            const locAfter = getLiveLocation();
            if (
                locAfter.folderName.toLowerCase() === targetFolderName.toLowerCase() ||
                locAfter.depth > locBefore.depth ||
                (locAfter.folderPath && locBefore.folderPath && locAfter.folderPath !== locBefore.folderPath)
            ) {
                navigated = true;
                break;
            }
        }

        if (navigated) {
            log(`✅ Verified entrance into "${targetFolderName}".`, '#81c784');
            return true;
        } else {
            log(`❌ Could not open "${targetFolderName}". Aborting descent to avoid loop.`, '#e57373');
            return false;
        }
    }

    async function backtrackToParent(parentFolderName, targetDepth) {
        log(`⬆️ Backtracking to parent: "${parentFolderName}"...`, '#64b5f6');

        const crumbs = getVisibleBreadcrumbItems();
        let targetBtn = null;

        for (const li of crumbs) {
            const btn = li.querySelector('button[data-automationid="breadcrumb-crumb"], button, a');
            const name = (li.querySelector('[data-automationid="breadcrumb-crumb"], button, div, h2, a')?.textContent || '').trim();
            if (btn && (name.toLowerCase() === parentFolderName.toLowerCase() || (targetDepth && crumbs.indexOf(li) === targetDepth - 1))) {
                targetBtn = btn;
                break;
            }
        }

        if (targetBtn) {
            targetBtn.click();
        } else {
            log(`   Breadcrumb button not found, triggering browser history back.`);
            window.history.back();
        }

        let confirmed = false;
        for (let i = 0; i < 15; i++) {
            await sleep(400);
            const loc = getLiveLocation();
            if (loc.folderName.toLowerCase() === parentFolderName.toLowerCase() || (targetDepth && loc.depth === targetDepth)) {
                confirmed = true;
                break;
            }
        }

        if (confirmed) {
            log(`✅ Backtracked successfully to "${parentFolderName}".`, '#81c784');
        } else {
            log(`⚠️ Could not confirm return to "${parentFolderName}". Waiting for UI settling...`, '#ffb74d');
            await sleep(2500);
        }
    }

    // ========================================================
    // 10. RECURSIVE DFS ENGINE WITH BATCH / INDIVIDUAL MODES
    // ========================================================
    async function crawlDirectory() {
        if (isStopped) return;
        await checkPause();
        syncLiveSettings();

        doc = getActiveDocument();
        const loc = getLiveLocation();
        const currentPathString = loc.folderPath;
        const currentFolderName = loc.folderName;
        const currentDepth = loc.depth;

        folderTxt.innerText = currentFolderName;
        folderTxt.title = currentPathString;
        actionTxt.innerText = `Scanning: ${currentFolderName}`;
        log(`📁 Current Directory: ${currentPathString}`, '#64b5f6');

        await clearAllSelections();

        let iteration = 0;
        const maxIterations = 200;

        while (!isStopped && iteration < maxIterations) {
            iteration++;
            await checkPause();
            syncLiveSettings();

            const itemElements = await detectItemsOnScreen(3500);
            if (itemElements.length === 0) {
                log(`👀 0 items detected in "${currentFolderName}".`);
                break;
            }

            const parsedItems = itemElements.map((el, idx) => {
                const info = parseItemInfo(el, idx);
                const fullPath = `${currentPathString}/${info.name}`;
                return {
                    element: el,
                    index: idx,
                    name: info.name,
                    isFolder: info.isFolder,
                    sizeBytes: info.sizeBytes,
                    fullPath: fullPath,
                    isProcessed: processedPaths.has(fullPath)
                };
            });

            const unprocessed = parsedItems.filter(item => !item.isProcessed);
            if (unprocessed.length === 0) {
                log(`🏁 All ${parsedItems.length} items in "${currentFolderName}" have been processed.`, '#81c784');
                break;
            }

            const nextItem = unprocessed[0];

            if (nextItem.isFolder) {
                // ----------------------------------------------------
                // FOLDER PROCESSING (Zip if <= 10GB, otherwise recurse)
                // ----------------------------------------------------
                actionTxt.innerText = `Inspecting folder: ${nextItem.name}`;
                log(`👉 Folder [${nextItem.index + 1}/${parsedItems.length}]: "${nextItem.name}"`, '#64b5f6');

                const targetEl = nextItem.element.isConnected ? nextItem.element : (findRowByName(nextItem.name) || nextItem.element);
                await ensureItemSelected(targetEl);
                await sleep(config.stepDelayMs);

                let detectedSize = nextItem.sizeBytes;
                if (detectedSize === null) {
                    ensureDetailsPaneOpen();
                    await sleep(800);
                    detectedSize = readLiveSizeFromDetailsPane();
                }
                if (detectedSize === null) {
                    detectedSize = await queryExactFolderSize(loc.siteUrl, nextItem.fullPath);
                }

                let isConfirmedSmall = false;
                if (detectedSize !== null) {
                    log(`   Size: ${formatBytes(detectedSize)}`);
                    if (detectedSize <= config.maxZipBytes) {
                        isConfirmedSmall = true;
                    } else {
                        log(`⚠️ "${nextItem.name}" is ${formatBytes(detectedSize)} (> ${formatBytes(config.maxZipBytes)} limit).`, '#ffb74d');
                    }
                } else {
                    log(`⚠️ Size unverified for folder "${nextItem.name}". Fail-safe active.`, '#ffb74d');
                }

                if (!isConfirmedSmall) {
                    // OVER 10 GB OR UNCONFIRMED: Descend recursively
                    log(`⬇️ Descending into "${nextItem.name}" (Sublevel)...`, '#ce93d8');
                    await clearAllSelections();
                    processedPaths.add(nextItem.fullPath);

                    const entered = await openFolderVerified(targetEl, nextItem.name);
                    if (entered) {
                        await crawlDirectory();
                        await backtrackToParent(currentFolderName, currentDepth);
                        await sleep(1500);
                    } else {
                        recordSkipped(nextItem.name, detectedSize, 'Could not navigate into folder');
                    }
                } else {
                    // CONFIRMED SMALL (<= 10 GB): Download native zip archive
                    log(`⚡ Triggering Zip Download for folder "${nextItem.name}" (${formatBytes(detectedSize)})...`, '#81c784');
                    const downloaded = await triggerDownloadAction();
                    if (downloaded) {
                        recordFolderDownload(nextItem.name, nextItem.fullPath, detectedSize);
                        processedPaths.add(nextItem.fullPath);
                        await sleep(config.folderWaitMs);
                    } else {
                        log(`❌ Download button did not appear for "${nextItem.name}".`, '#e57373');
                        recordSkipped(nextItem.name, detectedSize, 'Download button missing');
                        processedPaths.add(nextItem.fullPath);
                    }
                    await clearAllSelections();
                    await sleep(config.stepDelayMs);
                }
            } else {
                // ----------------------------------------------------
                // FILE PROCESSING (Batch ZIP vs Individual Files)
                // ----------------------------------------------------
                if (config.fileMode === 'batch') {
                    // MODE: BATCH ZIP
                    const fileBatch = [];
                    let currentBatchBytes = 0;
                    const maxBatchCount = 50;

                    for (const item of unprocessed) {
                        if (item.isFolder) break;

                        if (item.sizeBytes !== null && item.sizeBytes > config.maxZipBytes) {
                            log(`⚠️ Skipping oversized file "${item.name}" (${formatBytes(item.sizeBytes)} > ${formatBytes(config.maxZipBytes)} limit).`, '#ef5350');
                            recordSkipped(item.name, item.sizeBytes, 'File exceeds 10 GB limit');
                            processedPaths.add(item.fullPath);
                            continue;
                        }

                        const itemSize = item.sizeBytes || (10 * 1024 * 1024);
                        if (fileBatch.length > 0 && (currentBatchBytes + itemSize > config.maxZipBytes || fileBatch.length >= maxBatchCount)) {
                            break;
                        }

                        fileBatch.push(item);
                        currentBatchBytes += itemSize;
                    }

                    if (fileBatch.length === 0) continue;

                    if (fileBatch.length === 1) {
                        const f = fileBatch[0];
                        actionTxt.innerText = `Downloading: ${f.name}`;
                        log(`👉 [Single File]: "${f.name}" (${formatBytes(f.sizeBytes)})`, '#64b5f6');

                        await clearAllSelections();
                        const rowEl = f.element.isConnected ? f.element : (findRowByName(f.name) || f.element);
                        await ensureItemSelected(rowEl);
                        await sleep(config.stepDelayMs);

                        const downloaded = await triggerDownloadAction();
                        if (downloaded) {
                            recordSingleFileDownload(f.name, f.fullPath, f.sizeBytes);
                            processedPaths.add(f.fullPath);
                            await sleep(config.fileWaitMs);
                        } else {
                            recordSkipped(f.name, f.sizeBytes, 'Download button missing');
                            processedPaths.add(f.fullPath);
                        }
                        await clearAllSelections();
                        await sleep(config.stepDelayMs);
                    } else {
                        actionTxt.innerText = `Batching ${fileBatch.length} file(s)...`;
                        log(`📦 Selecting batch of ${fileBatch.length} file(s) (approx ${formatBytes(currentBatchBytes)}):`, '#64b5f6');
                        fileBatch.forEach(f => log(`   📄 ${f.name} (${formatBytes(f.sizeBytes)})`));

                        await clearAllSelections();

                        for (const f of fileBatch) {
                            const rowEl = f.element.isConnected ? f.element : (findRowByName(f.name) || f.element);
                            await ensureItemSelected(rowEl);
                            await sleep(80);
                        }
                        await sleep(config.stepDelayMs);

                        log(`⚡ Triggering Download for batch of ${fileBatch.length} file(s) (OneDrive_*.zip)...`, '#81c784');
                        const downloaded = await triggerDownloadAction();

                        if (downloaded) {
                            recordBatchDownload(currentPathString, fileBatch, currentBatchBytes);
                            for (const f of fileBatch) {
                                processedPaths.add(f.fullPath);
                            }
                            const waitTime = Math.max(config.fileWaitMs, 3000 + Math.min(fileBatch.length * 200, 8000));
                            await sleep(waitTime);
                        } else {
                            log(`⚠️ Batch download button missing. Trying individual file download fallback...`, '#ffb74d');
                            await clearAllSelections();
                            for (const f of fileBatch) {
                                const rowEl = f.element.isConnected ? f.element : (findRowByName(f.name) || f.element);
                                await ensureItemSelected(rowEl);
                                await sleep(500);
                                const singleDl = await triggerDownloadAction();
                                if (singleDl) {
                                    recordSingleFileDownload(f.name, f.fullPath, f.sizeBytes);
                                    processedPaths.add(f.fullPath);
                                    await sleep(config.fileWaitMs);
                                } else {
                                    recordSkipped(f.name, f.sizeBytes, 'Download button missing');
                                    processedPaths.add(f.fullPath);
                                }
                                await clearAllSelections();
                            }
                        }

                        await clearAllSelections();
                        await sleep(config.stepDelayMs);
                    }
                } else {
                    // MODE: INDIVIDUAL FILES (One-by-one, original names)
                    const f = nextItem;
                    actionTxt.innerText = `Downloading: ${f.name}`;
                    log(`👉 [1-by-1]: "${f.name}" (${formatBytes(f.sizeBytes)})`, '#64b5f6');

                    if (f.sizeBytes !== null && f.sizeBytes > config.maxZipBytes) {
                        log(`⚠️ Skipping oversized file "${f.name}" (${formatBytes(f.sizeBytes)} > ${formatBytes(config.maxZipBytes)} limit).`, '#ef5350');
                        recordSkipped(f.name, f.sizeBytes, 'File exceeds 10 GB limit');
                        processedPaths.add(f.fullPath);
                        continue;
                    }

                    await clearAllSelections();
                    const rowEl = f.element.isConnected ? f.element : (findRowByName(f.name) || f.element);
                    await ensureItemSelected(rowEl);
                    await sleep(config.stepDelayMs);

                    const downloaded = await triggerDownloadAction();
                    if (downloaded) {
                        recordSingleFileDownload(f.name, f.fullPath, f.sizeBytes);
                        processedPaths.add(f.fullPath);
                        await sleep(config.fileWaitMs);
                    } else {
                        recordSkipped(f.name, f.sizeBytes, 'Download button missing');
                        processedPaths.add(f.fullPath);
                    }
                    await clearAllSelections();
                    await sleep(config.stepDelayMs);
                }
            }
        }

        log(`🏁 Finished all items in "${currentFolderName}".`, '#81c784');
    }

    // ========================================================
    // 11. CONTROLS & LISTENERS
    // ========================================================
    btnStart.onclick = async () => {
        syncLiveSettings();
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;
        isPaused = false;
        isStopped = false;

        btnStart.style.background = '#1565c0';
        btnStartLabel.innerText = 'Harvesting...';
        badge.innerText = 'HARVESTING';
        badge.style.background = '#1565c0';

        startTime = Date.now();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 1000);

        log(`🚀 Starting Recursive Harvest (Mode: ${config.fileMode.toUpperCase()})...`, '#64b5f6');
        try {
            await crawlDirectory();
            if (!isStopped) {
                badge.innerText = 'FINISHED';
                badge.style.background = '#2e7d32';
                actionTxt.innerText = 'All items processed!';
                btnStartLabel.innerText = 'Finished';
                btnStart.style.background = '#2e7d32';
                log(`🎉 Complete! Total archives/items: ${totalDownloads}. Total files: ${totalFilesDownloaded}. Skipped: ${skippedItems.length}`, '#81c784');
            }
        } catch (e) {
            log(`💥 Error during harvest: ${e.message}`, '#e57373');
        } finally {
            if (timerInterval) clearInterval(timerInterval);
            btnStart.disabled = false;
            btnPause.disabled = true;
            btnStop.disabled = true;
            if (isStopped) {
                btnStartLabel.innerText = 'Restart Harvesting';
                btnStart.style.background = '#2e7d32';
            }
        }
    };

    btnPause.onclick = () => {
        isPaused = !isPaused;
        if (isPaused) {
            btnPause.innerText = '▶ Resume';
            btnPause.style.background = '#2e7d32';
            badge.innerText = 'PAUSED';
            badge.style.background = '#f57c00';
            log(`⏸ Harvest paused.`);
        } else {
            btnPause.innerText = '⏸ Pause';
            btnPause.style.background = '#f57c00';
            badge.innerText = 'HARVESTING';
            badge.style.background = '#1565c0';
            log(`▶ Harvest resumed.`);
        }
    };

    btnStop.onclick = () => {
        isStopped = true;
        isPaused = false;
        badge.innerText = 'STOPPED';
        badge.style.background = '#c62828';
        log(`⏹ Harvest stopped by user.`, '#ef5350');
    };

    log(`🌾 OneDrive Harvester v1.0 Ready. Target: [${doc === document ? 'main' : 'iframe'}]. Folder: "${initialLoc.folderName}". Mode: [${config.fileMode}]. Click [Start Harvesting].`, '#64b5f6');
})();
