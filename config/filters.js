require('dotenv').config();
const { getHistoricalBenchmark, calculateVVI } = require('./benchmarks');
const { calculateCASScore, getScoreGrade, getScoreDescription } = require('./cas-scoring');

// 期权过滤器配置
const FILTER_CONFIG = {
  // 流动性过滤阈值
  minDailyVolume: parseInt(process.env.MIN_DAILY_VOLUME) || 10,
  minOpenInterest: parseInt(process.env.MIN_OPEN_INTEREST) || 100,
  
  // 价差过滤阈值 (百分比)
  maxBidAskSpreadPercent: parseInt(process.env.MAX_BID_ASK_SPREAD_PERCENT) || 10,
  
  // IV合理性过滤阈值 (百分比)
  minImpliedVolatilityPercent: parseInt(process.env.MIN_IMPLIED_VOLATILITY_PERCENT) || 15,
  maxImpliedVolatilityPercent: parseInt(process.env.MAX_IMPLIED_VOLATILITY_PERCENT) || 200
};

// 期权过滤函数
function applyOptionFilters(option) {
  const filters = {
    liquidity: false,
    bidAskSpread: false,
    ivSanity: false
  };
  
  // 流动性过滤 (Liquidity Filter)
  const volume = option.volume || 0;
  const openInterest = option.openInterest || 0;
  filters.liquidity = volume > FILTER_CONFIG.minDailyVolume && openInterest > FILTER_CONFIG.minOpenInterest;
  
  // 价差过滤 (Bid-Ask Spread Filter)
  const bid = parseFloat(option.bid) || 0;
  const ask = parseFloat(option.ask) || 0;
  if (ask > 0) {
    const bidAskSpread = (ask - bid) / ask * 100;
    filters.bidAskSpread = bidAskSpread < FILTER_CONFIG.maxBidAskSpreadPercent;
  } else {
    // 如果没有卖出报价，视为价差过大
    filters.bidAskSpread = false;
  }
  
  // IV合理性过滤 (IV Sanity Filter) - 修复逻辑错误
  // 确保正确处理百分比格式的IV值
  let iv = 0;
  if (option.impliedVolatility) {
    // 处理不同格式的IV值
    const ivString = option.impliedVolatility.toString();
    iv = parseFloat(ivString.replace('%', ''));
    
    // 如果IV值很小(< 1)，可能是小数格式，需要转换为百分比
    if (iv < 1 && iv > 0) {
      iv = iv * 100;
    }
  }
  
  // 修复：使用正确的范围判断，并添加调试信息
  filters.ivSanity = iv >= FILTER_CONFIG.minImpliedVolatilityPercent && iv <= FILTER_CONFIG.maxImpliedVolatilityPercent;
  
  // 移除调试输出，保持日志清晰
  
  // 只有通过全部筛选的期权才是合格期权
  const isQualified = filters.liquidity && filters.bidAskSpread && filters.ivSanity;
  
  return {
    isQualified,
    filters,
    filterStatus: getFilterStatus(filters)
  };
}

// 获取筛选状态描述（简洁版本）
function getFilterStatus(filters) {
  const failedFilters = [];
  
  if (!filters.liquidity) {
    failedFilters.push('流动性');
  }
  if (!filters.bidAskSpread) {
    failedFilters.push('价差');
  }
  if (!filters.ivSanity) {
    failedFilters.push('IV');
  }
  
  if (failedFilters.length === 0) {
    return '✓';
  } else {
    return '✗ ' + failedFilters.join(',');
  }
}

// 获取详细筛选状态描述（用于工具提示）
function getDetailedFilterStatus(filters) {
  const failedFilters = [];
  
  if (!filters.liquidity) {
    failedFilters.push('流动性不足');
  }
  if (!filters.bidAskSpread) {
    failedFilters.push('价差过大');
  }
  if (!filters.ivSanity) {
    failedFilters.push('IV异常');
  }
  
  if (failedFilters.length === 0) {
    return '合格期权';
  } else {
    return failedFilters.join(', ');
  }
}

// 计算期权的CAS评分（仅对合格期权）
function calculateOptionCAS(option, allOptions, symbol) {
  // 只为合格期权计算CAS
  if (!option.isQualified) {
    return {
      buyCall: { buyCallScore: 0, scoreVol: 0, scoreSpec: 0, details: { explanation: "不合格期权" } },
      sellCall: { sellCallScore: 0, scoreVol: 0, scoreSpec: 0, details: { explanation: "不合格期权" } }
    };
  }
  
  // 计算CAS评分
  const casResult = calculateCASScore(option, allOptions, symbol);
  
  return casResult;
}

// 保留VVI评分函数用于向后兼容
function calculateOptionVVI(option, symbol) {
  // 只为合格期权计算VVI
  if (!option.isQualified) {
    return 0;
  }
  
  // 获取当前HV和IV值
  const currentHV = parseFloat(option.historicalVolatility) || 0;
  const currentIV = parseFloat(option.impliedVolatility) || 0;
  
  if (currentHV <= 0 || currentIV <= 0) {
    return 0;
  }
  
  // 获取历史基准数据
  const benchmark = getHistoricalBenchmark(symbol);
  
  // 计算VVI评分
  const vviResult = calculateVVI(currentHV, currentIV, benchmark);
  
  return vviResult;
}

// 获取过滤配置（用于API返回）
function getFilterConfig() {
  return { ...FILTER_CONFIG };
}

module.exports = {
  FILTER_CONFIG,
  applyOptionFilters,
  getFilterStatus,
  getDetailedFilterStatus,
  getFilterConfig,
  calculateOptionVVI, // 保留用于向后兼容
  calculateOptionCAS  // 新的CAS评分函数
}; 