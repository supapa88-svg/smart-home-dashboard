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
        await loadStatistics();  // ← この行を追加
        updateCharts();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
        
        // 5分ごとに更新
        setInterval(async () => {
            await loadAllData();
            await loadCurrentData();
            await loadEnergyData();  // ← 追加
            await loadStatistics();  // ← この行を追加
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
// 統計情報を計算・表示
async function loadStatistics() {
    try {
        
        // 室内・屋外の統計を計算（allDataを使用）
        if (allData && allData.length > 0) {
            const indoorStats = calculateDetailedStats(allData, 'indoor');
            const outdoorStats = calculateDetailedStats(allData, 'outdoor');


        // テーブルに表示
            renderStatsTable('indoor-stats-table', indoorStats);
            renderStatsTable('outdoor-stats-table', outdoorStats);
        }

        // 電力統計（既存のコード）
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

        const { data: energyData, error: energyError } = await supabaseClient
            .from('energy_data')
            .select('date, consumption')
            .gte('date', sevenDaysAgoStr);

        if (!energyError && energyData && energyData.length > 0) {
            // 日別に集計
            const dailyTotals = {};
            energyData.forEach(row => {
                if (!dailyTotals[row.date]) {
                    dailyTotals[row.date] = 0;
                }
                dailyTotals[row.date] += row.consumption || 0;
            });

            const totals = Object.values(dailyTotals);
            const dates = Object.keys(dailyTotals);

            if (totals.length > 0) {
                const total = totals.reduce((a, b) => a + b, 0);
                const avg = total / totals.length;
                const max = Math.max(...totals);
                const min = Math.min(...totals);

                const maxDate = dates[totals.indexOf(max)];
                const minDate = dates[totals.indexOf(min)];
                const maxDateObj = new Date(maxDate + 'T00:00:00');
                const minDateObj = new Date(minDate + 'T00:00:00');

                const maxLabel = `${maxDateObj.getMonth() + 1}/${maxDateObj.getDate()}${getDayOfWeek(maxDateObj)}`;
                const minLabel = `${minDateObj.getMonth() + 1}/${minDateObj.getDate()}${getDayOfWeek(minDateObj)}`;

                document.getElementById('stats-energy-total').textContent = `${total.toFixed(1)} kWh`;
                document.getElementById('stats-energy-avg').textContent = `${avg.toFixed(1)} kWh`;
                document.getElementById('stats-energy-max').textContent = `${max.toFixed(1)} kWh (${maxLabel})`;
                document.getElementById('stats-energy-min').textContent = `${min.toFixed(1)} kWh (${minLabel})`;
            }
        }

    } catch (error) {
        console.error('Error loading statistics:', error);
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
                    mode: 'nearest',
                    intersect: false,
                    position: 'nearest',
                    xAlign: 'center',
                    yAlign: 'bottom',
                    callbacks: {
                        title: function(context) {
                            // x値（時刻の小数）をHH:MM形式に変換
                            const timeValue = context[0].parsed.x;
                            const hours = Math.floor(timeValue);
                            const minutes = Math.round((timeValue - hours) * 60);
                            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        }
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
                    mode: 'nearest',
                    intersect: false,
                    position: 'nearest',
                    xAlign: 'center',
                    yAlign: 'bottom',
                    callbacks: {
                        title: function(context) {
                            // x値（時刻の小数）をHH:MM形式に変換
                            const timeValue = context[0].parsed.x;
                            const hours = Math.floor(timeValue);
                            const minutes = Math.round((timeValue - hours) * 60);
                            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        }
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
                    // 選択された日付を取得
                    const selectedCheckboxes = document.querySelectorAll('.date-filter:checked');
                    const selectedDates = [];
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    selectedCheckboxes.forEach(cb => {
                        const daysAgo = parseInt(cb.dataset.daysAgo);
                        const targetDate = new Date(today);
                        targetDate.setDate(targetDate.getDate() - daysAgo);
                        selectedDates.push(targetDate.toISOString().split('T')[0]);
                    });
// ★★★ デバッグログ ★★★
console.log('選択された日付:', selectedDates);
console.log('energyDataの日付:', energyData.map(row => row.date));

// 日付ごとにグループ化（選択された日付のみ）
const energyByDate = {};
energyData.forEach(row => {
    console.log(`チェック中: ${row.date}, 含まれる? ${selectedDates.includes(row.date)}`);
    
    // 選択された日付のみを処理
    if (!selectedDates.includes(row.date)) {
        return;
    }
                    // 日付ごとにグループ化（選択された日付のみ）
                    const energyByDate = {};
                    energyData.forEach(row => {
                        // 選択された日付のみを処理
                        if (!selectedDates.includes(row.date)) {
                            return;
                        }
    
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

                    // 日別の色を生成
                    const colors = generateColorGradient(dates.length);
                    
                    dates.forEach((date, index) => {
                        const dateObj = new Date(date + 'T00:00:00');
                        const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}${getDayOfWeek(dateObj)}`;

                        energyDatasets.push({
                            label: dateLabel,
                            data: energyByDate[date],
                            backgroundColor: colors.background[index],
                            borderColor: colors.border[index],
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
                                },
                                tooltip: {
                                    position: 'nearest',
                                    xAlign: 'center',
                                    yAlign: 'bottom',
                                    callbacks: {
                                        title: function(context) {
                                            // x値（時刻の小数）をHH:MM形式に変換
                                            const timeValue = context[0].parsed.x;
                                            const hours = Math.floor(timeValue);
                                            const minutes = Math.round((timeValue - hours) * 60);
                                            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                        },
                                        label: function(context) {
                                            return `${context.dataset.label}: ${context.parsed.y} kWh`;
                                        }
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
// 詳細統計を計算（最高・最低値とその日時を含む）
function calculateDetailedStats(data, location) {
    const tempKey = `${location}_temp`;
    const humidityKey = `${location}_humidity`;

    // 温度の統計
    const tempData = data.filter(d => d[tempKey] !== null && d[tempKey] !== undefined);
    let tempMax = { value: -Infinity, timestamp: null };
    let tempMin = { value: Infinity, timestamp: null };
    let tempSum = 0;

    tempData.forEach(d => {
        const value = d[tempKey];
        if (value > tempMax.value) {
            tempMax = { value, timestamp: d.created_at };
        }
        if (value < tempMin.value) {
            tempMin = { value, timestamp: d.created_at };
        }
        tempSum += value;
    });

    // 湿度の統計
    const humidityData = data.filter(d => d[humidityKey] !== null && d[humidityKey] !== undefined);
    let humidityMax = { value: -Infinity, timestamp: null };
    let humidityMin = { value: Infinity, timestamp: null };
    let humiditySum = 0;

    humidityData.forEach(d => {
        const value = d[humidityKey];
        if (value > humidityMax.value) {
            humidityMax = { value, timestamp: d.created_at };
        }
        if (value < humidityMin.value) {
            humidityMin = { value, timestamp: d.created_at };
        }
        humiditySum += value;
    });

    return {
        temperature: {
            max: tempMax,
            min: tempMin,
            avg: tempData.length > 0 ? tempSum / tempData.length : null
        },
        humidity: {
            max: humidityMax,
            min: humidityMin,
            avg: humidityData.length > 0 ? humiditySum / humidityData.length : null
        }
    };
}

// 日時フォーマット（MM/DD曜HH:MM形式）
function formatStatsDateTime(timestamp) {
    if (!timestamp) return '--';
    
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${month}/${day}${weekday}${hours}:${minutes}`;
}

// 統計テーブルを描画
function renderStatsTable(tableId, stats) {
    const tbody = document.getElementById(tableId);
    
    if (!stats || !stats.temperature || !stats.humidity) {
        tbody.innerHTML = `
            <tr>
                <td class="label">おんど</td>
                <td colspan="3">データなし</td>
            </tr>
            <tr>
                <td class="label">しつど</td>
                <td colspan="3">データなし</td>
            </tr>
        `;
        return;
    }
    
    const tempHtml = `
        <tr>
            <td class="label">おんど</td>
            <td>
                <span class="stats-value">${stats.temperature.max.value.toFixed(1)}°C</span>
                <span class="stats-timestamp">${formatStatsDateTime(stats.temperature.max.timestamp)}</span>
            </td>
            <td>
                <span class="stats-value">${stats.temperature.min.value.toFixed(1)}°C</span>
                <span class="stats-timestamp">${formatStatsDateTime(stats.temperature.min.timestamp)}</span>
            </td>
            <td>
                <span class="stats-value">${stats.temperature.avg.toFixed(1)}°C</span>
            </td>
        </tr>
    `;

    const humidityHtml = `
        <tr>
            <td class="label">しつど</td>
            <td>
                <span class="stats-value">${stats.humidity.max.value.toFixed(0)}%</span>
                <span class="stats-timestamp">${formatStatsDateTime(stats.humidity.max.timestamp)}</span>
            </td>
            <td>
                <span class="stats-value">${stats.humidity.min.value.toFixed(0)}%</span>
                <span class="stats-timestamp">${formatStatsDateTime(stats.humidity.min.timestamp)}</span>
            </td>
            <td>
                <span class="stats-value">${stats.humidity.avg.toFixed(0)}%</span>
            </td>
        </tr>
    `;

    tbody.innerHTML = tempHtml + humidityHtml;
}

// 日別に暖色から寒色へのグラデーションカラーを生成
function generateColorGradient(count) {
    const background = [];
    const border = [];
    
    // 暖色（赤・オレンジ）から寒色（青・紫）へのグラデーション
    const colorStops = [
        { r: 255, g: 99, b: 132 },   // 赤
        { r: 255, g: 159, b: 64 },   // オレンジ
        { r: 255, g: 205, b: 86 },   // 黄色
        { r: 75, g: 192, b: 192 },   // ターコイズ
        { r: 54, g: 162, b: 235 },   // 青
        { r: 153, g: 102, b: 255 },  // 紫
        { r: 201, g: 203, b: 207 }   // グレー
    ];
    
    for (let i = 0; i < count; i++) {
        // 色の位置を計算（0〜colorStops.length-1の範囲）
        const position = (i / Math.max(count - 1, 1)) * (colorStops.length - 1);
        const index = Math.floor(position);
        const fraction = position - index;
        
        // 2つの色の間を補間
        const startColor = colorStops[Math.min(index, colorStops.length - 1)];
        const endColor = colorStops[Math.min(index + 1, colorStops.length - 1)];
        
        const r = Math.round(startColor.r + (endColor.r - startColor.r) * fraction);
        const g = Math.round(startColor.g + (endColor.g - startColor.g) * fraction);
        const b = Math.round(startColor.b + (endColor.b - startColor.b) * fraction);
        
        background.push(`rgba(${r}, ${g}, ${b}, 0.6)`);
        border.push(`rgba(${r}, ${g}, ${b}, 1)`);
    }
    
    return { background, border };
}
// 選択された日付のリストを取得
function getSelectedDates() {
    const dates = [];
    const checkboxes = document.querySelectorAll('#date-filters input[type="checkbox"]:checked');
    
    checkboxes.forEach(checkbox => {
        dates.push(checkbox.value);
    });
    
    return dates;
}
