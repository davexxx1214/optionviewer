const alphaVantageService = require('./alphavantage');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * NVDA历史基准数据计算服务
 * 正确计算过去180天的逐日HV/IV比值，然后按DTE区间分组计算平均值
 */
class NVDAHistoricalBenchmarkService {
    constructor() {
        this.alphaVantageService = alphaVantageService;
        this.symbol = 'NVDA';
        this.cacheDir = 'cache';
        this.benchmarkFile = path.join(this.cacheDir, 'nvda-historical-benchmarks.json');
        this.rawDataFile = path.join(this.cacheDir, 'nvda-raw-historical-data.json');
        
        // API调用限制：75次/分钟，所以每次调用间隔800ms
        this.apiCallDelay = 800; // 毫秒
        
        // DTE区间定义
        this.dteRanges = {
            ultra_short: { min: 0, max: 20, hvPeriod: 20 },
            short: { min: 21, max: 60, hvPeriod: 30 },
            medium: { min: 61, max: 180, hvPeriod: 60 },
            long: { min: 181, max: 999, hvPeriod: 180 }
        };
        
        // 分析时间窗口：半年（约126个交易日）
        this.analysisWindow = 126; // 交易日
    }

    /**
     * 生成交易日列表（排除周末，不考虑节假日）
     * @param {Date} endDate - 结束日期
     * @param {number} tradingDays - 需要的交易日数量
     * @returns {Array<string>} 交易日列表（YYYY-MM-DD格式）
     */
    generateTradingDays(endDate, tradingDays) {
        const tradingDaysList = [];
        const currentDate = new Date(endDate);
        
        while (tradingDaysList.length < tradingDays) {
            // 跳过周末：周六(6)和周日(0)
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                tradingDaysList.unshift(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() - 1);
        }
        
        return tradingDaysList;
    }

    /**
     * 计算日收益率的历史波动率
     * @param {Array} prices - 价格数组（按时间从旧到新排序）
     * @param {number} period - 计算期间（天数）
     * @returns {number} 年化历史波动率
     */
    calculateHistoricalVolatility(prices, period) {
        if (prices.length < period + 1) {
            throw new Error(`数据不足，需要${period + 1}天数据，实际${prices.length}天`);
        }
        
        // 取最近period+1天的数据来计算period天的波动率
        const recentPrices = prices.slice(-(period + 1));
        
        // 计算日收益率
        const returns = [];
        for (let i = 1; i < recentPrices.length; i++) {
            const dailyReturn = Math.log(recentPrices[i] / recentPrices[i - 1]);
            returns.push(dailyReturn);
        }
        
        // 计算平均收益率
        const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        
        // 计算方差
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
        
        // 年化波动率（假设252个交易日）
        const annualizedVolatility = Math.sqrt(variance * 252);
        
        return annualizedVolatility;
    }

