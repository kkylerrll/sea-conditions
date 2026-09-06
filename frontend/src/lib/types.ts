export type Rating = "green" | "yellow" | "red" | "unknown";

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
  advice_text: string | null;
  advice_model: string | null;
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
}
