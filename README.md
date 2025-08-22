# 美股期权分析评分系统

一个基于Node.js的美股期权分析评分系统，集成AlphaVantage API获取实时数据，提供基于历史基准的智能期权分析。

## 核心功能

- **实时数据**: AlphaVantage API集成 (股票价格 + 期权链 + 历史数据)
- **NVDA历史基准**: 半年126个交易日历史IV基准数据，按DTE区间分组
- **智能HV分段**: 基于期权剩余天数的分段历史波动率计算
- **三重过滤**: 流动性/价差/IV合理性过滤机制
- **基准比较**: 当前IV与历史基准IV的比较分析
- **25只股票**: 美股前20 + 5只中概股支持
- **现代化UI**: 深色主题，响应式设计

## 技术架构

```
后端: Node.js + Express
前端: 原生HTML/CSS/JavaScript  
数据源: AlphaVantage API
缓存: 5分钟内存缓存
备选: API失败时Mock数据
```

## 项目结构

```
optionviewer/
├── server.js              # Express服务器入口
├── routes/api.js          # API路由
├── services/
│   ├── alphavantage.js    # AlphaVantage API服务
│   ├── nvda-historical-benchmark.js  # NVDA历史基准数据计算
│   ├── hv-cache.js        # HV缓存管理
│   └── price-cache.js     # 价格缓存管理
├── config/
│   ├── benchmarks.js      # 分段HV数据 + 传统基准
│   └── filters.js         # 期权过滤器配置
├── cache/
│   ├── nvda-historical-benchmarks.json  # NVDA半年历史基准
│   └── nvda-raw-historical-data.json    # NVDA原始历史数据
├── data/
│   ├── stocks-config.js   # 支持的股票列表
│   └── mock-data.js       # Mock数据生成逻辑
└── public/                # 前端静态文件
```

## 关键技术实现

### 1. 分段历史波动率 (HV)

**基于期权剩余天数(DTE)的智能分段**:

| 分段 | DTE范围 | HV周期 | 用途 |
|------|---------|--------|------|
| 超短期 | 0-20天 | 20天 | 短期波动反映当前市况 |
| 短期 | 21-60天 | 30天 | 平衡波动性与统计有效性 |
| 中期 | 61-180天 | 60天 | 稳定的波动率估计 |
| 长期 | >180天 | 180天 | 长期基础资产特征 |

**实现位置**: `config/benchmarks.js` - `getSegmentedHV(symbol, daysToExpiry)`

### 2. NVDA历史基准系统

**数据计算**:
```javascript
// 策略B: 逐日历史期权数据获取
历史期间: 126个交易日 (半年)
数据来源: AlphaVantage HISTORICAL_OPTIONS API
区间划分: 按DTE分为4个区间
基准计算: 每个区间的平均IV值
```

**DTE区间分组**:
| 区间 | DTE范围 | 用途 |
|------|---------|------|
| ultra_short | 0-20天 | 短期期权基准 |
| short | 21-60天 | 标准月度期权 |
| medium | 61-180天 | 季度期权 |
| long | >180天 | LEAPS长期期权 |

**基准比较**:
```javascript
ratio = currentIV / benchmarkIV
if (ratio > 1.2) → "高于历史基准20%+"
if (ratio < 0.8) → "低于历史基准20%+"
else → "正常范围"
```

### 3. 三重过滤机制

```javascript
// config/filters.js
liquidity: volume > 10 && openInterest > 100
bidAskSpread: (ask - bid) / ask < 0.10
ivSanity: iv > 0.15 && iv < 2.00
```

### 4. 数据源管理

**实时数据**:
- 股票价格: `TIME_SERIES_INTRADAY` (5分钟)
- 期权链: `ANALYTICS_FIXED_WINDOW` 
- 历史数据: `TIME_SERIES_DAILY_ADJUSTED`

**历史基准数据**:
- NVDA: 126个交易日真实历史IV基准 (按DTE区间)
- 其他股票: Mock基准数据 (待扩展)
- 分段HV基准: 每只股票4段HV数据
- 备选期权数据: API失败时使用

## 核心评分算法：CAS (Composite Attractiveness Score)

本系统采用全新的CAS（综合吸引力评分）算法，融合波动率价值和投机潜力两个核心要素，为买入看涨期权和卖出看涨期权提供智能评分。

CAS系统寻找交易的"甜蜜点"：既要价格便宜（低隐含波动率），又要具备良好的投机性（高杠杆和合理的成功概率）。

### 评分构成

#### 1. 波动率价值分 (Score_Vol) [0-100]
评估期权权利金相对于其历史正常水平是"贵"还是"便宜"。

