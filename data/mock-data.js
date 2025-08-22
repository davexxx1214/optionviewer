// 导入股票列表配置和AlphaVantage服务
const { stocksList } = require('./stocks-config');
const alphaVantageService = require('../services/alphavantage');
const { applyOptionFilters, calculateOptionVVI, calculateOptionCAS } = require('../config/filters');
const { getScoreGrade, getScoreDescription } = require('../config/cas-scoring');

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
        isRealTime: priceData ? !priceData.fallback : false,
        // 传递缓存相关字段
        fromCache: priceData ? priceData.fromCache : false,
        cachedAt: priceData ? priceData.cachedAt : null,
        fallback: priceData ? priceData.fallback : true
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
async function getRealOptionsData(symbol, stockPrice, optionType = null, daysToExpiry = null, benchmarkData = null) {
  try {
    console.log(`获取 ${symbol} 的真实期权数据...`);
    
    // 调用 AlphaVantage API 获取期权数据，传递股票价格用于计算杠杆率
    const optionsData = await alphaVantageService.getOptionsData(symbol, true, null, stockPrice);
    
    // 筛选期权数据
    const filteredOptions = alphaVantageService.filterOptionsData(
      optionsData, 
      optionType, 
      daysToExpiry
    );
    
         // 转换为前端需要的格式并应用过滤器
     const formattedOptions = filteredOptions.map(option => {
       const filterResult = applyOptionFilters(option);
       
       // 构建基础期权对象
       const formattedOption = {
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
         ivHvRatio: option.historicalVolatility ? (option.impliedVolatility / (option.historicalVolatility / 100)).toFixed(2) : null, // IV/HV比率
         delta: option.delta,
         gamma: option.gamma,
         theta: option.theta,
         vega: option.vega,
         rho: option.rho,
         lastPrice: option.lastPrice,
         expiration: option.expiration,
         leverageRatio: option.leverageRatio, // 杠杆率
         exerciseProbability: option.exerciseProbability, // 行权概率
         dataSource: 'real-time',
         // 筛选相关字段
         isQualified: filterResult.isQualified,
         filterStatus: filterResult.filterStatus,
         filters: filterResult.filters,
         benchmarkAnalysis: null
       };
       
       // 如果是NVDA并且有基准数据，则进行分析
       if (symbol.toUpperCase() === 'NVDA' && benchmarkData && benchmarkData.benchmarks) {
         const dte = option.daysToExpiry;
         const currentIV = option.impliedVolatility; // IV已经是小数形式
         
         let category = null;
         if (dte <= 20) category = 'ultra_short';
         else if (dte <= 60) category = 'short';
         else if (dte <= 180) category = 'medium';
         else category = 'long';
         
         const benchmark = benchmarkData.benchmarks[category];
         
         if (benchmark && benchmark.averageIV > 0) {
           const ratio = currentIV / benchmark.averageIV;
           let comparison = 'normal';
           if (ratio > 1.2) comparison = 'high';
           else if (ratio < 0.8) comparison = 'low';
           
           formattedOption.benchmarkAnalysis = {
             category: category,
             currentIV: (currentIV * 100).toFixed(2) + '%',
             benchmarkIV: (benchmark.averageIV * 100).toFixed(2) + '%',
             ratio: ratio.toFixed(2),
             comparison: comparison,
             sampleCount: benchmark.sampleCount
           };
         }
       }
       
       return formattedOption;
     });

    // 为所有合格的看涨期权计算CAS评分
    const callOptions = formattedOptions.filter(opt => opt.type === 'call');
    callOptions.forEach(option => {
      const casResult = calculateOptionCAS(option, callOptions, symbol);
      
      // 添加CAS评分到期权对象
      option.casScoring = {
        buyCall: {
          score: casResult.buyCall.buyCallScore,
          scoreVol: casResult.buyCall.scoreVol,
          scoreSpec: casResult.buyCall.scoreSpec,
          grade: getScoreGrade(casResult.buyCall.buyCallScore),
          description: getScoreDescription(casResult.buyCall.buyCallScore, 'buy'),
          details: casResult.buyCall.details
        },
        sellCall: {
          score: casResult.sellCall.sellCallScore,
          scoreVol: casResult.sellCall.scoreVol,
          scoreSpec: casResult.sellCall.scoreSpec,
          grade: getScoreGrade(casResult.sellCall.sellCallScore),
          description: getScoreDescription(casResult.sellCall.sellCallScore, 'sell'),
          details: casResult.sellCall.details
        }
      };
    });

    console.log(`成功获取 ${formattedOptions.length} 个期权合约数据，其中 ${callOptions.length} 个看涨期权已计算CAS评分`);
    return formattedOptions;
    
  } catch (error) {
    console.error(`获取 ${symbol} 真实期权数据失败:`, error.message);
    throw error;
  }
}

