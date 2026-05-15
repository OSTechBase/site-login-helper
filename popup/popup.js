// popup.js - 快速查看逻辑
(function() {
  'use strict';

  const STORAGE_KEY = 'siteLoginHelper';
  const DEFAULT_GROUP_ID = 'default';

  // 获取数据
  function getData(callback) {
    chrome.storage.local.get(STORAGE_KEY, function(result) {
      let data = result[STORAGE_KEY] || { sites: [], groups: [] };

      // 确保有默认分组
      if (!data.groups || data.groups.length === 0) {
        data.groups = [{ id: DEFAULT_GROUP_ID, name: '默认' }];
      }

      callback(data);
    });
  }

  // 获取当前标签页 URL
  function getCurrentTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      callback(tabs[0]);
    });
  }

  // 将 URL 模式转为正则，* 匹配单段内的数字/字母/连字符（不含点和斜杠）
  function matchUrl(pattern, url) {
    if (!pattern || !url) return false;
    // 先转义正则特殊字符（排除 *），再把 * 换成单段通配符
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '[a-zA-Z0-9-]+');
    return new RegExp(regexStr).test(url);
  }

  // 查找匹配站点，支持 * 通配符
  function findMatchingSite(sites, url) {
    if (!sites || !url) return null;
    return sites.find(site => matchUrl(site.url, url));
  }

  // 渲染当前页面状态
  function renderCurrentStatus(tab, sites) {
    const urlEl = document.getElementById('currentUrl');
    const statusEl = document.getElementById('matchStatus');
    const fillBtn = document.getElementById('fillBtn');
    const copyBtn = document.getElementById('copyBtn');

    const url = tab ? tab.url : '';
    urlEl.textContent = url ? url.substring(0, 50) + (url.length > 50 ? '...' : '') : '无法获取';

    const matchedSite = findMatchingSite(sites, url);

    if (matchedSite) {
      statusEl.className = 'match-status success';
      statusEl.textContent = `✓ 匹配: ${matchedSite.name}`;
      fillBtn.disabled = false;
      fillBtn.dataset.siteId = matchedSite.id;
      // 显示复制按钮，存储匹配信息
      copyBtn.classList.remove('hidden');
      copyBtn.dataset.url = url;
      copyBtn.dataset.username = matchedSite.username || '';
      copyBtn.dataset.password = matchedSite.password || '';
    } else {
      statusEl.className = 'match-status none';
      statusEl.textContent = '未匹配站点';
      fillBtn.disabled = true;
      fillBtn.dataset.siteId = '';
      // 隐藏复制按钮
      copyBtn.classList.add('hidden');
    }
  }

  // 渲染站点列表（按分组，支持展开/收起）
  function renderSiteList(sites, groups) {
    const listEl = document.getElementById('siteList');

    if (!sites || sites.length === 0) {
      listEl.innerHTML = '<div class="empty-tip">暂无站点</div>';
      return;
    }

    let html = '';
    let groupIndex = 0;
    groups.forEach((group, idx) => {
      const groupSites = sites.filter(s => s.groupId === group.id);
      if (groupSites.length === 0) return;

      const isFirst = groupIndex === 0;
      groupIndex++;

      html += `
        <div class="group-container" data-group="${group.id}">
          <div class="group-header">
            <span class="group-toggle">${isFirst ? '▼' : '▶'}</span>
            <span class="group-name">${group.name}</span>
            <span class="group-count">${groupSites.length}</span>
          </div>
          <div class="group-sites ${isFirst ? '' : 'collapsed'}">
            ${groupSites.map(site => `
              <div class="site-item" data-id="${site.id}" data-url="${site.url}">
                <div class="site-name">${site.name}</div>
                <div class="site-url">${site.url}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html || '<div class="empty-tip">暂无站点</div>';
  }

  // 切换分组展开/收起
  function toggleGroup(groupContainer) {
    const sitesEl = groupContainer.querySelector('.group-sites');
    const toggleEl = groupContainer.querySelector('.group-toggle');

    if (sitesEl.classList.contains('collapsed')) {
      sitesEl.classList.remove('collapsed');
      toggleEl.textContent = '▼';
    } else {
      sitesEl.classList.add('collapsed');
      toggleEl.textContent = '▶';
    }
  }

  // 打开站点 URL
  function openSite(url) {
    if (!url) return;

    // 构造完整 URL（如果没有协议则添加 https://）
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullUrl = 'https://' + url;
    }

    // 在当前标签页打开
    chrome.tabs.update({ url: fullUrl });
    window.close();
  }

  // 打开管理页面
  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  // 复制账号信息
  function copyCredentials(copyBtn) {
    const url = copyBtn.dataset.url || '';
    const username = copyBtn.dataset.username || '';
    const password = copyBtn.dataset.password || '';

    const text = `${url}\n${username}\n${password}`;

    navigator.clipboard.writeText(text).then(function() {
      // 显示复制成功状态
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      copyBtn.classList.add('copied');

      setTimeout(function() {
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        copyBtn.classList.remove('copied');
      }, 1500);
    }).catch(function(err) {
      console.error('复制失败:', err);
    });
  }

  // 手动填充
  function manualFill() {
    const siteId = document.getElementById('fillBtn').dataset.siteId;
    if (!siteId) return;

    getData(function(data) {
      const site = data.sites.find(s => s.id === siteId);
      if (!site) return;

      // 发送消息给 content script 执行填充
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'fill',
          site: site
        }, function(response) {
          // 关闭 popup
          window.close();
        });
      });
    });
  }

  // 添加当前页面
  function addCurrentPage() {
    getCurrentTab(function(tab) {
      if (!tab || !tab.url) {
        alert('无法获取当前页面 URL');
        return;
      }

      // 从 URL 提取关键字（去掉协议和路径）
      let urlKey = tab.url;
      try {
        const urlObj = new URL(tab.url);
        urlKey = urlObj.hostname;
        if (urlObj.port) urlKey += ':' + urlObj.port;
      } catch (e) {
        // 如果解析失败，使用原始 URL
      }

      // 打开 options 页面添加
      chrome.runtime.openOptionsPage();
      // 通过 storage 临时传递信息，options.js 启动时检查
      chrome.storage.local.set({
        _pendingAdd: {
          url: urlKey,
          title: tab.title || ''
        }
      });
    });
  }

  // 初始化
  function init() {
    getCurrentTab(function(tab) {
      getData(function(data) {
        renderCurrentStatus(tab, data.sites);
        renderSiteList(data.sites, data.groups);
      });
    });

    // 绑定事件
    document.getElementById('openOptions').addEventListener('click', openOptions);
    document.getElementById('fillBtn').addEventListener('click', manualFill);
    document.getElementById('addCurrentBtn').addEventListener('click', addCurrentPage);
    document.getElementById('copyBtn').addEventListener('click', function() {
      copyCredentials(this);
    });

    // 站点列表点击事件委托
    document.getElementById('siteList').addEventListener('click', function(e) {
      // 点击分组 header 切换展开/收起
      const groupHeader = e.target.closest('.group-header');
      if (groupHeader) {
        const groupContainer = groupHeader.closest('.group-container');
        toggleGroup(groupContainer);
        return;
      }

      // 点击站点打开 URL
      const siteItem = e.target.closest('.site-item');
      if (siteItem) {
        const url = siteItem.dataset.url;
        openSite(url);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();