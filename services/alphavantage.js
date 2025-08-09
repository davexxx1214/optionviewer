const axios = require('axios');
const hvCacheManager = require('./hv-cache');
const priceCacheManager = require('./price-cache');
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
        // 优先检查天级缓存
        if (!forceRefresh) {
            const dailyCachedData = await priceCacheManager.getCachedPrice(symbol);
            if (dailyCachedData) {
                return dailyCachedData;
            }
            
            // 如果天级缓存没有，检查内存缓存（5分钟缓存）
            const cacheKey = `price_${symbol}`;
            const memoryCachedData = this.getCachedData(cacheKey);
            if (memoryCachedData) {
                console.log(`从内存缓存获取 ${symbol} 价格数据`);
                return memoryCachedData;
            }
        } else {
            console.log(`强制刷新 ${symbol} 价格数据`);
        }

        try {
            console.log(`从API获取 ${symbol} 价格数据`);
            const cacheKey = `price_${symbol}`;
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
            const timestamps = Object.keys(timeSeries).sort((a, b) => b.localeCompare(a));
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

            // 缓存数据到内存（5分钟缓存）
            this.setCachedData(cacheKey, priceData);
            
            // 缓存数据到天级缓存
            await priceCacheManager.setCachedPrice(symbol, priceData);
            
            return priceData;

        } catch (error) {
            console.error(`获取 ${symbol} 价格失败:`, error.message);
            
            // 如果API失败，返回模拟数据作为备选
            return this.getFallbackPrice(symbol);
        }
    }

    /**
     * 批量获取多个股票的价格数据（智能缓存版本）
     * @param {Array<string>} symbols - 股票代码数组
     * @returns {Promise<Array>} 股票价格数据数组
     */
    async getBatchStockPrices(symbols) {
        console.log(`开始批量获取 ${symbols.length} 只股票的价格数据...`);
        
        // 检查哪些股票已有缓存，哪些需要从API获取
        const cacheStatus = await priceCacheManager.checkStockCacheStatus(symbols);
        
        console.log(`缓存状态检查完成: 已缓存 ${cacheStatus.cached.length} 只，需要获取 ${cacheStatus.needFetch.length} 只`);
        
        const results = [];
        const newPriceData = [];
        
        // 1. 先获取已缓存的数据
        for (const symbol of cacheStatus.cached) {
            try {
                const cachedData = await priceCacheManager.getCachedPrice(symbol);
                results.push(cachedData);
            } catch (error) {
                console.error(`从缓存获取 ${symbol} 失败:`, error.message);
                // 如果缓存读取失败，加入需要获取的列表
                cacheStatus.needFetch.push(symbol);
            }
        }
        
        // 2. 再获取需要从API获取的数据
        if (cacheStatus.needFetch.length > 0) {
            console.log(`需要从API获取 ${cacheStatus.needFetch.length} 只股票数据: ${cacheStatus.needFetch.join(', ')}`);
            
            for (const symbol of cacheStatus.needFetch) {
                try {
                    const priceData = await this.getStockPrice(symbol);
                    results.push(priceData);
                    newPriceData.push(priceData);
                    
                    // 添加延迟以避免API速率限制
                    if (cacheStatus.needFetch.indexOf(symbol) < cacheStatus.needFetch.length - 1) {
                        await this.delay(200);
                    }
                } catch (error) {
                    console.error(`获取 ${symbol} 失败:`, error.message);
                    // 如果某个股票失败，使用备选数据
                    const fallbackData = this.getFallbackPrice(symbol);
                    results.push(fallbackData);
                    newPriceData.push(fallbackData);
                }
            }
            
            // 3. 批量缓存新获取的数据
            if (newPriceData.length > 0) {
                await priceCacheManager.setBatchCachedPrices(newPriceData);
            }
        }
        
        // 4. 按原始顺序排序结果
        const sortedResults = symbols.map(symbol => 
            results.find(result => result.symbol === symbol)
        ).filter(Boolean);
        
        console.log(`批量获取完成: 总计 ${sortedResults.length} 只股票，其中 ${cacheStatus.cached.length} 只来自缓存，${cacheStatus.needFetch.length} 只来自API`);
        
        return sortedResults;
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
    async getOptionsData(symbol, forceRefresh = false, date = null) {
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
            if (date) {
                console.log(`从API获取 ${symbol} ${date} 历史期权数据`);
            } else {
                console.log(`从API获取 ${symbol} 最近交易日期权数据`);
            }
            
            const url = `${this.baseUrl}/query`;
            const params = {
                function: 'HISTORICAL_OPTIONS',
                symbol: symbol,
                datatype: 'json',
                apikey: this.apiKey
            };
            
            // 如果指定了日期，添加 date 参数
            // 如果没有指定日期，HISTORICAL_OPTIONS会返回最近交易日的数据
            if (date) {
                params.date = date;
            }

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

            // 检查数据格式 - AlphaVantage HISTORICAL_OPTIONS API 返回的格式
            console.log(`${symbol} API响应数据结构:`, Object.keys(data));
            
            // AlphaVantage HISTORICAL_OPTIONS API 返回的数据结构是按日期组织的
            if (!data || typeof data !== 'object') {
                throw new Error(`期权数据格式不正确`);
            }

            // 解析期权数据
            const optionsArray = this.parseHistoricalOptionsData(data, symbol);
            
            if (optionsArray.length === 0) {
                throw new Error(`未找到 ${symbol} 的期权数据`);
            }

            // 处理期权数据（包含HV计算）
            const processedData = await this.processOptionsData(optionsArray, symbol);

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
     * 解析HISTORICAL_OPTIONS API返回的数据
     * @param {Object} data - API返回的原始数据
     * @param {string} symbol - 股票代码
     * @returns {Array} 期权数组
     */
    parseHistoricalOptionsData(data, symbol) {
        const optionsArray = [];
        
        try {
            // 检查是否为demo API key的信息响应
            if (data.Information && data.Information.includes('demo')) {
                console.log(`${symbol} 检测到demo API key，无法获取真实期权数据`);
                return [];
            }
            
            // 检查 HISTORICAL_OPTIONS API 数据格式
            // 有日期时的格式：{ "endpoint": "Historical Options", "message": "success", "data": [...] }
            // 无日期时的格式（最近交易日）：{ "data": [...] }
            let optionsDataArray = [];
            
            if (data.endpoint === "Historical Options" && data.data && Array.isArray(data.data)) {
                console.log(`${symbol} 使用 HISTORICAL_OPTIONS 数据格式`);
                optionsDataArray = data.data;
            } else if (data.data && Array.isArray(data.data)) {
                console.log(`${symbol} 使用 HISTORICAL_OPTIONS 最近交易日数据格式`);
                optionsDataArray = data.data;
            } else {
                console.log(`${symbol} 数据格式不匹配，尝试检查其他格式...`);
                console.log(`${symbol} API响应数据结构:`, Object.keys(data));
                return [];
            }
            
            if (optionsDataArray.length > 0) {
                
                // 调试：打印前几个期权的原始数据
                console.log(`${symbol} 原始期权数据示例（前3个）:`);
                for (let i = 0; i < Math.min(3, optionsDataArray.length); i++) {
                    const option = optionsDataArray[i];
                    console.log(`期权 ${i + 1}:`, {
                        contractID: option.contractID,
                        implied_volatility: option.implied_volatility,
                        implied_volatility_type: typeof option.implied_volatility,
                        strike: option.strike,
                        expiration: option.expiration,
                        type: option.type
                    });
                }
                
                optionsDataArray.forEach(option => {
                    // 确保必需字段存在
                    if (option.contractID && option.expiration && option.strike && option.type) {
                        // 详细的IV解析调试
                        const rawIV = option.implied_volatility;
                        const parsedFloat = parseFloat(rawIV);
                        const finalIV = parsedFloat || 0;
                        
                        // 调试：对前几个期权记录IV解析过程
                        if (optionsArray.length < 5) {
                            console.log(`解析期权 ${optionsArray.length + 1}:`);
                            console.log(`  - 原始IV值: "${rawIV}" (类型: ${typeof rawIV})`);
                            console.log(`  - parseFloat结果: ${parsedFloat} (类型: ${typeof parsedFloat})`);
                            console.log(`  - 最终IV值: ${finalIV} (类型: ${typeof finalIV})`);
                            console.log(`  - isNaN(parsedFloat): ${isNaN(parsedFloat)}`);
                        }
                        
                        optionsArray.push({
                            contractID: option.contractID,
                            symbol: option.symbol || symbol,
                            expiration: option.expiration,
                            strike: parseFloat(option.strike),
                            type: option.type.toLowerCase(), // 标准化为小写
                            last_price: parseFloat(option.last) || 0,
                            mark: parseFloat(option.mark) || 0,
                            bid: parseFloat(option.bid) || 0,
                            ask: parseFloat(option.ask) || 0,
                            volume: parseInt(option.volume) || 0,
                            open_interest: parseInt(option.open_interest) || 0,
                            implied_volatility: finalIV,
                            delta: parseFloat(option.delta) || 0,
                            gamma: parseFloat(option.gamma) || 0,
                            theta: parseFloat(option.theta) || 0,
                            vega: parseFloat(option.vega) || 0,
                            rho: parseFloat(option.rho) || 0,
                            date: option.date
                        });
                    }
                });
                
                console.log(`${symbol} 解析出 ${optionsArray.length} 个期权合约`);
                return optionsArray;
            }
            
            // 回退到旧的按日期分组的格式（如果新格式不可用）
            console.log(`${symbol} 尝试解析按日期分组的期权数据格式`);
            
            // 遍历所有日期的期权数据
            Object.keys(data).forEach(date => {
                // 跳过元数据字段
                if (date.includes('Information') || date.includes('Symbol') || date.includes('Last Refreshed') ||
                    date === 'endpoint' || date === 'message' || date === 'data') {
                    return;
                }
                
                const dayOptions = data[date];
                
                // 检查这一天是否有期权数据
                if (Array.isArray(dayOptions)) {
                    dayOptions.forEach(option => {
                        // 确保必需字段存在
                        if (option.contractID && option.expiration && option.strike && option.type) {
                            optionsArray.push({
                                contractID: option.contractID,
                                symbol: option.symbol || symbol,
                                expiration: option.expiration,
                                strike: parseFloat(option.strike),
                                type: option.type.toLowerCase(), // 标准化为小写
                                last_price: parseFloat(option.last) || 0,
                                mark: parseFloat(option.mark) || 0,
                                bid: parseFloat(option.bid) || 0,
                                ask: parseFloat(option.ask) || 0,
                                volume: parseInt(option.volume) || 0,
                                open_interest: parseInt(option.open_interest) || 0,
                                implied_volatility: parseFloat(option.implied_volatility) || 0,
                                delta: parseFloat(option.delta) || 0,
                                gamma: parseFloat(option.gamma) || 0,
                                theta: parseFloat(option.theta) || 0,
                                vega: parseFloat(option.vega) || 0,
                                rho: parseFloat(option.rho) || 0,
                                date: date
                            });
                        }
                    });
                }
            });
            
            console.log(`${symbol} 解析出 ${optionsArray.length} 个期权合约`);
            return optionsArray;
            
        } catch (error) {
            console.error(`解析 ${symbol} 期权数据失败:`, error.message);
            return [];
        }
    }

    /**
     * 处理原始期权数据，转换为系统需要的格式（包含HV计算）
     * @param {Array} rawData - 原始API数据
     * @param {string} symbol - 股票代码
     * @returns {Promise<Array>} 处理后的期权数据
     */
    async processOptionsData(rawData, symbol) {
        // 按到期天数分组，为每组计算一次HV
        const expiryGroups = {};
        const processedOptions = [];

        // 第一步：按到期天数分组，同时过滤已过期期权
        rawData.forEach(option => {
            const expirationDate = new Date(option.expiration);
            const currentDate = new Date();
            const daysToExpiry = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));
            
            // 注意：后台基准数据更新时不过滤任何期权，前台显示时才过滤
            // 这里保留过期期权的调试信息，但不跳过处理
            if (daysToExpiry <= 0) {
                // console.log(`过期期权: ${option.contractID || option.symbol} 到期日: ${option.expiration} (到期天数: ${daysToExpiry})`);
                // 不再跳过，继续处理
            }
            
            const hvPeriod = this.getHVCalculationPeriod(daysToExpiry);
            
            if (!expiryGroups[hvPeriod]) {
                expiryGroups[hvPeriod] = {
                    period: hvPeriod,
                    hv: null,
                    options: []
                };
            }
            
            expiryGroups[hvPeriod].options.push({
                ...option,
                daysToExpiry: daysToExpiry
            });
        });

        // 第二步：为每个组计算HV
        const hvPromises = Object.keys(expiryGroups).map(async (period) => {
            const group = expiryGroups[period];
            try {
                const hv = await this.calculateHistoricalVolatility(symbol, parseInt(period));
                group.hv = hv;
                console.log(`${symbol} ${period}天期权组HV: ${hv.toFixed(2)}%`);
            } catch (error) {
                console.error(`计算${symbol} ${period}天HV失败:`, error.message);
                group.hv = this.getDefaultHV(symbol);
            }
        });

        // 等待所有HV计算完成
        await Promise.all(hvPromises);

        // 第三步：处理每个期权并添加HV数据
        Object.values(expiryGroups).forEach(group => {
            group.options.forEach(option => {
                const processedOption = {
                    contractID: option.contractID,
                    symbol: option.symbol,
                    expiration: option.expiration,
                    daysToExpiry: option.daysToExpiry,
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
                    historicalVolatility: group.hv, // 添加计算的HV
                    hvPeriod: group.period, // HV计算周期
                    delta: parseFloat(option.delta),
                    gamma: parseFloat(option.gamma),
                    theta: parseFloat(option.theta),
                    vega: parseFloat(option.vega),
                    rho: parseFloat(option.rho),
                    lastPrice: parseFloat(option.last) || 0,
                    date: option.date,
                    score: null // 评分留空，后续计算
                };
                
                processedOptions.push(processedOption);
            });
        });

        return processedOptions;
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

        // 🔥 重要修复：首先过滤掉已过期的期权（daysToExpiry <= 0）
        filtered = filtered.filter(option => {
            const daysToExpiry = option.daysToExpiry;
            if (daysToExpiry <= 0) {
                console.log(`过滤已过期期权: ${option.contractID || option.symbol} (到期天数: ${daysToExpiry})`);
                return false;
            }
            return true;
        });

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
     * 获取股票的历史价格数据（用于计算HV）
     * @param {string} symbol - 股票代码
     * @param {number} days - 需要获取的天数
     * @returns {Promise<Array>} 历史价格数据
     */
    async getHistoricalPrices(symbol, days) {
        const cacheKey = `historical_${symbol}_${days}`;
        
        // 检查缓存
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log(`从缓存获取 ${symbol} 历史价格数据`);
            return cachedData;
        }

        try {
            console.log(`从API获取 ${symbol} 历史价格数据`);
            const url = `${this.baseUrl}/query`;
            // 当所需天数超过100天时，使用 full 以确保有足够历史数据
            const outputsize = (days + 1 > 100) ? 'full' : 'compact';
            const params = {
                function: 'TIME_SERIES_DAILY_ADJUSTED',
                symbol: symbol,
                outputsize: outputsize,
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

            // 提取历史价格数据
            const timeSeries = data['Time Series (Daily)'];
            if (!timeSeries) {
                throw new Error(`未找到 ${symbol} 的历史价格数据`);
            }

            // 转换为数组格式，按日期排序（最新在前）
            const prices = Object.keys(timeSeries)
                .sort((a, b) => new Date(b) - new Date(a))
                .slice(0, days + 10) // 多获取一些数据，确保有足够的交易日
                .map(date => ({
                    date: date,
                    adjustedClose: parseFloat(timeSeries[date]['5. adjusted close']),
                    close: parseFloat(timeSeries[date]['4. close']),
                    open: parseFloat(timeSeries[date]['1. open']),
                    high: parseFloat(timeSeries[date]['2. high']),
                    low: parseFloat(timeSeries[date]['3. low']),
                    volume: parseInt(timeSeries[date]['6. volume'])
                }));

            // 缓存历史价格数据（只在内存中缓存，不持久化）
            this.setCachedData(cacheKey, prices);
            
            return prices;

        } catch (error) {
            console.error(`获取 ${symbol} 历史价格失败:`, error.message);
            throw error;
        }
    }

    /**
     * 计算历史波动率 (Historical Volatility)
     * @param {string} symbol - 股票代码
     * @param {number} days - 计算周期（交易日）
     * @returns {Promise<number>} 历史波动率（百分比）
     */
    async calculateHistoricalVolatility(symbol, days) {
        try {
            // 首先检查今天是否已有缓存
            const cachedHV = await hvCacheManager.getCachedHV(symbol, days);
            if (cachedHV !== null) {
                return cachedHV;
            }

            console.log(`计算 ${symbol} ${days}天HV（无缓存，需要API调用）`);

            // 获取历史价格数据
            const prices = await this.getHistoricalPrices(symbol, days);
            
            if (prices.length < days + 1) {
                throw new Error(`历史数据不足，需要 ${days + 1} 天，实际获得 ${prices.length} 天`);
            }

            // 计算日收益率的对数
            const returns = [];
            for (let i = 0; i < days; i++) {
                const currentPrice = prices[i].adjustedClose;
                const previousPrice = prices[i + 1].adjustedClose;
                
                if (previousPrice > 0 && currentPrice > 0) {
                    const logReturn = Math.log(currentPrice / previousPrice);
                    returns.push(logReturn);
                }
            }

            if (returns.length < days * 0.8) { // 至少要有80%的有效数据
                throw new Error(`有效数据不足，计算HV需要至少 ${Math.ceil(days * 0.8)} 个有效收益率`);
            }

            // 计算收益率的标准差
            const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
            const dailyVolatility = Math.sqrt(variance);

            // 年化波动率（252个交易日）
            const annualizedVolatility = dailyVolatility * Math.sqrt(252);

            // 转换为百分比
            const hvPercent = annualizedVolatility * 100;

            console.log(`${symbol} ${days}天HV: ${hvPercent.toFixed(2)}%`);
            
            // 将计算结果缓存到今天的缓存中
            await hvCacheManager.setCachedHV(symbol, days, hvPercent);
            
            return hvPercent;

        } catch (error) {
            console.error(`计算 ${symbol} HV失败:`, error.message);
            // 返回一个合理的默认值
            return this.getDefaultHV(symbol);
        }
    }

    /**
     * 根据期权剩余天数确定HV计算周期
     * @param {number} daysToExpiry - 期权剩余天数
     * @returns {number} HV计算周期（交易日）
     */
    getHVCalculationPeriod(daysToExpiry) {
        if (daysToExpiry <= 20) {
            return 20; // 超短期
        } else if (daysToExpiry <= 60) {
            return 30; // 短期
        } else if (daysToExpiry <= 180) {
            return 60; // 中期
        } else {
            return 180; // 长期
        }
    }

    /**
     * 获取默认HV值（当计算失败时）
     * @param {string} symbol - 股票代码
     * @returns {number} 默认HV值
     */
    getDefaultHV(symbol) {
        // 根据股票类型返回合理的默认HV值
        const defaultHVRanges = {
            // 科技股通常波动率较高
            'NVDA': 45, 'TSLA': 50, 'META': 35, 'NFLX': 40,
            // 大盘股相对稳定
            'AAPL': 25, 'MSFT': 25, 'GOOGL': 30, 'AMZN': 35,
            // 金融股
            'JPM': 20, 'V': 18, 'MA': 18, 'BRK-B': 15,
            // 消费品
            'WMT': 15, 'COST': 18, 'HD': 20,
            // 能源
            'XOM': 25,
            // 医药
            'JNJ': 12, 'LLY': 22,
            // 半导体
            'AVGO': 30,
            // 中概股
            'BABA': 40, 'PDD': 45, 'JD': 35, 'NTES': 30, 'TME': 35
        };
        
        return defaultHVRanges[symbol] || 25; // 默认25%
    }

    /**
     * 清除内存价格缓存（保留天级缓存和HV缓存）
     */
    clearMemoryCache() {
        this.cache.clear();
        console.log('内存价格缓存已清除');
    }

    /**
     * 清除天级价格缓存
     */
    async clearDailyPriceCache() {
        await priceCacheManager.clearCache();
        console.log('天级价格缓存已清除');
    }

    /**
     * 清除所有价格缓存（内存 + 天级）
     */
    async clearAllPriceCache() {
        this.cache.clear();
        await priceCacheManager.clearCache();
        console.log('所有价格缓存已清除');
    }

    /**
     * 清除HV缓存
     */
    async clearHVCache() {
        await hvCacheManager.clearCache();
        console.log('HV缓存已清除');
    }

    /**
     * 获取价格缓存统计信息
     */
    async getPriceCacheStats() {
        return await priceCacheManager.getCacheStats();
    }

    /**
     * 获取HV缓存统计信息
     */
    async getHVCacheStats() {
        return await hvCacheManager.getCacheStats();
    }

    /**
     * 获取所有缓存统计信息
     */
    async getAllCacheStats() {
        const priceStats = await this.getPriceCacheStats();
        const hvStats = await this.getHVCacheStats();
        
        return {
            price: priceStats,
            hv: hvStats,
            memory: {
                cacheCount: this.cache.size,
                cacheDuration: this.cacheDuration
            }
        };
    }

    /**
     * 获取所有缓存的HV数据（调试用）
     */
    async getAllCachedHVData() {
        return await hvCacheManager.getAllCachedData();
    }

    /**
     * 获取所有缓存的价格数据（调试用）
     */
    async getAllCachedPriceData() {
        return await priceCacheManager.getAllCachedData();
    }
}

module.exports = new AlphaVantageService(); 