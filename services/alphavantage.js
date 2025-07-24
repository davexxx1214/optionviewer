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
        // 价格范围配置（25只大市值股票）
        const priceRanges = {
            // 美股市值前20名价格范围
            'NVDA': { min: 140, max: 180 },
            'MSFT': { min: 320, max: 380 },
            'AAPL': { min: 160, max: 190 },
            'AMZN': { min: 140, max: 170 },
            'GOOGL': { min: 120, max: 150 },
            'META': { min: 280, max: 320 },
            'AVGO': { min: 1200, max: 1400 },
            'TSLA': { min: 200, max: 280 },
            'BRK-B': { min: 400, max: 450 },
            'JPM': { min: 220, max: 260 },
            'WMT': { min: 80, max: 100 },
            'LLY': { min: 700, max: 850 },
            'V': { min: 270, max: 320 },
            'ORCL': { min: 100, max: 130 },
            'MA': { min: 450, max: 520 },
            'NFLX': { min: 380, max: 450 },
            'XOM': { min: 110, max: 130 },
            'COST': { min: 650, max: 750 },
            'JNJ': { min: 150, max: 180 },
            'HD': { min: 350, max: 420 },
            // 中概股价格范围
            'BABA': { min: 80, max: 120 },
            'PDD': { min: 120, max: 160 },
            'NTES': { min: 90, max: 120 },
            'JD': { min: 35, max: 50 },
            'TME': { min: 8, max: 15 }
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
     * 获取期权数据
     * @param {string} symbol - 股票代码
     * @param {boolean} forceRefresh - 是否强制刷新缓存
     * @returns {Promise<Object>} 期权数据
     */
    async getOptionsData(symbol, forceRefresh = false) {
        const cacheKey = `options_${symbol}`;
        
        if (!forceRefresh) {
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                console.log(`从缓存获取 ${symbol} 期权数据`);
                return cachedData;
            }
        } else {
            console.log(`强制刷新 ${symbol} 期权数据`);
        }

        try {
            console.log(`从API获取 ${symbol} 期权数据`);
            const url = `${this.baseUrl}/query`;
            const params = {
                function: 'HISTORICAL_OPTIONS',
                symbol: symbol,
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

            // 检查数据格式
            if (!data.data || !Array.isArray(data.data)) {
                throw new Error(`期权数据格式不正确`);
            }

            // 处理期权数据
            const processedData = this.processOptionsData(data.data);

            // 缓存数据
            this.setCachedData(cacheKey, processedData);
            
            return processedData;

        } catch (error) {
            console.error(`获取 ${symbol} 期权数据失败:`, error.message);
            
            // 如果API失败，返回空数组，让调用方决定是否使用备选数据
            throw error;
        }
    }

    /**
     * 处理原始期权数据，转换为系统需要的格式
     * @param {Array} rawData - 原始API数据
     * @returns {Array} 处理后的期权数据
     */
    processOptionsData(rawData) {
        return rawData.map(option => {
            // 计算到期天数
            const expirationDate = new Date(option.expiration);
            const currentDate = new Date();
            const daysToExpiry = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));

            return {
                contractID: option.contractID,
                symbol: option.symbol,
                expiration: option.expiration,
                daysToExpiry: daysToExpiry,
                strikePrice: parseFloat(option.strike),
                premium: parseFloat(option.mark), // 使用mark价格作为权利金
                type: option.type, // 'call' 或 'put'
                bid: parseFloat(option.bid),
                ask: parseFloat(option.ask),
                bidSize: parseInt(option.bid_size) || 0,
                askSize: parseInt(option.ask_size) || 0,
                volume: parseInt(option.volume) || 0,
                openInterest: parseInt(option.open_interest) || 0,
                impliedVolatility: parseFloat(option.implied_volatility),
                delta: parseFloat(option.delta),
                gamma: parseFloat(option.gamma),
                theta: parseFloat(option.theta),
                vega: parseFloat(option.vega),
                rho: parseFloat(option.rho),
                lastPrice: parseFloat(option.last) || 0,
                date: option.date,
                score: null // 评分留空，后续计算
            };
        });
    }

    /**
     * 根据条件筛选期权数据
     * @param {Array} optionsData - 期权数据数组
     * @param {string} type - 期权类型 ('call' 或 'put')
     * @param {number} maxDays - 最大到期天数
     * @returns {Array} 筛选后的期权数据
     */
    filterOptionsData(optionsData, type = null, maxDays = null) {
        let filtered = [...optionsData];

        // 按期权类型筛选
        if (type) {
            filtered = filtered.filter(option => option.type.toLowerCase() === type.toLowerCase());
        }

        // 按到期天数筛选
        if (maxDays) {
            filtered = filtered.filter(option => option.daysToExpiry <= maxDays);
        }

        // 按流动性筛选（移除无报价的期权）
        filtered = filtered.filter(option => option.bid > 0 || option.ask > 0);

        return filtered;
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