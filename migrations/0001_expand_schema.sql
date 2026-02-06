-- ISSUESテーブルの拡張
-- 既存のテーブルに github_url を追加します（statusは既に存在するため除外）
ALTER TABLE issues ADD COLUMN github_url TEXT;

-- CERTIFICATESテーブルの作成
-- 実際のスキーマ案に基づき、解決証明を管理します
CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL UNIQUE,
    developer_id INTEGER NOT NULL,
    verification_key TEXT NOT NULL UNIQUE,
    valuation_score INTEGER,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

-- COMMENTSテーブルの新規作成
-- 各「困りごと」に対する進捗報告やフィードバックを保存します
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
