const express = require('express');
const router = express.Router();
const { stocks, generateOptionData } = require('../data/mock-data');

// 获取股票列表
router.get('/stocks', (req, res) => {
  try {
    res.json({
      success: true,
      data: stocks
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
router.get('/options/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'call', days = 30 } = req.query;
    
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
        timestamp: new Date().toISOString()
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
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
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