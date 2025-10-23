const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// dayjs for robust datetime handling
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');

dayjs.extend(utc);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// 堅牢なユーティリティ関数
function toSqlUtc(v) {
  if (!v) return null;
  const d = (typeof v === 'string' && v.includes('T')) ? dayjs(v) : dayjs.utc(v);
  if (!d.isValid()) return null;
  return d.utc().format('YYYY-MM-DD HH:mm:ss');
}

// 既存予約を取得
function dbGetReservationById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM equipment_reservations WHERE id = ? LIMIT 1', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

// 重複チェック（半開区間 [start, end)）- 厳格版
function dbFindConflicts(equipmentId, startSql, endSql, excludeId = null) {
  return new Promise((resolve, reject) => {
    console.log('🔍 重複チェック開始:', {
      equipmentId,
      startSql,
      endSql,
      excludeId
    });
    
    const params = [equipmentId, endSql, startSql];
    let sql = `
      SELECT id, purpose, start_datetime, end_datetime, employee_id, equipment_id
      FROM equipment_reservations
      WHERE equipment_id = ?
        AND NOT (end_datetime <= ? OR start_datetime >= ?)
    `;
    if (excludeId != null) { 
      sql += ' AND id <> ?'; 
      params.push(excludeId); 
    }
    sql += ' ORDER BY start_datetime LIMIT 50'; // 制限を緩和して詳細確認
    
    console.log('🔍 重複チェック SQL:', { sql, params });
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ 重複チェック SQL エラー:', err);
        reject(err);
      } else {
        console.log('🔍 重複チェック結果:', {
          conflictCount: rows?.length || 0,
          conflicts: rows || []
        });
        resolve(rows || []);
      }
    });
  });
}

const app = express();
const PORT = process.env.PORT || 4001;

// ミドルウェア
app.use(cors());
app.use(express.json());

// 静的ファイルの提供（APIルートの後に配置）
// app.use(express.static(path.join(__dirname, 'client', 'build')));
// app.use(express.static(path.join(__dirname, 'client', 'public')));

// 注意: SPA のキャッチオールは API ルート定義の「後ろ」に置くこと

// SQLiteデータベースファイルのパス
const dbPath = path.join(__dirname, 'scheduleboard.db');

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('SQLiteデータベース接続エラー:', err);
  } else {
    console.log('SQLiteデータベースに接続しました');
    initializeDatabase();
  }
});

