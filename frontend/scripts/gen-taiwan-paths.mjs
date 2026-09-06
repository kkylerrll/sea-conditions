// One-off generator for src/lib/taiwan-paths.ts — NOT run at build or runtime.
//
// Why this exists: the old TaiwanMap drew the coast from 21 hand-typed points
// smoothed with Catmull-Rom plus plain ellipses for the offshore islands. It
// read as a doughy blob and could not support zooming to island level.
//
// Data source: Natural Earth 1:10m (public domain — https://www.naturalearthdata.com/about/terms-of-use/).
//   - ne_10m_admin_0_countries.geojson : Taiwan main island + 澎湖(3 polys) + 綠島 + 蘭嶼
//   - ne_10m_minor_islands.geojson     : 小琉球  (Natural Earth drops it from the
//                                        countries layer — verified below, see EXPECT)
// Both files are CC0/public-domain and redistributable. We keep only the polygons
// inside the map window and whitelisted by location; everything else (金門, the
// 外傘頂洲 sandbar, stray rocks) is discarded so the art direction matches the
// original: main island + 3 Penghu blobs + 綠島 + 蘭嶼 + 小琉球.
//
// Output: two levels of detail (Douglas–Peucker, epsilon in SVG px) as single
// concatenated path `d` strings, plus per-island bounding boxes for zoom-to-island.
// Projection is byte-for-byte the same linear map as src/lib/geo.ts, so existing
// lat/lon markers keep landing in the same spot.
//
// Re-run:  cd frontend && node scripts/gen-taiwan-paths.mjs
//          (downloads the two GeoJSON files to scripts/.cache/ on first run, then
//           reuses the cache; delete .cache/ to force a fresh pull.)

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".cache");
const OUT = join(HERE, "..", "src", "lib", "taiwan-paths.ts");

// ---- projection: MUST stay identical to src/lib/geo.ts ----------------------
const MAP_W = 300;
const MAP_H = 420;
const LON_MIN = 119.3;
const LON_MAX = 122.1;
const LAT_MIN = 21.7;
const LAT_MAX = 25.35;
const project = (lat, lon) => [
  ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W,
  ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_H,
];

// ---- level-of-detail + small-island exaggeration --------------------------
// In this 300x420 projection the offshore islands are only a few SVG units
// across at true scale (綠島 ~5u, 小琉球 ~4u) — at whole-country zoom they cannot
// show any shape at true scale. So the COARSE path draws each small island
// ENLARGED about its own centroid; the centroid stays at the true projected
// position, so the lat/lon pins still line up. Once the user zooms into an
// island the component swaps to the FINE path, which is true-scale and NOT
// exaggerated.
const EXAGGERATION = {
  main: 1,
  penghu: 2.0, // already a ~30u cluster, only needs a nudge
  lyudao: 4.0, // 綠島
  lanyu: 2.6, // 蘭嶼 (the largest of the offshore islands)
  xiaoliuqiu: 4.5, // 小琉球 (the smallest)
};
// Douglas–Peucker epsilon is derived PER POLYGON from that polygon's own
// diagonal (after any exaggeration), clamped to [floor, cap] px — so no single
// global value can annihilate a small island.
const EPS = {
  coarse: { frac: 0.02, floor: 0.15, cap: 0.6 }, // whole-Taiwan view
  fine: { frac: 0.006, floor: 0.03, cap: 0.15 }, // zoomed into an island
};

// ---- offshore-island whitelist: representative lat/lon + match radius (deg) --
// "main" is not matched by radius — it's picked as the single largest polygon,
// so 金門 (out of the map window) and the 外傘頂洲 sandbar fall through and are
// dropped rather than being lumped into the mainland.
const ISLANDS = {
  penghu: { lat: 23.57, lon: 119.58, r: 0.45 },
  lyudao: { lat: 22.66, lon: 121.49, r: 0.15 },
  lanyu: { lat: 22.04, lon: 121.54, r: 0.15 },
  xiaoliuqiu: { lat: 22.34, lon: 120.36, r: 0.12 },
};
const ISLAND_ORDER = ["main", "penghu", "lyudao", "lanyu", "xiaoliuqiu"];

const SOURCES = {
  countries: {
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
    file: join(CACHE, "ne_10m_admin_0_countries.geojson"),
  },
  minor: {
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_minor_islands.geojson",
    file: join(CACHE, "ne_10m_minor_islands.geojson"),
  },
};

async function load(src) {
  if (existsSync(src.file)) return JSON.parse(readFileSync(src.file, "utf8"));
  process.stderr.write(`fetching ${src.url}\n`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url} -> HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(src.file, text);
  return JSON.parse(text);
}

// ---- helpers --------------------------------------------------------------
function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

function classify([lon, lat]) {
  let best = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(ISLANDS)) {
    const d = Math.hypot(lon - c.lon, lat - c.lat);
    if (d <= c.r && d < bestD) {
      best = name;
      bestD = d;
    }
  }
  return best;
}

