# 美股期权分析评分系统

一个基于Node.js的美股期权分析评分系统，集成AlphaVantage API获取实时股票数据，提供智能期权分析和评分功能。

## ✨ 功能特性

### 🔥 核心功能
- 📈 **实时股票数据** - 集成AlphaVantage API，获取真实的5分钟间隔股票价格
- 🎯 **智能下拉选择** - 25只热门美股的下拉选择，支持快速筛选  
- 📊 **期权分析** - 支持Call和Put期权的深度分析，集成真实期权链数据
- ⏰ **多时间段** - 30天、60天、90天多个到期时间选择
- 📉 **智能HV计算** - 分段历史波动率计算，根据期权剩余天数自动调整计算周期
- 🔍 **三重过滤机制** - 流动性、价差、IV合理性过滤，确保期权质量
- 🎯 **VVI评分系统** - 基于历史基准的期权价值指数评分（0-100分）
- 📋 **数据可视化** - 现代化界面展示期权分析结果，支持筛选状态可视化
- ⚡ **性能优化** - 5分钟数据缓存，提升响应速度
- 🔄 **智能备选** - API失败时自动切换到模拟数据

### 📊 分析指标
- **筛选状态** - 期权过滤结果（合格期权/流动性不足/价差过大/IV异常）
- **到期天数** - 期权合约距离到期的天数
- **行权价** - 期权合约的行权价格
- **权利金** - 期权的权利金价格（Mark Price）
- **类型** - Call（看涨）或Put（看跌）期权类型
- **买入报价** - 期权的买入价格（Bid Price）
- **卖出报价** - 期权的卖出价格（Ask Price）
- **当日成交** - 期权当日的成交量（流动性过滤指标）
- **未平仓** - 期权的未平仓合约数量（流动性过滤指标）
- **隐含波动率** - 市场隐含的未来波动率预期（IV合理性过滤指标）
- **历史波动率** - 基于历史价格计算的实际波动率（分段计算，真实数据）
- **IV/HV比率** - 隐含波动率与历史波动率的比值，用于判断期权估值
- **VVI评分** - 期权价值指数（0-100分），基于历史基准的客观评分

### 💡 界面特性
- 🎨 **现代化设计** - 深色主题，渐变背景
- 📱 **响应式布局** - 适配各种设备尺寸
- 🔍 **数据源指示** - 实时显示数据来源（实时/模拟）
- ⏱️ **更新提示** - 显示数据更新频率和最后更新时间
- 🎯 **视觉层次** - 清晰的信息架构和视觉引导

## 🛠 技术栈

- **后端**: Node.js 20+ + Express
- **前端**: 原生HTML/CSS/JavaScript
- **数据源**: AlphaVantage API（股票价格 + 期权链 + 历史数据）
- **HTTP客户端**: Axios
- **环境管理**: dotenv
- **数据处理**: 智能缓存 + 异步计算 + 分段HV算法
- **UI设计**: 现代化深色主题界面

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd optionviewer
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
复制并编辑 `.env` 文件：
```bash
# AlphaVantage API 配置
ALPHAVANTAGE_API_KEY=your_api_key_here

# 服务器配置
PORT=3000
NODE_ENV=development

# API 配置
API_BASE_URL=https://www.alphavantage.co
API_TIMEOUT=10000
CACHE_DURATION=300000
```

