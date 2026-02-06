-- USERSテーブルにpassword_hashカラムを追加
ALTER TABLE users ADD COLUMN password_hash TEXT;
