// 导入股票列表配置
const { stocksList } = require('./stocks-config');

// 动态生成股票价格的函数
function generateStockPrice(symbol) {
  // 为不同股票设置不同的价格范围，让价格看起来更真实
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
  return Math.round(price * 100) / 100; // 保留两位小数
}

// 为股票列表添加动态生成的价格
const stocks = stocksList.map(stock => ({
  ...stock,
  price: generateStockPrice(stock.symbol)
}));

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
  stocks,
  generateOptionData
}; 