// データベース初期化
function initializeDatabase() {
  db.serialize(() => {
    // 外部キー制約を有効化
    db.run('PRAGMA foreign_keys = ON');
    
    // departmentsテーブルの作成
    db.run(`
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('departmentsテーブル作成エラー:', err);
      } else {
        console.log('departmentsテーブルを作成しました');
      }
    });

    // employeesテーブルの作成
    db.run(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_number TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('employeesテーブル作成エラー:', err);
      } else {
        console.log('employeesテーブルを作成しました');
      }
    });

    // schedulesテーブルの作成
    db.run(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_datetime DATETIME NOT NULL,
        end_datetime DATETIME NOT NULL,
        color TEXT NOT NULL DEFAULT '#3174ad',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('schedulesテーブル作成エラー:', err);
      } else {
        console.log('schedulesテーブルを作成しました');
      }
    });

    // equipmentテーブルの作成
    db.run(`
      CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('equipmentテーブル作成エラー:', err);
      } else {
        console.log('equipmentテーブルを作成しました');
      }
    });

    // equipment_reservationsテーブルの作成
    db.run(`
      CREATE TABLE IF NOT EXISTS equipment_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        start_datetime DATETIME NOT NULL,
        end_datetime DATETIME NOT NULL,
        color TEXT NOT NULL DEFAULT '#3174ad',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('equipment_reservationsテーブル作成エラー:', err);
      } else {
        console.log('equipment_reservationsテーブルを作成しました');
      }
    });

    // templatesテーブルの作成
    db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#007bff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('templatesテーブル作成エラー:', err);
      } else {
        console.log('templatesテーブルを作成しました');
      }
    });

    // サンプルデータの挿入
    insertSampleData(() => {
      // サーバー起動
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    });
  });
}

// サンプルデータの挿入
function insertSampleData(callback) {
  let completed = 0;
  const total = 4;
  
  const checkComplete = () => {
    completed++;
    if (completed === total) {
      console.log('データベース初期化が完了しました');
      if (callback) callback();
    }
  };

  // 部署データ
  db.run(`
    INSERT OR IGNORE INTO departments (id, name, display_order) VALUES 
    (1, '営業部', 1),
    (2, '開発部', 2),
    (3, '総務部', 3)
  `, (err) => {
    if (err) {
      console.error('部署データ挿入エラー:', err);
    } else {
      console.log('部署データを挿入しました');
    }
    checkComplete();
  });

  // 社員データ
  db.run(`
    INSERT OR IGNORE INTO employees (id, employee_number, name, department_id, display_order) VALUES 
    (1, 'EMP001', '田中太郎', 1, 1),
    (2, 'EMP002', '佐藤花子', 1, 2),
    (3, 'EMP003', '鈴木一郎', 2, 1),
    (4, 'EMP004', '高橋美咲', 2, 2),
    (5, 'EMP005', '伊藤健太', 3, 1)
  `, (err) => {
    if (err) {
      console.error('社員データ挿入エラー:', err);
    } else {
      console.log('社員データを挿入しました');
    }
    checkComplete();
  });

  // 設備データ
  db.run(`
    INSERT OR IGNORE INTO equipment (id, name, display_order) VALUES 
    (1, '会議室A', 1),
    (2, '会議室B', 2),
    (3, 'プロジェクター', 3)
  `, (err) => {
    if (err) {
      console.error('設備データ挿入エラー:', err);
    } else {
      console.log('設備データを挿入しました');
    }
    checkComplete();
  });

  // テンプレートデータ
  db.run(`
    INSERT OR IGNORE INTO templates (id, name, title, color) VALUES 
    (1, '会議', '会議', '#ff6b6b'),
    (2, '出張', '出張', '#4ecdc4'),
    (3, '研修', '研修', '#45b7d1')
  `, (err) => {
    if (err) {
      console.error('テンプレートデータ挿入エラー:', err);
    } else {
      console.log('テンプレートデータを挿入しました');
    }
    checkComplete();
  });
}

// API エンドポイント

// 部署一覧取得
app.get('/api/departments', (req, res) => {
  db.all('SELECT * FROM departments ORDER BY display_order, id', (err, rows) => {
    if (err) {
      console.error('部署取得エラー:', err);
      res.status(500).json({ error: '部署の取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// 部署作成
app.post('/api/departments', (req, res) => {
  const { name, display_order } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '部署名は必須です' });
  }

  db.run(
    'INSERT INTO departments (name, display_order) VALUES (?, ?)',
    [name, display_order || 0],
    function(err) {
      if (err) {
        console.error('部署作成エラー:', err);
        res.status(500).json({ error: '部署の作成に失敗しました' });
      } else {
        res.json({ id: this.lastID, name, display_order: display_order || 0 });
      }
    }
  );
});

// 部署更新
app.put('/api/departments/:id', (req, res) => {
  const { id } = req.params;
  const { name, display_order } = req.body;

  if (!name) {
    return res.status(400).json({ error: '部署名は必須です' });
  }

  db.run(
    'UPDATE departments SET name = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, display_order || 0, id],
    function(err) {
      if (err) {
        console.error('部署更新エラー:', err);
        res.status(500).json({ error: '部署の更新に失敗しました' });
      } else if (this.changes === 0) {
        res.status(404).json({ error: '部署が見つかりません' });
      } else {
        res.json({ id: parseInt(id), name, display_order: display_order || 0 });
      }
    }
  );
});

// 部署削除
app.delete('/api/departments/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM departments WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('部署削除エラー:', err);
      res.status(500).json({ error: '部署の削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '部署が見つかりません' });
    } else {
      res.json({ message: '部署を削除しました' });
    }
  });
});

// 部署の表示順序を変更
app.put('/api/departments/:id/move', (req, res) => {
  const id = parseInt(req.params.id);
  const { direction } = req.body; // 'up' または 'down'
  
  console.log(`部署移動リクエスト: ID=${id}, direction=${direction}`);
  
  if (isNaN(id)) {
    console.log('無効なID:', req.params.id);
    return res.status(400).json({ error: '無効なIDです' });
  }
  
  if (!direction || !['up', 'down'].includes(direction)) {
    console.log('無効な方向:', direction);
    return res.status(400).json({ error: '無効な方向です' });
  }

  // 現在のアイテムを取得
  db.get('SELECT * FROM departments WHERE id = ?', [id], (err, currentItem) => {
    if (err) {
      console.error('部署取得エラー:', err);
      return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
    
    if (!currentItem) {
      console.log('部署が見つかりません:', id);
      return res.status(404).json({ error: '部署が見つかりません' });
    }

    console.log('現在のアイテム:', currentItem);

    let targetQuery;
    if (direction === 'up') {
      // 上に移動：現在より小さいdisplay_orderを持つ最大のアイテムを取得
      targetQuery = 'SELECT * FROM departments WHERE display_order < ? ORDER BY display_order DESC LIMIT 1';
    } else {
      // 下に移動：現在より大きいdisplay_orderを持つ最小のアイテムを取得
      targetQuery = 'SELECT * FROM departments WHERE display_order > ? ORDER BY display_order ASC LIMIT 1';
    }

    db.get(targetQuery, [currentItem.display_order], (err, targetItem) => {
      if (err) {
        console.error('対象アイテム取得エラー:', err);
        return res.status(500).json({ error: 'サーバーエラーが発生しました' });
      }

      if (!targetItem) {
        console.log('移動対象が見つかりません');
        return res.status(400).json({ error: '移動できません' });
      }

      console.log(`${direction}に移動 - 対象アイテム:`, targetItem);
      console.log('display_orderを交換中...');
      console.log(`ID ${id}: ${currentItem.display_order} → ${targetItem.display_order}`);
      console.log(`ID ${targetItem.id}: ${targetItem.display_order} → ${currentItem.display_order}`);

      // display_orderを交換
      db.serialize(() => {
        db.run('UPDATE departments SET display_order = ? WHERE id = ?', [targetItem.display_order, id], (err) => {
          if (err) {
            console.error('部署更新エラー1:', err);
            return res.status(500).json({ error: 'サーバーエラーが発生しました' });
          }
        });

        db.run('UPDATE departments SET display_order = ? WHERE id = ?', [currentItem.display_order, targetItem.id], (err) => {
          if (err) {
            console.error('部署更新エラー2:', err);
            return res.status(500).json({ error: 'サーバーエラーが発生しました' });
          }
        });

        // 更新された部署を取得
        db.get('SELECT * FROM departments WHERE id = ?', [id], (err, updatedDepartment) => {
          if (err) {
            console.error('更新後部署取得エラー:', err);
            return res.status(500).json({ error: 'サーバーエラーが発生しました' });
          }
          
          console.log('移動完了:', updatedDepartment);
          res.json(updatedDepartment);
        });
      });
    });
  });
});

// 部署の順番を一括更新
app.put('/api/departments/order/update', (req, res) => {
  const { orders } = req.body;
  
  console.log('部署の順番を一括更新:', orders);
  
  if (!orders || !Array.isArray(orders)) {
    return res.status(400).json({ error: '更新データが無効です' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('トランザクション開始エラー:', err);
        return res.status(500).json({ error: '順番更新に失敗しました' });
      }

      let updateCount = 0;
      let hasError = false;

      orders.forEach((order, index) => {
        if (hasError) return;

        db.run(
          'UPDATE departments SET display_order = ? WHERE id = ?',
          [order.display_order, order.id],
          function(err) {
            if (err) {
              console.error('部署順番更新エラー:', err);
              hasError = true;
              db.run('ROLLBACK');
              return res.status(500).json({ error: '順番更新に失敗しました' });
            }

            updateCount++;
            console.log(`部署ID ${order.id}: display_order = ${order.display_order}`);

            if (updateCount === orders.length && !hasError) {
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('コミットエラー:', err);
                  return res.status(500).json({ error: '順番更新に失敗しました' });
                }

                console.log(`${orders.length}件の部署順番を更新しました`);
                res.json({ message: `${orders.length}件の部署順番を更新しました` });
              });
            }
          }
        );
      });
    });
  });
});

// 社員一覧取得（部署フィルタ・並び順対応）
app.get('/api/employees', (req, res) => {
  const department_id = req.query.department_id;
  const order_by = req.query.order_by;

  const baseSelect = `
    SELECT e.*, d.name as department_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
  `;

  const whereClauses = [];
  const params = [];

  if (department_id) {
    whereClauses.push('e.department_id = ?');
    params.push(parseInt(String(department_id), 10));
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const orderSql = order_by === 'employee_number'
    ? 'ORDER BY e.employee_number, e.id'
    : 'ORDER BY e.display_order, e.id';

  const sql = `${baseSelect} ${whereSql} ${orderSql}`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('社員取得エラー:', err);
      res.status(500).json({ error: '社員の取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// 社員番号で社員取得
app.get('/api/employees/number/:employeeNumber', (req, res) => {
  const { employeeNumber } = req.params;

  const sql = `
    SELECT e.*, d.name as department_name 
    FROM employees e 
    LEFT JOIN departments d ON e.department_id = d.id 
    WHERE e.employee_number = ?
  `;

  db.get(sql, [employeeNumber], (err, row) => {
    if (err) {
      console.error('社員番号検索エラー:', err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    } else if (!row) {
      res.status(404).json({ error: '社員が見つかりません' });
    } else {
      res.json(row);
    }
  });
});

// 社員作成
app.post('/api/employees', (req, res) => {
  const { employee_number, name, department_id, display_order } = req.body;

  if (!employee_number || !name || !department_id) {
    return res.status(400).json({ error: '社員番号、名前、部署IDは必須です' });
  }

  db.run(
    'INSERT INTO employees (employee_number, name, department_id, display_order) VALUES (?, ?, ?, ?)',
    [employee_number, name, department_id, display_order || 0],
    function(err) {
      if (err) {
        console.error('社員作成エラー:', err);
        res.status(500).json({ error: '社員の作成に失敗しました' });
      } else {
        res.json({ 
          id: this.lastID, 
          employee_number, 
          name, 
          department_id, 
          display_order: display_order || 0 
        });
      }
    }
  );
});

// 社員更新
app.put('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const { employee_number, name, department_id, display_order } = req.body;

  if (!employee_number || !name || !department_id) {
    return res.status(400).json({ error: '社員番号、名前、部署IDは必須です' });
  }

  db.run(
    'UPDATE employees SET employee_number = ?, name = ?, department_id = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [employee_number, name, department_id, display_order || 0, id],
    function(err) {
      if (err) {
        console.error('社員更新エラー:', err);
        res.status(500).json({ error: '社員の更新に失敗しました' });
      } else if (this.changes === 0) {
        res.status(404).json({ error: '社員が見つかりません' });
      } else {
        res.json({ 
          id: parseInt(id), 
          employee_number, 
          name, 
          department_id, 
          display_order: display_order || 0 
        });
      }
    }
  );
});

// 社員削除
app.delete('/api/employees/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM employees WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('社員削除エラー:', err);
      res.status(500).json({ error: '社員の削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '社員が見つかりません' });
    } else {
      res.json({ message: '社員を削除しました' });
    }
  });
});

// 社員順序一括更新
app.put('/api/employees/order/update', (req, res) => {
  const { orders } = req.body;

  if (!orders || !Array.isArray(orders)) {
    return res.status(400).json({ error: '無効な順序データです' });
  }

  console.log('社員順序更新リクエスト:', orders);

  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('トランザクション開始エラー:', err);
      res.status(500).json({ error: '社員順序の更新に失敗しました' });
    } else {
      let completed = 0;
      let hasError = false;

      orders.forEach(({ id, display_order }) => {
        db.run('UPDATE employees SET display_order = ? WHERE id = ?', [display_order, id], (err) => {
          if (err) {
            console.error('社員順序更新エラー:', err);
            hasError = true;
          }
          completed++;
          
          if (completed === orders.length) {
            if (hasError) {
              db.run('ROLLBACK');
              res.status(500).json({ error: '社員順序の更新に失敗しました' });
            } else {
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('トランザクションコミットエラー:', err);
                  res.status(500).json({ error: '社員順序の更新に失敗しました' });
                } else {
                  console.log('社員順序更新成功');
                  res.json({ message: '社員順序を更新しました' });
                }
              });
            }
          }
        });
      });
    }
  });
});

// スケジュール一覧取得（基本）
app.get('/api/schedules', (req, res) => {
  const { employee_id, department_id, start_date, end_date } = req.query;
  
  let query = `
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1=1
  `;
  const queryParams = [];
  
  if (employee_id) {
    query += ' AND s.employee_id = ?';
    queryParams.push(parseInt(employee_id));
  }
  if (department_id) {
    query += ' AND e.department_id = ?';
    queryParams.push(parseInt(department_id));
  }
  if (start_date) {
    query += ' AND s.start_datetime >= ?';
    queryParams.push(new Date(start_date).toISOString());
  }
  if (end_date) {
    query += ' AND s.end_datetime <= ?';
    queryParams.push(new Date(end_date).toISOString());
  }
  
  query += ' ORDER BY s.start_datetime';
  
  db.all(query, queryParams, (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    } else {
      res.json(rows || []);
    }
  });
});

// スケジュール一覧取得（月別）
app.get('/api/schedules/monthly/:employeeId/:year/:month', (req, res) => {
  const { employeeId, year, month } = req.params;
  
  console.log(`月別スケジュール取得: employeeId=${employeeId}, year=${year}, month=${month}`);

  // 月初(JST)と翌月月初(JST)をUTCに変換して範囲に使用
  const yearNum = Number(year);
  const monthNum = Number(month);
  const startJst = new Date(`${yearNum}-${String(monthNum).padStart(2, '0')}-01T00:00:00.000+09:00`);
  const nextMonthJst = new Date(startJst);
  nextMonthJst.setMonth(nextMonthJst.getMonth() + 1); // 翌月JST 00:00（排他的上限）
  
  console.log(`検索期間 (JST基準→UTC): ${startJst.toISOString()} ～ ${nextMonthJst.toISOString()}(exclusive)`);

  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE s.employee_id = ? AND (
      (typeof(s.start_datetime) = 'text' AND typeof(s.end_datetime) = 'text' AND s.start_datetime < ? AND s.end_datetime > ?) OR
      (typeof(s.start_datetime) = 'integer' AND typeof(s.end_datetime) = 'integer' AND s.start_datetime < ? AND s.end_datetime > ?)
    )
    ORDER BY s.start_datetime
  `, [
    employeeId,
    nextMonthJst.toISOString(), startJst.toISOString(),
    nextMonthJst.getTime(), startJst.getTime()
  ], (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      console.log(`取得されたスケジュール数: ${rows.length}`);
      console.log('取得されたスケジュール:', rows);
      res.json(rows);
    }
  });
});

