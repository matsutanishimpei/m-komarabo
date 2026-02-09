/**
 * 共通ユーティリティ関数
 * 全てのページで使用する共通機能を提供
 */

// ========================================
// 認証関連
// ========================================

/**
 * ログイン状態をチェック
 * @param {boolean} required - ログインが必須かどうか
 * @param {string} redirectTheme - リダイレクト先のテーマ ('komarabo' | 'wakuwaku')
 * @returns {Object|null} ユーザー情報 or null
 */
export function checkAuth(required = true, redirectTheme = 'komarabo') {
    const userHash = localStorage.getItem('user_hash');
    const authToken = localStorage.getItem('auth_token');

    if (!userHash || !authToken) {
        if (required) {
            alert('ログインが必要です');
            const redirectUrl = redirectTheme === 'wakuwaku' ? 'login.html#wakuwaku' : 'login.html';
            location.href = redirectUrl;
            throw new Error('Not logged in');
        }
        return null;
    }

    return { userHash, authToken };
}

/**
 * ログアウト処理
 * @param {string} redirectUrl - ログアウト後のリダイレクト先
 */
export function logout(redirectUrl = 'index.html') {
    localStorage.removeItem('user_hash');
    localStorage.removeItem('auth_token');
    alert('ログアウトしました');
    location.href = redirectUrl;
}

/**
 * 管理者権限をチェック
 * @returns {Promise<boolean>}
 */
export async function checkAdmin() {
    const auth = checkAuth(true);
    if (!auth) return false;

    try {
        const res = await fetch('/api/admin/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_hash: auth.userHash })
        });

        const data = await res.json();
        return data.is_admin === true;
    } catch (err) {
        console.error('管理者チェックエラー:', err);
        return false;
    }
}

// ========================================
// UI関連
// ========================================

/**
 * ユーザー名を表示
 * @param {string} elementId - 表示先の要素ID
 */
export function displayUserName(elementId = 'display_user_hash') {
    const auth = checkAuth(false);
    if (!auth) return;

    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = auth.userHash;
    }
}

/**
 * ローディング表示
 * @param {string} elementId - 表示先の要素ID
 * @param {string} message - ローディングメッセージ
 */
export function showLoading(elementId, message = '読み込み中...') {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="text-center py-20">
                <p class="text-gray-400">${message}</p>
            </div>
        `;
    }
}

/**
 * エラー表示
 * @param {string} elementId - 表示先の要素ID
 * @param {string} message - エラーメッセージ
 */
export function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="text-center py-20">
                <p class="text-red-400">${message}</p>
            </div>
        `;
    }
}

// ========================================
// API関連
// ========================================

/**
 * APIリクエストのラッパー
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} options - fetchオプション
 * @returns {Promise<Object>}
 */
export async function apiRequest(endpoint, options = {}) {
    try {
        const res = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || `API Error: ${res.status}`);
        }

        return data;
    } catch (err) {
        console.error(`API Request Error (${endpoint}):`, err);
        throw err;
    }
}

/**
 * 管理者専用APIリクエスト
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} body - リクエストボディ
 * @returns {Promise<Object>}
 */
export async function adminApiRequest(endpoint, body = {}) {
    const auth = checkAuth(true);
    if (!auth) throw new Error('Not authenticated');

    return apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            user_hash: auth.userHash,
            ...body
        })
    });
}

// ========================================
// 日付フォーマット
// ========================================

/**
 * 日付を日本語形式でフォーマット
 * @param {string|Date} date - 日付
 * @returns {string}
 */
export function formatDate(date) {
    return new Date(date).toLocaleDateString('ja-JP');
}

/**
 * 日付を詳細形式でフォーマット
 * @param {string|Date} date - 日付
 * @returns {string}
 */
export function formatDateTime(date) {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ========================================
// バリデーション
// ========================================

/**
 * 空文字チェック
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @returns {boolean}
 */
export function validateRequired(value, fieldName) {
    if (!value || value.trim() === '') {
        alert(`${fieldName}は必須です`);
        return false;
    }
    return true;
}

/**
 * URLバリデーション
 * @param {string} url - チェックするURL
 * @returns {boolean}
 */
export function validateUrl(url) {
    if (!url) return true; // 空の場合はOK（任意項目）

    try {
        new URL(url);
        return true;
    } catch {
        alert('有効なURLを入力してください');
        return false;
    }
}