    /**
     * 从历史期权数据中计算特定日期的加权平均隐含波动率
     * @param {Array} optionsForDate - 特定日期的期权数据
     * @returns {Object} 按DTE区间分组的IV数据
     */
    calculateImpliedVolatilityByDTE(optionsForDate, currentDate) {
        const ivByDTE = {
            ultra_short: [],
            short: [],
            medium: [],
            long: []
        };
        
        // 使用传入的历史日期作为基准计算DTE
        const refDateForDTE = new Date(currentDate); // 使用历史交易日期
        
        // 调试：统计处理的期权数量
        let processedCount = 0;
        let validIVCount = 0;
        let categorizedCount = 0;
        
        // 确定是否为第一个交易日（用于调试）
        const isFirstTradingDay = currentDate === tradingDays[0]; // 只在第一个交易日显示调试
        
        optionsForDate.forEach(option => {
            processedCount++;
            
            // 只在第一个交易日显示调试信息
            if (isFirstTradingDay && processedCount <= 10) {
                console.log(`处理期权 ${processedCount}:`, {
                    symbol: option.symbol || option.contractID,
                    expiration: option.expiration,
                    implied_volatility: option.implied_volatility,
                    type: option.type
                });
            }
            // 计算到期天数（基于历史交易日期）
            const expirationDate = new Date(option.expiration);
            const daysToExpiry = Math.ceil((expirationDate - refDateForDTE) / (1000 * 60 * 60 * 24));
            
            // 获取IV值（兼容不同的字段名称）
            const ivValue = option.impliedVolatility !== undefined ? option.impliedVolatility : option.implied_volatility;
            const iv = parseFloat(ivValue) || 0;
            
            // 调试：检查第一个交易日的前几个期权的IV获取情况
            if (isFirstTradingDay && processedCount <= 5) {
                console.log(`\n=== 期权 ${processedCount} IV值调试 ===`);
                console.log(`option.impliedVolatility = ${option.impliedVolatility} (类型: ${typeof option.impliedVolatility})`);
                console.log(`option.implied_volatility = ${option.implied_volatility} (类型: ${typeof option.implied_volatility})`);
                console.log(`最终ivValue = ${ivValue} (类型: ${typeof ivValue})`);
                console.log(`parseFloat(ivValue) = ${parseFloat(ivValue)}`);
                console.log(`最终iv = ${iv}`);
                console.log(`=== 调试结束 ===\n`);
            }
            
            // 处理期权数据，包括已过期的（用于历史分析）
            // 按用户要求：不过滤任何期权，包括IV为0或undefined的期权
            validIVCount++;
            
            // 如果期权已过期，我们仍然可以根据其原本的DTE特征进行分类
            // 这里我们使用绝对值，因为我们关心的是期权的DTE特征，不是当前状态
            const absoluteDTE = Math.abs(daysToExpiry);
            
            if (isFirstTradingDay && processedCount <= 10) {
                console.log(`期权 ${processedCount} - DTE计算: 到期日=${option.expiration}, 交易日=${refDateForDTE.toISOString().split('T')[0]}, daysToExpiry=${daysToExpiry}, absoluteDTE=${absoluteDTE}, IV=${ivValue}`);
            }
            
            // 但是对于过期很久的期权，我们跳过（可能数据质量不好）
            if (absoluteDTE > 1000) {
                return;
            }
            
            // 根据DTE分组（使用绝对值进行分类）
            for (const [rangeKey, range] of Object.entries(this.dteRanges)) {
                if (absoluteDTE >= range.min && absoluteDTE <= range.max) {
                    categorizedCount++;
                    if (isFirstTradingDay && categorizedCount <= 5) {
                        console.log(`期权 ${processedCount} 归类到 ${rangeKey} (${range.min}-${range.max}天), IV=${iv} (原始值=${ivValue})`);
                    }
                    ivByDTE[rangeKey].push({
                        iv: iv,
                        volume: parseInt(option.volume) || 0,
                        dte: daysToExpiry
                    });
                    break;
                }
            }
        });
        
        // 在第一个交易日显示统计信息
        if (isFirstTradingDay) {
            console.log(`\n=== ${currentDate} 期权处理统计 ===`);
            console.log(`总处理期权数: ${processedCount}`);
            console.log(`有效IV期权数: ${validIVCount}`);
            console.log(`成功归类期权数: ${categorizedCount}`);
            console.log(`各区间期权数量:`, Object.fromEntries(
                Object.entries(ivByDTE).map(([key, arr]) => [key, arr.length])
            ));
        }
        
        // 计算每个DTE区间的加权平均IV
        const result = {};
        for (const [rangeKey, ivData] of Object.entries(ivByDTE)) {
            if (ivData.length > 0) {
                // 使用成交量加权平均
                let totalVolume = 0;
                let weightedIV = 0;
                
                ivData.forEach(item => {
                    const volume = Math.max(item.volume, 1); // 至少权重为1
                    totalVolume += volume;
                    weightedIV += item.iv * volume;
                });
                
                result[rangeKey] = {
                    iv: weightedIV / totalVolume,
                    count: ivData.length,
                    totalVolume: totalVolume
                };
            }
        }
        
        if (isFirstTradingDay) {
            console.log(`最终IV计算结果:`, Object.fromEntries(
                Object.entries(result).map(([key, data]) => [key, `IV=${data.iv.toFixed(4)}, count=${data.count}`])
            ));
            console.log(`=== 统计结束 ===\n`);
        }
        
        return result;
    }

