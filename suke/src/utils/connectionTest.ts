import { api } from '../api'

/**
 * バックエンド接続テスト
 */
export const testBackendConnection = async () => {
  console.log('🔍 Backend Connection Test Starting...')
  console.log(`📍 API Base URL: ${api.defaults.baseURL}`)
  console.log(`🌐 Current Origin: ${window.location.origin}`)
  
  try {
    // ヘルスチェック
    console.log('1️⃣ Testing health endpoint...')
    const healthResponse = await api.get('/health')
    console.log('✅ Health check successful:', healthResponse.data)
    
    // 部署データ取得テスト
    console.log('2️⃣ Testing departments endpoint...')
    const departmentsResponse = await api.get('/departments')
    console.log('✅ Departments data:', departmentsResponse.data?.length || 0, 'items')
    
    // 社員データ取得テスト
    console.log('3️⃣ Testing employees endpoint...')
    const employeesResponse = await api.get('/employees')
    console.log('✅ Employees data:', employeesResponse.data?.length || 0, 'items')
    
    // 設備データ取得テスト
    console.log('4️⃣ Testing equipment endpoint...')
    const equipmentResponse = await api.get('/equipment')
    console.log('✅ Equipment data:', equipmentResponse.data?.length || 0, 'items')
    
    // スケジュールデータ取得テスト
    console.log('5️⃣ Testing schedules endpoint...')
    const schedulesResponse = await api.get('/schedules')
    console.log('✅ Schedules data:', schedulesResponse.data?.length || 0, 'items')
    
    console.log('🎉 All backend connections successful!')
    
    return {
      success: true,
      data: {
        departments: departmentsResponse.data,
        employees: employeesResponse.data,
        equipment: equipmentResponse.data,
        schedules: schedulesResponse.data,
      }
    }
    
  } catch (error: any) {
    console.error('❌ Backend connection failed:', error.message)
    console.error('📊 Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
    })
    
    return {
      success: false,
      error: error.message,
      details: error.response || error
    }
  }
}

/**
 * プロキシ設定の確認
 */
export const checkProxyConfiguration = () => {
  console.log('🔧 Proxy Configuration Check:')
  console.log(`   Frontend URL: ${window.location.origin}`)
  console.log(`   API Base URL: ${api.defaults.baseURL}`)
  console.log(`   Expected Backend: https://zatint1991.com`)
  console.log(`   Proxy Target: /api -> https://zatint1991.com/api`)
  
  // 設定ファイルの確認を促す
  console.log('📝 Check these files:')
  console.log('   - src/setupProxy.js (React Scripts proxy)')
  console.log('   - vite.config.ts (Vite proxy)')
  console.log('   - package.json (PORT setting)')
  
  // 外部サーバー接続のヒント
  console.log('🌐 External Server Connection:')
  console.log('   - CORS policy must allow localhost:3000')
  console.log('   - SSL certificate must be valid')
  console.log('   - Network connectivity required')
}
