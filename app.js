// Supabase設定
const SUPABASE_URL = 'https://mbypfeifkyrisnqjfpbq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XUPp_IwZKgpFv9MTJwHBSg_DNlba5VE';  // ← ここを実際のキーに変更

// Supabaseクライアント初期化
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
        const { data, error } = await supabaseClient
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
        
        const { data, error } = await supabaseClient
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
        
// データをそのまま使用（UTCのまま）
const chartData = data.map(d => ({
    time: new Date(d.created_at),
    indoor_temp: d.indoor_temp,
    indoor_humidity: d.indoor_humidity,
    outdoor_temp: d.outdoor_temp,
    outdoor_humidity: d.outdoor_humidity
}));

// 最新データの時刻（UTC）
const latestTime = new Date(Math.max(...chartData.map(d => d.time)));

// 日本時間で次の正時を計算
// UTCに9時間足して日本時間にする
const latestTimeJST = new Date(latestTime.getTime() + 9 * 60 * 60 * 1000);

// 次の正時（日本時間）
const maxTimeJST = new Date(latestTimeJST);
maxTimeJST.setUTCMinutes(0, 0, 0);
if (latestTimeJST.getUTCMinutes() > 0 || latestTimeJST.getUTCSeconds() > 0) {
    maxTimeJST.setUTCHours(maxTimeJST.getUTCHours() + 1);
}

// UTCに戻す（9時間引く）
const maxTime = new Date(maxTimeJST.getTime() - 9 * 60 * 60 * 1000);

// 最小値 = 最大値 - 24時間
const minTime = new Date(maxTime.getTime() - 24 * 60 * 60 * 1000);
        
        // 温度グラフ
        if (tempChart) tempChart.destroy();
        
        const tempCtx = document.getElementById('tempChart').getContext('2d');
        tempChart = new Chart(tempCtx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: '室内温度',
                        data: chartData.map(d => ({ x: d.time, y: d.indoor_temp })),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0,
                        fill: true
                    },
                    {
                        label: '屋外温度',
                        data: chartData.map(d => ({ x: d.time, y: d.outdoor_temp })),
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        tension: 0,
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
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            stepSize: 1,
                            displayFormats: {
                                hour: 'HH:mm'
                            },
                            tooltipFormat: 'yyyy/MM/dd HH:mm'
                        },
                        min: minTime,
                        max: maxTime,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 25
                        }
                    },
                    y: {
                        beginAtZero: false,
                        min: function(context) {
                            const allData = [
                                ...context.chart.data.datasets[0].data.map(d => d.y),
                                ...context.chart.data.datasets[1].data.map(d => d.y)
                            ].filter(v => v !== null && v !== undefined);
                            
                            if (allData.length === 0) return 0;
                            
                            const dataMin = Math.min(...allData);
                            const dataMax = Math.max(...allData);
                            
                            let min = Math.floor(dataMin);
                            let max = Math.ceil(dataMax);
                            
                            if (max - min < 10) {
                                max = min + 10;
                            }
                            
                            return min;
                        },
                        max: function(context) {
                            const allData = [
                                ...context.chart.data.datasets[0].data.map(d => d.y),
                                ...context.chart.data.datasets[1].data.map(d => d.y)
                            ].filter(v => v !== null && v !== undefined);
                            
                            if (allData.length === 0) return 10;
                            
                            const dataMin = Math.min(...allData);
                            const dataMax = Math.max(...allData);
                            
                            let min = Math.floor(dataMin);
                            let max = Math.ceil(dataMax);
                            
                            if (max - min < 10) {
                                max = min + 10;
                            }
                            
                            return max;
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '°C';
                            }
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
                datasets: [
                    {
                        label: '室内湿度',
                        data: chartData.map(d => ({ x: d.time, y: d.indoor_humidity })),
                        borderColor: 'rgb(78, 205, 196)',
                        backgroundColor: 'rgba(78, 205, 196, 0.1)',
                        tension: 0,
                        fill: true
                    },
                    {
                        label: '屋外湿度',
                        data: chartData.map(d => ({ x: d.time, y: d.outdoor_humidity })),
                        borderColor: 'rgb(255, 159, 64)',
                        backgroundColor: 'rgba(255, 159, 64, 0.1)',
                        tension: 0,
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
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            stepSize: 1,
                            displayFormats: {
                                hour: 'HH:mm'
                            },
                            tooltipFormat: 'yyyy/MM/dd HH:mm'
                        },
                        min: minTime,
                        max: maxTime,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 25
                        }
                    },
                    y: {
                        beginAtZero: false,
                        min: 0,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
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
