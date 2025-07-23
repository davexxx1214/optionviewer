# 美股期权分析评分系统

一个基于Node.js的美股期权分析评分系统，集成AlphaVantage API获取实时股票数据，提供智能期权分析和评分功能。

## ✨ 功能特性

### 🔥 核心功能
- 📈 **实时股票数据** - 集成AlphaVantage API，获取真实的5分钟间隔股票价格
- 🎯 **智能下拉选择** - 18只热门美股的下拉选择，支持快速筛选
- 📊 **期权分析** - 支持Call和Put期权的深度分析
- ⏰ **多时间段** - 30天、60天、90天多个到期时间选择
- 🧠 **智能评分** - 基于多维度指标的期权推荐评分系统
- 📋 **数据可视化** - 现代化界面展示期权分析结果
- ⚡ **性能优化** - 5分钟数据缓存，提升响应速度
- 🔄 **智能备选** - API失败时自动切换到模拟数据

### 📊 评分指标
- **行权价** - 期权合约的行权价格
- **权利金** - 期权的权利金价格  
- **年化收益** - 期权的年化收益率
- **行权概率** - 期权到期时行权的概率
- **IV** - 隐含波动率
- **IVP** - 隐含波动率百分位
- **HV** - 历史波动率
- **IV/HV** - 隐含波动率与历史波动率的比率
- **财报日期** - 股票财报发布日期
- **推荐评分** - 综合评分（0-100分）

### 💡 界面特性
- 🎨 **现代化设计** - 深色主题，渐变背景
- 📱 **响应式布局** - 适配各种设备尺寸
- 🔍 **数据源指示** - 实时显示数据来源（实时/模拟）
- ⏱️ **更新提示** - 显示数据更新频率和最后更新时间
- 🎯 **视觉层次** - 清晰的信息架构和视觉引导

## 🛠 技术栈

- **后端**: Node.js 20+ + Express
- **前端**: 原生HTML/CSS/JavaScript
- **数据源**: AlphaVantage API + 智能备选机制
- **HTTP客户端**: Axios
- **环境管理**: dotenv
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
- **评分颜色** - 绿色(优秀) > 黄色(良好) > 橙色(一般) > 红色(较差)
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
└── public/             # 前端静态文件
    ├── index.html      # 主页面
    ├── css/
    │   └── style.css   # 样式文件
    └── js/
        └── app.js      # 前端应用逻辑
```

## 📈 支持的股票

系统支持以下18只热门美股的实时数据分析：

| 代码 | 公司名称 | 行业 |
|------|----------|------|
| NVDA | NVIDIA Corporation | 半导体 |
| AAPL | Apple Inc. | 科技硬件 |
| MSFT | Microsoft Corporation | 软件服务 |
| GOOGL | Alphabet Inc. | 互联网服务 |
| TSLA | Tesla Inc. | 电动汽车 |
| AMZN | Amazon.com Inc. | 电子商务 |
| META | Meta Platforms Inc. | 社交媒体 |
| AMD | Advanced Micro Devices | 半导体 |
| NFLX | Netflix Inc. | 流媒体 |
| CRM | Salesforce Inc. | 企业软件 |
| ORCL | Oracle Corporation | 数据库软件 |
| INTC | Intel Corporation | 半导体 |
| PYPL | PayPal Holdings Inc. | 金融科技 |
| ADBE | Adobe Inc. | 创意软件 |
| CSCO | Cisco Systems Inc. | 网络设备 |
| PEP | PepsiCo Inc. | 消费品 |
| CMCSA | Comcast Corporation | 电信媒体 |
| COST | Costco Wholesale Corporation | 零售 |

## 🧮 评分算法

系统采用多维度评分算法，综合考虑以下因素：

### 评分权重分配
1. **流动性评分** (30%) - 基于期权的价内/价外程度
2. **风险收益评分** (25%) - 基于年化收益率
3. **波动率评分** (25%) - 基于隐含波动率百分位
4. **时间价值评分** (20%) - 基于时间价值占权利金的比例

### 评分等级
- **90-100分**: 🟢 优秀 - 强烈推荐
- **70-89分**: 🟡 良好 - 推荐
- **50-69分**: 🟠 一般 - 谨慎考虑  
- **0-49分**: 🔴 较差 - 不推荐

## ⚙️ 配置说明

### 环境变量
- `ALPHAVANTAGE_API_KEY` - AlphaVantage API密钥（必需）
- `PORT` - 服务器端口号（默认3000）
- `API_TIMEOUT` - API请求超时时间（默认10秒）
- `CACHE_DURATION` - 数据缓存持续时间（默认5分钟）

### 缓存策略
- **股票价格**: 5分钟缓存
- **API失败备选**: 自动切换到模拟数据
- **速率限制**: 请求间隔200ms防止API限制

## ⚠️ 重要说明

### 数据来源
- ✅ **实时数据**: 通过AlphaVantage API获取真实市场数据
- 🔄 **备选数据**: API失败时自动使用模拟数据确保系统可用
- ⏰ **更新频率**: 股票价格每5分钟更新一次

### 免责声明
- 本系统仅供教育和研究目的使用
- 期权交易存在重大风险，可能导致全部投资损失
- 任何投资决策应基于专业财务建议
- 系统评分仅供参考，不构成投资建议

## 🛣️ 开发路线图

### 🔄 当前版本 (v1.0)
- ✅ AlphaVantage API集成
- ✅ 实时股票数据获取
- ✅ 智能期权分析评分
- ✅ 现代化用户界面

### 🚀 下一版本 (v1.1)
- [ ] 更多技术指标集成
- [ ] 期权链完整数据
- [ ] 历史数据图表
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