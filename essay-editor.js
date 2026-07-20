/* =========================================
   随笔 · 嵌入编辑功能
   直接在现有网站内管理文章，不需跳转管理页
   ========================================= */
(function() {
  'use strict';

  const SUPABASE_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';

  let sb = null;
  let isAdmin = false;
  let supabaseEssays = [];
  let initialized = false;

  // ===== 初始化 Supabase =====
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch(e) {
    console.warn('[essay-editor] Supabase init failed:', e);
    return;
  }

  // ===== 从 Supabase 加载文章 =====
  async function loadFromSupabase() {
    try {
      const { data, error } = await sb
        .from('essays')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[essay-editor] 加载失败:', error.message);
        return false;
      }
      if (data && data.length > 0) {
        supabaseEssays = data;
        mergeIntoCategories(data);
        return true;
      }
      return false;
    } catch(e) {
      console.warn('[essay-editor] Error:', e);
      return false;
    }
  }

  // ===== 把 Supabase 数据合并进 essayCategories =====
  function mergeIntoCategories(rows) {
    const groups = {};
    rows.forEach(r => {
      const key = r.category || 'thoughts';
      if (!groups[key]) {
        groups[key] = {
          id: key,
          title: r.category_title || getDefaultTitle(key),
          articles: []
        };
      }
      groups[key].articles.push({
        title: r.title,
        date: r.date || '',
        body: r.body,
        _supabase_id: r.id  // 隐藏ID，用于编辑/删除
      });
    });

    // 合并到全局 essayCategories
    if (typeof essayCategories !== 'undefined') {
      // 用 Supabase 数据替换原有的分类内容
      const order = ['childhood', 'firstlove', 'thoughts', 'travel'];
      const newCats = [];
      order.forEach(key => {
        if (groups[key]) newCats.push(groups[key]);
      });
      // 加上 Supabase 里的额外分类
      Object.keys(groups).forEach(key => {
        if (!order.includes(key)) newCats.push(groups[key]);
      });
      // 只替换文章数据，保留分类结构
      newCats.forEach(newCat => {
        const oldIdx = essayCategories.findIndex(c => c.id === newCat.id);
        if (oldIdx >= 0) {
          essayCategories[oldIdx].articles = newCat.articles;
        } else {
          essayCategories.push(newCat);
        }
      });
    }
  }

  function getDefaultTitle(key) {
    const map = { childhood: '童年篇', firstlove: '初恋篇', thoughts: '所思所想', travel: '旅行见闻' };
    return map[key] || key;
  }

  // ===== 检查登录状态 =====
  async function checkSession() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      isAdmin = !!session?.user;
    } catch(e) {
      isAdmin = false;
    }
  }

  // ===== 添加管理 UI =====
  function injectAdminUI() {
    // 只在随笔视图注入
    const observer = new MutationObserver(() => {
      const modalBody = document.querySelector('.modal-body');
      if (!modalBody) return;
      
      // 检查是否在随笔视图
      const isEssayView = modalBody.querySelector('.article-list') || 
                           modalBody.querySelector('.content-body');
      if (!isEssayView) return;

      // 检查是否已经注入了管理按钮
      if (modalBody.querySelector('.essay-admin-bar')) return;

      // 注入管理栏
      if (isAdmin) {
        const adminBar = document.createElement('div');
        adminBar.className = 'essay-admin-bar';
        adminBar.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:16px 0 8px;border-top:1px solid rgba(255,255,255,0.1);margin-top:12px';
        adminBar.innerHTML = `
          <button class="essay-admin-btn" onclick="essayEditor.addArticle()" 
                  style="padding:8px 20px;border:1px solid rgba(255,255,255,0.3);border-radius:20px;background:transparent;color:#fff;font-size:13px;cursor:pointer">✏️ 写新文章</button>
          <button class="essay-admin-btn" onclick="essayEditor.logout()"
                  style="padding:8px 12px;border:1px solid rgba(255,255,255,0.15);border-radius:20px;background:transparent;color:rgba(255,255,255,0.5);font-size:12px;cursor:pointer">退出</button>
        `;
        modalBody.appendChild(adminBar);

        // 在每个文章项加编辑按钮（文章列表）
        modalBody.querySelectorAll('.article-item').forEach(item => {
          if (item.querySelector('.essay-edit-btn')) return;
          const editBtn = document.createElement('button');
          editBtn.className = 'essay-edit-btn';
          editBtn.innerHTML = '✎';
          editBtn.style.cssText = 'position:absolute;right:8px;top:8px;width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.15);color:#fff;font-size:14px;cursor:pointer;opacity:0;transition:opacity .2s;display:flex;align-items:center;justify-content:center';
          editBtn.title = '编辑';
          item.style.position = 'relative';
          item.appendChild(editBtn);
          item.addEventListener('mouseenter', () => editBtn.style.opacity = '1');
          item.addEventListener('mouseleave', () => editBtn.style.opacity = '0');
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ===== 登录入口（小齿轮） =====
  function injectLoginTrigger() {
    // 在页面底部加一个小齿轮
    const trigger = document.createElement('div');
    trigger.id = 'essay-admin-trigger';
    trigger.textContent = '⚙️';
    trigger.title = '管理员';
    trigger.style.cssText = 'position:fixed;bottom:20px;right:20px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.3);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);transition:all .3s';
    trigger.onmouseenter = () => { trigger.style.background = 'rgba(255,255,255,0.18)'; trigger.style.color = '#fff'; };
    trigger.onmouseleave = () => { trigger.style.background = 'rgba(255,255,255,0.08)'; trigger.style.color = 'rgba(255,255,255,0.3)'; };
    trigger.onclick = handleLoginClick;
    document.body.appendChild(trigger);
  }

  let loginAttempts = 0;

  async function handleLoginClick() {
    if (isAdmin) {
      // 已登录：直接弹出新增或编辑界面
      showAddForm();
      return;
    }

    // 登录：先注册还是登录？
    const action = confirm('点"确定"=登录  点"取消"=注册账号');
    
    if (action) {
      // 登录
      const email = prompt('邮箱:');
      if (!email) return;
      const password = prompt('密码:');
      if (!password) return;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        alert('❌ 登录失败: ' + error.message);
      } else {
        isAdmin = true;
        alert('✅ 已登录，现在可以编辑文章了');
        refreshUI();
      }
    } else {
      // 注册
      const email = prompt('邮箱（你的邮箱）:');
      if (!email) return;
      const password = prompt('密码（至少6位）:');
      if (!password || password.length < 6) { alert('密码至少6位'); return; }
      const { error } = await sb.auth.signUp({ email, password });
      if (error) {
        alert('❌ 注册失败: ' + error.message);
      } else {
        alert('✅ 注册成功！请去邮箱确认，然后刷新页面登录。');
      }
    }
  }

  // ===== 显示新增/编辑表单 =====
  function showAddForm(articleData) {
    const isEdit = !!articleData;
    const title = prompt(isEdit ? '标题:' : '新文章 - 标题:', isEdit ? articleData.title : '');
    if (!title) return;
    const date = prompt(isEdit ? '日期（可选）:' : '日期（可选，如 2026.7.20）:', isEdit ? (articleData.date || '') : '');
    const category = prompt(isEdit ? '分类 (childhood/firstlove/thoughts/travel):' : '分类 (childhood=童年篇 firstlove=初恋篇 thoughts=所思所想 travel=旅行见闻):', isEdit ? articleData._category : 'thoughts');
    if (!category) return;
    const body = prompt('正文:', isEdit ? articleData.body : '');
    if (!body) return;
    saveArticle({ title, date, category, body }, isEdit ? articleData._supabase_id : null);
  }

  async function saveArticle(data, editId) {
    const record = {
      category: data.category,
      category_title: getDefaultTitle(data.category),
      title: data.title,
      date: data.date || '',
      body: data.body,
      sort_order: -Date.now(),
    };

    let error;
    if (editId) {
      ({ error } = await sb.from('essays').update(record).eq('id', editId));
    } else {
      ({ error } = await sb.from('essays').insert(record));
    }

    if (error) {
      alert('❌ 保存失败: ' + error.message);
      return;
    }
    alert('✅ 已保存，刷新页面可见');
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
  }

  // ===== 删除文章 =====
  async function deleteArticle(id) {
    if (!confirm('确定删除这篇文章？')) return;
    const { error } = await sb.from('essays').delete().eq('id', id);
    if (error) {
      alert('❌ 删除失败: ' + error.message);
      return;
    }
    await loadFromSupabase();
    if (typeof updateModalView === 'function') updateModalView();
  }

  // ===== 退出 =====
  async function logout() {
    await sb.auth.signOut();
    isAdmin = false;
    alert('已退出管理');
    refreshUI();
  }

  // ===== 刷新界面 =====
  function refreshUI() {
    const bars = document.querySelectorAll('.essay-admin-bar');
    bars.forEach(b => b.remove());
    const btns = document.querySelectorAll('.essay-edit-btn');
    btns.forEach(b => b.remove());
    if (typeof updateModalView === 'function') updateModalView();
    injectAdminUI();
  }

  // ===== 暴露全局方法 =====
  window.essayEditor = {
    addArticle: () => showAddForm(),
    editArticle: (data) => showAddForm(data),
    deleteArticle: (id) => deleteArticle(id),
    logout: () => logout(),
  };

  // ===== 初始化 =====
  async function init() {
    if (initialized) return;
    initialized = true;

    await checkSession();
    const hasSupabaseData = await loadFromSupabase();

    if (hasSupabaseData) {
      console.log('[essay-editor] ✅ 已从 Supabase 加载文章');
    } else {
      console.log('[essay-editor] 📭 Supabase 暂无数据，使用 data.js 数据');
    }

    injectLoginTrigger();
    injectAdminUI();

    // 监听模态框变化，重新注入管理UI
    document.addEventListener('click', () => {
      setTimeout(() => injectAdminUI(), 100);
    });
  }

  // 等页面完全加载后启动
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
