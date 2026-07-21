/* =========================================
   博客式文章编辑器（支持分类管理 + 旅行见闻）
   ========================================= */
(function() {
  'use strict';

  const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
  const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
  let sb;

  try { sb = supabase.createClient(SB_URL, SB_KEY); }
  catch(e) { console.warn('[blog]', e); return; }

  // 默认分类
  const DEFAULT_CATS = [
    { id: 'childhood', title: '童年篇' },
    { id: 'firstlove', title: '初恋篇' },
    { id: 'thoughts', title: '所思所想' },
    { id: 'travel', title: '旅行见闻' },
  ];

  // 自定义分类（保存在 Supabase 的 categories 表）
  let customCats = [];

  let editMode = false;
  let loaded = false;

  // ===== 样式 =====
  const CSS = document.createElement('style');
  CSS.textContent = `
#blog-pen,.blog-pen{display:none!important}

.blog-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10001;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.blog-overlay.show{display:flex}
.blog-editor{background:#1a1a1a;border-radius:20px;width:100%;max-width:680px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 60px rgba(0,0,0,.5)}
.blog-editor-header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.blog-editor-header h2{color:#fff;font-size:17px;font-weight:600;margin:0}
.blog-editor-close{width:32px;height:32px;border:none;border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
.blog-editor-close:hover{background:rgba(255,255,255,.12);color:#fff}
.blog-editor-body{padding:20px 24px;overflow-y:auto;flex:1}
.blog-field{margin-bottom:16px}
.blog-field label{display:block;color:rgba(255,255,255,.5);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.blog-field input,.blog-field select,.blog-field textarea{width:100%;padding:11px 14px;border:1px solid rgba(255,255,255,.1);border-radius:10px;font-size:15px;font-family:inherit;background:rgba(255,255,255,.05);color:#fff;outline:none;transition:border .2s;box-sizing:border-box}
.blog-field input:focus,.blog-field select:focus,.blog-field textarea:focus{border-color:rgba(255,255,255,.25)}
.blog-field select option{background:#1a1a1a;color:#fff}
.blog-field textarea{min-height:280px;resize:vertical;line-height:1.8;font-size:15px}
.blog-editor-footer{display:flex;gap:8px;justify-content:flex-end;padding:14px 24px 18px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;flex-wrap:wrap}
.blog-btn{padding:10px 22px;border:none;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit}
.blog-btn-primary{background:#fff;color:#1a1a1a}
.blog-btn-primary:hover{background:#e8e8e8}
.blog-btn-secondary{background:rgba(255,255,255,.08);color:rgba(255,255,255,.6)}
.blog-btn-secondary:hover{background:rgba(255,255,255,.14);color:#fff}
.blog-btn-danger{background:rgba(255,60,60,.15);color:rgba(255,120,120,.8)}
.blog-btn-danger:hover{background:rgba(255,60,60,.25);color:#ff8a8a}
.blog-btn-ghost{background:transparent;color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.1)}
.blog-btn-ghost:hover{background:rgba(255,255,255,.06);color:#fff}

.ee-act{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}
.ee-act button{padding:4px 12px;border:1px solid rgba(255,255,255,.15);border-radius:5px;background:transparent;color:rgba(255,255,255,.6);font-size:11px;cursor:pointer;transition:all .2s;font-family:inherit}
.ee-act button:hover{background:rgba(255,255,255,.1);color:#fff}
.ee-act .ee-del{border-color:rgba(255,80,80,.25);color:rgba(255,130,130,.7)}
.ee-act .ee-del:hover{background:rgba(255,50,50,.15)!important;color:#ff7a7a!important}

.ee-toolbar{display:flex;gap:8px;justify-content:center;padding:16px 0 8px;border-top:1px solid rgba(255,255,255,.08);margin-top:12px;flex-wrap:wrap}
.ee-toolbar button{padding:7px 18px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:transparent;color:rgba(255,255,255,.65);font-size:13px;cursor:pointer;transition:all .2s;font-family:inherit}
.ee-toolbar button:hover{background:rgba(255,255,255,.1);color:#fff}

/* 分类管理 */
.cat-list{display:flex;flex-direction:column;gap:8px}
.cat-item{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,.04);border-radius:8px;border:1px solid rgba(255,255,255,.05)}
.cat-item .name{flex:1;color:#fff;font-size:14px}
.cat-item .count{color:rgba(255,255,255,.4);font-size:12px;margin-right:8px}
.cat-item input{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:5px 10px;color:#fff;font-size:13px;outline:none;flex:1}

@media(max-width:600px){
  .blog-overlay{padding:10px}
  .blog-editor{border-radius:16px;max-height:96vh}
  .blog-editor-header{padding:14px 16px}
  .blog-editor-body{padding:14px 16px}
  .blog-editor-footer{padding:12px 16px 14px}
  /* pen按钮已废弃 */
  .blog-field textarea{min-height:200px}
}`;
  document.head.appendChild(CSS);

  // ===== 创建编辑器DOM =====
  const editorHTML = `
  <div class="blog-overlay" id="blogOverlay">
    <div class="blog-editor">
      <div class="blog-editor-header">
        <h2 id="blogEditorTitle">新文章</h2>
        <button class="blog-editor-close" id="blogEditorClose">✕</button>
      </div>
      <div class="blog-editor-body" id="blogEditorBody">
        <div class="blog-field">
          <label>分类</label>
          <select id="blogCategory"></select>
        </div>
        <div class="blog-field">
          <label>标题</label>
          <input id="blogTitle" placeholder="文章标题" autocomplete="off">
        </div>
        <div class="blog-field">
          <label>日期</label>
          <input id="blogDate" placeholder="2026.7.20（可选）" autocomplete="off">
        </div>
        <div class="blog-field">
          <label>正文</label>
          <textarea id="blogBody" placeholder="写点什么..." spellcheck="true"></textarea>
        </div>
      </div>
      <div class="blog-editor-footer" id="blogEditorFooter">
        <button class="blog-btn blog-btn-ghost" id="blogCancelBtn">取消</button>
        <button class="blog-btn blog-btn-danger" id="blogDeleteBtn" style="display:none">删除</button>
        <button class="blog-btn blog-btn-primary" id="blogSaveBtn">发布</button>
      </div>
    </div>
  </div>

  <div class="blog-overlay" id="catOverlay">
    <div class="blog-editor">
      <div class="blog-editor-header">
        <h2>管理分类</h2>
        <button class="blog-editor-close" id="catCloseBtn">✕</button>
      </div>
      <div class="blog-editor-body" id="catList"></div>
      <div class="blog-editor-footer">
        <button class="blog-btn blog-btn-ghost" id="catAddBtn">+ 新分类</button>
        <button class="blog-btn blog-btn-primary" id="catDoneBtn">完成</button>
      </div>
    </div>
  </div>`;

  const wrap = document.createElement('div');
  wrap.innerHTML = editorHTML;
  document.body.appendChild(wrap.firstElementChild);
  document.body.appendChild(wrap.lastElementChild);

  // ===== 分类数据 =====
  function getAllCats() {
    const all = [...DEFAULT_CATS, ...customCats];
    return all;
  }

  function getCatTitle(id) {
    const c = getAllCats().find(c => c.id === id);
    return c ? c.title : id;
  }

  function refreshCategoryOptions() {
    const sel = document.getElementById('blogCategory');
    if (!sel) return;
    sel.innerHTML = getAllCats().map(c =>
      `<option value="${c.id}">${c.title}</option>`
    ).join('');
  }

  // ===== 编辑器 =====
  let editingId = null;

  function openEditor(article) {
    refreshCategoryOptions();
    editingId = article ? (article._sid || null) : null;
    document.getElementById('blogEditorTitle').textContent = article ? '编辑文章' : '新文章';
    document.getElementById('blogCategory').value = article ? (article._cat || 'thoughts') : 'thoughts';
    document.getElementById('blogTitle').value = article ? article.title : '';
    document.getElementById('blogDate').value = article ? (article.date || '') : '';
    document.getElementById('blogBody').value = article ? article.body : '';
    document.getElementById('blogDeleteBtn').style.display = article ? 'inline-block' : 'none';
    document.getElementById('blogSaveBtn').textContent = article ? '保存' : '发布';
    document.getElementById('blogOverlay').classList.add('show');
    setTimeout(() => document.getElementById('blogTitle').focus(), 100);
  }

  function closeEditor() {
    document.getElementById('blogOverlay').classList.remove('show');
    editingId = null;
  }

  document.getElementById('blogEditorClose').onclick = closeEditor;
  document.getElementById('blogCancelBtn').onclick = closeEditor;
  document.getElementById('blogOverlay').onclick = e => { if (e.target === e.currentTarget) closeEditor(); };

  document.getElementById('blogSaveBtn').onclick = async () => {
    const title = document.getElementById('blogTitle').value.trim();
    const body = document.getElementById('blogBody').value.trim();
    if (!title || !body) { alert('标题和正文不能为空'); return; }
    const cat = document.getElementById('blogCategory').value;
    const dateStr = document.getElementById('blogDate').value.trim();

    // 根据日期自动算排序（最新在前）
    let sortOrder = -Date.now();
    if (dateStr) {
      const m = dateStr.match(/^(\d{2,4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
      if (m) {
        let y = parseInt(m[1]);
        if (y < 100) y += 2000;
        const ts = new Date(y, parseInt(m[2]) - 1, parseInt(m[3])).getTime();
        if (!isNaN(ts)) sortOrder = -ts;
      }
    }

    const data = {
      category: cat,
      category_title: getCatTitle(cat),
      title, date: dateStr, body,
      sort_order: sortOrder,
    };

    let err;
    if (editingId) ({ error: err } = await sb.from('essays').update(data).eq('id', editingId));
    else ({ error: err } = await sb.from('essays').insert(data));
    if (err) { alert('❌ ' + err.message); return; }
    closeEditor();
    await refreshData();
    if (typeof updateModalView === 'function') updateModalView();
    injectEditButtons();
  };

  document.getElementById('blogDeleteBtn').onclick = async () => {
    if (!editingId) return;
    if (!confirm('确定删除？')) return;
    const { error: err } = await sb.from('essays').delete().eq('id', editingId);
    if (err) { alert('❌ ' + err.message); return; }
    closeEditor();
    await refreshData();
    if (typeof updateModalView === 'function') updateModalView();
    injectEditButtons();
  };

  // ===== 分类管理 =====
  function openCatManager() {
    renderCatList();
    document.getElementById('catOverlay').classList.add('show');
  }
  function closeCatManager() {
    document.getElementById('catOverlay').classList.remove('show');
    saveCustomCats();
  }

  document.getElementById('catCloseBtn').onclick = closeCatManager;
  document.getElementById('catDoneBtn').onclick = closeCatManager;
  document.getElementById('catAddBtn').onclick = () => {
    const id = 'cat_' + Date.now();
    customCats.push({ id, title: '新分类' });
    renderCatList();
  };
  document.getElementById('catOverlay').onclick = e => { if (e.target === e.currentTarget) closeCatManager(); };

  function renderCatList() {
    const wrap = document.getElementById('catList');
    const all = getAllCats();
    // 统计文章数
    const counts = {};
    for (const a of (window.essayCategories || [])) {
      for (const x of (a.articles || [])) counts[x._cat || a.id] = (counts[x._cat || a.id] || 0) + 1;
    }
    if (typeof travels !== 'undefined') {
      for (const t of travels) counts['travel'] = (counts['travel'] || 0) + 1;
    }

    wrap.innerHTML = '<div class="cat-list">' + all.map(c => {
      const isDefault = DEFAULT_CATS.find(d => d.id === c.id);
      return `<div class="cat-item" data-id="${c.id}">
        <span class="name">${isDefault ? '🔒 ' : ''}<span class="editable">${c.title}</span></span>
        <span class="count">${counts[c.id] || 0} 篇</span>
        ${!isDefault ? `<button class="ee-act-btn ee-del" onclick="BLOG.delCat('${c.id}')" style="padding:3px 10px;border:1px solid rgba(255,80,80,.25);border-radius:5px;background:transparent;color:rgba(255,130,130,.7);font-size:11px;cursor:pointer">🗑</button>` : ''}
      </div>`;
    }).join('') + '</div>';

    // 默认分类可以改名字，自定义分类可以改名字
    wrap.querySelectorAll('.cat-item .editable').forEach(span => {
      span.style.cursor = 'pointer';
      span.title = '点击修改';
      span.onclick = () => {
        const item = span.closest('.cat-item');
        const id = item.dataset.id;
        const newName = prompt('新分类名:', span.textContent);
        if (!newName) return;
        const c = all.find(x => x.id === id);
        if (c) c.title = newName.trim();
        renderCatList();
      };
    });
  }

  async function saveCustomCats() {
    // 保存到 localStorage（也可以存到 Supabase 的 categories 表）
    try {
      localStorage.setItem('blogCustomCats', JSON.stringify(customCats));
    } catch(e) {}
  }

  function loadCustomCats() {
    try {
      const c = localStorage.getItem('blogCustomCats');
      if (c) customCats = JSON.parse(c);
    } catch(e) {}
  }

  // ===== 数据 =====
  async function loadData() {
    try {
      const { data, error } = await sb.from('essays').select('*').order('sort_order', { ascending: false }).order('created_at', { ascending: false });
      if (error) return null;
      return data || [];
    } catch(e) { return null; }
  }

  function mergeToCategories(rows) {
    if (typeof essayCategories === 'undefined') return;
    const groups = {};
    rows.forEach(r => {
      const k = r.category || 'thoughts';
      if (!groups[k]) groups[k] = [];
      groups[k].push({ title: r.title, date: r.date || '', body: r.body, _sid: r.id, _cat: r.category });
    });
    essayCategories.forEach(cat => {
      if (groups[cat.id] && groups[cat.id].length > 0) cat.articles = groups[cat.id];
    });
    // 处理 travels
    if (typeof travels !== 'undefined' && groups['travel']) {
      travels.length = 0;
      groups['travel'].forEach(a => travels.push(a));
    }
  }

  async function refreshData() {
    const data = await loadData();
    if (data && data.length > 0) mergeToCategories(data);
  }

  async function importOld() {
    const data = await loadData();
    if (data && data.length > 0) return;
    let count = 0;
    // essayCategories
    if (typeof essayCategories !== 'undefined') {
      for (const cat of essayCategories) {
        for (const art of (cat.articles || [])) {
          if (art._sid) continue;
          const { error } = await sb.from('essays').insert({
            category: cat.id, category_title: cat.title,
            title: art.title, date: art.date || '', body: art.body,
            sort_order: -Date.now() + count,
          });
          if (!error) count++;
        }
      }
    }
    // travels
    if (typeof travels !== 'undefined') {
      for (const art of travels) {
        if (art._sid) continue;
        const { error } = await sb.from('essays').insert({
          category: 'travel', category_title: '旅行见闻',
          title: art.title, date: art.date || '', body: art.body,
          sort_order: -Date.now() + count,
        });
        if (!error) count++;
      }
    }
    if (count > 0) {
      console.log('[blog] 导入', count, '篇文章');
      await refreshData();
    }
  }

  // ===== 编辑按钮 =====
  function injectEditButtons() {
    if (!editMode) return;
    const body = document.querySelector('.modal-body');
    if (!body) return;
    if (!body.querySelector('.article-list, .content-body')) return;
    if (body.querySelector('.ee-toolbar')) return;

    const bar = document.createElement('div');
    bar.className = 'ee-toolbar';
    bar.innerHTML = '<button onclick="BLOG.add()">✏️ 写新文章</button><button onclick="BLOG.openCats()">📂 管理分类</button><button onclick="BLOG.toggle()">✕ 退出编辑</button>';
    body.appendChild(bar);

    body.querySelectorAll('.article-item').forEach((item, i) => {
      if (item.querySelector('.ee-act')) return;
      const act = document.createElement('div');
      act.className = 'ee-act';
      act.innerHTML = '<span style="color:rgba(255,255,255,.3);margin-right:6px;cursor:grab;user-select:none">⠿</span><button onclick="event.stopPropagation();BLOG.edit(this)">✎</button><button class="ee-del" onclick="event.stopPropagation();BLOG.del(this)">🗑</button>';
      item.appendChild(act);

      // 添加拖拽
      item.draggable = true;
      item.dataset.idx = i;
      item.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', i);
      });
      item.addEventListener('dragend', e => {
        item.classList.remove('dragging');
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.style.borderTop = '2px solid #2d7eff';
      });
      item.addEventListener('dragleave', e => {
        item.style.borderTop = '';
      });
      item.addEventListener('drop', async e => {
        e.preventDefault();
        item.style.borderTop = '';
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const toIdx = parseInt(item.dataset.idx);
        if (fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx)) return;
        // 找到当前分类
        const titleEl = item.querySelector('.title');
        if (!titleEl) return;
        const titleText = titleEl.textContent.trim().replace(/\s+/g, ' ');
        for (const cat of essayCategories) {
          for (const art of (cat.articles || [])) {
            const artTitle = (art.title || '').trim().replace(/\s+/g, ' ');
            if (artTitle === titleText) {
              // 找到当前分类
              const from = cat.articles[fromIdx];
              const to = cat.articles[toIdx];
              if (from && to && from._sid && to._sid) {
                const fromOrder = from.sort_order;
                const toOrder = to.sort_order;
                await sb.from('essays').update({ sort_order: toOrder }).eq('id', from._sid);
                await sb.from('essays').update({ sort_order: fromOrder }).eq('id', to._sid);
                await refreshData();
                if (typeof updateModalView === 'function') updateModalView();
                setTimeout(injectEditButtons, 100);
              }
              return;
            }
          }
        }
      });
    });
  }

  // 关键修复：essayCategories 是 const 声明，不在 window 上
  function findArticle(btn) {
    const item = btn.closest('.article-item');
    if (!item) return null;
    const t = item.querySelector('.title');
    if (!t) return null;
    const titleText = (t.textContent || '').trim().replace(/\s+/g, ' ');

    // 搜索 essayCategories
    if (typeof essayCategories !== 'undefined') {
      for (const cat of essayCategories) {
        for (const art of (cat.articles || [])) {
          const artTitle = (art.title || '').trim().replace(/\s+/g, ' ');
          if (artTitle === titleText) {
            if (!art._cat) art._cat = cat.id;
            return art;
          }
        }
      }
    }
    // 搜索 travels
    if (typeof travels !== 'undefined') {
      for (const art of travels) {
        const artTitle = (art.title || '').trim().replace(/\s+/g, ' ');
        if (artTitle === titleText) {
          if (!art._cat) art._cat = 'travel';
          return art;
        }
      }
    }
    return null;
  }

  // ===== 模式切换 =====
  function toggleMode() {
    editMode = !editMode;
    document.querySelectorAll('.ee-toolbar, .ee-act').forEach(el => el.remove());
    const pen = document.getElementById('blog-pen');
    if (pen) {
      pen.classList.toggle('active', editMode);
      pen.style.color = editMode ? '#fff' : 'rgba(255,255,255,.4)';
    }
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditButtons, 100);
  }

  function watchDOM() {
    const obs = new MutationObserver(() => setTimeout(injectEditButtons, 60));
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', () => setTimeout(injectEditButtons, 100));
  }

  // ===== 暴露全局 =====
  window.BLOG = {
    toggle: toggleMode,
    isEditing: () => editMode,
    add: () => openEditor(null),
    show: () => { if (!editMode) toggleMode(); },
    edit: (btn) => { const d = findArticle(btn); if (d) openEditor(d); else alert('找不到文章，请刷新后重试'); },
    del: async (btn) => {
      const d = findArticle(btn);
      if (!d || !d._sid) { alert('找不到数据'); return; }
      if (!confirm('确定删除「' + d.title + '」？')) return;
      const { error } = await sb.from('essays').delete().eq('id', d._sid);
      if (error) { alert('❌ ' + error.message); return; }
      await refreshData();
      if (typeof updateModalView === 'function') updateModalView();
      setTimeout(injectEditButtons, 100);
    },
    openCats: openCatManager,
    delCat: (id) => {
      const c = getAllCats().find(x => x.id === id);
      if (!c) return;
      if (DEFAULT_CATS.find(d => d.id === id)) { alert('默认分类不能删'); return; }
      if (!confirm('确定删除分类「' + c.title + '」？\n该分类下的文章也会一起删除。')) return;
      // 删除该分类下的所有文章
      sb.from('essays').delete().eq('category', id).then(({ error }) => {
        if (error) { alert('❌ ' + error.message); return; }
        customCats = customCats.filter(x => x.id !== id);
        saveCustomCats();
        refreshData();
        renderCatList();
      });
    },
  };

  // 由 settings-menu 统一管理入口，这里不添加浮动按钮
  function addPen() { /* 已迁移到 settings-menu */ }

  async function init() {
    if (loaded) return;
    loaded = true;
    loadCustomCats();

    const data = await loadData();
    if (!data || data.length === 0) {
      await importOld();
    } else {
      mergeToCategories(data);
    }

    addPen();
    watchDOM();
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
