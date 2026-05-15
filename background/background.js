// background.js - Service Worker for badge updates
(function() {
  'use strict';

  const STORAGE_KEY = 'siteLoginHelper';

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

  // 更新图标 badge
  function updateBadge(tabId, url) {
    chrome.storage.local.get(STORAGE_KEY, function(result) {
      const data = result[STORAGE_KEY] || { sites: [] };
      const matchedSite = findMatchingSite(data.sites, url);

      if (matchedSite) {
        // 匹配成功：显示绿色对勾
        chrome.action.setBadgeText({
          tabId: tabId,
          text: '✓'
        });
        chrome.action.setBadgeBackgroundColor({
          tabId: tabId,
          color: '#1e8e3e'
        });
      } else {
        // 未匹配：清除 badge
        chrome.action.setBadgeText({
          tabId: tabId,
          text: ''
        });
      }
    });
  }

  // 监听标签页更新
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    // 只在 URL 变化且页面加载完成时更新
    if (changeInfo.status === 'complete' && tab.url) {
      updateBadge(tabId, tab.url);
    }
  });

  // 监听标签页切换
  chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
      if (tab && tab.url) {
        updateBadge(activeInfo.tabId, tab.url);
      }
    });
  });

  // 监听存储变化，更新当前标签页 badge
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes[STORAGE_KEY]) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0] && tabs[0].url) {
          updateBadge(tabs[0].id, tabs[0].url);
        }
      });
    }
  });

})();