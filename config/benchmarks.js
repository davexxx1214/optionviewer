// 历史基准数据 (Mock数据)
// 每只股票的历史HV/IV比率分析结果
const HISTORICAL_BENCHMARKS = {
  // 科技股 - 通常波动性较高，市场情绪影响大
  'NVDA': { R_avg: 0.75, R_std_dev: 0.12 }, // IV通常高于HV
  'TSLA': { R_avg: 0.70, R_std_dev: 0.15 }, // 高波动，情绪驱动明显
  'META': { R_avg: 0.78, R_std_dev: 0.10 }, // 相对稳定的溢价
  'NFLX': { R_avg: 0.72, R_std_dev: 0.13 },
  
  // 大盘蓝筹股 - 相对稳定，溢价较小
  'AAPL': { R_avg: 0.85, R_std_dev: 0.08 }, // 成熟股票，IV溢价较小
  'MSFT': { R_avg: 0.87, R_std_dev: 0.07 }, // 非常稳定
  'GOOGL': { R_avg: 0.82, R_std_dev: 0.09 },
  'AMZN': { R_avg: 0.76, R_std_dev: 0.11 },
  
  // 金融股 - 受宏观经济影响，周期性波动
  'JPM': { R_avg: 0.90, R_std_dev: 0.06 }, // 银行股相对稳定
  'V': { R_avg: 0.88, R_std_dev: 0.07 },
  'MA': { R_avg: 0.89, R_std_dev: 0.06 },
  'BRK-B': { R_avg: 0.92, R_std_dev: 0.05 }, // 巴菲特概念，极其稳定
  
  // 消费品 - 防御性较强
  'WMT': { R_avg: 0.95, R_std_dev: 0.04 }, // 防御性股票，溢价很小
  'COST': { R_avg: 0.90, R_std_dev: 0.06 },
  'HD': { R_avg: 0.88, R_std_dev: 0.07 },
  
  // 能源股 - 商品价格影响大
  'XOM': { R_avg: 0.80, R_std_dev: 0.12 }, // 受油价影响，波动较大
  
  // 医药生物 - 研发风险与监管影响
  'JNJ': { R_avg: 0.93, R_std_dev: 0.05 }, // 大型制药，相对稳定
  'LLY': { R_avg: 0.85, R_std_dev: 0.09 },
  
  // 半导体
  'AVGO': { R_avg: 0.77, R_std_dev: 0.11 }, // 周期性较强
  'ORCL': { R_avg: 0.86, R_std_dev: 0.08 },
  
  // 中概股 - 受政策和情绪影响大，波动性高
  'BABA': { R_avg: 0.65, R_std_dev: 0.18 }, // 政策敏感，IV溢价大
  'PDD': { R_avg: 0.60, R_std_dev: 0.20 }, // 新兴平台，不确定性高
  'JD': { R_avg: 0.68, R_std_dev: 0.16 },
  'NTES': { R_avg: 0.72, R_std_dev: 0.14 },
  'TME': { R_avg: 0.70, R_std_dev: 0.15 }
};

// 获取股票的历史基准数据
function getHistoricalBenchmark(symbol) {
  return HISTORICAL_BENCHMARKS[symbol] || {
    R_avg: 0.80,    // 默认基准
    R_std_dev: 0.10 // 默认标准差
  };
}

// 计算VVI评分
function calculateVVI(currentHV, currentIV, benchmark) {
  // 计算当前比率 R_current = HV / IV
  const R_current = currentHV / currentIV;
  
  // 计算Z-Score = (R_current - R_avg) / R_std_dev
  const Z = (R_current - benchmark.R_avg) / benchmark.R_std_dev;
  
  // 转换为VVI分数 = 50 + (Z * 25)
  let VVI = 50 + (Z * 25);
  
  // 限制在0-100之间
  VVI = Math.max(0, Math.min(100, VVI));
  
  return {
    VVI: Math.round(VVI),
    R_current: R_current,
    Z_score: Z,
    benchmark: benchmark
  };
}

module.exports = {
  HISTORICAL_BENCHMARKS,
  getHistoricalBenchmark,
  calculateVVI
}; 