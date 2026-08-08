# おすすめマップ

自分が実際に行っておすすめできる場所を、地図上のピンで紹介するサイト。
[eigo.travel](https://eigo.travel) の作り直し版。

## 技術構成

- **地図**: [Leaflet](https://leafletjs.com/) + OpenStreetMap（APIキー不要）
- **フロント**: Vite + TypeScript（フレームワーク無しのシンプル構成）
- **データ**: DB無し。`data/spots.json` 1ファイルで全スポットを管理
- **管理画面**: ローカル（Node）と本番（Python CGI）の2つのバックエンドで、同じ管理画面UI（`admin/`）を共有
- **公開**: 本番運用中 → https://eigo.travel/

旧サイト（Lit + Redux + Vaadin + Flask + SQLite + Google Maps）に比べて依存関係を大幅に減らし、
「スポットを1件追加する」だけの変更が誰でもすぐできる構成にしています。

## セットアップ（最初の1回だけ）

```bash
npm install
```

## 開発時の使い方

### サイトを確認する

```bash
npm run dev
```

`http://localhost:5173/` を開くと公開サイトが見られます。

### ピンを追加する方法

**方法A: Claude Codeにお願いする（一番手軽）**

「〇〇（場所名）を追加して」のように伝えると、`public/data/spots.json` を直接編集します。

**方法B: 管理画面を使う（ローカル）**

```bash
npm run dev      # ターミナル1
npm run admin    # ターミナル2
```

`http://localhost:5173/admin/` を開き、地図をタップ/クリックしてピンの位置を決め、フォームに入力して「この内容で登録する」を押すと
`public/data/spots.json` に自動で追記されます。写真は複数枚まとめて選択でき、`public/photos/` 以下に保存されます。

**方法C: 管理画面を使う（本番・iPhoneなど外出先から）**

本番にも同じ管理画面が、推測されにくいURL（`.env.deploy` の `ADMIN_SECRET_PATH`）に配置されています。
パスワード保護は無し（URLの秘匿性のみで保護）。**このURLは人に教えない・リンクを貼らないこと。**

本番の管理画面で登録・削除すると、サーバー上の `www/data/spots.json` を直接書き換えます（DB不要、CGI経由でファイルを直接読み書き）。
このため **一度本番で編集したら、サーバー上のデータが正になります**。ローカルの `public/data/spots.json` は
初期移行時のスナップショットのままなので、ローカルで新しいスポットを追加する前には本番から最新版を取得してください:

```bash
scp <本番サーバー>:/home/eigo55/www/data/spots.json public/data/spots.json
```

### カテゴリを増やしたい

`src/types.ts` の `Category` と `src/categories.ts` の `CATEGORIES` に追記してください。

## ビルド

```bash
npm run build         # 公開サイト → dist/
npm run build:admin   # 管理画面（本番用・相対パス） → dist-admin/
```

## さくらサーバーへのデプロイ

初回のみ:

```bash
cp .env.deploy.example .env.deploy
# .env.deploy を開いて、さくらのSSHホスト名・ユーザー名・公開先ディレクトリ・
# 管理画面の秘密パス(ADMIN_SECRET_PATH)を記入する
```

以後、公開するたびに:

```bash
npm run build
npm run build:admin
bash scripts/deploy.sh
```

`scripts/deploy.sh` がやること:
- 公開サイト（`dist/`）を `www/` にアップロード。**`data/spots.json` は上書きしない**（本番の管理画面が正のデータになっているため）
- 管理画面（`dist-admin/`）を `www/<ADMIN_SECRET_PATH>/` にアップロード
- 管理画面用のPython CGIバックエンド（`admin-cgi/`）を `www/<ADMIN_SECRET_PATH>/api/` にアップロードし、実行権限を付与

さくらのコントロールパネルでSSHが有効になっていない場合は、先に「サーバー情報」画面で有効化してください。

> 旧サイト（Lit + Flask + SQLiteの構成）はサーバー側の `/home/eigo55/www/` から削除済みです。
> 削除前のバックアップが `/home/eigo55/backup-old-eigo55-website-www-20260809.tar.gz` に残っています
> （`sqlite/app.db` の生データも含む。移行済みデータは `public/data/spots.json` にあります）。

## ディレクトリ構成

```
index.html              公開サイトのエントリーポイント
src/                     公開サイトのソース（TypeScript）
src/admin/               管理画面のソース（ローカル・本番で共有）
admin/index.html         管理画面のエントリーポイント
admin-server/            管理画面用のローカルAPIサーバー（Node/Express、本番未使用）
admin-cgi/               管理画面用の本番APIサーバー（Python/Flask、CGI経由でさくらにデプロイ）
public/data/spots.json   スポットデータの初期スナップショット（本番は www/data/spots.json が正）
public/photos/           アップロードされた写真（ローカル用）
scripts/deploy.sh        さくらサーバーへのデプロイスクリプト
vite.admin.config.ts     管理画面を相対パスでビルドするためのVite設定
```
