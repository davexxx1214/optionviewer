# 美股备兑看涨期权分析系统 (CCAS)

一个专门针对**备兑看涨期权策略 (Covered Call)** 的评分分析系统，基于Node.js构建，集成AlphaVantage API获取实时数据，采用先进的CCAS评分算法为持有股票的投资者筛选最佳的卖出Call合约。

## 核心功能

- **🎯 专业备兑策略**: 专门针对 Covered Call 策略设计的评分系统
- **📊 CCAS评分算法**: 基于利润缓冲、权利金收益和安全边际的综合评分
- **📡 实时数据**: AlphaVantage API集成 (股票价格 + 期权链 + 历史数据)
- **🔍 智能过滤**: 三重过滤机制确保期权质量
- **📈 历史基准**: NVDA半年126个交易日历史IV基准数据
- **💰 25只股票**: 美股前20 + 5只中概股支持
- **🌙 现代化UI**: 深色主题，响应式设计

## CCAS评分系统 (Covered Call Attractiveness Score)

CCAS是本系统的核心算法，专门为备兑看涨期权策略设计。一个"最佳"的合约需要在以下三个方面取得平衡：

1. **利润缓冲 (Profit Buffer)**: 股价有足够的上涨空间而不会被立即行权
2. **权利金收益 (Premium Yield)**: 卖出期权本身能带来可观的年化现金流回报  
3. **安全边际 (Safety Margin)**: 期权被行权的概率（Delta）相对较低

### 评分流程

#### 步骤 0: 硬性门槛 - 利润缓冲前置过滤器
淘汰那些行权价离现价太近、几乎没有股价上涨空间的期权。

```javascript
潜在收益率 = (行权价 / 股价) - 1
动态缓冲要求 = 0.04 + ((DTE - 8) / (29 - 8)) * (0.12 - 0.04)

如果 潜在收益率 < 动态缓冲要求:
    CCAS评分 = 0 (直接淘汰)
```

#### 步骤 1: 权利金收益分 (0-100分)
量化权利金回报的吸引力，并进行跨期限的标准化比较。

```javascript
年化收益率 = (Bid价格 / 股价) * (365 / DTE)
最低收益率 = 5%，满分收益率 = 25%
权利金收益分 = 线性映射到 0-100分
```

#### 步骤 2: 安全边际分 (0-100分)  
量化期权不被行权的概率。Delta 越低，分数越高。

```javascript
最低风险Delta = 10% (满分)，最高风险Delta = 40% (0分)
安全边际分 = 反向线性映射到 0-100分
```

#### 步骤 3: 最终CCAS分数 (0-100分)
使用几何平均数来平衡高收益和高安全性。

```javascript
CCAS评分 = √(权利金收益分 × 安全边际分)
```

### 评分等级
- **80-100分**: 极佳备兑机会 (excellent)  
- **65-79分**: 良好备兑机会 (good)
- **45-64分**: 一般备兑机会 (average)
- **0-44分**: 较差备兑机会 (poor)

### 实际应用示例

**示例输入**:
- 股价: $175.97
- 行权价: $200.00  
- 到期天数: 22天
- Bid价格: $2.31
- Delta: 0.219

**计算过程**:
1. 潜在收益率: 13.66% > 要求缓冲9.33% ✅ 通过过滤
2. 权利金收益分: 83.9分 (年化收益率21.78%)
3. 安全边际分: 60.3分 (Delta 21.9%)
4. **最终CCAS评分: 71分** (良好备兑机会)

## 技术架构