// Douglas–Peucker on [x,y] px points, fixed endpoints.
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let dmax = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = Math.abs(dx * (ay - py) - (ax - px) * dy) / len;
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

function pxCentroid(open) {
  let x = 0;
  let y = 0;
  for (const [px, py] of open) {
    x += px;
    y += py;
  }
  return [x / open.length, y / open.length];
}

function pxBbox(open) {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const [x, y] of open) {
    a = Math.min(a, x);
    b = Math.min(b, y);
    c = Math.max(c, x);
    d = Math.max(d, y);
  }
  return { minX: a, minY: b, w: c - a, h: d - b, diag: Math.hypot(c - a, d - b) };
}

function scaleAbout(open, [cx, cy], f) {
  return open.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
}

// Rotate an open ring so it starts at the vertex farthest from the centroid.
// That gives RDP two meaningful, well-separated fixed endpoints and stops a
// tiny blob from collapsing to a 2-point degenerate sliver.
function rotateToFarthest(open) {
  const [cx, cy] = pxCentroid(open);
  let bi = 0;
  let bd = -1;
  for (let i = 0; i < open.length; i++) {
    const dd = Math.hypot(open[i][0] - cx, open[i][1] - cy);
    if (dd > bd) {
      bd = dd;
      bi = i;
    }
  }
  return open.slice(bi).concat(open.slice(0, bi));
}

function simplifyClosed(pxRing, eps) {
  let open = pxRing.slice(0, -1); // drop duplicate closing point
  if (open.length > 4) open = rotateToFarthest(open);
  return rdp(open, eps);
}

function epsFor(diag, level) {
  const e = EPS[level];
  return Math.min(e.cap, Math.max(e.floor, diag * e.frac));
}

function toPath(rings) {
  return rings
    .map((r) => {
      const [x0, y0] = r[0];
      let d = `M${x0.toFixed(2)} ${y0.toFixed(2)}`;
      for (let i = 1; i < r.length; i++) d += `L${r[i][0].toFixed(2)} ${r[i][1].toFixed(2)}`;
      return `${d}Z`;
    })
    .join("");
}

// ---- collect whitelisted rings (as lon/lat) per island -------------------
const countries = await load(SOURCES.countries);
const minor = await load(SOURCES.minor);

const twn = countries.features.find(
  (f) => f.properties.ADMIN === "Taiwan" || f.properties.NAME === "Taiwan",
);
if (!twn) throw new Error("Taiwan feature not found in countries layer");

/** @type {Record<string, number[][][]>} island -> array of lon/lat rings */
const groups = Object.fromEntries(ISLAND_ORDER.map((k) => [k, []]));

// projected-area of a lon/lat ring (shoelace, px²), used only to find the mainland
function projArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = project(ring[i][1], ring[i][0]);
    const [x2, y2] = project(ring[i + 1][1], ring[i + 1][0]);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

const countryRings = twn.geometry.coordinates.map((poly) => poly[0]); // no holes
let mainRing = countryRings[0];
for (const ring of countryRings) if (projArea(ring) > projArea(mainRing)) mainRing = ring;
groups.main.push(mainRing);

for (const ring of countryRings) {
  if (ring === mainRing) continue;
  const who = classify(ringCentroid(ring));
  if (who) groups[who].push(ring);
  else process.stderr.write(`dropped country polygon @ ${ringCentroid(ring).map((v) => v.toFixed(2))}\n`);
}

// 小琉球 from the minor-islands layer
let xlqRings = 0;
for (const f of minor.features) {
  const geoms = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of geoms) {
    const ring = poly[0];
    if (classify(ringCentroid(ring)) === "xiaoliuqiu") {
      groups.xiaoliuqiu.push(ring);
      xlqRings++;
    }
  }
}

// ---- sanity: every required island must be represented -------------------
const EXPECT = ["main", "penghu", "lyudao", "lanyu", "xiaoliuqiu"];
for (const k of EXPECT) {
  if (groups[k].length === 0) throw new Error(`island "${k}" has no polygons — data source changed?`);
}
if (xlqRings === 0) throw new Error("小琉球 not found in ne_10m_minor_islands — pick another source");

// ---- project, (exaggerate,) simplify, build paths + boxes ---------------
function buildLOD(level) {
  const parts = [];
  for (const name of ISLAND_ORDER) {
    const f = level === "coarse" ? EXAGGERATION[name] ?? 1 : 1;
    for (const ring of groups[name]) {
      let px = ring.map(([lon, lat]) => project(lat, lon));
      if (f !== 1) {
        const open = px.slice(0, -1);
        px = [...scaleAbout(open, pxCentroid(open), f), px[px.length - 1]];
        // keep it closed: last point mirrors the (now scaled) first
        px[px.length - 1] = px[0];
      }
      const eps = epsFor(pxBbox(px.slice(0, -1)).diag, level);
      parts.push({ name, ring: simplifyClosed(px, eps) });
    }
  }
  return parts;
}

