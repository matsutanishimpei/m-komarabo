import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  DB: D1Database
}

// パスを /api に限定
const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

// 悩み事を投稿するAPI -> パスは /api/post-issue になる
app.post('/post-issue', async (c) => {
  const { title, description, user_hash } = await c.req.json()
  
  // D1への保存ロジック（そのまま）
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO users (user_hash, role) VALUES (?, ?)'
  ).bind(user_hash, 'requester').run()

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE user_hash = ?'
  ).bind(user_hash).first()

  await c.env.DB.prepare(
    'INSERT INTO issues (requester_id, title, description) VALUES (?, ?, ?)'
  ).bind(user.id, title, description).run()

  return c.json({ success: true, message: '投稿完了しました！' })
})

// 悩み事の一覧取得 -> パスは /api/list-issues になる
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