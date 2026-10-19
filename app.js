// Supabase設定
const SUPABASE_URL = 'https://mbypfeifkyrisnqjfpbq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XUPp_IwZKgpFv9MTJwHBSg_DNlba5VE';  // ← ここを変更してください

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let tempChart, humidityChart;

// 日本時間に変換
function toJST(utcDateString) {
    const date = new Date(utcDateString);
    return date.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 時刻のみ（グラフ用）
function toJSTTime(utcDateString) {
    const date = new Date(utcDateString);
    return date.toLocaleTimeString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// エラー表示
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = `エラー: ${message}`;
    errorDiv.style.display = 'block';
    document.getElementById('loading').style.display = 'none';
}

// 初期化
async function init() {
    try {
        await loadCurrentData();
        await loadCharts();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
        
        // 5分ごとに更新
        setInterval(loadCurrentData, 5 * 60 * 1000);
        setInterval(loadCharts, 15 * 60 * 1000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('データの読み込みに失敗しました。');
    }
}

// 現在のデータ読み込み
async function loadCurrentData() {
    try {
        const { data, error } = await supabase
            .from('sensor_data')
            .select('*')
            .not('indoor_temp', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const latest = data[0];
            
            // 最終更新時刻
            document.getElementById('lastUpdate').textContent = 
                `最終更新: ${toJST(latest.created_at)}`;
            
            // 室内
            document.getElementById('indoor-temp').textContent = 
                latest.indoor_temp !== null ? `${latest.indoor_temp}°C` : '--';
            document.getElementById('indoor-humidity').textContent = 
                latest.indoor_humidity !== null ? `${latest.indoor_humidity}%` : '--';
            
            // 屋外
            document.getElementById('outdoor-temp').textContent = 
                latest.outdoor_temp !== null ? `${latest.outdoor_temp}°C` : '--';
            document.getElementById('outdoor-humidity').textContent = 
                latest.outdoor_humidity !== null ? `${latest.outdoor_humidity}%` : '--';
        }
        
    } catch (error) {
        console.error('Error loading current data:', error);
        showError('現在のデータの読み込みに失敗しました。');
    }
}

// グラフ読み込み
async function loadCharts() {
    try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const { data, error } = await supabase
            .from('sensor_data')
            .select('*')
            .not('indoor_temp', 'is', null)
            .gte('created_at', yesterday.toISOString())
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            console.warn('No data available for charts');
            return;
        }
        
        // ラベル（時刻）
        const labels = data.map(d => toJSTTime(d.created_at));
        
        // 温度グラフ
        if (tempChart) tempChart.destroy();
        
        const tempCtx = document.getElementById('tempChart').getContext('2d');
        tempChart = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '室内温度',
                        data: data.map(d => d.indoor_temp),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '屋外温度',
                        data: data.map(d => d.outdoor_temp),
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return value + '°C';
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
        
        // 湿度グラフ
        if (humidityChart) humidityChart.destroy();
        
        const humidityCtx = document.getElementById('humidityChart').getContext('2d');
        humidityChart = new Chart(humidityCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '室内湿度',
                        data: data.map(d => d.indoor_humidity),
                        borderColor: 'rgb(78, 205, 196)',
                        backgroundColor: 'rgba(78, 205, 196, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '屋外湿度',
                        data: data.map(d => d.outdoor_humidity),
                        borderColor: 'rgb(255, 159, 64)',
                        backgroundColor: 'rgba(255, 159, 64, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 0,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading charts:', error);
        showError('グラフの読み込みに失敗しました。');
    }
}

// ページ読み込み時に実行
window.addEventListener('load', init);
