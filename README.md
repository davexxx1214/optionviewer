# 美股期权分析评分系统

一个基于Node.js的美股期权分析评分系统，集成AlphaVantage API获取实时数据，提供智能期权分析和VVI评分。

## 核心功能

- **实时数据**: AlphaVantage API集成 (股票价格 + 期权链 + 历史数据)
- **智能HV分段**: 基于期权剩余天数的分段历史波动率计算
- **三重过滤**: 流动性/价差/IV合理性过滤机制
- **VVI评分**: 基于历史基准的期权价值指数 (0-100分)
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
│   ├── hv-cache.js        # HV缓存管理
│   └── price-cache.js     # 价格缓存管理
├── config/
│   ├── benchmarks.js      # VVI历史基准 + 分段HV数据
│   └── filters.js         # 期权过滤器配置
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

### 2. VVI评分系统

**计算公式**:
```javascript
R_current = HV_current / IV_current
Z_score = (R_current - R_avg) / R_std_dev  
VVI = 50 + (Z_score × 25)  // 限制在0-100
```

**评分解释**:
- 80-100分: 🟢 极度低估
- 65-79分: 🔵 低估  
- 35-64分: 🟡 正常估值
- 20-34分: 🟠 高估
- 0-19分: 🔴 极度高估

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

**Mock数据**:
- VVI历史基准: 25只股票的R_avg, R_std_dev
- 分段HV基准: 每只股票4段HV数据
- 备选期权数据: API失败时使用

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

响应:
{
  "success": true,
  "data": {
    "stock": { 股票信息 },
    "options": [
      {
        "symbol": "AAPL",
        "daysToExpiry": 69,
        "historicalVolatility": "23.02",  // 分段HV
        "hvPeriod": 60,                   // HV计算周期
        "impliedVolatility": "29.29",
        "ivHvRatio": "1.27",
        "score": 36,                      // VVI评分
        "filterStatus": "合格期权",
        "isQualified": true
      }
    ]
  }
}
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
- 🎯 VVI评分: Mock历史基准 + 真实当前HV/IV
- 🎯 分段HV: Mock基准数据 + 基于DTE的智能选择

## 开发说明

### 添加新股票
1. 在 `data/stocks-config.js` 添加股票信息
2. 在 `config/benchmarks.js` 添加历史基准数据
3. 重启服务器

### 修改过滤器
编辑 `config/filters.js` 中的 `FILTER_CONFIG`

### 调整VVI基准
修改 `config/benchmarks.js` 中对应股票的 `R_avg`, `R_std_dev` 值

## 注意事项

- AlphaVantage免费版有API限制 (5 calls/min, 100 calls/day)
- 系统会自动降级到Mock数据
- 股票价格缓存5分钟
- 仅供教育和研究使用，不构成投资建议

## 版本信息

当前版本: v1.2
- ✅ 分段HV计算系统
- ✅ VVI评分系统  
- ✅ 三重过滤机制
- ✅ 25只股票支持
- ✅ 现代化UI

---

**💡 AI开发者提示**: 
- 核心逻辑在 `config/benchmarks.js` 和 `config/filters.js`
- Mock数据结构已完善，可直接扩展
- API失败会自动降级，系统稳定性良好
- 前端使用原生JS，易于理解和修改