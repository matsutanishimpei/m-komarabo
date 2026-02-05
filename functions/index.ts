import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
// serveStatic は不要。Pagesでは勝手に配信されるはずですが、
// Honoが邪魔している可能性があるので、明示的に「何もしない」ルートを作ります。

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// ★ここがポイント：Honoに「/」へのアクセスを無視させる（静的ファイルにパススルーさせる）
// もしこれでもダメなら、以下を試してください
app.get('/', async (c) => {
  // Honoで何も返さず、Pagesの静的ファイル配信に任せるための「おまじない」
  return c.next()
})

// 悩み事を投稿してDBに保存するAPI
app.post('/post-issue', async (c) => {
  const { title, description, user_hash } = await c.req.json()
  
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