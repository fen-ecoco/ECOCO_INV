/**
 * ECOCO_INV 後端伺服器
 * ------------------------------------------------------------
 * 提供一個與 Claude.ai Artifact 的 window.storage 介面對應的
 * 簡易 Key-Value 儲存 API，讓 index.html 在「非 Claude.ai 環境」
 * （直接用瀏覽器打開、或部署在公司內部主機）也能正常存取資料。
 *
 * 資料庫：以單一 JSON 檔（data/db.json）儲存，適合小團隊、
 * 低並發使用情境。若未來資料量變大或需要多台主機同時服務，
 * 再替換成正式資料庫（PostgreSQL / MySQL 等）即可，
 * 只需要改動本檔案裡的 readDB() / writeDB()，前端完全不用改。
 * ------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// ---- 簡易 JSON 檔案資料庫 ----
function ensureDB(){
  if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ entries: {} }, null, 2), 'utf-8');
}
function readDB(){
  ensureDB();
  try{
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  }catch(e){
    console.error('讀取資料庫失敗，將重建空白資料庫：', e.message);
    const empty = { entries: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }
}
// 簡單的寫入佇列，避免同時多個請求寫檔互相覆蓋
let writeQueue = Promise.resolve();
function writeDB(db){
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8', (err) => {
      if(err) reject(err); else resolve();
    });
  }));
  return writeQueue;
}
function entryKey(key, shared, owner){
  return shared ? `shared::${key}` : `personal::${owner}::${key}`;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 同時服務前端靜態檔案（index.html、storage-shim.js 位於上層資料夾）
// 部署到內部主機時，開啟 http://<主機位址>:3001/ 即可同時取得網頁與資料 API
app.use(express.static(path.join(__dirname, '..')));

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// GET /api/storage/:key?shared=true|false&owner=xxx
app.get('/api/storage/:key', (req, res) => {
  const key = req.params.key;
  const shared = req.query.shared === 'true';
  const owner = req.query.owner || '';
  const db = readDB();
  const ek = entryKey(key, shared, owner);
  const entry = db.entries[ek];
  if(!entry){
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ key, value: entry.value, shared });
});

// POST /api/storage/:key  body: { value, shared, owner }
app.post('/api/storage/:key', async (req, res) => {
  const key = req.params.key;
  const { value, shared, owner } = req.body || {};
  if(value === undefined){
    return res.status(400).json({ error: 'value_required' });
  }
  const db = readDB();
  const ek = entryKey(key, !!shared, owner || '');
  db.entries[ek] = { value, updatedAt: new Date().toISOString() };
  try{
    await writeDB(db);
    res.json({ key, value, shared: !!shared });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'write_failed' });
  }
});

// DELETE /api/storage/:key?shared=&owner=
app.delete('/api/storage/:key', async (req, res) => {
  const key = req.params.key;
  const shared = req.query.shared === 'true';
  const owner = req.query.owner || '';
  const db = readDB();
  const ek = entryKey(key, shared, owner);
  const existed = !!db.entries[ek];
  delete db.entries[ek];
  try{
    await writeDB(db);
    res.json({ key, deleted: existed, shared });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'write_failed' });
  }
});

// GET /api/storage-list?prefix=&shared=&owner=
app.get('/api/storage-list', (req, res) => {
  const prefix = req.query.prefix || '';
  const shared = req.query.shared === 'true';
  const owner = req.query.owner || '';
  const db = readDB();
  const scopePrefix = shared ? 'shared::' : `personal::${owner}::`;
  const keys = Object.keys(db.entries)
    .filter(ek => ek.startsWith(scopePrefix))
    .map(ek => ek.slice(scopePrefix.length))
    .filter(k => k.startsWith(prefix));
  res.json({ keys, prefix, shared });
});

app.listen(PORT, () => {
  console.log(`ECOCO_INV 後端伺服器已啟動：http://localhost:${PORT}`);
  console.log(`資料庫檔案位置：${DB_FILE}`);
});
