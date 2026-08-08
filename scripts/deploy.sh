#!/usr/bin/env bash
# さくらインターネットのサーバーへ、ビルド済みの静的ファイルをアップロードする。
#
# 使い方:
#   1) .env.deploy.example をコピーして .env.deploy を作り、サーバー情報を書く
#      （.env.deploy は .gitignore 対象なので誤ってコミットされない）
#   2) npm run build && npm run build:admin
#   3) bash scripts/deploy.sh
#
# 前提: さくらのSSH機能が有効になっていること
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DIR/.env.deploy"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE が見つかりません。.env.deploy.example をコピーして作成してください" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

: "${DEPLOY_HOST:?DEPLOY_HOST を .env.deploy に設定してください（例: example.sakura.ne.jp）}"
: "${DEPLOY_USER:?DEPLOY_USER を .env.deploy に設定してください}"
: "${DEPLOY_PATH:?DEPLOY_PATH を .env.deploy に設定してください（例: /home/xxxx/www）}"

TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [ ! -d "$DIR/dist" ]; then
  echo "❌ dist/ がありません。先に 'npm run build' を実行してください" >&2
  exit 1
fi

# --- 公開サイト本体 ---
# 注意: dist/data/ (public/data/spots.json) はアップロードしない。
# 管理画面（本番CGI）が本番の data/spots.json を直接書き換える運用になったため、
# ここで上書きするとローカルの古いデータで本番の最新データを消してしまう。
echo "🚀 ${TARGET}:${DEPLOY_PATH} へ公開サイトをアップロードします"
ssh "$TARGET" "mkdir -p '${DEPLOY_PATH}'"
scp -r "$DIR/dist/index.html" "$DIR/dist/assets" "$DIR/dist/.htaccess" "${TARGET}:${DEPLOY_PATH}/"
echo "✅ 公開サイト完了"

# --- 管理画面（推測されにくいURL配下） ---
if [ -n "${ADMIN_SECRET_PATH:-}" ]; then
  if [ ! -d "$DIR/dist-admin" ]; then
    echo "⚠️  dist-admin/ がありません。'npm run build:admin' を実行すれば管理画面もデプロイされます" >&2
  else
    ADMIN_REMOTE_DIR="${DEPLOY_PATH}/${ADMIN_SECRET_PATH}"
    echo "🚀 管理画面を ${TARGET}:${ADMIN_REMOTE_DIR} へアップロードします"
    ssh "$TARGET" "mkdir -p '${ADMIN_REMOTE_DIR}/api' '${DEPLOY_PATH}/photos'"
    scp -r "$DIR/dist-admin/." "${TARGET}:${ADMIN_REMOTE_DIR}/"
    scp "$DIR/admin-cgi/app.py" "$DIR/admin-cgi/index.cgi" "$DIR/admin-cgi/.htaccess" "${TARGET}:${ADMIN_REMOTE_DIR}/api/"
    ssh "$TARGET" "chmod +x '${ADMIN_REMOTE_DIR}/api/index.cgi'"
    echo "✅ 管理画面完了"
  fi
else
  echo "ℹ️  ADMIN_SECRET_PATH が未設定のため管理画面のデプロイはスキップしました"
fi