// スケジュール一覧取得（日別：全体）
app.get('/api/schedules/daily/:date', (req, res) => {
  const { date } = req.params;

  // 指定日のJST 00:00～24:00 をUTCに変換して範囲比較
  const startJst = new Date(`${date}T00:00:00.000+09:00`);
  const endJstExclusive = new Date(startJst.getTime());
  endJstExclusive.setDate(endJstExclusive.getDate() + 1); // 翌日JST 00:00（排他的上限）

  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE (
      (typeof(s.start_datetime) = 'text' AND typeof(s.end_datetime) = 'text' AND s.start_datetime < ? AND s.end_datetime > ?) OR
      (typeof(s.start_datetime) = 'integer' AND typeof(s.end_datetime) = 'integer' AND s.start_datetime < ? AND s.end_datetime > ?)
    )
    ORDER BY e.display_order, e.id, s.start_datetime
  `, [
    endJstExclusive.toISOString(), startJst.toISOString(),
    endJstExclusive.getTime(), startJst.getTime()
  ], (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// スケジュール一覧取得（日別・部署別）
app.get('/api/schedules/daily/department/:departmentId/:date', (req, res) => {
  const { departmentId, date } = req.params;
  
  console.log(`部署別スケジュール取得: departmentId=${departmentId}, date=${date}`);

  // 日付の開始と終了（JST）をUTCに変換して比較
  const startJst = new Date(`${date}T00:00:00.000+09:00`);
  const endJstExclusive = new Date(startJst.getTime());
  endJstExclusive.setDate(endJstExclusive.getDate() + 1); // 翌日JST 00:00（排他的上限）
  
  console.log(`検索期間 (JST基準→UTC): ${startJst.toISOString()} ～ ${endJstExclusive.toISOString()}(exclusive)`);

  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE d.id = ? AND (
      (typeof(s.start_datetime) = 'text' AND typeof(s.end_datetime) = 'text' AND s.start_datetime < ? AND s.end_datetime > ?) OR
      (typeof(s.start_datetime) = 'integer' AND typeof(s.end_datetime) = 'integer' AND s.start_datetime < ? AND s.end_datetime > ?)
    )
    ORDER BY e.display_order, e.id, s.start_datetime
  `, [departmentId, endJstExclusive.toISOString(), startJst.toISOString(), endJstExclusive.getTime(), startJst.getTime()], (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      console.log(`取得されたスケジュール数: ${rows.length}`);
      console.log('取得されたスケジュール:', rows);
      res.json(rows);
    }
  });
});

