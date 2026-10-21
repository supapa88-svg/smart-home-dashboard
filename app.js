// Supabase設定
const SUPABASE_URL = 'https://mbypfeifkyrisnqjfpbq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XUPp_IwZKgpFv9MTJwHBSg_DNlba5VE';  // ← 実際のキーに変更

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let tempChart, humidityChart;
let allData = [];  // 7日分のデータを保持

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

// 日付フォーマット（MM/DD）
function formatDate(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

// 曜日取得
function getDayOfWeek(date) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
}

// エラー表示
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = `エラー: ${message}`;
    errorDiv.style.display = 'block';
    document.getElementById('loading').style.display = 'none';
}

// 日付フィルターのチェックボックスを生成
function createDateFilters() {
    const container = document.getElementById('dateFilters');
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const dateStr = formatDate(date);
        const dayOfWeek = getDayOfWeek(date);
        const label = i === 0 ? `今日(${dateStr}${dayOfWeek})` : `${i}日前(${dateStr}${dayOfWeek})`;
        
        const checkboxLabel = document.createElement('label');
        checkboxLabel.className = 'checkbox-label';
        checkboxLabel.innerHTML = `
            <input type="checkbox" class="date-filter" data-days-ago="${i}" checked>
            <span>${label}</span>
        `;
        
        container.appendChild(checkboxLabel);
    }
    
    // チェックボックス変更時にグラフ更新
    container.addEventListener('change', updateCharts);
    document.getElementById('filterIndoor').addEventListener('change', updateCharts);
    document.getElementById('filterOutdoor').addEventListener('change', updateCharts);
}

// 初期化
async function init() {
    try {
        createDateFilters();
        await loadAllData();
        await loadCurrentData();
        await loadEnergyData();  // ← 追加
        updateCharts();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
        
        // 5分ごとに更新
        setInterval(async () => {
            await loadAllData();
            await loadCurrentData();
            await loadEnergyData();  // ← 追加
            updateCharts();
        }, 5 * 60 * 1000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('データの読み込みに失敗しました。');
    }
}

// 7日分のデータを読み込み
async function loadAllData() {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data, error } = await supabaseClient
            .from('sensor_data')
            .select('*')
            .not('indoor_temp', 'is', null)
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        allData = data || [];
        
    } catch (error) {
        console.error('Error loading all data:', error);
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
            
            document.getElementById('lastUpdate').textContent = 
                `最終更新: ${toJST(latest.created_at)}`;
            
            document.getElementById('indoor-temp').textContent = 
                latest.indoor_temp !== null ? `${latest.indoor_temp}°C` : '--';
            document.getElementById('indoor-humidity').textContent = 
                latest.indoor_humidity !== null ? `${latest.indoor_humidity}%` : '--';
            
            document.getElementById('outdoor-temp').textContent = 
                latest.outdoor_temp !== null ? `${latest.outdoor_temp}°C` : '--';
            document.getElementById('outdoor-humidity').textContent = 
                latest.outdoor_humidity !== null ? `${latest.outdoor_humidity}%` : '--';
        }
        
    } catch (error) {
        console.error('Error loading current data:', error);
    }
}

