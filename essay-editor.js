/* =========================================
   博客式文章编辑器（全屏弹窗版）
   ========================================= */
(function() {
  'use strict';

  // ===== Supabase 配置 =====
  const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
  const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
  let sb;

  try {
    sb = supabase.createClient(SB_URL, SB_KEY);
  } catch(e) { console.warn('[blog]', e); return; }

  // ===== 状态 =====
  let editMode = false;
  let loaded = false;

  // ===== 样式 =====
  const CSS = document.createElement('style');
  CSS.textContent = `
/* ✏️ 触发按钮 */
#blog-pen{position:fixed;bottom:24px;right:24px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:rgba(255,255,255,.4);font-size:20px;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .3s;user-select:none;-webkit-user-select:none;box-shadow:0 2px 12px rgba(0,0,0,.2)}
#blog-pen:hover,#blog-pen.active{background:rgba(255,255,255,.18);color:#fff;border-color:rgba(255,255,255,.3);transform:scale(1.05)}

/* 全屏编辑器遮罩 */
.blog-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10001;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.blog-overlay.show{display:flex}

/* 编辑器卡片 */
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

/* 编辑模式下文章列表的按钮 */
.ee-act{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}
.ee-act button{padding:4px 12px;border:1px solid rgba(255,255,255,.15);border-radius:5px;background:transparent;color:rgba(255,255,255,.6);font-size:11px;cursor:pointer;transition:all .2s;font-family:inherit}
.ee-act button:hover{background:rgba(255,255,255,.1);color:#fff}
.ee-act .ee-del{border-color:rgba(255,80,80,.25);color:rgba(255,130,130,.7)}
.ee-act .ee-del:hover{background:rgba(255,50,50,.15)!important;color:#ff7a7a!important}

/* 底部工具栏 */
.ee-toolbar{display:flex;gap:8px;justify-content:center;padding:16px 0 8px;border-top:1px solid rgba(255,255,255,.08);margin-top:12px;flex-wrap:wrap}
.ee-toolbar button{padding:7px 18px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:transparent;color:rgba(255,255,255,.65);font-size:13px;cursor:pointer;transition:all .2s;font-family:inherit}
.ee-toolbar button:hover{background:rgba(255,255,255,.1);color:#fff}

@media(max-width:600px){
  .blog-overlay{padding:10px}
  .blog-editor{border-radius:16px;max-height:96vh}
  .blog-editor-header{padding:14px 16px}
  .blog-editor-body{padding:14px 16px}
  .blog-editor-footer{padding:12px 16px 14px}
  #blog-pen{width:40px;height:40px;font-size:18px;bottom:16px;right:16px}
  .blog-field textarea{min-height:200px}
}
`;
  document.head.appendChild(CSS);

  // ===== 构建编辑器DOM =====
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
          <select id="blogCategory">
            <option value="childhood">童年篇</option>
            <option value="firstlove">初恋篇</option>
            <option value="thoughts">所思所想</option>
            <option value="travel">旅行见闻</option>
          </select>
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
        <button class="blog-btn blog-btn-secondary" id="blogCancelBtn">取消</button>
        <button class="blog-btn blog-btn-danger" id="blogDeleteBtn" style="display:none">删除</button>
        <button class="blog-btn blog-btn-primary" id="blogSaveBtn">发布</button>
      </div>
    </div>
  </div>`;

  const div = document.createElement('div');
  div.innerHTML = editorHTML;
  document.body.appendChild(div.firstElementChild);

  // ===== 编辑器逻辑 =====
  let editingId = null;

  function openEditor(article) {
    editingId = article ? (article._sid || null) : null;
    document.getElementById('blogEditorTitle').textContent = article ? '编辑文章' : '新文章';
    document.getElementById('blogCategory').value = article ? (article._cat || 'thoughts') : 'thoughts';
    document.getElementById('blogTitle').value = article ? article.title : '';
    document.getElementById('blogDate').value = article ? (article.date || '') : '';
    document.getElementById('blogBody').value = article ? article.body : '';
    document.getElementById('blogDeleteBtn').style.display = article ? 'inline-block' : 'none';
    document.getElementById('blogSaveBtn').textContent = article ? '保存' : '发布';
    document.getElementById('blogOverlay').classList.add('show');
    // 聚焦标题
    setTimeout(() => document.getElementById('blogTitle').focus(), 100);
  }

  function closeEditor() {
    document.getElementById('blogOverlay').classList.remove('show');
    editingId = null;
  }

  // 关闭按钮
  document.getElementById('blogEditorClose').onclick = closeEditor;
  document.getElementById('blogCancelBtn').onclick = closeEditor;
  document.getElementById('blogOverlay').onclick = e => {
    if (e.target === e.currentTarget) closeEditor();
  };

  // 保存
  document.getElementById('blogSaveBtn').onclick = async () => {
    const title = document.getElementById('blogTitle').value.trim();
    const body = document.getElementById('blogBody').value.trim();
    if (!title || !body) { alert('标题和正文不能为空'); return; }

    const data = {
      category: document.getElementById('blogCategory').value,
      category_title: ({childhood:'童年篇',firstlove:'初恋篇',thoughts:'所思所想',travel:'旅行见闻'})[document.getElementById('blogCategory').value] || '',
      title,
      date: document.getElementById('blogDate').value.trim(),
      body,
      sort_order: -Date.now(),
    };

    let err;
    if (editingId) {
      ({ error: err } = await sb.from('essays').update(data).eq('id', editingId));
    } else {
      ({ error: err } = await sb.from('essays').insert(data));
    }
    if (err) { alert('❌ ' + err.message); return; }
    closeEditor();
    await refreshData();
    if (typeof updateModalView === 'function') updateModalView();
    injectEditButtons();
  };

  // 删除
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
      if (groups[cat.id] && groups[cat.id].length > 0) {
        cat.articles = groups[cat.id];
      }
    });
  }

  async function refreshData() {
    const data = await loadData();
    if (data && data.length > 0) mergeToCategories(data);
  }

  // ===== 导入旧文章 =====
  async function importOld() {
    const data = await loadData();
    if (data && data.length > 0) return; // 已有
    if (typeof essayCategories === 'undefined') return;

    let count = 0;
    for (const cat of essayCategories) {
      for (const art of (cat.articles || [])) {
        if (art._sid) continue;
        const { error } = await sb.from('essays').insert({
          category: cat.id,
          category_title: cat.title,
          title: art.title,
          date: art.date || '',
          body: art.body,
          sort_order: -Date.now() + count,
        });
        if (!error) count++;
      }
    }
    if (count > 0) {
      console.log('[blog] 导入', count, '篇旧文章');
      await refreshData();
    }
  }

  // ===== 编辑按钮注入 =====
  function injectEditButtons() {
    if (!editMode) return;
    const body = document.querySelector('.modal-body');
    if (!body) return;
    if (!body.querySelector('.article-list, .content-body')) return;
    if (body.querySelector('.ee-toolbar')) return;

    // 底部新建按钮
    const bar = document.createElement('div');
    bar.className = 'ee-toolbar';
    bar.innerHTML = '<button onclick="BLOG.add()">✏️ 写新文章</button><button onclick="BLOG.toggle()">✕ 退出编辑</button>';
    body.appendChild(bar);

    // 每篇文章的操作按钮
    body.querySelectorAll('.article-item').forEach(item => {
      if (item.querySelector('.ee-act')) return;
      const act = document.createElement('div');
      act.className = 'ee-act';
      act.innerHTML = '<button onclick="event.stopPropagation();BLOG.edit(this)">✎ 编辑</button><button class="ee-del" onclick="event.stopPropagation();BLOG.del(this)">🗑 删除</button>';
      item.appendChild(act);
    });
  }

  function findArticle(btn) {
    const item = btn.closest('.article-item');
    if (!item) return null;
    const t = item.querySelector('.title');
    if (!t) return null;
    const titleText = t.textContent;
    for (const cat of (window.essayCategories || [])) {
      for (const art of cat.articles) {
        if (art.title === titleText) return art;
      }
    }
    return null;
  }

  // ===== 切换编辑模式 =====
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

  // ===== 观察DOM =====
  function watchDOM() {
    const obs = new MutationObserver(() => setTimeout(injectEditButtons, 60));
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', () => setTimeout(injectEditButtons, 100));
  }

  // ===== 暴露全局 =====
  window.BLOG = {
    toggle: toggleMode,
    add: () => openEditor(null),
    edit: (btn) => { const d = findArticle(btn); if (d) openEditor(d); else alert('请刷新后重试'); },
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
  };

  // ===== 笔按钮 =====
  function addPen() {
    if (document.getElementById('blog-pen')) return;
    const pen = document.createElement('div');
    pen.id = 'blog-pen';
    pen.textContent = '✏️';
    pen.onclick = toggleMode;
    document.body.appendChild(pen);
  }

  // ===== 启动 =====
  async function init() {
    if (loaded) return;
    loaded = true;

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
