// 导入股票列表配置和AlphaVantage服务
const { stocksList } = require('./stocks-config');
const alphaVantageService = require('../services/alphavantage');

// 缓存的股票数据
let cachedStocks = null;
let lastUpdateTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 获取实时股票数据
async function getStocksWithRealTimePrices() {
  // 检查缓存是否有效
  if (cachedStocks && lastUpdateTime && (Date.now() - lastUpdateTime < CACHE_DURATION)) {
    console.log('使用缓存的股票数据');
    return cachedStocks;
  }

  try {
    console.log('获取实时股票价格数据...');
    
    // 提取股票代码
    const symbols = stocksList.map(stock => stock.symbol);
    
    // 批量获取实时价格
    const priceDataArray = await alphaVantageService.getBatchStockPrices(symbols);
    
    // 将价格数据与股票信息合并
    const stocksWithPrices = stocksList.map(stock => {
      const priceData = priceDataArray.find(p => p.symbol === stock.symbol);
      return {
        ...stock,
        price: priceData ? priceData.price : generateFallbackPrice(stock.symbol),
        open: priceData ? priceData.open : null,
        high: priceData ? priceData.high : null,
        low: priceData ? priceData.low : null,
        volume: priceData ? priceData.volume : null,
        timestamp: priceData ? priceData.timestamp : new Date().toISOString(),
        lastUpdated: priceData ? priceData.lastUpdated : new Date().toISOString(),
        isRealTime: priceData ? !priceData.fallback : false
      };
    });

    // 更新缓存
    cachedStocks = stocksWithPrices;
    lastUpdateTime = Date.now();
    
    console.log(`成功获取 ${stocksWithPrices.length} 只股票的价格数据`);
    return stocksWithPrices;
    
  } catch (error) {
    console.error('获取实时股票价格失败:', error.message);
    
    // 如果获取实时数据失败，返回备选数据
    return generateFallbackStocks();
  }
}

// 生成备选股票数据（当API完全失败时使用）
function generateFallbackStocks() {
  console.log('使用备选股票数据');
  return stocksList.map(stock => ({
    ...stock,
    price: generateFallbackPrice(stock.symbol),
    isRealTime: false,
    lastUpdated: new Date().toISOString()
  }));
}

// 生成备选价格
function generateFallbackPrice(symbol) {
  const priceRanges = {
    'NVDA': { min: 140, max: 180 },
    'AAPL': { min: 160, max: 190 },
    'MSFT': { min: 320, max: 380 },
    'GOOGL': { min: 120, max: 150 },
    'TSLA': { min: 200, max: 280 },
    'AMZN': { min: 140, max: 170 },
    'META': { min: 280, max: 320 },
    'AMD': { min: 120, max: 160 },
    'NFLX': { min: 380, max: 450 },
    'CRM': { min: 200, max: 250 },
    'ORCL': { min: 100, max: 130 },
    'INTC': { min: 20, max: 35 },
    'PYPL': { min: 50, max: 80 },
    'ADBE': { min: 450, max: 550 },
    'CSCO': { min: 45, max: 55 },
    'PEP': { min: 160, max: 180 },
    'CMCSA': { min: 35, max: 45 },
    'COST': { min: 650, max: 750 }
  };
  
  const range = priceRanges[symbol] || { min: 50, max: 200 };
  const price = Math.random() * (range.max - range.min) + range.min;
  return Math.round(price * 100) / 100;
}

// 导出异步函数来获取股票数据
const getStocks = getStocksWithRealTimePrices;

// 期权数据生成函数
function generateOptionData(symbol, stockPrice, optionType, daysToExpiry) {
  const options = [];
  const isCall = optionType === 'call';
  
  // 根据股价生成不同行权价的期权
  const priceRanges = [
    stockPrice * 0.85, stockPrice * 0.9, stockPrice * 0.95,
    stockPrice, stockPrice * 1.05, stockPrice * 1.1, stockPrice * 1.15
  ];
  
  priceRanges.forEach((strike, index) => {
    // 计算基础数据
    const strikePrice = Math.round(strike);
    const moneyness = stockPrice / strikePrice;
    
    // 内在价值和时间价值
    const intrinsicValue = isCall ? 
      Math.max(0, stockPrice - strikePrice) : 
      Math.max(0, strikePrice - stockPrice);
    
    // 期权价格模拟（简化Black-Scholes）
    const timeValue = Math.max(1, (daysToExpiry / 365) * 10 * Math.sqrt(moneyness));
    const premium = intrinsicValue + timeValue;
    
    // 隐含波动率
    const baseIV = 0.3 + (Math.abs(moneyness - 1) * 0.2) + (Math.random() * 0.1);
    const iv = Math.round(baseIV * 100 * 100) / 100;
    
    // 年化收益率
    const annualizedReturn = (premium / stockPrice) * (365 / daysToExpiry) * 100;
    
    // 行权概率（基于moneyness）
    let exerciseProbability;
    if (isCall) {
      exerciseProbability = moneyness > 1 ? 60 + (moneyness - 1) * 40 : 40 - (1 - moneyness) * 30;
    } else {
      exerciseProbability = moneyness < 1 ? 60 + (1 - moneyness) * 40 : 40 - (moneyness - 1) * 30;
    }
    exerciseProbability = Math.max(5, Math.min(95, exerciseProbability));
    
    // 历史波动率
    const hv = iv * (0.8 + Math.random() * 0.4);
    
    // IVP (隐含波动率百分位)
    const ivp = Math.random() * 100;
    
    // IV/HV比率
    const ivHvRatio = iv / hv;
    
    // 评分算法（综合评分）
    let score = 0;
    
    // 流动性评分（基于moneyness）
    const liquidityScore = Math.max(0, 100 - Math.abs(moneyness - 1) * 200);
    
    // 风险收益评分
    const riskReturnScore = Math.min(100, annualizedReturn * 2);
    
    // 波动率评分
    const volatilityScore = ivp < 20 ? 20 : (ivp > 80 ? 80 : ivp);
    
    // 时间价值评分
    const timeValueScore = Math.min(100, (timeValue / premium) * 100);
    
    // 综合评分
    score = (liquidityScore * 0.3 + riskReturnScore * 0.25 + volatilityScore * 0.25 + timeValueScore * 0.2);
    
    // 获取财报日期（模拟）
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + Math.floor(Math.random() * 90) + 30);
    
    options.push({
      symbol: symbol,
      date: new Date().toISOString().split('T')[0],
      currentPrice: stockPrice,
      daysToExpiry: daysToExpiry,
      strikePrice: strikePrice,
      premium: Math.round(premium * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      exerciseProbability: Math.round(exerciseProbability * 100) / 100,
      iv: iv,
      ivp: Math.round(ivp * 100) / 100,
      hv: Math.round(hv * 100) / 100,
      ivHvRatio: Math.round(ivHvRatio * 100) / 100,
      price: Math.round(premium * 100) / 100,
      earningsDate: earningsDate.toISOString().split('T')[0],
      score: Math.round(score * 100) / 100,
      optionType: optionType
    });
  });
  
  // 按评分排序
  return options.sort((a, b) => b.score - a.score);
}

module.exports = {
  getStocks,
  generateOptionData,
  // 为了向后兼容，保留stocks作为备用
  stocks: () => generateFallbackStocks()
}; 