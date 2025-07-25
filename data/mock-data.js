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
    // 美股市值前20名价格范围
    'NVDA': { min: 140, max: 180 },
    'MSFT': { min: 320, max: 380 },
    'AAPL': { min: 160, max: 190 },
    'AMZN': { min: 140, max: 170 },
    'GOOGL': { min: 120, max: 150 },
    'META': { min: 280, max: 320 },
    'AVGO': { min: 1200, max: 1400 },
    'TSLA': { min: 200, max: 280 },
    'BRK-B': { min: 400, max: 450 },
    'JPM': { min: 220, max: 260 },
    'WMT': { min: 80, max: 100 },
    'LLY': { min: 700, max: 850 },
    'V': { min: 270, max: 320 },
    'ORCL': { min: 100, max: 130 },
    'MA': { min: 450, max: 520 },
    'NFLX': { min: 380, max: 450 },
    'XOM': { min: 110, max: 130 },
    'COST': { min: 650, max: 750 },
    'JNJ': { min: 150, max: 180 },
    'HD': { min: 350, max: 420 },
    // 中概股价格范围
    'BABA': { min: 80, max: 120 },
    'PDD': { min: 120, max: 160 },
    'NTES': { min: 90, max: 120 },
    'JD': { min: 35, max: 50 },
    'TME': { min: 8, max: 15 }
  };
  
  const range = priceRanges[symbol] || { min: 50, max: 200 };
  const price = Math.random() * (range.max - range.min) + range.min;
  return Math.round(price * 100) / 100;
}

// 强制刷新特定股票的缓存数据
async function refreshStockCache(symbol, priceData = null) {
  if (cachedStocks) {
    console.log(`更新缓存中的 ${symbol} 数据`);
    
    // 如果已提供数据则使用，否则获取新的价格数据
    const newPriceData = priceData || await alphaVantageService.getStockPrice(symbol, true);
    
    // 找到并更新缓存中的股票数据
    const stockIndex = cachedStocks.findIndex(stock => stock.symbol === symbol);
    if (stockIndex !== -1) {
      const stockInfo = stocksList.find(stock => stock.symbol === symbol);
      cachedStocks[stockIndex] = {
        ...stockInfo,
        price: newPriceData.price,
        open: newPriceData.open,
        high: newPriceData.high,
        low: newPriceData.low,
        volume: newPriceData.volume,
        timestamp: newPriceData.timestamp,
        lastUpdated: newPriceData.lastUpdated,
        isRealTime: !newPriceData.fallback
      };
    }
  }
}

// 导出异步函数来获取股票数据
const getStocks = getStocksWithRealTimePrices;

// 获取真实期权数据
async function getRealOptionsData(symbol, optionType = null, daysToExpiry = null) {
  try {
    console.log(`获取 ${symbol} 的真实期权数据...`);
    
    // 调用 AlphaVantage API 获取期权数据
    const optionsData = await alphaVantageService.getOptionsData(symbol, true);
    
    // 筛选期权数据
    const filteredOptions = alphaVantageService.filterOptionsData(
      optionsData, 
      optionType, 
      daysToExpiry
    );
    
    // 转换为前端需要的格式
    const formattedOptions = filteredOptions.map(option => ({
      symbol: option.symbol,
      contractID: option.contractID,
      daysToExpiry: option.daysToExpiry,
      strikePrice: option.strikePrice,
      premium: option.premium,
      type: option.type,
      bid: option.bid,
      ask: option.ask,
      volume: option.volume,
      openInterest: option.openInterest,
      impliedVolatility: (option.impliedVolatility * 100).toFixed(2), // 转换为百分比
      historicalVolatility: option.historicalVolatility ? option.historicalVolatility.toFixed(2) : null, // HV
      hvPeriod: option.hvPeriod, // HV计算周期
      ivHvRatio: option.historicalVolatility ? ((option.impliedVolatility * 100) / option.historicalVolatility).toFixed(2) : null, // IV/HV比率
      delta: option.delta,
      gamma: option.gamma,
      theta: option.theta,
      vega: option.vega,
      rho: option.rho,
      lastPrice: option.lastPrice,
      expiration: option.expiration,
      score: null, // 评分留空
      dataSource: 'real-time'
    }));

    console.log(`成功获取 ${formattedOptions.length} 个期权合约数据`);
    return formattedOptions;
    
  } catch (error) {
    console.error(`获取 ${symbol} 真实期权数据失败:`, error.message);
    throw error;
  }
}

