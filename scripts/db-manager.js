#!/usr/bin/env node

/**
 * 数据库管理CLI工具
 * 用于查看和管理Alpha Vantage数据
 */

const database = require('../services/database');
const alphaVantageService = require('../services/alphavantage');

async function showHelp() {
    console.log(`
📊 Alpha Vantage 数据库管理工具

使用方法:
  node scripts/db-manager.js <命令> [参数]

命令:
  stats                           - 显示数据库统计信息
  stock-prices <SYMBOL>           - 查看历史股票价格数据 (TIME_SERIES_DAILY_ADJUSTED)
  options <SYMBOL> [DATE]         - 查看历史期权数据 (HISTORICAL_OPTIONS)
  clear-stock-prices              - 清空历史股票价格表
  clear-options                   - 清空历史期权数据表  
  clear-all                       - 清空所有数据表

示例:
  node scripts/db-manager.js stats
  node scripts/db-manager.js stock-prices NVDA
  node scripts/db-manager.js options NVDA
  node scripts/db-manager.js options NVDA 2024-01-15
    `);
}

async function showStats() {
    try {
        console.log('📊 获取数据库统计信息...\n');
        
        const stats = await database.getStats();
        
        console.log('=== 数据库统计信息 ===');
        console.log(`📈 历史股票价格记录数: ${stats.historical_stock_prices_count || 0} (TIME_SERIES_DAILY_ADJUSTED)`);
        console.log(`📋 历史期权记录数: ${stats.historical_options_count || 0} (HISTORICAL_OPTIONS)`);
        console.log(`🏢 有股票价格数据的股票数: ${stats.unique_stock_symbols || 0}`);
        console.log(`📈 有期权数据的股票数: ${stats.unique_option_symbols || 0}`);
        console.log(`📅 期权数据覆盖天数: ${stats.unique_dates || 0}`);
        console.log(`📊 股票价格数据时间范围: ${stats.earliest_stock_date || 'N/A'} ~ ${stats.latest_stock_date || 'N/A'}`);
        console.log(`📋 期权数据时间范围: ${stats.earliest_option_date || 'N/A'} ~ ${stats.latest_option_date || 'N/A'}`);
        
    } catch (error) {
        console.error('❌ 获取统计信息失败:', error.message);
    }
}

async function showStockPrices(symbol) {
    try {
        console.log(`📈 查询 ${symbol} 的历史股票价格数据 (TIME_SERIES_DAILY_ADJUSTED)...\n`);
        
        const prices = await database.getHistoricalStockPrices(symbol, null, null, 10);
        
        if (prices.length === 0) {
            console.log(`❌ 未找到 ${symbol} 的历史价格数据`);
            return;
        }
        
        console.log(`=== ${symbol} 最近 ${prices.length} 条历史价格记录 ===`);
        console.log('日期\t\t开盘\t收盘\t调整收盘\t最高\t最低\t成交量');
        console.log('-'.repeat(90));
        
        prices.forEach(price => {
            console.log(`${price.date}\t${price.open}\t${price.close}\t${price.adjusted_close}\t${price.high}\t${price.low}\t${price.volume}`);
        });
        
    } catch (error) {
        console.error('❌ 查询历史股票价格失败:', error.message);
    }
}

async function showOptions(symbol, date = null) {
    try {
        if (date) {
            console.log(`📋 查询 ${symbol} 在 ${date} 的历史期权数据 (HISTORICAL_OPTIONS)...\n`);
            
            const options = await database.getOptionsByDate(symbol, date);
            
            if (options.length === 0) {
                console.log(`❌ 未找到 ${symbol} 在 ${date} 的期权数据`);
                return;
            }
            
            console.log(`=== ${symbol} 在 ${date} 的 ${options.length} 条期权记录 ===`);
        } else {
            console.log(`📋 查询 ${symbol} 的历史期权数据 (HISTORICAL_OPTIONS)...\n`);
            
            const options = await database.getHistoricalOptionsData(symbol, null, null, null, 10);
            
            if (options.length === 0) {
                console.log(`❌ 未找到 ${symbol} 的历史期权数据`);
                return;
            }
            
            console.log(`=== ${symbol} 最近 ${options.length} 条历史期权记录 ===`);
        }
        
        console.log('数据日期\t到期日\t\t行权价\t类型\t权利金\tIV\t\t距到期天数');
        console.log('-'.repeat(100));
        
        const options = date ? 
            await database.getOptionsByDate(symbol, date) : 
            await database.getHistoricalOptionsData(symbol, null, null, null, 10);
            
        options.forEach(option => {
            const iv = option.implied_volatility ? (option.implied_volatility * 100).toFixed(2) + '%' : 'N/A';
            console.log(`${option.data_date}\t${option.expiration_date}\t${option.strike_price}\t${option.option_type}\t${option.mark_price}\t${iv}\t\t${option.days_to_expiry}`);
        });
        
    } catch (error) {
        console.error('❌ 查询历史期权数据失败:', error.message);
    }
}

// HV数据不再单独存储，而是从历史价格数据实时计算

async function clearTable(tableName) {
    try {
        console.log(`🗑️ 清空表 ${tableName}...`);
        
        await database.clearTable(tableName);
        console.log(`✅ 表 ${tableName} 已清空`);
        
    } catch (error) {
        console.error(`❌ 清空表 ${tableName} 失败:`, error.message);
    }
}

async function clearAllTables() {
    try {
        console.log('🗑️ 清空所有数据表...');
        
        const tables = ['historical_stock_prices', 'historical_options_data'];
        
        for (const table of tables) {
            await database.clearTable(table);
        }
        
        console.log('✅ 所有数据表已清空');
        
    } catch (error) {
        console.error('❌ 清空数据表失败:', error.message);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        await showHelp();
        process.exit(0);
    }
    
    const command = args[0];
    
    try {
        switch (command) {
            case 'stats':
                await showStats();
                break;
                
            case 'stock-prices':
                if (args.length < 2) {
                    console.error('❌ 请提供股票代码');
                    process.exit(1);
                }
                await showStockPrices(args[1].toUpperCase());
                break;
                
            case 'options':
                if (args.length < 2) {
                    console.error('❌ 请提供股票代码');
                    process.exit(1);
                }
                const date = args[2] || null; // 可选的日期参数
                await showOptions(args[1].toUpperCase(), date);
                break;
                
            case 'clear-stock-prices':
                await clearTable('historical_stock_prices');
                break;
                
            case 'clear-options':
                await clearTable('historical_options_data');
                break;
                
            case 'clear-all':
                await clearAllTables();
                break;
                
            default:
                console.error(`❌ 未知命令: ${command}`);
                await showHelp();
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ 执行命令失败:', error.message);
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
    console.log('\n👋 收到中断信号，正在关闭数据库连接...');
    database.close();
    process.exit(0);
});

if (require.main === module) {
    main();
}
