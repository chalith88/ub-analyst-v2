import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ProductKey = "HL" | "PL" | "LAP" | "EL" | "EDU";

interface ProductMarketShareData {
  product: ProductKey;
  productName: string;
  totalMarketSize: number;
  totalMarketSizeFormatted: string;
  banks: {
    bank: string;
    shortName: string;
    amount: number;
    amountFormatted: string;
    marketShare: number;
    lastUpdated: string;
    source: string;
    reportType: string;
    reportUrl?: string;
  }[];
  concentration: {
    hhi: number;
    hhiInterpretation: string;
    cr3: number;
    cr3Banks: string[];
    cr5: number;
    cr5Banks: string[];
  };
  meta: {
    lastCalculated: string;
    dataSource: string;
  };
}

interface ProductMarketShareWidgetProps {
  productKey: ProductKey;
  productName: string;
  defaultView?: "chart" | "table";
  compact?: boolean;
}

export function ProductMarketShareWidget({
  productKey,
  productName,
  defaultView = "chart",
  compact = false,
}: ProductMarketShareWidgetProps) {
  const [data, setData] = useState<ProductMarketShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">(defaultView);

  useEffect(() => {
    fetchData();
  }, [productKey]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/market-share/by-product/${productKey}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
    } catch (err: any) {
      console.error("Failed to fetch product market share:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border border-white/10 ${compact ? 'p-4' : 'p-6'}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-white/10 rounded w-3/4 mb-4"></div>
          <div className="h-32 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border border-white/10 ${compact ? 'p-4' : 'p-6'}`}>
        <div className="text-red-400 text-sm">
          ⚠️ {error || "No data available"}
        </div>
      </div>
    );
  }

  const topBanks = data.banks.slice(0, compact ? 5 : 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border border-white/10 ${compact ? 'p-4' : 'p-6'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">
            {productName} Market Share
          </h3>
          <p className="text-xs text-white/60 mt-1">
            Total Market: {data.totalMarketSizeFormatted}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("chart")}
            className={`px-3 py-1 text-xs rounded transition ${
              view === "chart"
                ? "bg-blue-500 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            📊 Chart
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1 text-xs rounded transition ${
              view === "table"
                ? "bg-blue-500 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            📋 Table
          </button>
        </div>
      </div>

      {/* Concentration Metrics */}
      {!compact && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xs text-white/60">HHI Index</div>
            <div className="text-lg font-bold text-white">{data.concentration.hhi}</div>
            <div className="text-xs text-white/50">{data.concentration.hhiInterpretation}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xs text-white/60">Top 3 Share</div>
            <div className="text-lg font-bold text-white">{data.concentration.cr3}%</div>
            <div className="text-xs text-white/50">{data.concentration.cr3Banks.join(", ")}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xs text-white/60">Top 5 Share</div>
            <div className="text-lg font-bold text-white">{data.concentration.cr5}%</div>
            <div className="text-xs text-white/50 truncate">{data.concentration.cr5Banks.join(", ")}</div>
          </div>
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {view === "chart" ? (
          <motion.div
            key="chart"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-3"
          >
            {topBanks.map((bank, idx) => (
              <div key={bank.bank} className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60">#{idx + 1}</span>
                    <span className="font-semibold text-white">{bank.shortName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white/80">{bank.amountFormatted}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      idx === 0 ? 'bg-yellow-500/20 text-yellow-300' :
                      idx < 3 ? 'bg-blue-500/20 text-blue-300' :
                      'bg-white/10 text-white/60'
                    }`}>
                      {bank.marketShare.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${bank.marketShare}%` }}
                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                    className={`h-full rounded-full ${
                      idx === 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                      idx < 3 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                      'bg-gradient-to-r from-slate-500 to-slate-600'
                    }`}
                  />
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="overflow-x-auto"
          >
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr className="text-left text-white/60 text-xs">
                  <th className="py-2">#</th>
                  <th className="py-2">Bank</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2 text-right">Share</th>
                  {!compact && <th className="py-2 text-right">Report</th>}
                </tr>
              </thead>
              <tbody>
                {topBanks.map((bank, idx) => (
                  <tr key={bank.bank} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 text-white/60">{idx + 1}</td>
                    <td className="py-2 font-semibold text-white">{bank.shortName}</td>
                    <td className="py-2 text-right text-white/80">{bank.amountFormatted}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        idx === 0 ? 'bg-yellow-500/20 text-yellow-300' :
                        idx < 3 ? 'bg-blue-500/20 text-blue-300' :
                        'bg-white/10 text-white/60'
                      }`}>
                        {bank.marketShare.toFixed(1)}%
                      </span>
                    </td>
                    {!compact && (
                      <td className="py-2 text-right">
                        {bank.reportUrl ? (
                          <a
                            href={bank.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline"
                          >
                            {bank.reportType}
                          </a>
                        ) : (
                          <span className="text-xs text-white/40">{bank.reportType}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/50 text-center">
        Data from bank quarterly/annual reports • Last updated: {new Date(data.meta.lastCalculated).toLocaleDateString()}
      </div>
    </motion.div>
  );
}
