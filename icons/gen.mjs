// Discord event-icon generator: 16 event glyphs x 31 sets in 4 style families.
// Renders 128x128 PNGs via sharp + an HTML gallery with inline SVGs.
//
// Regenerate (no host Node needed):
//   docker run --rm -v "$PWD:/work" -w /work node:26-bookworm-slim \
//     sh -c "npm install sharp --no-audit --no-fund && OUT_DIR=/work/out node gen.mjs"
// then copy out/png/<set>/*.png over the set directories. ONLY_EVENTS=kick,ban
// (comma-separated) limits rendering to specific events.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = process.env.OUT_DIR || "./out";

// ---------- events ----------
const EVENTS = [
  { id: "join", label: "join", sem: "pos" },
  { id: "leave", label: "leave", sem: "neg" },
  { id: "rename", label: "rename", sem: "acc" },
  { id: "online", label: "online", sem: "pos" },
  { id: "offline", label: "offline", sem: "neg" },
  { id: "starting", label: "starting", sem: "acc" },
  { id: "installing", label: "installing", sem: "acc" },
  { id: "updating", label: "updating", sem: "acc" },
  { id: "updating-validate", label: "updating-validate", sem: "acc" },
  { id: "stopping", label: "stopping", sem: "neg" },
  { id: "restart", label: "restart", sem: "acc" },
  { id: "backup", label: "backup", sem: "acc" },
  { id: "settings", label: "settings", sem: "acc" },
  { id: "kick", label: "kick", sem: "neg" },
  { id: "ban", label: "ban", sem: "neg" },
  { id: "unban", label: "unban", sem: "pos" },
];

