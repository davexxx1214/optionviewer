# -*- coding: utf-8 -*-
"""
期权评分系统接口模块
用于将现有的JavaScript CCAS评分系统与Python回测系统集成
"""

import subprocess
import json
import pandas as pd
from datetime import datetime, timedelta
import yfinance as yf
from database_interface import DatabaseInterface


class OptionScoringInterface:
    """期权评分系统接口类"""
    
    def __init__(self, node_server_port=3000):
        """
        初始化期权评分接口
        
        Args:
            node_server_port (int): Node.js服务器端口
        """
        self.server_port = node_server_port
        self.base_url = f"http://localhost:{node_server_port}"
        
    def get_ccas_scores(self, symbol, stock_price, target_date=None):
        """
        获取指定股票的CCAS期权评分
        
        Args:
            symbol (str): 股票代码 (例如: 'NVDA')
            stock_price (float): 股票价格
            target_date (str, optional): 目标日期 (YYYY-MM-DD格式)
            
        Returns:
            list: 包含CCAS评分的期权列表
        """
        try:
            import requests
            
            # 构建API URL
            url = f"{self.base_url}/api/options/{symbol}?type=call"
            if target_date:
                url += f"&date={target_date}"
                
            response = requests.get(url, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success') and data.get('data'):
                    return data['data'].get('options', [])
            
            print(f"API调用失败: {response.status_code}")
            return []
            
        except Exception as e:
            print(f"获取CCAS评分失败: {e}")
            return []
    
    def get_best_call_option(self, symbol, stock_price, target_date=None):
        """
        获取CCAS评分最高的看涨期权
        
        Args:
            symbol (str): 股票代码
            stock_price (float): 股票价格
            target_date (str, optional): 目标日期
            
        Returns:
            dict: 最佳期权合约信息，如果没有找到则返回None
        """
        options = self.get_ccas_scores(symbol, stock_price, target_date)
        
        # 过滤出合格的看涨期权
        qualified_calls = [
            opt for opt in options 
            if (opt.get('type') == 'call' and 
                opt.get('isQualified', False) and
                opt.get('ccasScoring', {}).get('passed', False))
        ]
        
        if not qualified_calls:
            return None
            
        # 按CCAS评分排序，选择最高分
        best_option = max(qualified_calls, key=lambda x: x.get('ccasScoring', {}).get('score', 0))
        
        return best_option
    
    def simulate_ccas_scoring(self, symbol, stock_price, strike_price, dte, bid_price, delta):
        """
        模拟CCAS评分计算（当API不可用时使用）
        
        Args:
            symbol (str): 股票代码
            stock_price (float): 股票价格
            strike_price (float): 行权价
            dte (int): 到期天数
            bid_price (float): 买入价
            delta (float): Delta值
            
        Returns:
            dict: 模拟的CCAS评分结果
        """
        # 简化的CCAS评分计算
        # 步骤0: 利润缓冲检查
        potential_gain_ratio = (strike_price / stock_price) - 1
        min_buffer = 0.04 + ((dte - 8) / (29 - 8)) * (0.12 - 0.04) if 8 <= dte <= 29 else 0.08
        
        if potential_gain_ratio < min_buffer:
            return {
                'score': 0,
                'passed': False,
                'reason': '未通过利润缓冲要求'
            }
        
        # 步骤1: 权利金收益分
        annualized_yield = (bid_price / stock_price) * (365 / dte)
        yield_score = min(100, max(0, ((annualized_yield - 0.05) / (0.25 - 0.05)) * 100))
        
        # 步骤2: 安全边际分  
        safety_score = min(100, max(0, ((0.40 - delta) / (0.40 - 0.10)) * 100))
        
        # 步骤3: 最终CCAS评分
        ccas_score = int((yield_score * safety_score) ** 0.5)
        
        return {
            'score': ccas_score,
            'passed': True,
            'yield_score': yield_score,
            'safety_score': safety_score,
            'annualized_yield': annualized_yield * 100,
            'potential_gain_ratio': potential_gain_ratio * 100
        }


class HistoricalDataProvider:
    """历史数据提供器 - 从SQLite数据库获取数据"""
    
    def __init__(self, db_path: str = None):
        """
        初始化历史数据提供器
        
        Args:
            db_path (str): 数据库路径，默认使用项目根目录的database.db
        """
        self.db = DatabaseInterface(db_path)
        self.cache = {}
    
    def get_stock_data(self, symbol, start_date, end_date):
        """
        从数据库获取股票历史数据
        
        Args:
            symbol (str): 股票代码
            start_date (str): 开始日期 (YYYY-MM-DD)
            end_date (str): 结束日期 (YYYY-MM-DD)
            
        Returns:
            pd.DataFrame: 股票价格数据
        """
        cache_key = f"{symbol}_{start_date}_{end_date}"
        
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            data = self.db.get_stock_price_range(symbol, start_date, end_date)
            
            if not data.empty:
                self.cache[cache_key] = data
                print(f"从数据库获取{symbol}股价数据: {len(data)}条记录")
                return data
            else:
                print(f"数据库中未找到{symbol}在{start_date}到{end_date}的股价数据")
            
        except Exception as e:
            print(f"从数据库获取{symbol}历史数据失败: {e}")
        
        return pd.DataFrame()
    
    def get_stock_price_on_date(self, symbol, target_date):
        """
        从数据库获取指定日期的股票收盘价
        
        Args:
            symbol (str): 股票代码  
            target_date (str): 目标日期 (YYYY-MM-DD)
            
        Returns:
            float: 股票收盘价，如果获取失败返回None
        """
        try:
            price = self.db.get_stock_price_by_date(symbol, target_date)
            if price:
                print(f"从数据库获取{symbol}在{target_date}的股价: ${price:.2f}")
            return price
        except Exception as e:
            print(f"从数据库获取{symbol}在{target_date}的股价失败: {e}")
            return None
    
    def get_options_data(self, symbol, target_date, option_type='call', min_dte=15, max_dte=45):
        """
        从数据库获取期权数据
        
        Args:
            symbol (str): 股票代码
            target_date (str): 目标日期 (YYYY-MM-DD)
            option_type (str): 期权类型
            min_dte (int): 最小到期天数
            max_dte (int): 最大到期天数
            
        Returns:
            List[Dict]: 期权数据列表
        """
        try:
            options = self.db.get_options_by_date(symbol, target_date, option_type, min_dte, max_dte)
            if options:
                print(f"从数据库获取{symbol}在{target_date}的{option_type}期权: {len(options)}个")
            return options
        except Exception as e:
            print(f"从数据库获取{symbol}期权数据失败: {e}")
            return []
    
    def validate_data_availability(self, symbol, start_date, end_date):
        """
        验证数据可用性
        
        Args:
            symbol (str): 股票代码
            start_date (str): 开始日期
            end_date (str): 结束日期
            
        Returns:
            Dict: 验证结果
        """
        return self.db.validate_backtest_data(symbol, start_date, end_date)
    
    def close(self):
        """关闭数据库连接"""
        if self.db:
            self.db.close()


def test_scoring_interface():
    """测试期权评分接口"""
    print("测试期权评分系统接口...")
    
    # 创建接口实例
    scoring = OptionScoringInterface()
    data_provider = HistoricalDataProvider()
    
    # 测试历史数据获取
    print("\n测试历史数据获取:")
    nvda_price = data_provider.get_stock_price_on_date('NVDA', '2024-01-15')
    print(f"NVDA在2024-01-15的收盘价: ${nvda_price}")
    
    # 测试CCAS评分模拟
    print("\n测试CCAS评分模拟:")
    if nvda_price:
        result = scoring.simulate_ccas_scoring(
            symbol='NVDA',
            stock_price=nvda_price,
            strike_price=nvda_price * 1.05,  # 行权价比现价高5%
            dte=30,  # 30天到期
            bid_price=3.50,  # 假设买入价
            delta=0.25  # 假设Delta值
        )
        print(f"CCAS评分结果: {result}")
    
    print("接口测试完成")


if __name__ == "__main__":
    test_scoring_interface()