// スケジュール一覧取得（日別・全社員）
app.get('/api/schedules/daily/all/:date', (req, res) => {
  const { date } = req.params;
  
  // 日付の開始と終了（JST）をUTCに変換して比較
  const startJst = new Date(`${date}T00:00:00.000+09:00`);
  const endJstExclusive = new Date(startJst.getTime());
  endJstExclusive.setDate(endJstExclusive.getDate() + 1); // 翌日JST 00:00（排他的上限）

  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE (
      (typeof(s.start_datetime) = 'text' AND s.start_datetime >= ? AND s.start_datetime < ?) OR
      (typeof(s.start_datetime) = 'integer' AND s.start_datetime >= ? AND s.start_datetime < ?)
    )
    ORDER BY e.display_order, e.id, s.start_datetime
  `, [startJst.toISOString(), endJstExclusive.toISOString(), startJst.getTime(), endJstExclusive.getTime()], (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// スケジュール一覧取得（月別・全社員）
app.get('/api/schedules/monthly/all/:year/:month', (req, res) => {
  const { year, month } = req.params;
  
  console.log(`月別全社員スケジュール取得: year=${year}, month=${month}`);

  // 月初(JST)と翌月月初(JST)をUTCに変換して範囲に使用
  const yearNum = Number(year);
  const monthNum = Number(month);
  const startJst = new Date(`${yearNum}-${String(monthNum).padStart(2, '0')}-01T00:00:00.000+09:00`);
  const nextMonthJst = new Date(startJst);
  nextMonthJst.setMonth(nextMonthJst.getMonth() + 1); // 翌月JST 00:00（排他的上限）
  
  console.log(`検索期間 (JST基準→UTC): ${startJst.toISOString()} ～ ${nextMonthJst.toISOString()}(exclusive)`);

  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE (
      (typeof(s.start_datetime) = 'text' AND typeof(s.end_datetime) = 'text' AND s.start_datetime < ? AND s.end_datetime > ?) OR
      (typeof(s.start_datetime) = 'integer' AND typeof(s.end_datetime) = 'integer' AND s.start_datetime < ? AND s.end_datetime > ?)
    )
    ORDER BY e.display_order, e.id, s.start_datetime
  `, [
    nextMonthJst.toISOString(), startJst.toISOString(),
    nextMonthJst.getTime(), startJst.getTime()
  ], (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      console.log(`取得されたスケジュール数: ${rows.length}`);
      console.log('取得されたスケジュール:', rows);
      res.json(rows);
    }
  });
});