```
后端: Node.js + Express
前端: 原生HTML/CSS/JavaScript  
数据源: AlphaVantage API
缓存: 5分钟内存缓存 + HV缓存
备选: API失败时Mock数据
核心算法: CCAS评分系统
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
│   ├── ccas-scoring.js    # 🆕 CCAS评分算法核心
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
GET /api/options/{symbol}?type=call&days={30|60|90}

响应示例 (NVDA):
{
  "success": true,
  "data": {
    "stock": { 股票信息 },
    "options": [
      {
        "symbol": "NVDA",
        "daysToExpiry": 25,
        "strikePrice": 200.0,
        "bid": 2.31,
        "delta": 0.219,
        "historicalVolatility": "27.51",
        "impliedVolatility": "32.45",
        "filterStatus": "合格期权",
        "isQualified": true,
        "ccasScoring": {                 # 🆕 CCAS评分系统
          "score": 71,                   # CCAS综合评分
          "passed": true,                # 是否通过过滤器
          "grade": "good",               # 评分等级
          "description": "良好备兑机会",  # 评分描述
          "scoreBreakdown": {
            "scoreYield": 83.9,         # 权利金收益分
            "scoreSafety": 60.3         # 安全边际分
          },
          "details": {
            "potentialGainRatio": "13.66%",    # 潜在收益率
            "requiredBuffer": "9.33%",         # 要求缓冲
            "annualizedYield": "21.78%",       # 年化收益率
            "deltaValue": "21.9%",             # Delta值
            "explanation": "权利金收益分83.9 × 安全边际分60.3 = 71"
          }
        },
        "benchmarkAnalysis": {           # NVDA专用: 基准分析
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

## 关键技术实现

### 1. 分段历史波动率 (HV)

基于期权剩余天数(DTE)的智能分段:

| 分段 | DTE范围 | HV周期 | 用途 |
|------|---------|--------|------|
| 超短期 | 0-20天 | 20天 | 短期波动反映当前市况 |
| 短期 | 21-60天 | 30天 | 平衡波动性与统计有效性 |
| 中期 | 61-180天 | 60天 | 稳定的波动率估计 |
| 长期 | >180天 | 180天 | 长期基础资产特征 |

### 2. 三重过滤机制

```javascript
// config/filters.js
liquidity: volume > 10 && openInterest > 100
bidAskSpread: (ask - bid) / ask < 0.10
ivSanity: iv > 0.15 && iv < 2.00
```

### 3. NVDA历史基准系统

- **数据计算**: 126个交易日 (半年) 真实历史期权数据
- **DTE区间分组**: ultra_short, short, medium, long
- **基准比较**: 当前IV vs 历史基准IV

## 配置文件

### CCAS评分参数配置
```javascript
// config/ccas-scoring.js
const MIN_YIELD = 0.05;  // 最低年化收益率 5%
const MAX_YIELD = 0.25;  // 满分年化收益率 25%
const MIN_DELTA = 0.10;  // 最低风险Delta 10%
const MAX_DELTA = 0.40;  // 最高风险Delta 40%
```

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

## 开发说明

### 添加新股票
1. 在 `data/stocks-config.js` 添加股票信息
2. 在 `config/benchmarks.js` 添加历史基准数据
3. 重启服务器

### 修改CCAS评分参数
编辑 `config/ccas-scoring.js` 中的评分参数

### 更新NVDA基准
通过 `/api/benchmark/nvda/update` 重新计算历史基准

### 扩展其他股票基准
参考 `services/nvda-historical-benchmark.js` 实现其他股票的历史基准计算

## 注意事项

- AlphaVantage免费版有API限制 (5 calls/min, 100 calls/day)
- 系统会自动降级到Mock数据
- 股票价格缓存5分钟
- **仅支持备兑看涨期权策略分析**
- 仅供教育和研究使用，不构成投资建议

## 版本信息

**当前版本: v4.0 - CCAS专业备兑版**

### ✅ v4.0核心功能
1. **🆕 CCAS评分系统**: 专门针对备兑看涨期权的四步评分算法
2. **🆕 利润缓冲过滤器**: 动态缓冲要求，避免行权价过近的期权
3. **🆕 权利金收益分析**: 年化收益率标准化评分 (5%-25%)
4. **🆕 安全边际评估**: 基于Delta的行权风险量化 (10%-40%)
5. **🆕 几何平均综合**: 平衡收益与安全的最终评分算法
6. **🆕 专业UI界面**: 专注于备兑策略的用户界面
7. **🆕 详细评分解释**: 完整的评分计算过程和建议

### ✅ 继承功能
- NVDA半年历史基准数据计算 (126个交易日)
- 按DTE区间分组的IV基准对比
- 真实历史期权数据获取和处理
- 分段HV计算系统
- 三重过滤机制
- 25只股票支持
- 现代化深色主题UI

### 📋 规划中功能
1. 扩展历史基准到其他热门股票 (AAPL, MSFT, TSLA等)
2. 优化API调用频率控制
3. 前端UI增强: CCAS评分可视化图表
4. 添加基准数据的时效性管理
5. 实现基准数据的增量更新机制
6. 支持自定义评分参数

---

**💡 AI开发者提示**: 
- CCAS评分系统核心在 `config/ccas-scoring.js`
- 期权过滤和数据处理在 `data/mock-data.js`
- 前端表格和CCAS显示在 `public/js/app.js` 和 `public/index.html`
- NVDA基准系统在 `services/nvda-historical-benchmark.js`
- 专门针对备兑看涨期权策略，不支持其他期权策略
- 默认按CCAS评分从高到低排序，突出最佳备兑机会