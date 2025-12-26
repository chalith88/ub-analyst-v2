/**
 * Market Share Scheduler
 * Automatically runs market share scrapers on a schedule
 * 
 * Usage:
 * - One-time run: npm run refresh-market-share
 * - Schedule via cron/Task Scheduler: Run this script quarterly
 * 
 * Schedule recommendations:
 * - Q1 (March 31): Run April 15
 * - Q2 (June 30): Run July 15
 * - Q3 (September 30): Run October 15
 * - Q4 (December 31): Run January 15
 */

import { scrapeAllBanks } from "./market-share-all";
import fs from "fs";
import path from "path";

interface ScheduleConfig {
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  intervalDays: number;
}

const SCHEDULE_FILE = path.join(process.cwd(), "config", "market-share-schedule.json");

function ensureConfigDir() {
  const configDir = path.join(process.cwd(), "config");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function loadScheduleConfig(): ScheduleConfig {
  ensureConfigDir();
  
  if (fs.existsSync(SCHEDULE_FILE)) {
    return JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8"));
  }
  
  // Default config
  return {
    enabled: true,
    lastRun: null,
    nextRun: null,
    intervalDays: 90, // Quarterly (approximately 90 days)
  };
}

function saveScheduleConfig(config: ScheduleConfig) {
  ensureConfigDir();
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(config, null, 2));
}

function calculateNextRun(intervalDays: number): string {
  const next = new Date();
  next.setDate(next.getDate() + intervalDays);
  return next.toISOString();
}

async function runScheduledScrape() {
  console.log("⏰ Starting scheduled market share scrape...");
  console.log(`   Time: ${new Date().toISOString()}\n`);
  
  const config = loadScheduleConfig();
  
  if (!config.enabled) {
    console.log("⚠️  Scheduled scraping is disabled in config");
    return;
  }
  
  try {
    // Run all scrapers
    const result = await scrapeAllBanks();
    
    // Update schedule config
    config.lastRun = new Date().toISOString();
    config.nextRun = calculateNextRun(config.intervalDays);
    saveScheduleConfig(config);
    
    // Create a timestamped backup
    const outputDir = path.join(process.cwd(), "output", "history");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const backupPath = path.join(outputDir, `market-share-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(result, null, 2));
    
    console.log("\n✅ Scheduled scrape completed successfully!");
    console.log(`   Last run: ${config.lastRun}`);
    console.log(`   Next run: ${config.nextRun}`);
    console.log(`   Backup saved: ${backupPath}`);
    
    // Send summary email/notification (optional - implement as needed)
    await sendNotification(result);
    
  } catch (error) {
    console.error("\n❌ Scheduled scrape failed:", error);
    
    // Log error to file
    const errorLogPath = path.join(process.cwd(), "logs", "market-share-errors.log");
    const errorLog = `[${new Date().toISOString()}] ${error}\n`;
    
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(errorLogPath, errorLog);
    
    throw error;
  }
}

async function sendNotification(result: any) {
  // TODO: Implement notification logic
  // Options:
  // 1. Send email via nodemailer
  // 2. Post to Slack/Discord webhook
  // 3. Log to monitoring service
  
  console.log("\n📧 Notification summary:");
  console.log(`   Banks scraped: ${result.summary.successfulScrapes}/${result.summary.totalBanks}`);
  console.log(`   Coverage: ${result.coveragePercentage.toFixed(1)}%`);
  console.log(`   Total: LKR ${(result.totalCoverage / 1000).toFixed(1)}B`);
}

// CLI Commands
const command = process.argv[2];

switch (command) {
  case "run":
    // Immediate run
    runScheduledScrape()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
    break;
    
  case "status":
    // Show schedule status
    const config = loadScheduleConfig();
    console.log("📅 Market Share Schedule Status:");
    console.log(`   Enabled: ${config.enabled ? "Yes" : "No"}`);
    console.log(`   Last run: ${config.lastRun || "Never"}`);
    console.log(`   Next run: ${config.nextRun || "Not scheduled"}`);
    console.log(`   Interval: Every ${config.intervalDays} days (quarterly)`);
    break;
    
  case "enable":
    // Enable scheduling
    const enableConfig = loadScheduleConfig();
    enableConfig.enabled = true;
    enableConfig.nextRun = calculateNextRun(enableConfig.intervalDays);
    saveScheduleConfig(enableConfig);
    console.log("✅ Market share scheduling enabled");
    console.log(`   Next run scheduled for: ${enableConfig.nextRun}`);
    break;
    
  case "disable":
    // Disable scheduling
    const disableConfig = loadScheduleConfig();
    disableConfig.enabled = false;
    saveScheduleConfig(disableConfig);
    console.log("⏸️  Market share scheduling disabled");
    break;
    
  default:
    console.log("Market Share Scheduler");
    console.log("\nUsage:");
    console.log("  npm run refresh-market-share run     - Run scraping now");
    console.log("  npm run refresh-market-share status  - Show schedule status");
    console.log("  npm run refresh-market-share enable  - Enable automatic scheduling");
    console.log("  npm run refresh-market-share disable - Disable automatic scheduling");
    console.log("\nFor production scheduling:");
    console.log("  Windows: Use Task Scheduler to run quarterly");
    console.log("  Linux: Add to crontab for quarterly execution");
    console.log("  Example crontab (15th of Jan/Apr/Jul/Oct at 2 AM):");
    console.log("    0 2 15 1,4,7,10 * cd /path/to/project && npm run refresh-market-share run");
}

export { runScheduledScrape, loadScheduleConfig };
