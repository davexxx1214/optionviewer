const express = require('express');
const router = express.Router();
const { getStocks, getOptionsData, generateOptionData, refreshStockCache } = require('../data/mock-data');
const { stocksList } = require('../data/stocks-config');
const alphaVantageService = require('../services/alphavantage');
const HistoricalBenchmarkService = require('../services/historical-benchmark');
// NVDA专用历史基准服务
const nvdaHistoricalBenchmarkService = require('../services/nvda-historical-benchmark');

// 获取基础股票列表（快速响应，不包含价格）
router.get('/stocks/list', (req, res) => {
  try {
    res.json({
      success: true,
      data: stocksList,
      dataSource: 'config',
      message: '基础股票列表加载完成'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取股票列表失败',
      error: error.message
    });
  }
});

// 获取股票列表（包含实时价格）
router.get('/stocks', async (req, res) => {
  try {
    const stocks = await getStocks();
    
    // 判断数据源类型
    let dataSource = 'fallback';
    if (stocks.length > 0) {
      const firstStock = stocks[0];
      console.log('判断数据源 - firstStock.fromCache:', firstStock.fromCache);
      console.log('判断数据源 - firstStock.cachedAt:', firstStock.cachedAt);
      console.log('判断数据源 - firstStock.isRealTime:', firstStock.isRealTime);
      
      if (firstStock.fromCache && firstStock.cachedAt) {
        // 从天级缓存获取的数据
        dataSource = 'cached';
        console.log('数据源设置为: cached');
      } else if (firstStock.isRealTime) {
        // 直接从API获取的实时数据
        dataSource = 'real-time';
        console.log('数据源设置为: real-time');
      } else {
        console.log('数据源保持为: fallback');
      }
      // 否则保持 'fallback'（模拟数据）
    }

    res.json({
      success: true,
      data: stocks,
      dataSource: dataSource,
      lastUpdated: stocks[0]?.lastUpdated || new Date().toISOString(),
      updateInterval: '5分钟'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取股票列表失败',
      error: error.message
    });
  }
});

// 获取期权数据
router.get('/options/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'call', days = 30 } = req.query;
    
    // 每次分析期权都强制获取该股票的最新价格（确保实时性）
    console.log(`获取 ${symbol} 的最新股票价格用于期权分析`);
    const refreshedData = await alphaVantageService.refreshStockPrice(symbol);
    // 使用获取到的数据更新mock-data的缓存，避免重复API调用
    await refreshStockCache(symbol, refreshedData);
    
    // 获取最新的股票数据
    const stocks = await getStocks();
    
    // 查找股票
    const stock = stocks.find(s => s.symbol.toLowerCase() === symbol.toLowerCase());
    if (!stock) {
      return res.status(404).json({
        success: false,
        message: '未找到指定股票'
      });
    }
    
    // 如果是NVDA，加载并附加基准数据
    let benchmarkData = null;
    if (symbol.toUpperCase() === 'NVDA') {
      try {
        benchmarkData = await nvdaHistoricalBenchmarkService.loadBenchmarkData();
        console.log('成功加载NVDA历史基准数据用于分析');
      } catch (error) {
        console.log('加载NVDA历史基准数据失败，分析时将不使用基准:', error.message);
      }
    }

    // 获取期权数据（优先使用真实数据）
    const optionsData = await getOptionsData(
      stock.symbol, 
      stock.price, 
      type.toLowerCase(), 
      parseInt(days),
      benchmarkData // 传递基准数据
    );
    
    // 判断数据源
    const dataSource = optionsData.length > 0 && optionsData[0].dataSource === 'real-time' ? 'real-time' : 'fallback';
    
    res.json({
      success: true,
      data: {
        stock: stock,
        options: optionsData,
        timestamp: new Date().toISOString(),
        dataSource: dataSource,
        lastUpdated: stock.lastUpdated
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取期权数据失败',
      error: error.message
    });
  }
});

// 股票搜索
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const stocks = await getStocks();
    
    if (!q) {
      return res.json({
        success: true,
        data: stocks.slice(0, 10)
      });
    }
    
    const searchTerm = q.toLowerCase();
    const filteredStocks = stocks.filter(stock => 
      stock.symbol.toLowerCase().includes(searchTerm) ||
      stock.name.toLowerCase().includes(searchTerm)
    );
    
    res.json({
      success: true,
      data: filteredStocks.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '搜索失败',
      error: error.message
    });
  }
});

// 获取HV缓存统计信息
router.get('/cache/hv/stats', async (req, res) => {
  try {
    const stats = await alphaVantageService.getHVCacheStats();
    
    res.json({
      success: true,
      data: stats,
      message: 'HV缓存统计信息获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取HV缓存统计信息失败',
      error: error.message
    });
  }
});

// 清除HV缓存
router.delete('/cache/hv', async (req, res) => {
  try {
    await alphaVantageService.clearHVCache();
    
    res.json({
      success: true,
      message: 'HV缓存已清除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清除HV缓存失败',
      error: error.message
    });
  }
});

// 获取所有缓存的HV数据（调试用）
router.get('/cache/hv/data', async (req, res) => {
  try {
    const cachedData = await alphaVantageService.getAllCachedHVData();
    
    res.json({
      success: true,
      data: cachedData,
      message: '缓存数据获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取缓存数据失败',
      error: error.message
    });
  }
});

