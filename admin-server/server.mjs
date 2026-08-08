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

async function saveUploadedPhotos(id, files) {
  if (!files || files.length === 0) return [];
  const dir = path.join(PHOTOS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const paths = [];
  let i = 1;
  for (const file of files) {
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${i}${ext}`;
    await fs.writeFile(path.join(dir, filename), file.buffer);
    paths.push(`/photos/${id}/${filename}`);
    i++;
  }
  return paths;
}

app.get('/api/spots', async (_req, res) => {
  res.json(await readSpots());
});

app.post('/api/spots', upload.array('photos', 8), async (req, res) => {
  const { name, category, lat, lng, description, address, url, tags } = req.body;
  if (!name || !category || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'name, category, lat, lng は必須です' });
  }
  const id = makeId();
  const photos = await saveUploadedPhotos(id, req.files);
  const now = new Date().toISOString();
  const spot = {
    id,
    name,
    category,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    description: description || '',
    address: address || '',
    url: url || '',
    photos,
    tags: parseTags(tags),
    createdAt: now,
    updatedAt: now
  };
  const spots = await readSpots();
  spots.push(spot);
  await writeSpots(spots);
  res.status(201).json(spot);
});

app.put('/api/spots/:id', upload.array('photos', 8), async (req, res) => {
  const spots = await readSpots();
  const idx = spots.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const existing = spots[idx];
  const { name, category, lat, lng, description, address, url, tags } = req.body;
  const newPhotos = await saveUploadedPhotos(existing.id, req.files);

  const updated = {
    ...existing,
    name: name ?? existing.name,
    category: category ?? existing.category,
    lat: lat !== undefined ? parseFloat(lat) : existing.lat,
    lng: lng !== undefined ? parseFloat(lng) : existing.lng,
    description: description ?? existing.description,
    address: address ?? existing.address,
    url: url ?? existing.url,
    tags: tags !== undefined ? parseTags(tags) : existing.tags,
    photos: newPhotos.length > 0 ? [...(existing.photos ?? []), ...newPhotos] : existing.photos,
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
