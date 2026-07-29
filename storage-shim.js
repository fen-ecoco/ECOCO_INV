/**
 * ECOCO_INV storage-shim.js
 * ------------------------------------------------------------
 * 在 Claude.ai Artifact 環境中，瀏覽器會自動提供 window.storage
 * （get / set / delete / list），本檔案完全不會啟動。
 *
 * 在「一般瀏覽器」開啟 index.html（例如公司內部主機、
 * 本機測試 http://localhost）時，window.storage 不存在，
 * 這支 shim 就會補上同樣介面，改用 HTTP 呼叫本機／內部主機的
 * server.js 後端 API，讓整份 index.html 完全不用改動任何
 * 商業邏輯，就能在兩種環境下都正常運作。
 *
 * 使用方式：在 index.html 的 </head> 前，於主程式 <script> 之前
 * 加入：
 *   <script>window.ECOCO_API_BASE = 'http://localhost:3001';</script>
 *   <script src="storage-shim.js"></script>
 * 部署到內部主機時，把 ECOCO_API_BASE 改成該主機的網址即可。
 * ------------------------------------------------------------
 */
(function () {
  if (window.storage) {
    // 已在 Claude.ai Artifact 環境中，使用平台原生的 window.storage，不覆蓋。
    return;
  }

  var API_BASE = window.ECOCO_API_BASE || 'http://localhost:3001';

  function getClientId() {
    try {
      var id = localStorage.getItem('ecoco_client_id');
      if (!id) {
        id = 'client_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('ecoco_client_id', id);
      }
      return id;
    } catch (e) {
      // 若瀏覽器完全禁用 localStorage，退回每次隨機（該裝置無法保留個人登入狀態）
      return 'client_anon_' + Math.random().toString(36).slice(2);
    }
  }

  async function apiGet(key, shared) {
    var owner = shared ? '' : getClientId();
    var url = API_BASE + '/api/storage/' + encodeURIComponent(key) +
      '?shared=' + (!!shared) + '&owner=' + encodeURIComponent(owner);
    var res = await fetch(url);
    if (res.status === 404) {
      throw new Error('ECOCO storage: key not found: ' + key);
    }
    if (!res.ok) {
      throw new Error('ECOCO storage: get failed (' + res.status + ')');
    }
    return res.json();
  }

  async function apiSet(key, value, shared) {
    var owner = shared ? '' : getClientId();
    var res = await fetch(API_BASE + '/api/storage/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value, shared: !!shared, owner: owner })
    });
    if (!res.ok) {
      throw new Error('ECOCO storage: set failed (' + res.status + ')');
    }
    return res.json();
  }

  async function apiDelete(key, shared) {
    var owner = shared ? '' : getClientId();
    var url = API_BASE + '/api/storage/' + encodeURIComponent(key) +
      '?shared=' + (!!shared) + '&owner=' + encodeURIComponent(owner);
    var res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('ECOCO storage: delete failed (' + res.status + ')');
    }
    return res.json();
  }

  async function apiList(prefix, shared) {
    var owner = shared ? '' : getClientId();
    var url = API_BASE + '/api/storage-list?prefix=' + encodeURIComponent(prefix || '') +
      '&shared=' + (!!shared) + '&owner=' + encodeURIComponent(owner);
    var res = await fetch(url);
    if (!res.ok) {
      throw new Error('ECOCO storage: list failed (' + res.status + ')');
    }
    return res.json();
  }

  window.storage = {
    get: function (key, shared) { return apiGet(key, shared); },
    set: function (key, value, shared) { return apiSet(key, value, shared); },
    delete: function (key, shared) { return apiDelete(key, shared); },
    list: function (prefix, shared) { return apiList(prefix, shared); }
  };

  console.log('[ECOCO] 使用獨立後端儲存（storage-shim），API_BASE =', API_BASE);
})();
