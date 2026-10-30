// Supabase設定
// NOTE: credentials must not be stored in the repo.
// Create a local config file (not committed) that sets window.SUPABASE_CONFIG before this script loads.
const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
const SUPABASE_KEY = window.SUPABASE_CONFIG?.anonKey || '';

const supabaseClient = SUPABASE_URL && SUPABASE_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

let dashboardRows = [];
let energyRows = [];
let tempChart = null;
let humidityChart = null;
let energyChart = null;
let selectedDates = new Set();

function setStatus(message) {
    const statusEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    if (statusEl) {
        statusEl.style.display = 'none';
    }
}

function getLatestSummary() {
    return dashboardRows[0] || null;
}

function formatDateLabel(value) {
    if (!value) return '--';
    const date = new Date(value + 'T00:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTime(value) {
    if (value === null || value === undefined) return '--';
    return `${Number(value).toFixed(1)}`;
}

async function init() {
    try {
        if (!supabaseClient) {
            setStatus('Supabase config is missing. Set window.SUPABASE_CONFIG in a local config file.');
            return;
        }

        await loadDashboardSummary();
        await loadEnergySummary();
        renderLatestValues();
        renderStats();
        initFilters();
        renderCharts();

        if (document.getElementById('loading')) {
            document.getElementById('loading').style.display = 'none';
        }

        if (document.getElementById('dashboard')) {
            document.getElementById('dashboard').style.display = 'grid';
        }
    } catch (error) {
        console.error('Initialization error:', error);
        setStatus('データの読み込みに失敗しました。');
    }
}

async function loadDashboardSummary() {
    const { data, error } = await supabaseClient
        .from('dashboard_summary_daily')
        .select('*')
        .order('summary_date', { ascending: false })
        .limit(7);

    if (error) throw error;
    dashboardRows = data || [];
}

async function loadEnergySummary() {
    const { data, error } = await supabaseClient
        .from('energy_summary_daily')
        .select('*')
        .order('summary_date', { ascending: false })
        .limit(14);

    if (error) throw error;
    energyRows = data || [];
}

function renderLatestValues() {
    const latest = getLatestSummary();
    if (!latest) {
        return;
    }

    const valueMap = [
        ['indoor-temp', latest.indoor_avg_temp],
        ['indoor-humidity', latest.indoor_avg_humidity],
        ['outdoor-temp', latest.outdoor_avg_temp],
        ['outdoor-humidity', latest.outdoor_avg_humidity]
    ];

    valueMap.forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value !== null && value !== undefined ? `${Number(value).toFixed(1)}${id.includes('humidity') ? '%' : '°C'}` : '--';
    });

    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl && latest.summary_date) {
        lastUpdateEl.textContent = `最終更新: ${latest.summary_date}`;
    }

    const todayEnergyEl = document.getElementById('today-energy');
    if (todayEnergyEl) {
        const today = energyRows[0];
        todayEnergyEl.textContent = today && today.total_kwh !== null ? `${Number(today.total_kwh).toFixed(1)} kWh` : '--';
    }

    const yesterdayEnergyEl = document.getElementById('yesterday-energy');
    if (yesterdayEnergyEl) {
        const yesterday = energyRows[1];
        yesterdayEnergyEl.textContent = yesterday && yesterday.total_kwh !== null ? `${Number(yesterday.total_kwh).toFixed(1)} kWh` : '--';
    }
}

function summarize(values) {
    const nums = values.filter(v => v !== null && v !== undefined).map(Number);
    if (!nums.length) return null;
    return {
        max: Math.max(...nums),
        min: Math.min(...nums),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length
    };
}

function statsRowHtml(label, stats, unit) {
    const cell = (v) => `<td>${v === undefined ? '--' : v.toFixed(1) + unit}</td>`;
    return `<tr><td class="label">${label}</td>${cell(stats?.max)}${cell(stats?.min)}${cell(stats?.avg)}</tr>`;
}