// 電力データ読み込み
async function loadEnergyData() {
    try {
        // 今日の使用量
        const todayDate = new Date();
        const today = todayDate.toISOString().split('T')[0];
        const todayLabel = `${todayDate.getMonth() + 1}/${todayDate.getDate()}${getDayOfWeek(todayDate)}`;
        
        const { data: todayData, error: todayError } = await supabaseClient
            .from('energy_data')
            .select('consumption')
            .eq('date', today);
        
        if (todayError) throw todayError;
        
        const todayTotal = todayData?.reduce((sum, row) => sum + (row.consumption || 0), 0) || 0;
        document.getElementById('today-energy').textContent = 
            `${todayTotal.toFixed(1)} kWh`;
        
        // ラベルを更新
        document.querySelector('#today-energy').previousElementSibling.textContent = 
            `今日(${todayLabel})`;
        
        // 昨日の使用量
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
        const yesterdayLabel = `${yesterdayDate.getMonth() + 1}/${yesterdayDate.getDate()}${getDayOfWeek(yesterdayDate)}`;
        
        const { data: yesterdayData, error: yesterdayError } = await supabaseClient
            .from('energy_data')
            .select('consumption')
            .eq('date', yesterdayStr);
        
        if (yesterdayError) throw yesterdayError;
        
        const yesterdayTotal = yesterdayData?.reduce((sum, row) => sum + (row.consumption || 0), 0) || 0;
        document.getElementById('yesterday-energy').textContent = 
            `${yesterdayTotal.toFixed(1)} kWh`;
        
        // ラベルを更新
        document.querySelector('#yesterday-energy').previousElementSibling.textContent = 
            `昨日(${yesterdayLabel})`;
        
    } catch (error) {
        console.error('Error loading energy data:', error);
    }
}
// グラフ更新
function updateCharts() {
    // チェックされた日付を取得
    const selectedDays = Array.from(document.querySelectorAll('.date-filter:checked'))
        .map(cb => parseInt(cb.dataset.daysAgo));
    
    // 室内・屋外のフィルター
    const showIndoor = document.getElementById('filterIndoor').checked;
    const showOutdoor = document.getElementById('filterOutdoor').checked;
    
    if (selectedDays.length === 0 || (!showIndoor && !showOutdoor)) {
        // 何も選択されていない場合はグラフをクリア
        if (tempChart) tempChart.destroy();
        if (humidityChart) humidityChart.destroy();
        return;
    }
    
    // データセットを作成
    const tempDatasets = [];
    const humidityDatasets = [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    selectedDays.forEach(daysAgo => {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - daysAgo);
        const nextDate = new Date(targetDate);
        nextDate.setDate(nextDate.getDate() + 1);
        
        // その日のデータを抽出
        const dayData = allData.filter(d => {
            const dataDate = new Date(d.created_at);
            return dataDate >= targetDate && dataDate < nextDate;
        });
        
        if (dayData.length === 0) return;
        
        // 時刻のみに変換（00:00基準）
        const processedData = dayData.map(d => {
            const dataDate = new Date(d.created_at);
            const hours = dataDate.getUTCHours() + 9;  // 日本時間に変換
            const minutes = dataDate.getUTCMinutes();
            const timeInHours = (hours % 24) + minutes / 60;
            
            return {
                x: timeInHours,
                indoor_temp: d.indoor_temp,
                indoor_humidity: d.indoor_humidity,
                outdoor_temp: d.outdoor_temp,
                outdoor_humidity: d.outdoor_humidity
            };
        });
        
        // 透明度を計算（新しいほど濃い）
        const opacity = 1.0 - (daysAgo * 0.12);
        
        // ラベル作成
        const dateLabel = formatDate(new Date(targetDate.getTime() + 9 * 60 * 60 * 1000));
        const dayLabel = getDayOfWeek(new Date(targetDate.getTime() + 9 * 60 * 60 * 1000));
        
        // 室内データ
        if (showIndoor) {
            tempDatasets.push({
                label: `室内: ${dateLabel}${dayLabel}`,
                data: processedData.map(d => ({ x: d.x, y: d.indoor_temp })),
                borderColor: `rgba(255, 99, 132, ${opacity})`,
                backgroundColor: `rgba(255, 99, 132, ${opacity * 0.1})`,
                tension: 0,
                fill: false,
                pointRadius: 0
            });
            
            humidityDatasets.push({
                label: `室内: ${dateLabel}${dayLabel}`,
                data: processedData.map(d => ({ x: d.x, y: d.indoor_humidity })),
                borderColor: `rgba(255, 99, 132, ${opacity})`,
                backgroundColor: `rgba(255, 99, 132, ${opacity * 0.1})`,
                tension: 0,
                fill: false,
                pointRadius: 0
            });
        }
        
        // 屋外データ
        if (showOutdoor) {
            tempDatasets.push({
                label: `屋外: ${dateLabel}${dayLabel}`,
                data: processedData.map(d => ({ x: d.x, y: d.outdoor_temp })),
                borderColor: `rgba(54, 162, 235, ${opacity})`,
                backgroundColor: `rgba(54, 162, 235, ${opacity * 0.1})`,
                tension: 0,
                fill: false,
                pointRadius: 0
            });
            
            humidityDatasets.push({
                label: `屋外: ${dateLabel}${dayLabel}`,
                data: processedData.map(d => ({ x: d.x, y: d.outdoor_humidity })),
                borderColor: `rgba(54, 162, 235, ${opacity})`,
                backgroundColor: `rgba(54, 162, 235, ${opacity * 0.1})`,
                tension: 0,
                fill: false,
                pointRadius: 0
            });
        }
    });
    
    // 温度グラフ
    if (tempChart) tempChart.destroy();
    
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            datasets: tempDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 24,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return value.toString().padStart(2, '0') + ':00';
                        }
                    },
                    title: {
                        display: true,
                        text: '時刻'
                    }
                },
                y: {
    beginAtZero: false,
    min: function(context) {
        // 全データから最小値・最大値を取得
        const allValues = [];
        context.chart.data.datasets.forEach(dataset => {
            dataset.data.forEach(point => {
                if (point.y !== null && point.y !== undefined) {
                    allValues.push(point.y);
                }
            });
        });
        
        if (allValues.length === 0) return 0;
        
        const dataMin = Math.min(...allValues);
        const dataMax = Math.max(...allValues);
        
        let min = Math.floor(dataMin);
        let max = Math.ceil(dataMax);
        
        // 差が10℃未満なら、最大値を最小値+10℃に
        if (max - min < 10) {
            max = min + 10;
        }
        
        return min;
    },
    max: function(context) {
        // 全データから最小値・最大値を取得
        const allValues = [];
        context.chart.data.datasets.forEach(dataset => {
            dataset.data.forEach(point => {
                if (point.y !== null && point.y !== undefined) {
                    allValues.push(point.y);
                }
            });
        });
        
        if (allValues.length === 0) return 10;
        
        const dataMin = Math.min(...allValues);
        const dataMax = Math.max(...allValues);
        
        let min = Math.floor(dataMin);
        let max = Math.ceil(dataMax);
        
        // 差が10℃未満なら、最大値を最小値+10℃に
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
            datasets: humidityDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 24,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return value.toString().padStart(2, '0') + ':00';
                        }
                    },
                    title: {
                        display: true,
                        text: '時刻'
                    }
                },
                y: {
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
        // 電力グラフ
    const energyCtx = document.getElementById('energyChart')?.getContext('2d');
    
    if (energyCtx) {
        // 7日分の電力データを取得
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
        
        supabaseClient
            .from('energy_data')
            .select('*')
            .gte('date', sevenDaysAgoStr)
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .then(({ data: energyData, error: energyError }) => {
                if (energyError) {
                    console.error('Error loading energy data:', energyError);
                    return;
                }
                
                if (energyData && energyData.length > 0) {
                    // 日付ごとにグループ化
                    const energyByDate = {};
                    energyData.forEach(row => {
                        if (!energyByDate[row.date]) {
                            energyByDate[row.date] = [];
                        }
                        // 時刻を時間（小数）に変換
                        const [hours, minutes] = row.time.split(':').map(Number);
                        const timeInHours = hours + minutes / 60;
                        energyByDate[row.date].push({
                            x: timeInHours,
                            y: row.consumption
                        });
                    });
                    
                    // データセット作成
                    const energyDatasets = [];
                    const dates = Object.keys(energyByDate).sort();
                    
                    dates.forEach((date, index) => {
                        const daysAgo = dates.length - 1 - index;
                        const opacity = 1.0 - (daysAgo * 0.12);
                        const dateObj = new Date(date + 'T00:00:00');
                        const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}${getDayOfWeek(dateObj)}`;
                        
                        energyDatasets.push({
                            label: dateLabel,
                            data: energyByDate[date],
                            backgroundColor: `rgba(255, 193, 7, ${opacity})`,
                            borderColor: `rgba(255, 193, 7, ${opacity})`,
                            borderWidth: 1
                        });
                    });
                    
                    // グラフ作成
                    if (window.energyChart && typeof window.energyChart.destroy === 'function') {
                        window.energyChart.destroy();
                    }
                    
                    window.energyChart = new Chart(energyCtx, {
                        type: 'bar',
                        data: { datasets: energyDatasets },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    position: 'top',
                                    labels: {
                                        boxWidth: 12,
                                        font: { size: 11 }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    type: 'linear',
                                    min: 0,
                                    max: 24,
                                    ticks: {
                                        stepSize: 1,
                                        callback: function(value) {
                                            return value.toString().padStart(2, '0') + ':00';
                                        }
                                    },
                                    title: {
                                        display: true,
                                        text: '時刻'
                                    }
                                },
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value + ' kWh';
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            });
    }
}

// ページ読み込み時に実行
window.addEventListener('load', init);
