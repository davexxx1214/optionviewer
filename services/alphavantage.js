const axios = require('axios');
require('dotenv').config();

class AlphaVantageService {
    constructor() {
        this.apiKey = process.env.ALPHAVANTAGE_API_KEY || 'demo';
        this.baseUrl = process.env.API_BASE_URL || 'https://www.alphavantage.co';
        this.timeout = parseInt(process.env.API_TIMEOUT) || 10000;
        this.cache = new Map();
        this.cacheDuration = parseInt(process.env.CACHE_DURATION) || 300000; // 5分钟缓存
    }

    /**
     * 获取股票的实时价格数据
     * @param {string} symbol - 股票代码
     * @param {boolean} forceRefresh - 是否强制刷新缓存
     * @returns {Promise<Object>} 股票价格数据
     */
    async getStockPrice(symbol, forceRefresh = false) {
        const cacheKey = `price_${symbol}`;
        
        if (!forceRefresh) {
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                console.log(`从缓存获取 ${symbol} 价格数据`);
                return cachedData;
            }
        } else {
            console.log(`强制刷新 ${symbol} 价格数据`);
        }

        try {
            console.log(`从API获取 ${symbol} 价格数据`);
            const url = `${this.baseUrl}/query`;
            const params = {
                function: 'TIME_SERIES_INTRADAY',
                symbol: symbol,
                interval: '5min',
                outputsize: 'compact',
                datatype: 'json',
                apikey: this.apiKey
            };

            const response = await axios.get(url, {
                params,
                timeout: this.timeout
            });

            const data = response.data;

            // 检查是否有错误
            if (data['Error Message']) {
                throw new Error(`AlphaVantage API错误: ${data['Error Message']}`);
            }

            if (data['Note']) {
                throw new Error(`AlphaVantage API限制: ${data['Note']}`);
            }

            // 提取最新价格
            const timeSeries = data['Time Series (5min)'];
            if (!timeSeries) {
                throw new Error(`未找到 ${symbol} 的时间序列数据`);
            }

            // 获取最新的时间戳和价格数据
            const timestamps = Object.keys(timeSeries).sort().reverse();
            const latestTimestamp = timestamps[0];
            const latestData = timeSeries[latestTimestamp];

            const priceData = {
                symbol: symbol,
                price: parseFloat(latestData['4. close']),
                open: parseFloat(latestData['1. open']),
                high: parseFloat(latestData['2. high']),
                low: parseFloat(latestData['3. low']),
                volume: parseInt(latestData['5. volume']),
                timestamp: latestTimestamp,
                lastUpdated: new Date().toISOString()
            };

            // 缓存数据
            this.setCachedData(cacheKey, priceData);
            
            return priceData;

        } catch (error) {
            console.error(`获取 ${symbol} 价格失败:`, error.message);
            
            // 如果API失败，返回模拟数据作为备选
            return this.getFallbackPrice(symbol);
        }
    }

    /**
     * 批量获取多个股票的价格数据
     * @param {Array<string>} symbols - 股票代码数组
     * @returns {Promise<Array>} 股票价格数据数组
     */
    async getBatchStockPrices(symbols) {
        const results = [];
        
        // 为了避免API速率限制，我们串行请求，每个请求之间间隔200ms
        for (const symbol of symbols) {
            try {
                const priceData = await this.getStockPrice(symbol);
                results.push(priceData);
                
                // 添加延迟以避免API速率限制
                if (symbols.indexOf(symbol) < symbols.length - 1) {
                    await this.delay(200);
                }
            } catch (error) {
                console.error(`获取 ${symbol} 失败:`, error.message);
                // 如果某个股票失败，使用备选数据
                results.push(this.getFallbackPrice(symbol));
            }
        }
        
        return results;
    }

    /**
     * 强制刷新特定股票的价格数据
     * @param {string} symbol - 股票代码
     * @returns {Promise<Object>} 更新后的股票价格数据
     */
    async refreshStockPrice(symbol) {
        try {
            // 清除该股票的缓存
            const cacheKey = `price_${symbol}`;
            this.cache.delete(cacheKey);
            
            // 强制获取最新数据
            const latestPriceData = await this.getStockPrice(symbol, true);
            
            return latestPriceData;
        } catch (error) {
            console.error(`强制刷新 ${symbol} 失败:`, error.message);
            return this.getFallbackPrice(symbol);
        }
    }

    /**
     * 获取备选价格数据（当API失败时使用）
     * @param {string} symbol 
     * @returns {Object}
     */
    getFallbackPrice(symbol) {
        // 价格范围配置（与原来的mock数据保持一致）
        const priceRanges = {
            'NVDA': { min: 140, max: 180 },
            'AAPL': { min: 160, max: 190 },
            'MSFT': { min: 320, max: 380 },
            'GOOGL': { min: 120, max: 150 },
            'TSLA': { min: 200, max: 280 },
            'AMZN': { min: 140, max: 170 },
            'META': { min: 280, max: 320 },
            'AMD': { min: 120, max: 160 },
            'NFLX': { min: 380, max: 450 },
            'CRM': { min: 200, max: 250 },
            'ORCL': { min: 100, max: 130 },
            'INTC': { min: 20, max: 35 },
            'PYPL': { min: 50, max: 80 },
            'ADBE': { min: 450, max: 550 },
            'CSCO': { min: 45, max: 55 },
            'PEP': { min: 160, max: 180 },
            'CMCSA': { min: 35, max: 45 },
            'COST': { min: 650, max: 750 }
        };

        const range = priceRanges[symbol] || { min: 50, max: 200 };
        const price = Math.random() * (range.max - range.min) + range.min;
        
        return {
            symbol: symbol,
            price: Math.round(price * 100) / 100,
            open: Math.round((price * 0.99) * 100) / 100,
            high: Math.round((price * 1.02) * 100) / 100,
            low: Math.round((price * 0.98) * 100) / 100,
            volume: Math.floor(Math.random() * 1000000) + 100000,
            timestamp: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            fallback: true // 标记这是备选数据
        };
    }

    /**
     * 缓存数据
     * @param {string} key 
     * @param {Object} data 
     */
    setCachedData(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    /**
     * 获取缓存数据
     * @param {string} key 
     * @returns {Object|null}
     */
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const isExpired = Date.now() - cached.timestamp > this.cacheDuration;
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    /**
     * 延迟函数
     * @param {number} ms 
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
        console.log('缓存已清除');
    }
}

module.exports = new AlphaVantageService(); 