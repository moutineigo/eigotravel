# おすすめマップ

自分が実際に行っておすすめできる場所を、地図上のピンで紹介するサイト。
[eigo.travel](https://eigo.travel) の作り直し版。

## 技術構成

- **地図**: [Leaflet](https://leafletjs.com/) + OpenStreetMap（APIキー不要）
- **フロント**: Vite + TypeScript（フレームワーク無しのシンプル構成）
- **データ**: DB無し。[public/data/spots.json](public/data/spots.json) 1ファイルで全スポットを管理
- **管理画面**: ローカルでだけ動く小さなAPIサーバー（`admin-server/`）。地図をクリックしてピンを追加・削除できる
- **公開**: `npm run build` で作った静的ファイルをさくらインターネットのサーバーにアップロードするだけ

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

### ピンを追加する方法（2通り）

**方法A: Claude Codeにお願いする（一番手軽）**

「〇〇（場所名）を追加して」のように伝えると、[public/data/spots.json](public/data/spots.json) を直接編集します。

**方法B: 管理画面を使う**

```bash
npm run dev      # ターミナル1
npm run admin    # ターミナル2
```

`http://localhost:5173/admin/` を開き、地図をクリックしてピンの位置を決め、フォームに入力して「この内容で追加する」を押すと
`spots.json` に自動で追記されます。写真もアップロードでき、`public/photos/` 以下に保存されます。
一覧から削除も可能です。

> 管理画面は開発専用です。本番ビルドには含まれません（`npm run build` では `index.html` だけがビルドされます）。

### カテゴリを増やしたい

[src/types.ts](src/types.ts) の `Category` と [src/categories.ts](src/categories.ts) の `CATEGORIES` に追記してください。

## ビルド

```bash
npm run build
```

`dist/` に公開用の静的ファイルが生成されます。

## さくらサーバーへのデプロイ

初回のみ:

```bash
cp .env.deploy.example .env.deploy
# .env.deploy を開いて、さくらのSSHホスト名・ユーザー名・公開先ディレクトリを記入する
```

以後、公開するたびに:

```bash
npm run build
bash scripts/deploy.sh
```

`dist/` の中身が `rsync` でサーバーにアップロードされます（SSH接続が必要）。
さくらのコントロールパネルでSSHが有効になっていない場合は、先に「サーバー情報」画面で有効化してください。

## ディレクトリ構成

```
index.html            公開サイトのエントリーポイント
src/                   公開サイトのソース（TypeScript）
src/admin/             管理画面のソース
admin/index.html       管理画面のエントリーポイント（開発時のみ）
admin-server/          管理画面用のローカルAPIサーバー（本番未使用）
public/data/spots.json スポットデータ本体
public/photos/         アップロードされた写真
scripts/deploy.sh       さくらサーバーへのデプロイスクリプト
```
