# -*- coding: utf-8 -*-
"""
期权损益归因分离计算模块
实现将股票持有部门和期权交易部门的损益分离计算
专注于评估期权交易策略的有效性
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List, Optional, Dict, Tuple


@dataclass
class OptionContract:
    """期权合约数据类"""
    symbol: str                 # 股票代码
    strike_price: float         # 行权价
    expiry_date: str           # 到期日期 (YYYY-MM-DD)
    premium: float             # 权利金 (每股)
    contract_size: int = 100   # 合约大小 (标准为100股)
    option_type: str = 'call'  # 期权类型
    ccas_score: float = 0.0    # CCAS评分
    
    @property
    def total_premium(self) -> float:
        """总权利金收入"""
        return self.premium * self.contract_size
    
    @property
    def days_to_expiry(self) -> int:
        """距离到期的天数"""
        expiry = datetime.strptime(self.expiry_date, '%Y-%m-%d')
        today = datetime.now()
        return max(0, (expiry - today).days)


@dataclass
class OptionTrade:
    """期权交易记录"""
    entry_date: str            # 入场日期
    contract: OptionContract   # 期权合约
    action: str               # 动作: 'sell' (卖出看涨期权)
    premium_received: float   # 收到的权利金
    exit_date: Optional[str] = None       # 出场日期
    exit_reason: str = 'pending'         # 出场原因: 'expired_otm', 'exercised', 'closed'
    exercise_cost: float = 0.0           # 被行权时的成本


@dataclass 
class CoveredCallPosition:
    """备兑看涨期权头寸"""
    stock_symbol: str          # 股票代码
    stock_shares: int = 100    # 持有股数
    stock_entry_price: float = 0.0    # 股票买入价格（用于参考）
    current_option: Optional[OptionTrade] = None  # 当前期权交易
    option_trades_history: Optional[List[OptionTrade]] = None  # 历史期权交易记录
    
    def __post_init__(self):
        if self.option_trades_history is None:
            self.option_trades_history = []


class OptionPnLAttribution:
    """期权损益归因分离计算器"""
    
    def __init__(self, initial_virtual_cash: float = 10000.0):
        """
        初始化损益归因计算器
        
        Args:
            initial_virtual_cash (float): 虚拟初始现金，用于计算期权部门收益率
        """
        self.initial_virtual_cash = initial_virtual_cash
        self.positions: Dict[str, CoveredCallPosition] = {}
        self.option_pnl_records: List[Dict] = []
        
    def add_position(self, symbol: str, stock_shares: int = 100, stock_entry_price: float = 0.0):
        """
        添加股票持仓（用于期权担保）
        
        Args:
            symbol (str): 股票代码
            stock_shares (int): 股票数量
            stock_entry_price (float): 股票买入价格（仅用于参考）
        """
        self.positions[symbol] = CoveredCallPosition(
            stock_symbol=symbol,
            stock_shares=stock_shares,
            stock_entry_price=stock_entry_price
        )
        print(f"添加{symbol}持仓: {stock_shares}股 @ ${stock_entry_price:.2f}")
    
    def sell_call_option(self, symbol: str, entry_date: str, contract: OptionContract, 
                        premium_received: float) -> bool:
        """
        卖出看涨期权
        
        Args:
            symbol (str): 股票代码
            entry_date (str): 交易日期
            contract (OptionContract): 期权合约
            premium_received (float): 实际收到的权利金
            
        Returns:
            bool: 是否成功执行交易
        """
        if symbol not in self.positions:
            print(f"错误: 没有{symbol}的股票持仓来担保期权")
            return False
            
        position = self.positions[symbol]
        
        # 检查是否已有未平仓的期权
        if position.current_option and position.current_option.exit_date is None:
            print(f"警告: {symbol}已有未平仓期权，需要先平仓")
            return False
        
        # 创建新的期权交易
        new_trade = OptionTrade(
            entry_date=entry_date,
            contract=contract,
            action='sell',
            premium_received=premium_received
        )
        
        position.current_option = new_trade
        position.option_trades_history.append(new_trade)
        
        # 记录期权部门P&L: 收到权利金为正收益
        self._record_option_pnl(
            date=entry_date,
            symbol=symbol,
            trade_type='option_entry',
            premium_income=premium_received,
            description=f"卖出{contract.expiry_date}到期 ${contract.strike_price}看涨期权"
        )
        
        print(f"成功卖出{symbol} Call期权: Strike=${contract.strike_price}, Premium=${premium_received:.2f}")
        return True
    
    def process_option_expiry(self, symbol: str, expiry_date: str, stock_price_at_expiry: float) -> Dict:
        """
        处理期权到期
        
        Args:
            symbol (str): 股票代码
            expiry_date (str): 到期日期
            stock_price_at_expiry (float): 到期时股票价格
            
        Returns:
            Dict: 期权到期处理结果
        """
        if symbol not in self.positions:
            return {'error': f'没有{symbol}的持仓'}
            
        position = self.positions[symbol]
        current_option = position.current_option
        
        if not current_option or current_option.exit_date is not None:
            return {'error': f'{symbol}没有未平仓的期权'}
            
        if current_option.contract.expiry_date != expiry_date:
            return {'error': f'期权到期日期不匹配'}
        
        strike_price = current_option.contract.strike_price
        premium_received = current_option.premium_received
        
        # 判断期权是否被行权
        if stock_price_at_expiry > strike_price:
            # 期权被行权
            exercise_cost = (stock_price_at_expiry - strike_price) * current_option.contract.contract_size
            current_option.exit_date = expiry_date
            current_option.exit_reason = 'exercised'
            current_option.exercise_cost = exercise_cost
            
            # 期权部门P&L: 权利金收入 - 行权成本
            option_pnl = premium_received - exercise_cost
            
            self._record_option_pnl(
                date=expiry_date,
                symbol=symbol,
                trade_type='option_exercise',
                premium_income=-exercise_cost,  # 负值表示成本
                description=f"期权被行权 Stock=${stock_price_at_expiry:.2f} > Strike=${strike_price:.2f}"
            )
            
            result = {
                'status': 'exercised',
                'option_pnl': option_pnl,
                'premium_received': premium_received,
                'exercise_cost': exercise_cost,
                'stock_price': stock_price_at_expiry,
                'strike_price': strike_price
            }
            
        else:
            # 期权到期虚值
            current_option.exit_date = expiry_date
            current_option.exit_reason = 'expired_otm'
            
            # 期权部门P&L: 权利金收入全部获得
            option_pnl = premium_received
            
            self._record_option_pnl(
                date=expiry_date,
                symbol=symbol,
                trade_type='option_expiry',
                premium_income=0,  # 没有额外收入或成本
                description=f"期权到期虚值 Stock=${stock_price_at_expiry:.2f} <= Strike=${strike_price:.2f}"
            )
            
            result = {
                'status': 'expired_otm',
                'option_pnl': option_pnl,
                'premium_received': premium_received,
                'exercise_cost': 0,
                'stock_price': stock_price_at_expiry,
                'strike_price': strike_price
            }
        
        # 清除当前期权头寸
        position.current_option = None
        
        print(f"{symbol}期权到期处理完成: {result['status']}, 期权P&L=${option_pnl:.2f}")
        return result
    
    def calculate_option_department_pnl(self, as_of_date: str = None) -> Dict:
        """
        计算期权交易部门的总损益
        
        Args:
            as_of_date (str, optional): 截止日期，默认为所有记录
            
        Returns:
            Dict: 期权部门损益统计
        """
        if as_of_date:
            filtered_records = [r for r in self.option_pnl_records 
                              if r['date'] <= as_of_date]
        else:
            filtered_records = self.option_pnl_records
        
        total_premium_income = sum(r['premium_income'] for r in filtered_records)
        total_trades = len([r for r in filtered_records if r['trade_type'] == 'option_entry'])
        
        # 按股票分组统计
        by_symbol = {}
        for record in filtered_records:
            symbol = record['symbol']
            if symbol not in by_symbol:
                by_symbol[symbol] = {
                    'premium_income': 0,
                    'trades_count': 0,
                    'exercised_count': 0,
                    'expired_otm_count': 0
                }
            
            by_symbol[symbol]['premium_income'] += record['premium_income']
            
            if record['trade_type'] == 'option_entry':
                by_symbol[symbol]['trades_count'] += 1
            elif record['trade_type'] == 'option_exercise':
                by_symbol[symbol]['exercised_count'] += 1
            elif record['trade_type'] == 'option_expiry':
                by_symbol[symbol]['expired_otm_count'] += 1
        
        return {
            'total_option_pnl': total_premium_income,
            'total_trades': total_trades,
            'initial_virtual_cash': self.initial_virtual_cash,
            'option_return_rate': (total_premium_income / self.initial_virtual_cash) if self.initial_virtual_cash > 0 else 0,
            'by_symbol': by_symbol,
            'pnl_records': filtered_records
        }
    
    def calculate_annualized_return(self, start_date: str, end_date: str, 
                                  reference_stock_value: float = None) -> Dict:
        """
        计算年化收益率
        
        Args:
            start_date (str): 开始日期
            end_date (str): 结束日期  
            reference_stock_value (float, optional): 参考股票价值，用作分母
            
        Returns:
            Dict: 年化收益率统计
        """
        # 计算期权部门损益
        option_pnl = self.calculate_option_department_pnl(end_date)
        total_option_pnl = option_pnl['total_option_pnl']
        
        # 计算时间跨度
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        days_elapsed = (end_dt - start_dt).days
        
        if days_elapsed <= 0:
            return {'error': '日期范围无效'}
        
        # 选择分母：参考股票价值或虚拟现金
        denominator = reference_stock_value if reference_stock_value else self.initial_virtual_cash
        
        # 计算年化收益率
        total_return_rate = total_option_pnl / denominator if denominator > 0 else 0
        annualized_return = total_return_rate * (365 / days_elapsed)
        
        return {
            'total_option_pnl': total_option_pnl,
            'denominator': denominator,
            'days_elapsed': days_elapsed,
            'total_return_rate': total_return_rate,
            'annualized_return': annualized_return,
            'annualized_return_percent': annualized_return * 100
        }
    
    def _record_option_pnl(self, date: str, symbol: str, trade_type: str, 
                          premium_income: float, description: str = ''):
        """
        记录期权部门损益
        
        Args:
            date (str): 交易日期
            symbol (str): 股票代码
            trade_type (str): 交易类型
            premium_income (float): 权利金收入（可为负值表示成本）
            description (str): 描述
        """
        self.option_pnl_records.append({
            'date': date,
            'symbol': symbol,
            'trade_type': trade_type,
            'premium_income': premium_income,
            'description': description,
            'cumulative_pnl': sum(r['premium_income'] for r in self.option_pnl_records) + premium_income
        })
    
    def get_position_summary(self) -> Dict:
        """获取所有持仓概要"""
        summary = {}
        
        for symbol, position in self.positions.items():
            current_option_info = None
            if position.current_option:
                opt = position.current_option
                current_option_info = {
                    'strike_price': opt.contract.strike_price,
                    'expiry_date': opt.contract.expiry_date,
                    'premium_received': opt.premium_received,
                    'days_to_expiry': opt.contract.days_to_expiry
                }
            
            summary[symbol] = {
                'stock_shares': position.stock_shares,
                'stock_entry_price': position.stock_entry_price,
                'current_option': current_option_info,
                'total_option_trades': len(position.option_trades_history)
            }
        
        return summary
    
    def export_trades_to_dataframe(self) -> pd.DataFrame:
        """导出所有期权交易记录为DataFrame"""
        records = []
        
        for symbol, position in self.positions.items():
            for trade in position.option_trades_history:
                records.append({
                    'symbol': symbol,
                    'entry_date': trade.entry_date,
                    'exit_date': trade.exit_date,
                    'strike_price': trade.contract.strike_price,
                    'expiry_date': trade.contract.expiry_date,
                    'premium_received': trade.premium_received,
                    'exercise_cost': trade.exercise_cost,
                    'net_option_pnl': trade.premium_received - trade.exercise_cost,
                    'exit_reason': trade.exit_reason,
                    'ccas_score': trade.contract.ccas_score
                })
        
        return pd.DataFrame(records)


def test_option_pnl_attribution():
    """测试期权损益归因分离计算"""
    print("测试期权损益归因分离计算...")
    
    # 创建计算器
    calculator = OptionPnLAttribution(initial_virtual_cash=10000)
    
    # 添加NVDA持仓
    calculator.add_position('NVDA', stock_shares=100, stock_entry_price=180.0)
    
    # 模拟第一笔期权交易
    option1 = OptionContract(
        symbol='NVDA',
        strike_price=190.0,
        expiry_date='2024-02-15',
        premium=3.50,
        ccas_score=75.0
    )
    
    calculator.sell_call_option('NVDA', '2024-01-15', option1, 350.0)  # 总权利金$350
    
    # 模拟期权到期（被行权）
    result1 = calculator.process_option_expiry('NVDA', '2024-02-15', 195.0)  # 股价$195
    print(f"第一笔期权结果: {result1}")
    
    # 模拟第二笔期权交易
    option2 = OptionContract(
        symbol='NVDA',
        strike_price=200.0,
        expiry_date='2024-03-15',
        premium=2.80,
        ccas_score=68.0
    )
    
    calculator.sell_call_option('NVDA', '2024-02-16', option2, 280.0)  # 总权利金$280
    
    # 模拟期权到期（虚值到期）
    result2 = calculator.process_option_expiry('NVDA', '2024-03-15', 198.0)  # 股价$198
    print(f"第二笔期权结果: {result2}")
    
    # 计算总体损益
    total_pnl = calculator.calculate_option_department_pnl()
    print(f"\n期权部门总损益: {total_pnl}")
    
    # 计算年化收益率
    annualized = calculator.calculate_annualized_return(
        '2024-01-15', 
        '2024-03-15',
        reference_stock_value=18000  # 100股 * $180
    )
    print(f"\n年化收益率: {annualized['annualized_return_percent']:.2f}%")
    
    # 导出交易记录
    trades_df = calculator.export_trades_to_dataframe()
    print(f"\n交易记录:")
    print(trades_df)
    
    print("测试完成")


if __name__ == "__main__":
    test_option_pnl_attribution()
