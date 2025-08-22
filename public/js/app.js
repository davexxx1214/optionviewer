// 应用状态
const appState = {
    selectedStock: null,
    selectedOptionType: 'call',
    selectedExpiry: 30,
    optionsData: [],
    sortColumn: 'buyCallScore',
    sortDirection: 'desc'
};

// DOM 元素
const elements = {
    stockSelect: document.getElementById('stockSelect'),
    stockDropdown: document.getElementById('stockDropdown'),
    optionTypeDropdown: document.getElementById('optionTypeDropdown'),
    expiryDropdown: document.getElementById('expiryDropdown'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    errorMessage: document.getElementById('errorMessage'),
    resultsContainer: document.getElementById('resultsContainer'),
    resultsTitle: document.getElementById('resultsTitle'),
    stockInfo: document.getElementById('stockInfo'),
    updateTime: document.getElementById('updateTime'),
    optionsTableBody: document.getElementById('optionsTableBody')
};

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // 初始化时禁用分析按钮
    elements.analyzeBtn.disabled = true;
    
    initializeDropdowns();
    setupEventListeners();
    loadStocksList();
    
    // 加载HV缓存状态
    loadHVCacheStatus();
}

// 设置事件监听器
function setupEventListeners() {
    // 股票选择器
    setupDropdown('stock', appState.selectedStock?.symbol || '', handleStockChange);
    
    // 期权类型选择器
    setupDropdown('optionType', appState.selectedOptionType, handleOptionTypeChange);
    
    // 到期天数选择器
    setupDropdown('expiry', appState.selectedExpiry, handleExpiryChange);
    
    // 分析按钮
    elements.analyzeBtn.addEventListener('click', analyzeOptions);
    
    // 表格排序
    document.querySelectorAll('.options-table th.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', handleClickOutside);
}

// 初始化下拉菜单
function initializeDropdowns() {
    // 股票选择下拉菜单
    const stockSelector = document.querySelector('.stock-selector');
    const stockValue = document.createElement('div');
    stockValue.className = 'selected-value';
    stockValue.textContent = '请选择股票';
    stockSelector.insertBefore(stockValue, elements.stockDropdown);
    
    // 期权类型下拉菜单
    const optionTypeSelector = document.querySelector('.option-type-selector');
    const optionTypeValue = document.createElement('div');
    optionTypeValue.className = 'selected-value';
    optionTypeValue.textContent = '看涨期权';
    optionTypeSelector.insertBefore(optionTypeValue, elements.optionTypeDropdown);
    
    // 到期天数下拉菜单
    const expirySelector = document.querySelector('.expiry-selector');
    const expiryValue = document.createElement('div');
    expiryValue.className = 'selected-value';
    expiryValue.textContent = '30天';
    expirySelector.insertBefore(expiryValue, elements.expiryDropdown);
}

// 设置下拉菜单
function setupDropdown(type, defaultValue, changeHandler) {
    let dropdownId;
    if (type === 'optionType') {
        dropdownId = 'optionTypeDropdown';
    } else if (type === 'expiry') {
        dropdownId = 'expiryDropdown';
    } else if (type === 'stock') {
        dropdownId = 'stockDropdown';
    }
    
    const dropdown = document.getElementById(dropdownId);
    const selectedValueElement = dropdown.parentElement.querySelector('.selected-value');
    
    if (!dropdown) {
        console.error(`找不到ID为 ${dropdownId} 的下拉菜单元素`);
        return;
    }
    
    if (!selectedValueElement) {
        console.error(`找不到 ${type} 的 selected-value 元素`);
        return;
    }
    
    // 绑定点击选中值的事件
    selectedValueElement.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(dropdown);
    });
    
    // 使用事件委托处理下拉选项的点击事件
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.dropdown-item');
        if (item) {
            const value = item.dataset.value;
            // 对于股票选择，显示格式需要特殊处理
            if (type === 'stock') {
                const stockSymbol = item.querySelector('div:first-child').textContent;
                const stockName = item.querySelector('div:last-child').textContent;
                selectedValueElement.textContent = `${stockSymbol} - ${stockName}`;
            } else {
                selectedValueElement.textContent = item.textContent;
            }
            hideDropdown(dropdown);
            changeHandler(value);
        }
    });
}

