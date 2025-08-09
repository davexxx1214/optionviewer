// 历史基准数据 (Mock数据)
// 每只股票的历史HV/IV比率分析结果和分段历史波动率数据
const HISTORICAL_BENCHMARKS = {
  // 科技股 - 通常波动性较高，市场情绪影响大
  'NVDA': { 
    R_avg: 0.75, 
    R_std_dev: 0.12,
    HV_segments: {
      ultra_short: 48.5,  // 0-20天：短期波动高
      short: 45.2,        // 21-60天
      medium: 42.8,       // 61-180天
      long: 40.5          // >180天：长期相对稳定
    }
  },
  'TSLA': { 
    R_avg: 0.70, 
    R_std_dev: 0.15,
    HV_segments: {
      ultra_short: 55.8,
      short: 52.3,
      medium: 48.9,
      long: 45.2
    }
  },
  'META': { 
    R_avg: 0.78, 
    R_std_dev: 0.10,
    HV_segments: {
      ultra_short: 38.2,
      short: 35.8,
      medium: 33.5,
      long: 31.2
    }
  },
  'NFLX': { 
    R_avg: 0.72, 
    R_std_dev: 0.13,
    HV_segments: {
      ultra_short: 42.5,
      short: 39.8,
      medium: 37.2,
      long: 34.8
    }
  },
  
  // 大盘蓝筹股 - 相对稳定，溢价较小
  'AAPL': { 
    R_avg: 0.85, 
    R_std_dev: 0.08,
    HV_segments: {
      ultra_short: 27.5,
      short: 25.8,
      medium: 24.2,
      long: 22.8
    }
  },
  'MSFT': { 
    R_avg: 0.87, 
    R_std_dev: 0.07,
    HV_segments: {
      ultra_short: 26.8,
      short: 25.2,
      medium: 23.8,
      long: 22.5
    }
  },
  'GOOGL': { 
    R_avg: 0.82, 
    R_std_dev: 0.09,
    HV_segments: {
      ultra_short: 32.5,
      short: 30.2,
      medium: 28.5,
      long: 26.8
    }
  },
  'AMZN': { 
    R_avg: 0.76, 
    R_std_dev: 0.11,
    HV_segments: {
      ultra_short: 37.8,
      short: 35.2,
      medium: 32.8,
      long: 30.5
    }
  },
  
  // 金融股 - 受宏观经济影响，周期性波动
  'JPM': { 
    R_avg: 0.90, 
    R_std_dev: 0.06,
    HV_segments: {
      ultra_short: 22.5,
      short: 20.8,
      medium: 19.5,
      long: 18.2
    }
  },
  'V': { 
    R_avg: 0.88, 
    R_std_dev: 0.07,
    HV_segments: {
      ultra_short: 19.8,
      short: 18.5,
      medium: 17.2,
      long: 16.2
    }
  },
  'MA': { 
    R_avg: 0.89, 
    R_std_dev: 0.06,
    HV_segments: {
      ultra_short: 19.5,
      short: 18.2,
      medium: 17.0,
      long: 15.8
    }
  },
  'BRK-B': { 
    R_avg: 0.92, 
    R_std_dev: 0.05,
    HV_segments: {
      ultra_short: 16.5,
      short: 15.2,
      medium: 14.2,
      long: 13.5
    }
  },
  
  // 消费品 - 防御性较强
  'WMT': { 
    R_avg: 0.95, 
    R_std_dev: 0.04,
    HV_segments: {
      ultra_short: 16.2,
      short: 15.0,
      medium: 14.0,
      long: 13.2
    }
  },
  'COST': { 
    R_avg: 0.90, 
    R_std_dev: 0.06,
    HV_segments: {
      ultra_short: 19.8,
      short: 18.5,
      medium: 17.2,
      long: 16.0
    }
  },
  'HD': { 
    R_avg: 0.88, 
    R_std_dev: 0.07,
    HV_segments: {
      ultra_short: 21.5,
      short: 20.0,
      medium: 18.8,
      long: 17.5
    }
  },
  
  // 能源股 - 商品价格影响大
  'XOM': { 
    R_avg: 0.80, 
    R_std_dev: 0.12,
    HV_segments: {
      ultra_short: 28.5,
      short: 26.2,
      medium: 24.8,
      long: 23.2
    }
  },
  
  // 医药生物 - 研发风险与监管影响
  'JNJ': { 
    R_avg: 0.93, 
    R_std_dev: 0.05,
    HV_segments: {
      ultra_short: 13.8,
      short: 12.5,
      medium: 11.8,
      long: 11.2
    }
  },
  'LLY': { 
    R_avg: 0.85, 
    R_std_dev: 0.09,
    HV_segments: {
      ultra_short: 24.5,
      short: 22.8,
      medium: 21.2,
      long: 19.8
    }
  },
  
  // 半导体
  'AVGO': { 
    R_avg: 0.77, 
    R_std_dev: 0.11,
    HV_segments: {
      ultra_short: 32.8,
      short: 30.5,
      medium: 28.2,
      long: 26.5
    }
  },
  'ORCL': { 
    R_avg: 0.86, 
    R_std_dev: 0.08,
    HV_segments: {
      ultra_short: 28.2,
      short: 26.5,
      medium: 24.8,
      long: 23.2
    }
  },
  
  // 中概股 - 受政策和情绪影响大，波动性高
  'BABA': { 
    R_avg: 0.65, 
    R_std_dev: 0.18,
    HV_segments: {
      ultra_short: 45.5,
      short: 42.8,
      medium: 39.5,
      long: 36.8
    }
  },
  'PDD': { 
    R_avg: 0.60, 
    R_std_dev: 0.20,
    HV_segments: {
      ultra_short: 50.8,
      short: 47.5,
      medium: 44.2,
      long: 41.5
    }
  },
  'JD': { 
    R_avg: 0.68, 
    R_std_dev: 0.16,
    HV_segments: {
      ultra_short: 38.5,
      short: 36.2,
      medium: 33.8,
      long: 31.5
    }
  },
  'NTES': { 
    R_avg: 0.72, 
    R_std_dev: 0.14,
    HV_segments: {
      ultra_short: 33.8,
      short: 31.5,
      medium: 29.2,
      long: 27.5
    }
  },
  'TME': { 
    R_avg: 0.70, 
    R_std_dev: 0.15,
    HV_segments: {
      ultra_short: 38.2,
      short: 35.8,
      medium: 33.2,
      long: 31.0
    }
  }
};

