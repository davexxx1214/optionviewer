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

## 核心评分算法：VVI (Volatility Value Index)

本系统的核心是一个量化评分模型，称为VVI（Volatility Value Index），用于评估期权价格的相对价值。分数越高，代表期权的隐含波动率（IV）相对其历史波动率（HV）越低，即期权可能被低估。

VVI的计算过程分为四个步骤：

### 1. 获取分段历史波动率 (Segmented HV)
系统首先会根据期权的剩余到期天数（DTE），从预设的该股票的历史基准数据中，查找对应的历史波动率（HV）。
- **超短期 (0-20天)**
- **短期 (21-60天)**
- **中期 (61-180天)**
- **长期 (>180天)**

### 2. 计算当前HV/IV比率 (R_current)
使用上一步获取的`分段HV`和期权当前的市场`隐含波动率(IV)`，计算出当前的HV/IV比率。
```math
R_{current} = \frac{currentHV}{currentIV}
```

### 3. 计算Z-Score
通过将当前的`R_current`与其历史平均值`R_avg`进行比较，并用其历史标准差`R_std_dev`进行归一化，来计算Z-Score。这可以衡量当前HV/IV比率偏离其历史正常水平的程度。
```math
Z\_Score = \frac{(R_{current} - R_{avg})}{R_{std\_dev}}
```

### 4. 计算最终VVI评分
最后，将Z-Score通过线性转换，映射到一个0-100的分数区间内。
```math
VVI = 50 + (Z\_Score \times 25)
```
最终得分会被限制在 [0, 100] 的范围内。

**完整的VVI计算公式如下：**
```math
VVI = 50 + \left( \frac{ \left( \frac{currentHV}{currentIV} \right) - R_{avg} }{ R_{std\_dev} } \right) \times 25
```
**实现位置**: `config/benchmarks.js` - `calculateVVI()`

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
        "benchmarkAnalysis": {            # 新增: 基准分析
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

当前版本: v2.0 - 历史基准版
- ✅ NVDA半年历史基准数据计算 (126个交易日)
- ✅ 按DTE区间分组的IV基准对比
- ✅ 真实历史期权数据获取和处理
- ✅ 分段HV计算系统
- ✅ 三重过滤机制
- ✅ 25只股票支持
- ✅ 现代化UI

## 当前工作状态

**✅ 已完成**:
1. NVDA历史基准数据系统完整实现
2. AlphaVantage HISTORICAL_OPTIONS API集成
3. 策略B: 逐日历史数据获取和IV基准计算
4. DTE计算修复 (历史日期vs今日日期)
5. 字段名称兼容性处理 (implied_volatility vs impliedVolatility)
6. 基准比较分析集成到期权分析流程

**🔄 当前问题**:
- ~~IV显示为0~~ ✅ 已解决 (字段名称不一致问题)
- ~~期权被标记为已过期~~ ✅ 已解决 (DTE计算错误)
- ~~基准数据未保存~~ ✅ 已解决 (saveBenchmarkData参数问题)

**📋 下一步工作**:
1. 扩展历史基准到其他热门股票 (AAPL, MSFT, TSLA等)
2. 优化API调用频率控制 (当前75次/分钟限制)
3. 前端UI增强: 基准分析结果可视化
4. 添加基准数据的时效性管理 (定期更新)
5. 实现基准数据的增量更新机制

---

**💡 AI开发者提示**: 
- NVDA基准系统在 `services/nvda-historical-benchmark.js`
- 基准数据存储在 `cache/nvda-historical-benchmarks.json`
- 期权分析集成在 `data/mock-data.js` getRealOptionsData()
- API路由基准数据加载在 `routes/api.js`
- 可直接复制NVDA模式扩展到其他股票