// 股票选择处理
function handleStockChange(value) {
    // 优先从localStorage获取完整股票信息（包含价格）
    let stocks = JSON.parse(localStorage.getItem('stocksList') || '[]');
    let selectedStock = stocks.find(stock => stock.symbol === value);
    
    // 如果localStorage中没有找到（可能价格还未加载），从当前下拉菜单数据创建基础信息
    if (!selectedStock) {
        // 从下拉菜单中获取股票名称
        const dropdownItem = document.querySelector(`[data-value="${value}"]`);
        if (dropdownItem) {
            const nameElement = dropdownItem.querySelector('div:last-child');
            selectedStock = {
                symbol: value,
                name: nameElement ? nameElement.textContent : value,
                price: null, // 价格稍后更新
                lastUpdated: new Date().toISOString()
            };
        }
    }
    
    if (selectedStock) {
        appState.selectedStock = selectedStock;
        
        // 立即启用分析按钮，不需要等待价格加载
        elements.analyzeBtn.disabled = false;
        console.log(`已选择股票: ${selectedStock.symbol} - ${selectedStock.name}`);
    } else {
        appState.selectedStock = null;
        elements.analyzeBtn.disabled = true;
    }
}

// 加载股票列表（优化版本：立即显示基础列表，后台加载价格）
async function loadStocksList() {
    try {
        // 第一步：快速加载基础股票列表，立即显示选择器
        console.log('正在加载基础股票列表...');
        const basicResponse = await fetch('/api/stocks/list');
        const basicResult = await basicResponse.json();
        
        if (basicResult.success) {
            // 立即生成股票下拉菜单选项
            generateStockDropdownOptions(basicResult.data);
            
            // 设置默认选择第一个股票
            if (basicResult.data.length > 0) {
                selectStock(basicResult.data[0]);
            }
            
            // 显示加载状态
            updateDataSourceIndicator('loading');
            console.log('基础股票列表已加载，用户可以立即选择股票');
        }
        
        // 第二步：在后台异步加载实时价格
        console.log('正在后台获取实时股票价格...');
        loadStockPricesInBackground();
        
    } catch (error) {
        console.error('加载基础股票列表失败:', error);
        updateDataSourceIndicator('error');
    }
}

// 后台加载股票价格
async function loadStockPricesInBackground() {
    try {
        const response = await fetch('/api/stocks');
        const result = await response.json();
        
        if (result.success) {
            // 保存完整的股票列表到本地存储
            localStorage.setItem('stocksList', JSON.stringify(result.data));
            
            // 调试日志：检查接收到的数据源
            console.log('收到的数据源类型:', result.dataSource);
            console.log('第一个股票的fromCache状态:', result.data[0]?.fromCache);
            console.log('第一个股票的cachedAt:', result.data[0]?.cachedAt);
            
            // 更新数据源指示器
            updateDataSourceIndicator(result.dataSource, result.lastUpdated);
            
            // 更新当前选中股票的价格信息（如果有的话）
            if (appState.selectedStock) {
                const updatedStock = result.data.find(s => s.symbol === appState.selectedStock.symbol);
                if (updatedStock) {
                    appState.selectedStock = updatedStock;
                }
            }
            
            console.log('股票价格更新完成');
        }
    } catch (error) {
        console.error('获取股票价格失败:', error);
        // 即使价格获取失败，用户仍然可以选择股票
        updateDataSourceIndicator('fallback');
    }
}

// 生成股票下拉菜单选项
function generateStockDropdownOptions(stocks) {
    elements.stockDropdown.innerHTML = '';
    
    stocks.forEach(stock => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.dataset.value = stock.symbol;
        item.innerHTML = `
            <div style="font-weight: 600;">${stock.symbol}</div>
            <div style="font-size: 12px; color: #888;">${stock.name}</div>
        `;
        elements.stockDropdown.appendChild(item);
    });
}

// 选择股票
function selectStock(stock) {
    appState.selectedStock = stock;
    
    // 更新股票下拉框显示
    const stockSelector = document.querySelector('.stock-selector');
    const selectedValueElement = stockSelector.querySelector('.selected-value');
    if (selectedValueElement) {
        selectedValueElement.textContent = `${stock.symbol} - ${stock.name}`;
    }
    
    // 启用分析按钮
    elements.analyzeBtn.disabled = false;
}

// 期权类型变更处理
function handleOptionTypeChange(value) {
    appState.selectedOptionType = value;
    // 期权类型现在固定为call，不需要特殊处理
}

// 到期天数变更处理
function handleExpiryChange(value) {
    appState.selectedExpiry = parseInt(value);
}

// 分析期权
async function analyzeOptions() {
    if (!appState.selectedStock) {
        showError('请先选择股票');
        return;
    }
    
    showLoading();
    hideError();
    hideResults();
    
    try {
        const optionType = appState.selectedOptionType; // 现在只处理看涨期权，买入/卖出通过前端展示不同评分
        const response = await fetch(
            `/api/options/${appState.selectedStock.symbol}?type=${optionType}&days=${appState.selectedExpiry}&refresh=true`
        );
        const result = await response.json();
        
        if (result.success) {
            appState.optionsData = result.data.options;
            
            // 存储过滤配置到localStorage以便前端使用
            localStorage.setItem('minDailyVolume', result.data.filterConfig?.minDailyVolume || '10');
            localStorage.setItem('minOpenInterest', result.data.filterConfig?.minOpenInterest || '100');
            localStorage.setItem('maxBidAskSpread', result.data.filterConfig?.maxBidAskSpreadPercent || '10');
            localStorage.setItem('minImpliedVolatility', result.data.filterConfig?.minImpliedVolatilityPercent || '15');
            localStorage.setItem('maxImpliedVolatility', result.data.filterConfig?.maxImpliedVolatilityPercent || '200');
            
            displayResults(result.data);
            
            // 分析完成后刷新HV缓存状态
            loadHVCacheStatus();
        } else {
            showError(result.message || '分析失败');
        }
    } catch (error) {
        console.error('分析请求失败:', error);
        showError('网络请求失败，请检查连接');
    } finally {
        hideLoading();
    }
}