// ---------- glyphs (viewBox 128, centered) ----------
// c = main color, d = semantic detail color, cap = linecap style
function person(c, cap) {
  return `<circle cx="46" cy="42" r="13" fill="none" stroke="${c}" stroke-width="11"/>
  <path d="M24 96 c0-20 11-28 22-28 s22 8 22 28" fill="none" stroke="${c}" stroke-width="11" stroke-linecap="${cap}"/>`;
}
const GLYPHS = {
  join: (c, d, cap) => `${person(c, cap)}
    <path d="M106 60 H90" stroke="${d}" stroke-width="11" stroke-linecap="${cap}"/>
    <polygon points="76,60 92,47 92,73" fill="${d}"/>`,
  leave: (c, d, cap) => `${person(c, cap)}
    <path d="M80 60 H94" stroke="${d}" stroke-width="11" stroke-linecap="${cap}"/>
    <polygon points="110,60 94,47 94,73" fill="${d}"/>`,
  rename: (c, d, cap) => `
    <path d="M50 80 L82 48" stroke="${c}" stroke-width="16" stroke-linecap="${cap === "square" ? "square" : "round"}"/>
    <polygon points="38,92 46,72 58,84" fill="${d}"/>
    <path d="M36 102 H94" stroke="${c}" stroke-width="8" stroke-linecap="${cap}"/>`,
  online: (_c, d, cap) =>
    `<path d="M36 68 L58 90 L94 42" fill="none" stroke="${d}" stroke-width="14" stroke-linecap="${cap}" stroke-linejoin="round"/>`,
  offline: (_c, d, cap) =>
    `<path d="M42 42 L86 86 M86 42 L42 86" stroke="${d}" stroke-width="14" stroke-linecap="${cap}"/>`,
  starting: (_c, d) =>
    `<polygon points="48,36 48,92 98,64" fill="${d}" stroke="${d}" stroke-width="8" stroke-linejoin="round"/>`,
  stopping: (_c, d) => `<rect x="44" y="44" width="40" height="40" rx="9" fill="${d}"/>`,
  restart: (c, d, cap) => `
    <path d="M93 45 A34 34 0 1 0 98 64" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="${cap}"/>
    <polygon points="104,26 108,58 78,46" fill="${d}"/>`,
  updating: (c, d, cap) => `
    <path d="M64 30 V66" stroke="${c}" stroke-width="12" stroke-linecap="${cap}"/>
    <polygon points="64,88 42,62 86,62" fill="${d}"/>
    <path d="M38 100 H90" stroke="${c}" stroke-width="10" stroke-linecap="${cap}"/>`,
  "updating-validate": (c, d, cap) => `
    <path d="M52 28 V58" stroke="${c}" stroke-width="11" stroke-linecap="${cap}"/>
    <polygon points="52,78 33,54 71,54" fill="${c}"/>
    <path d="M70 84 L82 96 L104 68" fill="none" stroke="${d}" stroke-width="12" stroke-linecap="${cap}" stroke-linejoin="round"/>
    <path d="M34 100 H60" stroke="${c}" stroke-width="9" stroke-linecap="${cap}"/>`,
  installing: (c, d, cap) => `
    <path d="M40 64 H88 L82 98 H46 Z" fill="none" stroke="${c}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M40 64 L28 52 M88 64 L100 52" stroke="${c}" stroke-width="9" stroke-linecap="${cap}"/>
    <path d="M64 22 V40" stroke="${d}" stroke-width="11" stroke-linecap="${cap}"/>
    <polygon points="64,56 49,40 79,40" fill="${d}"/>`,
  backup: (c, d, _cap) => `
    <path d="M38 36 H82 L96 50 V96 H38 Z" fill="none" stroke="${c}" stroke-width="9" stroke-linejoin="round"/>
    <rect x="52" y="36" width="22" height="17" fill="${d}"/>
    <rect x="50" y="68" width="28" height="20" fill="none" stroke="${c}" stroke-width="8"/>`,
  kick: (c, d, cap) => `
    <path d="M42 24 H66 V56 L90 68 c10 5 10 24 -4 24 H42 Z" fill="${c}"/>
    <path d="M42 100 H86" stroke="${d}" stroke-width="9" stroke-linecap="${cap}"/>
    <path d="M100 64 L110 76 L100 88" fill="none" stroke="${d}" stroke-width="8" stroke-linecap="${cap}" stroke-linejoin="round"/>`,
  ban: (c, d, cap) => `
    <rect x="38" y="28" width="52" height="28" rx="6" fill="${c}"/>
    <rect x="26" y="24" width="14" height="36" rx="5" fill="${d}"/>
    <rect x="88" y="24" width="14" height="36" rx="5" fill="${d}"/>
    <path d="M64 56 V102" stroke="${c}" stroke-width="14" stroke-linecap="${cap}"/>`,
  unban: (c, d, cap) => `
    <path d="M64 26 V90" stroke="${c}" stroke-width="9" stroke-linecap="${cap}"/>
    <path d="M44 100 H84" stroke="${c}" stroke-width="9" stroke-linecap="${cap}"/>
    <circle cx="64" cy="24" r="6" fill="${d}"/>
    <path d="M32 40 H96" stroke="${d}" stroke-width="9" stroke-linecap="${cap}"/>
    <path d="M32 42 L21 62 M32 42 L43 62" stroke="${c}" stroke-width="5"/>
    <path d="M18 62 a14 14 0 0 0 28 0 Z" fill="${c}"/>
    <path d="M96 42 L85 62 M96 42 L107 62" stroke="${c}" stroke-width="5"/>
    <path d="M82 62 a14 14 0 0 0 28 0 Z" fill="${c}"/>`,
  settings: (c, d) => {
    let teeth = "";
    for (let i = 0; i < 8; i++) {
      teeth += `<rect x="57.5" y="20" width="13" height="18" rx="4" fill="${c}" transform="rotate(${i * 45} 64 64)"/>`;
    }
    return `${teeth}<circle cx="64" cy="64" r="23" fill="none" stroke="${c}" stroke-width="13"/><circle cx="64" cy="64" r="6" fill="${d}"/>`;
  },
};