// 获取股票的历史基准数据
function getHistoricalBenchmark(symbol) {
  return HISTORICAL_BENCHMARKS[symbol] || {
    R_avg: 0.80,    // 默认基准
    R_std_dev: 0.10, // 默认标准差
    HV_segments: {
      ultra_short: 25.0,
      short: 23.0,
      medium: 21.0,
      long: 19.0
    }
  };
}

// 根据期权剩余天数获取对应的历史波动率
function getSegmentedHV(symbol, daysToExpiry) {
  const benchmark = getHistoricalBenchmark(symbol);
  const hvSegments = benchmark.HV_segments;
  
  // 根据DTE选择对应的HV区间
  let hvValue;
  if (daysToExpiry <= 20) {
    hvValue = hvSegments.ultra_short; // 超短期：0-20天
  } else if (daysToExpiry <= 60) {
    hvValue = hvSegments.short;       // 短期：21-60天
  } else if (daysToExpiry <= 180) {
    hvValue = hvSegments.medium;      // 中期：61-180天
  } else {
    hvValue = hvSegments.long;        // 长期：>180天
  }
  
  // 添加一些随机波动（±5%）来模拟真实市场变化
  const randomFactor = 0.95 + Math.random() * 0.1;
  return hvValue * randomFactor;
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
  getSegmentedHV,
  calculateVVI
}; 