### 4. 获取AlphaVantage API密钥
1. 访问 [AlphaVantage官网](https://www.alphavantage.co/support/#api-key)
2. 免费注册账户
3. 获取API密钥
4. 将密钥添加到 `.env` 文件中

### 5. 启动服务器
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 6. 访问应用
打开浏览器访问: http://localhost:3000

## 📖 使用说明

### 基本操作流程
1. **选择股票** - 从下拉菜单中选择18只热门美股之一
2. **选择期权类型** - 选择Call（看涨）或Put（看跌）期权
3. **选择到期天数** - 选择30天、60天或90天到期
4. **分析期权** - 点击"分析期权"按钮获取分析结果

### 数据解读
- **🟢 绿色指示器** - 使用实时AlphaVantage数据
- **🟡 黄色指示器** - 使用模拟备选数据
- **筛选状态颜色**：
  - 🟢 绿色 - 合格期权（通过全部过滤器）
  - 🔴 红色 - 不合格期权（未通过过滤器）
- **VVI评分颜色**：
  - 🟢 绿色 (80-100分) - 极度/低估
  - 🔵 蓝色 (65-79分) - 低估
  - 🟡 黄色 (35-64分) - 正常估值
  - 🟠 橙色 (20-34分) - 高估
  - 🔴 红色 (0-19分) - 极度高估
- **数据更新** - 每5分钟自动更新股票价格

### 高级功能
- **排序功能** - 点击表头对任意列进行排序
- **数据提示** - 鼠标悬停查看最后更新时间
- **智能缓存** - 5分钟内重复请求使用缓存数据

## 🔧 API接口

### 获取股票列表
```http
GET /api/stocks

响应示例:
{
  "success": true,
  "data": [...],
  "dataSource": "real-time",
  "lastUpdated": "2025-07-23T16:01:06.805Z",
  "updateInterval": "5分钟"
}
```

### 获取期权数据
```http
GET /api/options/{股票代码}?type={期权类型}&days={到期天数}

参数:
- 股票代码: NVDA, AAPL, MSFT 等
- type: call 或 put
- days: 30, 60, 90

响应示例:
{
  "success": true,
  "data": {
    "stock": {...},
    "options": [...],
    "dataSource": "real-time",
    "lastUpdated": "2025-07-23T16:01:06.805Z"
  }
}
```

## 📁 项目结构

```
optionviewer/
├── .env                  # 环境变量配置
├── .gitignore           # Git忽略文件
├── package.json         # 项目配置和依赖
├── package-lock.json    # 依赖锁定文件
├── server.js            # Express服务器入口
├── routes/
│   └── api.js          # API路由定义
├── services/
│   └── alphavantage.js # AlphaVantage API服务
├── data/
│   ├── stocks-config.js # 股票列表配置
│   └── mock-data.js    # 数据获取逻辑
├── config/
│   ├── filters.js      # 期权过滤器配置和逻辑
│   └── benchmarks.js   # VVI历史基准数据（Mock数据）
└── public/             # 前端静态文件
    ├── index.html      # 主页面
    ├── css/
    │   └── style.css   # 样式文件
    └── js/
        └── app.js      # 前端应用逻辑
```

## 📈 支持的股票

系统支持以下25只热门股票的实时数据分析（美股市值前20 + 5只热门中概股）：

### 🇺🇸 美股市值前20名
| 代码 | 公司名称 | 行业 |
|------|----------|------|
| NVDA | NVIDIA Corporation | 半导体 |
| MSFT | Microsoft Corporation | 软件服务 |
| AAPL | Apple Inc. | 科技硬件 |
| AMZN | Amazon.com Inc. | 电子商务 |
| GOOGL | Alphabet Inc. | 互联网服务 |
| META | Meta Platforms Inc. | 社交媒体 |
| AVGO | Broadcom Inc. | 半导体 |
| TSLA | Tesla Inc. | 电动汽车 |
| BRK-B | Berkshire Hathaway Inc. | 多元化金融 |
| JPM | JPMorgan Chase & Co. | 银行 |
| WMT | Walmart Inc. | 消费零售 |
| LLY | Eli Lilly and Company | 制药生物 |
| V | Visa Inc. | 多元化金融 |
| ORCL | Oracle Corporation | 软件服务 |
| MA | Mastercard Incorporated | 多元化金融 |
| NFLX | Netflix Inc. | 流媒体 |
| XOM | Exxon Mobil Corporation | 能源 |
| COST | Costco Wholesale Corporation | 消费零售 |
| JNJ | Johnson & Johnson | 制药生物 |
| HD | The Home Depot Inc. | 零售 |

### 🇨🇳 热门中概股
| 代码 | 公司名称 | 行业 |
|------|----------|------|
| BABA | Alibaba Group Holding Limited | 电子商务 |
| PDD | PDD Holdings Inc. | 电子商务 |
| NTES | NetEase Inc. | 互联网服务 |
| JD | JD.com Inc. | 电子商务 |
| TME | Tencent Music Entertainment Group | 音乐娱乐 |

## 📉 历史波动率计算

系统采用智能分段方法计算历史波动率（HV），根据期权剩余天数自动选择最适合的计算周期：

### 🎯 分段计算逻辑

| 分段名称 | 期权剩余天数（DTE） | HV计算周期（交易日） | 说明 |
|----------|-------------------|-------------------|------|
| **超短期** | 0 - 20天 | 20天 | 短期价格波动更能反映当前市场状况 |
| **短期** | 21 - 60天 | 30天 | 平衡短期波动与统计有效性 |
| **中期** | 61 - 180天 | 60天 | 更长周期提供更稳定的波动率估计 |
| **长期/LEAPS** | > 180天 | 180天 | 长期历史数据反映基础资产长期特征 |

### 📊 计算方法
- **数据源**: 使用AlphaVantage API的`TIME_SERIES_DAILY_ADJUSTED`接口
- **价格数据**: 基于调整后的收盘价（Adjusted Close）计算
- **计算公式**: 日对数收益率的标准差 × √252（年化处理）
- **数据质量**: 要求至少80%的有效交易日数据
- **缓存策略**: 历史价格数据缓存，提高计算效率

### 🎨 可视化指示
- **HV值显示**: 以百分比形式显示（如：26.06%）
- **计算周期**: 鼠标悬停显示计算天数（如："基于30天计算"）
- **IV/HV比率颜色编码**:
  - 🟢 **绿色** (<80%): 期权可能被低估
  - 🟡 **黄色** (80%-150%): 正常估值范围
  - 🔴 **红色** (>150%): 期权可能被高估

### ⚙️ 技术实现
- **异步计算**: 按期权组并行计算HV，提高性能
- **错误处理**: API失败时使用基于股票类型的默认HV值
- **内存优化**: 合理的数据缓存策略，避免重复计算

## 🔍 期权过滤机制

系统采用三重过滤机制，确保只对高质量期权进行评分：

### 过滤器配置（真实数据过滤）
1. **流动性过滤** - 确保期权具备足够的交易活跃度
   - 当日成交量 > 10（可配置）
   - 未平仓合约数 > 100（可配置）

2. **价差过滤** - 控制交易成本
   - 相对价差 = (卖出报价 - 买入报价) / 卖出报价
   - 相对价差 < 10%（可配置）

3. **IV合理性过滤** - 排除异常估值期权
   - 隐含波动率 > 15%（可配置）
   - 隐含波动率 < 200%（可配置）

### 筛选结果可视化
- 🟢 **合格期权** - 通过全部三重过滤
- 🔴 **不合格期权** - 未通过一项或多项过滤器
- 📊 **状态标识** - 具体显示失败原因（流动性不足/价差过大/IV异常）

## 🎯 VVI评分系统

基于历史基准的期权价值指数（Volatility Value Index）评分系统：

### 第一部分：历史基准数据（Mock数据）
为每只股票配置历史HV/IV比率分析结果：
- **R_avg（历史均值）** - 该股票HV/IV比率的历史平均值
- **R_std_dev（历史标准差）** - 比率的历史波动范围
- **分类配置**：
  - 科技股：NVDA (0.75±0.12)、TSLA (0.70±0.15) 等
  - 蓝筹股：AAPL (0.85±0.08)、MSFT (0.87±0.07) 等
  - 中概股：BABA (0.65±0.18)、PDD (0.60±0.20) 等

### 第二部分：实时VVI计算（真实数据）
基于当前市场数据进行客观评分：

1. **计算当前比率**
   ```
   R_current = HV_current / IV_current
   ```

2. **标准化得分**
   ```
   Z-Score = (R_current - R_avg) / R_std_dev
   ```

3. **VVI评分转换**
   ```
   VVI = 50 + (Z-Score × 25)
   范围限制：0-100分
   ```

### VVI评分解释
- **80-100分**: 🟢 极度低估 - 期权价格相对便宜
- **65-79分**: 🔵 低估 - 期权具有价值优势
- **35-64分**: 🟡 正常估值 - 期权定价合理
- **20-34分**: 🟠 高估 - 期权价格偏高
- **0-19分**: 🔴 极度高估 - 期权价格过高

### 评分详情（鼠标悬停查看）
- 当前HV/IV比率
- Z-Score标准化得分
- 该股票的历史基准值
- 估值解释说明

## ⚙️ 配置说明

### 环境变量
- `ALPHAVANTAGE_API_KEY` - AlphaVantage API密钥（必需）
- `PORT` - 服务器端口号（默认3000）
- `API_TIMEOUT` - API请求超时时间（默认10秒）
- `CACHE_DURATION` - 数据缓存持续时间（默认5分钟）

### 期权过滤器配置
- `MIN_DAILY_VOLUME` - 最小日成交量阈值（默认10）
- `MIN_OPEN_INTEREST` - 最小未平仓阈值（默认100）
- `MAX_BID_ASK_SPREAD_PERCENT` - 最大相对价差百分比（默认10%）
- `MIN_IMPLIED_VOLATILITY_PERCENT` - 最小隐含波动率（默认15%）
- `MAX_IMPLIED_VOLATILITY_PERCENT` - 最大隐含波动率（默认200%）

### 缓存策略
- **股票价格**: 5分钟缓存
- **API失败备选**: 自动切换到模拟数据
- **速率限制**: 请求间隔200ms防止API限制

## ⚠️ 重要说明

### 数据来源
- ✅ **实时数据**：
  - 股票价格：AlphaVantage API（真实市场数据）
  - 期权链数据：AlphaVantage API（真实期权数据）
  - 历史价格：AlphaVantage API（用于HV计算）
  - 过滤器配置：环境变量配置（可自定义阈值）
- 📊 **Mock数据**：
  - VVI历史基准：25只股票的历史HV/IV比率基准值
  - 备选数据：API失败时的模拟期权数据
- 🔄 **混合数据**：
  - VVI评分：基于Mock历史基准 + 真实当前HV/IV数据计算
- ⏰ **更新频率**: 股票价格每5分钟更新一次

### 免责声明
- 本系统仅供教育和研究目的使用
- 期权交易存在重大风险，可能导致全部投资损失
- 任何投资决策应基于专业财务建议
- 系统评分仅供参考，不构成投资建议

## 🛣️ 开发路线图

### 🔄 当前版本 (v1.2)
- ✅ AlphaVantage API集成
- ✅ 实时股票数据获取
- ✅ 真实期权链数据集成
- ✅ 智能HV分段计算系统
- ✅ IV/HV比率分析
- ✅ 三重期权过滤机制（流动性/价差/IV合理性）
- ✅ VVI评分系统（基于历史基准的客观评分）
- ✅ 期权筛选状态可视化
- ✅ 25只热门股票支持（美股前20+中概股5只）
- ✅ 现代化用户界面

### 🚀 下一版本 (v1.3)
- [ ] 真实历史基准数据替换Mock数据
- [ ] 历史VVI评分趋势分析
- [ ] 更多希腊字母指标分析
- [ ] 历史数据图表可视化
- [ ] 期权策略推荐
- [ ] 移动端优化

### 🎯 未来计划 (v2.0+)
- [ ] 期权策略推荐引擎
- [ ] 投资组合分析
- [ ] 风险管理工具
- [ ] 用户账户系统
- [ ] 实时价格推送
- [ ] 更多市场数据源

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

### 开发环境搭建
1. Fork项目
2. 创建特性分支: `git checkout -b feature/AmazingFeature`
3. 提交更改: `git commit -m 'Add some AmazingFeature'`
4. 推送分支: `git push origin feature/AmazingFeature`
5. 开启Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关链接

- [AlphaVantage API文档](https://www.alphavantage.co/documentation/)
- [Node.js官网](https://nodejs.org/)
- [Express.js官网](https://expressjs.com/)

---

**💡 提示**: 记得给项目加星⭐如果你觉得有用！