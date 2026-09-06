# frontend/scripts

Dev-only, one-off scripts. **Nothing here runs at build or runtime** and none of
it ships in the browser bundle.

## gen-taiwan-paths.mjs

Regenerates `src/lib/taiwan-paths.ts` — the checked-in Taiwan coastline used by
`components/TaiwanMap.tsx`.

```bash
cd frontend
node scripts/gen-taiwan-paths.mjs
```

- **No npm dependencies.** Plain Node ≥ 18 (`fetch`, `node:fs`). Douglas–Peucker
  is implemented inline.
- **Data source:** Natural Earth 1:10m, public domain
  (<https://www.naturalearthdata.com/about/terms-of-use/>):
  - `ne_10m_admin_0_countries.geojson` — Taiwan main island + 澎湖 + 綠島 + 蘭嶼
  - `ne_10m_minor_islands.geojson` — 小琉球, which Natural Earth drops from the
    countries layer. The script asserts it is present and fails loudly if a
    future data revision removes it (swap in another open source then — OSM
    coastline or 政府資料開放平臺 County boundaries).
- On first run the two GeoJSON files are downloaded to `scripts/.cache/`
  (git-ignored) and reused afterwards. Delete `.cache/` to force a fresh pull.
- **Projection:** identical linear map to `src/lib/geo.ts` `project()`
  (`MAP_W=300`, `MAP_H=420`, lon `119.3–122.1`, lat `21.7–25.35`). If you change
  the projection in `geo.ts`, change the constants at the top of this script too
  and rerun — the invariant is that `project(lat, lon)` and the coastline share
  one coordinate system.
- **Output:** two levels of detail (`TAIWAN_COAST_COARSE`, `TAIWAN_COAST_FINE`),
  per-island bounding boxes (`ISLAND_BOXES`) and `FULL_VIEW`. Tune `EPS_COARSE` /
  `EPS_FINE` (Douglas–Peucker epsilon, in SVG px) at the top of the script.

The generated file is committed; reviewers should re-run this and diff rather
than hand-editing `taiwan-paths.ts`.