// 期权数据获取函数（优先使用真实数据，失败时使用模拟数据）
async function getOptionsData(symbol, stockPrice, optionType, daysToExpiry) {
  try {
    // 首先尝试获取真实期权数据
    const realOptions = await getRealOptionsData(symbol, optionType, daysToExpiry);
    
    if (realOptions.length > 0) {
      console.log(`使用 ${symbol} 的真实期权数据`);
      return realOptions;
    }
  } catch (error) {
    console.log(`真实期权数据获取失败，使用模拟数据: ${error.message}`);
  }
  
  // 如果真实数据获取失败或没有数据，使用原有的模拟数据
  console.log(`使用 ${symbol} 的模拟期权数据`);
  const mockOptions = generateOptionData(symbol, stockPrice, optionType, daysToExpiry);
  
  // 为模拟数据添加数据源标识
  return mockOptions.map(option => ({
    ...option,
    dataSource: 'fallback'
  }));
}

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
    
    // 历史波动率（基于股票和期权周期的模拟）
    const getDefaultHV = (symbol) => {
      const defaultHVRanges = {
        // 科技股通常波动率较高
        'NVDA': 45, 'TSLA': 50, 'META': 35, 'NFLX': 40,
        // 大盘股相对稳定
        'AAPL': 25, 'MSFT': 25, 'GOOGL': 30, 'AMZN': 35,
        // 金融股
        'JPM': 20, 'V': 18, 'MA': 18, 'BRK-B': 15,
        // 消费品
        'WMT': 15, 'COST': 18, 'HD': 20,
        // 能源
        'XOM': 25,
        // 医药
        'JNJ': 12, 'LLY': 22,
        // 半导体
        'AVGO': 30,
        // 中概股
        'BABA': 40, 'PDD': 45, 'JD': 35, 'NTES': 30, 'TME': 35
      };
      return defaultHVRanges[symbol] || 25;
    };
    
    const baseHV = getDefaultHV(symbol);
    const hv = baseHV * (0.9 + Math.random() * 0.2); // 添加一些随机性
    
    // HV计算周期
    let hvPeriod;
    if (daysToExpiry <= 20) {
      hvPeriod = 20; // 超短期
    } else if (daysToExpiry <= 60) {
      hvPeriod = 30; // 短期
    } else if (daysToExpiry <= 180) {
      hvPeriod = 60; // 中期
    } else {
      hvPeriod = 180; // 长期
    }
    
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
      type: optionType, // 添加类型字段，与真实数据格式一致
      bid: Math.max(0, premium * 0.95), // 模拟买入价
      ask: premium * 1.05, // 模拟卖出价
      volume: Math.floor(Math.random() * 1000), // 模拟成交量
      openInterest: Math.floor(Math.random() * 5000), // 模拟未平仓
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      exerciseProbability: Math.round(exerciseProbability * 100) / 100,
      impliedVolatility: iv.toFixed(2), // IV百分比格式
      historicalVolatility: hv.toFixed(2), // HV百分比格式
      hvPeriod: hvPeriod, // HV计算周期
      ivp: Math.round(ivp * 100) / 100,
      ivHvRatio: (ivHvRatio * 100).toFixed(2), // IV/HV比率百分比
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
  getOptionsData,
  generateOptionData,
  refreshStockCache,
  // 为了向后兼容，保留stocks作为备用
  stocks: () => generateFallbackStocks()
}; 