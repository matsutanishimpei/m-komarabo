import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// トップページ
app.get('/', (c) => {
  return c.text('困りごとラボ 〜街の課題の試作室〜 起動中（DB接続完了）')
})

// 悩み事を投稿してDBに保存するAPI
app.post('/post-issue', async (c) => {
  const { title, description, user_hash } = await c.req.json()
  
  // 1. ユーザーがいなければ作成
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO users (user_hash, role) VALUES (?, ?)'
  ).bind(user_hash, 'requester').run()

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE user_hash = ?'
  ).bind(user_hash).first()

  // 2. 悩み事を保存
  await c.env.DB.prepare(
    'INSERT INTO issues (requester_id, title, description) VALUES (?, ?, ?)'
  ).bind(user.id, title, description).run()

  return c.json({ success: true, message: '投稿完了しました！' })
})

// 悩み事の一覧取得
app.get('/list-issues', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT issues.*, users.user_hash 
    FROM issues 
    JOIN users ON issues.requester_id = users.id
    ORDER BY created_at DESC
  `).all()
  return c.json(results)
})

export const onRequest = handle(app)