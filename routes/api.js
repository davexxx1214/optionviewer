const express = require('express');
const router = express.Router();
const { getStocks, getOptionsData, generateOptionData, refreshStockCache } = require('../data/mock-data');
const { stocksList } = require('../data/stocks-config');
const { getFilterConfig } = require('../config/filters');

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
    
    res.json({
      success: true,
      data: stocks,
      dataSource: stocks[0]?.isRealTime ? 'real-time' : 'fallback',
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
    const { type = 'call', days = 30, refresh = false } = req.query;
    
    // 如果需要刷新，先强制获取该股票的最新价格
    if (refresh === 'true') {
      console.log(`强制刷新 ${symbol} 的股票价格`);
      const refreshedData = await require('../services/alphavantage').refreshStockPrice(symbol);
      // 使用获取到的数据更新mock-data的缓存，避免重复API调用
      await refreshStockCache(symbol, refreshedData);
    }
    
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
        lastUpdated: stock.lastUpdated,
        filterConfig: getFilterConfig() // 添加过滤配置信息
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

module.exports = router; 