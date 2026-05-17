(function () {
  'use strict';

  /* State */
  const storageKey = 'notionCloneData';
  const darkModeKey = 'darkMode';
  let data = { folders: [] };
  let currentNoteId = null;
  let searchQuery = '';
  let sortMode = 'title';
  let saveTimer = null;

  /* Elements */
  const $ = (id) => document.getElementById(id);
  const elements = {};

  function cacheElements() {
    [
      'sidebar', 'sidebarOverlay', 'openSidebarBtn', 'closeSidebarBtn', 'newNoteBtn', 'newFolderBtn',
      'sortSelect', 'searchInput', 'pinnedList', 'foldersList', 'noteEditor', 'noteTitle',
      'folderSelect', 'pinBtn', 'deleteNoteBtn', 'exportBtn', 'importBtn', 'importFile',
      'darkModeToggle', 'emptyState', 'editorContainer', 'noteContent', 'previewContent',
      'boldBtn', 'italicBtn', 'underlineBtn', 'colorPicker', 'applyColorBtn', 'h1Btn', 'h2Btn',
      'h3Btn', 'ulBtn', 'olBtn', 'codeBtn', 'linkBtn'
    ].forEach((id) => { elements[id] = $(id); });
  }

  /* Storage */
  function saveData() {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(storageKey);
      data = saved ? JSON.parse(saved) : { folders: [] };
    } catch (_) {
      data = { folders: [] };
    }

    if (!data || !Array.isArray(data.folders)) {
      data = { folders: [] };
    }

    data.folders.forEach((folder) => {
      if (!Array.isArray(folder.notes)) folder.notes = [];
      folder.notes.forEach((note) => {
        note.folderId = folder.id;
        note.title = note.title || 'بدون عنوان';
        note.content = note.content || '';
        note.pinned = Boolean(note.pinned);
        note.createdAt = note.createdAt || new Date().toISOString();
        note.updatedAt = note.updatedAt || note.createdAt;
      });
    });
  }

  function createDefaultData() {
    if (data.folders.length > 0) return;

    const folderId = generateId();
    const noteId = generateId();
    const now = new Date().toISOString();

    data.folders.push({
      id: folderId,
      name: 'عمومی',
      notes: [{
        id: noteId,
        title: 'خوش آمدید!',
        content: '# سلام\nاین یک **یادداشت** نمونه است.\n\n## امکانات\n- ساخت یادداشت\n- پوشه‌بندی\n- جستجو و مرتب‌سازی\n- خروجی و ورودی JSON\n\n[لینک نمونه](https://example.com) و `کد کوتاه`\n',
        folderId,
        pinned: false,
        createdAt: now,
        updatedAt: now
      }]
    });

    saveData();
  }

  /* Helpers */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(value));
    } catch (_) {
      return '';
    }
  }

  function getFolderById(id) {
    return data.folders.find((folder) => folder.id === id) || null;
  }

  function getNoteById(id) {
    for (const folder of data.folders) {
      const note = folder.notes.find((item) => item.id === id);
      if (note) return note;
    }
    return null;
  }

  function getAllNotes() {
    return data.folders.flatMap((folder) => folder.notes.map((note) => ({ ...note, folderName: folder.name })));
  }

  function getVisibleNotes() {
    const query = searchQuery.toLowerCase();
    const notes = getAllNotes().filter((note) => {
      if (!query) return true;
      return note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query);
    });

    notes.sort((a, b) => {
      if (sortMode === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sortMode === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
      return a.title.localeCompare(b.title, 'fa');
    });

    return notes;
  }

  function ensureFolder() {
    if (data.folders.length) return data.folders[0].id;
    const id = generateId();
    data.folders.push({ id, name: 'عمومی', notes: [] });
    return id;
  }

  /* Markdown */
  function parseMarkdown(text) {
    const lines = String(text || '').split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeBlock = [];
    let listType = null;

    function closeList() {
      if (listType) {
        html += `</${listType}>`;
        listType = null;
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        closeList();
        if (inCodeBlock) {
          html += `<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`;
          codeBlock = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlock.push(line);
        continue;
      }

      if (!trimmed) {
        closeList();
        html += '<br>';
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html += `<h${level}>${parseInline(heading[2])}</h${level}>`;
        continue;
      }

      const quote = trimmed.match(/^>\s+(.+)$/);
      if (quote) {
        closeList();
        html += `<blockquote>${parseInline(quote[1])}</blockquote>`;
        continue;
      }

      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      if (unordered) {
        if (listType !== 'ul') {
          closeList();
          html += '<ul>';
          listType = 'ul';
        }
        html += `<li>${parseInline(unordered[1])}</li>`;
        continue;
      }

      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ordered) {
        if (listType !== 'ol') {
          closeList();
          html += '<ol>';
          listType = 'ol';
        }
        html += `<li>${parseInline(ordered[1])}</li>`;
        continue;
      }

      closeList();
      html += `<p>${parseInline(line)}</p>`;
    }

    closeList();
    if (inCodeBlock) html += `<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`;
    return html;
  }

  function parseInline(text) {
    const tokens = [];
    let safe = escapeHtml(text);

    safe = safe.replace(/`([^`]+)`/g, (_, code) => {
      tokens.push(`<code>${code}</code>`);
      return `\u0000${tokens.length - 1}\u0000`;
    });

    safe = safe.replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    safe = safe.replace(/\{color:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}(.+?)\{\/color\}/g, '<span style="color:$1">$2</span>');
    safe = safe.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/__(.+?)__/g, '<strong>$1</strong>');
    safe = safe.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    safe = safe.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

    return safe.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || '');
  }

  /* Notes and folders */
  function createNote(folderId) {
    const targetFolderId = folderId || (currentNoteId ? getNoteById(currentNoteId)?.folderId : null) || ensureFolder();
    const folder = getFolderById(targetFolderId) || getFolderById(ensureFolder());
    const now = new Date().toISOString();
    const note = {
      id: generateId(),
      title: 'یادداشت جدید',
      content: '',
      folderId: folder.id,
      pinned: false,
      createdAt: now,
      updatedAt: now
    };

    folder.notes.push(note);
    saveData();
    selectNote(note.id);
  }

  function deleteNote(id) {
    data.folders.forEach((folder) => {
      folder.notes = folder.notes.filter((note) => note.id !== id);
    });
    if (currentNoteId === id) currentNoteId = null;
    saveData();
    render();
  }

  function togglePinNote(id) {
    const note = getNoteById(id);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    saveData();
    updatePinButton();
    renderSidebar();
  }

  function moveNoteToFolder(noteId, targetFolderId) {
    const targetFolder = getFolderById(targetFolderId);
    const note = getNoteById(noteId);
    if (!targetFolder || !note || note.folderId === targetFolderId) return;

    data.folders.forEach((folder) => {
      folder.notes = folder.notes.filter((item) => item.id !== noteId);
    });

    note.folderId = targetFolderId;
    note.updatedAt = new Date().toISOString();
    targetFolder.notes.push(note);
    saveData();
    renderSidebar();
  }

  function createFolder() {
    const name = normalizeText(prompt('نام پوشه جدید:'));
    if (!name) return;
    data.folders.push({ id: generateId(), name, notes: [] });
    saveData();
    renderSidebar();
    updateFolderSelect();
  }

  function renameFolder(id) {
    const folder = getFolderById(id);
    if (!folder) return;
    const name = normalizeText(prompt('نام جدید پوشه:', folder.name));
    if (!name) return;
    folder.name = name;
    saveData();
    renderSidebar();
    updateFolderSelect();
  }

  function deleteFolder(id) {
    const folder = getFolderById(id);
    if (!folder) return;
    if (!confirm('آیا از حذف این پوشه و تمام یادداشت‌های آن مطمئن هستید؟')) return;

    const deletedCurrentNote = folder.notes.some((note) => note.id === currentNoteId);
    data.folders = data.folders.filter((item) => item.id !== id);
    if (!data.folders.length) ensureFolder();
    if (deletedCurrentNote) currentNoteId = null;
    saveData();
    render();
  }

  /* Rendering */
  function render() {
    renderSidebar();
    if (currentNoteId && getNoteById(currentNoteId)) renderEditor();
    else showEmptyState();
  }

  function renderSidebar() {
    const notes = getVisibleNotes();
    const pinned = notes.filter((note) => note.pinned);
    const unpinned = notes.filter((note) => !note.pinned);

    elements.pinnedList.innerHTML = pinned.length
      ? pinned.map(renderNoteItem).join('')
      : '<div class="empty-list">یادداشت پین‌شده‌ای وجود ندارد.</div>';

    elements.foldersList.innerHTML = data.folders.map((folder) => {
      const folderNotes = unpinned.filter((note) => note.folderId === folder.id);
      return `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="folder-name"><span>📁</span><span class="note-title">${escapeHtml(folder.name)}</span></div>
          <div class="folder-actions">
            <button class="icon-btn rename-folder-btn" data-id="${folder.id}" type="button" title="تغییر نام">✏️</button>
            <button class="icon-btn delete-folder-btn" data-id="${folder.id}" type="button" title="حذف">🗑</button>
          </div>
        </div>
        ${folderNotes.length ? folderNotes.map(renderNoteItem).join('') : '<div class="empty-list">یادداشتی در این پوشه نیست.</div>'}
      `;
    }).join('');
  }

  function renderNoteItem(note) {
    return `
      <div class="note-item ${currentNoteId === note.id ? 'active' : ''}" data-id="${note.id}" title="${escapeHtml(note.title)}">
        ${note.pinned ? '<span class="pin-icon">📌</span>' : '<span>📝</span>'}
        <span class="note-title">${escapeHtml(note.title || 'بدون عنوان')}</span>
        <span class="note-meta">${formatDate(note.updatedAt)}</span>
      </div>
    `;
  }

  function renderEditor() {
    const note = getNoteById(currentNoteId);
    if (!note) return showEmptyState();

    elements.noteEditor.hidden = false;
    elements.editorContainer.hidden = false;
    elements.emptyState.style.display = 'none';
    elements.noteTitle.value = note.title;
    elements.noteContent.value = note.content;
    updateFolderSelect();
    updatePinButton();
    updatePreview();
  }

  function showEmptyState() {
    elements.noteEditor.hidden = true;
    elements.editorContainer.hidden = true;
    elements.emptyState.style.display = 'flex';
  }

  function selectNote(id) {
    if (!getNoteById(id)) return;
    currentNoteId = id;
    renderEditor();
    renderSidebar();
    closeSidebar();
  }

  function updateFolderSelect() {
    const note = currentNoteId ? getNoteById(currentNoteId) : null;
    elements.folderSelect.innerHTML = data.folders.map((folder) => (
      `<option value="${folder.id}" ${note && note.folderId === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`
    )).join('');
  }

  function updatePinButton() {
    const note = currentNoteId ? getNoteById(currentNoteId) : null;
    elements.pinBtn.textContent = note && note.pinned ? '📌 حذف پین' : '📌 پین';
  }

  function updatePreview() {
    elements.previewContent.innerHTML = parseMarkdown(elements.noteContent.value);
  }

  /* Auto save */
  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const note = currentNoteId ? getNoteById(currentNoteId) : null;
      if (!note) return;
      note.title = normalizeText(elements.noteTitle.value) || 'بدون عنوان';
      note.content = elements.noteContent.value;
      note.updatedAt = new Date().toISOString();
      saveData();
      renderSidebar();
    }, 250);
  }

  /* Formatting */
  function insertText(prefix, suffix, fallback) {
    const textarea = elements.noteContent;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || fallback;
    const replacement = `${prefix}${selected}${suffix}`;

    textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    updatePreview();
    autoSave();
  }

  function insertLinePrefix(prefix) {
    const textarea = elements.noteContent;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const selectedBlock = value.slice(lineStart, lineEnd);
    const replacement = selectedBlock.split('\n').map((line) => line.startsWith(prefix) ? line : prefix + line).join('\n');

    textarea.value = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + replacement.length);
    updatePreview();
    autoSave();
  }

  /* Import export */
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'notion-clone-data.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!imported || !Array.isArray(imported.folders)) throw new Error('Invalid file');
        data = imported;
        currentNoteId = null;
        saveData();
        loadData();
        createDefaultData();
        render();
        alert('داده‌ها با موفقیت وارد شدند.');
      } catch (_) {
        alert('فرمت فایل JSON معتبر نیست.');
      }
    };
    reader.readAsText(file);
  }

  /* Responsive */
  function openSidebar() {
    elements.sidebar.classList.add('open');
    elements.sidebarOverlay.classList.add('show');
  }

  function closeSidebar() {
    elements.sidebar.classList.remove('open');
    elements.sidebarOverlay.classList.remove('show');
  }

  /* Events */
  function bindEvents() {
    elements.openSidebarBtn.addEventListener('click', openSidebar);
    elements.closeSidebarBtn.addEventListener('click', closeSidebar);
    elements.sidebarOverlay.addEventListener('click', closeSidebar);

    elements.newNoteBtn.addEventListener('click', () => createNote());
    elements.newFolderBtn.addEventListener('click', createFolder);
    elements.sortSelect.addEventListener('change', (event) => {
      sortMode = event.target.value;
      renderSidebar();
    });
    elements.searchInput.addEventListener('input', (event) => {
      searchQuery = event.target.value.trim();
      renderSidebar();
    });

    elements.sidebar.addEventListener('click', (event) => {
      const renameButton = event.target.closest('.rename-folder-btn');
      const deleteButton = event.target.closest('.delete-folder-btn');
      const noteItem = event.target.closest('.note-item');

      if (renameButton) return renameFolder(renameButton.dataset.id);
      if (deleteButton) return deleteFolder(deleteButton.dataset.id);
      if (noteItem) return selectNote(noteItem.dataset.id);
    });

    elements.noteTitle.addEventListener('input', autoSave);
    elements.noteContent.addEventListener('input', () => {
      updatePreview();
      autoSave();
    });
    elements.folderSelect.addEventListener('change', (event) => moveNoteToFolder(currentNoteId, event.target.value));
    elements.pinBtn.addEventListener('click', () => togglePinNote(currentNoteId));
    elements.deleteNoteBtn.addEventListener('click', () => {
      if (currentNoteId && confirm('آیا از حذف این یادداشت مطمئن هستید؟')) deleteNote(currentNoteId);
    });

    elements.exportBtn.addEventListener('click', exportJson);
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) importJson(file);
      event.target.value = '';
    });

    elements.darkModeToggle.addEventListener('click', () => {
      const enabled = !document.body.classList.contains('dark');
      document.body.classList.toggle('dark', enabled);
      localStorage.setItem(darkModeKey, enabled ? '1' : '0');
    });

    elements.boldBtn.addEventListener('click', () => insertText('**', '**', 'متن ضخیم'));
    elements.italicBtn.addEventListener('click', () => insertText('*', '*', 'متن کج'));
    elements.underlineBtn.addEventListener('click', () => insertText('++', '++', 'متن زیرخط‌دار'));
    elements.applyColorBtn.addEventListener('click', () => insertText(`{color:${elements.colorPicker.value}}`, '{/color}', 'متن رنگی'));
    elements.h1Btn.addEventListener('click', () => insertLinePrefix('# '));
    elements.h2Btn.addEventListener('click', () => insertLinePrefix('## '));
    elements.h3Btn.addEventListener('click', () => insertLinePrefix('### '));
    elements.ulBtn.addEventListener('click', () => insertLinePrefix('- '));
    elements.olBtn.addEventListener('click', () => insertLinePrefix('1. '));
    elements.codeBtn.addEventListener('click', () => insertText('`', '`', 'code'));
    elements.linkBtn.addEventListener('click', () => insertText('[', '](https://example.com)', 'متن لینک'));
  }

  /* Init */
  function init() {
    cacheElements();
    loadData();
    createDefaultData();
    bindEvents();

    if (localStorage.getItem(darkModeKey) === '1') {
      document.body.classList.add('dark');
    }

    render();
  }

  window.addEventListener('DOMContentLoaded', init);
}());
