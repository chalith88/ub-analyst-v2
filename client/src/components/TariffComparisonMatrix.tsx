/**
 * Enhanced Tariff Comparison Matrix Component
 * Side-by-side fee comparison across all banks for each product
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface TariffRow {
  bank: string;
  product: string;
  feeType: string;
  amount: string;
  condition: string;
}

interface BankTariffData {
  [bank: string]: TariffRow[];
}

interface Props {
  allTariffs: BankTariffData;
}

type ProductKey = 'HL' | 'PL' | 'LAP' | 'EL' | 'EDU';

const PRODUCTS: { key: ProductKey; label: string }[] = [
  { key: 'HL', label: 'Housing Loans' },
  { key: 'PL', label: 'Personal Loans' },
  { key: 'LAP', label: 'Loans Against Property' },
  { key: 'EL', label: 'Education Loans' },
  { key: 'EDU', label: 'Education Loans (Alt)' }
];

const FEE_TYPES = [
  'Processing Fee',
  'Documentation Fee',
  'Appraisal Fee',
  'Legal Fee',
  'Disbursement Fee',
  'Early Settlement Fee',
  'Stamp Duty',
  'Monthly Account Maintenance',
  'Annual Fee'
];

export function TariffComparisonMatrix({ allTariffs }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<ProductKey>('HL');
  const [selectedFeeType, setSelectedFeeType] = useState<string>('Processing Fee');

  // Get all banks
  const banks = Object.keys(allTariffs).sort();

  // Get tariffs for selected product and fee type
  const getComparison = () => {
    const comparison: { [bank: string]: { amount: string; condition: string } } = {};

    banks.forEach(bank => {
      const bankTariffs = allTariffs[bank] || [];
      const match = bankTariffs.find(
        t => t.product === selectedProduct && t.feeType === selectedFeeType
      );

      if (match) {
        comparison[bank] = {
          amount: match.amount,
          condition: match.condition
        };
      } else {
        comparison[bank] = {
          amount: 'N/A',
          condition: ''
        };
      }
    });

    return comparison;
  };

  const comparison = getComparison();

  // Find min/max for highlighting
  const amounts = Object.values(comparison)
    .map(c => {
      const match = c.amount.match(/[\d,]+/);
      return match ? parseFloat(match[0].replace(/,/g, '')) : null;
    })
    .filter((n): n is number => n !== null);

  const minAmount = amounts.length > 0 ? Math.min(...amounts) : null;
  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : null;

  const isMin = (amount: string) => {
    const match = amount.match(/[\d,]+/);
    if (!match || minAmount === null) return false;
    const num = parseFloat(match[0].replace(/,/g, ''));
    return num === minAmount;
  };

  const isMax = (amount: string) => {
    const match = amount.match(/[\d,]+/);
    if (!match || maxAmount === null) return false;
    const num = parseFloat(match[0].replace(/,/g, ''));
    return num === maxAmount;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Tariff Comparison Matrix
        </h2>
        <span className="px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded-full">
          V2 Feature
        </span>
      </div>

      {/* Product Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Product
        </label>
        <div className="flex flex-wrap gap-2">
          {PRODUCTS.map(product => (
            <button
              key={product.key}
              onClick={() => setSelectedProduct(product.key)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedProduct === product.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {product.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fee Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Fee Type
        </label>
        <select
          value={selectedFeeType}
          onChange={e => setSelectedFeeType(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          {FEE_TYPES.map(feeType => (
            <option key={feeType} value={feeType}>
              {feeType}
            </option>
          ))}
        </select>
      </div>

      {/* Comparison Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-x-auto"
      >
        <table className="w-full border-collapse bg-white dark:bg-gray-800 rounded-lg shadow">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-300 dark:border-gray-600">
                Bank
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-300 dark:border-gray-600">
                Fee Amount
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-300 dark:border-gray-600">
                Condition
              </th>
            </tr>
          </thead>
          <tbody>
            {banks.map((bank, idx) => {
              const { amount, condition } = comparison[bank];
              const isBestRate = isMin(amount) && amount !== 'N/A';
              const isWorstRate = isMax(amount) && amount !== 'N/A';

              return (
                <motion.tr
                  key={bank}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 ${
                    isBestRate ? 'bg-green-50 dark:bg-green-900/20' : ''
                  } ${isWorstRate ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {bank}
                    {isBestRate && (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                        ⭐ Best
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-semibold">
                    {amount}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {condition || '—'}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </motion.div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded"></div>
          <span className="text-gray-700 dark:text-gray-300">Lowest Fee</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded"></div>
          <span className="text-gray-700 dark:text-gray-300">Highest Fee</span>
        </div>
      </div>
    </div>
  );
}
