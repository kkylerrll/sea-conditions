import { describe, expect, it } from "vitest";

import { bestDay, cellFor, collectDates, dayStats, excludedToday, rankDays, scoreFor, sortRows } from "./bestDay";
import type { Condition, Location, Rating } from "./types";

type Day = [date: string, rating: Rating, score: number | null];

function cond(date: string, rating: Rating, score: number | null): Condition {
  return {
    date,
    source: "test",
    fetched_at: null,
    wave_height_m: null,
    wave_period_s: null,
    wave_dir: null,
    wind_speed_ms: null,
    wind_scale: null,
    wind_dir: null,
    gust_ms: null,
    water_temp_c: null,
    visibility_m: null,
    tide_high: null,
    tide_low: null,
    rating: "unknown",
    rating_score: null,
    rating_reasons: [],
    ratings: { dive: { rating, score, reasons: [] }, surf: null },
    advice_text: null,
    advice_model: null,
  };
}

function loc(slug: string, name: string, days: Day[]): Location {
  return {
    slug,
    name,
    name_en: null,
    region: "",
    blurb: "",
    spots: [],
    activities: ["scuba"],
    lat: 0,
    lon: 0,
    today: null,
    forecast: days.map(([d, r, s]) => cond(d, r, s)),
  };
}

const D1 = "2026-11-19";
const D2 = "2026-11-20";
const D3 = "2026-11-21";

describe("scoreFor", () => {
  it("沒有 ratings 時潛水退回 rating_score，衝浪回 null", () => {
    const c = { ...cond(D1, "green", null), ratings: null, rating_score: 72 };
    expect(scoreFor(c, "dive")).toBe(72);
    expect(scoreFor(c, "surf")).toBeNull();
  });
});

describe("collectDates", () => {
  it("取聯集、去掉今天以前、排序、最多 7 天", () => {
    const a = loc("a", "甲", [["2026-11-18", "green", 80], [D2, "green", 80]]);
    const b = loc("b", "乙", [[D1, "red", 10], [D3, "red", 10]]);
    expect(collectDates([a, b], D1)).toEqual([D1, D2, D3]);
    const many = loc("m", "多", Array.from({ length: 9 }, (_, i) => [`2026-12-0${i + 1}`, "green", 1] as Day));
    expect(collectDates([many], "2026-12-01")).toHaveLength(7);
  });
});

describe("cellFor", () => {
  it("那天沒有資料 → unknown", () => {
    expect(cellFor(loc("a", "甲", [[D1, "green", 80]]), D2, "dive")).toEqual({ rating: "unknown", score: null });
  });
});

describe("rankDays / bestDay", () => {
  it("綠燈數優先，其次黃燈數", () => {
    const locs = [
      loc("a", "甲", [[D1, "green", 70], [D2, "yellow", 50], [D3, "green", 75]]),
      loc("b", "乙", [[D1, "red", 20], [D2, "yellow", 50], [D3, "green", 71]]),
      loc("c", "丙", [[D1, "yellow", 50], [D2, "yellow", 50], [D3, "red", 10]]),
    ];
    const stats = dayStats(locs, [D1, D2, D3], "dive");
    expect(rankDays(stats).map((s) => s.date)).toEqual([D3, D1, D2]);
    expect(bestDay(stats)?.date).toBe(D3);
  });

  it("綠黃都一樣時比平均分數，再一樣比日期早", () => {
    const locs = [
      loc("a", "甲", [[D1, "green", 70], [D2, "green", 90], [D3, "green", 70]]),
    ];
    const stats = dayStats(locs, [D1, D2, D3], "dive");
    expect(rankDays(stats).map((s) => s.date)).toEqual([D2, D1, D3]);
  });

  it("全部 unknown 的天不參與排名", () => {
    const locs = [loc("a", "甲", [[D1, "red", 10]])];
    const stats = dayStats(locs, [D1, D2], "dive");
    expect(rankDays(stats).map((s) => s.date)).toEqual([D1]);
  });

  it("全部紅燈 → 沒有最佳日", () => {
    const locs = [loc("a", "甲", [[D1, "red", 10], [D2, "red", 30]])];
    expect(bestDay(dayStats(locs, [D1, D2], "dive"))).toBeNull();
  });

  it("只有黃燈也算最佳日", () => {
    const locs = [loc("a", "甲", [[D1, "red", 10], [D2, "yellow", 50]])];
    expect(bestDay(dayStats(locs, [D1, D2], "dive"))?.date).toBe(D2);
  });
});

describe("sortRows", () => {
  it("依選中那天：燈號 → 分數大到小（null 最後）→ 地名", () => {
    const locs = [
      loc("r", "紅", [[D1, "red", 30]]),
      loc("u", "無", []),
      loc("g1", "綠乙", [[D1, "green", 70]]),
      loc("g2", "綠甲", [[D1, "green", 90]]),
      loc("gn", "綠丙", [[D1, "green", null]]),
      loc("y", "黃", [[D1, "yellow", 50]]),
    ];
    expect(sortRows(locs, D1, "dive").map((l) => l.slug)).toEqual(["g2", "g1", "gn", "y", "r", "u"]);
  });

  it("同燈號同分數時依地名排序", () => {
    const locs = [loc("b", "蘭嶼", [[D1, "green", 80]]), loc("a", "綠島", [[D1, "green", 80]])];
    const expected = ["蘭嶼", "綠島"].sort((x, y) => x.localeCompare(y, "zh-Hant"));
    expect(sortRows(locs, D1, "dive").map((l) => l.name)).toEqual(expected);
  });
});

describe("excludedToday（台灣 18:00 後今天不參與最佳日）", () => {
  // 台灣 = UTC+8
  const at = (hhmmTaipei: string) => new Date(`2026-11-19T${hhmmTaipei}:00+08:00`);

  it("17:59 還算今天；18:00 起排除今天", () => {
    expect(excludedToday(at("17:59"), D1)).toBeNull();
    expect(excludedToday(at("18:00"), D1)).toBe(D1);
    expect(excludedToday(at("23:30"), D1)).toBe(D1);
    expect(excludedToday(at("00:10"), D1)).toBeNull();
  });

  it("今天最好但已過 18:00 → 最佳日改選其他天；今天仍在 stats 裡", () => {
    const locs = [loc("a", "甲", [[D1, "green", 95], [D2, "yellow", 50], [D3, "red", 10]])];
    const stats = dayStats(locs, [D1, D2, D3], "dive");
    expect(bestDay(stats)?.date).toBe(D1);
    expect(bestDay(stats, D1)?.date).toBe(D2);
    expect(rankDays(stats, D1).map((s) => s.date)).toEqual([D2, D3]);
    expect(stats.map((s) => s.date)).toContain(D1);
  });

  it("只剩今天 → 沒有最佳日", () => {
    const locs = [loc("a", "甲", [[D1, "green", 95]])];
    expect(bestDay(dayStats(locs, [D1], "dive"), D1)).toBeNull();
  });
});