// 显示结果
function displayResults(data) {
    // 统计合格和不合格期权数量
    const qualifiedCount = data.options.filter(option => option.isQualified).length;
    const totalCount = data.options.length;
    
    // 更新标题和信息
    elements.resultsTitle.textContent = `${data.stock.symbol} 期权分析结果`;
    elements.stockInfo.textContent = `${data.stock.name} - 当前价格: $${data.stock.price} | 合格期权: ${qualifiedCount}/${totalCount}`;
    elements.updateTime.textContent = `更新时间: ${new Date(data.timestamp).toLocaleString('zh-CN')}`;
    
    // 应用默认排序（按买入评分降序）
    appState.sortColumn = 'buyCallScore';
    sortOptionsData();
    updateSortIcons();
    
    // 渲染表格
    renderOptionsTable(appState.optionsData);
    
    // 显示结果容器
    showResults();
}

// 渲染期权表格
function renderOptionsTable(options) {
    elements.optionsTableBody.innerHTML = '';
    
    options.forEach(option => {
        const row = document.createElement('tr');
        
        // 为不合格期权添加特殊样式
        if (!option.isQualified) {
            row.classList.add('unqualified-option');
        }
        
        row.innerHTML = `
            <td>${option.symbol}</td>
            <td class="filter-status ${option.isQualified ? 'qualified' : 'unqualified'}" title="${getFilterTooltip(option.filters)}">${option.filterStatus || '✓'}</td>
            <td class="${option.daysToExpiry <= 0 ? 'expired-option' : ''}" title="${option.daysToExpiry <= 0 ? '此期权已过期' : ''}">${option.daysToExpiry <= 0 ? '已过期' : option.daysToExpiry}</td>
            <td>$${option.strikePrice}</td>
            <td>$${option.premium}</td>
            <td class="option-type ${option.type === 'call' ? 'call-option' : 'put-option'}">${option.type.toUpperCase()}</td>
            <td>$${option.bid}</td>
            <td>$${option.ask}</td>
            <td class="${getVolumeClass(option.volume)}">${option.volume || 0}</td>
            <td class="${getOpenInterestClass(option.openInterest)}">${option.openInterest || 0}</td>
            <td class="${getIVClass(option.impliedVolatility)}">${option.impliedVolatility}%</td>
            <td class="hv-value" title="基于${option.hvPeriod || ''}天计算">${option.historicalVolatility || '-'}${option.historicalVolatility ? '%' : ''}</td>
            <td class="iv-hv-ratio ${getIVHVRatioClass(option.ivHvRatio)}">${option.ivHvRatio || '-'}</td>
            <td class="leverage-ratio ${getLeverageRatioClass(option.leverageRatio)}" title="正股价格/期权价格">${option.leverageRatio || '-'}</td>
            <td class="exercise-probability ${getExerciseProbabilityClass(option.exerciseProbability)}" title="基于Delta值的行权概率">${option.exerciseProbability || '-'}${option.exerciseProbability ? '%' : ''}</td>
            <td><span class="score ${getScoreClass(option.casScoring?.buyCall?.score || 0)}" title="${getCASTooltip(option, 'buy')}">${option.casScoring?.buyCall?.score || 0}</span></td>
            <td><span class="score ${getScoreClass(option.casScoring?.sellCall?.score || 0)}" title="${getCASTooltip(option, 'sell')}">${option.casScoring?.sellCall?.score || 0}</span></td>
        `;
        elements.optionsTableBody.appendChild(row);
    });
}

// 排序处理
function handleSort(column) {
    if (appState.sortColumn === column) {
        appState.sortDirection = appState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        appState.sortColumn = column;
        appState.sortDirection = 'desc';
    }
    
    // 更新排序图标
    updateSortIcons();
    
    // 排序数据
    sortOptionsData();
    
    // 重新渲染表格
    renderOptionsTable(appState.optionsData);
}