// 缓存统计信息（调试用）
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await alphaVantageService.getAllCacheStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取缓存统计失败',
      error: error.message
    });
  }
});

// 清除价格缓存（调试用）
router.post('/cache/clear/price', async (req, res) => {
  try {
    await alphaVantageService.clearAllPriceCache();
    res.json({
      success: true,
      message: '价格缓存已清除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清除价格缓存失败',
      error: error.message
    });
  }
});

// 清除HV缓存（调试用）
router.post('/cache/clear/hv', async (req, res) => {
  try {
    await alphaVantageService.clearHVCache();
    res.json({
      success: true,
      message: 'HV缓存已清除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清除HV缓存失败',
      error: error.message
    });
  }
});

// 历史基准数据相关API
const historicalBenchmarkService = new HistoricalBenchmarkService();

// 获取历史基准数据状态
router.get('/benchmark/status', async (req, res) => {
  try {
    const status = await historicalBenchmarkService.getBenchmarkStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取基准数据状态失败',
      error: error.message
    });
  }
});

// 更新历史基准数据（完整更新）
router.get('/benchmark/update', async (req, res) => {
  try {
    console.log('开始更新历史基准数据...');
    
    // 使用服务器发送事件(SSE)来实时传输进度
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 发送初始状态
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: '开始更新历史基准数据...',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // 进度回调函数
    const progressCallback = (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        ...progress,
        timestamp: new Date().toISOString()
      })}\n\n`);
    };

    // 执行更新
    const result = await historicalBenchmarkService.updateAllBenchmarks(progressCallback);

    // 发送完成状态
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      result,
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('更新历史基准数据失败:', error);
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.end();
  }
});

// 获取已保存的历史基准数据
router.get('/benchmark/data', async (req, res) => {
  try {
    const data = await historicalBenchmarkService.loadBenchmarksFromFile();
    
    if (!data) {
      return res.json({
        success: false,
        message: '尚未生成历史基准数据',
        data: null
      });
    }

    res.json({
      success: true,
      data,
      message: `已加载 ${Object.keys(data).length} 只股票的基准数据`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取基准数据失败',
      error: error.message
    });
  }
});

// 更新单个股票的基准数据
router.post('/benchmark/update/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    console.log(`开始更新 ${symbol} 的基准数据...`);
    
    const result = await historicalBenchmarkService.calculateStockBenchmarks(symbol);
    
    // 加载现有数据并更新
    let allData = await historicalBenchmarkService.loadBenchmarksFromFile() || {};
    allData[symbol] = result;
    
    // 保存更新后的数据
    await historicalBenchmarkService.saveBenchmarksToFile(allData);
    
    res.json({
      success: true,
      data: result,
      message: `${symbol} 基准数据更新完成`
    });

  } catch (error) {
    console.error(`更新 ${req.params.symbol} 基准数据失败:`, error);
    res.status(500).json({
      success: false,
      message: `更新 ${req.params.symbol} 基准数据失败`,
      error: error.message
    });
  }
});

// === NVDA专用历史基准数据API ===

// 获取NVDA基准状态
router.get('/benchmark/nvda/status', async (req, res) => {
  try {
    const status = await nvdaHistoricalBenchmarkService.getBenchmarkStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取NVDA基准状态失败',
      error: error.message
    });
  }
});

// 更新NVDA历史基准数据
router.get('/benchmark/nvda/update', async (req, res) => {
  try {
    console.log('开始更新 NVDA 历史基准数据...');
    
    // 使用服务器发送事件(SSE)来实时传输进度
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 发送初始状态
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: '开始计算 NVDA 半年历史基准数据...',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // 进度回调函数
    const progressCallback = (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        ...progress,
        timestamp: new Date().toISOString()
      })}\n\n`);
    };

    try {
      // 执行NVDA基准计算
      const result = await nvdaHistoricalBenchmarkService.calculateNVDABenchmarks(progressCallback);
      
      // 发送完成状态
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        message: 'NVDA 历史基准数据更新完成',
        result: result,
        timestamp: new Date().toISOString()
      })}\n\n`);
      
    } catch (error) {
      console.error('NVDA基准计算失败:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'NVDA基准计算失败',
        error: error.message,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }

    res.end();

  } catch (error) {
    console.error('启动NVDA基准更新失败:', error);
    res.status(500).json({
      success: false,
      message: '启动NVDA基准更新失败',
      error: error.message
    });
  }
});

// 获取NVDA历史基准数据
router.get('/benchmark/nvda/data', async (req, res) => {
  try {
    const nvdaHistoricalBenchmarkService = require('../services/nvda-historical-benchmark');
    
    // 尝试读取NVDA基准数据
    const benchmarkData = await nvdaHistoricalBenchmarkService.loadBenchmarkData();
    
    if (benchmarkData) {
      res.json({
        success: true,
        data: benchmarkData
      });
    } else {
      res.json({
        success: false,
        message: '没有找到NVDA基准数据，请先更新基准数据'
      });
    }
  } catch (error) {
    console.error('获取NVDA基准数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取NVDA基准数据失败',
      error: error.message
    });
  }
});

module.exports = router; 