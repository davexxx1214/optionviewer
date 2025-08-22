// 综合吸引力评分系统 (Composite Attractiveness Score, CAS)
// 为买入看涨期权和卖出看涨期权提供智能评分

const { getHistoricalBenchmark } = require('./benchmarks');

/**
 * 计算波动率价值分 (Score_Vol)
 * 评估期权权利金相对于其历史正常水平是"贵"还是"便宜"
 * 
 * @param {number} currentIV - 当前隐含波动率 (小数形式，如0.32表示32%)
 * @param {number} currentHV - 当前历史波动率 (百分比形式，如32.45表示32.45%)
 * @returns {number} 波动率价值分 (0-100)
 */
function calculateVolatilityScore(currentIV, currentHV) {
  // 确保输入格式一致 - 都转换为小数形式
  const iv = currentIV > 1 ? currentIV / 100 : currentIV; // 统一为小数形式
  const hv = currentHV > 1 ? currentHV / 100 : currentHV; // 统一为小数形式
  
  if (iv <= 0 || hv <= 0) {
    return 0;
  }
  
  // 计算波动率比率: Ratio_Vol = IV / HV
  const ratioVol = iv / hv;
  
  // 将比率限制在 [0.7, 2.0] 的范围内，避免极端值影响
  const clampedRatio = Math.max(0.7, Math.min(2.0, ratioVol));
  
  // 将 [0.7, 2.0] 的范围线性映射到 [100, 0] 的分数
  // 当比率低时（IV相对便宜），分数应该高（对买方有利）
  const scoreVol = ((2.0 - clampedRatio) / (2.0 - 0.7)) * 100;
  
  return Math.round(scoreVol);
}

/**
 * 计算投机潜力分 (Score_Spec)
 * 评估期权的"效率"，即用给定的成本能撬动多大的潜在收益
 * 
 * @param {Array} optionsInSameExpiry - 同一到期日的所有看涨期权
 * @param {Object} currentOption - 当前期权
 * @returns {number} 投机潜力分 (0-100)
 */
function calculateSpeculativeScore(optionsInSameExpiry, currentOption) {
  const delta = parseFloat(currentOption.delta) || 0;
  const mark = parseFloat(currentOption.premium) || parseFloat(currentOption.mark) || 0;
  
  if (delta <= 0 || mark <= 0) {
    return 0;
  }
  
  // 计算当前期权的Delta性价比指数
  const currentIndexSpec = delta / mark;
  
  // 计算同一到期日所有期权的Delta性价比指数
  let maxIndexSpec = 0;
  
  optionsInSameExpiry.forEach(option => {
    const optionDelta = parseFloat(option.delta) || 0;
    const optionMark = parseFloat(option.premium) || parseFloat(option.mark) || 0;
    
    if (optionDelta > 0 && optionMark > 0) {
      const indexSpec = optionDelta / optionMark;
      maxIndexSpec = Math.max(maxIndexSpec, indexSpec);
    }
  });
  
  if (maxIndexSpec === 0) {
    return 0;
  }
  
  // 计算分数: Score_Spec = (当前期权的 Index_Spec / Max_Index_Spec) * 100
  const scoreSpec = (currentIndexSpec / maxIndexSpec) * 100;
  
  return Math.round(scoreSpec);
}

/**
 * 计算买入看涨期权的CAS评分
 * 买入期权使用ask价格（买入成本）
 * 
 * @param {Object} option - 期权数据
 * @param {Array} optionsInSameExpiry - 同一到期日的所有看涨期权
 * @param {string} symbol - 股票代码
 * @returns {Object} 买入看涨期权评分结果
 */
function calculateBuyCallScore(option, optionsInSameExpiry, symbol) {
  const currentIV = parseFloat(option.impliedVolatility) || 0;
  const currentHV = parseFloat(option.historicalVolatility) || 0;
  const askPrice = parseFloat(option.ask) || parseFloat(option.premium) || parseFloat(option.mark) || 0;
  
  if (currentIV <= 0 || currentHV <= 0 || askPrice <= 0) {
    return {
      buyCallScore: 0,
      scoreVol: 0,
      scoreSpec: 0,
      details: {
        ivHvRatio: 0,
        deltaPerPremium: 0,
        explanation: "数据不完整",
        price: askPrice,
        priceType: "ask"
      }
    };
  }
  
  // 计算两个子分数
  const scoreVol = calculateVolatilityScore(currentIV, currentHV);
  
  // 创建一个临时期权对象，使用ask价格计算买入投机潜力分
  const buyOption = { ...option, premium: askPrice, mark: askPrice };
  const scoreSpec = calculateSpeculativeScore(optionsInSameExpiry.map(opt => ({
    ...opt,
    premium: parseFloat(opt.ask) || parseFloat(opt.premium) || parseFloat(opt.mark) || 0,
    mark: parseFloat(opt.ask) || parseFloat(opt.premium) || parseFloat(opt.mark) || 0
  })), buyOption);
  
  // 使用几何平均数合并分数（惩罚在任何一个维度上表现极差的选项）
  const buyCallScore = scoreVol > 0 && scoreSpec > 0 ? 
    Math.round(Math.sqrt(scoreVol * scoreSpec)) : 0;
  
  return {
    buyCallScore,
    scoreVol,
    scoreSpec,
    details: {
      ivHvRatio: (currentIV / (currentHV > 1 ? currentHV / 100 : currentHV)).toFixed(2),
      deltaPerPremium: (parseFloat(option.delta) / askPrice).toFixed(4),
      explanation: `波动率分${scoreVol} × 投机分${scoreSpec} = ${buyCallScore}`,
      price: askPrice,
      priceType: "ask (买入价)"
    }
  };
}

