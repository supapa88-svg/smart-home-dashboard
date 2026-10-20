import puppeteer from 'puppeteer-core';
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
        executablePath: '/snap/bin/chromium',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',  // 自動化検出を無効化
            '--window-size=1920,1080'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // ビューポート設定
        await page.setViewport({ width: 1920, height: 1080 });
        
        // User-Agentを設定（より新しいバージョン）
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        
        // WebDriver検出を回避
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            
            // Chrome検出を回避
            window.navigator.chrome = {
                runtime: {},
            };
            
            // Permissions検出を回避
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Plugin検出を回避
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // Language検出を回避
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ja-JP', 'ja', 'en-US', 'en'],
            });
        });
        
        console.log('Navigating to Octopus Energy login page...');
        
        // ログインページに移動
        await page.goto('https://octopusenergy.co.jp/login', {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        
        // ログインフォームを待機
        await page.waitForSelector('input[id="email"]', { timeout: 30000 });
        
        console.log('Logging in...');
        
        // メールアドレスとパスワードを入力（よりランダムに）
        await page.click('input[id="email"]');
        await page.waitForTimeout(500 + Math.random() * 500);
        await page.type('input[id="email"]', OCTOPUS_EMAIL, { delay: 50 + Math.random() * 100 });
        await page.waitForTimeout(1000 + Math.random() * 1000);
        
        await page.click('input[id="password"]');
        await page.waitForTimeout(500 + Math.random() * 500);
        await page.type('input[id="password"]', OCTOPUS_PASSWORD, { delay: 50 + Math.random() * 100 });
        await page.waitForTimeout(1000 + Math.random() * 1000);
        
        console.log('Clicking login button...');
        
        // ログインボタンをクリック
        await page.click('button[type="submit"]');
        
        // ナビゲーション完了を待つ（より長いタイムアウト）
        console.log('Waiting for navigation...');
        try {
            await page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: 120000 
            });
        } catch (e) {
            console.log('Navigation timeout, checking current URL...');
        }
        
        await page.waitForTimeout(5000);
        
        // ログイン後のURLを確認
        const afterLoginUrl = page.url();
        console.log(`After login URL: ${afterLoginUrl}`);
        
        // ログインページにリダイレクトされていないか確認
        if (afterLoginUrl.includes('/login')) {
            console.log('Login failed, checking page content...');
            
            // ページ内容を確認
            const pageContent = await page.content();
            console.log('Page content (first 1000 chars):', pageContent.substring(0, 1000));
            
            // エラーメッセージがあるか確認
            const errorMessage = await page.evaluate(() => {
                const errorElement = document.querySelector('[role="alert"], .error, .error-message, [data-part="alert"]');
                return errorElement ? errorElement.textContent : 'No error message found';
            });
            console.log('Error message on page:', errorMessage);
            
            // フォームの状態を確認
            const formState = await page.evaluate(() => {
                const emailInput = document.querySelector('input[id="email"]');
                const passwordInput = document.querySelector('input[id="password"]');
                return {
                    emailValue: emailInput ? emailInput.value : 'not found',
                    passwordValue: passwordInput ? (passwordInput.value ? 'filled' : 'empty') : 'not found'
                };
            });
            console.log('Form state:', JSON.stringify(formState));
            
            throw new Error(`Login failed: Still on login page. URL: ${afterLoginUrl}. Error: ${errorMessage}`);
        }
        
        console.log('Logged in successfully');
        
        // 使用量ページに移動
        console.log('Navigating to usage page...');
        await page.goto('https://octopusenergy.co.jp/account/A-308611DA/usage', {
            waitUntil: 'networkidle2',  // より確実に読み込み完了を待つ
            timeout: 120000
        });
        
        // ページが読み込まれるまで待機
        console.log('Waiting for page to load...');
        await page.waitForTimeout(10000);  // 5秒 → 10秒に延長
        
        // デバッグ：現在のURLを確認
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        
        // デバッグ：ページタイトルを確認
        const pageTitle = await page.title();
        console.log(`Page title: ${pageTitle}`);
        
        // デバッグ：トグルボタンの存在確認
        const toggleButtons = await page.$$('button[data-part="toggle-button-option"]');
        console.log(`Found ${toggleButtons.length} toggle buttons`);
        
        if (toggleButtons.length === 0) {
            // ボタンが見つからない場合、ページのHTMLを出力
            const bodyHTML = await page.evaluate(() => document.body.innerHTML);
            console.log('Page HTML (first 1000 chars):', bodyHTML.substring(0, 1000));
            throw new Error('Toggle buttons not found on the page');
        }
        
        // 「日」タブをクリック
        console.log('Selecting day view...');
        
        // すべてのトグルボタンを取得して「日」を探す
        await page.waitForSelector('button[data-part="toggle-button-option"]', { timeout: 30000 });
        
        // JavaScriptで直接クリック（より確実）
        const dayButtonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button[data-part="toggle-button-option"]'));
            const dayButton = buttons.find(button => button.textContent.trim() === '日');
            
            if (dayButton) {
                console.log('Found day button, clicking...');
                dayButton.click();
                return true;
            } else {
                console.log('Day button not found');
                return false;
            }
        });
        
        if (!dayButtonClicked) {
            throw new Error('Day tab not found');
        }
        
        console.log('Day tab clicked');
        
        // クリック後、データ読み込みを待機（延長）
        console.log('Waiting for data to load after day tab click...');
        await page.waitForTimeout(15000);  // 5秒 → 15秒に延長
        
        // ページのURLやタイトルを再確認
        console.log(`After day tab click - URL: ${page.url()}`);
        
        // テーブル表示に切り替え（もしグラフ表示の場合）
        try {
            const tableButtonSelector = 'button[aria-label="テーブル"], button:has-text("テーブル")';
            const tableButton = await page.$(tableButtonSelector);
            if (tableButton) {
                await tableButton.click();
                console.log('Clicked table view button');
                await page.waitForTimeout(3000);
            }
        } catch (e) {
            console.log('Already in table view or button not found');
        }
        
        // さらに待機（JavaScriptの実行完了を待つ）
        console.log('Waiting for JavaScript to finish rendering...');
        await page.waitForTimeout(10000);
        
        // テーブルが表示されるまで待機
        console.log('Waiting for table to appear...');
        
        try {
            await page.waitForSelector('tr[data-part="table-row"]', { timeout: 60000 });
            console.log('Table found!');
        } catch (e) {
            console.log('Table not found after 60 seconds');
            
            // デバッグ：ページのHTMLを確認
            const bodyHTML = await page.evaluate(() => document.body.innerHTML);
            console.log('Page HTML (first 2000 chars):', bodyHTML.substring(0, 2000));
            
            throw new Error('Table rows not found on the page');
        }
        
        // さらに少し待機（データ読み込み完了を確実に）
        await page.waitForTimeout(3000);
        
        // テーブルデータを取得
        console.log('Extracting table data...');
        
        const tableData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[data-part="table-row"]'));
            console.log(`Found ${rows.length} rows in page.evaluate`);
            const data = [];
            
            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td[data-part="table-cell"]');
                const summaryRow = cells[0]?.getAttribute('data-summary-row');
                
                // サマリー行（合計行）はスキップ
                if (summaryRow === 'true') {
                    console.log(`Skipping summary row at index ${index}`);
                    return;
                }
                
                if (cells.length >= 2) {
                    const timeText = cells[0].textContent.trim();
                    const consumptionText = cells[1].textContent.trim();
                    
                    console.log(`Row ${index}: time="${timeText}", consumption="${consumptionText}"`);
                    
                    // "0.1 kWh" から "0.1" を抽出
                    const consumptionMatch = consumptionText.match(/[\d.]+/);
                    const consumption = consumptionMatch ? parseFloat(consumptionMatch[0]) : 0;
                    
                    if (timeText && !isNaN(consumption)) {
                        data.push({
                            time: timeText,
                            consumption: consumption
                        });
                    }
                }
            });
            
            console.log(`Extracted ${data.length} records in page.evaluate`);
            
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