function renderStats() {
    const tables = {
        'indoor-stats-table': ['indoor_avg_temp', 'indoor_avg_humidity'],
        'outdoor-stats-table': ['outdoor_avg_temp', 'outdoor_avg_humidity']
    };

    Object.entries(tables).forEach(([id, [tempKey, humidityKey]]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const temp = summarize(dashboardRows.map(r => r[tempKey]));
        const humidity = summarize(dashboardRows.map(r => r[humidityKey]));
        el.innerHTML = statsRowHtml('おんど', temp, '°C') + statsRowHtml('しつど', humidity, '%');
    });

    const recent = energyRows.slice(0, 7).map(r => r.total_kwh);
    const energy = summarize(recent);
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value === null || value === undefined ? '--' : `${value.toFixed(1)} kWh`;
    };
    const nums = recent.filter(v => v !== null && v !== undefined).map(Number);
    setText('stats-energy-total', nums.length ? nums.reduce((a, b) => a + b, 0) : null);
    setText('stats-energy-avg', energy?.avg);
    setText('stats-energy-max', energy?.max);
    setText('stats-energy-min', energy?.min);
}

function initFilters() {
    const container = document.getElementById('dateFilters');
    if (container) {
        const dates = [...dashboardRows].reverse().map(r => r.summary_date);
        selectedDates = new Set(dates);
        container.innerHTML = '';
        dates.forEach(date => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = true;
            input.addEventListener('change', () => {
                if (input.checked) selectedDates.add(date);
                else selectedDates.delete(date);
                renderCharts();
            });
            const span = document.createElement('span');
            span.textContent = formatDateLabel(date);
            label.append(input, span);
            container.appendChild(label);
        });
    }

    ['filterIndoor', 'filterOutdoor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderCharts);
    });
}

function visibleRows() {
    return [...dashboardRows].reverse().filter(r => selectedDates.has(r.summary_date));
}

function isChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : true;
}

function renderCharts() {
    const tempCanvas = document.getElementById('tempChart');
    if (tempCanvas && window.Chart) {
        const labels = visibleRows().map(row => formatDateLabel(row.summary_date));
        const tempData = visibleRows().map(row => row.indoor_avg_temp ?? null);
        const outdoorData = visibleRows().map(row => row.outdoor_avg_temp ?? null);

        if (tempChart) tempChart.destroy();
        tempChart = new Chart(tempCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '室内',
                        hidden: !isChecked('filterIndoor'),
                        data: tempData,
                        borderColor: '#ff6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: false,
                        tension: 0.2
                    },
                    {
                        label: '屋外',
                        hidden: !isChecked('filterOutdoor'),
                        data: outdoorData,
                        borderColor: '#36a2eb',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        fill: false,
                        tension: 0.2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: (value) => `${value}°C`
                        }
                    }
                }
            }
        });
    }

    const humidityCanvas = document.getElementById('humidityChart');
    if (humidityCanvas && window.Chart) {
        const labels = visibleRows().map(row => formatDateLabel(row.summary_date));
        const indoorData = visibleRows().map(row => row.indoor_avg_humidity ?? null);
        const outdoorData = visibleRows().map(row => row.outdoor_avg_humidity ?? null);

        if (humidityChart) humidityChart.destroy();
        humidityChart = new Chart(humidityCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '室内',
                        hidden: !isChecked('filterIndoor'),
                        data: indoorData,
                        borderColor: '#ff6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: false,
                        tension: 0.2
                    },
                    {
                        label: '屋外',
                        hidden: !isChecked('filterOutdoor'),
                        data: outdoorData,
                        borderColor: '#36a2eb',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        fill: false,
                        tension: 0.2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        ticks: {
                            callback: (value) => `${value}%`
                        }
                    }
                }
            }
        });
    }

    const energyCanvas = document.getElementById('energyChart');
    if (energyCanvas && window.Chart) {
        const rows = [...energyRows].reverse().slice(-7).filter(r => selectedDates.has(r.summary_date));
        if (energyChart) energyChart.destroy();
        energyChart = new Chart(energyCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: rows.map(r => formatDateLabel(r.summary_date)),
                datasets: [{
                    label: '消費電力量 (kWh)',
                    data: rows.map(r => r.total_kwh ?? null),
                    backgroundColor: 'rgba(255, 159, 64, 0.6)',
                    borderColor: '#ff9f40',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => `${value} kWh` }
                    }
                }
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('load', init);
}
