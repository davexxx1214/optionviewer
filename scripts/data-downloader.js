#!/usr/bin/env node

/**
 * 历史数据下载工具
 * 批量下载指定日期范围内的期权和股价数据
 */

const alphaVantageService = require('../services/alphavantage');
const database = require('../services/database');
const { stocksList } = require('../data/stocks-config');

async function showHelp() {
    console.log(`
📦 Alpha Vantage 历史数据下载工具

使用方法:
  node scripts/data-downloader.js <开始日期> <结束日期> [选项]

参数:
  开始日期     格式: YYYY-MM-DD (例: 2025-09-01)
  结束日期     格式: YYYY-MM-DD (例: 2025-09-20)

选项:
  --symbols <SYMBOL1,SYMBOL2>  指定股票代码(逗号分隔), 默认: NVDA,AAPL,TSLA
  --stock-only                 只下载股价数据
  --options-only              只下载期权数据
  --delay <ms>                 API调用间隔(毫秒), 默认: 1000 (75次/分钟限制)
  --help                       显示此帮助信息

示例:
  # 下载NVDA从9月1日到20日的所有数据
  node scripts/data-downloader.js 2025-09-01 2025-09-20

  # 下载多只股票的数据
  node scripts/data-downloader.js 2025-09-01 2025-09-20 --symbols NVDA,AAPL,TSLA,MSFT

  # 只下载股价数据
  node scripts/data-downloader.js 2025-09-01 2025-09-20 --stock-only

  # 只下载期权数据  
  node scripts/data-downloader.js 2025-09-01 2025-09-20 --options-only
    `);
}

/**
 * 生成日期范围内的交易日
 */
function getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        
        // 跳过周末 (0=周日, 6=周六)
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            dates.push(dateStr);
        }
        
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

/**
 * 下载股价数据
 */
async function downloadStockData(symbols, startDate, endDate, delay) {
    console.log(`\n📈 开始下载股价数据...`);
    console.log(`股票: ${symbols.join(', ')}`);
    console.log(`时间范围: ${startDate} ~ ${endDate}`);
    
    for (const symbol of symbols) {
        try {
            console.log(`\n🔄 处理 ${symbol} 股价数据...`);
            
            // 调用历史价格API，这会自动触发数据存储
            const prices = await alphaVantageService.getHistoricalPrices(symbol, 252); // 获取一年的数据
            console.log(`✅ ${symbol} 股价数据获取完成: ${prices.length} 条记录`);
            
            // API限制延迟
            if (symbols.indexOf(symbol) < symbols.length - 1) {
                console.log(`⏱️ 等待 ${delay}ms 避免API限制...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
        } catch (error) {
            console.error(`❌ ${symbol} 股价数据下载失败:`, error.message);
        }
    }
}

/**
 * 下载期权数据
 */
async function downloadOptionsData(symbols, dates, delay) {
    console.log(`\n📋 开始下载期权数据...`);
    console.log(`股票: ${symbols.join(', ')}`);
    console.log(`交易日数量: ${dates.length} 天`);
    
    let successCount = 0;
    let errorCount = 0;
    const totalRequests = symbols.length * dates.length;
    
    for (const symbol of symbols) {
        for (const date of dates) {
            try {
                const requestNum = symbols.indexOf(symbol) * dates.length + dates.indexOf(date) + 1;
                console.log(`\n🔄 [${requestNum}/${totalRequests}] 获取 ${symbol} ${date} 期权数据...`);
                
                // 调用期权API，传入指定日期
                const optionsData = await alphaVantageService.getOptionsData(symbol, true, date);
                
                if (optionsData && optionsData.length > 0) {
                    console.log(`✅ ${symbol} ${date}: ${optionsData.length} 条期权记录`);
                    successCount++;
                } else {
                    console.log(`⚠️ ${symbol} ${date}: 无期权数据`);
                }
                
                // API限制延迟
                if (requestNum < totalRequests) {
                    console.log(`⏱️ 等待 ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (error) {
                console.error(`❌ ${symbol} ${date} 期权数据下载失败:`, error.message);
                errorCount++;
                
                // 出错时也要延迟，避免过快重试
                if (symbols.indexOf(symbol) * dates.length + dates.indexOf(date) + 1 < totalRequests) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }
    
    console.log(`\n📊 期权数据下载完成: 成功 ${successCount}，失败 ${errorCount}`);
}

/**
 * 显示最终统计
 */
async function showFinalStats() {
    console.log(`\n📊 最终数据库统计:`);
    try {
        const stats = await database.getStats();
        console.log(`📈 历史股票价格记录: ${stats.historical_stock_prices_count || 0}`);
        console.log(`📋 历史期权记录: ${stats.historical_options_count || 0}`);
        console.log(`🏢 股票数量: ${stats.unique_stock_symbols || 0}`);
        console.log(`📅 期权数据覆盖天数: ${stats.unique_dates || 0}`);
        console.log(`📊 股票价格时间范围: ${stats.earliest_stock_date || 'N/A'} ~ ${stats.latest_stock_date || 'N/A'}`);
        console.log(`📋 期权数据时间范围: ${stats.earliest_option_date || 'N/A'} ~ ${stats.latest_option_date || 'N/A'}`);
    } catch (error) {
        console.error('❌ 获取统计信息失败:', error.message);
    }
}

/**
 * 解析命令行参数
 */
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help')) {
        return { showHelp: true };
    }
    
    if (args.length < 2) {
        throw new Error('请提供开始日期和结束日期');
    }
    
    const startDate = args[0];
    const endDate = args[1];
    
    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('日期格式错误，请使用 YYYY-MM-DD 格式');
    }
    
    // 验证日期有效性
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('无效的日期');
    }
    
    if (start > end) {
        throw new Error('开始日期不能晚于结束日期');
    }
    
    // 解析选项
    const config = {
        startDate,
        endDate,
        symbols: ['NVDA', 'AAPL', 'TSLA'], // 默认股票
        stockOnly: false,
        optionsOnly: false,
        delay: 1000 // 默认1秒延迟 (75 calls/min limit)
    };
    
    for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--symbols':
                if (i + 1 < args.length) {
                    config.symbols = args[i + 1].split(',').map(s => s.trim().toUpperCase());
                    i++;
                } else {
                    throw new Error('--symbols 需要提供股票代码');
                }
                break;
                
            case '--stock-only':
                config.stockOnly = true;
                break;
                
            case '--options-only':
                config.optionsOnly = true;
                break;
                
            case '--delay':
                if (i + 1 < args.length) {
                    config.delay = parseInt(args[i + 1]);
                    if (isNaN(config.delay) || config.delay < 1000) {
                        throw new Error('延迟时间必须大于等于1000毫秒');
                    }
                    i++;
                } else {
                    throw new Error('--delay 需要提供毫秒数');
                }
                break;
        }
    }
    
    // 验证股票代码
    const validSymbols = stocksList.map(s => s.symbol);
    const invalidSymbols = config.symbols.filter(s => !validSymbols.includes(s));
    if (invalidSymbols.length > 0) {
        console.warn(`⚠️ 以下股票代码可能无效: ${invalidSymbols.join(', ')}`);
    }
    
    return config;
}

