# Covered Call期权策略回测系统

基于SQLite数据库的备兑看涨期权策略回测系统，专注于验证CCAS期权评分系统的有效性。

## 系统特点

### 🎯 损益归因分离
- **股票持有部门**: 负责持有100股股票作为期权担保
- **期权交易部门**: 根据CCAS评分选择和交易期权合约
- **独立核算**: 分离计算两个部门的损益，专注评估期权策略效果

### 📊 CCAS评分集成
- 集成现有JavaScript CCAS评分系统
- 自动选择最高评分的期权合约
- 基于真实历史数据进行回测验证

### 🗄️ 数据库驱动
- 使用SQLite数据库存储的历史数据
- 完全离线运行，无需API调用
- 支持AAPL、NVDA、TSLA等多只股票

## 核心文件

```
backtest/
├── database_interface.py     # SQLite数据库接口
├── database_backtest.py      # 基于数据库的回测引擎
├── option_pnl_attribution.py # 期权损益归因分离计算
├── option_scoring_interface.py # 期权评分系统接口
└── README.md                 # 本文档
```

## 快速开始

### 1. 环境要求

```bash
pip install pandas numpy sqlite3
```

### 2. 运行回测

```bash
cd backtest

# 检查数据库状态和连接
python database_interface.py

# 运行完整的Covered Call回测
python database_backtest.py
```

#### 自定义回测参数

```python
# 在Python中自定义运行
from database_backtest import DatabaseBacktestEngine

engine = DatabaseBacktestEngine()
result = engine.run_covered_call_backtest(
    symbol='NVDA',           # 股票代码
    start_date='2025-09-01', # 开始日期
    end_date='2025-10-15',   # 结束日期
    initial_virtual_cash=10000, # 期权部门初始资金
    min_dte=15,              # 最小到期天数
    max_dte=45               # 最大到期天数
)

print(f"年化收益率: {result['annualized_return']['annualized_return_percent']:.2f}%")
```

## 核心概念

### 损益归因分离法 (P&L Attribution)

1. **虚拟股票部门**: 
   - 假设持有100股标的股票
   - 不计算股票买卖成本和价值波动
   - 仅用作期权合约的担保

2. **期权交易部门**:
   - 初始虚拟现金: $10,000
   - 收入: 卖出期权收到的权利金
   - 成本: 期权被行权时的内在价值损失
   - 最终收益率 = 期权部门损益 / 股票名义价值

### 策略执行流程

1. **初始化**: 设置基准日期和回测期间
2. **期权选择**: 使用CCAS评分系统选择最优期权
3. **卖出期权**: 收取权利金，记录为期权部门收入
4. **到期处理**:
   - 如果股价 ≤ 行权价: 期权虚值到期，保留全部权利金
   - 如果股价 > 行权价: 期权被行权，扣除内在价值成本
5. **滚动策略**: 重新选择新期权，直到策略期结束
6. **性能评估**: 计算年化收益率和交易统计

## 主要类说明

### DatabaseInterface
- 连接SQLite数据库 (`data/alphavantage_data.db`)
- 获取历史股票价格数据
- 获取历史期权数据
- 数据验证和统计功能

### DatabaseBacktestEngine  
- 执行Covered Call策略回测
- 集成CCAS评分系统
- 处理期权到期和滚动
- 生成详细回测报告

### OptionPnLAttribution
- 期权交易记录管理
- 损益归因分离计算
- 年化收益率计算

## 示例输出

### 数据库状态检查
```bash
$ python database_interface.py

🔍 测试数据库接口...
✅ 连接到数据库: D:\workspace\optionviewer\data\alphavantage_data.db

📊 数据库统计:
股票数据:
  AAPL: 1520条记录
  NVDA: 1520条记录
  TSLA: 1520条记录
期权数据:
  AAPL: 1552790条记录
  NVDA: 3853158条记录
  TSLA: 2877281条记录

🧪 测试NVDA数据:
股价 (2025-10-15): $179.83
期权数据: 202个call期权

✅ 回测数据验证:
数据充足: True
可用交易日: 13
```

### 完整回测结果
```bash
$ python database_backtest.py

🔬 基于数据库的Covered Call策略回测
============================================================
📊 检查数据库状态...
   股票 NVDA: 1520条记录
   期权 NVDA: 3853158条记录

🚀 开始回测 NVDA (2025-09-01 到 2025-10-15)...

============================================================
📊 回测结果
============================================================

基本信息:
股票代码: NVDA
回测期间: 2025-09-01 到 2025-10-15
初始股价: $174.18

📈 性能表现:
期权总损益: $334.00
年化收益率: 15.91%
期权交易次数: 2
被行权次数: 0
虚值到期次数: 2
被行权率: 0.0%

🎯 策略评估:
✅ 策略表现优秀! CCAS评分系统显示出优秀的期权选择能力。

💾 数据来源: SQLite数据库 (无API调用)
✅ 回测完成!
```

## 配置参数

### 策略参数
- `symbol`: 股票代码（支持: NVDA, AAPL, TSLA）
- `start_date/end_date`: 回测时间范围
- `initial_virtual_cash`: 期权部门初始资金（默认: $10,000）
- `min_dte/max_dte`: 期权到期天数范围（默认: 15-45天）

### CCAS评分参数
- 利润缓冲要求: 动态缓冲，避免行权价过近
- 权利金收益率范围: 5%-25%年化收益率
- 安全边际Delta范围: 10%-40%

## 数据要求

系统需要SQLite数据库包含以下表：

1. **historical_stock_prices**: 历史股票价格
   - symbol, date, open, high, low, close, volume

2. **historical_options_data**: 历史期权数据
   - symbol, data_date, expiration_date, strike_price, option_type
   - bid, ask, volume, open_interest, implied_volatility
   - delta, gamma, theta, vega, days_to_expiry

## 注意事项

1. **数据依赖**: 需要通过Node.js服务预先获取历史数据
2. **简化假设**: 未考虑交易成本、滑点、流动性等实际因素
3. **历史回测**: 基于历史数据，不保证未来表现
4. **仅供研究**: 系统用于评估算法有效性，不构成投资建议

## 版本信息

**v2.0 - 数据库驱动版**
- 基于SQLite数据库的完整回测系统
- 支持真实历史期权数据
- CCAS评分系统集成
- 损益归因分离计算
- 详细的回测报告和分析