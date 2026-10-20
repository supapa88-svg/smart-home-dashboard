import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

// 環境変数から設定を取得
const OCTOPUS_EMAIL = process.env.OCTOPUS_EMAIL;
const OCTOPUS_PASSWORD = process.env.OCTOPUS_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Supabaseクライアント初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 日付フォーマット（YYYY-MM-DD）
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// メイン処理
async function scrapeOctopusEnergy() {
    console.log('Starting Octopus Energy scraping...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // User-Agentを設定
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('Navigating to Octopus Energy login page...');
        
        // ログインページに移動
        await page.goto('https://octopus.energy/login/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // ログインフォームを待機
        await page.waitForSelector('input[type="email"]', { timeout: 30000 });
        
        console.log('Logging in...');
        
        // メールアドレスとパスワードを入力
        await page.type('input[type="email"]', OCTOPUS_EMAIL);
        await page.type('input[type="password"]', OCTOPUS_PASSWORD);
        
        // ログインボタンをクリック
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
            page.click('button[type="submit"]')
        ]);
        
        console.log('Logged in successfully');
        
        // 使用量ページに移動
        console.log('Navigating to usage page...');
        await page.goto('https://octopus.energy/dashboard/new/accounts/usage/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // ページが読み込まれるまで待機
        await page.waitForTimeout(5000);
        
        // 「日」タブをクリック
        console.log('Selecting day view...');
        const dayTabSelector = 'button[data-testid="day-tab"], button:has-text("日")';
        await page.waitForSelector(dayTabSelector, { timeout: 30000 });
        await page.click(dayTabSelector);
        await page.waitForTimeout(3000);
        
        // テーブル表示に切り替え（もしグラフ表示の場合）
        try {
            const tableButtonSelector = 'button[aria-label="テーブル"], button:has-text("テーブル")';
            const tableButton = await page.$(tableButtonSelector);
            if (tableButton) {
                await tableButton.click();
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log('Already in table view or button not found');
        }
        
        // テーブルデータを取得
        console.log('Extracting table data...');
        
        const tableData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[data-part="table-row"]'));
            const data = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td[data-part="table-cell"]');
                if (cells.length >= 2) {
                    const timeText = cells[0].textContent.trim();
                    const consumptionText = cells[1].textContent.trim();
                    
                    // "0.1 kWh" から "0.1" を抽出
                    const consumption = parseFloat(consumptionText.replace(/[^\d.]/g, ''));
                    
                    if (timeText && !isNaN(consumption)) {
                        data.push({
                            time: timeText,
                            consumption: consumption
                        });
                    }
                }
            });
            
            return data;
        });
        
        console.log(`Extracted ${tableData.length} records`);
        
        if (tableData.length === 0) {
            console.log('No data found. Page might have changed structure.');
            return;
        }
        
        // 今日の日付
        const today = new Date();
        const dateStr = formatDate(today);
        
        console.log(`Saving data for ${dateStr}...`);
        
        // Supabaseに保存（UPSERT）
        for (const row of tableData) {
            const { error } = await supabase
                .from('energy_data')
                .upsert({
                    date: dateStr,
                    time: row.time,
                    consumption: row.consumption,
                    is_final: false
                }, {
                    onConflict: 'date,time'
                });
            
            if (error) {
                console.error(`Error saving data for ${row.time}:`, error);
            }
        }
        
        console.log('Data saved successfully');
        
        // 日付が変わった直後（00:00〜02:00）なら、前日を確定
        const hour = today.getHours();
        if (hour >= 0 && hour < 2) {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = formatDate(yesterday);
            
            console.log(`Marking ${yesterdayStr} as final...`);
            
            const { error } = await supabase
                .from('energy_data')
                .update({ is_final: true })
                .eq('date', yesterdayStr)
                .eq('is_final', false);
            
            if (error) {
                console.error('Error marking data as final:', error);
            } else {
                console.log(`${yesterdayStr} marked as final`);
            }
        }
        
    } catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

// 実行
scrapeOctopusEnergy()
    .then(() => {
        console.log('Scraping completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Scraping failed:', error);
        process.exit(1);
    });