// スケジュール一覧取得（月別・部署別）
app.get('/api/schedules/monthly/department/:departmentId/:year/:month', (req, res) => {
  const { departmentId, year, month } = req.params;
  
  console.log(`月別部署別スケジュール取得: departmentId=${departmentId}, year=${year}, month=${month}`);

  // 月初(JST)と翌月月初(JST)をUTCに変換して範囲に使用
  const yearNum = Number(year);
  const monthNum = Number(month);
  const startJst = new Date(`${yearNum}-${String(monthNum).padStart(2, '0')}-01T00:00:00.000+09:00`);
  const nextMonthJst = new Date(startJst);
  nextMonthJst.setMonth(nextMonthJst.getMonth() + 1); // 翌月JST 00:00（排他的上限）
  
  console.log(`検索期間 (JST基準→UTC): ${startJst.toISOString()} ～ ${nextMonthJst.toISOString()}(exclusive)`);

  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE d.id = ? AND (
      (typeof(s.start_datetime) = 'text' AND s.start_datetime >= ? AND s.start_datetime < ?) OR
      (typeof(s.start_datetime) = 'integer' AND s.start_datetime >= ? AND s.start_datetime < ?)
    )
    ORDER BY e.display_order, e.id, s.start_datetime
  `, [
    departmentId,
    startJst.toISOString(), nextMonthJst.toISOString(),
    startJst.getTime(), nextMonthJst.getTime()
  ], (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      console.log(`取得されたスケジュール数: ${rows.length}`);
      console.log('取得されたスケジュール:', rows);
      res.json(rows);
    }
  });
});

// デバッグ用：全スケジュール取得
app.get('/api/schedules/debug', (req, res) => {
  db.all(`
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    ORDER BY s.start_datetime
  `, (err, rows) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else {
      console.log(`デバッグ: 全スケジュール数: ${rows.length}`);
      console.log('デバッグ: 全スケジュール:', rows);
      res.json(rows);
    }
  });
});

// デバッグ用：部署一覧取得
app.get('/api/departments/debug', (req, res) => {
  db.all('SELECT * FROM departments ORDER BY display_order, id', (err, rows) => {
    if (err) {
      console.error('部署取得エラー:', err);
      res.status(500).json({ error: '部署の取得に失敗しました' });
    } else {
      console.log('デバッグ: 部署一覧:', rows);
      res.json(rows);
    }
  });
});

// デバッグ用：社員一覧取得
app.get('/api/employees/debug', (req, res) => {
  db.all(`
    SELECT e.*, d.name as department_name 
    FROM employees e 
    LEFT JOIN departments d ON e.department_id = d.id 
    ORDER BY e.display_order, e.id
  `, (err, rows) => {
    if (err) {
      console.error('社員取得エラー:', err);
      res.status(500).json({ error: '社員の取得に失敗しました' });
    } else {
      console.log('デバッグ: 社員一覧:', rows);
      res.json(rows);
    }
  });
});

// スケジュール作成
app.post('/api/schedules', (req, res) => {
  const { employee_id, title, start_datetime, end_datetime, color } = req.body;

  if (!employee_id || !title || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  db.run(
    'INSERT INTO schedules (employee_id, title, start_datetime, end_datetime, color) VALUES (?, ?, ?, ?, ?)',
    [employee_id, title, start_datetime, end_datetime, color || '#3174ad'],
    function(err) {
      if (err) {
        console.error('スケジュール作成エラー:', err);
        res.status(500).json({ error: 'スケジュールの作成に失敗しました' });
      } else {
        res.json({ 
          id: this.lastID, 
          employee_id, 
          title, 
          start_datetime, 
          end_datetime, 
          color: color || '#3174ad' 
        });
      }
    }
  );
});

// スケジュール更新
app.put('/api/schedules/:id', (req, res) => {
  const { id } = req.params;
  const { employee_id, title, start_datetime, end_datetime, color } = req.body;

  console.log('PUT /api/schedules/:id - Request body:', req.body);
  console.log('PUT /api/schedules/:id - ID:', id);

  if (!employee_id || !start_datetime || !end_datetime) {
    console.log('PUT /api/schedules/:id - Missing required fields:', { employee_id, start_datetime, end_datetime });
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  db.run(
    'UPDATE schedules SET employee_id = ?, title = ?, start_datetime = ?, end_datetime = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [employee_id, title || '', start_datetime, end_datetime, color || '#3174ad', id],
    function(err) {
      if (err) {
        console.error('スケジュール更新エラー:', err);
        res.status(500).json({ error: 'スケジュールの更新に失敗しました' });
      } else if (this.changes === 0) {
        console.log('PUT /api/schedules/:id - No rows updated');
        res.status(404).json({ error: 'スケジュールが見つかりません' });
      } else {
        console.log('PUT /api/schedules/:id - Successfully updated');
        res.json({ 
          id: parseInt(id), 
          employee_id, 
          title, 
          start_datetime, 
          end_datetime, 
          color: color || '#3174ad' 
        });
      }
    }
  );
});

// スケジュール削除
app.delete('/api/schedules/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM schedules WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('スケジュール削除エラー:', err);
      res.status(500).json({ error: 'スケジュールの削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'スケジュールが見つかりません' });
    } else {
      res.json({ message: 'スケジュールを削除しました' });
    }
  });
});

// スケジュールコピー
app.post('/api/schedules/:id/copy', (req, res) => {
  const { id } = req.params;
  const { target_employee_id, target_start_datetime } = req.body;

  if (!target_employee_id || !target_start_datetime) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  // 元のスケジュールを取得
  db.get('SELECT * FROM schedules WHERE id = ?', [id], (err, originalSchedule) => {
    if (err) {
      console.error('スケジュール取得エラー:', err);
      res.status(500).json({ error: 'スケジュールの取得に失敗しました' });
    } else if (!originalSchedule) {
      res.status(404).json({ error: 'スケジュールが見つかりません' });
    } else {
      // 新しい開始・終了時間を計算
      const originalStart = new Date(originalSchedule.start_datetime);
      const originalEnd = new Date(originalSchedule.end_datetime);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newStart = new Date(target_start_datetime);
      const newEnd = new Date(newStart.getTime() + duration);

      // 新しいスケジュールを作成
      db.run(
        'INSERT INTO schedules (employee_id, title, start_datetime, end_datetime, color) VALUES (?, ?, ?, ?, ?)',
        [target_employee_id, originalSchedule.title, newStart.toISOString(), newEnd.toISOString(), originalSchedule.color],
        function(err) {
          if (err) {
            console.error('スケジュールコピーエラー:', err);
            res.status(500).json({ error: 'スケジュールのコピーに失敗しました' });
          } else {
            res.json({ 
              id: this.lastID, 
              employee_id: target_employee_id, 
              title: originalSchedule.title, 
              start_datetime: newStart.toISOString(), 
              end_datetime: newEnd.toISOString(), 
              color: originalSchedule.color 
            });
          }
        }
      );
    }
  });
});

// スケジュール競合チェック
app.post('/api/schedules/check-conflict', (req, res) => {
  const { employee_id, start_datetime, end_datetime, exclude_id } = req.body;

  if (!employee_id || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  let query = `
    SELECT s.*, e.name as employee_name, d.name as department_name
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE s.employee_id = ? AND (
      (s.start_datetime < ? AND s.end_datetime > ?) OR
      (s.start_datetime < ? AND s.end_datetime > ?) OR
      (s.start_datetime >= ? AND s.end_datetime <= ?)
    )
  `;
  
  let params = [employee_id, end_datetime, start_datetime, end_datetime, start_datetime, start_datetime, end_datetime];

  if (exclude_id) {
    query += ' AND s.id != ?';
    params.push(exclude_id);
  }

  query += ' ORDER BY s.start_datetime';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('スケジュール競合チェックエラー:', err);
      res.status(500).json({ error: 'スケジュール競合チェックに失敗しました' });
    } else {
      const hasConflict = rows.length > 0;
      res.json({ hasConflict, conflicts: rows });
    }
  });
});

// 設備一覧取得
app.get('/api/equipment', (req, res) => {
  db.all('SELECT * FROM equipment ORDER BY display_order, id', (err, rows) => {
    if (err) {
      console.error('設備取得エラー:', err);
      res.status(500).json({ error: '設備の取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// 設備作成
app.post('/api/equipment', (req, res) => {
  const { name, display_order } = req.body;

  if (!name) {
    return res.status(400).json({ error: '設備名は必須です' });
  }

  db.run(
    'INSERT INTO equipment (name, display_order) VALUES (?, ?)',
    [name, display_order || 0],
    function(err) {
      if (err) {
        console.error('設備作成エラー:', err);
        res.status(500).json({ error: '設備の作成に失敗しました' });
      } else {
        res.json({ id: this.lastID, name, display_order: display_order || 0 });
      }
    }
  );
});

// 設備更新
app.put('/api/equipment/:id', (req, res) => {
  const { id } = req.params;
  const { name, display_order } = req.body;

  if (!name) {
    return res.status(400).json({ error: '設備名は必須です' });
  }

  db.run(
    'UPDATE equipment SET name = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, display_order || 0, id],
    function(err) {
      if (err) {
        console.error('設備更新エラー:', err);
        res.status(500).json({ error: '設備の更新に失敗しました' });
      } else if (this.changes === 0) {
        res.status(404).json({ error: '設備が見つかりません' });
      } else {
        res.json({ id: parseInt(id), name, display_order: display_order || 0 });
      }
    }
  );
});

// 設備削除
app.delete('/api/equipment/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM equipment WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('設備削除エラー:', err);
      res.status(500).json({ error: '設備の削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '設備が見つかりません' });
    } else {
      res.json({ message: '設備を削除しました' });
    }
  });
});

// 設備移動
app.put('/api/equipment/:id/move', (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;

  if (!direction || !['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: '無効な移動方向です' });
  }

  // 現在の設備を取得
  db.get('SELECT * FROM equipment WHERE id = ?', [id], (err, currentEquipment) => {
    if (err) {
      console.error('設備取得エラー:', err);
      res.status(500).json({ error: '設備の取得に失敗しました' });
    } else if (!currentEquipment) {
      res.status(404).json({ error: '設備が見つかりません' });
    } else {
      // 移動先の設備を取得
      let targetQuery;
      if (direction === 'up') {
        targetQuery = 'SELECT * FROM equipment WHERE display_order < ? ORDER BY display_order DESC LIMIT 1';
      } else {
        targetQuery = 'SELECT * FROM equipment WHERE display_order > ? ORDER BY display_order ASC LIMIT 1';
      }

      db.get(targetQuery, [currentEquipment.display_order], (err, targetEquipment) => {
        if (err) {
          console.error('移動先設備取得エラー:', err);
          res.status(500).json({ error: '移動先設備の取得に失敗しました' });
        } else if (!targetEquipment) {
          res.status(400).json({ error: '移動先が見つかりません' });
        } else {
          // 順序を交換
          db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
              console.error('トランザクション開始エラー:', err);
              res.status(500).json({ error: '設備の移動に失敗しました' });
            } else {
              db.run('UPDATE equipment SET display_order = ? WHERE id = ?', [targetEquipment.display_order, currentEquipment.id], (err) => {
                if (err) {
                  console.error('設備更新エラー:', err);
                  db.run('ROLLBACK');
                  res.status(500).json({ error: '設備の移動に失敗しました' });
                } else {
                  db.run('UPDATE equipment SET display_order = ? WHERE id = ?', [currentEquipment.display_order, targetEquipment.id], (err) => {
                    if (err) {
                      console.error('設備更新エラー:', err);
                      db.run('ROLLBACK');
                      res.status(500).json({ error: '設備の移動に失敗しました' });
                    } else {
                      db.run('COMMIT', (err) => {
                        if (err) {
                          console.error('トランザクションコミットエラー:', err);
                          res.status(500).json({ error: '設備の移動に失敗しました' });
                        } else {
                          res.json({ message: '設備を移動しました' });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
});

// 設備順序一括更新
app.put('/api/equipment/order/update', (req, res) => {
  const { orders } = req.body;

  if (!orders || !Array.isArray(orders)) {
    return res.status(400).json({ error: '無効な順序データです' });
  }

  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('トランザクション開始エラー:', err);
      res.status(500).json({ error: '設備順序の更新に失敗しました' });
    } else {
      let completed = 0;
      let hasError = false;

      orders.forEach(({ id, display_order }) => {
        db.run('UPDATE equipment SET display_order = ? WHERE id = ?', [display_order, id], (err) => {
          if (err) {
            console.error('設備順序更新エラー:', err);
            hasError = true;
          }
          completed++;
          
          if (completed === orders.length) {
            if (hasError) {
              db.run('ROLLBACK');
              res.status(500).json({ error: '設備順序の更新に失敗しました' });
            } else {
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('トランザクションコミットエラー:', err);
                  res.status(500).json({ error: '設備順序の更新に失敗しました' });
                } else {
                  res.json({ message: '設備順序を更新しました' });
                }
              });
            }
          }
        });
      });
    }
  });
});

// 設備予約一覧取得
app.get('/api/equipment-reservations', (req, res) => {
  const { equipment_id, employee_id, start_date, end_date } = req.query;

  let query = `
    SELECT er.*, e.name as equipment_name, emp.name as employee_name, emp.employee_number
    FROM equipment_reservations er
    LEFT JOIN equipment e ON er.equipment_id = e.id
    LEFT JOIN employees emp ON er.employee_id = emp.id
    WHERE 1=1
  `;
  const params = [];

  if (equipment_id) {
    query += ' AND er.equipment_id = ?';
    params.push(equipment_id);
  }

  if (employee_id) {
    query += ' AND er.employee_id = ?';
    params.push(employee_id);
  }

  // 日付フィルタ: 指定日のJST 00:00 ～ 翌日JST 00:00(排他的) と重なる予約を取得
  if (start_date && end_date) {
    try {
      const startStr = String(start_date);
      // JST の日境界を UTC に変換
      const startJst = new Date(`${startStr}T00:00:00.000+09:00`);
      const endJstExclusive = new Date(startJst.getTime());
      endJstExclusive.setDate(endJstExclusive.getDate() + 1);

      query += ` AND (
        (typeof(er.start_datetime) = 'text' AND typeof(er.end_datetime) = 'text' AND er.start_datetime < ? AND er.end_datetime > ?)
        OR
        (typeof(er.start_datetime) = 'integer' AND typeof(er.end_datetime) = 'integer' AND er.start_datetime < ? AND er.end_datetime > ?)
      )`;

      params.push(
        endJstExclusive.toISOString(), startJst.toISOString(),
        endJstExclusive.getTime(), startJst.getTime()
      );
    } catch (e) {
      console.warn('設備予約 日付フィルタの解析に失敗:', e);
    }
  }

  query += ' ORDER BY er.start_datetime';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('設備予約取得エラー:', err);
      res.status(500).json({ error: '設備予約の取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// 設備予約一覧取得（月別）
app.get('/api/equipment-reservations/monthly/:equipmentId/:year/:month', (req, res) => {
  const { equipmentId, year, month } = req.params;
  const startDate = `${year}-${month.padStart(2, '0')}-01`;
  const endDate = `${year}-${month.padStart(2, '0')}-31`;

  db.all(`
    SELECT er.*, e.name as equipment_name
    FROM equipment_reservations er
    LEFT JOIN equipment e ON er.equipment_id = e.id
    WHERE er.equipment_id = ? AND er.start_datetime >= ? AND er.start_datetime <= ?
    ORDER BY er.start_datetime
  `, [equipmentId, startDate, endDate], (err, rows) => {
    if (err) {
      console.error('設備予約取得エラー:', err);
      res.status(500).json({ error: '設備予約の取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

// 設備予約作成
app.post('/api/equipment-reservations', (req, res) => {
  const { equipment_id, employee_id, purpose, title, start_datetime, end_datetime, color } = req.body;

  console.log('設備予約作成リクエスト:', req.body);

  // purpose または title のどちらかがあればOK（後方互換性のため）
  const reservationTitle = purpose || title;

  if (!equipment_id || !employee_id || !reservationTitle || !start_datetime || !end_datetime) {
    console.log('必須項目不足:', { equipment_id, employee_id, purpose, title, reservationTitle, start_datetime, end_datetime });
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  // 重複チェック（オプション - 環境変数で制御）
  const skipConflictCheck = process.env.SKIP_CONFLICT_CHECK === 'true' || true; // デフォルトでスキップ
  
  if (skipConflictCheck) {
    // 重複チェックをスキップして直接登録
    console.log('重複チェックをスキップして登録実行');
    createReservation();
  } else {
    // 重複チェック実行
    checkConflictAndCreate();
  }

  function createReservation() {
    db.run(
        'INSERT INTO equipment_reservations (equipment_id, employee_id, purpose, start_datetime, end_datetime, color) VALUES (?, ?, ?, ?, ?, ?)',
        [equipment_id, employee_id, reservationTitle, start_datetime, end_datetime, color || '#3174ad'],
        function(err) {
          if (err) {
            console.error('設備予約作成エラー:', err);
            res.status(500).json({ error: '設備予約の作成に失敗しました' });
          } else {
            console.log('設備予約作成成功:', this.lastID);
            res.json({ 
              id: this.lastID, 
              equipment_id, 
              employee_id,
              title: reservationTitle,
              purpose: reservationTitle,
              start_datetime, 
              end_datetime, 
              color: color || '#3174ad' 
            });
          }
        }
      );
  }

  async function checkConflictAndCreate() {
    try {
      console.log('🚨 新規設備予約 - 重複チェック開始');
      
      // 厳格な重複チェック（共通関数を使用）
      const conflicts = await dbFindConflicts(equipment_id, start_datetime, end_datetime);
      
      if (conflicts.length > 0) {
        console.error('🚨 新規設備予約 - 重複検出！', {
          equipmentId: equipment_id,
          requestedTime: { start: start_datetime, end: end_datetime },
          conflictingReservations: conflicts.map(c => ({
            id: c.id,
            purpose: c.purpose,
            start: c.start_datetime,
            end: c.end_datetime,
            employee_id: c.employee_id
          }))
        });
        
        return res.status(409).json({
          error: 'EQUIPMENT_CONFLICT',
          message: `設備ID ${equipment_id} は指定された時間帯に既に予約されています`,
          details: {
            equipmentId: equipment_id,
            requestedTimeRange: {
              start: start_datetime,
              end: end_datetime
            },
            conflictingReservations: conflicts.map(c => ({
              id: c.id,
              purpose: c.purpose,
              timeRange: {
                start: c.start_datetime,
                end: c.end_datetime
              },
              employeeId: c.employee_id
            }))
          },
          conflicting: conflicts
        });
      }

      console.log('✅ 新規設備予約 - 重複チェック完了（重複なし）');
      
      // 重複なし、登録実行
      createReservation();
      
    } catch (error) {
      console.error('❌ 新規設備予約 - 重複チェックエラー:', error);
      res.status(500).json({ error: '重複チェックに失敗しました' });
    }
  }
});

// 設備予約更新（堅牢化版）
app.put('/api/equipment-reservations/:id', async (req, res) => {
  const id = Number(req.params.id);
  
  console.log('🔄 PUT /equipment-reservations/:id called', {
    id,
    body: req.body,
    bodyKeys: Object.keys(req.body)
  });
  
  try {
    // ID検証
    if (!Number.isFinite(id)) {
      console.error('❌ Invalid ID:', id);
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Invalid id' 
      });
    }

    // 既存予約の存在確認
    console.log('🔍 Checking existing reservation:', id);
    const existing = await dbGetReservationById(id);
    console.log('🔍 Existing reservation:', existing);
    
    if (!existing) {
      console.error('❌ Reservation not found:', id);
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Reservation ${id} not found` 
      });
    }

    // 部分更新対応：既存データとマージ
    const merged = {
      purpose: req.body.purpose ?? req.body.title ?? existing.purpose,
      equipment_id: req.body.equipment_id ?? existing.equipment_id,
      employee_id: req.body.employee_id ?? existing.employee_id,
      start_datetime: req.body.start_datetime ?? existing.start_datetime,
      end_datetime: req.body.end_datetime ?? existing.end_datetime,
      color: req.body.color ?? existing.color ?? '#3174ad'
    };
    
    console.log('🔍 Merged data:', merged);

    // 日時形式の検証と変換
    console.log('🔍 Converting datetime:', {
      start_input: merged.start_datetime,
      end_input: merged.end_datetime
    });
    
    const startSql = toSqlUtc(merged.start_datetime);
    const endSql = toSqlUtc(merged.end_datetime);
    
    console.log('🔍 Converted datetime:', {
      start_sql: startSql,
      end_sql: endSql
    });
    
    if (!startSql || !endSql) {
      console.error('❌ Invalid datetime format:', {
        start_input: merged.start_datetime,
        end_input: merged.end_datetime,
        start_sql: startSql,
        end_sql: endSql
      });
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Invalid datetime format',
        details: {
          start_input: merged.start_datetime,
          end_input: merged.end_datetime,
          start_sql: startSql,
          end_sql: endSql
        }
      });
    }

    // 時間の妥当性チェック
    if (!dayjs(endSql).isAfter(dayjs(startSql))) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'end must be after start' 
      });
    }

    // 必須項目チェック
    if (!merged.equipment_id || !merged.employee_id) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'equipment_id and employee_id are required' 
      });
    }

    // 重複チェック（半開区間 [start, end)）- 厳格版
    console.log('🚨 設備重複チェック実行中...');
    const conflicts = await dbFindConflicts(merged.equipment_id, startSql, endSql, id);
    
    if (conflicts.length > 0) {
      console.error('🚨 設備重複検出！', {
        equipmentId: merged.equipment_id,
        requestedTime: { start: startSql, end: endSql },
        conflictingReservations: conflicts.map(c => ({
          id: c.id,
          purpose: c.purpose,
          start: c.start_datetime,
          end: c.end_datetime,
          employee_id: c.employee_id
        }))
      });
      
      return res.status(409).json({
        error: 'EQUIPMENT_CONFLICT',
        message: `設備ID ${merged.equipment_id} は指定された時間帯に既に予約されています`,
        details: {
          equipmentId: merged.equipment_id,
          requestedTimeRange: {
            start: startSql,
            end: endSql
          },
          conflictingReservations: conflicts.map(c => ({
            id: c.id,
            purpose: c.purpose,
            timeRange: {
              start: c.start_datetime,
              end: c.end_datetime
            },
            employeeId: c.employee_id
          }))
        },
        conflicting: conflicts
      });
    }
    
    console.log('✅ 設備重複チェック完了 - 重複なし');

    // 更新実行
    console.log('🔍 Executing database update:', {
      equipment_id: merged.equipment_id,
      employee_id: merged.employee_id,
      purpose: merged.purpose,
      start_datetime: startSql,
      end_datetime: endSql,
      color: merged.color,
      id: id
    });
    
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE equipment_reservations SET equipment_id = ?, employee_id = ?, purpose = ?, start_datetime = ?, end_datetime = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [merged.equipment_id, merged.employee_id, merged.purpose, startSql, endSql, merged.color, id],
        function(err) {
          if (err) {
            console.error('❌ Database update error:', err);
            reject(err);
          } else if (this.changes === 0) {
            console.error('❌ No rows updated for id:', id);
            reject(new Error('No rows updated'));
          } else {
            console.log('✅ Database update successful, changes:', this.changes);
            resolve();
          }
        }
      );
    });

    // 更新後のデータを取得して返却
    const updated = await dbGetReservationById(id);
    return res.json(updated);

  } catch (err) {
    console.error('PUT /equipment-reservations error:', err);
    console.error('Request body:', req.body);
    console.error('Request params:', req.params);
    console.error('Stack trace:', err.stack);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'Unknown error',
      code: err.code || null,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// 設備予約削除
app.delete('/api/equipment-reservations/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM equipment_reservations WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('設備予約削除エラー:', err);
      res.status(500).json({ error: '設備予約の削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '設備予約が見つかりません' });
    } else {
      res.json({ message: '設備予約を削除しました' });
    }
  });
});