**计算方法**：
- 计算波动率比率: `Ratio_Vol = IV / HV`
- 将比率限制在 [0.7, 2.0] 范围内避免极端值
- 线性映射到评分: `Score_Vol = (2.0 - clampedRatio) / (2.0 - 0.7) × 100`

当IV远低于HV时（期权"打折出售"），波动率价值分接近100，对买方有利。

#### 2. 投机潜力分 (Score_Spec) [0-100]  
评估期权的"性价比"，即用给定的成本能撬动多大的潜在收益。

**计算方法**：
- 计算Delta性价比指数: `Index_Spec = delta / premium`
- 在同一到期日期权中标准化: `Score_Spec = (当前Index_Spec / 最大Index_Spec) × 100`

这个分数内部融合了杠杆率和行权概率(Delta)，用小钱买到高Delta的期权得分更高。

#### 3. 综合评分计算

**买入看涨期权评分**：
```math
Score(Buy Call) = \sqrt{Score\_Vol \times Score\_Spec}
```
使用几何平均数惩罚在任何一个维度上表现极差的选项，寻找更均衡的优选。

**卖出看涨期权评分**：
```math
Score(Sell Call) = 100 - Score(Buy Call)
```
根据对称性原则，买方的好机会就是卖方的差机会。

### 评分等级
- **80-100分**: 极佳机会 (excellent)
- **65-79分**: 良好机会 (good)  
- **45-64分**: 一般机会 (average)
- **0-44分**: 较差机会 (poor)

**实现位置**: `config/cas-scoring.js` - 完整的CAS评分系统

### 旧版VVI系统 (向后兼容)
系统仍保留原有的VVI（Volatility Value Index）评分算法用于向后兼容，但推荐使用新的CAS系统。

## 快速开始

### 1. 环境配置
```bash
npm install
cp .env.example .env
# 编辑 .env，添加 ALPHAVANTAGE_API_KEY
```

### 2. 启动服务
```bash
npm start  # 生产模式
npm run dev  # 开发模式
```

### 3. 访问应用
```
http://localhost:3000
```

## API接口

### 获取期权数据
```http
GET /api/options/{symbol}?type={call|put}&days={30|60|90}

响应 (NVDA示例):
{
  "success": true,
  "data": {
    "stock": { 股票信息 },
    "options": [
      {
        "symbol": "NVDA",
        "daysToExpiry": 25,
        "historicalVolatility": "27.51",  # 分段HV
        "hvPeriod": 30,                   # HV计算周期
        "impliedVolatility": "32.45",
        "ivHvRatio": "1.18",
        "filterStatus": "合格期权",
        "isQualified": true,
        "casScoring": {                   # 新增: CAS评分系统
          "buyCall": {
            "score": 77,                  # 买入看涨期权综合评分
            "scoreVol": 59,              # 波动率价值分
            "scoreSpec": 100,            # 投机潜力分
            "grade": "good",             # 评分等级
            "description": "良好买入机会",
            "details": {
              "ivHvRatio": "1.18",
              "deltaPerPremium": "0.0255",
              "explanation": "波动率分59 × 投机分100 = 77"
            }
          },
          "sellCall": {
            "score": 23,                 # 卖出看涨期权综合评分
            "scoreVol": 41,             # 反向波动率价值分
            "scoreSpec": 0,             # 反向投机潜力分
            "grade": "poor",            # 评分等级
            "description": "较差卖出机会",
            "details": {
              "explanation": "卖出评分 = 100 - 买入评分(77) = 23"
            }
          }
        },
        "benchmarkAnalysis": {            # NVDA专用: 基准分析
          "category": "short",
          "currentIV": "32.45%",
          "benchmarkIV": "71.45%", 
          "ratio": "0.45",
          "comparison": "low",
          "sampleCount": 2086
        }
      }
    ]
  }
}
```

### NVDA基准数据管理
```http
GET /api/benchmark/nvda/update     # 更新NVDA基准数据 (SSE)
GET /api/benchmark/nvda/data       # 获取NVDA基准数据
GET /api/benchmark/nvda/status     # 获取基准状态
```

## 支持的股票

**美股前20**: NVDA, MSFT, AAPL, AMZN, GOOGL, META, AVGO, TSLA, BRK-B, JPM, WMT, LLY, V, ORCL, MA, NFLX, XOM, COST, JNJ, HD

**中概股5只**: BABA, PDD, NTES, JD, TME

## 配置文件

