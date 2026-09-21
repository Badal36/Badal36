// Badal36's vinyl "Now Playing" card. No dependencies, Node 18+.
// Called by .github/workflows/spotify.yml — writes assets/now-playing.svg

const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(), 'assets', 'now-playing.svg');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
           .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clip = (s, n) =>
  String(s).length > n ? String(s).slice(0, n - 1).trimEnd() + '…' : String(s);

function buildSvg({ label, title, line1, line2, art, spinning }) {
  const bars = spinning
    ? [0, 1, 2, 3, 4].map((i) => {
        const x = 178 + i * 6;
        const dur = (0.9 + i * 0.17).toFixed(2) + 's';
        const begin = (i * 0.13).toFixed(2) + 's';
        return `<rect x="${x}" y="36" width="3" height="9" rx="0.6" fill="#000">
  <animate attributeName="height" values="4;13;7;11;4" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>
  <animate attributeName="y" values="41;32;38;34;41" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>
</rect>`;
      }).join('\n        ')
    : `<rect x="178" y="34" width="3" height="11" fill="#000" opacity="0.65"/>
       <rect x="184" y="34" width="3" height="11" fill="#000" opacity="0.65"/>`;

  const artEl = art
    ? `<image x="55" y="55" width="60" height="60" preserveAspectRatio="xMidYMid slice" href="data:${art.mime};base64,${art.data}" clip-path="url(#label)"/>`
    : `<circle cx="85" cy="85" r="30" fill="#fff" opacity="0.92"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="170" viewBox="0 0 520 170" role="img" font-family="ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace">
  <title>Now Playing on Spotify</title>
  <defs><clipPath id="label"><circle cx="85" cy="85" r="30"/></clipPath></defs>

  <rect x="0.5" y="0.5" width="519" height="169" fill="#fff" stroke="#000"/>

  <g>
    <animateTransform attributeName="transform" type="rotate" from="0 85 85" to="360 85 85" dur="${spinning ? '3.5s' : '15s'}" repeatCount="indefinite"/>
    <circle cx="85" cy="85" r="68" fill="#000"/>
    <circle cx="85" cy="85" r="62" fill="none" stroke="#fff" stroke-opacity="0.10"/>
    <circle cx="85" cy="85" r="55" fill="none" stroke="#fff" stroke-opacity="0.08"/>
    <circle cx="85" cy="85" r="48" fill="none" stroke="#fff" stroke-opacity="0.12"/>
    <circle cx="85" cy="85" r="41" fill="none" stroke="#fff" stroke-opacity="0.06"/>
    <path d="M 85 17 A 68 68 0 0 1 146 49" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="2.5"/>
    <path d="M 85 153 A 68 68 0 0 1 24 121" fill="none" stroke="#fff" stroke-opacity="0.10" stroke-width="2"/>
    ${artEl}
    <circle cx="85" cy="85" r="3.5" fill="#fff"/>
    <circle cx="85" cy="85" r="1.4" fill="#000"/>
  </g>

  ${bars}
  <text x="216" y="45" font-size="11" letter-spacing="3" fill="#000">${esc(label)}</text>

  <text x="178" y="82"  font-size="19" font-weight="700" fill="#000">${esc(clip(title, 28))}</text>
  <text x="178" y="104" font-size="13" fill="#333">${esc(clip(line1, 40))}</text>
  <text x="178" y="123" font-size="11" fill="#777">${esc(clip(line2, 42))}</text>

  <text x="178" y="152" font-size="9" fill="#999">spotify · refreshed by GitHub Actions</text>
</svg>`;
}

async function getToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed → HTTP ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

async function api(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null; // nothing currently playing
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function getArt(images) {
  try {
    if (!images || !images.length) return null;
    const img = images.find((i) => (i.width || 0) >= 200 && (i.width || 0) <= 640)
             || images[images.length - 1];
    const res = await fetch(img.url);
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return { mime, data: Buffer.from(await res.arrayBuffer()).toString('base64') };
  } catch { return null; }
}

const trackInfo = (t) => ({
  title: t.name || 'Unknown track',
  line1: (t.artists || []).map((a) => a.name).join(', '),
  line2: (t.album && t.album.name) || '',
});

(async () => {
  try {
    const needed = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'];
    if (needed.some((k) => !process.env[k])) {
      throw new Error('missing secrets: ' + needed.join(' / '));
    }

    const token = await getToken();

    let np = null;
    try { np = await api('https://api.spotify.com/v1/me/player/currently-playing', token); } catch {}

    let state;
    if (np && np.item && np.item.name) {
      state = {
        label: np.is_playing ? 'NOW PLAYING' : 'PAUSED',
        ...trackInfo(np.item),
        art: await getArt(np.item.album && np.item.album.images),
        spinning: !!np.is_playing,
      };
    } else {
      let last = null;
      try { last = await api('https://api.spotify.com/v1/me/player/recently-played?limit=1', token); } catch {}
      const t = last && last.items && last.items[0] && last.items[0].track;
      state = t
        ? { label: 'LAST SPUN', ...trackInfo(t), art: await getArt(t.album && t.album.images), spinning: false }
        : { label: 'STANDBY', title: 'Nothing on the deck', line1: 'Spotify is quiet', line2: 'check back later', art: null, spinning: false };
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, buildSvg(state));
    console.log(`now-playing.svg → ${state.label} · ${state.title}`);
  } catch (err) {
    console.error('Widget failed:', err.message);
    if (fs.existsSync(OUT)) {
      console.error('Keeping previous SVG — profile stays online.');
    } else {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, buildSvg({
        label: 'STANDBY', title: 'Warming up',
        line1: 'trigger the workflow once', line2: 'Actions → Spotify — Now Playing',
        art: null, spinning: false,
      }));
    }
    process.exit(0); // a flaky API should never turn the badge red
  }
})();