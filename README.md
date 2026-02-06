# 困りごとラボ (m-komarabo)

街の課題（困りごと）を投稿し、共有するためのプロトタイプアプリケーションです。
Cloudflare Pages と D1 データベース、Hono フレームワークを使用して構築されています。

## プロジェクト構造と各ファイルの役割

- `functions/api/[[route]].ts`: APIサーバーの本体（Hono）。ルーティングとビジネスロジックを担当。
- `public/`: 静的ファイル（フロントエンド）を格納するディレクトリ。
  - `index.html`: ユーザーインターフェース。API（`/api/*`）をフェッチしてデータを表示。
- `wrangler.toml`: Cloudflare Pages の設定ファイル。ビルド設定やD1データベースの紐付けを行う。
- `package.json`: プロジェクトの依存関係と開発用スクリプトの定義。

---

## ルーティングの仕組み (`functions/api/[[route]].ts`)

このプロジェクトでは、Cloudflare Pages の **Functions** 機能を活用しており、Hono を使用した高度なルーティングを行っています。

### `[[route]].ts` (Catch-all Route)
ファイル名を `[[route]].ts` とすることで、`/api/` 以下のすべてのサブパス（例: `/api/list-issues`, `/api/post-issue` など）がこの一つのファイルに集約されます。

```typescript
// functions/api/[[route]].ts
const app = new Hono().basePath('/api')

app.get('/list-issues', ...) // /api/list-issues に対応
app.post('/post-issue', ...) // /api/post-issue に対応

export const onRequest = handle(app)
```

この構成により、フロントエンド側は `/api/list-issues` という簡潔なURLでバックエンドを呼び出すことが可能です。

---

## データベース接続の仕組み (`D1 Database`)

Cloudflare のサーバーレスSQLデータベース **D1** を使用しています。

### `wrangler.toml` での定義
D1 データベースをコードから参照できるようにするために、`wrangler.toml` にバインディング（接続設定）を記述します。

```toml
[[d1_databases]]
binding = "DB" # コード内で c.env.DB として参照するための名前
database_name = "your-database-name"
database_id = "your-database-id"
```

### コード内での利用
Hono のコンテキストを通じて、バインド名（`DB`）を指定してデータベースを操作します。

```typescript
// SQLの実行例
const { results } = await c.env.DB.prepare('SELECT * FROM issues').all()
```

---

## 開発とデプロイ

### ローカル開発
```bash
npm run dev
```
`wrangler pages dev public` が実行され、ローカルサーバー（http://localhost:8788）が立ち上がります。

### デプロイ
```bash
npm run deploy
```
Cloudflare Pages へプロジェクト全体をデプロイします。
