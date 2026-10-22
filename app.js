// Supabase設定
// NOTE: credentials must not be stored in the repo.
// Create a local config file (not committed) that sets window.SUPABASE_CONFIG before this script loads.
const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
const SUPABASE_KEY = window.SUPABASE_CONFIG?.anonKey || '';

const supabaseClient = SUPABASE_URL && SUPABASE_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

let tempChart, humidityChart;
let allData = [];  // 7日分のデータを保持
