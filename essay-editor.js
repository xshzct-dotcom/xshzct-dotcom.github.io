/* =========================================
   随笔 · 内嵌编辑（博客式弹窗版）
   ========================================= */
(function() {
  'use strict';

  const SUPABASE_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';

  let sb = null;
  let editMode = false;
  let initialized = false;

  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch(e) {
    console.warn('[ee] Supabase init failed:', e);
    return;
  }

  // ===== 加载 + 合并 =====
  async function loadFromSupabase() {
    try {
      const { data, error } = await sb.from('essays').select('*').order('sort_order', { ascending: false }).order('created_at', { ascending: false });
      if (error) { console.warn('[ee] load fail:', error.message); return false; }
      if (data && data.length > 0) { mergeData(data); return true; }
      return false;
    } catch(e) { console.warn('[ee]', e); return false; }
  }

  function mergeData(rows) {
    // 整理 supabase 数据
    const groups = {};
    rows.forEach(r => {
      const k = r.category || 'thoughts';
      if (!groups[k]) groups[k] = { articles: [] };
      groups[k].articles.push({ title: r.title, date: r.date || '', body: r.body, _sid: r.id, _cat: r.category, _catTitle: r.category_title });
    });
    // 合并到 essayCategories
    if (typeof essayCategories === 'undefined') return;
    essayCategories.forEach(cat => {
      const g = groups[cat.id];
      if (g && g.articles.length > 0) {
        cat.articles = g.articles;
      }
    });
  }

  // ===== 同步旧文章到 Supabase =====
  async function importOldArticles() {
    // 先检查 supabase 是否有数据
    const { data, error } = await sb.from('essays').select('id', { count: 'exact', head: true });
    if (error) return false;
    if (data && data.length > 0) return true; // 已有数据
    
    // 从 data.js 导入
    if (typeof essayCategories === 'undefined') return false;
    let imported = 0;
    for (const cat of essayCategories) {
      if (!cat.articles || cat.articles.length === 0) continue;
      // 检查这些文章是否已在 supabase
      for (const art of cat.articles) {
        if (art._sid) continue; // 已有ID
        const { error: insErr } = await sb.from('essays').insert({
          category: cat.id,
          category_title: cat.title,
          title: art.title,
          date: art.date || '',
          body: art.body,
          sort_order: -Date.now() + imported,
        });
        if (!insErr) imported++;
      }
    }
    if (imported > 0) {
      console.log(`[ee] 已导入 ${imported} 篇旧文章到 Supabase`);
      await loadFromSupabase();
    }
    return imported > 0;
  }

  // ===== 编辑弹窗 =====
  const MODAL_STYLE = document.createElement('style');
  MODAL_STYLE.textContent = `
    .ee-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;align-items:center;justify-content:center;padding:16px}
    .ee-overlay.show{display:flex}
    .ee-modal{background:#1e1e1e;border-radius:16px;padding:24px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;border:1px solid rgba(255,255,255,.1)}
    .ee-modal h3{color:#fff;font-size:18px;margin:0 0 16px;font-weight:600}
    .ee-field{margin-bottom:14px}
    .ee-field label{display:block;color:rgba(255,255,255,.6);font-size:12px;margin-bottom:4px;font-weight:500}
    .ee-field input,.ee-field select,.ee-field textarea{width:100%;padding:10px 12px;border:1px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;font-family:inherit;background:rgba(255,255,255,.06);color:#fff;outline:none;transition:border .2s;box-sizing:border-box}
    .ee-field input:focus,.ee-field select:focus,.ee-field textarea:focus{border-color:rgba(255,255,255,.4)}
    .ee-field textarea{min-height:200px;resize:vertical;line-height:1.7}
    .ee-field select option{background:#1e1e1e;color:#fff}
    .ee-actions-row{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
    .ee-btn{padding:9px 20px;border:none;border-radius:8px;font-size:14px;cursor:pointer;transition:all .2s;font-family:inherit}
    .ee-btn-primary{background:#fff;color:#1a1a1a}
    .ee-btn-primary:hover{background:#e0e0e0}
    .ee-btn-secondary{background:rgba(255,255,255,.1);color:rgba(255,255,255,.7)}
    .ee-btn-secondary:hover{background:rgba(255,255,255,.18)}
    .ee-btn-danger{background:#dc3545;color:#fff}
    .ee-btn-danger:hover{background:#c82333}

    /* 触发按钮 */
    #ee-trigger{position:fixed;bottom:20px;right:20px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.12);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:all .3s;font-size:18px;user-select:none;-webkit-user-select:none;touch-action:manipulation}
    #ee-trigger:active{transform:scale(.92)}

    /* 编辑工具栏 */
    .ee-bar{display:flex;gap:8px;justify-content:center;padding:16px 0 8px;border-top:1px solid rgba(255,255,255,.1);margin-top:12px;flex-wrap:wrap}
    .ee-bar button,.ee-act-btn{padding:6px 14px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:transparent;color:rgba(255,255,255,.7);font-size:12px;cursor:pointer;transition:all .2s;font-family:inherit}
    .ee-bar button:hover,.ee-act-btn:hover{background:rgba(255,255,255,.1);color:#fff}
    .ee-del-btn{border-color:rgba(255,100,100,.25);color:rgba(255,150,150,.7)}
    .ee-del-btn:hover{background:rgba(255,50,50,.15)!important;color:#ff8a8a!important}
    .ee-article-actions{display:flex;gap:4px;margin-top:6px}
  `;
  document.head.appendChild(MODAL_STYLE);

  // ===== 构建弹窗DOM =====
  const overlay = document.createElement('div');
  overlay.className = 'ee-overlay';
  overlay.innerHTML = `
    <div class="ee-modal">
      <h3 id="eeModalTitle">新文章</h3>
      <div class="ee-field">
        <label>分类</label>
        <select id="eeCategory">
          <option value="childhood">童年篇</option>
          <option value="firstlove">初恋篇</option>
          <option value="thoughts">所思所想</option>
          <option value="travel">旅行见闻</option>
        </select>
      </div>
      <div class="ee-field">
        <label>标题</label>
        <input id="eeTitle" placeholder="文章标题">
      </div>
      <div class="ee-field">
        <label>日期（可选）</label>
        <input id="eeDate" placeholder="如 2026.7.20">
      </div>
      <div class="ee-field">
        <label>正文</label>
        <textarea id="eeBody" placeholder="写点什么..."></textarea>
      </div>
      <div class="ee-actions-row">
        <button class="ee-btn ee-btn-secondary" id="eeCancelBtn">取消</button>
        <button class="ee-btn ee-btn-danger" id="eeDelBtn" style="display:none">删除</button>
        <button class="ee-btn ee-btn-primary" id="eeSaveBtn">保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // ===== 弹窗操作 =====
  let editingData = null;

  function openModal(data) {
    editingData = data || null;
    document.getElementById('eeModalTitle').textContent = data ? '编辑文章' : '新文章';
    document.getElementById('eeCategory').value = data ? (data._cat || 'thoughts') : 'thoughts';
    document.getElementById('eeTitle').value = data ? data.title : '';
    document.getElementById('eeDate').value = data ? (data.date || '') : '';
    document.getElementById('eeBody').value = data ? data.body : '';
    document.getElementById('eeDelBtn').style.display = data ? 'inline-block' : 'none';
    overlay.classList.add('show');
  }

  function closeModal() {
    overlay.classList.remove('show');
    editingData = null;
  }

  document.getElementById('eeCancelBtn').onclick = closeModal;
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };

  document.getElementById('eeSaveBtn').onclick = async () => {
    const title = document.getElementById('eeTitle').value.trim();
    const body = document.getElementById('eeBody').value.trim();
    if (!title || !body) { alert('标题和正文不能为空'); return; }

    const data = {
      category: document.getElementById('eeCategory').value,
      category_title: getDefaultTitle(document.getElementById('eeCategory').value),
      title,
      date: document.getElementById('eeDate').value.trim(),
      body,
      sort_order: -Date.now(),
    };

    let error;
    if (editingData && editingData._sid) {
      ({ error } = await sb.from('essays').update(data).eq('id', editingData._sid));
    } else {
      ({ error } = await sb.from('essays').insert(data));
    }

    if (error) { alert('❌ 保存失败: ' + error.message); return; }
    closeModal();
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  };

  document.getElementById('eeDelBtn').onclick = async () => {
    if (!editingData || !editingData._sid) return;
    if (!confirm('确定删除「' + editingData.title + '」？')) return;
    const { error } = await sb.from('essays').delete().eq('id', editingData._sid);
    if (error) { alert('❌ 删除失败: ' + error.message); return; }
    closeModal();
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  };

  // ===== 切换编辑模式 =====
  function toggleEditMode() {
    editMode = !editMode;
    document.querySelectorAll('.ee-bar, .ee-article-actions').forEach(el => el.remove());
    // 更新触发按钮样式
    const trig = document.getElementById('ee-trigger');
    if (trig) {
      trig.style.background = editMode ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.06)';
      trig.style.borderColor = editMode ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)';
      trig.style.color = editMode ? '#fff' : 'rgba(255,255,255,.4)';
    }
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  }

  // ===== 注入编辑UI =====
  function injectEditUI() {
    if (!editMode) return;
    const modalBody = document.querySelector('.modal-body');
    if (!modalBody) return;
    const hasContent = modalBody.querySelector('.article-list, .content-body');
    if (!hasContent) return;
    if (modalBody.querySelector('.ee-bar')) return;

    // 底部写新文章按钮
    const bar = document.createElement('div');
    bar.className = 'ee-bar';
    bar.innerHTML = '<button onclick="EE.add()">✏️ 写新文章</button><button onclick="EE.toggle()">✕ 退出编辑</button>';
    modalBody.appendChild(bar);

    // 每篇文章加编辑/删除按钮
    modalBody.querySelectorAll('.article-item').forEach(item => {
      if (item.querySelector('.ee-article-actions')) return;
      const acts = document.createElement('div');
      acts.className = 'ee-article-actions';
      acts.innerHTML = '<button class="ee-act-btn" onclick="event.stopPropagation();EE.edit(this)">✎ 编辑</button><button class="ee-act-btn ee-del-btn" onclick="event.stopPropagation();EE.del(this)">🗑</button>';
      item.appendChild(acts);
    });
  }

  // ===== 观察DOM变化 =====
  function watchModal() {
    const obs = new MutationObserver(() => setTimeout(injectEditUI, 50));
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ===== 查找文章数据（通过DOM元素） =====
  function findArticleData(btn) {
    const item = btn.closest('.article-item');
    if (!item) return null;
    const titleEl = item.querySelector('.title');
    if (!titleEl) return null;
    const titleText = titleEl.textContent;
    for (const cat of (window.essayCategories || [])) {
      for (const art of cat.articles) {
        if (art.title === titleText) {
          // 补全分类信息
          if (!art._cat) art._cat = cat.id;
          return art;
        }
      }
    }
    return null;
  }

  // ===== 暴露全局 =====
  window.EE = {
    toggle: toggleEditMode,
    add: () => openModal(null),
    edit: (btn) => { const d = findArticleData(btn); if (d) openModal(d); else alert('找不到文章数据，请刷新后重试'); },
    del: async (btn) => {
      const d = findArticleData(btn);
      if (!d || !d._sid) { alert('找不到文章数据'); return; }
      if (!confirm('确定删除「' + d.title + '」？')) return;
      const { error } = await sb.from('essays').delete().eq('id', d._sid);
      if (error) { alert('❌ 失败: ' + error.message); return; }
      await loadFromSupabase();
      if (typeof updateModalView === 'function') updateModalView();
      setTimeout(injectEditUI, 100);
    },
  };

  // ===== ✏️ 触发按钮 =====
  function addTrigger() {
    if (document.getElementById('ee-trigger')) return;
    const el = document.createElement('div');
    el.id = 'ee-trigger';
    el.textContent = '✏️';
    el.style.cssText = `background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:rgba(255,255,255,.4)`;
    el.onclick = toggleEditMode;
    document.body.appendChild(el);
  }

  // ===== 启动 =====
  async function init() {
    if (initialized) return;
    initialized = true;

    const hasData = await loadFromSupabase();
    if (!hasData) {
      // 导入旧文章
      await importOldArticles();
    }

    addTrigger();
    watchModal();

    document.addEventListener('click', () => setTimeout(injectEditUI, 100));
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
