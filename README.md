# 🌾 OneDrive Harvester

> **Automated Recursive DFS Bulk Downloader & Cockpit for modern Microsoft SharePoint & OneDrive.**  
> Zero installation, pure browser DOM automation, fail-safe 10 GB thresholding, greedy file batching, and interactive HUD control panel.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Safari%20%7C%20Firefox-orange.svg)](#installation--quick-start)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success.svg)](#features)
[![Format](https://img.shields.io/badge/Format-Bookmarklet%20%7C%20DevTools%20Console-blueviolet.svg)](#installation--quick-start)

---

## 🎯 The Problem

Downloading deep folder hierarchies or massive photo/video collections from modern Microsoft OneDrive for Business and SharePoint Online is notoriously frustrating:

1. **The 10 GB Zip Ceiling**: Microsoft silently aborts or fails folder downloads larger than 10 GB (or 10,000 files).
2. **Hidden Download Buttons on Media**: When a single photo or video is selected, Microsoft moves the "Download" button into an overflow `...` menu, breaking basic scrapers.
3. **Selection Accumulation**: Modern Fluent UI table rows frequently stay selected in React state unless explicitly cleared with keyboard `Escape` events, resulting in snowballing downloads.
4. **Manual Backtracking Hell**: Navigating in and out of nested sublevels to selectively grab files below limits takes hours of tedious manual clicking.
5. **Generic Zip Naming**: Multi-item downloads are assigned default names like `OneDrive_2026-10-18.zip`, leaving you with dozens of identically named archives and no record of what is inside.

---

## ⚡ The Solution: OneDrive Harvester

**OneDrive Harvester** is a client-side recursive automation engine that runs directly in your browser tab as a **1-click Bookmarklet** or **DevTools console script**.

```
[Target Folder]
   ├── Subfolder A (50 GB)   ---> [Over Limit] Recursively descends into sublevels
   │     ├── Batch 1 (8 GB)  ---> [Under Limit] Batched & downloaded as native zip
   │     └── Large File (15GB)-> [Over Limit] Logged to "🚫 Skipped" table (safe)
   ├── Subfolder B (3 GB)    ---> [Under Limit] Downloaded directly as Subfolder_B.zip
   └── 10 Photos (80 MB)     ---> Batched together, download triggered, selection cleared
```

---

## ✨ Key Features

- **🌲 Recursive Depth-First Search (DFS)**: Automatically descends into subfolders exceeding your threshold, downloads compatible subtrees, and backtracks up the breadcrumb chain.
- **📦 Greedy File Batching**: Groups individual files into batches up to 10 GB (or 50 items). This bypasses Microsoft's hidden overflow menu on photos/videos and downloads files rapidly in grouped archives.
- **🔄 Dual File Download Modes**:
  - `Batch ZIP (Default)`: Fast multi-file zip downloads (`OneDrive_*.zip`).
  - `Individual Files`: Downloads every file one-by-one under its native filename (`photo.jpg`, `doc.pdf`).
- **🛡️ 100% Zero Hardcoding**: Detects current folder, server URLs, and navigation depth dynamically from live DOM breadcrumbs. Works anywhere you are browsing.
- **🧹 Multi-Tier Selection Sanitation**: Uses keyboard `Escape` event dispatching, command bar buttons, and checkbox unchecking to ensure zero lingering selections between crawl steps.
- **🎮 Real-Time Cockpit HUD**:
  - Live color-coded log with timestamps.
  - Downloads counter and elapsed timer.
  - Transfer History table with file breakdown.
  - `🚫 Skipped` table recording any item $> 10$ GB or blocked by permissions.
  - Live Settings panel to adjust threshold (1–15 GB) and delays on the fly.
  - Pause, Resume, Stop, and Minimize controls.
- **📥 Export Manifest (JSON)**: Exports a complete machine-readable mapping of every downloaded zip archive to its exact list of files, sizes, and folder paths.

---

## 🚀 Installation & Quick Start

### Method 1: The 1-Click Bookmarklet (Recommended)

1. Open [`bookmarklet.html`](bookmarklet.html) in your browser.
2. Drag the **🌾 OneDrive Harvester** button onto your browser's **Bookmarks Bar**.
3. Navigate to any folder in **OneDrive** or **SharePoint**.
4. Click **🌾 OneDrive Harvester** in your bookmarks bar.
5. The Cockpit HUD will appear in the bottom-right corner. Click **▶ Start Harvesting**!

> **Manual Bookmarklet Setup**: If you prefer adding it manually, create a new browser bookmark, name it `OneDrive Harvester`, and paste the code from [`bookmarklet.js`](bookmarklet.js) into the **URL / Location** field.

---

### Method 2: Browser DevTools Console

1. Open any OneDrive or SharePoint folder.
2. Press `F12` (or `Cmd + Option + I` on Mac / `Ctrl + Shift + I` on Windows) to open DevTools.
3. Select the **Console** tab.
4. Copy the entire contents of [`onedrive-harvester.js`](onedrive-harvester.js), paste into the console, and press `Enter`.
5. The Cockpit HUD will launch immediately.

---

## ⚙️ Configuration & Tuning

All settings can be adjusted in real time from the **⚙️ Settings** tab inside the Cockpit:

| Setting | Default | Description |
| :--- | :--- | :--- |
| **File Download Mode** | `Batch ZIP` | Choose `Batch ZIP` for fast multi-file archives, or `Individual Files` to preserve native filenames directly to disk. |
| **Zip Limit Threshold** | `10 GB` | Maximum size for downloading a folder or batch as a single archive. Items over this limit are descended into or skipped. |
| **Folder Zip Wait** | `8 sec` | Delay allowing Microsoft's backend to compress and stream large folder zip archives. |
| **File/Batch Download Wait**| `4 sec` | Settling delay between file batch transfers. |
| **Selection Step Delay** | `0.8 sec` | DOM settling delay ensuring Fluent UI renders checkboxes before triggering downloads. |

---

## 🔍 How Microsoft Handles Archive Names

When downloading from SharePoint / OneDrive, you will notice different naming behaviors:

- **Single Files**: Downloaded directly with their native filename (e.g. `ESC_0002.jpg`).
- **Batched Files (2+ files)**: Microsoft bundles multiple files on-the-fly and names the archive `OneDrive_YYYY-MM-DD.zip` (or `OneDrive (1).zip`). All original files with full names are preserved inside.
- **Folders**: Depending on tenant configuration, downloaded folder zips are named either `<FolderName>.zip` or `OneDrive_<date>.zip`.

💡 **Tip**: Click the **📥 Export Manifest (JSON)** button in the Cockpit anytime to download a complete lookup table mapping every `OneDrive_*.zip` file to its original directory and files!

---

## 🛠️ Architecture & Under the Hood

- **Multi-Context Frame Resolution**: Automatically finds whether OneDrive's list view resides in `window.document` or an embedded `<iframe>` (common in Office 365 / modern SharePoint portals).
- **DOM Name Cleaning**: Strips trailing file size metadata that modern SharePoint often concatenates into accessibility strings (e.g. transforms `"ESC_0002.jpg8.08 MB"` $\rightarrow$ `"ESC_0002.jpg"`).
- **3-Tier Download Trigger**:
  1. *Primary Command Bar*: Triggers direct native toolbar button.
  2. *Overflow `...` Menu*: Opens the context dropdown if Microsoft hid the download button (e.g. for media files).
  3. *Context Menu Fallback*: Dispatches synthetic right-click events if toolbar buttons are unreachable.
- **Loop-Protected Descent**: Verifies that depth or breadcrumb URLs actually changed before advancing, aborting cleanly if a folder is empty or inaccessible.

---

## 📄 License

Distributed under the [MIT License](LICENSE). Free for personal and commercial use.