// 設備予約コピー
app.post('/api/equipment-reservations/:id/copy', (req, res) => {
  const { id } = req.params;
  const { target_equipment_id, target_start_datetime } = req.body;

  if (!target_equipment_id || !target_start_datetime) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  // 元の設備予約を取得
  db.get('SELECT * FROM equipment_reservations WHERE id = ?', [id], (err, originalReservation) => {
    if (err) {
      console.error('設備予約取得エラー:', err);
      res.status(500).json({ error: '設備予約の取得に失敗しました' });
    } else if (!originalReservation) {
      res.status(404).json({ error: '設備予約が見つかりません' });
    } else {
      // 新しい開始・終了時間を計算
      const originalStart = new Date(originalReservation.start_datetime);
      const originalEnd = new Date(originalReservation.end_datetime);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newStart = new Date(target_start_datetime);
      const newEnd = new Date(newStart.getTime() + duration);

      // 新しい設備予約を作成
      db.run(
        'INSERT INTO equipment_reservations (equipment_id, employee_id, title, start_datetime, end_datetime, color) VALUES (?, ?, ?, ?, ?, ?)',
        [target_equipment_id, originalReservation.employee_id, originalReservation.title, newStart.toISOString(), newEnd.toISOString(), originalReservation.color],
        function(err) {
          if (err) {
            console.error('設備予約コピーエラー:', err);
            res.status(500).json({ error: '設備予約のコピーに失敗しました' });
          } else {
            res.json({ 
              id: this.lastID, 
              equipment_id: target_equipment_id, 
              employee_id: originalReservation.employee_id,
              purpose: originalReservation.purpose, 
              start_datetime: newStart.toISOString(), 
              end_datetime: newEnd.toISOString(), 
              color: originalReservation.color 
            });
          }
        }
      );
    }
  });
});

