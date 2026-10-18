const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'onedrive-harvester.js');
const bmPath = path.join(__dirname, 'bookmarklet.js');
const htmlPath = path.join(__dirname, 'bookmarklet.html');

const src = fs.readFileSync(srcPath, 'utf8');

// Minifier state machine to strip comments and normalize whitespace
function minifyCode(code) {
    let out = '';
    let i = 0;
    const n = code.length;
    let state = 'code';

    while (i < n) {
        const c = code[i];
        const next = code[i + 1];

        if (state === 'code') {
            if (c === '/' && next === '/') {
                state = 'comment_line';
                i += 2;
                continue;
            } else if (c === '/' && next === '*') {
                state = 'comment_block';
                i += 2;
                continue;
            } else if (c === '\'') {
                state = 'str1'; out += c; i++; continue;
            } else if (c === '"') {
                state = 'str2'; out += c; i++; continue;
            } else if (c === '`') {
                state = 'template'; out += c; i++; continue;
            } else if (c === '\n' || c === '\r') {
                out += '\n';
                i++;
                continue;
            } else {
                out += c; i++;
            }
        } else if (state === 'comment_line') {
            if (c === '\n' || c === '\r') { state = 'code'; out += '\n'; }
            i++;
        } else if (state === 'comment_block') {
            if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
            i++;
        } else if (state === 'str1') {
            out += c; if (c === '\\') { out += next; i += 2; continue; }
            if (c === '\'') state = 'code'; i++;
        } else if (state === 'str2') {
            out += c; if (c === '\\') { out += next; i += 2; continue; }
            if (c === '"') state = 'code'; i++;
        } else if (state === 'template') {
            out += c; if (c === '\\') { out += next; i += 2; continue; }
            if (c === '`') state = 'code'; i++;
        }
    }

    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.join('\n');
}

const min = minifyCode(src);
// Validate syntax
new Function(min);

const bookmarklet = 'javascript:' + encodeURIComponent('(function(){' + min + '})();');
fs.writeFileSync(bmPath, bookmarklet);
console.log('✅ Generated bookmarklet.js (' + bookmarklet.length + ' bytes)');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🌾 OneDrive Harvester - Bookmarklet Installer</title>
    <style>
        :root {
            --bg: #0d0f18;
            --card-bg: #161826;
            --border: #262940;
            --accent: #64b5f6;
            --accent-green: #4caf50;
            --text: #e2e8f0;
            --text-dim: #94a3b8;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            max-width: 680px;
            width: 100%;
            padding: 36px 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6);
            text-align: center;
        }
        h1 {
            font-size: 28px;
            margin: 0 0 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }
        p.subtitle {
            color: var(--text-dim);
            font-size: 15px;
            margin: 0 0 32px;
            line-height: 1.5;
        }
        .drag-box {
            background: #111320;
            border: 2px dashed #3d4368;
            border-radius: 12px;
            padding: 28px 20px;
            margin-bottom: 30px;
        }
        .bookmarklet-btn {
            display: inline-block;
            background: linear-gradient(135deg, #1565c0, #0d47a1);
            color: #fff;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 16px;
            cursor: move;
            box-shadow: 0 8px 24px rgba(21, 101, 192, 0.4);
            border: 1px solid #1e88e5;
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .bookmarklet-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 30px rgba(21, 101, 192, 0.6);
        }
        .instruction {
            color: #81c784;
            font-size: 13px;
            margin-top: 14px;
            font-weight: 500;
        }
        ol {
            text-align: left;
            color: var(--text-dim);
            font-size: 14px;
            line-height: 1.8;
            margin: 0 0 32px;
            padding-left: 20px;
        }
        ol li strong {
            color: var(--text);
        }
        .copy-section {
            display: flex;
            gap: 12px;
            justify-content: center;
        }
        .action-btn {
            background: #23273e;
            color: var(--text);
            border: 1px solid #373d5e;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
        }
        .action-btn:hover {
            background: #2e3352;
            color: var(--accent);
        }
        .copied-toast {
            display: none;
            color: var(--accent-green);
            font-size: 12px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1><span>🌾</span> OneDrive Harvester</h1>
        <p class="subtitle">Recursive DFS Bulk Downloader & Cockpit for modern Microsoft SharePoint &amp; OneDrive.</p>

        <div class="drag-box">
            <a class="bookmarklet-btn" href="${bookmarklet}" title="Drag me to your Bookmarks Bar!">🌾 OneDrive Harvester</a>
            <div class="instruction">👆 Drag &amp; drop this button onto your browser's Bookmarks bar</div>
        </div>

        <ol>
            <li><strong>Install</strong>: Drag the blue button above to your Bookmarks bar (or right-click it &rarr; <em>Bookmark this Link</em>).</li>
            <li><strong>Navigate</strong>: Open any folder in modern <strong>OneDrive</strong> or <strong>SharePoint</strong>.</li>
            <li><strong>Launch</strong>: Click <strong>🌾 OneDrive Harvester</strong> in your bookmarks. The Cockpit HUD appears immediately.</li>
            <li><strong>Harvest</strong>: Click <strong>▶ Start Harvesting</strong>. It recursively crawls subfolders, downloads up to 10 GB batches, and tracks progress.</li>
        </ol>

        <div class="copy-section">
            <button class="action-btn" id="btn-copy-bm">📋 Copy Bookmarklet URL</button>
            <button class="action-btn" id="btn-copy-raw">📄 Copy DevTools Console Code</button>
        </div>
        <div id="toast" class="copied-toast">✅ Copied to clipboard!</div>
    </div>

    <script>
        const bmUrl = ${JSON.stringify(bookmarklet)};
        const rawCode = decodeURIComponent(bmUrl.replace(/^javascript:/, ''));

        function copy(text) {
            navigator.clipboard.writeText(text).then(() => {
                const t = document.getElementById('toast');
                t.style.display = 'block';
                setTimeout(() => t.style.display = 'none', 2500);
            });
        }

        document.getElementById('btn-copy-bm').onclick = () => copy(bmUrl);
        document.getElementById('btn-copy-raw').onclick = () => copy(rawCode);
    </script>
</body>
</html>`;

fs.writeFileSync(htmlPath, html);
console.log('✅ Generated bookmarklet.html (' + html.length + ' bytes)');
