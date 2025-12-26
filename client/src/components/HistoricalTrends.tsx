import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TrendData {
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

export function HistoricalTrends() {
  const [banks, setBanks] = useState<string[]>([]);
  const [selectedBank, setSelectedBank] = useState('hnb');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/history/banks')
      .then(res => res.json())
      .then(data => setBanks(data.banks || []))
      .catch(err => console.error('Failed to fetch banks:', err));
  }, []);

  useEffect(() => {
    if (!selectedBank) return;
    setLoading(true);
    fetch(`/api/history/${selectedBank}?days=30`)
      .then(res => res.json())
      .then(data => {
        setHistory(data.history || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch history:', err);
        setLoading(false);
      });
  }, [selectedBank]);

  const chartData = history.map(snapshot => {
    const hlRate = snapshot.rates.find((r: any) => r.product === 'HL' && r.tenureLabel?.includes('5-10'));
    const rateValue = hlRate?.rateWithSalary?.match(/[\d.]+/)?.[0];
    return {
      date: new Date(snapshot.date).toLocaleDateString(),
      rate: rateValue ? parseFloat(rateValue) : null
    };
  }).filter(d => d.rate !== null).reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">
          Historical Rate Trends
        </h2>
        <span className="px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded-full">
          V2 Feature
        </span>
      </div>

      {banks.length === 0 ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <p className="text-yellow-800 dark:text-yellow-200">
            📊 <strong>No historical data yet.</strong> Historical rate snapshots will be saved automatically
            when scrapers run. Check back after 24 hours to see rate trends.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Bank
            </label>
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-800 text-white"
            >
              {banks.map(bank => (
                <option key={bank} value={bank}>{bank.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : chartData.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-800 rounded-lg p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Housing Loan (5-10 Years) - Last 30 Days
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#F3F4F6' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6' }}
                    name="Interest Rate (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
              No rate data available for {selectedBank.toUpperCase()} yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}