    /**
     * 获取NVDA的历史股价数据
     * @param {number} days - 需要的天数
     * @returns {Object} 历史价格数据
     */
    async getHistoricalPrices(days) {
        console.log(`获取 ${this.symbol} 的历史价格数据...`);
        
        try {
            const url = `${this.alphaVantageService.baseUrl}/query`;
            const params = {
                function: 'TIME_SERIES_DAILY_ADJUSTED',
                symbol: this.symbol,
                outputsize: 'full',
                datatype: 'json',
                apikey: this.alphaVantageService.apiKey
            };

            const response = await axios.get(url, {
                params,
                timeout: 15000
            });
            
            const data = response.data;
            
            // 检查是否为demo API key的响应
            if (data?.Information && data.Information.includes('demo')) {
                console.log('检测到demo API key，使用模拟历史价格数据');
                return this.generateMockHistoricalPrices(days);
            }
            
            if (data['Error Message']) {
                throw new Error(`获取${this.symbol}历史价格失败: ${data['Error Message']}`);
            }
            
            const timeSeries = data['Time Series (Daily)'];
            if (!timeSeries) {
                console.log('API返回的数据中没有历史价格，使用模拟数据');
                return this.generateMockHistoricalPrices(days);
            }
            
            // 转换为数组格式并按日期排序
            const priceData = Object.entries(timeSeries)
                .map(([date, values]) => ({
                    date: date,
                    close: parseFloat(values['5. adjusted close'])
                }))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            console.log(`${this.symbol} 获取到 ${priceData.length} 天的真实价格数据`);
            return priceData;
            
        } catch (error) {
            console.log(`获取真实历史价格失败，使用模拟数据: ${error.message}`);
            return this.generateMockHistoricalPrices(days);
        }
    }

    /**
     * 生成模拟的历史价格数据
     * @param {number} days - 需要生成的天数
     * @returns {Array} 模拟的价格数据数组
     */
    generateMockHistoricalPrices(days) {
        console.log(`为 ${this.symbol} 生成 ${days} 天的模拟历史价格数据`);
        
        const priceData = [];
        const basePrice = 150; // NVDA的基础价格
        const volatility = 0.02; // 日波动率约2%
        
        // 从过去的日期开始生成
        const endDate = new Date();
        let currentPrice = basePrice;
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(endDate);
            date.setDate(date.getDate() - i);
            
            // 跳过周末
            if (date.getDay() === 0 || date.getDay() === 6) {
                continue;
            }
            
            // 生成价格变化（随机游走）
            const change = (Math.random() - 0.5) * 2 * volatility;
            currentPrice = currentPrice * (1 + change);
            
            // 确保价格在合理范围内
            currentPrice = Math.max(100, Math.min(250, currentPrice));
            
            priceData.push({
                date: date.toISOString().split('T')[0],
                close: Math.round(currentPrice * 100) / 100
            });
        }
        
