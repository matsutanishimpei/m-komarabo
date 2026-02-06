-- issues テーブルに着手中の開発者を記録するカラムを追加
ALTER TABLE issues ADD COLUMN developer_id INTEGER REFERENCES users(id);
