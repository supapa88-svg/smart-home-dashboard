# smart-home-dashboard

## 概要
このダッシュボードは、Supabase から室内・屋外の温湿度データと電力使用量を取得して表示します。

## ローカル開発手順

1. このリポジトリをローカルにクローンします。
2. 同じフォルダに `config.local.js` を作成します。
3. `config.local.js` に Supabase の URL と publishable key を設定します。

```javascript
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_PUBLISHABLE_KEY'
};
```

4. `index.html` をブラウザで開きます。
5. 開発者ツールの Console でエラーが出ていないことを確認します。

## セキュリティについて
- `config.local.js` はローカル開発専用です。
- GitHub に push しないでください。
- `.gitignore` に追加済みです。
- `secret key` はブラウザに入れず、ローカル開発用の公開キーだけを使います。

## 必要なファイル
- `index.html`
- `app.js`
- `config.local.js`（ローカルのみ）
- `casa_segura.png`（背景画像）
- 
