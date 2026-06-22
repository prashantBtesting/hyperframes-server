import { startServer } from '@hyperframes/producer/server';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';

const PORT    = parseInt(process.env.PORT || '8080');
const HF_PORT = 8081;          // HyperFrames runs internally
const CUT_DIR = '/tmp/hf-cuts';
mkdirSync(CUT_DIR, { recursive: true });

// token → absolute file path for cut videos
const cutStore = new Map();

// ─── Start HyperFrames internally (fire-and-forget — it's a blocking server loop) ──
console.log('[HF] Starting HyperFrames on internal port', HF_PORT);
startServer({ port: HF_PORT });   // no await, no .catch — runs concurrently

// Give HyperFrames ~3 s to boot before we start proxying
await Bun.sleep(3000);
console.log('[Server] HyperFrames ready. Starting public server on port', PORT);

// ─── FFmpeg cut handler ───────────────────────────────────────────────────────
async function handleFFmpegCut(req) {
  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoUrl, segments } = body;
  if (!videoUrl || !Array.isArray(segments) || segments.length === 0) {
    return Response.json({ error: 'videoUrl and segments[] required' }, { status: 400 });
  }

  const id        = randomUUID();
  const inputPath = join(CUT_DIR, `${id}_in.mp4`);
  const outPath   = join(CUT_DIR, `${id}_cut.mp4`);

  try {
    // 1. Download source video
    console.log(`[Cut ${id}] Downloading: ${videoUrl}`);
    await $`curl -L --max-time 120 -o ${inputPath} ${videoUrl}`.quiet();

    // 2. Build FFmpeg filter_complex for segment concat
    const filterParts = [];
    let concatInputs  = '';
    for (let i = 0; i < segments.length; i++) {
      const { start, end } = segments[i];
      filterParts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
      filterParts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
      concatInputs += `[v${i}][a${i}]`;
    }
    filterParts.push(`${concatInputs}concat=n=${segments.length}:v=1:a=1[vout][aout]`);
    const filter = filterParts.join(';');

    // 3. Run FFmpeg
    console.log(`[Cut ${id}] FFmpeg: ${segments.length} segments`);
    await $`ffmpeg -y -i ${inputPath} -filter_complex ${filter} -map [vout] -map [aout] -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k ${outPath}`.quiet();

    // 4. Cleanup input
    try { unlinkSync(inputPath); } catch {}

    // 5. Register output
    cutStore.set(id, outPath);
    const PUBLIC_URL  = process.env.PUBLIC_URL || 'https://hyperframes-server-production.up.railway.app';
    const cutVideoUrl = `${PUBLIC_URL}/cut-outputs/${id}`;
    console.log(`[Cut ${id}] Done → ${cutVideoUrl}`);
    return Response.json({ token: id, cutVideoUrl });

  } catch (err) {
    console.error(`[Cut ${id}] Failed:`, err?.message || err);
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outPath);   } catch {}
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// ─── Public server (proxy + /ffmpeg-cut + /cut-outputs/:token) ───────────────
Bun.serve({
  port: PORT,
  idleTimeout: 600,   // 10 min for long renders / cuts

  async fetch(req) {
    const url = new URL(req.url);

    // ── Custom: FFmpeg cut ────────────────────────────────────────────────────
    if (url.pathname === '/ffmpeg-cut' && req.method === 'POST') {
      return handleFFmpegCut(req);
    }

    // ── Custom: serve cut video files ─────────────────────────────────────────
    if (url.pathname.startsWith('/cut-outputs/')) {
      const token    = url.pathname.replace('/cut-outputs/', '').split('?')[0];
      const filePath = cutStore.get(token);
      if (!filePath || !existsSync(filePath)) {
        return new Response('Cut output not found', { status: 404 });
      }
      return new Response(Bun.file(filePath), {
        headers: {
          'Content-Type':        'video/mp4',
          'Content-Disposition': `attachment; filename="${token}.mp4"`,
          'Cache-Control':       'no-store',
        },
      });
    }

    // ── Proxy everything else to HyperFrames ──────────────────────────────────
    const proxyUrl = new URL(req.url);
    proxyUrl.hostname = '127.0.0.1';
    proxyUrl.port     = String(HF_PORT);

    try {
      const proxyReq = new Request(proxyUrl.toString(), {
        method:  req.method,
        headers: req.headers,
        body:    ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
        duplex:  'half',
      });
      return await fetch(proxyReq);
    } catch (err) {
      return new Response('Proxy error: ' + (err?.message || err), { status: 502 });
    }
  },
});

console.log('[Server] Ready on port', PORT);
