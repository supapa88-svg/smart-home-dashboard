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

function renderCharts() {
    const tempCanvas = document.getElementById('tempChart');
    if (tempCanvas && window.Chart) {
        const labels = [...dashboardRows].reverse().map(row => formatDateLabel(row.summary_date));
        const tempData = [...dashboardRows].reverse().map(row => row.indoor_avg_temp ?? null);
        const outdoorData = [...dashboardRows].reverse().map(row => row.outdoor_avg_temp ?? null);

        if (tempChart) tempChart.destroy();
        tempChart = new Chart(tempCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '室内',
                        data: tempData,
                        borderColor: '#ff6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: false,
                        tension: 0.2
                    },
                    {
                        label: '屋外',
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
        const labels = [...dashboardRows].reverse().map(row => formatDateLabel(row.summary_date));
        const indoorData = [...dashboardRows].reverse().map(row => row.indoor_avg_humidity ?? null);
        const outdoorData = [...dashboardRows].reverse().map(row => row.outdoor_avg_humidity ?? null);

        if (humidityChart) humidityChart.destroy();
        humidityChart = new Chart(humidityCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '室内',
                        data: indoorData,
                        borderColor: '#ff6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: false,
                        tension: 0.2
                    },
                    {
                        label: '屋外',
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
}

if (typeof window !== 'undefined') {
    window.addEventListener('load', init);
}
