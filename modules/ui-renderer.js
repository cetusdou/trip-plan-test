/**
 * UI 渲染模块（状态驱动）
 * 订阅状态变化，自动渲染 UI，不直接操作 LocalStorage
 */

(function() {
    'use strict';

    // 从全局获取依赖（兼容当前架构）
    let stateManager = null;
    let eventBus = null;
    let tripDataStructure = null;
    
    // 延迟获取依赖（确保在 DOM 加载后）
    function getDependencies() {
        if (typeof window === 'undefined') {
            return;
        }
        stateManager = window.stateManager;
        eventBus = window.eventBus;
        tripDataStructure = window.tripDataStructure;
    }

    /**
     * 初始化 UI 渲染器（订阅状态变化）
     */
    function initializeUIRenderer() {
        getDependencies();
        
            if (!stateManager) {
                console.error('StateManager 未加载，无法初始化 UI 渲染器');
                return;
            }
    
    // 订阅状态变化
    if (stateManager) {
        // 订阅登录状态变化
        stateManager.subscribe('isLoggedIn', (isLoggedIn) => {
            if (isLoggedIn) {
                renderAfterLogin();
            }
        });
        
        // 订阅筛选变化（筛选变化时重新渲染当前日期，不更新状态）
        stateManager.subscribe('currentFilter', () => {
            if (!isRenderingDay) {
                const currentDayId = stateManager.getState('currentDayId');
                if (currentDayId) {
                    setTimeout(() => {
                        if (!isRenderingDay) {
                            renderDayInternal(currentDayId, false);
                        }
                    }, 0);
                }
            }
        });
        
        // 订阅数据更新
        if (eventBus) {
            eventBus.on('data-updated', () => {
                const currentDayId = stateManager.getState('currentDayId');
                if (currentDayId) {
                    renderOverview();
                    renderNavigation();
                    renderDay(currentDayId);
                }
            });
        }
    }
}

    /**
     * 渲染总览
     */
    function renderOverview() {
        getDependencies();
        const header = document.querySelector('.header');
        if (!header) return;
        
        // 从 State Manager 获取数据，而不是直接读取 localStorage
        let tripData = null;
        if (stateManager) {
            tripData = stateManager.getState('tripData');
        }
        
        // 如果没有，从统一结构加载
        if (!tripData && tripDataStructure) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                tripData = unifiedData;
                if (stateManager) {
                    stateManager.setState({ tripData: unifiedData });
                }
            }
        }
        
        if (!tripData) return;
        
        // HTML 转义函数
        function escapeHtml(text) {
            if (!text) return '';
            const str = String(text);
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
    
    header.innerHTML = `
        <div class="header-title-container">
            <h1 class="header-title-display">${escapeHtml(tripData.title || '行程计划')}</h1>
            <input type="text" class="header-title-input" value="${escapeHtml(tripData.title || '行程计划')}" style="display: none;" />
        </div>
        <div class="header-actions">
            <button class="btn-expense-summary" onclick="showExpenseSummary()">开支总计</button>
        </div>
    `;
    
    // 添加标题编辑事件
    attachTitleEditEvents(header);
}

    /**
     * 渲染导航
     */
    function renderNavigation() {
        getDependencies();
        const navContainer = document.querySelector('.nav-container');
        if (!navContainer) return;
        
        // 从 State Manager 获取数据
        let tripData = null;
        if (stateManager) {
            tripData = stateManager.getState('tripData');
        }
        
        // 如果没有，从统一结构加载
        if (!tripData && tripDataStructure) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                tripData = unifiedData;
                if (stateManager) {
                    stateManager.setState({ tripData: unifiedData });
                }
            }
        }
        
        if (!tripData) return;
        
        const days = tripData.days || [];
        
        // HTML 转义函数
        function escapeHtml(text) {
            if (!text) return '';
            const str = String(text);
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
        
        let html = '<h2>行程总览</h2><ul class="nav-list">';
        days.forEach((day, index) => {
            const dayId = day.id || `day${index + 1}`;
            const dayTitle = day.title || `Day ${index + 1}`;
        html += `
            <li class="nav-item">
                <a href="#" class="nav-link" data-day="${dayId}">${escapeHtml(dayTitle)}</a>
            </li>
        `;
    });
    html += '</ul>';
    navContainer.innerHTML = html;
    
    // 添加导航点击事件
    attachNavigationEvents(navContainer);
}

    /**
     * 渲染指定日期
     * 使用内部标志防止递归调用
     */
    let isRenderingDay = false;
    
    /**
     * 内部渲染函数（不更新状态，只执行渲染）
     */
    function renderDayInternal(dayId, shouldUpdateState = true) {
        getDependencies();
        
        // 防止递归调用
        if (isRenderingDay) {
            console.warn('renderDayInternal: 正在渲染中，跳过重复调用', { dayId });
            return;
        }
        
        // 确保 dayId 是字符串，并且不是 tripId
        let dayIdStr = String(dayId);
        if (dayIdStr.startsWith('trip_')) {
            console.error('renderDayInternal: 错误！传入的是 tripId 而不是 dayId', { tripId: dayIdStr });
            if (tripDataStructure) {
                const unifiedData = tripDataStructure.loadUnifiedData();
                if (unifiedData && unifiedData.days && unifiedData.days.length > 0) {
                    dayIdStr = unifiedData.days[0].id || 'day1';
                } else {
                    dayIdStr = 'day1';
                }
            } else {
                dayIdStr = 'day1';
            }
        }
        
        // 使用统一的数据获取函数
        let day = null;
        if (tripDataStructure) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                day = tripDataStructure.getDayData(unifiedData, dayIdStr);
            }
        }
        
        if (!day) {
            console.warn(`未找到日期数据: ${dayIdStr}`);
            return;
        }
        
        // 设置渲染标志
        isRenderingDay = true;
        
        try {
            // 获取 items 并应用排序
            let allItems = day.items || [];
            
            // 应用排序（使用 applyCardOrder）
            if (window.applyCardOrder) {
                allItems = window.applyCardOrder(dayIdStr, allItems);
            } else {
                // 如果没有 applyCardOrder，直接按 order 字段排序
                allItems = allItems.sort((a, b) => {
                    const orderA = a.order !== undefined ? a.order : 999999;
                    const orderB = b.order !== undefined ? b.order : 999999;
                    return orderA - orderB;
                });
            }
            
            // 渲染日期头部
            renderDayHeader(dayIdStr, day);
            
            // 应用筛选
            const filteredItems = applyFilter(allItems, dayIdStr);
            
            // 创建卡片容器（滚动模式）
            const cardsContainer = document.getElementById('cards-container');
            if (!cardsContainer) {
                console.error('找不到 cards-container 元素');
                return;
            }
            
            // 获取 CardSlider（从全局作用域，因为它在 script.js 中定义）
            let CardSliderClass = null;
            if (typeof CardSlider !== 'undefined') {
                CardSliderClass = CardSlider;
            } else if (window && window.CardSlider) {
                CardSliderClass = window.CardSlider;
            }
            
            if (!CardSliderClass) {
                console.error('CardSlider 类未找到，无法渲染卡片。请确保 script.js 已加载。');
                return;
            }
            
            // 创建 CardSlider 实例（这会执行实际渲染）
            const slider = new CardSliderClass('cards-container', filteredItems, dayIdStr);
            
            // 更新状态（在实际渲染完成后）
            if (stateManager && shouldUpdateState) {
                // 检查是否需要更新 currentDayId
                const currentDayId = stateManager.getState('currentDayId');
                const shouldUpdateDayId = currentDayId !== dayIdStr;
                
                // 更新 currentDayId 状态（只在值改变时，使用防递归标志保护）
                if (shouldUpdateDayId) {
                    // 临时重置标志，允许状态更新（因为我们已经完成渲染）
                    isRenderingDay = false;
                    try {
                        stateManager.setState({ currentDayId: dayIdStr });
                    } finally {
                        isRenderingDay = true;
                    }
                }
                
                // 通过事件总线通知日期切换（只在值真正改变时）
                if (shouldUpdateDayId && eventBus && eventBus.emit) {
                    eventBus.emit('day-changed', { dayId: dayIdStr });
                }
            }
            
            // 更新 slider 状态（无论 shouldUpdateState 如何，都需要更新 slider）
            if (stateManager) {
                const wasRendering = isRenderingDay;
                isRenderingDay = false;
                try {
                    stateManager.setState({ currentSlider: slider });
                } finally {
                    isRenderingDay = wasRendering;
                }
            }
        } finally {
            // 重置渲染标志
            isRenderingDay = false;
        }
    }
    
    /**
     * 公开的渲染函数（会更新状态）
     */
    function renderDay(dayId) {
        renderDayInternal(dayId, true);
    }

    /**
     * 渲染日期头部
     */
    function renderDayHeader(dayId, day) {
        const dayHeader = document.querySelector('.day-header');
        if (!dayHeader) return;
        
        // HTML 转义函数
        function escapeHtml(text) {
            if (!text) return '';
            const str = String(text);
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
    
    dayHeader.innerHTML = `
        <div class="day-title-container">
            <h2 class="day-title-display">${escapeHtml(day.title || '')}</h2>
            <input type="text" class="day-title-input" value="${escapeHtml(day.title || '')}" style="display: none;" />
        </div>
        <div class="day-header-actions">
            <button class="add-item-btn" onclick="showAddItemModal('${dayId}')" title="新增行程项">
                新增行程项
            </button>
            <button class="filter-btn" onclick="toggleFilterPanel()" title="筛选">
                筛选
            </button>
            <button class="sort-mode-btn" onclick="toggleSortMode()" title="排序">
                排序
            </button>
        </div>
    `;
    
    // 添加日期标题编辑事件
    attachDayTitleEditEvents(dayHeader, dayId);
}

    /**
     * 应用筛选
     */
    function applyFilter(items, dayId) {
        if (!stateManager) return items;
        
        const currentFilter = stateManager.getState('currentFilter');
        if (!currentFilter) return items;
        
        return items.filter(item => {
            const tag = item.tag || item.category || '其他';
            return currentFilter === 'all' || tag === currentFilter;
        });
    }

    /**
     * 登录后渲染
     */
    function renderAfterLogin() {
        renderOverview();
        renderNavigation();
        
        const currentDayId = stateManager ? stateManager.getState('currentDayId') : 'day1';
        if (currentDayId) {
            renderDay(currentDayId);
        } else {
            renderDay('day1');
        }
    }

    /**
     * 附加标题编辑事件
     */
    function attachTitleEditEvents(header) {
        const titleDisplay = header.querySelector('.header-title-display');
        const titleInput = header.querySelector('.header-title-input');
        
        if (!titleDisplay || !titleInput) return;
        
        titleDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            // 检查写权限
            if (stateManager && !stateManager.getState('isLoggedIn')) {
                return;
            }
            
            titleDisplay.style.display = 'none';
            titleInput.style.display = 'block';
            titleInput.focus();
            titleInput.select();
        });
        
        titleInput.addEventListener('blur', () => {
            const newTitle = titleInput.value.trim();
            if (newTitle) {
                titleDisplay.textContent = newTitle;
                
                // 保存到统一结构
                if (tripDataStructure) {
                    const unifiedData = tripDataStructure.loadUnifiedData();
                    if (unifiedData) {
                        unifiedData.title = newTitle;
                        tripDataStructure.saveUnifiedData(unifiedData);
                        
                        // 更新 State Manager
                        if (stateManager) {
                            stateManager.setState({ tripData: unifiedData });
                        }
                        
                        // 触发同步事件
                        if (eventBus) {
                            eventBus.emit('sync-requested', { type: 'upload' });
                        }
                    }
                }
            }
            
            titleDisplay.style.display = 'block';
            titleInput.style.display = 'none';
        });
        
        titleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleInput.blur();
            }
        });
    }

    /**
     * 附加日期标题编辑事件
     */
    function attachDayTitleEditEvents(dayHeader, dayId) {
        const dayTitleDisplay = dayHeader.querySelector('.day-title-display');
        const dayTitleInput = dayHeader.querySelector('.day-title-input');
        
        if (!dayTitleDisplay || !dayTitleInput) return;
        
        dayTitleDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            // 检查写权限
            if (stateManager && !stateManager.getState('isLoggedIn')) {
                return;
            }
            
            dayTitleDisplay.style.display = 'none';
            dayTitleInput.style.display = 'block';
            dayTitleInput.focus();
            dayTitleInput.select();
        });
        
        dayTitleInput.addEventListener('blur', () => {
            const newTitle = dayTitleInput.value.trim();
            if (newTitle) {
                dayTitleDisplay.textContent = newTitle;
                
                // 保存到统一结构
                if (tripDataStructure) {
                    const unifiedData = tripDataStructure.loadUnifiedData();
                    if (unifiedData) {
                        const dayData = tripDataStructure.getDayData(unifiedData, dayId);
                        if (dayData) {
                            dayData.title = newTitle;
                            tripDataStructure.saveUnifiedData(unifiedData);
                            
                            // 更新 State Manager
                            if (stateManager) {
                                const tripData = stateManager.getState('tripData');
                                if (tripData) {
                                    const dayIndex = tripData.days.findIndex(d => d.id === dayId);
                                    if (dayIndex > -1) {
                                        tripData.days[dayIndex].title = newTitle;
                                        stateManager.setState({ tripData: { ...tripData } });
                                    }
                                }
                            }
                            
                            // 触发同步和事件
                            if (eventBus) {
                                eventBus.emit('sync-requested', { type: 'upload' });
                                eventBus.emit('day-updated', { dayId, title: newTitle });
                            }
                            
                            // 更新导航
                            renderNavigation();
                        }
                    }
                }
            }
            
            dayTitleDisplay.style.display = 'block';
            dayTitleInput.style.display = 'none';
        });
        
        dayTitleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                dayTitleInput.blur();
            }
        });
    }

    /**
     * 附加导航事件
     */
    function attachNavigationEvents(navContainer) {
        navContainer.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const dayId = link.dataset.day;
                
                // 直接调用 renderDay，它会处理状态更新
                renderDay(dayId);
                
                // 更新活动状态
                navContainer.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    // 导出到模块接口
    if (window) {
        window.UIRenderer = {
            initialize: initializeUIRenderer,
            renderOverview,
            renderNavigation,
            renderDay
        };
    }
})();