/**
 * 主函数
 */
async function main() {
    console.log('🚀 Alpha Vantage 历史数据下载工具启动\n');
    
    try {
        const config = parseArgs();
        
        if (config.showHelp) {
            await showHelp();
            return;
        }
        
        console.log('📋 下载配置:');
        console.log(`  时间范围: ${config.startDate} ~ ${config.endDate}`);
        console.log(`  股票代码: ${config.symbols.join(', ')}`);
        console.log(`  API延迟: ${config.delay}ms`);
        console.log(`  下载模式: ${config.stockOnly ? '仅股价' : config.optionsOnly ? '仅期权' : '股价+期权'}`);
        
        // 生成交易日列表
        const dates = getDateRange(config.startDate, config.endDate);
        console.log(`  交易日数量: ${dates.length} 天`);
        
        // 估算时间
        let estimatedRequests = 0;
        if (!config.optionsOnly) estimatedRequests += config.symbols.length; // 股价请求
        if (!config.stockOnly) estimatedRequests += config.symbols.length * dates.length; // 期权请求
        
        const estimatedMinutes = Math.ceil((estimatedRequests * config.delay) / 60000);
        console.log(`  预计请求数: ${estimatedRequests}`);
        console.log(`  预计用时: ~${estimatedMinutes} 分钟\n`);
        
        // 确认继续
        console.log('⚠️ 注意: Alpha Vantage 免费版有 5 calls/min, 100 calls/day 限制');
        console.log('按 Ctrl+C 取消，或等待 5 秒后自动开始...\n');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const startTime = Date.now();
        
        // 下载股价数据
        if (!config.optionsOnly) {
            await downloadStockData(config.symbols, config.startDate, config.endDate, config.delay);
        }
        
        // 下载期权数据
        if (!config.stockOnly) {
            await downloadOptionsData(config.symbols, dates, config.delay);
        }
        
        const endTime = Date.now();
        const totalMinutes = Math.ceil((endTime - startTime) / 60000);
        
        console.log(`\n🎉 数据下载完成! 总用时: ${totalMinutes} 分钟`);
        
        // 显示最终统计
        await showFinalStats();
        
    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.log('\n使用 --help 查看使用说明');
        process.exit(1);
    }
    
    // 关闭数据库连接
    database.close();
    process.exit(0);
}

// 处理未捕获的异常
process.on('unhandledRejection', (error) => {
    console.error('❌ 未处理的Promise拒绝:', error);
    database.close();
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n👋 收到中断信号，正在关闭...');
    database.close();
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = { 
    getDateRange, 
    downloadStockData, 
    downloadOptionsData 
};
