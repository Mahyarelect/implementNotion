(function() {
  // ---------- Data Model ----------
  let data = {
    folders: [] // { id, name, notes: [ {...} ] }
  };

  let currentNoteId = null;
  let searchQuery = '';
  let sortMode = 'title';
  let darkMode = false;

  // ---------- Utility Functions ----------
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function saveData() {
    localStorage.setItem('notionCloneData', JSON.stringify(data));
  }

  function loadData() {
    const saved = localStorage.getItem('notionCloneData');
    if (saved) {
      try {
        data = JSON.parse(saved);
      } catch(e) {
        console.error('Failed to parse saved data', e);
      }
    }
  }

  // ---------- Markdown Parser (Simplified + color/underline) ----------
  function parseMarkdown(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeBlockContent = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code block
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = '';
          continue;
        } else {
          html += `<pre><code>${escapeHtml(codeBlockContent)}</code></pre>`;
          inCodeBlock = false;
          continue;
        }
      }

      if (inCodeBlock) {
        codeBlockContent += (codeBlockContent ? '\n' : '') + line;
        continue;
      }

      // Headings
      if (line.trim().startsWith('## ')) {
        html += `<h2>${parseInline(line.trim().substring(3))}</h2>`;
        continue;
      }
      if (line.trim().startsWith('# ')) {
        html += `<h1>${parseInline(line.trim().substring(2))}</h1>`;
        continue;
      }

      // Unordered list
      if (/^[\s]*[-*]\s/.test(line)) {
        const indent = line.match(/^(\s*)/)[1].length;
        if (indent === 0) html += '<ul>';
        html += `<li>${parseInline(line.replace(/^[\s]*[-*]\s/, ''))}</li>`;
        if (i+1 >= lines.length || !/^[\s]*[-*]\s/.test(lines[i+1])) {
          html += '</ul>';
        }
        continue;
      }

      // Ordered list
      if (/^[\s]*\d+\.\s/.test(line)) {
        const indent = line.match(/^(\s*)/)[1].length;
        if (indent === 0) html += '<ol>';
        html += `<li>${parseInline(line.replace(/^[\s]*\d+\.\s/, ''))}</li>`;
        if (i+1 >= lines.length || !/^[\s]*\d+\.\s/.test(lines[i+1])) {
          html += '</ol>';
        }
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        html += '<br>';
        continue;
      }

      // Default paragraph
      html += `<p>${parseInline(line)}</p>`;
    }

    if (inCodeBlock) {
      html += `<pre><code>${escapeHtml(codeBlockContent)}</code></pre>`;
    }

    return html;
  }

  function parseInline(text) {
    let escaped = escapeHtml(text);
    
    // 1. Color syntax: {color:red}text{/color}
    escaped = escaped.replace(/\{color:([^}]+)\}(.*?)\{\/color\}/g, (match, color, inner) => {
      return `<span style="color:${color};">${parseInline(inner)}</span>`;
    });

    // 2. Underline: ++text++
    escaped = escaped.replace(/\+\+(.*?)\+\+/g, '<u>$1</u>');

    // Bold ** or __
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__(.*?)__/g, '<strong>$1</strong>');
    // Italic * or _
    escaped = escaped.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    escaped = escaped.replace(/(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/g, '<em>$1</em>');
    // Inline code
    escaped = escaped.replace(/`(.*?)`/g, '<code>$1</code>');
    // Links [text](url)
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    return escaped;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- Note & Folder Operations ----------
  function getNoteById(id) {
    for (const folder of data.folders) {
      const note = folder.notes.find(n => n.id === id);
      if (note) return note;
    }
    return null;
  }

  function getFolderById(id) {
    return data.folders.find(f => f.id === id);
  }

  function createNote(folderId = null) {
    const id = generateId();
    const now = new Date().toISOString();
    const note = {
      id,
      title: 'یادداشت جدید',
      content: '',
      folderId: folderId || (data.folders.length ? data.folders[0].id : null),
      pinned: false,
      createdAt: now,
      updatedAt: now
    };

    if (!note.folderId && data.folders.length === 0) {
      const defaultFolderId = generateId();
      data.folders.push({ id: defaultFolderId, name: 'عمومی', notes: [] });
      note.folderId = defaultFolderId;
    }

    const folder = getFolderById(note.folderId);
    if (folder) {
      folder.notes.push(note);
      saveData();
      selectNote(id);
    }
  }

  function deleteNote(id) {
    for (const folder of data.folders) {
      folder.notes = folder.notes.filter(n => n.id !== id);
    }
    if (currentNoteId === id) {
      currentNoteId = null;
      showEmptyState();
    }
    saveData();
    render();
  }

  function togglePinNote(id) {
    const note = getNoteById(id);
    if (note) {
      note.pinned = !note.pinned;
      saveData();
      render();
    }
  }

  function moveNoteToFolder(noteId, targetFolderId) {
    const note = getNoteById(noteId);
    if (!note) return;
    for (const folder of data.folders) {
      folder.notes = folder.notes.filter(n => n.id !== noteId);
    }
    const targetFolder = getFolderById(targetFolderId);
    if (targetFolder) {
      note.folderId = targetFolderId;
      targetFolder.notes.push(note);
    }
    saveData();
    render();
  }

  function createFolder() {
    const name = prompt('نام پوشه جدید:');
    if (!name) return;
    const id = generateId();
    data.folders.push({ id, name, notes: [] });
    saveData();
    render();
  }

  function renameFolder(id) {
    const folder = getFolderById(id);
    if (!folder) return;
    const newName = prompt('نام جدید پوشه:', folder.name);
    if (newName && newName.trim() !== '') {
      folder.name = newName;
      saveData();
      render();
    }
  }

  function deleteFolder(id) {
    if (!confirm('آیا از حذف این پوشه و تمام یادداشت‌های آن مطمئن هستید؟')) return;
    data.folders = data.folders.filter(f => f.id !== id);
    if (currentNoteId && !getNoteById(currentNoteId)) {
      currentNoteId = null;
      showEmptyState();
    }
    saveData();
    render();
  }

  // ---------- Rendering ----------
  function render() {
    renderSidebar();
    renderEditor();
  }

  function renderSidebar() {
    const pinnedList = document.getElementById('pinnedList');
    const foldersList = document.getElementById('foldersList');

    let allNotes = [];
    for (const folder of data.folders) {
      allNotes.push(...folder.notes.map(n => ({...n, folderName: folder.name})));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      allNotes = allNotes.filter(n => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query));
    }

    if (sortMode === 'title') {
      allNotes.sort((a, b) => a.title.localeCompare(b.title, 'fa'));
    } else {
      allNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    const pinnedNotes = allNotes.filter(n => n.pinned);
    const unpinnedNotes = allNotes.filter(n => !n.pinned);

    pinnedList.innerHTML = pinnedNotes.map(note => `
      <div class="note-item ${currentNoteId === note.id ? 'active' : ''}" data-id="${note.id}">
        <span class="pin-icon">📌</span>
        <span class="note-title" title="${escapeHtml(note.title)}">${escapeHtml(note.title)}</span>
        <button class="icon-btn unpin-btn" data-id="${note.id}" title="برداشتن پین">✕</button>
      </div>
    `).join('');

    let html = '';
    for (const folder of data.folders) {
      const folderNotes = unpinnedNotes.filter(n => n.folderId === folder.id);
      html += `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="folder-name">
            <span>📁</span> <span class="note-title">${escapeHtml(folder.name)}</span>
          </div>
          <div class="folder-actions">
            <button class="icon-btn rename-folder-btn" data-id="${folder.id}">✏️</button>
            <button class="icon-btn delete-folder-btn" data-id="${folder.id}">🗑</button>
          </div>
        </div>
      `;
      html += folderNotes.map(note => `
        <div class="note-item ${currentNoteId === note.id ? 'active' : ''}" data-id="${note.id}" style="padding-right: 24px;">
          <span class="note-title" title="${escapeHtml(note.title)}">${escapeHtml(note.title)}</span>
          ${note.pinned ? '<span class="pin-icon">📌</span>' : ''}
        </div>
      `).join('');
    }

    foldersList.innerHTML = html;

    document.getElementById('sidebar').onclick = function(e) {
      const noteItem = e.target.closest('.note-item');
      if (noteItem && !e.target.closest('button')) {
        const id = noteItem.dataset.id;
        selectNote(id);
        return;
      }
      const pinBtn = e.target.closest('.unpin-btn');
      if (pinBtn) {
        e.stopPropagation();
        togglePinNote(pinBtn.dataset.id);
        return;
      }
      const renameBtn = e.target.closest('.rename-folder-btn');
      if (renameBtn) {
        e.stopPropagation();
        renameFolder(renameBtn.dataset.id);
        return;
      }
      const deleteBtn = e.target.closest('.delete-folder-btn');
      if (deleteBtn) {
        e.stopPropagation();
        deleteFolder(deleteBtn.dataset.id);
        return;
      }
    };
  }

  function selectNote(id) {
    currentNoteId = id;
    const note = getNoteById(id);
    if (note) {
      document.getElementById('noteEditor').style.display = 'flex';
      document.getElementById('editorContainer').style.display = 'flex';
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('noteTitle').value = note.title;
      document.getElementById('noteContent').value = note.content;
      updateFolderSelect(note.folderId);
      updatePreview();
    }
    renderSidebar();
  }

  function showEmptyState() {
    document.getElementById('noteEditor').style.display = 'none';
    document.getElementById('editorContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    currentNoteId = null;
    renderSidebar();
  }

  function updatePreview() {
    const content = document.getElementById('noteContent').value;
    const html = parseMarkdown(content);
    document.getElementById('previewContent').innerHTML = html;
  }

  function updateFolderSelect(currentFolderId) {
    const select = document.getElementById('folderSelect');
    select.innerHTML = data.folders.map(f => `<option value="${f.id}" ${f.id === currentFolderId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
  }

  function renderEditor() {
    if (!currentNoteId) {
      showEmptyState();
      return;
    }
    const note = getNoteById(currentNoteId);
    if (!note) {
      showEmptyState();
      return;
    }
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteContent').value = note.content;
    updateFolderSelect(note.folderId);
    updatePreview();
  }

  // ---------- Auto-save ----------
  let saveTimeout;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (currentNoteId) {
        const note = getNoteById(currentNoteId);
        if (note) {
          note.title = document.getElementById('noteTitle').value.trim() || 'بدون عنوان';
          note.content = document.getElementById('noteContent').value;
          note.updatedAt = new Date().toISOString();
          saveData();
          const newFolderId = document.getElementById('folderSelect').value;
          if (newFolderId !== note.folderId) {
            moveNoteToFolder(currentNoteId, newFolderId);
          }
        }
      }
      render();
    }, 500);
  }

  // ---------- Formatting helpers ----------
  const textarea = () => document.getElementById('noteContent');

  // برای دکمه‌های inline (Bold, Italic, ...)
  function insertInlineMarker(prefix, suffix) {
    const ta = textarea();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selectedText = ta.value.substring(start, end);
    const replacement = prefix + (selectedText || 'متن نمونه') + suffix;
    ta.value = ta.value.substring(0, start) + replacement + ta.value.substring(end);
    ta.focus();
    ta.setSelectionRange(start + prefix.length, start + prefix.length + (selectedText || 'متن نمونه').length);
    autoSave();
    updatePreview();
  }

  // برای دکمه‌های block (سرتیتر، لیست)
  function insertBlockMarker(prefix) {
    const ta = textarea();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // اگر متنی انتخاب شده باشد، هر خط از انتخاب را با prefix آغاز می‌کنیم
    if (start !== end) {
      const selectedText = ta.value.substring(start, end);
      const lines = selectedText.split('\n');
      const newLines = lines.map(line => {
        // اگر خط قبلاً با همان prefix شروع شده بود، اضافه نمی‌کنیم (اختیاری)
        if (line.startsWith(prefix)) return line;
        return prefix + line;
      });
      const replacement = newLines.join('\n');
      ta.value = ta.value.substring(0, start) + replacement + ta.value.substring(end);
      ta.focus();
      ta.setSelectionRange(start, start + replacement.length);
    } else {
      // هیچ انتخابی نیست: کل خط فعلی را پیدا کرده و prefix را در ابتدای آن قرار می‌دهیم
      const beforeCursor = ta.value.substring(0, start);
      const afterCursor = ta.value.substring(start);
      const lineStart = beforeCursor.lastIndexOf('\n') + 1;
      const lineEnd = afterCursor.indexOf('\n');
      const currentLine = lineEnd === -1 ? afterCursor : afterCursor.substring(0, lineEnd);
      const newLine = prefix + currentLine;
      ta.value = beforeCursor.substring(0, lineStart) + newLine + (lineEnd === -1 ? '' : afterCursor.substring(lineEnd));
      ta.focus();
      const newCursorPos = lineStart + newLine.length;
      ta.setSelectionRange(newCursorPos, newCursorPos);
    }
    autoSave();
    updatePreview();
  }

  // ---------- Event Listeners ----------
  function init() {
    loadData();
    if (data.folders.length === 0) {
      const folderId = generateId();
      data.folders.push({ id: folderId, name: 'عمومی', notes: [] });
      const noteId = generateId();
      const note = {
        id: noteId,
        title: 'خوش آمدید!',
        content: '# سلام\nاین یک **یادداشت** نمونه با رنگ‌های {color:red}قرمز{/color} و ++زیرخط‌دار++ است.\n',
        folderId: folderId,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.folders[0].notes.push(note);
      saveData();
    }

    render();
    showEmptyState();

    // Sidebar toggle
    document.getElementById('openSidebarBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
    });
    document.getElementById('closeSidebarBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
    });

    document.getElementById('newNoteBtn').addEventListener('click', () => {
      const currentFolderId = currentNoteId ? getNoteById(currentNoteId)?.folderId : null;
      createNote(currentFolderId);
    });
    document.getElementById('newFolderBtn').addEventListener('click', createFolder);

    document.getElementById('searchInput').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render();
    });

    document.getElementById('sortSelect').addEventListener('change', (e) => {
      sortMode = e.target.value;
      render();
    });

    document.getElementById('noteTitle').addEventListener('input', autoSave);
    document.getElementById('noteContent').addEventListener('input', () => {
      updatePreview();
      autoSave();
    });

    document.getElementById('folderSelect').addEventListener('change', (e) => {
      const newFolderId = e.target.value;
      if (currentNoteId) {
        moveNoteToFolder(currentNoteId, newFolderId);
      }
      autoSave();
    });

    document.getElementById('pinBtn').addEventListener('click', () => {
      if (currentNoteId) {
        togglePinNote(currentNoteId);
        render();
      }
    });

    document.getElementById('deleteNoteBtn').addEventListener('click', () => {
      if (currentNoteId && confirm('آیا از حذف این یادداشت مطمئن هستید؟')) {
        deleteNote(currentNoteId);
      }
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notion-clone-data.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (imported.folders && Array.isArray(imported.folders)) {
            data = imported;
            saveData();
            currentNoteId = null;
            showEmptyState();
            render();
            alert('داده‌ها با موفقیت وارد شدند.');
          } else {
            alert('فرمت فایل معتبر نیست.');
          }
        } catch (err) {
          alert('خطا در خواندن فایل JSON.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('darkModeToggle').addEventListener('click', () => {
      darkMode = !darkMode;
      document.body.classList.toggle('dark', darkMode);
      localStorage.setItem('darkMode', darkMode ? '1' : '0');
    });

    if (localStorage.getItem('darkMode') === '1') {
      darkMode = true;
      document.body.classList.add('dark');
    }

    // ---------- دکمه‌های قالب‌بندی ----------
    document.getElementById('boldBtn').addEventListener('click', () => insertInlineMarker('**', '**'));
    document.getElementById('italicBtn').addEventListener('click', () => insertInlineMarker('*', '*'));
    document.getElementById('underlineBtn').addEventListener('click', () => insertInlineMarker('++', '++'));
    document.getElementById('applyColorBtn').addEventListener('click', () => {
      const color = document.getElementById('colorPicker').value;
      insertInlineMarker(`{color:${color}}`, '{/color}');
    });
    document.getElementById('h1Btn').addEventListener('click', () => insertBlockMarker('# '));
    document.getElementById('h2Btn').addEventListener('click', () => insertBlockMarker('## '));
    document.getElementById('ulBtn').addEventListener('click', () => insertBlockMarker('- '));
    document.getElementById('olBtn').addEventListener('click', () => insertBlockMarker('1. '));

    // Responsive sidebar close on note select
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const sidebarEl = document.getElementById('sidebar');
    document.querySelector('.app-container').addEventListener('click', function(e) {
      if (e.target.closest('.note-item') && mediaQuery.matches) {
        sidebarEl.classList.remove('open');
      }
    });

    render();
    showEmptyState();
  }

  window.addEventListener('load', init);
})();