        // 按日期排序
        priceData.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        console.log(`生成了 ${priceData.length} 天的模拟价格数据，价格范围: ${Math.min(...priceData.map(p => p.close))}-${Math.max(...priceData.map(p => p.close))}`);
        return priceData;
    }

    /**
     * 获取NVDA的当前期权数据（因为HISTORICAL_OPTIONS API可能不可用）
     * @returns {Array} 当前期权数据
     */
    /**
     * 按DTE对期权进行分类
     * @param {Array} optionsData - 期权数据数组
     * @param {string} referenceDate - 参考日期 (YYYY-MM-DD格式)
     * @returns {Object} 按DTE分类的期权数据
     */
    categorizeOptionsByDTE(optionsData, referenceDate) {
        console.log(`\n=== categorizeOptionsByDTE 开始执行 ===`);
        console.log(`处理 ${optionsData.length} 个期权，参考日期: ${referenceDate}`);
        
        const result = {
            ultra_short: [],  // 0-20天
            short: [],        // 21-60天  
            medium: [],       // 61-180天
            long: []          // >180天
        };
        
        const refDate = new Date(referenceDate);
        let processedCount = 0;
        
        optionsData.forEach(option => {
            processedCount++;
            
            // 按用户要求：后台基准数据更新时不过滤任何期权
            if (option.expiration) {
                const expDate = new Date(option.expiration);
                const daysToExpiry = Math.ceil((expDate - refDate) / (1000 * 60 * 60 * 24));
                
                // 使用绝对值处理过期期权（用于DTE分类）
                const absoluteDTE = Math.abs(daysToExpiry);
                
                // 获取IV值（兼容不同的字段名称）
                const ivValue = option.impliedVolatility !== undefined ? option.impliedVolatility : option.implied_volatility;
                const iv = parseFloat(ivValue) || 0;
                
                // 前5个期权显示详细调试信息
                if (processedCount <= 5) {
                    console.log(`期权 ${processedCount}: ${option.contractID || option.symbol}`);
                    console.log(`  到期日: ${option.expiration}, DTE: ${daysToExpiry}, 绝对DTE: ${absoluteDTE}`);
                    console.log(`  implied_volatility: ${option.implied_volatility}, impliedVolatility: ${option.impliedVolatility}`);
                    console.log(`  最终IV值: ${iv}`);
                }
                
                const optionWithIV = { ...option, implied_volatility: iv };
                
                // 按DTE分类（不过滤任何期权）
                if (absoluteDTE <= 20) {
                    result.ultra_short.push(optionWithIV);
                } else if (absoluteDTE <= 60) {
                    result.short.push(optionWithIV);
                } else if (absoluteDTE <= 180) {
                    result.medium.push(optionWithIV);
                } else {
                    result.long.push(optionWithIV);
                }
            }
        });
        
        console.log(`categorizeOptionsByDTE 完成，结果统计:`);
        Object.entries(result).forEach(([key, arr]) => {
            if (arr.length > 0) {
                const sampleIVs = arr.slice(0, 3).map(opt => opt.implied_volatility);
                console.log(`  ${key}: ${arr.length}个期权，前3个IV值: [${sampleIVs.join(', ')}]`);
            } else {
                console.log(`  ${key}: 0个期权`);
            }
        });
        console.log(`=== categorizeOptionsByDTE 结束 ===\n`);
        
        return result;
    }

    /**
     * 获取指定日期的历史期权数据
     * @param {string} date - 日期 (YYYY-MM-DD格式)
     * @returns {Promise<Array>} 期权数据数组
     */
    async getHistoricalOptionsData(date) {
        console.log(`获取 ${this.symbol} ${date} 的历史期权数据...`);
        
        // 延迟以避免API限制（75次/分钟 = 800ms间隔）
        await new Promise(resolve => setTimeout(resolve, this.apiCallDelay));
        
        try {
            const optionsData = await this.alphaVantageService.getOptionsData(this.symbol, true, date);
            
            if (!optionsData || optionsData.length === 0) {
                console.log(`${date} 未获取到期权数据`);
                return [];
            }

            console.log(`${this.symbol} ${date} 获取到 ${optionsData.length} 个期权合约`);
            return optionsData;

        } catch (error) {
            console.log(`获取 ${date} 期权数据失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 获取当前期权数据（保留原方法用于其他地方）
     */
    async getCurrentOptionsData() {
        console.log(`获取 ${this.symbol} 的当前期权数据...`);
        
        // 延迟以避免API限制
        await new Promise(resolve => setTimeout(resolve, this.apiCallDelay));
        
        try {
            // 使用现有的期权API（已知可以工作）
            console.log('正在调用 alphaVantageService.getOptionsData...');
            const fs = require('fs');
            fs.appendFileSync('debug.log', `[${new Date().toISOString()}] 正在调用 alphaVantageService.getOptionsData...\n`);
            
            const optionsData = await this.alphaVantageService.getOptionsData(this.symbol, true);
            console.log('alphaVantageService.getOptionsData 调用完成');
            fs.appendFileSync('debug.log', `[${new Date().toISOString()}] alphaVantageService.getOptionsData 调用完成，返回 ${optionsData ? optionsData.length : 'null'} 个期权\n`);
            
            if (!optionsData || optionsData.length === 0) {
                console.log('未获取到真实期权数据，使用模拟期权数据');
                return this.generateMockOptionsData();
            }

            console.log(`${this.symbol} 获取到 ${optionsData.length} 个真实期权合约`);
            
            // 调试：检查前几个期权合约的详细结构
            if (optionsData.length > 0) {
                console.log('期权数据详细检查（前3个）:');
                for (let i = 0; i < Math.min(3, optionsData.length); i++) {
                    const option = optionsData[i];
                    console.log(`期权合约 ${i + 1}:`, {
                        contractID: option.contractID,
                        symbol: option.symbol,
                        expiration: option.expiration,
                        implied_volatility: option.implied_volatility,
                        iv_type: typeof option.implied_volatility,
                        type: option.type,
                        strike: option.strike,
                        last_price: option.last_price,
                        bid: option.bid,
                        ask: option.ask,
                        volume: option.volume
                    });
                }
            }
            
            return optionsData;

        } catch (error) {
            console.log(`获取真实期权数据失败，使用模拟数据: ${error.message}`);
            return this.generateMockOptionsData();
        }
    }

    /**
     * 生成模拟的期权数据
     * @returns {Array} 模拟的期权数据数组
     */
    generateMockOptionsData() {
        console.log(`为 ${this.symbol} 生成模拟期权数据`);
        
        const options = [];
        const basePrice = 150; // NVDA当前价格基准
        const today = new Date();
        
        // 生成不同到期日的期权
        const expirations = [
            { days: 7, label: '1周' },
            { days: 14, label: '2周' },
            { days: 30, label: '1月' },
            { days: 60, label: '2月' },
            { days: 90, label: '3月' },
            { days: 120, label: '4月' },
            { days: 180, label: '6月' },
            { days: 365, label: '1年' }
        ];
        
        expirations.forEach(exp => {
            const expDate = new Date(today);
            expDate.setDate(expDate.getDate() + exp.days);
            const expDateStr = expDate.toISOString().split('T')[0];
            
            // 为每个到期日生成多个行权价
            const strikes = [];
            for (let i = -10; i <= 10; i++) {
                strikes.push(basePrice + (i * 5)); // 每5美元一个行权价
            }
            
            strikes.forEach(strike => {
                // 计算隐含波动率（基于到期时间和行权价）
                const timeToExp = exp.days / 365;
                const moneyness = strike / basePrice;
                
                // 波动率微笑：ATM较低，OTM较高
                let iv = 0.25 + Math.abs(moneyness - 1) * 0.3; // 基础IV 25%
                iv += (1 - timeToExp) * 0.1; // 短期波动率更高
                
                // Call期权
                options.push({
                    symbol: `${this.symbol}${expDateStr.replace(/-/g, '')}C${(strike * 1000).toString().padStart(8, '0')}`,
                    type: 'call',
                    expiration: expDateStr,
                    strike: strike,
                    last_price: Math.max(0.05, basePrice - strike + Math.random() * 2),
                    bid: Math.random() * 2 + 0.1,
                    ask: Math.random() * 2 + 0.5,
                    volume: Math.floor(Math.random() * 1000) + 10,
                    open_interest: Math.floor(Math.random() * 5000) + 50,
                    implied_volatility: Math.round(iv * 10000) / 10000,
                    delta: Math.random() * 0.5 + 0.2,
                    gamma: Math.random() * 0.1,
                    theta: -Math.random() * 0.1,
                    vega: Math.random() * 0.3
                });
                
                // Put期权
                options.push({
                    symbol: `${this.symbol}${expDateStr.replace(/-/g, '')}P${(strike * 1000).toString().padStart(8, '0')}`,
                    type: 'put',
                    expiration: expDateStr,
                    strike: strike,
                    last_price: Math.max(0.05, strike - basePrice + Math.random() * 2),
                    bid: Math.random() * 2 + 0.1,
                    ask: Math.random() * 2 + 0.5,
                    volume: Math.floor(Math.random() * 1000) + 10,
                    open_interest: Math.floor(Math.random() * 5000) + 50,
                    implied_volatility: Math.round(iv * 10000) / 10000,
                    delta: -(Math.random() * 0.5 + 0.2),
                    gamma: Math.random() * 0.1,
                    theta: -Math.random() * 0.1,
                    vega: Math.random() * 0.3
                });
            });
        });
        
        console.log(`生成了 ${options.length} 个模拟期权合约，覆盖 ${expirations.length} 个到期日`);
        return options;
    }

    /**
     * 计算NVDA的历史基准数据
     * @param {Function} progressCallback - 进度回调函数
     */
    async calculateNVDABenchmarks(progressCallback) {
        try {
            console.log('开始计算 NVDA 历史基准数据...');
            const fs_debug = require('fs');
            fs_debug.appendFileSync('debug.log', `[${new Date().toISOString()}] calculateNVDABenchmarks 开始\n`);
            
            // 初始进度回调
            progressCallback && progressCallback({
                stock: this.symbol,
                step: '初始化计算环境...',
                progress: 2
            });
            
            // 确保缓存目录存在
            await fs.mkdir(this.cacheDir, { recursive: true });
            
            // 1. 获取历史股价数据
            progressCallback && progressCallback({
                stock: this.symbol,
                step: '准备数据获取...',
                progress: 5
            });
            
            // 注意：策略B不需要历史股价数据，因为我们直接使用历史期权的IV数据
            // const priceData = await this.getHistoricalPrices(this.analysisWindow + 200);
            
            // 2. 生成需要分析的交易日列表
            const today = new Date();
            const tradingDays = this.generateTradingDays(today, this.analysisWindow);
            
            console.log(`生成了 ${tradingDays.length} 个交易日，从 ${tradingDays[0]} 到 ${tradingDays[tradingDays.length - 1]}`);
            console.log(`策略B：将为每个交易日分别获取历史期权数据`);
            
            // 3. 使用策略B：为每个历史交易日获取期权数据并计算平均IV
            
            // 存储每个DTE区间的所有IV值
            const allIVData = {
                ultra_short: [],  // 0-20天
                short: [],        // 21-60天  
                medium: [],       // 61-180天
                long: []          // >180天
            };
            
            let processedDays = 0;
            const totalDays = tradingDays.length;
            
            console.log(`开始处理 ${totalDays} 个交易日的期权数据...`);
            
            for (let i = 0; i < totalDays; i++) {
                const tradingDay = tradingDays[i];
                
                try {
                    // 更新进度 - 数据获取阶段占5%-85%（大部分时间）
                    const progress = 5 + Math.floor((i / totalDays) * 80);
                    progressCallback && progressCallback({
                        stock: this.symbol,
                        step: `处理 ${tradingDay} (${i + 1}/${totalDays})`,
                        progress: progress
                    });
                    
                    console.log(`处理交易日 ${i + 1}/${totalDays}: ${tradingDay}`);
                    
                    // 4.1 获取该日期的历史期权数据
                    const optionsData = await this.getHistoricalOptionsData(tradingDay);
                    
                    if (!optionsData || optionsData.length === 0) {
                        console.log(`跳过 ${tradingDay}：期权数据不足`);
                        continue;
                    }
                    
                    // 4.2 按DTE对期权进行分类并收集IV数据
                    console.log(`\n=== 开始分类 ${tradingDay} 的 ${optionsData.length} 个期权 ===`);
                    const categorizedOptions = this.categorizeOptionsByDTE(optionsData, tradingDay);
                    console.log(`分类完成，结果:`, Object.fromEntries(
                        Object.entries(categorizedOptions).map(([key, arr]) => [key, `${arr.length}个期权`])
                    ));
                    
                    // 4.3 将IV数据添加到对应区间（按用户要求不过滤任何期权）
                    Object.keys(allIVData).forEach(category => {
                        if (categorizedOptions[category] && categorizedOptions[category].length > 0) {
                            const ivValues = categorizedOptions[category]
                                .map(opt => {
                                    // 兼容两种字段名称
                                    const iv = opt.impliedVolatility !== undefined ? opt.impliedVolatility : opt.implied_volatility;
                                    return parseFloat(iv) || 0;
                                }); // 包含所有IV值，包括0和undefined的
                            console.log(`${category} 区间添加 ${ivValues.length} 个IV值，前5个: [${ivValues.slice(0,5).join(', ')}]`);
                            allIVData[category].push(...ivValues);
                        }
                    });
                    
                    processedDays++;
                    console.log(`${tradingDay} 处理完成，累计处理 ${processedDays} 天`);
                    
                } catch (error) {
                    console.error(`处理 ${tradingDay} 时出错:`, error.message);
                    continue;
                }
            }
            
            // 4. 计算每个DTE区间的平均IV值
            progressCallback && progressCallback({
                stock: this.symbol,
                step: '计算平均IV基准值...',
                progress: 88
            });
            
            console.log(`开始计算平均IV基准值...`);
            const benchmarks = {};
            
            Object.keys(allIVData).forEach(category => {
                const ivValues = allIVData[category];
                if (ivValues.length > 0) {
                    // 计算所有IV值的平均值，包括0值
                    const avgIV = ivValues.reduce((sum, iv) => sum + iv, 0) / ivValues.length;
                    const validIVs = ivValues.filter(iv => iv > 0); // 仅用于统计
                    
                    // 使用循环而不是展开运算符避免堆栈溢出
                    let minIV = ivValues[0];
                    let maxIV = ivValues[0];
                    for (let i = 1; i < ivValues.length; i++) {
                        if (ivValues[i] < minIV) minIV = ivValues[i];
                        if (ivValues[i] > maxIV) maxIV = ivValues[i];
                    }
                    
                    benchmarks[category] = {
                        averageIV: avgIV,
                        sampleCount: ivValues.length,
                        validIVCount: validIVs.length,
                        minIV: minIV,
                        maxIV: maxIV
                    };
                    console.log(`${category} 区间: 平均IV=${avgIV.toFixed(4)}, 总样本数=${ivValues.length}, 有效IV数=${validIVs.length}`);
                } else {
                    console.log(`${category} 区间: 无数据`);
                    benchmarks[category] = {
                        averageIV: 0,
                        sampleCount: 0,
                        validIVCount: 0,
                        minIV: 0,
                        maxIV: 0
                    };
                }
            });
                    
            // 5. 保存基准数据
            const result = {
                symbol: this.symbol,
                benchmarks: benchmarks,
                analysisWindow: this.analysisWindow,
                lastUpdated: new Date().toISOString(),
                dataPoints: processedDays,
                totalSamples: Object.values(allIVData).reduce((sum, arr) => sum + arr.length, 0)
            };
            
            // 5. 保存基准数据
            progressCallback && progressCallback({
                stock: this.symbol,
                step: '保存基准数据...',
                progress: 95
            });
            
            await this.saveBenchmarkData(result, allIVData);
            
            console.log('基准数据已保存到:', path.join(this.cacheDir, 'nvda-historical-benchmarks.json'));
            console.log('原始数据已保存到:', path.join(this.cacheDir, 'nvda-raw-historical-data.json'));
            
            // 6. 返回完成状态
            progressCallback && progressCallback({
                stock: this.symbol,
                step: `NVDA 历史基准计算完成，处理了 ${processedDays} 个交易日`,
                progress: 100
            });
            
            console.log(`成功处理了 ${processedDays} 个交易日的数据`);
            console.log(`总共收集了 ${Object.values(allIVData).reduce((sum, arr) => sum + arr.length, 0)} 个IV样本`);
            
            return {
                success: true,
                symbol: this.symbol,
                benchmarks: benchmarks,
                dataPoints: processedDays,
                analysisWindow: this.analysisWindow,
                calculatedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('计算 NVDA 历史基准失败:', error);
            progressCallback && progressCallback({
                type: 'error',
                stock: this.symbol,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * 从逐日数据计算基准统计数据
     * @param {Array} dailyData - 逐日HV/IV数据
     * @returns {Object} 基准统计数据
     */
    calculateBenchmarkStatistics(dailyData) {
        const benchmarks = {};
        
        // 按DTE区间分组收集所有比值
        const ratiosByRange = {};
        for (const rangeKey of Object.keys(this.dteRanges)) {
            ratiosByRange[rangeKey] = [];
        }
        
        // 收集所有有效的HV/IV比值
        dailyData.forEach(dayData => {
            for (const [rangeKey, ratio] of Object.entries(dayData.hvivRatios)) {
                if (ratio && !isNaN(ratio) && ratio > 0) {
                    ratiosByRange[rangeKey].push(ratio);
                }
            }
        });
        
        // 计算每个区间的统计数据
        for (const [rangeKey, ratios] of Object.entries(ratiosByRange)) {
            if (ratios.length > 0) {
                const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
                const variance = ratios.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / ratios.length;
                const stdDev = Math.sqrt(variance);
                
                benchmarks[rangeKey] = {
                    R_avg: parseFloat(avg.toFixed(4)),
                    R_std_dev: parseFloat(stdDev.toFixed(4)),
                    data_points: ratios.length,
                    min_ratio: Math.min(...ratios),
                    max_ratio: Math.max(...ratios)
                };
                
                console.log(`${rangeKey} 基准: 平均=${avg.toFixed(4)}, 标准差=${stdDev.toFixed(4)}, 数据点=${ratios.length}`);
            }
        }
        
        return benchmarks;
    }

    /**
     * 保存基准数据
     */
    async saveBenchmarkData(data, rawData) {
        try {
            await fs.writeFile(this.benchmarkFile, JSON.stringify(data, null, 2), 'utf8');
            console.log(`基准数据已保存到: ${this.benchmarkFile}`);
            
            // 保存原始数据
            if (rawData) {
                await this.saveRawData(rawData);
            }
        } catch (error) {
            console.error('保存基准数据失败:', error);
        }
    }

    /**
     * 加载基准数据
     */
    async loadBenchmarkData() {
        try {
            const data = await fs.readFile(this.benchmarkFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('未找到NVDA基准数据文件或读取失败:', error.message);
            return null;
        }
    }

    /**
     * 保存原始数据
     */
    async saveRawData(data) {
        try {
            await fs.writeFile(this.rawDataFile, JSON.stringify(data, null, 2), 'utf8');
            console.log(`原始数据已保存到: ${this.rawDataFile}`);
        } catch (error) {
            console.error('保存原始数据失败:', error);
        }
    }

    /**
     * 获取基准状态
     */
    async getBenchmarkStatus() {
        try {
            const data = await fs.readFile(this.benchmarkFile, 'utf8');
            const benchmarkData = JSON.parse(data);
            return {
                hasData: true,
                lastUpdated: benchmarkData.lastUpdated,
                dataPoints: benchmarkData.dataPoints,
                analysisWindow: benchmarkData.analysisWindow
            };
        } catch (error) {
            return {
                hasData: false,
                message: '尚未生成 NVDA 历史基准数据'
            };
        }
    }
}

module.exports = new NVDAHistoricalBenchmarkService();
