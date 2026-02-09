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

// 悩み事を削除するAPI（着手されていないもののみ）
app.post('/delete-issue', async (c) => {
  const { id, user_hash } = await c.req.json()

  // 1. 課題の存在確認と所有者チェック
  const issue = await c.env.DB.prepare(`
    SELECT issues.*, users.user_hash 
    FROM issues 
    JOIN users ON issues.requester_id = users.id
    WHERE issues.id = ?
  `).bind(id).first()

  if (!issue) {
    return c.json({ success: false, message: '課題が見つかりません' }, 404)
  }

  // 2. 投稿者本人かチェック
  if (issue.user_hash !== user_hash) {
    return c.json({ success: false, message: '自分の投稿のみ削除できます' }, 403)
  }

  // 3. 着手されていないかチェック（status='open' かつ developer_id=NULL）
  if (issue.status !== 'open' || issue.developer_id !== null) {
    return c.json({ success: false, message: '着手済みの課題は削除できません' }, 400)
  }

  // 4. 削除実行（関連コメントも削除）
  await c.env.DB.prepare('DELETE FROM comments WHERE issue_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM issues WHERE id = ?').bind(id).run()

  return c.json({ success: true, message: '課題を削除しました' })
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

// ========================================
// ワクワク試作室 API
// ========================================

// ベースプロンプト取得API
app.get('/wakuwaku/base-prompt', async (c) => {
  try {
    const config = await c.env.DB.prepare(
      'SELECT value FROM site_configs WHERE key = ?'
    ).bind('wakuwaku_base_prompt').first()

    return c.json({
      success: true,
      prompt: config?.value || 'プロンプトが設定されていません'
    })
  } catch (err) {
    console.error('Error fetching base prompt:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, message: 'プロンプトの取得に失敗しました: ' + errorMessage }, 500)
  }
})

// プロダクト一覧取得API
app.get('/wakuwaku/products', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      products.*,
      users.user_hash as creator_user_hash
    FROM products
    JOIN users ON products.creator_id = users.id
    WHERE products.status = 'published'
    ORDER BY products.created_at DESC
  `).all()

  return c.json(results || [])
})

// プロダクト詳細取得API
app.get('/wakuwaku/product/:id', async (c) => {
  const id = c.req.param('id')

  const product = await c.env.DB.prepare(`
    SELECT 
      products.*,
      users.user_hash as creator_user_hash
    FROM products
    JOIN users ON products.creator_id = users.id
    WHERE products.id = ?
  `).bind(id).first()

  if (!product) {
    return c.json({ message: 'プロダクトが見つかりません' }, 404)
  }

  return c.json(product)
})

// プロダクト投稿API
app.post('/wakuwaku/post-product', async (c) => {
  try {
    const { title, url, initial_prompt_log, dev_obsession, user_hash } = await c.req.json()

    // バリデーション
    if (!title || !initial_prompt_log) {
      return c.json({ success: false, message: 'タイトルと初期衝動履歴は必須です' }, 400)
    }

    // ユーザー確認
    const user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    if (!user) {
      return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404)
    }

    // プロダクト作成
    await c.env.DB.prepare(`
      INSERT INTO products (creator_id, title, url, initial_prompt_log, dev_obsession, sealed_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(user.id, title, url || null, initial_prompt_log, dev_obsession || null).run()

    return c.json({ success: true, message: 'プロダクトを投稿しました！' })
  } catch (err) {
    console.error('Error posting product:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, message: 'プロダクトの投稿に失敗しました: ' + errorMessage }, 500)
  }
})

// プロダクト更新API（initial_prompt_logは更新不可）
app.post('/wakuwaku/update-product', async (c) => {
  const { id, title, url, dev_obsession, user_hash } = await c.req.json()

  // 既存プロダクト確認
  const existingProduct = await c.env.DB.prepare(`
    SELECT products.*, users.user_hash
    FROM products
    JOIN users ON products.creator_id = users.id
    WHERE products.id = ?
  `).bind(id).first()

  if (!existingProduct) {
    return c.json({ success: false, message: 'プロダクトが見つかりません' }, 404)
  }

  // 投稿者本人確認
  if (existingProduct.user_hash !== user_hash) {
    return c.json({ success: false, message: '自分の投稿のみ編集できます' }, 403)
  }

  // initial_prompt_logの更新を試みた場合はエラー
  // （フロントエンドでは送信しないが、念のため）

  // 更新（initial_prompt_logとsealed_atは除外）
  await c.env.DB.prepare(`
    UPDATE products 
    SET title = ?, url = ?, dev_obsession = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(title, url || null, dev_obsession || null, id).run()

  return c.json({ success: true, message: 'プロダクトを更新しました' })
})

// ========================================
// 管理機能 API
// ========================================

// ベースプロンプト更新API（管理者用）
app.post('/admin/update-base-prompt', async (c) => {
  const { prompt, user_hash } = await c.req.json()

  // TODO: 管理者権限チェック（現状は省略）

  await c.env.DB.prepare(`
    UPDATE site_configs 
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = 'wakuwaku_base_prompt'
  `).bind(prompt).run()

  return c.json({ success: true, message: 'ベースプロンプトを更新しました' })
})

export const onRequest = handle(app)