/**
 * 计算卖出看涨期权的CAS评分
 * 卖出期权使用bid价格（卖出收入）
 * 
 * @param {Object} option - 期权数据
 * @param {Array} optionsInSameExpiry - 同一到期日的所有看涨期权
 * @param {string} symbol - 股票代码
 * @returns {Object} 卖出看涨期权评分结果
 */
function calculateSellCallScore(option, optionsInSameExpiry, symbol) {
  const currentIV = parseFloat(option.impliedVolatility) || 0;
  const currentHV = parseFloat(option.historicalVolatility) || 0;
  const bidPrice = parseFloat(option.bid) || parseFloat(option.premium) || parseFloat(option.mark) || 0;
  
  if (currentIV <= 0 || currentHV <= 0 || bidPrice <= 0) {
    return {
      sellCallScore: 0,
      scoreVol: 0,
      scoreSpec: 0,
      details: {
        ivHvRatio: 0,
        deltaPerPremium: 0,
        explanation: "数据不完整",
        price: bidPrice,
        priceType: "bid"
      }
    };
  }
  
  // 对于卖出期权，波动率分数反转：IV高于HV时对卖方有利
  const volScore = calculateVolatilityScore(currentIV, currentHV);
  const sellVolScore = 100 - volScore; // 反转波动率分数
  
  // 创建一个临时期权对象，使用bid价格计算卖出投机潜力分
  const sellOption = { ...option, premium: bidPrice, mark: bidPrice };
  const buySpecScore = calculateSpeculativeScore(optionsInSameExpiry.map(opt => ({
    ...opt,
    premium: parseFloat(opt.bid) || parseFloat(opt.premium) || parseFloat(opt.mark) || 0,
    mark: parseFloat(opt.bid) || parseFloat(opt.premium) || parseFloat(opt.mark) || 0
  })), sellOption);
  
  // 对于卖出期权，投机分数反转：买方性价比低时对卖方有利
  const sellSpecScore = 100 - buySpecScore;
  
  // 使用几何平均数合并分数
  const sellCallScore = sellVolScore > 0 && sellSpecScore > 0 ? 
    Math.round(Math.sqrt(sellVolScore * sellSpecScore)) : 0;
  
  return {
    sellCallScore,
    scoreVol: sellVolScore,
    scoreSpec: sellSpecScore,
    details: {
      ivHvRatio: (currentIV / (currentHV > 1 ? currentHV / 100 : currentHV)).toFixed(2),
      deltaPerPremium: (parseFloat(option.delta) / bidPrice).toFixed(4),
      explanation: `波动率分${sellVolScore} × 投机分${sellSpecScore} = ${sellCallScore}`,
      price: bidPrice,
      priceType: "bid (卖出价)"
    }
  };
}

/**
 * 计算完整的CAS评分（包含买入和卖出）
 * 
 * @param {Object} option - 期权数据
 * @param {Array} allOptions - 所有期权数据（用于分组）
 * @param {string} symbol - 股票代码
 * @returns {Object} 完整的CAS评分结果
 */
function calculateCASScore(option, allOptions, symbol) {
  // 找出同一到期日的所有看涨期权
  const sameExpiryOptions = allOptions.filter(opt => 
    opt.expiration === option.expiration && 
    opt.type === 'call'
  );
  
  // 分别计算买入和卖出看涨期权评分（使用不同价格）
  const buyCallResult = calculateBuyCallScore(option, sameExpiryOptions, symbol);
  const sellCallResult = calculateSellCallScore(option, sameExpiryOptions, symbol);
  
  return {
    buyCall: buyCallResult,
    sellCall: sellCallResult,
    metadata: {
      symbol: symbol,
      expiration: option.expiration,
      daysToExpiry: option.daysToExpiry,
      strikePrice: option.strikePrice,
      sameExpiryOptionCount: sameExpiryOptions.length,
      askPrice: parseFloat(option.ask) || 0,
      bidPrice: parseFloat(option.bid) || 0,
      spread: (parseFloat(option.ask) || 0) - (parseFloat(option.bid) || 0)
    }
  };
}

/**
 * 根据分数获取评分等级
 * 
 * @param {number} score - 评分 (0-100)
 * @returns {string} 评分等级
 */
function getScoreGrade(score) {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'average';
  return 'poor';
}

/**
 * 根据分数获取评分描述
 * 
 * @param {number} score - 评分 (0-100)
 * @param {string} strategy - 策略类型 ('buy' 或 'sell')
 * @returns {string} 评分描述
 */
function getScoreDescription(score, strategy = 'buy') {
  const grade = getScoreGrade(score);
  const action = strategy === 'buy' ? '买入' : '卖出';
  
  const descriptions = {
    excellent: `极佳${action}机会`,
    good: `良好${action}机会`, 
    average: `一般${action}机会`,
    poor: `较差${action}机会`
  };
  
  return descriptions[grade] || `${action}机会`;
}

module.exports = {
  calculateVolatilityScore,
  calculateSpeculativeScore,
  calculateBuyCallScore,
  calculateSellCallScore,
  calculateCASScore,
  getScoreGrade,
  getScoreDescription
};
