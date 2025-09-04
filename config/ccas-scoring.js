// 备兑看涨期权优选评分系统 (Covered Call Attractiveness Score, CCAS) - V2.0
// 专门针对 Covered Call 策略的评分算法

/**
 * 计算潜在股价收益率 (Potential Gain Ratio)
 * 
 * @param {number} stockPrice - 股票的当前市场价格
 * @param {number} strikePrice - 期权的行权价
 * @returns {number} 潜在股价收益率
 */
function calculatePotentialGainRatio(stockPrice, strikePrice) {
  if (stockPrice <= 0 || strikePrice <= 0) {
    return 0;
  }
  
  return (strikePrice / stockPrice) - 1;
}

/**
 * 计算动态最低缓冲要求 (Required Buffer)
 * 根据到期天数动态调整要求，DTE越长，要求越高
 * 
 * @param {number} dte - 期权剩余到期天数
 * @returns {number} 动态最低缓冲要求
 */
function calculateRequiredBuffer(dte) {
  // 基于线性公式: Required_Buffer = 0.04 + ((dte - 8) / (29 - 8)) * (0.12 - 0.04)
  // 适用于DTE在8到29天之间
  const minDte = 8;
  const maxDte = 29;
  const minBuffer = 0.04;  // 4%
  const maxBuffer = 0.12;  // 12%
  
  // 将DTE限制在范围内
  const clampedDte = Math.max(minDte, Math.min(maxDte, dte));
  
  // 线性插值计算缓冲要求
  const requiredBuffer = minBuffer + ((clampedDte - minDte) / (maxDte - minDte)) * (maxBuffer - minBuffer);
  
  return requiredBuffer;
}

/**
 * 步骤 0: 硬性门槛 - 利润缓冲前置过滤器
 * 淘汰那些行权价离现价太近、几乎没有股价上涨空间的期权
 * 
 * @param {number} stockPrice - 股票的当前市场价格
 * @param {number} strikePrice - 期权的行权价
 * @param {number} dte - 期权剩余到期天数
 * @returns {Object} 过滤结果 { passed: boolean, potentialGainRatio: number, requiredBuffer: number }
 */
function profitBufferPrefilter(stockPrice, strikePrice, dte) {
  const potentialGainRatio = calculatePotentialGainRatio(stockPrice, strikePrice);
  const requiredBuffer = calculateRequiredBuffer(dte);
  
  const passed = potentialGainRatio >= requiredBuffer;
  
  return {
    passed,
    potentialGainRatio,
    requiredBuffer
  };
}

/**
 * 步骤 1: 权利金收益分 (Score_Yield)
 * 量化权利金回报的吸引力，并进行跨期限的标准化比较
 * 
 * @param {number} bidPrice - 期权的买入报价 (按照此价格卖出)
 * @param {number} stockPrice - 股票的当前市场价格
 * @param {number} dte - 期权剩余到期天数
 * @returns {Object} 收益分评分结果 { scoreYield: number, annualizedYield: number }
 */
function calculateYieldScore(bidPrice, stockPrice, dte) {
  if (bidPrice <= 0 || stockPrice <= 0 || dte <= 0) {
    return { scoreYield: 0, annualizedYield: 0 };
  }
  
  // 计算年化权利金收益率
  const annualizedYield = (bidPrice / stockPrice) * (365 / dte);
  
  // 定义收益率评分区间
  const MIN_YIELD = 0.05;  // 5%
  const MAX_YIELD = 0.25;  // 25%
  
  // 将年化收益率限定在评分区间内
  const clampedYield = Math.max(MIN_YIELD, Math.min(MAX_YIELD, annualizedYield));
  
  // 通过线性映射计算分数
  const scoreYield = ((clampedYield - MIN_YIELD) / (MAX_YIELD - MIN_YIELD)) * 100;
  
  return {
    scoreYield: Math.round(scoreYield * 10) / 10, // 保留一位小数
    annualizedYield
  };
}

/**
 * 步骤 2: 安全边际分 (Score_Safety)
 * 量化期权不被行权的概率。Delta 越低，分数越高
 * 
 * @param {number} delta - 期权的 Delta 值 (以小数表示)
 * @returns {Object} 安全边际评分结果 { scoreSafety: number }
 */
function calculateSafetyScore(delta) {
  if (delta < 0 || delta > 1) {
    return { scoreSafety: 0 };
  }
  
  // 定义 Delta 评分区间
  const MIN_DELTA = 0.10;  // 10% (最低风险，满分)
  const MAX_DELTA = 0.40;  // 40% (最高风险，0分)
  
  // 将输入的 delta 限定在评分区间内
  const clampedDelta = Math.max(MIN_DELTA, Math.min(MAX_DELTA, delta));
  
  // 通过反向线性映射计算分数
  const scoreSafety = ((MAX_DELTA - clampedDelta) / (MAX_DELTA - MIN_DELTA)) * 100;
  
  return {
    scoreSafety: Math.round(scoreSafety * 10) / 10 // 保留一位小数
  };
}

/**
 * 步骤 3: 最终 CCAS 分数计算
 * 使用几何平均数来平衡高收益和高安全性，找到最佳结合点
 * 
 * @param {number} scoreYield - 权利金收益分
 * @param {number} scoreSafety - 安全边际分
 * @returns {number} 最终 CCAS 分数 (0-100)
 */
