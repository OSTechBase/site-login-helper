// options.js - 管理界面逻辑
(function() {
  'use strict';

  // 数据存储键
  const STORAGE_KEY = 'siteLoginHelper';

  // 默认分组 ID
  const DEFAULT_GROUP_ID = 'default';

  // 转义 HTML 特殊字符，防止站点名称/URL 中的特殊字符破坏页面结构
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 生成唯一 ID
  function generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  // 获取数据（确保有默认分组）
  function getData(callback) {
    chrome.storage.local.get(STORAGE_KEY, function(result) {
      let data = result[STORAGE_KEY] || { sites: [], groups: [] };

      // 确保有默认分组
      if (!data.groups || data.groups.length === 0) {
        data.groups = [{ id: DEFAULT_GROUP_ID, name: '默认' }];
      } else if (!data.groups.find(g => g.id === DEFAULT_GROUP_ID)) {
        data.groups.unshift({ id: DEFAULT_GROUP_ID, name: '默认' });
      }

      // 确保所有站点都有 groupId
      if (data.sites) {
        data.sites = data.sites.map(site => ({
          ...site,
          groupId: site.groupId || DEFAULT_GROUP_ID
        }));
      }

      callback(data);
    });
  }

  // 保存数据
  function saveData(data, callback) {
    chrome.storage.local.set({ [STORAGE_KEY]: data }, callback);
  }

  // 渲染分组选择下拉框
  function renderGroupSelect(selectEl, selectedId, includeAll = false) {
    getData(function(data) {
      let html = includeAll ? '<option value="">全部分组</option>' : '';
      html += data.groups.map(g =>
        `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${g.name}</option>`
      ).join('');
      selectEl.innerHTML = html;
    });
  }

  // 惰性迁移：旧格式 site 没有 accounts 时，从顶层 username/password 构造一条默认账号
  // 用 site.id 作为账号 ID 的前缀，保证同一站点每次迁移结果相同，避免 find 找不到
  function migrateAccounts(site) {
    if (site.accounts && site.accounts.length > 0) return site.accounts;
    return [{
      id: site.id + '_default',
      label: '默认',
      username: site.username || '',
      password: site.password || '',
      isDefault: true
    }];
  }

  // 渲染单个站点的账号子列表 HTML
  function renderAccountsHtml(accounts) {
    return accounts.map(acc => `
      <div class="account-item" data-acc-id="${escapeHtml(acc.id)}">
        <span class="acc-username">${escapeHtml(acc.username)}${acc.isDefault ? ' <span class="acc-star">★</span>' : ''}</span>
        <span class="acc-actions">
          ${!acc.isDefault ? `<button class="btn btn-small" data-action="set-default-account" data-id="${escapeHtml(acc.id)}">设为默认</button>` : ''}
          <button class="btn btn-small" data-action="edit-account" data-id="${escapeHtml(acc.id)}">编辑</button>
          <button class="btn btn-small btn-danger" data-action="delete-account" data-id="${escapeHtml(acc.id)}">删除</button>
        </span>
      </div>
    `).join('');
  }

  // 渲染站点列表（按分组）
  function renderSiteList(sites, groups) {
    const listEl = document.getElementById('siteList');

    if (!sites || sites.length === 0) {
      listEl.innerHTML = '<div class="empty-state">暂无站点配置<br><br>点击"添加站点"开始</div>';
      return;
    }

    let html = '';
    groups.forEach(group => {
      const groupSites = sites.filter(s => s.groupId === group.id);

      html += `
        <div class="group-section" data-group-id="${escapeHtml(group.id)}">
          <div class="group-header">
            <div>
              <span class="group-title">${escapeHtml(group.name)}</span>
              <span class="group-count">${groupSites.length} 个站点</span>
            </div>
            <div class="group-actions">
              ${group.id !== DEFAULT_GROUP_ID ? `
                <button class="btn" data-action="edit-group" data-id="${escapeHtml(group.id)}">编辑</button>
                <button class="btn btn-danger" data-action="delete-group" data-id="${escapeHtml(group.id)}">删除</button>
              ` : ''}
            </div>
          </div>
          <div class="group-sites">
            ${groupSites.length > 0 ? groupSites.map(site => {
              const accounts = migrateAccounts(site);
              return `
              <div class="site-item" data-id="${escapeHtml(site.id)}">
                <div class="site-info">
                  <div class="site-name">${escapeHtml(site.name || '未命名')}</div>
                  <div class="site-url">${escapeHtml(site.url || '')}</div>
                </div>
                <div class="site-actions">
                  <button class="btn btn-small" data-action="edit-site" data-id="${escapeHtml(site.id)}">编辑</button>
                  <button class="btn btn-small" data-action="move-site" data-id="${escapeHtml(site.id)}">移动</button>
                  <button class="btn btn-small btn-danger" data-action="delete-site" data-id="${escapeHtml(site.id)}">删除</button>
                </div>
                <div class="account-list" data-site-id="${escapeHtml(site.id)}">
                  ${renderAccountsHtml(accounts)}
                </div>
                <button class="btn btn-small" data-action="add-account" data-id="${escapeHtml(site.id)}">+ 添加账号</button>
              </div>
            `}).join('') : '<div class="group-empty">暂无站点</div>'}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  }

  // 显示站点弹窗（编辑时只改名称/URL/分组，账号在子列表管理）
  function showModal(title, site = null) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('siteId').value = site ? site.id : '';
    document.getElementById('siteName').value = site ? site.name : '';
    document.getElementById('siteUrl').value = site ? site.url : '';

    // 渲染分组选择
    getData(function(data) {
      const selectEl = document.getElementById('siteGroup');
      const selectedGroupId = site ? site.groupId : DEFAULT_GROUP_ID;
      selectEl.innerHTML = data.groups.map(g =>
        `<option value="${g.id}" ${g.id === selectedGroupId ? 'selected' : ''}>${g.name}</option>`
      ).join('');
    });

    document.getElementById('modalOverlay').classList.remove('hidden');
  }

  // 隐藏站点弹窗
  function hideModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('siteForm').reset();
  }

  // 添加站点
  function addSite() {
    showModal('添加站点');
  }

  // 编辑站点
  function editSite(id) {
    getData(function(data) {
      const site = data.sites.find(s => s.id === id);
      if (site) {
        showModal('编辑站点', site);
      }
    });
  }

  // 删除站点
  function deleteSite(id) {
    if (!confirm('确定删除此站点？')) return;

    getData(function(data) {
      data.sites = data.sites.filter(s => s.id !== id);
      saveData(data, function() {
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 移动站点
  function moveSite(id) {
    getData(function(data) {
      const site = data.sites.find(s => s.id === id);
      if (!site) return;

      document.getElementById('moveSiteId').value = id;
      document.getElementById('moveCopyMode').checked = false;

      const selectEl = document.getElementById('moveTargetGroup');
      selectEl.innerHTML = data.groups.map(g =>
        `<option value="${g.id}" ${g.id === site.groupId ? 'selected' : ''}>${g.name}</option>`
      ).join('');

      document.getElementById('moveModal').classList.remove('hidden');
    });
  }

  // 确认移动/复制
  function confirmMove() {
    const siteId = document.getElementById('moveSiteId').value;
    const targetGroupId = document.getElementById('moveTargetGroup').value;
    const isCopy = document.getElementById('moveCopyMode').checked;

    getData(function(data) {
      const site = data.sites.find(s => s.id === siteId);
      if (!site) return;

      if (isCopy) {
        // 复制站点
        const newSite = {
          ...site,
          id: generateId(),
          groupId: targetGroupId,
          name: site.name + ' (副本)'
        };
        data.sites.push(newSite);
      } else {
        // 移动站点
        site.groupId = targetGroupId;
      }

      saveData(data, function() {
        document.getElementById('moveModal').classList.add('hidden');
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 保存站点（添加或编辑）；账号字段由账号子列表单独管理
  function saveSite(e) {
    e.preventDefault();

    const id = document.getElementById('siteId').value;
    const name = document.getElementById('siteName').value.trim();
    const url = document.getElementById('siteUrl').value.trim();
    const groupId = document.getElementById('siteGroup').value || DEFAULT_GROUP_ID;

    if (!name || !url) {
      alert('请填写站点名称和 URL');
      return;
    }

    getData(function(data) {
      if (id) {
        // 编辑：只更新名称/URL/分组，保留 accounts 不变
        const site = data.sites.find(s => s.id === id);
        if (site) {
          site.name = name;
          site.url = url;
          site.groupId = groupId;
        }
      } else {
        // 新建站点时自动创建一条默认账号（后续可在子列表中增删）
        data.sites.push({
          id: generateId(),
          name,
          url,
          groupId,
          accounts: [{
            id: generateId(),
            label: '默认',
            username: '',
            password: '',
            isDefault: true
          }]
        });
      }

      saveData(data, function() {
        hideModal();
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 显示账号弹窗（添加或编辑）
  function showAccountModal(siteId, account = null) {
    document.getElementById('accountModalTitle').textContent = account ? '编辑账号' : '添加账号';
    document.getElementById('accountSiteId').value = siteId;
    document.getElementById('accountId').value = account ? account.id : '';
    document.getElementById('accountUsername').value = account ? account.username : '';
    document.getElementById('accountPassword').value = account ? account.password : '';
    document.getElementById('accountModal').classList.remove('hidden');
  }

  // 隐藏账号弹窗
  function hideAccountModal() {
    document.getElementById('accountModal').classList.add('hidden');
    document.getElementById('accountForm').reset();
  }

  // 保存账号（添加或编辑）
  function saveAccount(e) {
    e.preventDefault();

    const siteId = document.getElementById('accountSiteId').value;
    const accId = document.getElementById('accountId').value;
    const username = document.getElementById('accountUsername').value.trim();
    const password = document.getElementById('accountPassword').value;

    getData(function(data) {
      const site = data.sites.find(s => s.id === siteId);
      if (!site) return;

      // 惰性迁移：确保 site.accounts 存在
      if (!site.accounts || site.accounts.length === 0) {
        site.accounts = migrateAccounts(site);
      }

      if (accId) {
        // 编辑
        const acc = site.accounts.find(a => a.id === accId);
        if (acc) {
          acc.username = username;
          acc.password = password;
        }
      } else {
        // 添加
        site.accounts.push({ id: generateId(), username, password, isDefault: false });
      }

      saveData(data, function() {
        hideAccountModal();
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 删除账号
  function deleteAccount(siteId, accId) {
    getData(function(data) {
      const site = data.sites.find(s => s.id === siteId);
      if (!site) return;

      if (!site.accounts) site.accounts = migrateAccounts(site);

      if (site.accounts.length <= 1) {
        alert('至少保留一个账号');
        return;
      }

      if (!confirm('确定删除此账号？')) return;

      const wasDefault = site.accounts.find(a => a.id === accId)?.isDefault;
      site.accounts = site.accounts.filter(a => a.id !== accId);

      // 删除的是默认账号时，自动把第一条升为默认
      if (wasDefault && site.accounts.length > 0) {
        site.accounts[0].isDefault = true;
      }

      saveData(data, function() {
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 设置默认账号
  function setDefaultAccount(siteId, accId) {
    getData(function(data) {
      const site = data.sites.find(s => s.id === siteId);
      if (!site) return;

      if (!site.accounts) site.accounts = migrateAccounts(site);

      site.accounts.forEach(a => { a.isDefault = (a.id === accId); });

      saveData(data, function() {
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 从账号按钮向上找到所属 site-item 的 data-id
  function getSiteIdFromAccountBtn(btn) {
    return btn.closest('.site-item').dataset.id;
  }
  function showGroupModal(title, group = null) {
    document.getElementById('groupModalTitle').textContent = title;
    document.getElementById('groupId').value = group ? group.id : '';
    document.getElementById('groupName').value = group ? group.name : '';
    document.getElementById('groupModal').classList.remove('hidden');
  }

  // 隐藏分组弹窗
  function hideGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
    document.getElementById('groupForm').reset();
  }

  // 添加分组
  function addGroup() {
    showGroupModal('新建分组');
  }

  // 编辑分组
  function editGroup(id) {
    getData(function(data) {
      const group = data.groups.find(g => g.id === id);
      if (group) {
        showGroupModal('编辑分组', group);
      }
    });
  }

  // 删除分组
  function deleteGroup(id) {
    if (id === DEFAULT_GROUP_ID) {
      alert('默认分组不能删除');
      return;
    }

    getData(function(data) {
      const groupSites = data.sites.filter(s => s.groupId === id);
      if (groupSites.length > 0) {
        if (!confirm(`该分组下有 ${groupSites.length} 个站点，删除分组后站点将移至"默认"分组，确定删除？`)) {
          return;
        }
        // 将站点移至默认分组
        data.sites = data.sites.map(s =>
          s.groupId === id ? { ...s, groupId: DEFAULT_GROUP_ID } : s
        );
      }

      data.groups = data.groups.filter(g => g.id !== id);
      saveData(data, function() {
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 保存分组
  function saveGroup(e) {
    e.preventDefault();

    const id = document.getElementById('groupId').value;
    const name = document.getElementById('groupName').value.trim();

    if (!name) {
      alert('请填写分组名称');
      return;
    }

    getData(function(data) {
      if (id) {
        // 编辑
        const group = data.groups.find(g => g.id === id);
        if (group) {
          group.name = name;
        }
      } else {
        // 添加
        data.groups.push({
          id: generateId(),
          name: name
        });
      }

      saveData(data, function() {
        hideGroupModal();
        renderSiteList(data.sites, data.groups);
      });
    });
  }

  // 导出配置
  function exportConfig() {
    getData(function(data) {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'site-login-helper-config.json';
      a.click();

      URL.revokeObjectURL(url);
    });
  }

  // 显示导入弹窗
  function showImportModal() {
    document.getElementById('importModal').classList.remove('hidden');
    document.getElementById('importFile').value = '';
  }

  // 隐藏导入弹窗
  function hideImportModal() {
    document.getElementById('importModal').classList.add('hidden');
  }

  // 执行导入
  function doImport() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];

    if (!file) {
      alert('请选择文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);

        if (!data.sites || !Array.isArray(data.sites)) {
          alert('文件格式错误：缺少 sites 数组');
          return;
        }

        // 确保有分组
        if (!data.groups || data.groups.length === 0) {
          data.groups = [{ id: DEFAULT_GROUP_ID, name: '默认' }];
        }

        // 验证每个站点
        for (const site of data.sites) {
          if (!site.id) site.id = generateId();
          if (!site.name) site.name = '未命名';
          if (!site.url) {
            alert('站点缺少 URL');
            return;
          }
          if (!site.groupId) site.groupId = DEFAULT_GROUP_ID;
        }

        saveData(data, function() {
          hideImportModal();
          renderSiteList(data.sites, data.groups);
          alert('导入成功');
        });
      } catch (err) {
        alert('JSON 解析错误：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // 初始化
  function init() {
    // 检查是否有待添加的站点信息（来自 popup）
    chrome.storage.local.get('_pendingAdd', function(result) {
      if (result._pendingAdd) {
        chrome.storage.local.remove('_pendingAdd');
        showModal('添加站点', {
          id: '',
          name: result._pendingAdd.title || '',
          url: result._pendingAdd.url || '',
          username: '',
          password: '',
          groupId: DEFAULT_GROUP_ID
        });
      }
    });

    // 加载并渲染站点列表
    getData(function(data) {
      renderSiteList(data.sites, data.groups);
    });

    // 绑定按钮事件
    document.getElementById('addBtn').addEventListener('click', addSite);
    document.getElementById('addGroupBtn').addEventListener('click', addGroup);
    document.getElementById('cancelBtn').addEventListener('click', hideModal);
    document.getElementById('siteForm').addEventListener('submit', saveSite);
    document.getElementById('groupCancelBtn').addEventListener('click', hideGroupModal);
    document.getElementById('groupForm').addEventListener('submit', saveGroup);
    document.getElementById('moveCancelBtn').addEventListener('click', function() {
      document.getElementById('moveModal').classList.add('hidden');
    });
    document.getElementById('moveConfirmBtn').addEventListener('click', confirmMove);
    document.getElementById('exportBtn').addEventListener('click', exportConfig);
    document.getElementById('importBtn').addEventListener('click', showImportModal);
    document.getElementById('importCancelBtn').addEventListener('click', hideImportModal);
    document.getElementById('importConfirmBtn').addEventListener('click', doImport);

    // 账号弹窗事件
    document.getElementById('accountCancelBtn').addEventListener('click', hideAccountModal);
    document.getElementById('accountForm').addEventListener('submit', saveAccount);
    document.getElementById('accountModal').addEventListener('click', function(e) {
      if (e.target === this) hideAccountModal();
    });

    // 密码可见性切换
    document.getElementById('togglePassword').addEventListener('click', function() {
      const input = document.getElementById('accountPassword');
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      // 切换眼睛图标：明文时显示划线眼
      document.getElementById('eyeIcon').innerHTML = isHidden
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    });

    // 站点列表事件委托（处理所有按钮点击）
    document.getElementById('siteList').addEventListener('click', function(e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'edit-site':
          editSite(id);
          break;
        case 'delete-site':
          deleteSite(id);
          break;
        case 'move-site':
          moveSite(id);
          break;
        case 'edit-group':
          editGroup(id);
          break;
        case 'delete-group':
          deleteGroup(id);
          break;
        case 'add-account': {
          // 找所属 site-item 上的 data-id 作为 siteId
          const siteId = getSiteIdFromAccountBtn(btn);
          showAccountModal(siteId);
          break;
        }
        case 'edit-account': {
          const siteId = getSiteIdFromAccountBtn(btn);
          getData(function(data) {
            const site = data.sites.find(s => s.id === siteId);
            if (!site) return;
            const accounts = migrateAccounts(site);
            const acc = accounts.find(a => a.id === id);
            if (acc) showAccountModal(siteId, acc);
          });
          break;
        }
        case 'delete-account': {
          const siteId = getSiteIdFromAccountBtn(btn);
          deleteAccount(siteId, id);
          break;
        }
        case 'set-default-account': {
          const siteId = getSiteIdFromAccountBtn(btn);
          setDefaultAccount(siteId, id);
          break;
        }
      }
    });

    // 点击遮罩关闭弹窗
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
      if (e.target === this) hideModal();
    });
    document.getElementById('groupModal').addEventListener('click', function(e) {
      if (e.target === this) hideGroupModal();
    });
    document.getElementById('moveModal').addEventListener('click', function(e) {
      if (e.target === this) e.target.classList.add('hidden');
    });
    document.getElementById('importModal').addEventListener('click', function(e) {
      if (e.target === this) hideImportModal();
    });
  }

  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', init);

})();