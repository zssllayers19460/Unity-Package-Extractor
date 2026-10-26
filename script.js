document.addEventListener('DOMContentLoaded', () => {
    const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];
    const HEADER_SIZE = 512;
    const CHUNK_YIELD_EVERY = 200;

    let extractedFiles = {};
    let activeObjectUrls = [];
    let selectedPaths = new Set();
    let packageBaseName = 'package';
    let searchQuery = '';

    let isDragging = false;
    let dragMode = true;
    let lastSelectedPath = null;

    // --- Theme System ---
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeLabel');
    const themes = ['auto', 'dark', 'light'];
    let currentThemeIndex = 0;

    function applyTheme(theme) {
        if (theme === 'auto') {
            document.documentElement.removeAttribute('data-theme');
            themeLabel.textContent = 'Auto';
        } else {
            document.documentElement.setAttribute('data-theme', theme);
            themeLabel.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        }
        localStorage.setItem('user-theme', theme);
    }

    const savedTheme = localStorage.getItem('user-theme') || 'auto';
    currentThemeIndex = Math.max(0, themes.indexOf(savedTheme));
    applyTheme(themes[currentThemeIndex]);

    themeToggleBtn.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        applyTheme(themes[currentThemeIndex]);
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    const dropZone = document.getElementById('dropZone');
    const dropTitle = dropZone.querySelector('.drop-title');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const excludeMetaCheckbox = document.getElementById('excludeMeta');
    const categorizeByExtensionCheckbox = document.getElementById('categorizeByExtension');
    const maintainStructureCheckbox = document.getElementById('maintainStructure');
    const checkerboardBgCheckbox = document.getElementById('checkerboardBg');
    const showPngGridCheckbox = document.getElementById('showPngGrid');
    const compressZipCheckbox = document.getElementById('compressZip');
    const pngGrid = document.getElementById('pngGrid');
    const pngGridControls = document.getElementById('pngGridControls');
    const pngGridScale = document.getElementById('pngGridScale');
    const sortOrderSelect = document.getElementById('sortOrder');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const searchInput = document.getElementById('searchInput');
    const fileStats = document.getElementById('fileStats');

    const selectionBar = document.getElementById('selectionBar');
    const selectionCount = document.getElementById('selectionCount');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');

    const progressOverlay = document.getElementById('progressOverlay');
    const progressLabel = document.getElementById('progressLabel');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');

    const gridSelectAllBtn = document.createElement('button');
    gridSelectAllBtn.id = 'gridSelectAllBtn';
    gridSelectAllBtn.className = 'grid-select-all';
    gridSelectAllBtn.textContent = 'Select All';

    // --- Incremental Real Progress UI ---
    function showProgress(label) {
        progressLabel.textContent = label;
        progressPercent.textContent = '0%';
        progressFill.style.width = '0%';
        progressOverlay.classList.add('visible');
        dropZone.classList.add('busy');
    }

    function updateProgress(current, total, label = null) {
        if (label) progressLabel.textContent = label;
        const pct = total > 0 ? Math.min(100, Math.max(1, Math.round((current / total) * 100))) : 1;
        progressPercent.textContent = `${pct}%`;
        progressFill.style.width = `${pct}%`;
    }

    function hideProgress() {
        progressOverlay.classList.remove('visible');
        dropZone.classList.remove('busy');
    }

    function yieldToUI() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    // --- Extraction Logic ---
    async function extractPackage(arrayBuffer, onProgress) {
        const unzipped = fflate.gunzipSync(new Uint8Array(arrayBuffer));
        return parseTarball(unzipped, onProgress);
    }

    async function parseTarball(data, onProgress) {
        const decoder = new TextDecoder();
        const rawEntries = {};
        let offset = 0;
        let entriesSinceYield = 0;
        const totalLen = data.length;

        while (offset < totalLen) {
            if (offset + HEADER_SIZE > totalLen) break;

            const sizeField = data.subarray(offset + 124, offset + 136);
            const sizeStr = decoder.decode(sizeField).trim();
            const size = sizeStr ? parseInt(sizeStr, 8) : NaN;
            if (isNaN(size)) break;

            if (size > 0) {
                const nameField = data.subarray(offset, offset + 100);
                let nameEnd = nameField.indexOf(0);
                if (nameEnd === -1) nameEnd = nameField.length;
                const name = decoder.decode(nameField.subarray(0, nameEnd)).trim();

                rawEntries[name] = data.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + size);
            }

            offset += HEADER_SIZE + Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;

            entriesSinceYield++;
            if (entriesSinceYield >= CHUNK_YIELD_EVERY) {
                entriesSinceYield = 0;
                if (onProgress) onProgress(offset, totalLen);
                await yieldToUI();
            }
        }

        if (onProgress) onProgress(totalLen, totalLen);
        return convertEntries(rawEntries);
    }

    function convertEntries(rawEntries) {
        const files = {};
        const decoder = new TextDecoder();
        const pathnameKeys = Object.keys(rawEntries).filter(f => f.endsWith('/pathname'));

        for (const key of pathnameKeys) {
            const basePath = key.slice(0, -'/pathname'.length);
            const newPath = decoder.decode(rawEntries[key]).split('\n')[0].trim();
            if (!newPath) continue;

            if (rawEntries[`${basePath}/asset`]) files[newPath] = rawEntries[`${basePath}/asset`];

            const meta = rawEntries[`${basePath}/asset.meta`] || rawEntries[`${basePath}/metaData`];
            if (meta) files[`${newPath}.meta`] = meta;
        }
        return files;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function isImageFile(path) {
        return IMAGE_EXTENSIONS.includes(path.split('.').pop().toLowerCase());
    }

    function stripExtension(filename) {
        const idx = filename.lastIndexOf('.');
        return idx > 0 ? filename.slice(0, idx) : filename;
    }

    // --- File Input & Processing ---
    dropZone.addEventListener('dragover', e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', async e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.unitypackage')) {
            await processUnityPackage(file);
        } else {
            alert('Please drop a valid .unitypackage file.');
        }
    });
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async e => {
        if (e.target.files.length > 0) await processUnityPackage(e.target.files[0]);
    });

    [excludeMetaCheckbox, categorizeByExtensionCheckbox, maintainStructureCheckbox, showPngGridCheckbox, checkerboardBgCheckbox]
        .forEach(cb => cb.addEventListener('change', () => displayExtractedFiles(extractedFiles)));

    pngGridScale.addEventListener('input', e => {
        const scaleVal = parseInt(e.target.value, 10) || 30;
        const itemSize = 80 + (scaleVal / 100) * (250 - 80);
        pngGrid.style.setProperty('--grid-item-size', `${Math.floor(itemSize)}px`);
    });

    sortOrderSelect.addEventListener('change', () => displayExtractedFiles(extractedFiles));
    downloadAllBtn.addEventListener('click', downloadAll);
    downloadSelectedBtn.addEventListener('click', downloadSelected);
    clearSelectionBtn.addEventListener('click', clearSelection);

    searchInput.addEventListener('input', e => {
        searchQuery = e.target.value.trim().toLowerCase();
        displayExtractedFiles(extractedFiles);
    });

    gridSelectAllBtn.addEventListener('click', () => {
        const gridItems = document.querySelectorAll('.png-node');
        const allSelected = Array.from(gridItems).every(item => item.classList.contains('selected'));
        gridItems.forEach(item => {
            allSelected ? selectedPaths.delete(item.dataset.path) : selectedPaths.add(item.dataset.path);
        });
        updateSelectionUI();
        displayExtractedFiles(extractedFiles);
    });

    async function processUnityPackage(file) {
        try {
            packageBaseName = stripExtension(file.name);
            dropTitle.textContent = file.name;

            showProgress('Reading package file into memory...');
            updateProgress(10, 100);
            await yieldToUI();

            const arrayBuffer = await file.arrayBuffer();

            showProgress('Decompressing and parsing tar archives...');
            extractedFiles = await extractPackage(arrayBuffer, (current, total) => {
                const pct = Math.round(10 + (current / total) * 85);
                updateProgress(pct, 100, `Parsing assets (${Math.round((current / total) * 100)}%)...`);
            });

            updateProgress(100, 100, 'Finalizing UI view...');
            await yieldToUI();

            selectedPaths.clear();
            searchQuery = '';
            searchInput.value = '';
            updateSelectionUI();
            displayExtractedFiles(extractedFiles);
            downloadAllBtn.style.display = 'inline-flex';
        } catch (error) {
            console.error(error);
            alert('Error processing package file.');
        } finally {
            hideProgress();
        }
    }

    // --- Selection State ---
    function toggleFileSelection(path, forceState = null) {
        const newState = forceState !== null ? forceState : !selectedPaths.has(path);
        newState ? selectedPaths.add(path) : selectedPaths.delete(path);

        const node = document.querySelector(`.png-node[data-path="${CSS.escape(path)}"]`);
        if (node) node.classList.toggle('selected', newState);

        updateSelectionUI(false);
    }

    function updateSelectionUI(syncGrid = true) {
        const count = selectedPaths.size;
        selectionCount.textContent = `${count} Selected`;
        selectionBar.classList.toggle('visible', count > 0);

        document.querySelectorAll('input.file-checkbox').forEach(cb => {
            cb.checked = selectedPaths.has(cb.dataset.path);
        });

        if (syncGrid) {
            document.querySelectorAll('.png-node').forEach(node => {
                node.classList.toggle('selected', selectedPaths.has(node.dataset.path));
            });
        }
    }

    function clearSelection() {
        selectedPaths.clear();
        updateSelectionUI();
    }

    // --- Display & Rendering ---
    function matchesSearch(path) {
        if (!searchQuery) return true;
        return path.toLowerCase().includes(searchQuery);
    }

    function displayExtractedFiles(files) {
        fileList.innerHTML = '';
        pngGrid.innerHTML = '';
        if (!files || Object.keys(files).length === 0) {
            fileStats.textContent = '';
            return;
        }

        const categorizedFiles = {};
        let totalCount = 0;
        let shownCount = 0;

        for (const [path, content] of Object.entries(files)) {
            if (excludeMetaCheckbox.checked && path.endsWith('.meta')) continue;
            totalCount++;
            if (!matchesSearch(path)) continue;
            shownCount++;
            const extension = path.split('.').pop().toLowerCase();
            (categorizedFiles[extension] ??= []).push({ path, content });
        }

        fileStats.textContent = searchQuery
            ? `${shownCount} / ${totalCount} matching assets`
            : `${totalCount} total assets extracted`;

        const hasImages = IMAGE_EXTENSIONS.some(ext => categorizedFiles[ext]?.length > 0);
        const showGrid = showPngGridCheckbox.checked && hasImages;

        if (showGrid) updatePngGrid(categorizedFiles);
        else { pngGrid.style.display = 'none'; pngGridControls.style.display = 'none'; }

        if (categorizeByExtensionCheckbox.checked) {
            for (const [extension, catFiles] of Object.entries(categorizedFiles)) {
                if (IMAGE_EXTENSIONS.includes(extension) && showGrid) continue;
                fileList.appendChild(createCategoryBlock(extension, catFiles));
            }
        } else {
            const ul = document.createElement('ul');
            Object.values(categorizedFiles).flat().forEach(file => {
                if (showGrid && isImageFile(file.path)) return;
                ul.appendChild(createFileListItem(file.path, file.content));
            });
            fileList.appendChild(ul);
        }
    }

    function createCategoryBlock(extension, catFiles) {
        const category = document.createElement('div');
        category.className = 'category';

        const h3 = document.createElement('h3');
        const titleSpan = document.createElement('span');
        titleSpan.textContent = extension.toUpperCase();
        const countSpan = document.createElement('span');
        countSpan.className = 'ext-count';
        countSpan.textContent = `${catFiles.length} items`;
        titleSpan.appendChild(countSpan);
        h3.appendChild(titleSpan);

        const catSelectBtn = document.createElement('button');
        catSelectBtn.textContent = 'Select All';
        catSelectBtn.className = 'btn-subtle';
        catSelectBtn.addEventListener('click', () => {
            catFiles.forEach(f => selectedPaths.add(f.path));
            updateSelectionUI();
        });

        const dlBtn = document.createElement('button');
        dlBtn.className = 'category-dl-btn';
        dlBtn.title = `Download ${extension.toUpperCase()} group as ZIP`;
        dlBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download ZIP</span>`;
        dlBtn.addEventListener('click', () => downloadCategory(extension, catFiles));

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '8px';
        actionsDiv.style.alignItems = 'center';
        actionsDiv.appendChild(catSelectBtn);
        actionsDiv.appendChild(dlBtn);

        h3.appendChild(actionsDiv);
        category.appendChild(h3);

        const ul = document.createElement('ul');
        catFiles.forEach(file => ul.appendChild(createFileListItem(file.path, file.content)));
        category.appendChild(ul);

        return category;
    }

    function createFileListItem(path, content) {
        const li = document.createElement('li');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.dataset.path = path;
        checkbox.checked = selectedPaths.has(path);
        checkbox.addEventListener('change', () => toggleFileSelection(path));

        const a = document.createElement('a');
        const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
        a.href = url;
        a.textContent = maintainStructureCheckbox.checked ? path : path.split('/').pop();
        a.download = a.textContent;

        const sizeBadge = document.createElement('span');
        sizeBadge.className = 'file-size-badge';
        sizeBadge.textContent = formatFileSize(content.length);

        li.appendChild(checkbox);
        li.appendChild(a);
        li.appendChild(sizeBadge);
        return li;
    }

    function sortImageFiles(imageFiles) {
        const sortOrder = sortOrderSelect.value;
        imageFiles.sort((a, b) => {
            const nameA = a.path.split('/').pop().toLowerCase();
            const nameB = b.path.split('/').pop().toLowerCase();
            switch (sortOrder) {
                case 'name_desc': return nameB.localeCompare(nameA);
                case 'size_asc': return a.content.length - b.content.length;
                case 'size_desc': return b.content.length - a.content.length;
                default: return nameA.localeCompare(nameB);
            }
        });
    }

    function updatePngGrid(categorizedFiles) {
        activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
        activeObjectUrls = [];

        const imageFiles = IMAGE_EXTENSIONS.flatMap(ext => categorizedFiles[ext] || []);
        if (imageFiles.length === 0) {
            pngGrid.style.display = 'none';
            pngGridControls.style.display = 'none';
            return;
        }

        sortImageFiles(imageFiles);

        pngGrid.innerHTML = '';
        pngGrid.style.display = 'grid';
        pngGridControls.style.display = 'flex';
        if (!pngGridControls.contains(gridSelectAllBtn)) pngGridControls.prepend(gridSelectAllBtn);

        const scaleVal = parseInt(pngGridScale.value, 10) || 30;
        const itemSize = 80 + (scaleVal / 100) * (250 - 80);
        pngGrid.style.setProperty('--grid-item-size', `${Math.floor(itemSize)}px`);

        const fragment = document.createDocumentFragment();
        imageFiles.forEach(file => fragment.appendChild(createGridNode(file)));
        pngGrid.appendChild(fragment);
    }

    function createGridNode(file) {
        const ext = file.path.split('.').pop().toLowerCase();
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const url = URL.createObjectURL(new Blob([file.content], { type: mimeType }));
        activeObjectUrls.push(url);

        const node = document.createElement('div');
        node.className = 'png-node';
        node.dataset.path = file.path;
        if (selectedPaths.has(file.path)) node.classList.add('selected');

        const wrapper = document.createElement('div');
        wrapper.className = 'png-preview-wrapper';
        if (checkerboardBgCheckbox.checked) wrapper.classList.add('checkerboard-bg');

        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';

        const indicator = document.createElement('div');
        indicator.className = 'selection-indicator';

        wrapper.appendChild(img);
        wrapper.appendChild(indicator);

        const label = document.createElement('div');
        label.className = 'png-label';
        label.textContent = file.path.split('/').pop();
        label.title = file.path;

        const info = document.createElement('div');
        info.className = 'png-info';
        info.textContent = formatFileSize(file.content.length);

        node.appendChild(label);
        node.appendChild(wrapper);
        node.appendChild(info);

        attachGridNodeEvents(node, file.path);
        return node;
    }

    function attachGridNodeEvents(node, path) {
        node.addEventListener('mousedown', e => {
            if (e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            isDragging = true;
            dragMode = !selectedPaths.has(path);
            toggleFileSelection(path, dragMode);
            lastSelectedPath = path;
        });

        node.addEventListener('dragstart', e => e.preventDefault());

        node.addEventListener('mouseenter', () => {
            if (isDragging) {
                toggleFileSelection(path, dragMode);
                lastSelectedPath = path;
            }
        });

        node.addEventListener('click', e => {
            if (e.shiftKey && lastSelectedPath) {
                const allNodes = Array.from(document.querySelectorAll('.png-node'));
                const startIdx = allNodes.findIndex(n => n.dataset.path === lastSelectedPath);
                const endIdx = allNodes.findIndex(n => n.dataset.path === path);
                if (startIdx !== -1 && endIdx !== -1) {
                    const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                    for (let i = min; i <= max; i++) selectedPaths.add(allNodes[i].dataset.path);
                    updateSelectionUI();
                }
            } else if (!e.shiftKey) {
                lastSelectedPath = path;
            }
        });
    }

    // --- Optimization & Downloader with Incremental Progress ---
    async function runZipAndDownload(pathContentPairs, filename, label) {
        try {
            showProgress(label);
            await yieldToUI();

            const totalFiles = pathContentPairs.length;
            const zipObj = {};

            // Phase 1: File map preparation with real progress (0% -> 40%)
            for (let i = 0; i < totalFiles; i++) {
                const [name, content] = pathContentPairs[i];
                zipObj[name] = content;
                if (i % CHUNK_YIELD_EVERY === 0 || i === totalFiles - 1) {
                    const prepPct = Math.round(((i + 1) / totalFiles) * 40);
                    updateProgress(prepPct, 100, `${label} (Preparing ${i + 1}/${totalFiles})`);
                    await yieldToUI();
                }
            }

            // Phase 2: Compression & Archiving with Chunk Progress (40% -> 100%)
            const zipOptions = compressZipCheckbox.checked ? { level: 6 } : { level: 0 };

            let lastTime = performance.now();
            const archiveData = await new Promise((resolve, reject) => {
                fflate.zip(zipObj, zipOptions, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });

            // Smooth incremental progress completion
            for (let p = 45; p <= 100; p += 15) {
                updateProgress(p, 100, 'Finalizing ZIP archive...');
                await yieldToUI();
            }

            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([archiveData], { type: 'application/zip' }));
            link.download = filename;
            link.click();
        } catch (error) {
            console.error(error);
            alert('Error creating ZIP archive.');
        } finally {
            hideProgress();
        }
    }

    function downloadCategory(extension, files) {
        const pairs = files.map(file => {
            const name = maintainStructureCheckbox.checked ? file.path : file.path.split('/').pop();
            return [name, file.content];
        });
        runZipAndDownload(pairs, `${packageBaseName}_${extension.toUpperCase()}.zip`, `Zipping .${extension} files`);
    }

    function downloadAll() {
        const pairs = [];
        for (const [path, content] of Object.entries(extractedFiles)) {
            if (excludeMetaCheckbox.checked && path.endsWith('.meta')) continue;
            const name = maintainStructureCheckbox.checked ? path : path.split('/').pop();
            pairs.push([name, content]);
        }
        if (pairs.length === 0) {
            alert('No files to download.');
            return;
        }
        runZipAndDownload(pairs, `${packageBaseName}_All.zip`, 'Zipping all files');
    }

    function downloadSelected() {
        if (selectedPaths.size === 0) return;
        const pairs = [];
        for (const [path, content] of Object.entries(extractedFiles)) {
            if (selectedPaths.has(path)) {
                const name = maintainStructureCheckbox.checked ? path : path.split('/').pop();
                pairs.push([name, content]);
            }
        }
        runZipAndDownload(pairs, `${packageBaseName}_Selected.zip`, 'Zipping selected files');
    }
});