const fs = require('fs').promises;
const path = require('path');

/**
 * HV数据缓存管理类
 * 按天为单位缓存HV计算结果
 */
class HVCacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '../cache');
        this.cacheFile = path.join(this.cacheDir, 'hv-cache.json');
        this.currentDate = null;
        this.hvCache = null;
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
            console.error('创建缓存目录失败:', error.message);
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
     * 加载当天的HV缓存数据
     */
    async loadTodayCache() {
        // 确保缓存目录已初始化
        await this.initCacheDir();
        
        const today = this.getTodayDateString();
        
        // 如果已经加载过今天的缓存，直接返回
        if (this.currentDate === today && this.hvCache) {
            return this.hvCache;
        }

        try {
            // 尝试从文件读取缓存
            const cacheData = await fs.readFile(this.cacheFile, 'utf8');
            const parsedCache = JSON.parse(cacheData);
            
            // 检查缓存是否是今天的
            if (parsedCache.date === today) {
                console.log(`加载今天(${today})的HV缓存数据`);
                this.currentDate = today;
                this.hvCache = parsedCache.data;
                return this.hvCache;
            } else {
                console.log(`缓存数据是${parsedCache.date}的，今天是${today}，需要重新计算`);
                // 清空过期缓存
                this.currentDate = today;
                this.hvCache = {};
                return this.hvCache;
            }
        } catch (error) {
            // 文件不存在或解析失败，创建新的缓存
            console.log('HV缓存文件不存在或损坏，创建新缓存:', error.message);
            this.currentDate = today;
            this.hvCache = {};
            return this.hvCache;
        }
    }

    /**
     * 保存当天的HV缓存数据到文件
     */
    async saveTodayCache() {
        if (!this.hvCache || !this.currentDate) {
            return;
        }

        try {
            const cacheData = {
                date: this.currentDate,
                lastUpdated: new Date().toISOString(),
                data: this.hvCache
            };

            await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
            console.log(`HV缓存已保存到文件，日期: ${this.currentDate}`);
        } catch (error) {
            console.error('保存HV缓存失败:', error.message);
        }
    }

    /**
     * 获取缓存的HV值
     * @param {string} symbol - 股票代码
     * @param {number} period - HV计算周期
     * @returns {number|null} 缓存的HV值，如果不存在返回null
     */
    async getCachedHV(symbol, period) {
        const cache = await this.loadTodayCache();
        const cacheKey = `${symbol}_${period}`;
        
        if (cache[cacheKey]) {
            console.log(`从缓存获取 ${symbol} ${period}天HV: ${cache[cacheKey].toFixed(2)}%`);
            return cache[cacheKey];
        }
        
        return null;
    }

    /**
     * 设置HV缓存值
     * @param {string} symbol - 股票代码
     * @param {number} period - HV计算周期
     * @param {number} hvValue - HV值
     */
    async setCachedHV(symbol, period, hvValue) {
        const cache = await this.loadTodayCache();
        const cacheKey = `${symbol}_${period}`;
        
        cache[cacheKey] = hvValue;
        console.log(`缓存 ${symbol} ${period}天HV: ${hvValue.toFixed(2)}%`);
        
        // 立即保存到文件
        await this.saveTodayCache();
    }

    /**
     * 检查是否有指定股票和周期的缓存
     * @param {string} symbol - 股票代码
     * @param {number} period - HV计算周期
     * @returns {boolean} 是否存在缓存
     */
    async hasCachedHV(symbol, period) {
        const cache = await this.loadTodayCache();
        const cacheKey = `${symbol}_${period}`;
        return cacheKey in cache;
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
            cacheCount: Object.keys(cache).length,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * 清空所有缓存
     */
    async clearCache() {
        this.hvCache = {};
        this.currentDate = this.getTodayDateString();
        await this.saveTodayCache();
        console.log('HV缓存已清空');
    }

    /**
     * 获取所有缓存的HV数据（用于调试）
     */
    async getAllCachedData() {
        const cache = await this.loadTodayCache();
        return {
            date: this.currentDate,
            data: cache
        };
    }
}

module.exports = new HVCacheManager();
