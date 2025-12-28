// src/db/database.ts
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "rates-history.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank TEXT NOT NULL,
    product TEXT NOT NULL,
    type TEXT,
    tenure_years INTEGER,
    rate REAL NOT NULL,
    rate_with_salary REAL,
    rate_without_salary REAL,
    notes TEXT,
    scraped_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_rate_snapshots_lookup 
    ON rate_snapshots(bank, product, tenure_years, scraped_at DESC);

  CREATE TABLE IF NOT EXISTS rate_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank TEXT NOT NULL,
    product TEXT NOT NULL,
    tenure_years INTEGER,
    old_rate REAL NOT NULL,
    new_rate REAL NOT NULL,
    change_amount REAL NOT NULL,
    change_percent REAL NOT NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_rate_changes_recent 
    ON rate_changes(detected_at DESC);
`);

export interface RateSnapshot {
  bank: string;
  product: string;
  type?: string;
  tenureYears?: number;
  rate: number;
  rateWithSalary?: number;
  rateWithoutSalary?: number;
  notes?: string;
  scrapedAt: string;
}

export interface RateChange {
  id?: number;
  bank: string;
  product: string;
  tenureYears?: number;
  oldRate: number;
  newRate: number;
  changeAmount: number;
  changePercent: number;
  detectedAt: string;
}

export function saveRateSnapshot(snapshot: RateSnapshot) {
  const stmt = db.prepare(`
    INSERT INTO rate_snapshots 
    (bank, product, type, tenure_years, rate, rate_with_salary, rate_without_salary, notes, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    snapshot.bank,
    snapshot.product,
    snapshot.type || null,
    snapshot.tenureYears || null,
    snapshot.rate,
    snapshot.rateWithSalary || null,
    snapshot.rateWithoutSalary || null,
    snapshot.notes || null,
    snapshot.scrapedAt
  );
}

export function getLatestRateSnapshot(bank: string, product: string, tenureYears?: number, beforeTimestamp?: string, type?: string | null): RateSnapshot | null {
  // Normalize type to null if empty/undefined for consistent comparison
  const normalizedType = (type && type !== "") ? type : null;
  
  let whereClause = "WHERE bank = ? AND product = ?";
  const params: any[] = [bank, product];
  
  // Always include type in comparison (null = no specific type)
  if (normalizedType !== null) {
    whereClause += " AND type = ?";
    params.push(normalizedType);
  } else {
    whereClause += " AND (type IS NULL OR type = '')";
  }
  
  if (tenureYears !== undefined && tenureYears !== null) {
    whereClause += " AND tenure_years = ?";
    params.push(tenureYears);
  }
  
  if (beforeTimestamp) {
    whereClause += " AND scraped_at < ?";
    params.push(beforeTimestamp);
  }
  
  const stmt = db.prepare(`
    SELECT 
      bank, product, type, tenure_years as tenureYears, 
      rate, rate_with_salary as rateWithSalary, 
      rate_without_salary as rateWithoutSalary, 
      notes, scraped_at as scrapedAt
    FROM rate_snapshots
    ${whereClause}
    ORDER BY scraped_at DESC
    LIMIT 1
  `);
  
  const result = stmt.get(...params);
  return result as RateSnapshot | null;
}

export function detectRateChanges(newRates: RateSnapshot[]): RateChange[] {
  const changes: RateChange[] = [];

  for (const newRate of newRates) {
    if (!newRate.rate || !isFinite(newRate.rate)) continue;

    // Get latest snapshot BEFORE the current scraped_at timestamp
    // Include type to distinguish between Fixed/Floating/etc products
    const oldRate = getLatestRateSnapshot(newRate.bank, newRate.product, newRate.tenureYears, newRate.scrapedAt, newRate.type);
    
    if (oldRate && oldRate.rate !== newRate.rate) {
      const changeAmount = newRate.rate - oldRate.rate;
      const changePercent = (changeAmount / oldRate.rate) * 100;

      const change: RateChange = {
        bank: newRate.bank,
        product: newRate.product,
        tenureYears: newRate.tenureYears,
        oldRate: oldRate.rate,
        newRate: newRate.rate,
        changeAmount,
        changePercent,
        detectedAt: newRate.scrapedAt
      };

      changes.push(change);

      // Save to rate_changes table
      const stmt = db.prepare(`
        INSERT INTO rate_changes 
        (bank, product, tenure_years, old_rate, new_rate, change_amount, change_percent, detected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        change.bank,
        change.product,
        change.tenureYears || null,
        change.oldRate,
        change.newRate,
        change.changeAmount,
        change.changePercent,
        change.detectedAt
      );
    }
  }

  return changes;
}

export function getRecentRateChanges(limit = 50): RateChange[] {
  const stmt = db.prepare(`
    SELECT 
      id, bank, product, tenure_years as tenureYears,
      old_rate as oldRate, new_rate as newRate,
      change_amount as changeAmount, change_percent as changePercent,
      detected_at as detectedAt
    FROM rate_changes
    ORDER BY detected_at DESC
    LIMIT ?
  `);

  return stmt.all(limit) as RateChange[];
}

export function getRateHistory(bank: string, product: string, tenureYears?: number, days = 30): RateSnapshot[] {
  const stmt = db.prepare(`
    SELECT 
      bank, product, type, tenure_years as tenureYears,
      rate, rate_with_salary as rateWithSalary,
      rate_without_salary as rateWithoutSalary,
      notes, scraped_at as scrapedAt
    FROM rate_snapshots
    WHERE bank = ? 
      AND product = ? 
      ${tenureYears !== undefined ? "AND tenure_years = ?" : ""}
      AND scraped_at >= datetime('now', '-' || ? || ' days')
    ORDER BY scraped_at DESC
  `);

  const params = tenureYears !== undefined
    ? [bank, product, tenureYears, days]
    : [bank, product, days];

  return stmt.all(...params) as RateSnapshot[];
}
