import { api } from '../lib/api';

/**
 * APIヘルスチェック機能
 * サーバーの接続状態を確認する
 */
export const healthCheck = async (): Promise<{
  success: boolean;
  status: number;
  message: string;
  responseTime: number;
}> => {
  const startTime = Date.now();
  
  try {
    const response = await api.get('/health');
    const responseTime = Date.now() - startTime;
    
    return {
      success: true,
      status: response.status,
      message: response.data?.message || 'OK',
      responseTime
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    return {
      success: false,
      status: error.response?.status || 0,
      message: error.response?.data?.error || error.message || 'Connection failed',
      responseTime
    };
  }
};

/**
 * ヘルスチェック結果をコンソールに出力
 */
export const logHealthCheck = async (): Promise<void> => {
  console.log('🔍 API Health Check starting...');
  console.log(`📍 Base URL: ${api.defaults.baseURL}`);
  console.log(`🔧 Environment: ${typeof import.meta !== 'undefined' ? 'Vite' : 'CRA'}`);
  
  const result = await healthCheck();
  
  if (result.success) {
    console.log(`✅ API Health Check: ${result.status} - ${result.message} (${result.responseTime}ms)`);
    console.log('🌐 Proxy configuration working correctly');
  } else {
    console.error(`❌ API Health Check failed: ${result.status} - ${result.message} (${result.responseTime}ms)`);
    console.log('💡 Check if proxy is configured correctly in package.json or vite.config.ts');
  }
};
