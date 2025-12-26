/**
 * Historical Rate Tracking Module
 * Stores daily snapshots of bank rates for trend analysis
 */

import fs from 'fs';
import path from 'path';
import { RateRow } from '../types';

const HISTORY_DIR = path.join(__dirname, '../../output/history');

interface RateSnapshot {
  date: string; // ISO date string
  bank: string;
  rates: RateRow[];
}

interface HistoricalTrend {
  bank: string;
  product: string;
  tenure: string;
  dataPoints: Array<{
    date: string;
    rateWithSalary?: string;
    rateWithoutSalary?: string;
  }>;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

/**
 * Ensure history directory exists
 */
function ensureHistoryDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

/**
 * Save a rate snapshot for a specific bank
 */
export function saveRateSnapshot(bank: string, rates: RateRow[]): void {
  ensureHistoryDir();
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const snapshot: RateSnapshot = {
    date: today,
    bank,
    rates
  };

  const filename = `${bank}-${today}.json`;
  const filepath = path.join(HISTORY_DIR, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
  console.log(`[Rate History] Saved snapshot for ${bank} on ${today}`);
}

/**
 * Get historical rates for a specific bank
 */
export function getHistoricalRates(bank: string, days: number = 30): RateSnapshot[] {
  ensureHistoryDir();
  
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith(`${bank}-`) && f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, days);

  return files.map(f => {
    const content = fs.readFileSync(path.join(HISTORY_DIR, f), 'utf-8');
    return JSON.parse(content) as RateSnapshot;
  });
}

/**
 * Get rate trend for specific product and tenure
 */
export function getRateTrend(
  bank: string,
  product: string,
  tenure: string,
  days: number = 30
): HistoricalTrend | null {
  const history = getHistoricalRates(bank, days);
  
  if (history.length === 0) {
    return null;
  }

  const dataPoints = history.map(snapshot => {
    const rate = snapshot.rates.find(
      r => r.product === product && r.tenureLabel === tenure
    );
    return {
      date: snapshot.date,
      rateWithSalary: rate?.rateWithSalary,
      rateWithoutSalary: rate?.rateWithoutSalary
    };
  }).filter(dp => dp.rateWithSalary || dp.rateWithoutSalary);

  if (dataPoints.length < 2) {
    return {
      bank,
      product,
      tenure,
      dataPoints,
      trend: 'stable',
      changePercent: 0
    };
  }

  // Calculate trend using "with salary" rate
  const parseRate = (rateStr?: string): number | null => {
    if (!rateStr) return null;
    const match = rateStr.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const firstRate = parseRate(dataPoints[dataPoints.length - 1].rateWithSalary);
  const lastRate = parseRate(dataPoints[0].rateWithSalary);

  if (firstRate === null || lastRate === null) {
    return {
      bank,
      product,
      tenure,
      dataPoints,
      trend: 'stable',
      changePercent: 0
    };
  }

  const changePercent = ((lastRate - firstRate) / firstRate) * 100;
  const trend = changePercent > 0.1 ? 'up' : changePercent < -0.1 ? 'down' : 'stable';

  return {
    bank,
    product,
    tenure,
    dataPoints,
    trend,
    changePercent: parseFloat(changePercent.toFixed(2))
  };
}

/**
 * Get all banks with historical data
 */
export function getBanksWithHistory(): string[] {
  ensureHistoryDir();
  
  const files = fs.readdirSync(HISTORY_DIR);
  const banks = new Set<string>();
  
  files.forEach(f => {
    const match = f.match(/^(.+?)-\d{4}-\d{2}-\d{2}\.json$/);
    if (match) {
      banks.add(match[1]);
    }
  });

  return Array.from(banks).sort();
}
