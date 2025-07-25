require('dotenv').config();

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
  
  // 调试：输出IV异常情况
  if (!filters.ivSanity && iv > 0) {
    console.log(`IV过滤调试: 原始值=${option.impliedVolatility}, 解析值=${iv}, 范围=${FILTER_CONFIG.minImpliedVolatilityPercent}-${FILTER_CONFIG.maxImpliedVolatilityPercent}, 通过=${filters.ivSanity}`);
  }
  
  // 只有通过全部筛选的期权才是合格期权
  const isQualified = filters.liquidity && filters.bidAskSpread && filters.ivSanity;
  
  return {
    isQualified,
    filters,
    filterStatus: getFilterStatus(filters)
  };
}

// 获取筛选状态描述
function getFilterStatus(filters) {
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

// 获取过滤配置（用于API返回）
function getFilterConfig() {
  return { ...FILTER_CONFIG };
}

module.exports = {
  FILTER_CONFIG,
  applyOptionFilters,
  getFilterStatus,
  getFilterConfig
}; 