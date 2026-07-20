/* =========================================
   随笔 · 内嵌编辑（无需登录版）
   点 ⚙️ 开启编辑模式 → 直接增删改
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
    console.warn('[editor] Supabase init failed:', e);
    return;
  }

  // ===== 从 Supabase 加载 =====
  async function loadFromSupabase() {
    try {
      const { data, error } = await sb
        .from('essays')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[editor] 加载失败:', error.message);
        return false;
      }
      if (data && data.length > 0) {
        mergeIntoCategories(data);
        return true;
      }
      return false;
    } catch(e) {
      console.warn('[editor] Error:', e);
      return false;
    }
  }

  function mergeIntoCategories(rows) {
    const groups = {};
    rows.forEach(r => {
      const key = r.category || 'thoughts';
      if (!groups[key]) {
        groups[key] = { id: key, title: r.category_title || getDefaultTitle(key), articles: [] };
      }
      groups[key].articles.push({
        title: r.title,
        date: r.date || '',
        body: r.body,
        _sid: r.id
      });
    });
    if (typeof essayCategories !== 'undefined') {
      const order = ['childhood', 'firstlove', 'thoughts', 'travel'];
      order.forEach(key => {
        if (groups[key]) {
          const idx = essayCategories.findIndex(c => c.id === key);
          if (idx >= 0) essayCategories[idx].articles = groups[key].articles;
          else essayCategories.push(groups[key]);
        }
      });
    }
  }

  function getDefaultTitle(key) {
    return ({ childhood: '童年篇', firstlove: '初恋篇', thoughts: '所思所想', travel: '旅行见闻' })[key] || key;
  }

  // ===== 注入编辑按钮 =====
  function injectEditUI() {
    const modalBody = document.querySelector('.modal-body');
    if (!modalBody) return;
    const hasList = modalBody.querySelector('.article-list');
    const hasBody = modalBody.querySelector('.content-body');
    if (!hasList && !hasBody) return;
    if (modalBody.querySelector('.ee-bar')) return;

    if (editMode) {
      // 底部工具栏
      const bar = document.createElement('div');
      bar.className = 'ee-bar';
      bar.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:16px 0 8px;border-top:1px solid rgba(255,255,255,0.1);margin-top:12px;flex-wrap:wrap';
      bar.innerHTML = `
        <button onclick="ee.add()" style="padding:8px 20px;border:1px solid rgba(255,255,255,0.3);border-radius:20px;background:transparent;color:#fff;font-size:13px;cursor:pointer">✏️ 写新文章</button>
        <button onclick="ee.toggle()" style="padding:8px 12px;border:1px solid rgba(255,255,255,0.15);border-radius:20px;background:transparent;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer">退出编辑</button>
      `;
      modalBody.appendChild(bar);

      // 在每篇文章加编辑/删除按钮
      modalBody.querySelectorAll('.article-item').forEach(item => {
        if (item.querySelector('.ee-actions')) return;
        const act = document.createElement('div');
        act.className = 'ee-actions';
        act.style.cssText = 'display:flex;gap:4px;margin-top:4px';
        act.innerHTML = `
          <button onclick="event.stopPropagation();ee.edit(this)" style="padding:2px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:transparent;color:rgba(255,255,255,0.6);font-size:11px;cursor:pointer">✎ 编辑</button>
          <button onclick="event.stopPropagation();ee.del(this)" style="padding:2px 10px;border:1px solid rgba(255,255,200,0.15);border-radius:4px;background:transparent;color:rgba(255,150,150,0.6);font-size:11px;cursor:pointer">🗑 删除</button>
        `;
        item.appendChild(act);
      });
    }
  }

  // 观察模态框变化
  function watchModal() {
    const obs = new MutationObserver(() => {
      setTimeout(injectEditUI, 50);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ===== 切换编辑模式 =====
  function toggleEditMode() {
    editMode = !editMode;
    // 清除旧的编辑UI
    document.querySelectorAll('.ee-bar, .ee-actions').forEach(el => el.remove());
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  }

  // ===== CRUD =====
  async function addArticle() {
    const title = prompt('标题:');
    if (!title) return;
    const date = prompt('日期（可选，如 2026.7.20）:', '');
    const category = prompt('分类:\nchildhood=童年篇  firstlove=初恋篇  thoughts=所思所想  travel=旅行见闻', 'thoughts');
    if (!category) return;
    const body = prompt('正文:');
    if (!body) return;

    const { error } = await sb.from('essays').insert({
      category, category_title: getDefaultTitle(category),
      title, date: date || '', body, sort_order: -Date.now()
    });
    if (error) { alert('❌ 失败: ' + error.message); return; }
    alert('✅ 已发布');
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  }

  async function editArticle(btn) {
    const item = btn.closest('.article-item');
    if (!item) return;
    // 从文章列表中找到对应的文章数据
    const titleEl = item.querySelector('.title');
    if (!titleEl) return;
    const titleText = titleEl.textContent;
    
    // 从 essayCategories 找对应的文章
    let articleData = null;
    for (const cat of (window.essayCategories || [])) {
      for (const art of cat.articles) {
        if (art.title === titleText) {
          articleData = art;
          break;
        }
      }
      if (articleData) break;
    }
    if (!articleData) { alert('找不到文章数据'); return; }

    const title = prompt('标题:', articleData.title);
    if (!title) return;
    const date = prompt('日期:', articleData.date || '');
    const body = prompt('正文:', articleData.body);
    if (!body) return;

    const { error } = await sb.from('essays').update({
      title, date: date || '', body
    }).eq('id', articleData._sid);

    if (error) { alert('❌ 失败: ' + error.message); return; }
    alert('✅ 已更新');
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  }

  async function deleteArticle(btn) {
    if (!confirm('确定删除？')) return;
    const item = btn.closest('.article-item');
    if (!item) return;
    const titleEl = item.querySelector('.title');
    if (!titleEl) return;
    const titleText = titleEl.textContent;

    let articleData = null;
    for (const cat of (window.essayCategories || [])) {
      for (const art of cat.articles) {
        if (art.title === titleText) { articleData = art; break; }
      }
      if (articleData) break;
    }
    if (!articleData || !articleData._sid) { alert('找不到文章'); return; }

    const { error } = await sb.from('essays').delete().eq('id', articleData._sid);
    if (error) { alert('❌ 失败: ' + error.message); return; }
    alert('已删除');
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
    setTimeout(injectEditUI, 100);
  }

  // ===== 齿轮触发按钮 =====
  function addTrigger() {
    const existing = document.getElementById('ee-trigger');
    if (existing) return;
    const el = document.createElement('div');
    el.id = 'ee-trigger';
    el.textContent = '⚙️';
    el.title = editMode ? '关闭编辑' : '开启编辑';
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:' + (editMode ? '#fff' : 'rgba(255,255,255,0.3)') + ';font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);transition:all .3s';
    el.onmouseenter = () => { el.style.background = 'rgba(255,255,255,0.18)'; el.style.color = '#fff'; };
    el.onmouseleave = () => { el.style.background = 'rgba(255,255,255,0.08)'; el.style.color = editMode ? '#fff' : 'rgba(255,255,255,0.3)'; };
    el.onclick = () => { toggleEditMode(); addTrigger(); };
    document.body.appendChild(el);
  }

  // ===== 暴露全局 =====
  window.ee = {
    toggle: toggleEditMode,
    add: addArticle,
    edit: editArticle,
    del: deleteArticle,
  };

  // ===== 初始化 =====
  async function init() {
    if (initialized) return;
    initialized = true;

    const has = await loadFromSupabase();
    console.log('[editor]', has ? '✅ Supabase 文章已加载' : '📭 无数据，使用 data.js');

    addTrigger();
    watchModal();

    document.addEventListener('click', () => {
      setTimeout(injectEditUI, 100);
    });
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
