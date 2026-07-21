/* =========================================
   设置菜单（统一管理入口）
   右上角 ⚙️ 按钮 → 弹出菜单：文章/相册/音乐
   ========================================= */
(function() {
  'use strict';

  const CSS = document.createElement('style');
  CSS.textContent = `
#settings-menu-btn{position:relative;width:32px;height:32px;border:none;border-radius:50%;background:transparent;color:inherit;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;margin-left:4px;-webkit-tap-highlight-color:transparent}
#settings-menu-btn:hover{background:rgba(255,255,255,.1)}
.settings-dropdown{display:none;position:absolute;top:calc(100% + 8px);right:0;background:rgba(20,20,20,.95);border:1px solid rgba(255,255,255,.1);border-radius:12px;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:9999;overflow:hidden}
.settings-dropdown.show{display:block}
.settings-item{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:transparent;border:none;color:#fff;font-size:14px;text-align:left;cursor:pointer;transition:background .2s;font-family:inherit;border-bottom:1px solid rgba(255,255,255,.05)}
.settings-item:last-child{border-bottom:none}
.settings-item:hover{background:rgba(255,255,255,.08)}
.settings-item .icon{font-size:18px;width:24px;text-align:center}
.settings-item .label{flex:1}
.settings-item .sub{color:rgba(255,255,255,.4);font-size:11px}
@media(max-width:600px){
  #settings-menu-btn{width:36px;height:36px;font-size:18px}
  .settings-dropdown{min-width:160px;right:0}
}
`;
  document.head.appendChild(CSS);

  // 清理任何残留的旧浮动笔按钮
  function cleanupOldPens() {
    ['blog-pen', 'album-pen', 'music-pen'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }
  cleanupOldPens();

  function addBtn() {
    if (document.getElementById('settings-menu-btn')) return;

    // 找 header 里的 nav 元素
    const nav = document.querySelector('header nav') || document.querySelector('header');
    if (!nav) {
      console.warn('[settings] 找不到 header');
      return;
    }

    // 创建按钮容器
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;margin-left:6px';

    const btn = document.createElement('button');
    btn.id = 'settings-menu-btn';
    btn.textContent = '⚙️';
    btn.title = '管理菜单';
    btn.setAttribute('aria-label', '管理菜单');

    // 下拉菜单
    const dd = document.createElement('div');
    dd.className = 'settings-dropdown';
    dd.id = 'settings-dropdown';
    dd.innerHTML = `
      <button class="settings-item" onclick="MENU.openEssay()">
        <span class="icon">✏️</span>
        <span class="label">文章管理</span>
        <span class="sub">写/改</span>
      </button>
      <button class="settings-item" onclick="MENU.openAlbum()">
        <span class="icon">📸</span>
        <span class="label">相册管理</span>
        <span class="sub">上传/排序</span>
      </button>
      <button class="settings-item" onclick="MENU.openMusic()">
        <span class="icon">🎵</span>
        <span class="label">音乐管理</span>
        <span class="sub">歌单/排序</span>
      </button>
    `;

    wrap.appendChild(btn);
    wrap.appendChild(dd);

    // 插入到 nav 末尾（theme toggle 之前）
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      nav.insertBefore(wrap, themeBtn);
    } else {
      nav.appendChild(wrap);
    }

    // 点击切换
    btn.onclick = (e) => {
      e.stopPropagation();
      const isShow = dd.classList.toggle('show');
      btn.style.background = isShow ? 'rgba(255,255,255,.15)' : '';
    };

    // 点外面关闭
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        dd.classList.remove('show');
        btn.style.background = '';
      }
    });
  }

  window.MENU = {
    openEssay: () => {
      document.getElementById('settings-dropdown')?.classList.remove('show');
      // 打开随笔页面
      if (typeof openCardModal === 'function') {
        openCardModal('essay');
      } else {
        const card = document.querySelector('[onclick*="openCardModal(\'essay\')"]');
        if (card) card.click();
      }
      // 等待模态框打开后进入编辑模式
      setTimeout(() => {
        if (window.BLOG && typeof window.BLOG.toggle === 'function') {
          // 检查是否已进入编辑模式，若没有则进入
          const isEditing = typeof window.BLOG.isEditing === 'function' ? window.BLOG.isEditing() : false;
          if (!isEditing) {
            window.BLOG.toggle();
          }
          // 确保 injectEditButtons 执行
          if (typeof window.BLOG.ensureButtons === 'function') {
            window.BLOG.ensureButtons();
          }
        }
      }, 350);
    },
    openAlbum: () => {
      document.getElementById('settings-dropdown')?.classList.remove('show');
      try {
        if (window.ALBUM && typeof window.ALBUM.show === 'function') {
          window.ALBUM.show();
        } else {
          alert('相册管理器加载中，请稍后重试...');
          const check = setInterval(() => {
            if (window.ALBUM && typeof window.ALBUM.show === 'function') {
              clearInterval(check);
              window.ALBUM.show();
            }
          }, 200);
          setTimeout(() => { clearInterval(check); }, 5000);
        }
      } catch(e) { console.warn('[MENU] 打开相册失败', e); alert('打开相册失败: ' + e.message); }
    },
    openMusic: () => {
      document.getElementById('settings-dropdown')?.classList.remove('show');
      try {
        if (window.MUSIC && typeof window.MUSIC.show === 'function') {
          window.MUSIC.show();
        } else {
          const check = setInterval(() => {
            if (window.MUSIC && typeof window.MUSIC.show === 'function') {
              clearInterval(check);
              window.MUSIC.show();
            }
          }, 200);
          setTimeout(() => clearInterval(check), 5000);
        }
      } catch(e) { console.warn('[MENU] 打开音乐失败', e); }
    },
  };

  if (document.readyState === 'complete') addBtn();
  else window.addEventListener('load', addBtn);
})();
