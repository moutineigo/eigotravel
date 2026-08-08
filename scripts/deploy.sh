#!/usr/bin/env bash
# さくらインターネットのサーバーへ、ビルド済みの静的ファイル(dist/)をアップロードする。
#
# 使い方:
#   1) .env.deploy.example をコピーして .env.deploy を作り、サーバー情報を書く
#      （.env.deploy は .gitignore 対象なので誤ってコミットされない）
#   2) npm run build
#   3) bash scripts/deploy.sh
#
# 前提: さくらのSSH機能が有効になっていること（コントロールパネルの「サーバー情報」→SSH で確認・有効化できる）
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

if [ ! -d "$DIR/dist" ]; then
  echo "❌ dist/ がありません。先に 'npm run build' を実行してください" >&2
  exit 1
fi

echo "🚀 ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH} へアップロードします"
rsync -avz --delete "$DIR/dist/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
echo "✅ 完了"