// 設備予約競合チェック
app.post('/api/equipment-reservations/check-conflict', (req, res) => {
  const { equipment_id, start_datetime, end_datetime, exclude_id } = req.body;

  if (!equipment_id || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  let query = `
    SELECT er.*, e.name as equipment_name
    FROM equipment_reservations er
    LEFT JOIN equipment e ON er.equipment_id = e.id
    WHERE er.equipment_id = ? AND (
      (er.start_datetime < ? AND er.end_datetime > ?) OR
      (er.start_datetime < ? AND er.end_datetime > ?) OR
      (er.start_datetime >= ? AND er.end_datetime <= ?)
    )
  `;
  
  let params = [equipment_id, end_datetime, start_datetime, end_datetime, start_datetime, start_datetime, end_datetime];

  if (exclude_id) {
    query += ' AND er.id != ?';
    params.push(exclude_id);
  }

  query += ' ORDER BY er.start_datetime';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('設備予約競合チェックエラー:', err);
      res.status(500).json({ error: '設備予約競合チェックに失敗しました' });
    } else {
      const hasConflict = rows.length > 0;
      res.json({ hasConflict, conflicts: rows });
    }
  });
});

// 祝日API
app.get('/api/holidays/:year', (req, res) => {
  const { year } = req.params;
  
  // 日本の祝日データ（2024年）
  const HOLIDAYS_2024 = [
    { date: '2024-01-01', name: '元日' },
    { date: '2024-01-08', name: '成人の日' },
    { date: '2024-02-11', name: '建国記念の日' },
    { date: '2024-02-12', name: '振替休日' },
    { date: '2024-02-23', name: '天皇誕生日' },
    { date: '2024-03-20', name: '春分の日' },
    { date: '2024-04-29', name: '昭和の日' },
    { date: '2024-05-03', name: '憲法記念日' },
    { date: '2024-05-04', name: 'みどりの日' },
    { date: '2024-05-05', name: 'こどもの日' },
    { date: '2024-05-06', name: '振替休日' },
    { date: '2024-07-15', name: '海の日' },
    { date: '2024-08-11', name: '山の日' },
    { date: '2024-08-12', name: '振替休日' },
    { date: '2024-09-16', name: '敬老の日' },
    { date: '2024-09-22', name: '秋分の日' },
    { date: '2024-09-23', name: '振替休日' },
    { date: '2024-10-14', name: 'スポーツの日' },
    { date: '2024-11-03', name: '文化の日' },
    { date: '2024-11-04', name: '振替休日' },
    { date: '2024-11-23', name: '勤労感謝の日' }
  ];

  // 日本の祝日データ（2025年）
  const HOLIDAYS_2025 = [
    { date: '2025-01-01', name: '元日' },
    { date: '2025-01-13', name: '成人の日' },
    { date: '2025-02-11', name: '建国記念の日' },
    { date: '2025-02-23', name: '天皇誕生日' },
    { date: '2025-02-24', name: '振替休日' },
    { date: '2025-03-21', name: '春分の日' },
    { date: '2025-04-29', name: '昭和の日' },
    { date: '2025-05-03', name: '憲法記念日' },
    { date: '2025-05-04', name: 'みどりの日' },
    { date: '2025-05-05', name: 'こどもの日' },
    { date: '2025-05-06', name: '振替休日' },
    { date: '2025-07-21', name: '海の日' },
    { date: '2025-08-11', name: '山の日' },
    { date: '2025-09-15', name: '敬老の日' },
    { date: '2025-09-23', name: '秋分の日' },
    { date: '2025-10-13', name: 'スポーツの日' },
    { date: '2025-11-03', name: '文化の日' },
    { date: '2025-11-23', name: '勤労感謝の日' },
    { date: '2025-11-24', name: '振替休日' }
  ];

  let holidays = [];
  if (year === '2024') {
    holidays = HOLIDAYS_2024;
  } else if (year === '2025') {
    holidays = HOLIDAYS_2025;
  }

  res.json(holidays);
});

