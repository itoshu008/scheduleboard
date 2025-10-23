const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 4001;

// ミドルウェア
app.use(cors());
app.use(express.json());

// データベース接続
const db = new sqlite3.Database('./scheduleboard.db', (err) => {
  if (err) {
    console.error('データベース接続エラー:', err);
  } else {
    console.log('✅ データベース接続成功');
  }
});

// 設備API
app.get('/api/equipment', (req, res) => {
  console.log('🔍 設備API呼び出し');
  
  // まずテーブル一覧を確認
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('❌ テーブル一覧取得エラー:', err);
    } else {
      console.log('📋 テーブル一覧:', tables);
    }
  });
  
  db.all('SELECT * FROM equipment ORDER BY display_order, id', (err, rows) => {
    if (err) {
      console.error('❌ 設備取得エラー:', err);
      res.status(500).json({ error: '設備の取得に失敗しました' });
    } else {
      console.log(`✅ 設備データ取得成功: ${rows.length}件`);
      console.log('設備データ:', rows);
      res.json(rows);
    }
  });
});

// 部署API
app.get('/api/departments', (req, res) => {
  console.log('🔍 部署API呼び出し');
  
  db.all('SELECT * FROM departments ORDER BY display_order, id', (err, rows) => {
    if (err) {
      console.error('❌ 部署取得エラー:', err);
      res.status(500).json({ error: '部署の取得に失敗しました' });
    } else {
      console.log(`✅ 部署データ取得成功: ${rows.length}件`);
      console.log('部署データ:', rows);
      res.json(rows);
    }
  });
});

// 社員API
app.get('/api/employees', (req, res) => {
  console.log('🔍 社員API呼び出し');
  
  db.all('SELECT * FROM employees ORDER BY display_order, id', (err, rows) => {
    if (err) {
      console.error('❌ 社員取得エラー:', err);
      res.status(500).json({ error: '社員の取得に失敗しました' });
    } else {
      console.log(`✅ 社員データ取得成功: ${rows.length}件`);
      console.log('社員データ:', rows);
      res.json(rows);
    }
  });
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ message: 'OK' });
});

app.listen(PORT, () => {
  console.log(`🚀 デバッグサーバー起動: http://localhost:${PORT}`);
});
