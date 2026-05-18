// content.js - 自动填充脚本
(function () {
  'use strict';

  // 生成唯一 ID
  function generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  // 使用原生 setter 设置输入框值（兼容 React）
  function setInputValue(input, value) {
    if (!input || value == null) return;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

    // 触发事件
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 查找用户名输入框
  function findUsernameInput() {
    const selectors = [
      '#username',
      'input[name="username"]',
      'input[name="user"]',
      'input[name="login"]',
      'input[placeholder*="用户名"]',
      'input[placeholder*="账号"]',
      'input[placeholder*="帐号"]',
      'input[placeholder*="account"]',
      'input[placeholder*="username"]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && isVisible(input)) return input;
    }

    // 最后尝试：第一个可见的 text 类型输入框（排除搜索框）
    const textInputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of textInputs) {
      if (isVisible(input) && !isSearchInput(input)) return input;
    }

    return null;
  }

  // 查找密码输入框
  function findPasswordInput() {
    const selectors = [
      '#password',
      'input[name="password"]',
      'input[name="pwd"]',
      'input[placeholder*="密码"]',
      'input[placeholder*="password"]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && isVisible(input)) return input;
    }

    // 最后尝试：第一个可见的 password 类型输入框
    const pwdInputs = document.querySelectorAll('input[type="password"]');
    for (const input of pwdInputs) {
      if (isVisible(input)) return input;
    }

    return null;
  }

  // 检查元素是否可见
  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0;
  }

  // 检查是否是搜索输入框
  function isSearchInput(input) {
    const placeholder = (input.placeholder || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();

    const searchKeywords = ['search', '搜索', '查询', 'filter'];
    return searchKeywords.some(kw =>
      placeholder.includes(kw) || name.includes(kw) || id.includes(kw)
    );
  }

  // 将 URL 模式转为正则，* 匹配单段内的数字/字母/连字符（不含点和斜杠）
  // 只对 hostname:port 段做精确匹配（^ $），避免 10.10.1.1 误匹配 10.10.1.10
  function matchUrl(pattern, url) {
    if (!pattern || !url) return false;

    // 实际 URL 只取 hostname:port
    let target = url;
    try {
      const u = new URL(url);
      target = u.hostname + (u.port ? ':' + u.port : '');
    } catch (e) { }

    // pattern 若带协议头（http:// / https://），同样只取 hostname:port 部分
    // 用小写占位符，避免 new URL() 自动小写 hostname 导致还原失败
    let p = pattern;
    try {
      if (/^https?:\/\//i.test(p)) {
        const u = new URL(p.replace(/\*/g, '__wc__'));
        p = u.hostname.replace(/__wc__/g, '*') +
          (u.port ? ':' + u.port : '');
      }
    } catch (e) { }

    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '[a-zA-Z0-9-]+') + '$';
    return new RegExp(regexStr).test(target);
  }

  // 查找匹配的站点配置，支持 * 通配符
  function findMatchingSite(sites, currentUrl) {
    if (!sites || !currentUrl) return null;

    for (const site of sites) {
      if (matchUrl(site.url, currentUrl)) {
        return site;
      }
    }
    return null;
  }

  // 执行填充，必须有密码框才认定为登录页
  function fillLogin(site) {
    if (!site || (!site.username && !site.password)) return false;

    const usernameInput = findUsernameInput();
    const passwordInput = findPasswordInput();

    // 没有密码框说明不是登录页，跳过
    if (!passwordInput) {
      console.log('[站点自动填充] 未检测到密码框，跳过填充');
      return false;
    }

    if (usernameInput && site.username) {
      setInputValue(usernameInput, site.username);
      console.log('[站点自动填充] 已填充用户名');
    }

    if (passwordInput && site.password) {
      setInputValue(passwordInput, site.password);
      console.log('[站点自动填充] 已填充密码');
    }

    return true;
  }

  // 从 site 中取出要填充的账号（优先 isDefault，否则取第一条；兼容旧格式）
  function getAccountFromSite(site) {
    if (site.accounts && site.accounts.length > 0) {
      return site.accounts.find(a => a.isDefault) || site.accounts[0];
    }
    // 旧格式兼容：直接读顶层 username/password
    return { username: site.username, password: site.password };
  }

  // 主逻辑
  function autoFill() {
    chrome.storage.local.get('siteLoginHelper', function (result) {
      const data = result.siteLoginHelper || { sites: [] };
      const currentUrl = window.location.href;

      const matchedSite = findMatchingSite(data.sites, currentUrl);

      if (matchedSite) {
        console.log(`[站点自动填充] 匹配站点: ${matchedSite.name}`);
        fillLogin(getAccountFromSite(matchedSite));
      } else {
        console.log('[站点自动填充] 当前页面无匹配站点');
      }
    });
  }

  // 页面加载完成后执行
  // 给页面一点额外时间渲染（有些登录页是动态加载）
  // 用 filled 与 observer 共享状态，避免两者都触发时重复填充
  let filled = false;
  setTimeout(function () {
    if (!filled) {
      filled = true;
      autoFill();
    }
  }, 500);

  // 同时监听 DOM 变化，处理动态加载的登录框（早于 500ms 出现时优先触发）
  const observer = new MutationObserver(function (mutations) {
    if (filled) return;

    // 检查是否有密码框出现
    const pwdInput = findPasswordInput();
    if (pwdInput) {
      filled = true;
      autoFill();
      observer.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 10秒后停止观察
  setTimeout(() => observer.disconnect(), 10000);

  // 监听来自 popup 的手动填充消息，直接接收 {username, password}
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'fill' && request.site) {
      const success = fillLogin(request.site);
      sendResponse({ success: success });
    }
    return true; // 保持消息通道开放
  });

})();