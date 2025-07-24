// 应用状态
const appState = {
    selectedStock: null,
    selectedOptionType: 'call',
    selectedExpiry: 30,
    optionsData: [],
    sortColumn: 'score',
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
    optionTypeValue.textContent = '买入看涨';
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
            const symbolElement = dropdownItem.querySelector('div:first-child');
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
        const optionType = appState.selectedOptionType.includes('call') ? 'call' : 'put';
        const response = await fetch(
            `/api/options/${appState.selectedStock.symbol}?type=${optionType}&days=${appState.selectedExpiry}&refresh=true`
        );
        const result = await response.json();
        
        if (result.success) {
            appState.optionsData = result.data.options;
            displayResults(result.data);
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
    // 更新标题和信息
    elements.resultsTitle.textContent = `${data.stock.symbol} 期权分析结果`;
    elements.stockInfo.textContent = `${data.stock.name} - 当前价格: $${data.stock.price}`;
    elements.updateTime.textContent = `更新时间: ${new Date(data.timestamp).toLocaleString('zh-CN')}`;
    
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
        row.innerHTML = `
            <td>${option.symbol}</td>
            <td>${option.daysToExpiry}</td>
            <td>$${option.strikePrice}</td>
            <td>$${option.premium}</td>
            <td class="option-type ${option.type === 'call' ? 'call-option' : 'put-option'}">${option.type.toUpperCase()}</td>
            <td>$${option.bid}</td>
            <td>$${option.ask}</td>
            <td>${option.volume || 0}</td>
            <td>${option.openInterest || 0}</td>
            <td>${option.impliedVolatility}%</td>
            <td><span class="score ${getScoreClass(option.score)}">${option.score || '-'}</span></td>
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
        let aValue = a[appState.sortColumn];
        let bValue = b[appState.sortColumn];
        
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