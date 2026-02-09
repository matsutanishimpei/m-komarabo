-- ワクワク試作室のプロダクトテーブル
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    initial_prompt_log TEXT NOT NULL, -- AIとの壁打ち履歴（書き換え不可）
    sealed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dev_obsession TEXT, -- エンジニアのこだわり語り（更新可能）
    status TEXT DEFAULT 'published',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- サイト設定テーブル
CREATE TABLE IF NOT EXISTS site_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- デフォルトのベースプロンプトを挿入
INSERT INTO site_configs (key, value) VALUES (
    'wakuwaku_base_prompt',
    '# あなたの「誰得？」を形にしよう

あなたは今から、世界で誰も必要としていないかもしれないけれど、あなた自身が「これ、作りたい！」と思うアプリケーションを作ります。

## 壁打ちのルール
1. 「実用性」は一旦忘れてください
2. 「技術的好奇心」を最優先してください
3. 「誰が使うんだこれ（笑）」と言われるくらいがちょうどいい

## あなたのアイデアを教えてください
- どんなアプリを作りたいですか？
- なぜそれを作りたいと思ったのですか？
- どんな技術を使ってみたいですか？

さあ、あなたの変執的なこだわりを聞かせてください！'
);