const coarse = buildLOD("coarse");
const fine = buildLOD("fine");

// bounding boxes from the FINE projection (tightest), per island group
const boxes = {};
for (const name of ISLAND_ORDER) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of groups[name]) {
    for (const [lon, lat] of ring) {
      const [x, y] = project(lat, lon);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  boxes[name] = {
    x: +minX.toFixed(2),
    y: +minY.toFixed(2),
    w: +(maxX - minX).toFixed(2),
    h: +(maxY - minY).toFixed(2),
  };
}

const coarsePts = coarse.reduce((n, p) => n + p.ring.length, 0);
const finePts = fine.reduce((n, p) => n + p.ring.length, 0);
process.stderr.write(
  `coarse: ${coarse.length} rings / ${coarsePts} pts   fine: ${fine.length} rings / ${finePts} pts\n`,
);
for (const name of ISLAND_ORDER) {
  const cr = coarse.filter((p) => p.name === name);
  const fr = fine.filter((p) => p.name === name);
  const cDiag = Math.max(...cr.map((p) => pxBbox(p.ring).diag));
  process.stderr.write(
    `  ${name.padEnd(11)} coarse ${cr.reduce((n, p) => n + p.ring.length, 0)}pts diag ${cDiag.toFixed(1)}u` +
      `   fine ${fr.reduce((n, p) => n + p.ring.length, 0)}pts\n`,
  );
}

// ---- hard asserts: no required island may collapse in either LOD --------
for (const name of EXPECT) {
  const cr = coarse.filter((p) => p.name === name);
  const fr = fine.filter((p) => p.name === name);
  const cPts = cr.reduce((n, p) => n + p.ring.length, 0);
  const fPts = fr.reduce((n, p) => n + p.ring.length, 0);
  const cDiag = Math.max(...cr.map((p) => pxBbox(p.ring).diag));
  if (cr.length === 0 || cPts < 5 * cr.length || cDiag < 6) {
    throw new Error(
      `island "${name}" collapsed in COARSE LOD (rings=${cr.length}, pts=${cPts}, diag=${cDiag.toFixed(1)}u) — tune EXAGGERATION / EPS`,
    );
  }
  if (fr.length === 0 || fPts < 4 * fr.length) {
    throw new Error(`island "${name}" collapsed in FINE LOD (rings=${fr.length}, pts=${fPts})`);
  }
}

// ---- emit ---------------------------------------------------------------
const banner = `// AUTO-GENERATED by scripts/gen-taiwan-paths.mjs — DO NOT EDIT BY HAND.
//
// Coastline: Natural Earth 1:10m, public domain
//   (https://www.naturalearthdata.com/about/terms-of-use/).
//   - ne_10m_admin_0_countries.geojson : Taiwan main island, 澎湖, 綠島, 蘭嶼
//   - ne_10m_minor_islands.geojson     : 小琉球 (absent from the countries layer)
// Douglas–Peucker, epsilon derived per polygon from its own size:
//   COARSE (whole-Taiwan view)  — offshore islands drawn ENLARGED about their
//          own centroid so they read as islands, not specks. Factors:
//          ${ISLAND_ORDER.filter((k) => EXAGGERATION[k] !== 1)
            .map((k) => `${k} ${EXAGGERATION[k]}x`)
            .join(", ")}
//   FINE   (zoomed into an island) — true scale, NO exaggeration.
// The centroid of each enlarged island stays at its true projected position,
// so lat/lon markers still land correctly. Projection: identical linear map to
// src/lib/geo.ts project() — DO NOT diverge.
// Re-generate: cd frontend && node scripts/gen-taiwan-paths.mjs`;

const ts = `${banner}

export interface IslandBox {
  /** SVG user-unit rect in the ${MAP_W}×${MAP_H} coordinate system of lib/geo.ts */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type IslandKey = ${ISLAND_ORDER.map((k) => `"${k}"`).join(" | ")};

/** All landmasses, one path, whole-country view. Offshore islands are drawn
 *  enlarged about their true centroid so they are visible at this zoom. */
export const TAIWAN_COAST_COARSE =
  ${JSON.stringify(toPath(coarse.map((p) => p.ring)))};

/** All landmasses, one path, true scale + higher detail — swap in once zoomed
 *  past the LOD threshold (i.e. once an island fills enough of the viewport). */
export const TAIWAN_COAST_FINE =
  ${JSON.stringify(toPath(fine.map((p) => p.ring)))};

/** Tight bounding box per island group, for animating the viewBox to an island. */
export const ISLAND_BOXES: Record<IslandKey, IslandBox> = ${JSON.stringify(boxes, null, 2)};

/** The full country view (the whole projected canvas). */
export const FULL_VIEW: IslandBox = { x: 0, y: 0, w: ${MAP_W}, h: ${MAP_H} };
`;

writeFileSync(OUT, ts);
process.stderr.write(`wrote ${OUT}\n`);
