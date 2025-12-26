/**
 * Scraper Health Monitoring Module
 * Tracks scraper execution success/failure, response times, and error patterns
 */

import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(__dirname, '../../output/scraper-health.json');

interface ScraperRun {
  timestamp: string;
  bank: string;
  type: 'rates' | 'tariff' | 'market-share';
  success: boolean;
  duration: number; // milliseconds
  recordCount?: number;
  error?: string;
}

interface ScraperHealth {
  bank: string;
  type: 'rates' | 'tariff' | 'market-share';
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDuration: number;
  lastSuccess?: string;
  lastFailure?: string;
  recentErrors: string[];
}

/**
 * Log a scraper execution
 */
export function logScraperRun(run: Omit<ScraperRun, 'timestamp'>): void {
  const log: ScraperRun = {
    ...run,
    timestamp: new Date().toISOString()
  };

  let logs: ScraperRun[] = [];
  if (fs.existsSync(LOG_FILE)) {
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      logs = JSON.parse(content);
    } catch (err) {
      console.error('[Scraper Monitor] Error reading log file:', err);
    }
  }

  logs.push(log);

  // Keep only last 1000 runs
  if (logs.length > 1000) {
    logs = logs.slice(-1000);
  }

  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  
  const status = run.success ? '✓' : '✗';
  console.log(`[Scraper Monitor] ${status} ${run.bank} ${run.type} - ${run.duration}ms`);
}

/**
 * Get health metrics for all scrapers
 */
export function getScraperHealth(): ScraperHealth[] {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  let logs: ScraperRun[] = [];
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    logs = JSON.parse(content);
  } catch (err) {
    console.error('[Scraper Monitor] Error reading log file:', err);
    return [];
  }

  // Get last 30 days of data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLogs = logs.filter(
    log => new Date(log.timestamp) >= thirtyDaysAgo
  );

  // Group by bank and type
  const grouped = new Map<string, ScraperRun[]>();
  recentLogs.forEach(log => {
    const key = `${log.bank}:${log.type}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(log);
  });

  // Calculate health metrics
  const healthMetrics: ScraperHealth[] = [];
  grouped.forEach((runs, key) => {
    const [bank, type] = key.split(':');
    const successRuns = runs.filter(r => r.success);
    const failureRuns = runs.filter(r => !r.success);
    
    const totalDuration = runs.reduce((sum, r) => sum + r.duration, 0);
    const lastSuccess = successRuns.length > 0 
      ? successRuns[successRuns.length - 1].timestamp 
      : undefined;
    const lastFailure = failureRuns.length > 0 
      ? failureRuns[failureRuns.length - 1].timestamp 
      : undefined;
    
    const recentErrors = failureRuns
      .slice(-5) // Last 5 errors
      .map(r => r.error || 'Unknown error')
      .filter((err, idx, arr) => arr.indexOf(err) === idx); // Unique errors

    healthMetrics.push({
      bank,
      type: type as 'rates' | 'tariff' | 'market-share',
      totalRuns: runs.length,
      successCount: successRuns.length,
      failureCount: failureRuns.length,
      successRate: parseFloat((successRuns.length / runs.length * 100).toFixed(2)),
      avgDuration: Math.round(totalDuration / runs.length),
      lastSuccess,
      lastFailure,
      recentErrors
    });
  });

  return healthMetrics.sort((a, b) => a.bank.localeCompare(b.bank));
}

/**
 * Wrapper to monitor a scraper function
 */
export async function monitoredScrape<T>(
  bank: string,
  type: 'rates' | 'tariff' | 'market-share',
  scraperFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await scraperFn();
    const duration = Date.now() - startTime;
    
    const recordCount = Array.isArray(result) ? result.length : undefined;
    
    logScraperRun({
      bank,
      type,
      success: true,
      duration,
      recordCount
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    logScraperRun({
      bank,
      type,
      success: false,
      duration,
      error: errorMsg
    });
    
    throw error;
  }
}