function calculateFinalCCASScore(scoreYield, scoreSafety) {
  if (scoreYield <= 0 || scoreSafety <= 0) {
    return 0;
  }
  
  // 计算几何平均数
  const rawScore = Math.sqrt(scoreYield * scoreSafety);
  
  // 最终分数: 取整并确保不超过100
  const ccasScore = Math.round(Math.min(100, rawScore));
  
  return ccasScore;
}

/**
 * 计算完整的 CCAS 评分
 * 这是主要的评分函数，执行完整的4步评分流程
 * 
 * @param {Object} params - 输入参数
 * @param {number} params.stockPrice - 股票的当前市场价格
 * @param {number} params.strikePrice - 期权的行权价
 * @param {number} params.dte - 期权剩余到期天数
 * @param {number} params.bidPrice - 期权的买入报价
 * @param {number} params.delta - 期权的 Delta 值
 * @returns {Object} 完整的 CCAS 评分结果
 */
function calculateCCASScore(params) {
  const { stockPrice, strikePrice, dte, bidPrice, delta } = params;
  
  // 输入验证
  if (!stockPrice || !strikePrice || !dte || !bidPrice || delta === undefined) {
    return {
      ccasScore: 0,
      passed: false,
      error: "输入参数不完整",
      details: {
        stockPrice,
        strikePrice,
        dte,
        bidPrice,
        delta
      }
    };
  }
  
  // 步骤 0: 硬性门槛 - 利润缓冲前置过滤器
  const prefilterResult = profitBufferPrefilter(stockPrice, strikePrice, dte);
  
  if (!prefilterResult.passed) {
    return {
      ccasScore: 0,
      passed: false,
      reason: "未通过利润缓冲前置过滤器",
      details: {
        step: 0,
        potentialGainRatio: (prefilterResult.potentialGainRatio * 100).toFixed(2) + '%',
        requiredBuffer: (prefilterResult.requiredBuffer * 100).toFixed(2) + '%',
        stockPrice,
        strikePrice,
        dte,
        bidPrice,
        delta
      }
    };
  }
  
  // 步骤 1: 权利金收益分 (Score_Yield)
  const yieldResult = calculateYieldScore(bidPrice, stockPrice, dte);
  
  // 步骤 2: 安全边际分 (Score_Safety)
  const safetyResult = calculateSafetyScore(delta);
  
  // 步骤 3: 最终 CCAS 分数
  const ccasScore = calculateFinalCCASScore(yieldResult.scoreYield, safetyResult.scoreSafety);
  
  return {
    ccasScore,
    passed: true,
    scoreBreakdown: {
      scoreYield: yieldResult.scoreYield,
      scoreSafety: safetyResult.scoreSafety
    },
    details: {
      step: 3,
      potentialGainRatio: (prefilterResult.potentialGainRatio * 100).toFixed(2) + '%',
      requiredBuffer: (prefilterResult.requiredBuffer * 100).toFixed(2) + '%',
      annualizedYield: (yieldResult.annualizedYield * 100).toFixed(2) + '%',
      deltaValue: (delta * 100).toFixed(1) + '%',
      explanation: `权利金收益分${yieldResult.scoreYield.toFixed(1)} × 安全边际分${safetyResult.scoreSafety.toFixed(1)} = ${ccasScore}`,
      stockPrice,
      strikePrice,
      dte,
      bidPrice,
      delta
    }
  };
}

/**
 * 根据 CCAS 分数获取评分等级
 * 
 * @param {number} score - CCAS 评分 (0-100)
 * @returns {string} 评分等级
 */
function getCCASScoreGrade(score) {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'average';
  return 'poor';
}

/**
 * 根据 CCAS 分数获取评分描述
 * 
 * @param {number} score - CCAS 评分 (0-100)
 * @returns {string} 评分描述
 */
function getCCASScoreDescription(score) {
  const grade = getCCASScoreGrade(score);
  
  const descriptions = {
    excellent: '极佳备兑机会',
    good: '良好备兑机会', 
    average: '一般备兑机会',
    poor: '较差备兑机会'
  };
  
  return descriptions[grade] || '备兑机会';
}

/**
 * 批量计算多个期权的 CCAS 评分
 * 
 * @param {Array} options - 期权数组
 * @param {number} stockPrice - 股票价格
 * @returns {Array} 包含 CCAS 评分的期权数组
 */
function calculateBatchCCASScores(options, stockPrice) {
  return options.map(option => {
    const ccasResult = calculateCCASScore({
      stockPrice: stockPrice,
      strikePrice: parseFloat(option.strikePrice) || 0,
      dte: parseInt(option.daysToExpiry) || 0,
      bidPrice: parseFloat(option.bid) || 0,
      delta: parseFloat(option.delta) || 0
    });
    
    return {
      ...option,
      ccas: ccasResult
    };
  });
}

module.exports = {
  calculatePotentialGainRatio,
  calculateRequiredBuffer,
  profitBufferPrefilter,
  calculateYieldScore,
  calculateSafetyScore,
  calculateFinalCCASScore,
  calculateCCASScore,
  getCCASScoreGrade,
  getCCASScoreDescription,
  calculateBatchCCASScores
};
