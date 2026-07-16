export interface PageViewStats {
  total: number;
  trend: number | null;
  uniqueVisitors: number;
  uniqueVisitorsTrend: number | null;
  bounceRate: number;
  bounceRateTrend: number | null;
  avgSessionSeconds: number;
  avgSessionTrend: number | null;
}

export interface CountryRow {
  country: string;
  count: number;
}

export interface CategoryRow {
  category: string;
  revenue: number;
}

export interface DailyPoint {
  label: string;
  views: number;
  uniqueVisitors: number;
}