// 排序数据
function sortOptionsData() {
    appState.optionsData.sort((a, b) => {
        let aValue, bValue;
        
        // 特殊处理CAS评分字段
        if (appState.sortColumn === 'buyCallScore') {
            aValue = a.casScoring?.buyCall?.score || 0;
            bValue = b.casScoring?.buyCall?.score || 0;
        } else if (appState.sortColumn === 'sellCallScore') {
            aValue = a.casScoring?.sellCall?.score || 0;
            bValue = b.casScoring?.sellCall?.score || 0;
        } else {
            aValue = a[appState.sortColumn];
            bValue = b[appState.sortColumn];
        }
        
        // 处理数值类型
        if (typeof aValue === 'string' && !isNaN(parseFloat(aValue))) {
            aValue = parseFloat(aValue);
            bValue = parseFloat(bValue);
        }
        
        if (appState.sortDirection === 'asc') {
            return aValue > bValue ? 1 : -1;
        } else {
            return aValue < bValue ? 1 : -1;
        }
    });
}

// 更新排序图标
function updateSortIcons() {
    document.querySelectorAll('.options-table th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === appState.sortColumn) {
            th.classList.add(`sort-${appState.sortDirection}`);
        }
    });
}



// 工具函数

function getScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-average';
    return 'score-poor';
}