// 期权数据获取函数（优先使用真实数据，失败时使用模拟数据）
async function getOptionsData(symbol, stockPrice, optionType, daysToExpiry, benchmarkData = null) {
  try {
    // 首先尝试获取真实期权数据
    const realOptions = await getRealOptionsData(symbol, stockPrice, optionType, daysToExpiry, benchmarkData);
    
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
    
    // 历史波动率（使用分段HV函数）
    const { getSegmentedHV } = require('../config/benchmarks');
    const hv = getSegmentedHV(symbol, daysToExpiry);
    
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
    
    // 年化收益率（确保使用有效的到期天数）
    const validDaysForCalculation = Math.max(1, daysToExpiry);
    const annualizedReturn = (premium / stockPrice) * (365 / validDaysForCalculation) * 100;
    
    // 模拟Delta值和计算行权概率
    let delta;
    if (isCall) {
      // Call期权的Delta在0到1之间
      delta = moneyness > 1 ? 0.6 + (moneyness - 1) * 0.3 : 0.3 + (moneyness - 1) * 0.3;
      delta = Math.max(0.05, Math.min(0.95, delta));
    } else {
      // Put期权的Delta在-1到0之间
      delta = moneyness < 1 ? -(0.6 + (1 - moneyness) * 0.3) : -(0.3 - (moneyness - 1) * 0.3);
      delta = Math.max(-0.95, Math.min(-0.05, delta));
    }
    
    // 行权概率 = Delta (转换为百分比)
    let exerciseProbability;
    if (isCall) {
      exerciseProbability = parseFloat((delta * 100).toFixed(2));
    } else {
      exerciseProbability = parseFloat((Math.abs(delta) * 100).toFixed(2));
    }
    
    // 杠杆率 = 正股价格 / 期权价格
    const leverageRatio = parseFloat((stockPrice / premium).toFixed(2));
    
    // IVP (隐含波动率百分位)
    const ivp = Math.random() * 100;
    
    // IV/HV比率
    const ivHvRatio = iv / hv;
    
    // 模拟真实的买卖报价和成交数据
    const bid = Math.max(0, premium * (0.95 + Math.random() * 0.03)); // 买入价稍低
    const ask = premium * (1.02 + Math.random() * 0.03); // 卖出价稍高
    const volume = Math.floor(Math.random() * 200); // 模拟成交量 0-200
    const openInterest = Math.floor(Math.random() * 1000); // 模拟未平仓 0-1000
    
         // 构建模拟期权对象用于过滤
     const mockOption = {
       bid: bid,
       ask: ask,
       volume: volume,
       openInterest: openInterest,
       impliedVolatility: iv,
       historicalVolatility: hv
     };
     
     const filterResult = applyOptionFilters(mockOption);
     
     // VVI评分计算 - 这部分将被移除
     
    // 获取财报日期（模拟）
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + Math.floor(Math.random() * 90) + 30);
    
    // 🔥 确保模拟数据的到期天数为正数
    const validDaysToExpiry = Math.max(1, daysToExpiry);
    
    options.push({
      symbol: symbol,
      date: new Date().toISOString().split('T')[0],
      currentPrice: stockPrice,
      daysToExpiry: validDaysToExpiry,
      strikePrice: strikePrice,
      premium: Math.round(premium * 100) / 100,
      type: optionType, // 添加类型字段，与真实数据格式一致
      bid: Math.round(bid * 100) / 100,
      ask: Math.round(ask * 100) / 100,
      volume: volume,
      openInterest: openInterest,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      exerciseProbability: exerciseProbability, // 行权概率（已经是百分比格式）
      impliedVolatility: iv.toFixed(2), // IV百分比格式
      historicalVolatility: hv.toFixed(2), // HV百分比格式
      hvPeriod: hvPeriod, // HV计算周期
      ivp: Math.round(ivp * 100) / 100,
      ivHvRatio: ivHvRatio.toFixed(2), // IV/HV比率
      delta: delta, // Delta值
      leverageRatio: leverageRatio, // 杠杆率
      price: Math.round(premium * 100) / 100,
             earningsDate: earningsDate.toISOString().split('T')[0],
       optionType: optionType,
       // 筛选相关字段
       isQualified: filterResult.isQualified,
       filterStatus: filterResult.filterStatus,
       filters: filterResult.filters
    });
  });
  
  // 为所有合格的看涨期权计算CAS评分
  const callOptions = options.filter(opt => opt.type === 'call');
  callOptions.forEach(option => {
    const casResult = calculateOptionCAS(option, callOptions, symbol);
    
    // 添加CAS评分到期权对象
    option.casScoring = {
      buyCall: {
        score: casResult.buyCall.buyCallScore,
        scoreVol: casResult.buyCall.scoreVol,
        scoreSpec: casResult.buyCall.scoreSpec,
        grade: getScoreGrade(casResult.buyCall.buyCallScore),
        description: getScoreDescription(casResult.buyCall.buyCallScore, 'buy'),
        details: casResult.buyCall.details
      },
      sellCall: {
        score: casResult.sellCall.sellCallScore,
        scoreVol: casResult.sellCall.scoreVol,
        scoreSpec: casResult.sellCall.scoreSpec,
        grade: getScoreGrade(casResult.sellCall.sellCallScore),
        description: getScoreDescription(casResult.sellCall.sellCallScore, 'sell'),
        details: casResult.sellCall.details
      }
    };
  });
  
  // 按评分排序
  return options;
}

module.exports = {
  getStocks,
  getOptionsData,
  generateOptionData,
  refreshStockCache,
  // 为了向后兼容，保留stocks作为备用
  stocks: () => generateFallbackStocks()
}; 