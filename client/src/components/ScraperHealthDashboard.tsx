import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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

export function ScraperHealthDashboard() {
  const [health, setHealth] = useState<ScraperHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health/scrapers')
      .then(res => res.json())
      .then(data => {
        setHealth(data.scrapers || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch scraper health:', err);
        setLoading(false);
      });
  }, []);

  const getHealthColor = (rate: number) => {
    if (rate >= 90) return 'text-green-400';
    if (rate >= 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getHealthBadge = (rate: number) => {
    if (rate >= 90) return 'bg-green-900/20 text-green-400 border-green-700';
    if (rate >= 70) return 'bg-yellow-900/20 text-yellow-400 border-yellow-700';
    return 'bg-red-900/20 text-red-400 border-red-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">
          Scraper Health Monitoring
        </h2>
        <span className="px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded-full">
          V2 Feature
        </span>
      </div>

      {health.length === 0 ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <p className="text-yellow-800 dark:text-yellow-200">
            🔧 <strong>No scraper runs recorded yet.</strong> Scraper health metrics will appear here
            automatically after the first scraper executions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {health.map((scraper, idx) => (
            <motion.div
              key={`${scraper.bank}-${scraper.type}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-gray-800 rounded-lg p-6 border border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {scraper.bank.toUpperCase()}
                  </h3>
                  <p className="text-sm text-gray-400">{scraper.type}</p>
                </div>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getHealthBadge(scraper.successRate)}`}>
                  {scraper.successRate}%
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Runs:</span>
                  <span className="text-white font-medium">{scraper.totalRuns}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Success:</span>
                  <span className="text-green-400 font-medium">{scraper.successCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Failures:</span>
                  <span className="text-red-400 font-medium">{scraper.failureCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Avg Duration:</span>
                  <span className="text-white font-medium">{scraper.avgDuration}ms</span>
                </div>
              </div>

              {scraper.lastSuccess && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-400">
                    Last success: {new Date(scraper.lastSuccess).toLocaleString()}
                  </p>
                </div>
              )}

              {scraper.recentErrors.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-xs text-red-400 font-medium mb-2">Recent Errors:</p>
                  <ul className="space-y-1">
                    {scraper.recentErrors.slice(0, 2).map((err, i) => (
                      <li key={i} className="text-xs text-gray-400 truncate">
                        • {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