function getIVHVRatioClass(ratio) {
    if (!ratio) return '';
    const numRatio = parseFloat(ratio);
    if (numRatio > 1.5) return 'ratio-high'; // IV明显高于HV，期权可能被高估
    if (numRatio < 0.8) return 'ratio-low';   // IV明显低于HV，期权可能被低估
    return 'ratio-normal'; // 正常范围
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

// 显示/隐藏元素
function showLoading() {
    elements.loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    elements.loadingIndicator.style.display = 'none';
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
}

function hideError() {
    elements.errorMessage.style.display = 'none';
}

function showResults() {
    elements.resultsContainer.style.display = 'block';
}

function hideResults() {
    elements.resultsContainer.style.display = 'none';
}



function toggleDropdown(dropdown) {
    dropdown.classList.toggle('show');
}

function hideDropdown(dropdown) {
    dropdown.classList.remove('show');
}

// 更新数据源指示器
function updateDataSourceIndicator(dataSource, lastUpdated) {
    const indicator = document.getElementById('dataSourceIndicator');
    if (!indicator) return;
    
    // 移除所有样式类
    indicator.classList.remove('real-time', 'fallback', 'loading');
    
    switch (dataSource) {
        case 'real-time':
            indicator.textContent = '实时数据';
            indicator.classList.add('real-time');
            break;
        case 'cached':
            indicator.textContent = '实时数据（缓存）';
            indicator.classList.add('real-time');
            break;
        case 'fallback':
            indicator.textContent = '模拟数据';
            indicator.classList.add('fallback');
            break;
        case 'loading':
            indicator.textContent = '正在加载价格...';
            indicator.classList.add('loading');
            break;
        case 'error':
            indicator.textContent = '数据加载失败';
            indicator.classList.add('fallback');
            break;
        default:
            indicator.textContent = '数据加载中...';
    }
    
    // 更新时间提示
    if (lastUpdated) {
        const updateTime = new Date(lastUpdated);
        indicator.title = `最后更新: ${updateTime.toLocaleString('zh-CN')}`;
    } else if (dataSource === 'loading') {
        indicator.title = '正在后台获取最新股票价格';
    }
}

// 点击外部关闭下拉菜单
function handleClickOutside(event) {
    if (!event.target.closest('.stock-selector')) {
        hideDropdown(elements.stockDropdown);
    }
    
    if (!event.target.closest('.option-type-selector')) {
        hideDropdown(elements.optionTypeDropdown);
    }
    
    if (!event.target.closest('.expiry-selector')) {
        hideDropdown(elements.expiryDropdown);
    }
} 

// 获取成交量样式类
function getVolumeClass(volume) {
    const minVolume = parseInt(localStorage.getItem('minDailyVolume')) || 10;
    return volume > minVolume ? 'volume-good' : 'volume-low';
}

// 获取未平仓样式类
function getOpenInterestClass(openInterest) {
    const minOpenInterest = parseInt(localStorage.getItem('minOpenInterest')) || 100;
    return openInterest > minOpenInterest ? 'open-interest-good' : 'open-interest-low';
}

// 获取IV样式类
function getIVClass(iv) {
    const ivValue = parseFloat(iv);
    const minIV = parseInt(localStorage.getItem('minImpliedVolatility')) || 15;
    const maxIV = parseInt(localStorage.getItem('maxImpliedVolatility')) || 200;
    
    if (ivValue < minIV || ivValue > maxIV) {
        return 'iv-abnormal';
    }
    return 'iv-normal';
}

// 获取过滤器提示信息
function getFilterTooltip(filters) {
    if (!filters) return '筛选信息不可用';
    
    const minVolume = parseInt(localStorage.getItem('minDailyVolume')) || 10;
    const minOpenInterest = parseInt(localStorage.getItem('minOpenInterest')) || 100;
    const maxSpread = parseInt(localStorage.getItem('maxBidAskSpread')) || 10;
    const minIV = parseInt(localStorage.getItem('minImpliedVolatility')) || 15;
    const maxIV = parseInt(localStorage.getItem('maxImpliedVolatility')) || 200;
    
    return `流动性过滤: ${filters.liquidity ? '✓' : '✗'} (成交量>${minVolume}, 未平仓>${minOpenInterest})
价差过滤: ${filters.bidAskSpread ? '✓' : '✗'} (相对价差<${maxSpread}%)
IV合理性: ${filters.ivSanity ? '✓' : '✗'} (${minIV}%<IV<${maxIV}%)`;
}

// 获取CAS评分提示信息
function getCASTooltip(option, strategy = 'buy') {
    if (!option.isQualified) {
        return `CAS评分: 0 (不合格期权)`;
    }
    
    if (!option.casScoring) {
        return `CAS评分: 0 (评分不可用)`;
    }
    
    const scoring = strategy === 'buy' ? option.casScoring.buyCall : option.casScoring.sellCall;
    const actionText = strategy === 'buy' ? '买入看涨' : '卖出看涨';
    
    return `${actionText}评分: ${scoring.score}
波动率价值分: ${scoring.scoreVol}
投机潜力分: ${scoring.scoreSpec}
等级: ${scoring.description}
使用价格: $${scoring.details.price} (${scoring.details.priceType})
Delta/价格比: ${scoring.details.deltaPerPremium}
计算: ${scoring.details.explanation}`;
}

// 获取VVI评分提示信息
function getVVITooltip(option) {
    if (!option.isQualified) {
        return 'VVI评分: 0 (不合格期权)';
    }
    
    if (!option.vviDetails) {
        return `VVI评分: ${option.score} (详情不可用)`;
    }
    
    const details = option.vviDetails;
    const interpretation = getVVIInterpretation(option.score);
    
    return `VVI评分: ${option.score}/100 - ${interpretation}
当前比率(R): ${details.R_current}
Z-Score: ${details.Z_score}
历史基准: ${details.benchmark.R_avg.toFixed(3)} ± ${details.benchmark.R_std_dev.toFixed(3)}`;
}

// 获取VVI评分解释
function getVVIInterpretation(score) {
    if (score >= 80) return '极度低估';
    if (score >= 65) return '低估';
    if (score >= 35) return '正常估值';
    if (score >= 20) return '高估';
    return '极度高估';
}

// 获取杠杆率样式类
function getLeverageRatioClass(leverageRatio) {
    if (!leverageRatio) return '';
    const ratio = parseFloat(leverageRatio);
    if (ratio >= 20) return 'leverage-high'; // 高杠杆
    if (ratio >= 10) return 'leverage-medium'; // 中杠杆
    if (ratio >= 5) return 'leverage-low'; // 低杠杆
    return 'leverage-very-low'; // 非常低杠杆
}

// 获取行权概率样式类
function getExerciseProbabilityClass(exerciseProbability) {
    if (!exerciseProbability) return '';
    const prob = parseFloat(exerciseProbability);
    if (prob >= 70) return 'exercise-high'; // 高概率
    if (prob >= 40) return 'exercise-medium'; // 中等概率
    if (prob >= 20) return 'exercise-low'; // 低概率
    return 'exercise-very-low'; // 非常低概率
}

// 加载HV缓存状态
async function loadHVCacheStatus() {
    try {
        const response = await fetch('/api/cache/hv/stats');
        const result = await response.json();
        
        if (result.success) {
            updateHVCacheIndicator(result.data);
        } else {
            updateHVCacheIndicator(null);
        }
    } catch (error) {
        console.error('获取HV缓存状态失败:', error);
        updateHVCacheIndicator(null);
    }
}

// 更新HV缓存指示器
function updateHVCacheIndicator(cacheStats) {
    const indicator = document.getElementById('hvCacheIndicator');
    if (!indicator) return;
    
    // 移除所有样式类
    indicator.classList.remove('real-time', 'fallback', 'loading');
    
    if (!cacheStats) {
        indicator.textContent = 'HV缓存未知';
        indicator.classList.add('fallback');
        indicator.title = 'HV缓存状态未知';
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const isToday = cacheStats.date === today;
    
    if (isToday && cacheStats.cacheCount > 0) {
        indicator.textContent = `HV已缓存 (${cacheStats.cacheCount})`;
        indicator.classList.add('real-time');
        indicator.title = `今日已缓存${cacheStats.cacheCount}个HV值，避免重复计算`;
    } else if (isToday && cacheStats.cacheCount === 0) {
        indicator.textContent = 'HV缓存空';
        indicator.classList.add('loading');
        indicator.title = '今日HV缓存为空，计算后将自动缓存';
    } else {
        indicator.textContent = 'HV缓存过期';
        indicator.classList.add('fallback');
        indicator.title = `缓存日期：${cacheStats.date}，今日：${today}`;
    }
}

// =================== 历史基准数据管理功能 ===================

// 历史基准数据管理状态
const benchmarkState = {
    isUpdating: false,
    eventSource: null,
    updateResult: null
};

// 初始化基准数据管理功能
function initializeBenchmarkManagement() {
    // 添加事件监听器
    const updateNVDABtn = document.getElementById('updateNVDABtn');
    const viewBtn = document.getElementById('viewBenchmarkBtn');
    const closeProgressBtn = document.getElementById('closeProgressBtn');
    const closeBenchmarkBtn = document.getElementById('closeBenchmarkBtn');

    if (updateNVDABtn) updateNVDABtn.addEventListener('click', handleUpdateNVDABenchmark);
    if (viewBtn) viewBtn.addEventListener('click', handleViewNVDABenchmark);
    if (closeProgressBtn) closeProgressBtn.addEventListener('click', closeProgressPanel);
    if (closeBenchmarkBtn) closeBenchmarkBtn.addEventListener('click', closeBenchmarkPanel);

    // 加载基准数据状态
    loadBenchmarkStatus();
}

// 加载基准数据状态
async function loadBenchmarkStatus() {
    try {
        const response = await fetch('/api/benchmark/nvda/data');
        const result = await response.json();
        
        if (result.success && result.data) {
            updateBenchmarkStatusDisplay({
                hasData: true,
                lastUpdated: result.data.lastUpdated,
                message: `NVDA半年基准数据 | 分析了${result.data.dataPoints}个交易日 | 总样本数: ${result.data.totalSamples}`
            });
        } else {
            updateBenchmarkStatusDisplay({
                hasData: false,
                message: '没有NVDA基准数据，请先更新'
            });
        }
    } catch (error) {
        console.error('加载NVDA基准数据状态失败:', error);
        updateBenchmarkStatusDisplay({
            hasData: false,
            error: error.message,
            message: '无法连接到服务器'
        });
    }
}

// 更新基准数据状态显示
function updateBenchmarkStatusDisplay(status) {
    const statusIndicator = document.getElementById('benchmarkStatus');
    const benchmarkInfo = document.getElementById('benchmarkInfo');
    
    if (!statusIndicator || !benchmarkInfo) return;

    // 清除旧的状态类
    statusIndicator.className = 'status-indicator';
    
    if (status.hasData) {
        statusIndicator.classList.add('success');
        statusIndicator.textContent = '✅ 已有真实基准数据';
        
        const lastUpdated = new Date(status.lastUpdated).toLocaleString('zh-CN');
        benchmarkInfo.textContent = `${status.message} | 最后更新: ${lastUpdated}`;
    } else if (status.error) {
        statusIndicator.classList.add('error');
        statusIndicator.textContent = '❌ 基准数据状态异常';
        benchmarkInfo.textContent = status.message || status.error;
    } else {
        statusIndicator.classList.add('loading');
        statusIndicator.textContent = '⚠️ 使用Mock基准数据';
        benchmarkInfo.textContent = status.message || '建议更新为真实数据';
    }
}



// 处理更新进度
function handleUpdateProgress(data) {
    switch (data.type) {
        case 'start':
            updateProgressBar(0, '开始更新...');
            addLogEntry('开始更新历史基准数据...', 'info');
            break;
            
        case 'progress': {
            // 处理两种不同的进度数据格式
            let percentage, progressText;
            
            if (data.current !== undefined && data.total !== undefined) {
                // 通用基准更新格式 (current/total)
                percentage = Math.round((data.current / data.total) * 100);
                progressText = `处理中 ${data.current}/${data.total}: ${data.symbol || ''}`;
                
                if (data.status === 'error') {
                    addLogEntry(`❌ ${data.symbol}: ${data.error}`, 'error');
                } else {
                    addLogEntry(`🔄 ${data.symbol}: 正在处理...`, 'info');
                }
            } else if (data.progress !== undefined) {
                // NVDA特定格式 (progress 百分比)
                percentage = data.progress;
                progressText = data.step || `处理中 ${data.stock || 'NVDA'}...`;
                addLogEntry(`📊 ${data.step || '处理中'}`, 'info');
            } else {
                // 通用进度
                percentage = 50; // 默认进度
                progressText = data.message || '处理中...';
                addLogEntry(data.message || '处理中...', 'info');
            }
            
            updateProgressBar(percentage, progressText);
            break;
        }
            
        case 'complete':
            updateProgressBar(100, '更新完成！');
            benchmarkState.updateResult = data.result;
            
            addLogEntry(`\n=== 更新完成 ===`, 'info');
            
            if (data.result) {
                if (data.result.success !== undefined && data.result.total !== undefined) {
                    // 通用基准更新结果
                    addLogEntry(`成功: ${data.result.success}/${data.result.total} (${data.result.successRate}%)`, 'success');
                    addLogEntry(`失败: ${data.result.errors}`, data.result.errors > 0 ? 'warning' : 'info');
                    
                    if (data.result.errors > 0) {
                        addLogEntry(`\n失败列表:`, 'warning');
                        data.result.errors.forEach(error => {
                            addLogEntry(`${error.symbol}: ${error.error}`, 'error');
                        });
                    }
                } else {
                    // NVDA特定结果
                    addLogEntry(`✅ NVDA 基准数据计算完成`, 'success');
                    addLogEntry(`分析窗口: ${data.result.analysisWindow || 126} 个交易日`, 'info');
                    addLogEntry(`处理天数: ${data.result.dataPoints || 0}`, 'info');
                    if (data.result.benchmarks) {
                        Object.keys(data.result.benchmarks).forEach(category => {
                            const benchmark = data.result.benchmarks[category];
                            addLogEntry(`${category}: 平均IV=${(benchmark.averageIV || 0).toFixed(4)}, 样本数=${benchmark.sampleCount || 0}`, 'info');
                        });
                    }
                }
            } else {
                addLogEntry('✅ 更新完成', 'success');
            }
            
            handleUpdateComplete(data);
            break;
            
        case 'error':
            updateProgressBar(0, '更新失败');
            addLogEntry(`❌ 更新失败: ${data.error || data.message || '未知错误'}`, 'error');
            handleUpdateComplete(data);
            break;
    }
}

// 更新进度条
function updateProgressBar(percentage, text) {
    const progressBar = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = text;
}

// 添加日志条目
function addLogEntry(message, type = 'info') {
    const progressLog = document.getElementById('progressLog');
    if (!progressLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    progressLog.appendChild(logEntry);
    progressLog.scrollTop = progressLog.scrollHeight;
}

// 处理更新完成
function handleUpdateComplete(data) {
    benchmarkState.isUpdating = false;
    
    // 关闭SSE连接
    if (benchmarkState.eventSource) {
        benchmarkState.eventSource.close();
        benchmarkState.eventSource = null;
    }
    
    // 恢复所有更新按钮
    const updateBtn = document.getElementById('updateBenchmarkBtn');
    const nvdaBtn = document.getElementById('updateNVDABtn');
    
    if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.querySelector('span').textContent = '🔄 更新历史基准数据';
    }
    
    if (nvdaBtn) {
        nvdaBtn.disabled = false;
        nvdaBtn.querySelector('span').textContent = '🚀 更新NVDA半年基准';
    }
    
    // 重新加载状态
    setTimeout(() => {
        loadBenchmarkStatus();
    }, 1000);
    
    // 根据不同类型显示成功消息
    if (data.type === 'complete') {
        if (data.result && data.result.successRate !== undefined && data.result.successRate >= 80) {
            // 通用基准更新
            setTimeout(() => {
                alert(`更新完成！成功率: ${data.result.successRate}%\n\n建议刷新页面以使用新的基准数据。`);
            }, 2000);
        } else if (data.result && data.result.symbol === 'NVDA') {
            // NVDA特定更新
            setTimeout(() => {
                alert(`NVDA基准数据计算完成！\n\n处理了 ${data.result.dataPoints || 0} 个交易日\n建议刷新页面以使用新的基准数据。`);
            }, 2000);
        }
    }
}

// 显示进度面板
function showProgressPanel(title) {
    const panel = document.getElementById('updateProgressPanel');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay';
    
    document.body.appendChild(overlay);
    
    if (panel) {
        panel.style.display = 'block';
        
        // 更新标题（如果提供）
        if (title) {
            const header = panel.querySelector('.progress-header h3');
            if (header) header.textContent = title;
        }
        
        // 重置进度
        updateProgressBar(0, '准备开始...');
        const progressLog = document.getElementById('progressLog');
        if (progressLog) progressLog.innerHTML = '';
    }
}

// 关闭进度面板
function closeProgressPanel() {
    const panel = document.getElementById('updateProgressPanel');
    const overlay = document.getElementById('modalOverlay');
    
    if (panel) panel.style.display = 'none';
    if (overlay) overlay.remove();
    
    // 如果正在更新，询问是否停止
    if (benchmarkState.isUpdating) {
        const confirmStop = confirm('更新正在进行中，确定要关闭窗口吗？\n更新过程将在后台继续...');
        if (!confirmStop) {
            showProgressPanel();
        }
    }
}

// 处理查看NVDA基准数据
async function handleViewNVDABenchmark() {
    showBenchmarkPanel();
    
    try {
        const response = await fetch('/api/benchmark/nvda/data');
        const result = await response.json();
        
        if (result.success && result.data) {
            displayNVDABenchmarkData(result.data);
        } else {
            displayBenchmarkError(result.message || '没有NVDA基准数据');
        }
    } catch (error) {
        console.error('加载NVDA基准数据失败:', error);
        displayBenchmarkError('加载失败: ' + error.message);
    }
}

// 显示NVDA基准数据
function displayNVDABenchmarkData(data) {
    const content = document.getElementById('benchmarkContent');
    if (!content) return;
    
    const updateTime = new Date(data.lastUpdated).toLocaleDateString();
    
    let html = `
        <div class="benchmark-summary">
            <p><strong>股票:</strong> ${data.symbol}</p>
            <p><strong>分析窗口:</strong> ${data.analysisWindow} 个交易日（约半年）</p>
            <p><strong>处理天数:</strong> ${data.dataPoints} 天</p>
            <p><strong>总样本数:</strong> ${data.totalSamples} 个期权合约</p>
            <p><strong>更新时间:</strong> ${updateTime}</p>
        </div>
        
        <table class="benchmark-table">
            <thead>
                <tr>
                    <th>DTE区间</th>
                    <th>平均隐含波动率</th>
                    <th>总样本数</th>
                    <th>有效IV数</th>
                    <th>最小IV</th>
                    <th>最大IV</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    const categories = {
        'ultra_short': '超短期 (0-20天)',
        'short': '短期 (21-60天)',
        'medium': '中期 (61-180天)',
        'long': '长期 (>180天)'
    };
    
    Object.keys(categories).forEach(category => {
        const benchmark = data.benchmarks[category];
        if (benchmark) {
            html += `
                <tr>
                    <td><strong>${categories[category]}</strong></td>
                    <td>${(benchmark.averageIV * 100).toFixed(2)}%</td>
                    <td>${benchmark.sampleCount}</td>
                    <td>${benchmark.validIVCount}</td>
                    <td>${(benchmark.minIV * 100).toFixed(2)}%</td>
                    <td>${(benchmark.maxIV * 100).toFixed(2)}%</td>
                </tr>
            `;
        }
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    content.innerHTML = html;
}

// 显示基准数据错误
function displayBenchmarkError(message) {
    const content = document.getElementById('benchmarkContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="error-message" style="text-align: center; padding: 40px;">
            <h4>📭 ${message}</h4>
            <p>点击"更新历史基准数据"按钮生成真实数据</p>
        </div>
    `;
}

// 显示基准数据面板
function showBenchmarkPanel() {
    const panel = document.getElementById('benchmarkViewPanel');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay2';
    
    document.body.appendChild(overlay);
    
    if (panel) {
        panel.style.display = 'block';
        const content = document.getElementById('benchmarkContent');
        if (content) content.innerHTML = '<div class="loading">正在加载基准数据...</div>';
    }
}

// 关闭基准数据面板
function closeBenchmarkPanel() {
    const panel = document.getElementById('benchmarkViewPanel');
    const overlay = document.getElementById('modalOverlay2');
    
    if (panel) panel.style.display = 'none';
    if (overlay) overlay.remove();
}



// === NVDA专用历史基准更新 ===

// 处理NVDA基准更新
async function handleUpdateNVDABenchmark() {
    // 确认操作
    if (!confirm('确定要更新NVDA半年历史基准数据吗？\n\n⚠️ 这将获取过去126个交易日的逐日数据进行分析，需要大量API调用，大约需要30-60分钟完成。\n\n请确保在网络稳定的环境下进行。')) {
        return;
    }

    const updateBtn = document.getElementById('updateNVDABtn');
    
    // 禁用按钮并显示进度面板
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.querySelector('span').textContent = '⏳ 计算中...';
    }
    
    // 设置更新状态
    benchmarkState.isUpdating = true;
    
    showProgressPanel('🚀 NVDA历史基准数据计算进度');
    
    // 重置进度并设置初始状态
    updateProgressBar(0, '准备开始NVDA基准计算...');
    addLogEntry('🚀 开始计算 NVDA 半年历史基准数据...', 'info');

    try {
        // 创建SSE连接
        benchmarkState.eventSource = new EventSource('/api/benchmark/nvda/update');

        benchmarkState.eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                handleUpdateProgress(data);
            } catch (error) {
                console.error('解析进度数据失败:', error);
                addLogEntry('⚠️ 进度数据解析失败');
            }
        };

        benchmarkState.eventSource.onerror = function(event) {
            console.error('NVDA基准更新连接错误:', event);
            addLogEntry('❌ 连接错误，请检查服务器状态');
            handleUpdateComplete();
        };

    } catch (error) {
        console.error('启动NVDA基准更新失败:', error);
        addLogEntry('❌ 启动失败: ' + error.message);
        handleUpdateComplete();
    }
}

// 初始化时调用基准数据管理功能
document.addEventListener('DOMContentLoaded', function() {
    // 延迟初始化，确保DOM完全加载
    setTimeout(() => {
        initializeBenchmarkManagement();
    }, 100);
}); 