### 期权过滤器配置
```javascript
// config/filters.js
const FILTER_CONFIG = {
  MIN_DAILY_VOLUME: 10,
  MIN_OPEN_INTEREST: 100,
  MAX_BID_ASK_SPREAD_PERCENT: 10,
  MIN_IMPLIED_VOLATILITY_PERCENT: 15,
  MAX_IMPLIED_VOLATILITY_PERCENT: 200
};
```

### VVI历史基准配置
```javascript
// config/benchmarks.js
const HISTORICAL_BENCHMARKS = {
  'AAPL': { 
    R_avg: 0.85, R_std_dev: 0.08,
    HV_segments: {
      ultra_short: 27.5, short: 25.8,
      medium: 24.2, long: 22.8
    }
  },
  // ... 其他24只股票
};
```

## 数据说明

### 真实数据
- ✅ 股票价格 (AlphaVantage)
- ✅ 期权链数据 (AlphaVantage)  
- ✅ 历史价格 (AlphaVantage)
- ✅ 过滤器配置 (可配置)

### Mock数据
- 📊 VVI历史基准 (25只股票的R_avg, R_std_dev)
- 📊 分段HV基准 (每股票4段HV数据)
- 🔄 备选期权数据 (API失败时)

### 混合计算
- 🎯 NVDA基准分析: 真实历史IV基准 + 当前IV比较
- 🎯 分段HV: Mock基准数据 + 基于DTE的智能选择
- 🎯 其他股票: 传统Mock基准 + 当前HV/IV

## 开发说明

### 添加新股票
1. 在 `data/stocks-config.js` 添加股票信息
2. 在 `config/benchmarks.js` 添加历史基准数据
3. 重启服务器

### 修改过滤器
编辑 `config/filters.js` 中的 `FILTER_CONFIG`

### 更新NVDA基准
通过 `/api/benchmark/nvda/update` 重新计算历史基准

### 扩展其他股票基准
参考 `services/nvda-historical-benchmark.js` 实现其他股票的历史基准计算

## 注意事项

- AlphaVantage免费版有API限制 (5 calls/min, 100 calls/day)
- 系统会自动降级到Mock数据
- 股票价格缓存5分钟
- 仅供教育和研究使用，不构成投资建议

## 版本信息

当前版本: v3.0 - CAS综合评分版
- ✅ CAS综合吸引力评分系统 (买入/卖出看涨期权)
- ✅ 波动率价值分 + 投机潜力分融合算法  
- ✅ 前端双评分列显示 (买入评分/卖出评分)
- ✅ NVDA半年历史基准数据计算 (126个交易日)
- ✅ 按DTE区间分组的IV基准对比
- ✅ 真实历史期权数据获取和处理
- ✅ 分段HV计算系统
- ✅ 三重过滤机制
- ✅ 25只股票支持
- ✅ 现代化UI
- ✅ 向后兼容VVI评分系统

## 当前工作状态

**✅ v3.0新增功能**:
1. CAS综合吸引力评分算法完整实现
2. 波动率价值分计算 (IV/HV比率评估)
3. 投机潜力分计算 (Delta性价比评估)
4. 买入/卖出看涨期权对称性评分
5. 前端表格新增双评分列显示
6. 智能评分等级和评价描述
7. 详细评分工具提示和计算解释

**✅ 历史功能保持稳定**:
1. NVDA历史基准数据系统完整实现
2. AlphaVantage HISTORICAL_OPTIONS API集成
3. 策略B: 逐日历史数据获取和IV基准计算
4. DTE计算修复 (历史日期vs今日日期)
5. 字段名称兼容性处理 (implied_volatility vs impliedVolatility)
6. 基准比较分析集成到期权分析流程

**📋 下一步工作**:
1. 扩展CAS评分到看跌期权
2. 扩展历史基准到其他热门股票 (AAPL, MSFT, TSLA等)
3. 优化API调用频率控制 (当前75次/分钟限制)
4. 前端UI增强: CAS评分可视化图表
5. 添加基准数据的时效性管理 (定期更新)
6. 实现基准数据的增量更新机制

---

**💡 AI开发者提示**: 
- CAS评分系统在 `config/cas-scoring.js`
- 期权过滤和评分在 `config/filters.js`
- 期权数据处理在 `data/mock-data.js` (真实和模拟数据)
- 前端表格和评分显示在 `public/js/app.js` 和 `public/index.html`
- NVDA基准系统在 `services/nvda-historical-benchmark.js`
- 基准数据存储在 `cache/nvda-historical-benchmarks.json`
- API路由在 `routes/api.js`
- 支持买入/卖出看涨期权评分，暂不支持看跌期权
