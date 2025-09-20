const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/alphavantage_data.db');
        this.db = null;
        this.initDatabase();
    }

    /**
     * 初始化数据库连接和表结构
     */
    async initDatabase() {
        try {
            // 确保data目录存在
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('数据库连接失败:', err.message);
                } else {
                    console.log('✅ SQLite数据库连接成功:', this.dbPath);
                    this.createTables();
                }
            });
        } catch (error) {
            console.error('初始化数据库失败:', error.message);
        }
    }

    /**
     * 创建核心数据表（只保存TIME_SERIES_DAILY_ADJUSTED和HISTORICAL_OPTIONS）
     */
    createTables() {
        const tables = [
            this.createHistoricalStockPricesTable(),
            this.createOptionsDataTable()
        ];

        tables.forEach(sql => {
            this.db.run(sql, (err) => {
                if (err) {
                    console.error('创建表失败:', err.message);
                } else {
                    console.log('✅ 数据表创建成功');
                }
            });
        });
    }

    /**
     * 历史股票价格表 - 专门存储TIME_SERIES_DAILY_ADJUSTED数据，用于回测
     */
    createHistoricalStockPricesTable() {
        return `
            CREATE TABLE IF NOT EXISTS historical_stock_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                adjusted_close REAL NOT NULL,
                volume INTEGER NOT NULL,
                dividend_amount REAL DEFAULT 0,
                split_coefficient REAL DEFAULT 1,
                data_source TEXT DEFAULT 'TIME_SERIES_DAILY_ADJUSTED',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(symbol, date)
            );
            
            CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_date 
            ON historical_stock_prices(symbol, date);
            
            CREATE INDEX IF NOT EXISTS idx_historical_prices_date 
            ON historical_stock_prices(date);
        `;
    }

    /**
     * 期权数据表 - 专门存储HISTORICAL_OPTIONS数据，用于回测
     */
    createOptionsDataTable() {
        return `
            CREATE TABLE IF NOT EXISTS historical_options_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                data_date TEXT NOT NULL,
                expiration_date TEXT NOT NULL,
                strike_price REAL NOT NULL,
                option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
                last_price REAL,
                mark_price REAL,
                bid REAL NOT NULL,
                ask REAL NOT NULL,
                bid_size INTEGER DEFAULT 0,
                ask_size INTEGER DEFAULT 0,
                volume INTEGER DEFAULT 0,
                open_interest INTEGER DEFAULT 0,
                implied_volatility REAL,
                delta REAL,
                gamma REAL,
                theta REAL,
                vega REAL,
                rho REAL,
                days_to_expiry INTEGER,
                historical_volatility REAL,
                hv_period INTEGER,
                leverage_ratio REAL,
                exercise_probability REAL,
                data_source TEXT DEFAULT 'HISTORICAL_OPTIONS',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(contract_id, data_date)
            );
            
            CREATE INDEX IF NOT EXISTS idx_options_symbol_date 
            ON historical_options_data(symbol, data_date);
            
            CREATE INDEX IF NOT EXISTS idx_options_expiration 
            ON historical_options_data(symbol, expiration_date);
            
            CREATE INDEX IF NOT EXISTS idx_options_date_type 
            ON historical_options_data(data_date, option_type);
        `;
    }

    // 删除了HV表和API调用表，因为：
    // 1. HV可以从历史价格数据实时计算
    // 2. API调用记录对回测不重要，简化数据库结构

    /**
     * 插入历史股票价格数据（TIME_SERIES_DAILY_ADJUSTED）
     */
    async insertHistoricalStockPrice(priceData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO historical_stock_prices 
                (symbol, date, open, high, low, close, adjusted_close, volume, dividend_amount, split_coefficient)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                priceData.symbol,
                priceData.date,
                priceData.open,
                priceData.high,
                priceData.low,
                priceData.close,
                priceData.adjusted_close || priceData.adjustedClose,
                priceData.volume,
                priceData.dividend_amount || 0,
                priceData.split_coefficient || 1
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('插入历史股票价格数据失败:', err.message);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    /**
     * 批量插入历史股票价格数据（TIME_SERIES_DAILY_ADJUSTED）
     */
    async insertBatchHistoricalStockPrices(pricesArray) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO historical_stock_prices 
                (symbol, date, open, high, low, close, adjusted_close, volume, dividend_amount, split_coefficient)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const stmt = this.db.prepare(sql);
            let successCount = 0;
            let errorCount = 0;

            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION");
                
                pricesArray.forEach(priceData => {
                    const params = [
                        priceData.symbol,
                        priceData.date,
                        priceData.open,
                        priceData.high,
                        priceData.low,
                        priceData.close,
                        priceData.adjusted_close || priceData.adjustedClose,
                        priceData.volume,
                        priceData.dividend_amount || 0,
                        priceData.split_coefficient || 1
                    ];

                    stmt.run(params, (err) => {
                        if (err) {
                            console.error('插入历史股票价格失败:', err.message);
                            errorCount++;
                        } else {
                            successCount++;
                        }
                    });
                });

                this.db.run("COMMIT", (err) => {
                    stmt.finalize();
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`✅ 批量插入历史股票价格数据完成: 成功 ${successCount}，失败 ${errorCount}`);
                        resolve({ successCount, errorCount });
                    }
                });
            });
        });
    }

    /**
     * 插入历史期权数据（HISTORICAL_OPTIONS）
     */
    async insertHistoricalOptionData(optionData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO historical_options_data 
                (contract_id, symbol, data_date, expiration_date, strike_price, option_type, 
                 last_price, mark_price, bid, ask, bid_size, ask_size, volume, open_interest, 
                 implied_volatility, delta, gamma, theta, vega, rho, days_to_expiry, 
                 historical_volatility, hv_period, leverage_ratio, exercise_probability)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                optionData.contractID || optionData.contract_id,
                optionData.symbol,
                optionData.date || optionData.data_date || new Date().toISOString().split('T')[0],
                optionData.expiration || optionData.expiration_date,
                optionData.strikePrice || optionData.strike_price,
                optionData.type || optionData.option_type,
                optionData.lastPrice || optionData.last_price,
                optionData.premium || optionData.mark || optionData.mark_price,
                optionData.bid,
                optionData.ask,
                optionData.bidSize || optionData.bid_size || 0,
                optionData.askSize || optionData.ask_size || 0,
                optionData.volume || 0,
                optionData.openInterest || optionData.open_interest || 0,
                optionData.impliedVolatility || optionData.implied_volatility,
                optionData.delta,
                optionData.gamma,
                optionData.theta,
                optionData.vega,
                optionData.rho,
                optionData.daysToExpiry || optionData.days_to_expiry,
                optionData.historicalVolatility || optionData.historical_volatility,
                optionData.hvPeriod || optionData.hv_period,
                optionData.leverageRatio || optionData.leverage_ratio,
                optionData.exerciseProbability || optionData.exercise_probability
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('插入历史期权数据失败:', err.message);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    /**
     * 批量插入历史期权数据（HISTORICAL_OPTIONS）
     */
    async insertBatchHistoricalOptionsData(optionsArray) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO historical_options_data 
                (contract_id, symbol, data_date, expiration_date, strike_price, option_type, 
                 last_price, mark_price, bid, ask, bid_size, ask_size, volume, open_interest, 
                 implied_volatility, delta, gamma, theta, vega, rho, days_to_expiry, 
                 historical_volatility, hv_period, leverage_ratio, exercise_probability)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const stmt = this.db.prepare(sql);
            let successCount = 0;
            let errorCount = 0;

            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION");
                
                optionsArray.forEach(optionData => {
                    const params = [
                        optionData.contractID || optionData.contract_id,
                        optionData.symbol,
                        optionData.date || optionData.data_date || new Date().toISOString().split('T')[0],
                        optionData.expiration || optionData.expiration_date,
                        optionData.strikePrice || optionData.strike_price,
                        optionData.type || optionData.option_type,
                        optionData.lastPrice || optionData.last_price,
                        optionData.premium || optionData.mark || optionData.mark_price,
                        optionData.bid,
                        optionData.ask,
                        optionData.bidSize || optionData.bid_size || 0,
                        optionData.askSize || optionData.ask_size || 0,
                        optionData.volume || 0,
                        optionData.openInterest || optionData.open_interest || 0,
                        optionData.impliedVolatility || optionData.implied_volatility,
                        optionData.delta,
                        optionData.gamma,
                        optionData.theta,
                        optionData.vega,
                        optionData.rho,
                        optionData.daysToExpiry || optionData.days_to_expiry,
                        optionData.historicalVolatility || optionData.historical_volatility,
                        optionData.hvPeriod || optionData.hv_period,
                        optionData.leverageRatio || optionData.leverage_ratio,
                        optionData.exerciseProbability || optionData.exercise_probability
                    ];

                    stmt.run(params, (err) => {
                        if (err) {
                            console.error('插入历史期权数据失败:', err.message);
                            errorCount++;
                        } else {
                            successCount++;
                        }
                    });
                });

                this.db.run("COMMIT", (err) => {
                    stmt.finalize();
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`✅ 批量插入历史期权数据完成: 成功 ${successCount}，失败 ${errorCount}`);
                        resolve({ successCount, errorCount });
                    }
                });
            });
        });
    }

    // 删除了HV和API调用相关的插入方法，专注于核心的历史数据存储

    /**
     * 查询历史股票价格数据（用于回测）
     */
    async getHistoricalStockPrices(symbol, startDate = null, endDate = null, limit = 1000) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT * FROM historical_stock_prices 
                WHERE symbol = ?
            `;
            const params = [symbol];

            if (startDate) {
                sql += ` AND date >= ?`;
                params.push(startDate);
            }

            if (endDate) {
                sql += ` AND date <= ?`;
                params.push(endDate);
            }

            sql += ` ORDER BY date DESC LIMIT ?`;
            params.push(limit);

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('查询历史股票价格失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * 查询特定日期的股票价格（用于回测）
     */
    async getStockPriceByDate(symbol, date) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM historical_stock_prices 
                WHERE symbol = ? AND date = ?
            `;
            
            this.db.get(sql, [symbol, date], (err, row) => {
                if (err) {
                    console.error('查询指定日期股票价格失败:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * 查询历史期权数据（用于回测）
     */
    async getHistoricalOptionsData(symbol, dataDate = null, expirationDate = null, optionType = null, limit = 1000) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT * FROM historical_options_data 
                WHERE symbol = ?
            `;
            const params = [symbol];

            if (dataDate) {
                sql += ` AND data_date = ?`;
                params.push(dataDate);
            }

            if (expirationDate) {
                sql += ` AND expiration_date = ?`;
                params.push(expirationDate);
            }

            if (optionType) {
                sql += ` AND option_type = ?`;
                params.push(optionType.toLowerCase());
            }

            sql += ` ORDER BY data_date DESC, expiration_date, strike_price LIMIT ?`;
            params.push(limit);

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('查询历史期权数据失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * 查询特定日期的期权数据（用于回测）
     */
    async getOptionsByDate(symbol, date, optionType = null) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT * FROM historical_options_data 
                WHERE symbol = ? AND data_date = ?
            `;
            const params = [symbol, date];

            if (optionType) {
                sql += ` AND option_type = ?`;
                params.push(optionType.toLowerCase());
            }

            sql += ` ORDER BY expiration_date, strike_price`;

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('查询指定日期期权数据失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * 获取数据库统计信息（仅包含核心历史数据）
     */
    async getStats() {
        return new Promise((resolve, reject) => {
            const sqls = [
                "SELECT COUNT(*) as historical_stock_prices_count FROM historical_stock_prices",
                "SELECT COUNT(*) as historical_options_count FROM historical_options_data", 
                "SELECT COUNT(DISTINCT symbol) as unique_stock_symbols FROM historical_stock_prices",
                "SELECT COUNT(DISTINCT symbol) as unique_option_symbols FROM historical_options_data",
                "SELECT COUNT(DISTINCT data_date) as unique_dates FROM historical_options_data",
                "SELECT MIN(date) as earliest_stock_date, MAX(date) as latest_stock_date FROM historical_stock_prices",
                "SELECT MIN(data_date) as earliest_option_date, MAX(data_date) as latest_option_date FROM historical_options_data"
            ];

            const stats = {};
            let completed = 0;

            sqls.forEach((sql, index) => {
                this.db.get(sql, (err, row) => {
                    if (err) {
                        console.error('获取统计信息失败:', err.message);
                    } else {
                        Object.assign(stats, row);
                    }
                    
                    completed++;
                    if (completed === sqls.length) {
                        resolve(stats);
                    }
                });
            });
        });
    }

    /**
     * 清空指定表的数据
     */
    async clearTable(tableName) {
        // 只允许清空我们定义的核心表
        const allowedTables = ['historical_stock_prices', 'historical_options_data'];
        if (!allowedTables.includes(tableName)) {
            throw new Error(`不允许清空表: ${tableName}`);
        }

        return new Promise((resolve, reject) => {
            const sql = `DELETE FROM ${tableName}`;
            this.db.run(sql, (err) => {
                if (err) {
                    console.error(`清空表 ${tableName} 失败:`, err.message);
                    reject(err);
                } else {
                    console.log(`✅ 表 ${tableName} 已清空`);
                    resolve();
                }
            });
        });
    }

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('关闭数据库失败:', err.message);
                } else {
                    console.log('✅ 数据库连接已关闭');
                }
            });
        }
    }
}

module.exports = new DatabaseService();
