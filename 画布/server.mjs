import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
const documentPath = path.join(dataDir, 'workspace.brainstorm.json');
const viewPath = path.join(dataDir, 'workspace.brainstorm.view.json');
const historyDir = path.join(dataDir, '.history');
const app = express();
const clients = new Set();
app.use(express.json({ limit: '2mb' }));

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}
function validate(doc) {
  if (!doc || doc.schema_version !== 1 || !doc.document || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) return 'Invalid document shape.';
  const ids = new Set();
  for (const node of doc.nodes) {
    if (!node.id || ids.has(node.id) || !node.title || !node.kind) return `Invalid or duplicate node: ${node.id || 'unknown'}`;
    ids.add(node.id);
  }
  for (const edge of doc.edges) if (!edge.id || !ids.has(edge.from) || !ids.has(edge.to)) return `Invalid edge: ${edge.id || 'unknown'}`;
  return null;
}
function notify() { for (const client of clients) client.write(`data: changed\n\n`); }

app.get('/api/document', (_req, res) => res.json(readJson(documentPath)));
app.put('/api/document', (req, res) => {
  const current = readJson(documentPath);
  const { expectedRevision, document } = req.body || {};
  if (current.document.revision !== expectedRevision) return res.status(409).json({ error: 'revision_conflict', current });
  const error = validate(document);
  if (error) return res.status(400).json({ error });
  fs.mkdirSync(historyDir, { recursive: true });
  atomicWrite(path.join(historyDir, `revision-${String(current.document.revision).padStart(5, '0')}.json`), current);
  document.document.revision = expectedRevision + 1;
  document.document.updated_at = new Date().toISOString();
  atomicWrite(documentPath, document);
  notify();
  res.json(document);
});
app.get('/api/view', (_req, res) => res.json(readJson(viewPath)));
app.put('/api/view', (req, res) => { atomicWrite(viewPath, req.body); res.json({ ok: true }); });
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders(); clients.add(res);
  req.on('close', () => clients.delete(res));
});

fs.watch(dataDir, (_event, filename) => {
  if (filename === path.basename(documentPath)) notify();
});
if (fs.existsSync(path.join(root, 'dist'))) app.use(express.static(path.join(root, 'dist')));
app.listen(4174, '127.0.0.1', () => console.log('Local file bridge: http://127.0.0.1:4174'));