// ---------- badges ----------
const squircle = (fill) => `<rect x="6" y="6" width="116" height="116" rx="30" fill="${fill}"/>`;
const squircleGrad = (id, from, to) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect x="6" y="6" width="116" height="116" rx="30" fill="url(#${id})"/>`;
const circleBadge = (fill, ring, ringW = 5) =>
  `<circle cx="64" cy="64" r="58" fill="${fill}"/>` +
  (ring
    ? `<circle cx="64" cy="64" r="53" fill="none" stroke="${ring}" stroke-width="${ringW}" opacity="0.9"/><circle cx="64" cy="64" r="53" fill="none" stroke="${ring}" stroke-width="12" opacity="0.18"/>`
    : "");
const hexBadge = (fill, border) =>
  `<polygon points="64,4 116,34 116,94 64,124 12,94 12,34" fill="${fill}" stroke="${border}" stroke-width="7" stroke-linejoin="round"/>`;
const shieldBadge = (fill, border) =>
  `<path d="M64 6 L114 26 V66 c0 32 -24 46 -50 56 C38 112 14 98 14 66 V26 Z" fill="${fill}" stroke="${border}" stroke-width="7" stroke-linejoin="round"/>`;
const octaBadge = (fill, border) =>
  `<polygon points="42,8 86,8 120,42 120,86 86,120 42,120 8,86 8,42" fill="${fill}" stroke="${border}" stroke-width="7" stroke-linejoin="round"/>`;
const squareBadge = (fill, border) =>
  `<rect x="10" y="10" width="108" height="108" fill="${fill}" stroke="${border}" stroke-width="8"/>`;
const sphereBadgeGrad = (id, stops, bottom, band, disc) => `
  <defs>
    <clipPath id="sp-${id}"><circle cx="64" cy="64" r="58"/></clipPath>
    <linearGradient id="sg-${id}" x1="0" y1="0" x2="1" y2="0">${stops
      .map((color, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${color}"/>`)
      .join("")}</linearGradient>
  </defs>
  <g clip-path="url(#sp-${id})">
    <rect x="0" y="0" width="128" height="64" fill="url(#sg-${id})"/>
    <rect x="0" y="64" width="128" height="64" fill="${bottom}"/>
    <rect x="0" y="56" width="128" height="16" fill="${band}"/>
  </g>
  <circle cx="64" cy="64" r="58" fill="none" stroke="${band}" stroke-width="5"/>
  <circle cx="64" cy="64" r="40" fill="${disc}" opacity="0.92"/>`;
const sphereBadge = (top, bottom, band, disc) => `
  <defs><clipPath id="sp"><circle cx="64" cy="64" r="58"/></clipPath></defs>
  <g clip-path="url(#sp)">
    <rect x="0" y="0" width="128" height="64" fill="${top}"/>
    <rect x="0" y="64" width="128" height="64" fill="${bottom}"/>
    <rect x="0" y="56" width="128" height="16" fill="${band}"/>
  </g>
  <circle cx="64" cy="64" r="58" fill="none" stroke="${band}" stroke-width="5"/>
  <circle cx="64" cy="64" r="40" fill="${disc}" opacity="0.92"/>`;
const stars = (color) =>
  `<circle cx="26" cy="30" r="3" fill="${color}" opacity=".9"/><circle cx="100" cy="24" r="2.4" fill="${color}" opacity=".8"/><circle cx="106" cy="98" r="2.8" fill="${color}" opacity=".85"/><circle cx="22" cy="100" r="2" fill="${color}" opacity=".7"/>`;
const sun = `<circle cx="100" cy="28" r="11" fill="#ffd75c"/>`;
const shine = `<rect x="6" y="6" width="116" height="34" rx="30" fill="#ffffff" opacity="0.14"/>`;

// ---------- sets ----------
const SETS = [
  // MODERN - flat squircles, muted considered grounds
  {
    id: "modern-slate",
    family: "Modern",
    badge: squircle("#2e3440"),
    c: "#e5e9f0",
    pos: "#a3be8c",
    neg: "#bf616a",
    acc: "#88c0d0",
  },
  {
    id: "modern-porcelain",
    family: "Modern",
    badge: squircle("#eef1f6"),
    c: "#232730",
    pos: "#2f9e63",
    neg: "#d64550",
    acc: "#3b6ef5",
  },
  {
    id: "modern-deepmint",
    family: "Modern",
    badge: squircle("#0e2b26"),
    c: "#d8fff2",
    pos: "#3ee6a0",
    neg: "#ff7a70",
    acc: "#2fd4c2",
  },
  {
    id: "modern-sunsetclay",
    family: "Modern",
    badge: squircle("#2b1d24"),
    c: "#ffe9d8",
    pos: "#8fd67a",
    neg: "#ff6b5c",
    acc: "#ff9e64",
  },
  {
    id: "modern-monoink",
    family: "Modern",
    badge: squircle("#141519"),
    c: "#9aa2ad",
    pos: "#ffffff",
    neg: "#ffffff",
    acc: "#ffffff",
  },
  {
    id: "modern-indigofade",
    family: "Modern",
    badge: squircleGrad("gi", "#4c6ef5", "#7048e8"),
    c: "#ffffff",
    pos: "#b3ffcf",
    neg: "#ffc2c2",
    acc: "#cdd7ff",
  },
  // COOL - neon rings on near-black
  {
    id: "cool-neoncyan",
    family: "Cool",
    badge: circleBadge("#060a12", "#00e5ff"),
    c: "#d9fbff",
    pos: "#34ffb0",
    neg: "#ff4d6d",
    acc: "#00e5ff",
  },
  {
    id: "cool-neonmagenta",
    family: "Cool",
    badge: circleBadge("#0d0614", "#ff3df5"),
    c: "#ffe3fd",
    pos: "#58ffc7",
    neg: "#ff5470",
    acc: "#ff3df5",
  },
  {
    id: "cool-volt",
    family: "Cool",
    badge: circleBadge("#0a1207", "#8aff2e"),
    c: "#efffe0",
    pos: "#8aff2e",
    neg: "#ff7043",
    acc: "#8aff2e",
  },
  {
    id: "cool-synthwave",
    family: "Cool",
    badge: squircleGrad("gs", "#2a1440", "#0e0b2e"),
    c: "#ffe9fb",
    pos: "#63ffe0",
    neg: "#ff5470",
    acc: "#ff5ce1",
  },
  {
    id: "cool-glacier",
    family: "Cool",
    badge: circleBadge("#0a1420", "#9bd9ff"),
    c: "#eaf6ff",
    pos: "#7dffcf",
    neg: "#ff8fa3",
    acc: "#9bd9ff",
  },
  {
    id: "cool-ember",
    family: "Cool",
    badge: circleBadge("#170b05", "#ff7a1a"),
    c: "#ffe9d2",
    pos: "#ffd166",
    neg: "#ff4747",
    acc: "#ff7a1a",
  },
  // GAMING - esports badges
  {
    id: "gaming-crimsonhex",
    family: "Gaming",
    badge: hexBadge("#1a1c24", "#ff4655"),
    c: "#ffffff",
    pos: "#2ee6a6",
    neg: "#ff4655",
    acc: "#ff4655",
  },
  {
    id: "gaming-goldhex",
    family: "Gaming",
    badge: hexBadge("#14161c", "#ffb02e"),
    c: "#ffffff",
    pos: "#6de08c",
    neg: "#ff5d5d",
    acc: "#ffb02e",
  },
  {
    id: "gaming-pixelgrid",
    family: "Gaming",
    badge: squareBadge("#0d0f0d", "#3df56b"),
    c: "#d7ffe3",
    pos: "#3df56b",
    neg: "#ff5d5d",
    acc: "#3df56b",
    cap: "square",
  },
  {
    id: "gaming-royalshield",
    family: "Gaming",
    badge: shieldBadge("#171a2b", "#6c7bff"),
    c: "#eef0ff",
    pos: "#58e6a8",
    neg: "#ff6b81",
    acc: "#6c7bff",
  },
  {
    id: "gaming-toxin",
    family: "Gaming",
    badge: hexBadge("#0f1410", "#9dff00"),
    c: "#f2ffe0",
    pos: "#9dff00",
    neg: "#ff6b4d",
    acc: "#9dff00",
  },
  {
    id: "gaming-carbonocta",
    family: "Gaming",
    badge: octaBadge("#1f1f22", "#d9dadd"),
    c: "#f2f2f4",
    pos: "#7ce3a8",
    neg: "#ff7070",
    acc: "#d9dadd",
  },
  // PALWORLD - Pal Sphere tiers + world motifs
  // Sphere tiers follow the in-game colors (paldb.cc/en/Sphere), Radar excluded
  {
    id: "pal-sphere-classic",
    family: "Palworld",
    badge: sphereBadge("#2f7fe0", "#e9edf3", "#232a36", "#17202e"),
    c: "#f4f8ff",
    pos: "#58e6a8",
    neg: "#ff6b6b",
    acc: "#6fc8ff",
  },
  {
    id: "pal-sphere-mega",
    family: "Palworld",
    badge: sphereBadge("#3dbb63", "#e9f3ec", "#1c2f24", "#12281c"),
    c: "#eafff2",
    pos: "#7dffb0",
    neg: "#ff6b6b",
    acc: "#8fe8ac",
  },
  {
    id: "pal-sphere-giga",
    family: "Palworld",
    badge: sphereBadge("#e8b422", "#f3efe4", "#33290f", "#2a220d"),
    c: "#fff6d8",
    pos: "#58e6a8",
    neg: "#ff6b6b",
    acc: "#ffd75c",
  },
  {
    id: "pal-sphere-hyper",
    family: "Palworld",
    badge: sphereBadge("#d94a2b", "#f3e9e6", "#33150c", "#2a110a"),
    c: "#ffece2",
    pos: "#58e6a8",
    neg: "#ffb0a0",
    acc: "#ff9e64",
  },
  {
    id: "pal-sphere-ultra",
    family: "Palworld",
    badge: sphereBadge("#e0409a", "#f3e6ee", "#33101f", "#2a0d1a"),
    c: "#ffe6f4",
    pos: "#63ffc9",
    neg: "#ff8fa3",
    acc: "#ff7ac2",
  },
  {
    id: "pal-sphere-legendary",
    family: "Palworld",
    badge: sphereBadge("#8b5cf6", "#e9e4f7", "#241b3a", "#1b1430"),
    c: "#f3ecff",
    pos: "#63ffc9",
    neg: "#ff6b8a",
    acc: "#c19bff",
  },
  {
    id: "pal-sphere-ultimate",
    family: "Palworld",
    badge: sphereBadgeGrad("ult", ["#2f58c9", "#6fb1ff"], "#e8edf7", "#101b33", "#0e1730"),
    c: "#eaf2ff",
    pos: "#6dffb0",
    neg: "#ff7a8a",
    acc: "#ffd75c",
  },
  {
    id: "pal-sphere-exotic",
    family: "Palworld",
    badge: sphereBadgeGrad(
      "exo",
      ["#ff5470", "#ffb84d", "#58e6a8", "#4dc9ff", "#b06bff"],
      "#efe9f5",
      "#221533",
      "#1d1129",
    ),
    c: "#fdf4ff",
    pos: "#63ffc9",
    neg: "#ff8fa3",
    acc: "#ff5ce1",
  },
  {
    id: "pal-sphere-sol",
    family: "Palworld",
    badge: sphereBadgeGrad("sol", ["#f7f3e8", "#dccfae"], "#efe6d2", "#a8842c", "#3a3220"),
    c: "#fff6e0",
    pos: "#8fd67a",
    neg: "#e2705c",
    acc: "#ffd75c",
  },
  {
    id: "pal-sphere-ancient",
    family: "Palworld",
    badge: sphereBadgeGrad("anc", ["#bfe8e6", "#8fc9c8"], "#eef7f6", "#2c4d4c", "#12302e"),
    c: "#eafffb",
    pos: "#7dffb0",
    neg: "#ff8f80",
    acc: "#7fe8df",
  },
  {
    id: "pal-meadow",
    family: "Palworld",
    badge: squircleGrad("gm", "#79d24a", "#3c9a22") + shine,
    c: "#f7ffee",
    pos: "#eaffc9",
    neg: "#ff7a5c",
    acc: "#ffe75c",
  },
  {
    id: "pal-skyfall",
    family: "Palworld",
    badge: squircleGrad("gk", "#6fc8ff", "#2f7fe0") + sun,
    c: "#f2faff",
    pos: "#b8ffd9",
    neg: "#ffb3ab",
    acc: "#ffd75c",
  },
  {
    id: "pal-midnight",
    family: "Palworld",
    badge: circleBadge("#101b33", "#26365c", 4) + stars("#ffd75c"),
    c: "#ffd75c",
    pos: "#6dffb0",
    neg: "#ff7a8a",
    acc: "#7ea8ff",
  },
];

function iconSvg(set, event) {
  const detail = event.sem === "pos" ? set.pos : event.sem === "neg" ? set.neg : set.acc;
  const cap = set.cap || "round";
  const glyph = GLYPHS[event.id](set.c, detail, cap);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${set.badge}${glyph}</svg>`;
}

// ---------- render ----------
const ONLY = (process.env.ONLY_EVENTS || "").split(",").filter(Boolean);
const ONLY_SETS = (process.env.ONLY_SETS || "").split(",").filter(Boolean);
const families = [...new Set(SETS.map((s) => s.family))];
let galleryBody = "";

for (const family of families) {
  galleryBody += `<section id="${family.toLowerCase()}"><h2>${family}</h2>`;
  for (const set of SETS.filter((s) => s.family === family)) {
    if (ONLY_SETS.length > 0 && !ONLY_SETS.includes(set.id)) continue;
    const dir = `${OUT}/png/${set.id}`;
    await mkdir(dir, { recursive: true });
    let row = "";
    for (const event of EVENTS) {
      const svg = iconSvg(set, event);
      if (ONLY.length === 0 || ONLY.includes(event.id)) {
        await sharp(Buffer.from(svg)).resize(128, 128).png().toFile(`${dir}/${event.id}.png`);
      }
      row += `<div class="cell" title="${event.label}">${svg}<span>${event.label}</span></div>`;
    }
    const sample = (cls) => `
      <div class="chat ${cls}">
        <p>${iconSvg(set, EVENTS[3])} <b>18:36</b> Server online</p>
        <p>${iconSvg(set, EVENTS[0])} <b>18:37</b> <code>jammsen</code> joined</p>
        <p>${iconSvg(set, EVENTS[8])} <b>18:40</b> SteamCMD - updating and validating</p>
        <p>${iconSvg(set, EVENTS[4])} <b>18:52</b> Server offline</p>
      </div>`;
    galleryBody += `
    <article class="set">
      <header><h3>${set.id}</h3><code>png/${set.id}/</code></header>
      <div class="row">${row}</div>
      <div class="chats">${sample("dark")}${sample("light")}</div>
    </article>`;
  }
  galleryBody += `</section>`;
}

const html = `<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Palworld event icons - pick &amp; choose</title>
<style>
  :root { --bg:#1e1f22; --surface:#2b2d31; --chat-dark:#313338; --chat-light:#ffffff;
          --text:#dbdee1; --muted:#949ba4; --accent:#5865f2; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; }
  .top { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid #111214;
         padding:0.9rem 1.4rem; display:flex; gap:1.2rem; align-items:baseline; flex-wrap:wrap; }
  .top h1 { font-size:1.05rem; margin:0; }
  .top nav { display:flex; gap:0.9rem; }
  .top a { color:var(--muted); text-decoration:none; font-size:0.9rem; }
  .top a:hover, .top a:focus-visible { color:var(--text); outline:none; }
  .top .hint { color:var(--muted); font-size:0.8rem; margin-left:auto; }
  main { max-width:72rem; margin:0 auto; padding:1.2rem 1.4rem 4rem; }
  h2 { font-size:1.3rem; margin:2.4rem 0 0.4rem; letter-spacing:0.01em; }
  .set { background:var(--surface); border-radius:10px; padding:1rem 1.2rem 1.2rem; margin-top:1rem; }
  .set header { display:flex; align-items:baseline; gap:0.9rem; margin-bottom:0.6rem; }
  .set h3 { margin:0; font-size:1rem; }
  .set header code { color:var(--muted); font-size:0.78rem; }
  .row { display:flex; flex-wrap:wrap; gap:0.7rem; }
  .cell { display:flex; flex-direction:column; align-items:center; gap:0.25rem; width:4.2rem; }
  .cell svg { width:52px; height:52px; }
  .cell span { font-size:0.62rem; color:var(--muted); letter-spacing:0.02em; }
  .chats { display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; margin-top:0.9rem; }
  .chat { border-radius:8px; padding:0.7rem 0.9rem; font-size:0.95rem; }
  .chat.dark { background:var(--chat-dark); color:#dbdee1; }
  .chat.light { background:var(--chat-light); color:#313338; }
  .chat p { margin:0.28rem 0; display:flex; align-items:center; gap:0.45rem; }
  .chat svg { width:22px; height:22px; flex:none; }
  .chat b { font-weight:500; opacity:0.65; font-variant-numeric:tabular-nums; }
  .chat code { font-family:ui-monospace,monospace; font-size:0.85em; background:rgba(128,128,128,0.18);
               border-radius:4px; padding:0.05em 0.3em; }
  @media (max-width:46rem) { .chats { grid-template-columns:1fr; } }
</style>
<div class="top">
  <h1>Palworld event icons</h1>
  <nav>${families.map((f) => `<a href="#${f.toLowerCase()}">${f}</a>`).join("")}</nav>
  <span class="hint">16 events x 31 sets - PNGs ready for Server Settings -&gt; Emoji -&gt; Upload</span>
</div>
<main>${galleryBody}</main>`;

await writeFile(`${OUT}/gallery.html`, html);
console.log(`done: ${SETS.length} sets x ${EVENTS.length} events = ${SETS.length * EVENTS.length} PNGs + gallery.html`);
