const express = require('express');
const router = express.Router();
const { getStocks, getOptionsData, generateOptionData, refreshStockCache } = require('../data/mock-data');
const { stocksList } = require('../data/stocks-config');
const alphaVantageService = require('../services/alphavantage');

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
    
    // 获取期权数据（优先使用真实数据）
    const optionsData = await getOptionsData(
      stock.symbol, 
      stock.price, 
      type.toLowerCase(), 
      parseInt(days)
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

module.exports = router; 