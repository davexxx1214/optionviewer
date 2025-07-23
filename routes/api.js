const express = require('express');
const router = express.Router();
const { getStocks, generateOptionData, refreshStockCache } = require('../data/mock-data');

// 获取股票列表
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
      await require('../services/alphavantage').refreshStockPrice(symbol);
      // 同时更新mock-data的缓存
      await refreshStockCache(symbol);
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
    
    // 生成期权数据
    const optionsData = generateOptionData(
      stock.symbol, 
      stock.price, 
      type.toLowerCase(), 
      parseInt(days)
    );
    
    res.json({
      success: true,
      data: {
        stock: stock,
        options: optionsData,
        timestamp: new Date().toISOString(),
        dataSource: stock.isRealTime ? 'real-time' : 'fallback',
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

module.exports = router; 