// デバッグ用: 全スケジュール取得
app.get('/api/debug/schedules', (req, res) => {
  console.log('DEBUG: /api/debug/schedules called');
  db.all('SELECT * FROM schedules ORDER BY start_datetime', (err, rows) => {
    if (err) {
      console.error('DEBUG: Error fetching schedules:', err);
      res.status(500).json({ error: 'スケジュール取得エラー' });
    } else {
      console.log('DEBUG: All schedules in database:', rows);
      res.json(rows);
    }
  });
});

// デバッグ用: 全部署取得
app.get('/api/debug/departments', (req, res) => {
  console.log('DEBUG: /api/debug/departments called');
  db.all('SELECT * FROM departments', (err, rows) => {
    if (err) {
      console.error('DEBUG: Error fetching departments:', err);
      res.status(500).json({ error: '部署取得エラー' });
    } else {
      console.log('DEBUG: All departments in database:', rows);
      res.json(rows);
    }
  });
});

// デバッグ用: 全社員取得
app.get('/api/debug/employees', (req, res) => {
  console.log('DEBUG: /api/debug/employees called');
  db.all('SELECT * FROM employees', (err, rows) => {
    if (err) {
      console.error('DEBUG: Error fetching employees:', err);
      res.status(500).json({ error: '社員取得エラー' });
    } else {
      console.log('DEBUG: All employees in database:', rows);
      res.json(rows);
    }
  });
});

// テンプレート関連のAPI
app.get('/api/templates', (req, res) => {
  db.all('SELECT * FROM templates ORDER BY id', (err, rows) => {
    if (err) {
      console.error('テンプレート取得エラー:', err);
      res.status(500).json({ error: 'テンプレートの取得に失敗しました' });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/templates', (req, res) => {
  const { name, title, color } = req.body;
  
  if (!name || !title) {
    return res.status(400).json({ error: 'テンプレート名と件名は必須です' });
  }

  db.run(
    'INSERT INTO templates (name, title, color) VALUES (?, ?, ?)',
    [name, title, color || '#007bff'],
    function(err) {
      if (err) {
        console.error('テンプレート作成エラー:', err);
        res.status(500).json({ error: 'テンプレートの作成に失敗しました' });
      } else {
        res.json({ id: this.lastID, name, title, color: color || '#007bff' });
      }
    }
  );
});

app.put('/api/templates/:id', (req, res) => {
  const { id } = req.params;
  const { name, title, color } = req.body;

  if (!name || !title) {
    return res.status(400).json({ error: 'テンプレート名と件名は必須です' });
  }

  db.run(
    'UPDATE templates SET name = ?, title = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, title, color || '#007bff', id],
    function(err) {
      if (err) {
        console.error('テンプレート更新エラー:', err);
        res.status(500).json({ error: 'テンプレートの更新に失敗しました' });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'テンプレートが見つかりません' });
      } else {
        res.json({ id: parseInt(id), name, title, color: color || '#007bff' });
      }
    }
  );
});

app.delete('/api/templates/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM templates WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('テンプレート削除エラー:', err);
      res.status(500).json({ error: 'テンプレートの削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'テンプレートが見つかりません' });
    } else {
      res.json({ message: 'テンプレートを削除しました' });
    }
  });
});

// 静的ファイルの提供（APIルートの後に配置）
app.use(express.static(path.join(__dirname, 'client', 'build')));
app.use(express.static(path.join(__dirname, 'client', 'public')));

// SPA のルーティング対応（/api を除外）
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});