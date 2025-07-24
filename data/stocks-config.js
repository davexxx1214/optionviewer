// 股票列表配置 - 25只大市值股票（美股前20 + 5只中概股）
const stocksList = [
  // 美股市值前20名
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'LLY', name: 'Eli Lilly and Company' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'ORCL', name: 'Oracle Corporation' },
  { symbol: 'MA', name: 'Mastercard Incorporated' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'HD', name: 'The Home Depot Inc.' },
  // 热门中概股
  { symbol: 'BABA', name: 'Alibaba Group Holding Limited' },
  { symbol: 'PDD', name: 'PDD Holdings Inc.' },
  { symbol: 'NTES', name: 'NetEase Inc.' },
  { symbol: 'JD', name: 'JD.com Inc.' },
  { symbol: 'TME', name: 'Tencent Music Entertainment Group' }
];

module.exports = {
  stocksList
}; 