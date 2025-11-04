# -*- coding: utf-8 -*-
"""
基于数据库的Covered Call策略回测
使用SQLite数据库中的历史数据进行回测，不调用任何API
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import sys
import os

# 添加当前目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_interface import DatabaseInterface
from option_pnl_attribution import OptionPnLAttribution, OptionContract
from option_scoring_interface import OptionScoringInterface


class DatabaseBacktestEngine:
    """基于数据库的回测引擎"""
    
    def __init__(self, db_path: str = None):
        """
        初始化回测引擎
        
        Args:
            db_path (str): 数据库路径
        """
        self.db = DatabaseInterface(db_path)
        self.scoring = OptionScoringInterface()
        
    def run_covered_call_backtest(self, symbol: str, start_date: str, end_date: str,
                                 initial_virtual_cash: float = 10000,
                                 min_dte: int = 15, max_dte: int = 45) -> dict:
        """
        运行Covered Call策略回测
        
        Args:
            symbol (str): 股票代码
            start_date (str): 开始日期 (YYYY-MM-DD)
            end_date (str): 结束日期 (YYYY-MM-DD)
            initial_virtual_cash (float): 期权部门初始资金
            min_dte (int): 最小到期天数
            max_dte (int): 最大到期天数
            
        Returns:
            dict: 回测结果
        """
        print(f"开始基于数据库的Covered Call回测")
        print(f"股票: {symbol}, 期间: {start_date} 到 {end_date}")
        print("="*60)
        
        # 验证数据可用性
        validation = self.db.validate_backtest_data(symbol, start_date, end_date)
        if not validation.get('data_sufficient', False):
            return {
                'success': False,
                'error': '数据不足',
                'validation': validation
            }
        
        print(f"✅ 数据验证通过:")
        print(f"   股价记录: {validation['stock_price_records']}")
        print(f"   期权记录: {validation['option_records']}")
        print(f"   可用交易日: {validation['available_trading_dates']}")
        
        # 获取初始股价
        initial_stock_price = self.db.get_stock_price_by_date(symbol, start_date)
        if not initial_stock_price:
            return {
                'success': False,
                'error': f'无法获取{symbol}在{start_date}的股价'
            }
        
        # 初始化期权损益计算器
        pnl_calculator = OptionPnLAttribution(initial_virtual_cash)
        pnl_calculator.add_position(symbol, stock_shares=100, stock_entry_price=initial_stock_price)
        
        # 获取可用的交易日期
        available_dates = self.db.get_available_dates(symbol, start_date, end_date)
        if not available_dates:
            return {
                'success': False,
                'error': '没有可用的交易日期'
            }
        
        print(f"回测期间共有 {len(available_dates)} 个交易日")
        
        # 执行回测
        current_option_expiry = None
        trades_executed = []
        
        for i, current_date in enumerate(available_dates):
            current_price = self.db.get_stock_price_by_date(symbol, current_date)
            if not current_price:
                continue
            
            print(f"\n[{i+1}/{len(available_dates)}] {current_date}: 股价 ${current_price:.2f}")
            
            # 检查当前期权是否到期
            if current_option_expiry and current_date >= current_option_expiry:
                result = pnl_calculator.process_option_expiry(
                    symbol=symbol,
                    expiry_date=current_option_expiry,
                    stock_price_at_expiry=current_price
                )
                
                if 'error' not in result:
                    print(f"   期权到期: {result['status']}, 损益=${result['option_pnl']:.2f}")
                    trades_executed.append({
                        'expiry_date': current_date,
                        'stock_price': current_price,
                        'result': result
                    })
                
                current_option_expiry = None
            
            # 如果没有当前期权，选择新期权
            if not current_option_expiry:
                best_option = self._find_best_option_from_db(
                    symbol, current_date, current_price, min_dte, max_dte
                )
                
                if best_option:
                    # 创建期权合约
                    option_contract = OptionContract(
                        symbol=symbol,
                        strike_price=best_option['strikePrice'],
                        expiry_date=best_option['expiration'],
                        premium=best_option['bid'],
                        ccas_score=best_option.get('ccas_score', 0)
                    )
                    
                    # 执行期权交易
                    premium_received = option_contract.total_premium
                    success = pnl_calculator.sell_call_option(
                        symbol=symbol,
                        entry_date=current_date,
                        contract=option_contract,
                        premium_received=premium_received
                    )
                    
                    if success:
                        current_option_expiry = best_option['expiration']
                        print(f"   卖出期权: Strike=${best_option['strikePrice']:.2f}, "
                              f"Premium=${best_option['bid']:.2f}, "
                              f"CCAS={best_option.get('ccas_score', 0):.0f}, "
                              f"到期={best_option['expiration']}")
                else:
                    print(f"   未找到合适的期权")
        
        # 处理最后未到期的期权
        if current_option_expiry:
            final_price = self.db.get_stock_price_by_date(symbol, end_date)
            if final_price:
                result = pnl_calculator.process_option_expiry(
                    symbol=symbol,
                    expiry_date=current_option_expiry,
                    stock_price_at_expiry=final_price
                )
                if 'error' not in result:
                    print(f"\n最终期权到期: {result['status']}, 损益=${result['option_pnl']:.2f}")
        
        # 计算最终结果
        final_pnl = pnl_calculator.calculate_option_department_pnl()
        stock_nominal_value = 100 * initial_stock_price
        annualized = pnl_calculator.calculate_annualized_return(
            start_date=start_date,
            end_date=end_date,
            reference_stock_value=stock_nominal_value
        )
        trades_df = pnl_calculator.export_trades_to_dataframe()
        
        return {
            'success': True,
            'symbol': symbol,
            'start_date': start_date,
            'end_date': end_date,
            'initial_stock_price': initial_stock_price,
            'stock_nominal_value': stock_nominal_value,
            'final_pnl': final_pnl,
            'annualized_return': annualized,
            'trades_df': trades_df,
            'trades_executed': trades_executed,
            'validation': validation
        }
    
    def _find_best_option_from_db(self, symbol: str, date: str, stock_price: float,
                                 min_dte: int, max_dte: int) -> dict:
        """
        从数据库中找到最佳期权
        
        Args:
            symbol (str): 股票代码
            date (str): 日期
            stock_price (float): 股价
            min_dte (int): 最小到期天数
            max_dte (int): 最大到期天数
            
        Returns:
            dict: 最佳期权，如果没有找到返回None
        """
        # 从数据库获取期权数据
        options = self.db.get_options_by_date(symbol, date, 'call', min_dte, max_dte)
        
        if not options:
            return None
        
        # 过滤和评分期权
        qualified_options = []
        
        for option in options:
            # 基本过滤条件
            if (option['bid'] <= 0 or option['ask'] <= 0 or 
                option['volume'] <= 10 or option['openInterest'] <= 100):
                continue
            
            # 检查行权价是否高于当前股价
            if option['strikePrice'] <= stock_price:
                continue
            
            # 计算CCAS评分
            ccas_result = self.scoring.simulate_ccas_scoring(
                symbol=symbol,
                stock_price=stock_price,
                strike_price=option['strikePrice'],
                dte=option['daysToExpiry'],
                bid_price=option['bid'],
                delta=option['delta']
            )
            
            if ccas_result['passed'] and ccas_result['score'] > 0:
                option['ccas_score'] = ccas_result['score']
                qualified_options.append(option)
        
        if not qualified_options:
            return None
        
        # 选择CCAS评分最高的期权
        best_option = max(qualified_options, key=lambda x: x['ccas_score'])
        return best_option
    
    def close(self):
        """关闭数据库连接"""
        if self.db:
            self.db.close()


if __name__ == "__main__":
    """运行简单的回测示例"""
    print("🔬 基于数据库的Covered Call策略回测")
    print("="*60)
    
    # 创建回测引擎
    engine = DatabaseBacktestEngine()
    
    # 检查数据库状态
    print("📊 检查数据库状态...")
    stats = engine.db.get_database_stats()
    
    if stats.get('stock_data'):
        for stock in stats['stock_data']:
            print(f"   股票 {stock['symbol']}: {stock['count']}条记录")
    
    if stats.get('option_data'):
        for option in stats['option_data']:
            print(f"   期权 {option['symbol']}: {option['count']}条记录")
    
    # 运行回测
    symbol = 'NVDA'
    start_date = '2025-09-01'
    end_date = '2025-10-15'
    
    print(f"\n🚀 开始回测 {symbol} ({start_date} 到 {end_date})...")
    
    result = engine.run_covered_call_backtest(
        symbol=symbol,
        start_date=start_date,
        end_date=end_date,
        initial_virtual_cash=10000,
        min_dte=15,
        max_dte=45
    )
    
    if result['success']:
        print("\n" + "="*60)
        print("📊 回测结果")
        print("="*60)
        
        print(f"\n基本信息:")
        print(f"股票代码: {result['symbol']}")
        print(f"回测期间: {result['start_date']} 到 {result['end_date']}")
        print(f"初始股价: ${result['initial_stock_price']:.2f}")
        
        final_pnl = result['final_pnl']
        annualized = result['annualized_return']
        
        print(f"\n📈 性能表现:")
        print(f"期权总损益: ${final_pnl['total_option_pnl']:.2f}")
        print(f"年化收益率: {annualized['annualized_return_percent']:.2f}%")
        print(f"期权交易次数: {final_pnl['total_trades']}")
        
        trades_df = result['trades_df']
        if not trades_df.empty:
            exercised_count = len(trades_df[trades_df['exit_reason'] == 'exercised'])
            expired_otm_count = len(trades_df[trades_df['exit_reason'] == 'expired_otm'])
            
            print(f"被行权次数: {exercised_count}")
            print(f"虚值到期次数: {expired_otm_count}")
            print(f"被行权率: {exercised_count/len(trades_df):.1%}" if len(trades_df) > 0 else "0%")
        
        print(f"\n🎯 策略评估:")
        annual_return = annualized['annualized_return_percent']
        if annual_return > 15:
            print("✅ 策略表现优秀! CCAS评分系统显示出优秀的期权选择能力。")
        elif annual_return > 8:
            print("⚠️ 策略表现良好，但仍有优化空间。")
        else:
            print("⚠️ 策略表现一般，建议调整参数。")
        
        print(f"\n💾 数据来源: SQLite数据库 (无API调用)")
        
    else:
        print(f"\n❌ 回测失败: {result.get('error', '未知错误')}")
    
    # 关闭数据库连接
    engine.close()
    print(f"\n✅ 回测完成!")


