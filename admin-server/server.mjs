// 管理画面専用のローカルAPIサーバー。
// `npm run admin` で起動する。本番サーバーにはデプロイしない（ローカルでのデータ編集専用）。
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const DATA_FILE = path.join(PUBLIC_DIR, 'data', 'spots.json');
const PHOTOS_DIR = path.join(PUBLIC_DIR, 'photos');
const PORT = 5175;

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ローカル開発専用なので緩いCORSでOK
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use('/photos', express.static(PHOTOS_DIR));

async function readSpots() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeSpots(spots) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(spots, null, 2) + '\n', 'utf-8');
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * startIndex: ファイル名の連番の開始値（デフォルト1）。編集で写真を追加するときは、
 * 既存の写真の続きの番号から採番しないと同名ファイルを上書きしてしまう（実際に事故った）。
 */
async function saveUploadedPhotos(id, files, suffix = '', startIndex = 1) {
  if (!files || files.length === 0) return [];
  const dir = path.join(PHOTOS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const paths = [];
  let i = startIndex;
  for (const file of files) {
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${i}${suffix}${ext}`;
    await fs.writeFile(path.join(dir, filename), file.buffer);
    paths.push(`/photos/${id}/${filename}`);
    i++;
  }
  return paths;
}

/**
 * GoogleマップのURL（短縮リンク含む）から緯度経度を取り出す。
 * リダイレクト先のURLに含まれる !3d..!4d.. (正確なピン位置) または @lat,lng (表示中心) を探す。
 *
 * iOSアプリの「共有」から作られるリンクは、リダイレクト先が
 * `?q=住所+施設名&ftid=...` という座標を含まない形式になることがある
 * （JS実行しないと座標が取れないページ）。その場合は q= の住所テキストを
 * OpenStreetMap検索にかけるフォールバックを試す。
 */
async function resolveFromUrl(url) {
  const resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
  const finalUrl = resp.url;

  let m = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (!m) m = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    let name;
    const nm = finalUrl.match(/\/place\/([^/@]+)\//);
    if (nm) name = decodeURIComponent(nm[1]).replace(/\+/g, ' ');
    return { lat, lng, name };
  }

  // フォールバック: q= に入っている住所/施設名でテキスト検索してみる
  const qParam = new URL(finalUrl).searchParams.get('q');
  if (qParam) {
    try {
      return await resolveFromSearch(qParam);
    } catch {
      // このあと共通のエラーメッセージを投げる
    }
  }

  throw new Error(
    'このリンクからは位置を自動取得できませんでした（GoogleマップのiOS共有リンクなど、座標を含まない形式の可能性があります）。地図を直接タップして位置を指定してください。'
  );
}

/** 地名・施設名のテキスト検索（OpenStreetMapのNominatimを利用、APIキー不要） */
async function resolveFromSearch(query) {
  const params = new URLSearchParams({ q: query, format: 'json', limit: '1', 'accept-language': 'ja' });
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'osusume-map-admin/1.0' }
  });
  const results = await resp.json();
  if (!results.length) throw new Error('見つかりませんでした');
  const r = results[0];
  return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name };
}

app.get('/api/resolve', async (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (!raw) return res.status(400).json({ error: 'q は必須です' });
  try {
    const result = /^https?:\/\//.test(raw) ? await resolveFromUrl(raw) : await resolveFromSearch(raw);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/spots', async (_req, res) => {
  res.json(await readSpots());
});

const uploadPhotoFields = upload.fields([
  { name: 'photos', maxCount: 8 },
  { name: 'thumbnails', maxCount: 8 }
]);

app.post('/api/spots', uploadPhotoFields, async (req, res) => {
  const { name, category, region, lat, lng, description, address, url, tags } = req.body;
  if (!name || !category || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'name, category, lat, lng は必須です' });
  }
  const id = makeId();
  const photos = await saveUploadedPhotos(id, req.files?.photos);
  const photoThumbs = await saveUploadedPhotos(id, req.files?.thumbnails, '.thumb');
  const now = new Date().toISOString();
  const spot = {
    id,
    name,
    category,
    region: region || undefined,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    description: description || '',
    address: address || '',
    url: url || '',
    photos,
    photoThumbs: photoThumbs.length > 0 ? photoThumbs : undefined,
    tags: parseTags(tags),
    createdAt: now,
    updatedAt: now
  };
  const spots = await readSpots();
  spots.push(spot);
  await writeSpots(spots);
  res.status(201).json(spot);
});

app.put('/api/spots/:id', uploadPhotoFields, async (req, res) => {
  const spots = await readSpots();
  const idx = spots.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const existing = spots[idx];
  const { name, category, region, lat, lng, description, address, url, tags, removePhotos } = req.body;
  // 既存の写真の続き番号から採番する（1から採番し直すと既存ファイルを上書きしてしまう）。
  // 削除予約があっても、新規アップロードの採番は「削除前の元の枚数」基準のままにする
  // （削除処理と採番を同じ基準にすると、削除した番号を新規ファイルが再利用してしまい、
  //  ブラウザキャッシュ等と衝突するリスクがあるため）。
  const startIndex = (existing.photos?.length ?? 0) + 1;

  let currentPhotos = existing.photos ?? [];
  let currentThumbs = existing.photoThumbs ?? [];
  if (removePhotos) {
    let removeUrls;
    try {
      removeUrls = JSON.parse(removePhotos);
    } catch {
      removeUrls = [];
    }
    if (Array.isArray(removeUrls) && removeUrls.length > 0) {
      const removeSet = new Set(removeUrls);
      const keepPhotos = [];
      const keepThumbs = [];
      for (let i = 0; i < currentPhotos.length; i++) {
        const url = currentPhotos[i];
        if (removeSet.has(url)) {
          // 該当する実ファイルを削除（本体＋サムネイル）
          const relPhoto = url.replace(/^\/photos\//, '');
          await fs.rm(path.join(PHOTOS_DIR, relPhoto), { force: true });
          const thumbUrl = currentThumbs[i];
          if (thumbUrl) {
            const relThumb = thumbUrl.replace(/^\/photos\//, '');
            await fs.rm(path.join(PHOTOS_DIR, relThumb), { force: true });
          }
        } else {
          keepPhotos.push(url);
          keepThumbs.push(currentThumbs[i]);
        }
      }
      currentPhotos = keepPhotos;
      // 元のphotoThumbsが未設定（フルサイズのみ）だった場合はそのまま維持し、
      // それ以外はphotosと同じ並び・件数を保つ（インデックス対応が崩れないように）
      currentThumbs = (existing.photoThumbs ?? []).length === 0 ? [] : keepThumbs;
    }
  }

  const newPhotos = await saveUploadedPhotos(existing.id, req.files?.photos, '', startIndex);
  const newThumbs = await saveUploadedPhotos(existing.id, req.files?.thumbnails, '.thumb', startIndex);

  const finalPhotos = [...currentPhotos, ...newPhotos];
  const finalThumbs = [...currentThumbs, ...newThumbs];

  const updated = {
    ...existing,
    name: name ?? existing.name,
    category: category ?? existing.category,
    region: region !== undefined ? region || undefined : existing.region,
    lat: lat !== undefined ? parseFloat(lat) : existing.lat,
    lng: lng !== undefined ? parseFloat(lng) : existing.lng,
    description: description ?? existing.description,
    address: address ?? existing.address,
    url: url ?? existing.url,
    tags: tags !== undefined ? parseTags(tags) : existing.tags,
    photos: finalPhotos,
    photoThumbs: finalThumbs.length > 0 ? finalThumbs : undefined,
    updatedAt: new Date().toISOString()
  };
  spots[idx] = updated;
  await writeSpots(spots);
  res.json(updated);
});

app.delete('/api/spots/:id', async (req, res) => {
  const spots = await readSpots();
  const idx = spots.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const [removed] = spots.splice(idx, 1);
  await writeSpots(spots);

  const dir = path.join(PHOTOS_DIR, removed.id);
  await fs.rm(dir, { recursive: true, force: true });

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`✅ 管理API起動: http://localhost:${PORT}`);
  console.log(`   管理画面は http://localhost:5173/admin/ を開いてください（npm run dev も別途起動）`);
});
