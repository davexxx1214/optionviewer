# -*- coding: utf-8 -*-
"""
数据库接口模块
用于从SQLite数据库读取历史股票和期权数据，供回测系统使用
"""

import sqlite3
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import os


class DatabaseInterface:
    """数据库接口类，用于回测系统访问历史数据"""
    
    def __init__(self, db_path: str = None):
        """
        初始化数据库接口
        
        Args:
            db_path (str): 数据库文件路径，默认使用项目根目录的database.db
        """
        if db_path is None:
            # 默认使用项目data目录的alphavantage_data.db
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(project_root, 'data', 'alphavantage_data.db')
        
        self.db_path = db_path
        self.connection = None
        
        # 检查数据库文件是否存在
        if not os.path.exists(self.db_path):
            print(f"⚠️ 数据库文件不存在: {self.db_path}")
            print("请确保已运行Node.js服务并获取了历史数据")
        else:
            print(f"✅ 连接到数据库: {self.db_path}")
    
    def _get_connection(self):
        """获取数据库连接"""
        if self.connection is None:
            self.connection = sqlite3.connect(self.db_path)
            self.connection.row_factory = sqlite3.Row  # 使结果可以按列名访问
        return self.connection
    
    def close(self):
        """关闭数据库连接"""
        if self.connection:
            self.connection.close()
            self.connection = None
    
    def get_stock_price_by_date(self, symbol: str, date: str) -> Optional[float]:
        """
        获取指定日期的股票收盘价
        
        Args:
            symbol (str): 股票代码
            date (str): 日期 (YYYY-MM-DD)
            
        Returns:
            float: 股票收盘价，如果没找到返回None
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # 查询指定日期的股价
            cursor.execute("""
                SELECT close FROM historical_stock_prices 
                WHERE symbol = ? AND date = ?
                ORDER BY date DESC LIMIT 1
            """, (symbol, date))
            
            result = cursor.fetchone()
            if result:
                return float(result['close'])
            
            # 如果没有找到精确日期，查找最近的交易日
            cursor.execute("""
                SELECT close, date FROM historical_stock_prices 
                WHERE symbol = ? AND date <= ?
                ORDER BY date DESC LIMIT 1
            """, (symbol, date))
            
            result = cursor.fetchone()
            if result:
                print(f"未找到{symbol}在{date}的数据，使用{result['date']}的价格: ${result['close']}")
                return float(result['close'])
            
            return None
            
        except Exception as e:
            print(f"获取{symbol}在{date}的股价失败: {e}")
            return None
    
    def get_stock_price_range(self, symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
        """
        获取指定日期范围的股票价格数据
        
        Args:
            symbol (str): 股票代码
            start_date (str): 开始日期 (YYYY-MM-DD)
            end_date (str): 结束日期 (YYYY-MM-DD)
            
        Returns:
            pd.DataFrame: 股票价格数据
        """
        try:
            conn = self._get_connection()
            
            query = """
                SELECT date, open, high, low, close, volume
                FROM historical_stock_prices 
                WHERE symbol = ? AND date >= ? AND date <= ?
                ORDER BY date
            """
            
            df = pd.read_sql_query(query, conn, params=(symbol, start_date, end_date))
            
            if not df.empty:
                df['date'] = pd.to_datetime(df['date'])
                df.set_index('date', inplace=True)
                df.columns = ['Open', 'High', 'Low', 'Close', 'Volume']
            
            return df
            
        except Exception as e:
            print(f"获取{symbol}价格范围数据失败: {e}")
            return pd.DataFrame()
    
    def get_options_by_date(self, symbol: str, date: str, option_type: str = 'call', 
                           min_dte: int = 15, max_dte: int = 45) -> List[Dict]:
        """
        获取指定日期的期权数据
        
        Args:
            symbol (str): 股票代码
            date (str): 数据日期 (YYYY-MM-DD)
            option_type (str): 期权类型 ('call' 或 'put')
            min_dte (int): 最小到期天数
            max_dte (int): 最大到期天数
            
        Returns:
            List[Dict]: 期权数据列表
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            query = """
                SELECT * FROM historical_options_data 
                WHERE symbol = ? AND data_date = ? AND option_type = ?
                AND days_to_expiry >= ? AND days_to_expiry <= ?
                AND bid > 0 AND ask > 0 AND volume > 0 AND open_interest > 0
                ORDER BY strike_price
            """
            
            cursor.execute(query, (symbol, date, option_type.lower(), min_dte, max_dte))
            rows = cursor.fetchall()
            
            options = []
            for row in rows:
                option_data = {
                    'symbol': row['symbol'],
                    'contractID': row['contract_id'],
                    'strikePrice': float(row['strike_price']),
                    'expiration': row['expiration_date'],
                    'daysToExpiry': int(row['days_to_expiry']),
                    'type': row['option_type'],
                    'bid': float(row['bid']) if row['bid'] else 0,
                    'ask': float(row['ask']) if row['ask'] else 0,
                    'lastPrice': float(row['last_price']) if row['last_price'] else 0,
                    'volume': int(row['volume']) if row['volume'] else 0,
                    'openInterest': int(row['open_interest']) if row['open_interest'] else 0,
                    'impliedVolatility': float(row['implied_volatility']) if row['implied_volatility'] else 0,
                    'delta': float(row['delta']) if row['delta'] else 0,
                    'gamma': float(row['gamma']) if row['gamma'] else 0,
                    'theta': float(row['theta']) if row['theta'] else 0,
                    'vega': float(row['vega']) if row['vega'] else 0,
                    'rho': float(row['rho']) if row['rho'] else 0,
                    'historicalVolatility': float(row['historical_volatility']) if row['historical_volatility'] else 0,
                    'hvPeriod': int(row['hv_period']) if row['hv_period'] else 30,
                    'leverageRatio': float(row['leverage_ratio']) if row['leverage_ratio'] else 0,
                    'exerciseProbability': float(row['exercise_probability']) if row['exercise_probability'] else 0,
                    'dataSource': 'database'
                }
                options.append(option_data)
            
            print(f"从数据库获取{symbol}在{date}的{option_type}期权: {len(options)}个")
            return options
            
        except Exception as e:
            print(f"获取{symbol}在{date}的期权数据失败: {e}")
            return []
    
    def get_available_dates(self, symbol: str, start_date: str = None, end_date: str = None) -> List[str]:
        """
        获取指定股票的可用数据日期
        
        Args:
            symbol (str): 股票代码
            start_date (str, optional): 开始日期
            end_date (str, optional): 结束日期
            
        Returns:
            List[str]: 可用日期列表
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            query = "SELECT DISTINCT data_date FROM historical_options_data WHERE symbol = ?"
            params = [symbol]
            
            if start_date:
                query += " AND data_date >= ?"
                params.append(start_date)
            
            if end_date:
                query += " AND data_date <= ?"
                params.append(end_date)
            
            query += " ORDER BY data_date"
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            return [row['data_date'] for row in rows]
            
        except Exception as e:
            print(f"获取{symbol}可用日期失败: {e}")
            return []
    
    def get_database_stats(self) -> Dict:
        """
        获取数据库统计信息
        
        Returns:
            Dict: 数据库统计信息
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            stats = {}
            
            # 股票价格数据统计
            cursor.execute("""
                SELECT symbol, COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date
                FROM historical_stock_prices 
                GROUP BY symbol
            """)
            stock_stats = cursor.fetchall()
            stats['stock_data'] = [dict(row) for row in stock_stats]
            
            # 期权数据统计
            cursor.execute("""
                SELECT symbol, COUNT(*) as count, MIN(data_date) as min_date, MAX(data_date) as max_date
                FROM historical_options_data 
                GROUP BY symbol
            """)
            option_stats = cursor.fetchall()
            stats['option_data'] = [dict(row) for row in option_stats]
            
            return stats
            
        except Exception as e:
            print(f"获取数据库统计信息失败: {e}")
            return {}
    
    def validate_backtest_data(self, symbol: str, start_date: str, end_date: str) -> Dict:
        """
        验证回测所需的数据完整性
        
        Args:
            symbol (str): 股票代码
            start_date (str): 开始日期
            end_date (str): 结束日期
            
        Returns:
            Dict: 验证结果
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # 检查股票价格数据
            cursor.execute("""
                SELECT COUNT(*) as count FROM historical_stock_prices 
                WHERE symbol = ? AND date >= ? AND date <= ?
            """, (symbol, start_date, end_date))
            stock_count = cursor.fetchone()['count']
            
            # 检查期权数据
            cursor.execute("""
                SELECT COUNT(*) as count FROM historical_options_data 
                WHERE symbol = ? AND data_date >= ? AND data_date <= ?
            """, (symbol, start_date, end_date))
            option_count = cursor.fetchone()['count']
            
            # 检查可用的交易日期
            cursor.execute("""
                SELECT DISTINCT data_date FROM historical_options_data 
                WHERE symbol = ? AND data_date >= ? AND data_date <= ?
                ORDER BY data_date
            """, (symbol, start_date, end_date))
            available_dates = [row['data_date'] for row in cursor.fetchall()]
            
            return {
                'symbol': symbol,
                'date_range': f"{start_date} to {end_date}",
                'stock_price_records': stock_count,
                'option_records': option_count,
                'available_trading_dates': len(available_dates),
                'trading_dates': available_dates[:10] if len(available_dates) > 10 else available_dates,  # 显示前10个日期
                'data_sufficient': stock_count > 0 and option_count > 0 and len(available_dates) > 0
            }
            
        except Exception as e:
            print(f"验证回测数据失败: {e}")
            return {'error': str(e), 'data_sufficient': False}


if __name__ == "__main__":
    """简单测试数据库接口"""
    print("🔍 测试数据库接口...")
    
    db = DatabaseInterface()
    
    # 获取数据库统计信息
    print("\n📊 数据库统计:")
    stats = db.get_database_stats()
    
    if stats.get('stock_data'):
        print("股票数据:")
        for stock in stats['stock_data']:
            print(f"  {stock['symbol']}: {stock['count']}条记录")
    
    if stats.get('option_data'):
        print("期权数据:")
        for option in stats['option_data']:
            print(f"  {option['symbol']}: {option['count']}条记录")
    
    # 测试NVDA数据
    print(f"\n🧪 测试NVDA数据:")
    stock_price = db.get_stock_price_by_date('NVDA', '2025-10-15')
    print(f"股价 (2025-10-15): ${stock_price}")
    
    options = db.get_options_by_date('NVDA', '2025-10-15', 'call', 15, 45)
    print(f"期权数据: {len(options)}个call期权")
    
    # 验证回测数据
    validation = db.validate_backtest_data('NVDA', '2025-10-01', '2025-10-31')
    print(f"\n✅ 回测数据验证:")
    print(f"数据充足: {validation.get('data_sufficient', False)}")
    print(f"可用交易日: {validation.get('available_trading_dates', 0)}")
    
    db.close()
    print("\n✅ 数据库接口测试完成")

