// 本番環境接続テスト用スクリプト
const axios = require('axios');

const testConnection = async () => {
  console.log('🌐 本番環境接続テスト開始...');
  console.log('📍 フロントエンド: http://localhost:3000');
  console.log('📍 バックエンド: https://zatint1991.com');
  console.log('');

  try {
    // 1. 直接API接続テスト
    console.log('1️⃣ 直接API接続テスト...');
    const directResponse = await axios.get('https://zatint1991.com/api/health', {
      timeout: 10000
    });
    console.log('✅ 直接接続成功:', directResponse.data);
    console.log('');

    // 2. プロキシ経由接続テスト
    console.log('2️⃣ プロキシ経由接続テスト...');
    try {
      const proxyResponse = await axios.get('http://localhost:3000/api/health', {
        timeout: 10000
      });
      console.log('✅ プロキシ接続成功:', proxyResponse.data);
    } catch (proxyError) {
      console.log('⚠️ プロキシ接続待機中（サーバー起動中の可能性）');
      console.log('   エラー:', proxyError.message);
    }
    console.log('');

    // 3. 主要エンドポイントテスト
    console.log('3️⃣ 主要エンドポイントテスト...');
    const endpoints = [
      '/api/departments',
      '/api/employees', 
      '/api/equipment',
      '/api/schedules'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`https://zatint1991.com${endpoint}`, {
          timeout: 5000
        });
        const dataLength = Array.isArray(response.data) ? response.data.length : 'unknown';
        console.log(`✅ ${endpoint}: ${dataLength} items`);
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || error.message}`);
      }
    }

    console.log('');
    console.log('🎉 本番環境接続テスト完了！');
    console.log('💡 ブラウザで http://localhost:3000 にアクセスして開発を開始してください。');

  } catch (error) {
    console.error('❌ 接続テスト失敗:', error.message);
    console.log('');
    console.log('🔧 確認事項:');
    console.log('   1. インターネット接続');
    console.log('   2. https://zatint1991.com の稼働状況');
    console.log('   3. ファイアウォール設定');
    console.log('   4. プロキシ設定（src/setupProxy.js）');
  }
};

// テスト実行
testConnection();
