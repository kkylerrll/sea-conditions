export type Rating = "green" | "yellow" | "red" | "unknown";

export interface ActivityRating {
  rating: Rating;
  score: number | null;
  reasons: string[];
}

// 依活動別的燈號。潛水浪越大越扣分；衝浪要有浪、吃離岸風，兩者常相反。
export interface Ratings {
  dive: ActivityRating | null;
  surf: ActivityRating | null;
}

export interface Condition {
  date: string;
  source: string;
  fetched_at: string | null;
  wave_height_m: number | null;
  wave_period_s: number | null;
  wave_dir: string | null;
  wind_speed_ms: number | null;
  wind_scale: number | null;
  wind_dir: string | null;
  gust_ms: number | null;
  water_temp_c: number | null;
  visibility_m: number | null;
  tide_high: string | null;
  tide_low: string | null;
  rating: Rating;
  rating_score: number | null;
  rating_reasons: string[];
  ratings?: Ratings | null;
  advice_text: string | null;
  advice_model: string | null;
}

export type Activity = "scuba" | "freedive" | "snorkel" | "surf";

export interface Spot {
  slug: string;
  name: string;
  name_en: string | null;
  lat: number;
  lon: number;
  coord_approx: boolean;
  activities: Activity[];
  bottom: string | null; // sand|reef|point|rivermouth|harbour|wreck|artificial|mixed
  facing_deg: number | null;
  shelter: string | null; // open|semi|sheltered
  level: string | null; // beginner|intermediate|advanced
  entry: string | null; // shore|boat
  depth_min_m: number | null;
  depth_max_m: number | null;
  blurb: string;
}

export interface Location {
  slug: string;
  name: string;
  name_en: string | null;
  region: string;
  blurb: string;
  spots: string[];
  activities: string[];
  lat: number;
  lon: number;
  today: Condition | null;
  forecast: Condition[];
  spot_list?: Spot[];
}
