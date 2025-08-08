const fs = require('fs').promises;
const path = require('path');

/**
 * 股票价格缓存管理类
 * 按天为单位缓存股票价格数据
 */
class PriceCacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '../cache');
        this.cacheFile = path.join(this.cacheDir, 'price-cache.json');
        this.currentDate = null;
        this.priceCache = null;
        this.initialized = false;
    }

    /**
     * 初始化缓存目录
     */
    async initCacheDir() {
        if (this.initialized) return;
        
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            this.initialized = true;
        } catch (error) {
            console.error('创建价格缓存目录失败:', error.message);
            throw error;
        }
    }

    /**
     * 获取今天的日期字符串 (YYYY-MM-DD)
     */
    getTodayDateString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * 加载当天的价格缓存数据
     */
    async loadTodayCache() {
        // 确保缓存目录已初始化
        await this.initCacheDir();
        
        const today = this.getTodayDateString();
        
        // 如果已经加载过今天的缓存，直接返回
        if (this.currentDate === today && this.priceCache) {
            return this.priceCache;
        }

        try {
            // 尝试从文件读取缓存
            const cacheData = await fs.readFile(this.cacheFile, 'utf8');
            const parsedCache = JSON.parse(cacheData);
            
            // 检查缓存是否是今天的
            if (parsedCache.date === today) {
                console.log(`加载今天(${today})的股票价格缓存数据，已缓存 ${Object.keys(parsedCache.data).length} 只股票`);
                this.currentDate = today;
                this.priceCache = parsedCache.data;
                return this.priceCache;
            } else {
                console.log(`价格缓存数据是${parsedCache.date}的，今天是${today}，需要重新获取`);
                // 清空过期缓存
                this.currentDate = today;
                this.priceCache = {};
                return this.priceCache;
            }
        } catch (error) {
            // 文件不存在或解析失败，创建新的缓存
            console.log('股票价格缓存文件不存在或损坏，创建新缓存:', error.message);
            this.currentDate = today;
            this.priceCache = {};
            return this.priceCache;
        }
    }

    /**
     * 保存当天的价格缓存数据到文件
     */
    async saveTodayCache() {
        if (!this.priceCache || !this.currentDate) {
            return;
        }

        try {
            const cacheData = {
                date: this.currentDate,
                lastUpdated: new Date().toISOString(),
                cachedStockCount: Object.keys(this.priceCache).length,
                data: this.priceCache
            };

            await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
            console.log(`股票价格缓存已保存到文件，日期: ${this.currentDate}，股票数量: ${cacheData.cachedStockCount}`);
        } catch (error) {
            console.error('保存股票价格缓存失败:', error.message);
        }
    }

    /**
     * 获取缓存的股票价格
     * @param {string} symbol - 股票代码
     * @returns {Object|null} 缓存的价格数据，如果不存在返回null
     */
    async getCachedPrice(symbol) {
        const cache = await this.loadTodayCache();
        
        if (cache[symbol]) {
            console.log(`从天级缓存获取 ${symbol} 价格数据: $${cache[symbol].price}`);
            return cache[symbol];
        }
        
        return null;
    }

    /**
     * 设置股票价格缓存
     * @param {string} symbol - 股票代码
     * @param {Object} priceData - 价格数据
     */
    async setCachedPrice(symbol, priceData) {
        const cache = await this.loadTodayCache();
        
        // 添加缓存标识
        const cachedPriceData = {
            ...priceData,
            cachedAt: new Date().toISOString(),
            fromCache: true
        };
        
        cache[symbol] = cachedPriceData;
        console.log(`缓存 ${symbol} 价格数据: $${priceData.price}`);
        
        // 立即保存到文件
        await this.saveTodayCache();
    }

    /**
     * 批量设置股票价格缓存
     * @param {Array} stocksData - 股票数据数组
     */
    async setBatchCachedPrices(stocksData) {
        const cache = await this.loadTodayCache();
        
        stocksData.forEach(stockData => {
            const cachedPriceData = {
                ...stockData,
                cachedAt: new Date().toISOString(),
                fromCache: true
            };
            cache[stockData.symbol] = cachedPriceData;
        });
        
        console.log(`批量缓存 ${stocksData.length} 只股票的价格数据`);
        
        // 保存到文件
        await this.saveTodayCache();
    }

    /**
     * 检查是否有指定股票的缓存
     * @param {string} symbol - 股票代码
     * @returns {boolean} 是否存在缓存
     */
    async hasCachedPrice(symbol) {
        const cache = await this.loadTodayCache();
        return symbol in cache;
    }

    /**
     * 获取所有缓存的股票代码
     * @returns {Array} 已缓存的股票代码数组
     */
    async getCachedStockSymbols() {
        const cache = await this.loadTodayCache();
        return Object.keys(cache);
    }

    /**
     * 获取缓存统计信息
     */
    async getCacheStats() {
        const cache = await this.loadTodayCache();
        const today = this.getTodayDateString();
        
        return {
            date: this.currentDate,
            isToday: this.currentDate === today,
            cachedStockCount: Object.keys(cache).length,
            lastUpdated: new Date().toISOString(),
            cachedSymbols: Object.keys(cache)
        };
    }

    /**
     * 清空所有价格缓存
     */
    async clearCache() {
        this.priceCache = {};
        this.currentDate = this.getTodayDateString();
        await this.saveTodayCache();
        console.log('股票价格缓存已清空');
    }

    /**
     * 获取所有缓存的价格数据（用于调试）
     */
    async getAllCachedData() {
        const cache = await this.loadTodayCache();
        return {
            date: this.currentDate,
            stockCount: Object.keys(cache).length,
            data: cache
        };
    }

    /**
     * 检查指定股票列表中哪些需要获取新数据
     * @param {Array} symbols - 股票代码数组
     * @returns {Object} {cached: [], needFetch: []}
     */
    async checkStockCacheStatus(symbols) {
        const cache = await this.loadTodayCache();
        const cached = [];
        const needFetch = [];

        symbols.forEach(symbol => {
            if (cache[symbol]) {
                cached.push(symbol);
            } else {
                needFetch.push(symbol);
            }
        });

        return { cached, needFetch };
    }
}

module.exports = new PriceCacheManager();
