const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const alphaVantageService = require('./alphavantage');

/**
 * 历史基准数据计算服务
 * 用于获取真实数据并计算HISTORICAL_BENCHMARKS
 */
class HistoricalBenchmarkService {
    constructor() {
        this.alphaVantageService = alphaVantageService;
        this.dataPath = path.join(__dirname, '../cache/historical-benchmarks.json');
        this.rawDataPath = path.join(__dirname, '../cache/raw-hv-iv-data.json');
        
        // API调用限制：75次/分钟
        this.apiCallDelay = 800; // 每次调用间隔800ms，确保不超过75次/分钟
        this.lastApiCall = 0;
    }

    /**
     * 延迟函数，确保API调用频率控制
     */
    async delayApiCall() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        
        if (timeSinceLastCall < this.apiCallDelay) {
            const remainingDelay = this.apiCallDelay - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, remainingDelay));
        }
        
        this.lastApiCall = Date.now();
    }

    /**
     * 获取支持的股票列表
     */
    getSupportedStocks() {
        return [
            // 美股前20
            'NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 
            'BRK-B', 'JPM', 'WMT', 'LLY', 'V', 'ORCL', 'MA', 'NFLX', 
            'XOM', 'COST', 'JNJ', 'HD',
            // 中概股5只
            'BABA', 'PDD', 'NTES', 'JD', 'TME'
        ];
    }

    /**
     * 计算历史波动率
     * @param {Array} priceData - 价格数据数组 [{date, price}]
     * @param {number} period - 计算周期（天）
     * @returns {number} 年化历史波动率
     */
    calculateHistoricalVolatility(priceData, period) {
        if (priceData.length < period + 1) {
            throw new Error(`数据不足，需要${period + 1}天数据，实际${priceData.length}天`);
        }

        // 按日期排序（最新的在前）
        const sortedData = [...priceData]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, period + 1);

        // 计算日收益率
        const returns = [];
        for (let i = 0; i < period; i++) {
            const currentPrice = sortedData[i].price;
            const previousPrice = sortedData[i + 1].price;
            
            if (previousPrice > 0 && currentPrice > 0) {
                const logReturn = Math.log(currentPrice / previousPrice);
                returns.push(logReturn);
            }
        }

        if (returns.length < period * 0.8) {
            throw new Error(`有效数据不足，需要至少${Math.ceil(period * 0.8)}个有效收益率`);
        }

        // 计算标准差
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
        const dailyVolatility = Math.sqrt(variance);

        // 年化（252个交易日）
        return dailyVolatility * Math.sqrt(252) * 100; // 转换为百分比
    }

    /**
     * 获取股票的历史价格数据（过去3个月）
     * @param {string} symbol - 股票代码
     * @returns {Promise<Array>} 价格数据数组
     */
    async getHistoricalPrices(symbol) {
        try {
            console.log(`获取 ${symbol} 的历史价格数据...`);
            await this.delayApiCall();

            // 使用AlphaVantage API获取每日数据
            const response = await axios.get('https://www.alphavantage.co/query', {
                params: {
                    function: 'TIME_SERIES_DAILY_ADJUSTED',
                    symbol: symbol,
                    outputsize: 'full', // 获取完整历史数据，确保有足够的3个月数据
                    apikey: this.alphaVantageService.apiKey
                },
                timeout: 15000 // 增加超时时间，因为full数据量较大
            });

            const data = response.data;
            if (data['Error Message']) {
                throw new Error(`API错误: ${data['Error Message']}`);
            }

            if (data['Note']) {
                throw new Error(`API限制: ${data['Note']}`);
            }

            const timeSeries = data['Time Series (Daily)'];
            if (!timeSeries) {
                throw new Error('未获取到价格数据');
            }

            // 转换数据格式
            const priceData = Object.entries(timeSeries).map(([date, values]) => ({
                date,
                price: parseFloat(values['5. adjusted close'])
            }));

            // 筛选过去3个月的数据
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            const recentData = priceData.filter(item => 
                new Date(item.date) >= threeMonthsAgo
            );

            console.log(`${symbol} 获取到 ${recentData.length} 天的价格数据`);
            return recentData;

        } catch (error) {
            console.error(`获取 ${symbol} 历史价格失败:`, error.message);
            throw error;
        }
    }

    /**
     * 获取当前期权数据（包含IV）
     * @param {string} symbol - 股票代码
     * @returns {Promise<Array>} 期权数据数组
     */
    async getCurrentOptionsData(symbol) {
        try {
            console.log(`获取 ${symbol} 的当前期权数据...`);
            await this.delayApiCall();

            // 使用现有的期权API
            const optionsData = await this.alphaVantageService.getOptionsData(symbol, true);
            
            if (!optionsData || optionsData.length === 0) {
                throw new Error('未获取到期权数据');
            }

            console.log(`${symbol} 获取到 ${optionsData.length} 个期权合约`);
            return optionsData;

        } catch (error) {
            console.error(`获取 ${symbol} 期权数据失败:`, error.message);
            throw error;
        }
    }

    /**
     * 计算单个股票的HV/IV比率数据
     * @param {string} symbol - 股票代码
     * @returns {Promise<Object>} HV/IV比率分析结果
     */
    async calculateStockBenchmarks(symbol) {
        try {
            console.log(`\n开始计算 ${symbol} 的基准数据...`);

            // 1. 获取历史价格数据
            const priceData = await this.getHistoricalPrices(symbol);
            
            // 2. 计算不同周期的HV（根据可用数据调整）
            const availableDays = priceData.length - 1; // 减1因为需要前一天数据计算收益率
            console.log(`${symbol} 可用交易日数据: ${availableDays} 天`);
            
            const hvSegments = {};
            
            // 根据可用数据动态计算HV，而不是固定使用特定天数
            if (availableDays >= 20) {
                hvSegments.ultra_short = this.calculateHistoricalVolatility(priceData, Math.min(20, availableDays));
            }
            if (availableDays >= 30) {
                hvSegments.short = this.calculateHistoricalVolatility(priceData, Math.min(30, availableDays));
            }
            if (availableDays >= 60) {
                hvSegments.medium = this.calculateHistoricalVolatility(priceData, Math.min(60, availableDays));
            }
            if (availableDays >= 80) {
                // 使用80天代替180天，因为AlphaVantage compact模式只返回约100天数据
                hvSegments.long = this.calculateHistoricalVolatility(priceData, Math.min(80, availableDays));
            }
            
            // 如果数据不足，使用可用的最长周期填充缺失的周期
            const maxPeriod = Math.min(availableDays, 60);
            if (!hvSegments.ultra_short && availableDays >= 15) {
                hvSegments.ultra_short = this.calculateHistoricalVolatility(priceData, Math.min(15, availableDays));
            }
            if (!hvSegments.short && availableDays >= 20) {
                hvSegments.short = this.calculateHistoricalVolatility(priceData, Math.min(20, availableDays));
            }
            if (!hvSegments.medium && availableDays >= 30) {
                hvSegments.medium = this.calculateHistoricalVolatility(priceData, Math.min(30, availableDays));
            }
            if (!hvSegments.long) {
                hvSegments.long = hvSegments.medium || hvSegments.short || hvSegments.ultra_short;
            }

            console.log(`${symbol} HV计算完成:`, hvSegments);

            // 3. 获取当前期权数据
            const optionsData = await this.getCurrentOptionsData(symbol);

            // 4. 计算HV/IV比率
            const hvIvRatios = [];
            
            optionsData.forEach(option => {
                if (option.impliedVolatility && option.impliedVolatility > 0) {
                    // 根据期权剩余天数选择对应的HV
                    let hv;
                    const dte = option.daysToExpiry || 30;
                    
                    if (dte <= 20) {
                        hv = hvSegments.ultra_short;
                    } else if (dte <= 60) {
                        hv = hvSegments.short;
                    } else if (dte <= 180) {
                        hv = hvSegments.medium;
                    } else {
                        hv = hvSegments.long;
                    }

                    const iv = option.impliedVolatility * 100; // 转换为百分比
                    const ratio = hv / iv;
                    
                    if (ratio > 0 && ratio < 5) { // 过滤异常值
                        hvIvRatios.push({
                            ratio,
                            dte,
                            hv,
                            iv,
                            strikePrice: option.strikePrice,
                            type: option.type
                        });
                    }
                }
            });

            if (hvIvRatios.length === 0) {
                throw new Error('没有有效的HV/IV比率数据');
            }

            // 5. 计算统计值
            const ratios = hvIvRatios.map(item => item.ratio);
            const R_avg = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
            const variance = ratios.reduce((sum, ratio) => sum + Math.pow(ratio - R_avg, 2), 0) / (ratios.length - 1);
            const R_std_dev = Math.sqrt(variance);

            const result = {
                symbol,
                R_avg: Math.round(R_avg * 1000) / 1000,
                R_std_dev: Math.round(R_std_dev * 1000) / 1000,
                HV_segments: {
                    ultra_short: Math.round(hvSegments.ultra_short * 10) / 10,
                    short: Math.round(hvSegments.short * 10) / 10,
                    medium: Math.round(hvSegments.medium * 10) / 10,
                    long: Math.round(hvSegments.long * 10) / 10
                },
                sampleSize: hvIvRatios.length,
                lastUpdated: new Date().toISOString(),
                rawData: hvIvRatios.slice(0, 10) // 保存前10个样本用于验证
            };

            console.log(`${symbol} 基准计算完成:`, {
                R_avg: result.R_avg,
                R_std_dev: result.R_std_dev,
                sampleSize: result.sampleSize,
                HV_segments: result.HV_segments
            });

            return result;

        } catch (error) {
            console.error(`计算 ${symbol} 基准数据失败:`, error.message);
            throw error;
        }
    }

    /**
     * 批量更新所有股票的历史基准数据
     * @param {Function} progressCallback - 进度回调函数
     * @returns {Promise<Object>} 更新结果
     */
    async updateAllBenchmarks(progressCallback = null) {
        const stocks = this.getSupportedStocks();
        const results = {};
        const errors = [];
        
        console.log(`开始更新 ${stocks.length} 只股票的历史基准数据...`);
        
        for (let i = 0; i < stocks.length; i++) {
            const symbol = stocks[i];
            
            try {
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: stocks.length,
                        symbol,
                        status: 'processing'
                    });
                }

                const benchmarkData = await this.calculateStockBenchmarks(symbol);
                results[symbol] = benchmarkData;

                // 保存中间结果，防止数据丢失
                await this.saveBenchmarksToFile(results);

                console.log(`✅ ${symbol} 完成 (${i + 1}/${stocks.length})`);

            } catch (error) {
                const errorInfo = {
                    symbol,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                errors.push(errorInfo);
                console.error(`❌ ${symbol} 失败:`, error.message);

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: stocks.length,
                        symbol,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            // 每处理5只股票后额外等待一下，避免API限制
            if ((i + 1) % 5 === 0) {
                console.log('暂停2秒，避免API限制...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        const updateResult = {
            success: Object.keys(results).length,
            errorCount: errors.length,
            total: stocks.length,
            successRate: Math.round((Object.keys(results).length / stocks.length) * 100),
            results,
            errors,
            timestamp: new Date().toISOString()
        };

        console.log('\n=== 更新完成 ===');
        console.log(`成功: ${updateResult.success}/${updateResult.total} (${updateResult.successRate}%)`);
        console.log(`失败: ${updateResult.errorCount}`);

        // 保存最终结果
        await this.saveBenchmarksToFile(results);
        
        return updateResult;
    }

    /**
     * 保存基准数据到文件
     * @param {Object} benchmarks - 基准数据
     */
    async saveBenchmarksToFile(benchmarks) {
        try {
            // 确保cache目录存在
            const cacheDir = path.dirname(this.dataPath);
            await fs.mkdir(cacheDir, { recursive: true });

            await fs.writeFile(this.dataPath, JSON.stringify(benchmarks, null, 2));
            console.log(`基准数据已保存到: ${this.dataPath}`);
        } catch (error) {
            console.error('保存基准数据失败:', error.message);
            // 保存失败不应该阻止程序继续执行，只记录错误
        }
    }

    /**
     * 从文件加载基准数据
     * @returns {Promise<Object>} 基准数据
     */
    async loadBenchmarksFromFile() {
        try {
            const data = await fs.readFile(this.dataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('未找到已保存的基准数据文件');
            return null;
        }
    }

    /**
     * 获取基准数据状态
     * @returns {Promise<Object>} 状态信息
     */
    async getBenchmarkStatus() {
        try {
            const savedData = await this.loadBenchmarksFromFile();
            
            if (!savedData) {
                return {
                    hasData: false,
                    message: '尚未生成真实基准数据'
                };
            }

            const stockList = Object.keys(savedData);
            const lastUpdated = stockList.length > 0 ? 
                Math.max(...stockList.map(s => new Date(savedData[s].lastUpdated).getTime())) : 0;

            return {
                hasData: true,
                stockCount: stockList.length,
                lastUpdated: new Date(lastUpdated).toISOString(),
                stocks: [...stockList].sort((a, b) => a.localeCompare(b)),
                message: `已有 ${stockList.length} 只股票的真实基准数据`
            };

        } catch (error) {
            return {
                hasData: false,
                error: error.message,
                message: '读取基准数据状态失败'
            };
        }
    }
}

module.exports = HistoricalBenchmarkService;
