import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  DB: D1Database
}

// パスを /api に限定
const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

// パスワードをハッシュ化するユーティリティ
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ログイン・登録API
app.post('/login', async (c) => {
  const { user_hash, password } = await c.req.json()
  const password_hash = await hashPassword(password)

  // ユーザーの存在確認
  const existingUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE user_hash = ?'
  ).bind(user_hash).first()

  if (!existingUser) {
    // 新規登録
    await c.env.DB.prepare(
      'INSERT INTO users (user_hash, password_hash, role) VALUES (?, ?, ?)'
    ).bind(user_hash, password_hash, 'requester').run()
    return c.json({ success: true, isNew: true, message: '新規登録・ログインしました' })
  }

  // 既存ユーザーの認証
  if (existingUser.password_hash === password_hash) {
    return c.json({ success: true, isNew: false, message: 'ログインしました' })
  } else {
    return c.json({ success: false, message: 'パスワードが違います' }, 401)
  }
})

// 悩み事の一覧取得（フィルター対応） -> /api/list-issues?filter=all|mine&user_hash=...
app.get('/list-issues', async (c) => {
  const filter = c.req.query('filter') || 'all'
  const user_hash = c.req.query('user_hash')

  // developer_user_hash も取得できるように JOIN を追加
  let query = `
    SELECT 
      issues.*, 
      requester.user_hash as user_hash,
      developer.user_hash as developer_user_hash
    FROM issues 
    JOIN users as requester ON issues.requester_id = requester.id
    LEFT JOIN users as developer ON issues.developer_id = developer.id
  `
  let params: any[] = []

  if (filter === 'mine' && user_hash) {
    query += ' WHERE requester.user_hash = ?'
    params.push(user_hash)
  }

  query += ' ORDER BY created_at DESC'

  const { results, success, error } = await c.env.DB.prepare(query).bind(...params).all()
  if (!success) {
    console.error("D1 Error:", error)
    return c.json({ message: "データベースエラーが発生しました。マイグレーションが適用されているか確認してください。", error }, 500)
  }
  return c.json(results || [])
})

// ステータス更新（挙手・着手）API
app.post('/update-issue-status', async (c) => {
  const { id, status, user_hash } = await c.req.json()

  // 着手時は developer_id も更新
  if (status === 'progress' && user_hash) {
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE user_hash = ?').bind(user_hash).first()
    if (user) {
      await c.env.DB.prepare(
        'UPDATE issues SET status = ?, developer_id = ? WHERE id = ?'
      ).bind(status, user.id, id).run()
    }
  } else {
    await c.env.DB.prepare(
      'UPDATE issues SET status = ? WHERE id = ?'
    ).bind(status, id).run()
  }

  return c.json({ success: true, message: `ステータスを ${status} に更新しました` })
})

// 挙手を下ろす（キャンセル）API
app.post('/unassign-issue', async (c) => {
  const { id } = await c.req.json()

  await c.env.DB.prepare(
    'UPDATE issues SET status = "open", developer_id = NULL WHERE id = ?'
  ).bind(id).run()

  return c.json({ success: true, message: '挙手を下ろしました' })
})

// 悩み事の詳細取得API（コメント込み）
app.get('/get-issue-detail', async (c) => {
  const id = c.req.query('id')
  if (!id) return c.json({ message: 'IDが指定されていません' }, 400)

  // 1. 課題本体を取得
  const issue = await c.env.DB.prepare(`
    SELECT 
      issues.*, 
      requester.user_hash as requester_user_hash,
      developer.user_hash as developer_user_hash
    FROM issues 
    JOIN users as requester ON issues.requester_id = requester.id
    LEFT JOIN users as developer ON issues.developer_id = developer.id
    WHERE issues.id = ?
  `).bind(id).first()

  if (!issue) return c.json({ message: '課題が見つかりません' }, 404)

  // 2. コメント一覧を取得
  const { results: comments } = await c.env.DB.prepare(`
    SELECT comments.*, users.user_hash 
    FROM comments 
    JOIN users ON comments.user_id = users.id
    WHERE comments.issue_id = ?
    ORDER BY comments.created_at ASC
  `).bind(id).all()

  return c.json({ issue, comments: comments || [] })
})

// コメント投稿API
app.post('/post-comment', async (c) => {
  const { issue_id, content, user_hash } = await c.req.json()

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE user_hash = ?').bind(user_hash).first()
  if (!user) return c.json({ message: 'ユーザーが見つかりません' }, 404)

  await c.env.DB.prepare(
    'INSERT INTO comments (issue_id, user_id, content) VALUES (?, ?, ?)'
  ).bind(issue_id, user.id, content).run()

  return c.json({ success: true, message: 'コメントを投稿しました' })
})

// 悩み事を投稿するAPI -> パスは /api/post-issue になる
app.post('/post-issue', async (c) => {
  const { title, description, user_hash } = await c.req.json()

  // D1への保存ロジック（そのまま）
  // ユーザーはログイン済みである前提
  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE user_hash = ?'
  ).bind(user_hash).first()

  if (!user) {
    return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404)
  }

  await c.env.DB.prepare(
    'INSERT INTO issues (requester_id, title, description) VALUES (?, ?, ?)'
  ).bind(user.id, title, description).run()

  return c.json({ success: true, message: '投稿完了しました！' })
})

export const onRequest = handle(app)