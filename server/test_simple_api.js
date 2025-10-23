const http = require('http');

const payload = {
  title: 'APIテスト予約',
  purpose: 'APIテスト予約',
  equipment_id: 1,
  employee_id: 1,
  start_datetime: '2025-09-24T16:00:00',
  end_datetime: '2025-09-24T17:00:00',
  color: '#dc3545'
};

const postData = JSON.stringify(payload);

const options = {
  hostname: '127.0.0.1',
  port: 4002,
  path: '/api/equipment-reservations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('=== シンプルAPI登録テスト ===');
console.log('送信データ:', JSON.stringify(payload, null, 2));

const req = http.request(options, (res) => {
  console.log('ステータス:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('レスポンス:', data);
    try {
      const jsonData = JSON.parse(data);
      console.log('パースされたレスポンス:', JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log('JSON解析不可:', data);
    }
    
    // データベースを確認
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database('./scheduleboard.db');
    
    db.all('SELECT * FROM equipment_reservations WHERE start_datetime LIKE "2025-09-24%" ORDER BY id DESC LIMIT 5', (err, rows) => {
      if (err) {
        console.error('DB確認エラー:', err);
      } else {
        console.log('\n=== 登録後のDB確認（最新5件） ===');
        console.log('今日の予約件数:', rows.length);
        rows.forEach((row, index) => {
          console.log(`${index + 1}. ID: ${row.id} - ${row.purpose} (設備${row.equipment_id}) ${row.start_datetime.slice(11,16)}-${row.end_datetime.slice(11,16)}`);
        });
      }
      db.close();
    });
  });
});

req.on('error', (e) => {
  console.error('リクエストエラー:', e.message);
});

req.write(postData);
req.end();
