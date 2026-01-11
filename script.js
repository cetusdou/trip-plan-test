// Cloudinary 服务已移至 modules/cloudinary.js
// 用户认证已移至 modules/auth-manager.js

// 当前日期管理（已移至 State Manager，这里保留变量供过渡期使用）
let currentDayId = 'day1';

// 工具函数已移至 modules/utils.js

/**
 * 登录成功后的回调函数
 * 下载数据并渲染UI
 */
window.onLoginSuccess = function() {
    // 登录后第一件事：从数据库拉取数据覆盖本地内容
    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        dataSyncFirebase.download(false).then(result => {
            if (result.success) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('数据下载成功', 'success');
                }
                
                // 关键修复：下载完成后，更新 stateManager 的状态
                if (window.stateManager && window.tripDataStructure) {
                    const unifiedData = window.tripDataStructure.loadUnifiedData();
                    if (unifiedData) {
                        // 确保 _backup 字段存在（向后兼容）
                        if (!unifiedData._backup || !Array.isArray(unifiedData._backup)) {
                            unifiedData._backup = [];
                            tripDataStructure.saveUnifiedData(unifiedData);
                            console.log('登录后检测到 _backup 字段缺失，已初始化为空数组');
                            
                            // 如果 Firebase 已配置，自动上传一次，确保 _backup 字段被上传到 Firebase
                            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
                                setTimeout(() => {
                                    dataSyncFirebase.upload(true).then(uploadResult => {
                                        if (uploadResult.success) {
                                            console.log('✅ 已自动上传 _backup 字段到 Firebase');
                                        } else {
                                            console.warn('自动上传 _backup 字段失败:', uploadResult.message);
                                        }
                                    }).catch(error => {
                                        console.error('自动上传 _backup 字段出错:', error);
                                    });
                                }, 500); // 延迟500ms，确保数据已保存
                            }
                        }
                        
                        window.stateManager.setState({ 
                            tripData: unifiedData,
                            unifiedData: unifiedData 
                        });
                    }
                }
                
                // 使用 setTimeout 确保状态更新完成后再渲染
                setTimeout(() => {
                    // 下载完成后渲染内容（使用 UIRenderer 模块）
                    if (window.UIRenderer) {
                        window.UIRenderer.renderOverview();
                        window.UIRenderer.renderNavigation();
                        const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : 'day1';
                        window.UIRenderer.renderDay(dayId || 'day1');
                    }
                }, 100); // 给状态更新一点时间
            } else {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('下载失败: ' + (result.message || '未知错误') + '，使用本地数据', 'error');
                }
                
                // 即使下载失败，也更新 stateManager 使用本地数据
                if (window.stateManager && window.tripDataStructure) {
                    const unifiedData = window.tripDataStructure.loadUnifiedData();
                    if (unifiedData) {
                        window.stateManager.setState({ 
                            tripData: unifiedData,
                            unifiedData: unifiedData 
                        });
                    }
                }
                
                // 即使下载失败，也渲染本地内容
                if (window.UIRenderer) {
                    window.UIRenderer.renderOverview();
                    window.UIRenderer.renderNavigation();
                    const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : 'day1';
                    window.UIRenderer.renderDay(dayId || 'day1');
                }
            }
        }).catch(error => {
            console.error('下载失败:', error);
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('下载失败，使用本地数据', 'error');
            }
            
            // 即使下载失败，也更新 stateManager 使用本地数据
            if (window.stateManager && window.tripDataStructure) {
                const unifiedData = window.tripDataStructure.loadUnifiedData();
                if (unifiedData) {
                    window.stateManager.setState({ 
                        tripData: unifiedData,
                        unifiedData: unifiedData 
                    });
                }
            }
            
            // 即使下载失败，也渲染本地内容
            if (window.UIRenderer) {
                window.UIRenderer.renderOverview();
                window.UIRenderer.renderNavigation();
                const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : 'day1';
                window.UIRenderer.renderDay(dayId || 'day1');
            }
        });
    } else {
        // Firebase未配置，直接渲染本地内容
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus('Firebase未配置，使用本地数据', 'info');
        }
        if (window.UIRenderer) {
            window.UIRenderer.renderOverview();
            window.UIRenderer.renderNavigation();
            const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : 'day1';
            window.UIRenderer.renderDay(dayId || 'day1');
        }
    }
};

// 用户认证相关功能已移至 modules/auth-manager.js
// 使用 AuthManager 模块提供的功能
// 更新同步状态显示
function updateSyncStatus(message, type = 'info') {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `sync-status ${type}`;
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'sync-status';
        }, 3000);
    }
}



// 卡片显示逻辑（滚动模式）
// 将 CardSlider 暴露到全局，供其他模块使用


// // 将 CardSlider 暴露到全局，供其他模块使用
// if (typeof window !== 'undefined') {
//     window.CardSlider = CardSlider;
// }

// 页面初始化（使用 AppInitializer）
document.addEventListener('DOMContentLoaded', async () => {
    // 使用新的应用初始化器（定义严格的生命周期）
    if (typeof window.appInitializer !== 'undefined') {
        try {
            await window.appInitializer.initialize();
        } catch (error) {
            console.error('应用初始化失败，使用降级模式:', error);
            // 降级模式：使用旧的初始化方式
            await fallbackInitialization();
        }
    } else {
        console.warn('AppInitializer 未加载，使用降级模式');
        await fallbackInitialization();
    }
    
    // 添加登录按钮事件监听器（支持移动端）
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        // 点击事件
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.handleLogin === 'function') {
                window.handleLogin();
            } else if (typeof window.AuthManager !== 'undefined' && window.AuthManager.handleLogin) {
                window.AuthManager.handleLogin();
            }
        });
        
        // 触摸事件（移动端）
        loginBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.handleLogin === 'function') {
                window.handleLogin();
            } else if (typeof window.AuthManager !== 'undefined' && window.AuthManager.handleLogin) {
                window.AuthManager.handleLogin();
            }
        });
    }
    
    // 添加密码输入框的回车键事件（移动端兼容）
    const passwordInput = document.getElementById('login-password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (typeof window.handleLogin === 'function') {
                    window.handleLogin();
                } else if (typeof window.AuthManager !== 'undefined' && window.AuthManager.handleLogin) {
                    window.AuthManager.handleLogin();
                }
            }
        });
        
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                if (typeof window.handleLogin === 'function') {
                    window.handleLogin();
                } else if (typeof window.AuthManager !== 'undefined' && window.AuthManager.handleLogin) {
                    window.AuthManager.handleLogin();
                }
            }
        });
    }
    
    // 返回顶部按钮
    if (typeof window.initBackToTop === 'function') {
        window.initBackToTop();
    }
});

/**
 * 降级初始化（当 AppInitializer 不可用时）
 */
async function fallbackInitialization() {
    console.log('使用降级初始化模式...');
    
    // 数据迁移功能已停用（不再从分散存储合并数据）
    // 如果已有统一结构数据，直接使用；如果没有，初始化新结构
    if (typeof tripDataStructure !== 'undefined' && typeof tripData !== 'undefined') {
        try {
            const existingData = tripDataStructure.loadUnifiedData();
            if (!existingData) {
                console.log('初始化统一数据结构...');
                const newData = tripDataStructure.initializeTripDataStructure(tripData);
                tripDataStructure.saveUnifiedData(newData);
                console.log('统一数据结构初始化完成');
            }
        } catch (error) {
            console.error('初始化数据结构失败:', error);
        }
    }
    
    // 检查登录状态（等待Firebase初始化后）
    setTimeout(() => {
        if (typeof window.AuthManager !== 'undefined' && window.AuthManager.checkLoginStatus) {
            window.AuthManager.checkLoginStatus();
        } else if (typeof window.checkLoginStatus === 'function') {
            window.checkLoginStatus();
        } else {
            // 显示登录界面
            if (typeof window.AuthManager !== 'undefined' && window.AuthManager.showLoginUI) {
                window.AuthManager.showLoginUI();
            }
        }
    }, 1000);
}

// 初始化用户选择器
function initUserSelector() {
    updateUserSelector();
    
    document.querySelectorAll('.user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setCurrentUser(btn.dataset.user);
        });
    });
}

// loadTripData 已移至 modules/data-manager.js

// 渲染总览（使用 UIRenderer 模块）
function renderOverview() {
    if (window.UIRenderer && window.UIRenderer.renderOverview) {
        return window.UIRenderer.renderOverview();
    }
    console.error('UIRenderer 未加载，无法渲染总览');
}

// 渲染导航（使用 UIRenderer 模块）
function renderNavigation() {
    if (window.UIRenderer && window.UIRenderer.renderNavigation) {
        return window.UIRenderer.renderNavigation();
    }
    console.error('UIRenderer 未加载，无法渲染导航');
}

// 显示指定日期的行程（使用 UIRenderer 模块）
function showDay(dayId) {
    if (window.UIRenderer && window.UIRenderer.renderDay) {
        return window.UIRenderer.renderDay(dayId);
    }
    console.error('UIRenderer 未加载，无法渲染日期');
}

// applyCardOrder 已移至 modules/data-manager.js

// 应用筛选（支持 State Manager）
let currentFilter = null; // 向后兼容
function applyFilter(items, dayId) {
    // 优先使用 State Manager
    if (window.stateManager) {
        const filter = window.stateManager.getState('currentFilter');
        if (!filter) return items;
        
        return items.filter(item => {
            const tag = item.tag || item.category || '其他';
            return filter === 'all' || tag === filter;
        });
    }
    
    // 降级方案：使用旧变量
    if (!currentFilter) return items;
    
    return items.filter(item => {
        const tag = item.tag || item.category || '其他';
        return currentFilter === 'all' || tag === currentFilter;
    });
}

// 切换筛选面板
function toggleFilterPanel() {
    const panel = document.getElementById('filter-panel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
}

// 设置筛选（支持 State Manager）
function setFilter(tag) {
    // 更新 State Manager
    if (window.stateManager) {
        window.stateManager.setState({ currentFilter: tag });
    }
    
    // 向后兼容：更新旧变量
    currentFilter = tag;
    
    // 重新渲染当前日期
    const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : currentDayId;
    if (dayId) {
        showDay(dayId);
    }
    
    const panel = document.getElementById('filter-panel');
    if (panel) {
        panel.style.display = 'none';
    }
    
    // 触发事件
    if (window.eventBus && window.EventTypes) {
        window.eventBus.emit(window.EventTypes.FILTER_CHANGED, { filter: tag });
    }
}

// 切换排序模式
let currentSlider = null;
function toggleSortMode() {
    const cardsContainer = document.getElementById('cards-container');
    if (!cardsContainer) return;
    
    // 从 stateManager 获取当前的 currentDayId，而不是使用默认值
    const actualDayId = (window.stateManager && window.stateManager.getState) 
        ? window.stateManager.getState('currentDayId') 
        : currentDayId || 'day1';
    
    // 如果currentSlider不存在或日期不匹配，重新创建
    if (!currentSlider || currentSlider.dayId !== actualDayId) {
        // 直接从统一结构加载数据（days 现在是对象结构）
        let dayItems = [];
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const unifiedDay = tripDataStructure.getDayData(unifiedData, actualDayId);
                if (unifiedDay && unifiedDay.items) {
                    // items 现在是对象结构，需要转换为数组
                    if (Array.isArray(unifiedDay.items)) {
                        dayItems = unifiedDay.items;
                    } else if (typeof unifiedDay.items === 'object' && unifiedDay.items !== null) {
                        dayItems = Object.values(unifiedDay.items)
                            .filter(item => item !== null && item !== undefined)
                            .sort((a, b) => {
                                const orderA = a.order !== undefined ? a.order : 999999;
                                const orderB = b.order !== undefined ? b.order : 999999;
                                return orderA - orderB;
                            });
                    }
                }
            }
        }
        
        if (!dayItems || dayItems.length === 0) {
            console.warn(`无法找到 dayId=${actualDayId} 的数据，无法进入排序模式`);
            return;
        }
        
        // 统一数据结构中不再区分自定义项，所有项都在统一结构中
        const allItems = dayItems;
        
        // 为所有项添加tag属性（如果还没有）
        allItems.forEach((item) => {
            if (!item.tag) {
                item.tag = item.category || '其他';
            }
        });
        
        const orderedItems = applyCardOrder(actualDayId, allItems);
        const filteredItems = applyFilter(orderedItems, actualDayId);
        currentSlider = new CardSlider('cards-container', filteredItems, actualDayId);
        
        // 更新全局 currentSlider 和 stateManager（如果需要）
        if (window.stateManager && window.stateManager.setState) {
            window.stateManager.setState({ currentSlider: currentSlider });
        }
        // 同时更新全局变量（向后兼容）
        window.currentSlider = currentSlider;
    }
    
    // 切换排序模式
    if (currentSlider) {
        currentSlider.toggleSortMode();
    }
}

// 数据管理函数已移至 modules/data-manager.js
// addItem, deleteItem (不再区分自定义项和原始项)

// 显示新增行程项模态框
function showAddItemModal(dayId) {
    const modal = document.getElementById('add-item-modal');
    if (modal) {
        modal.dataset.dayId = dayId;
        modal.style.display = 'flex';
        // 清空表单
        document.getElementById('new-item-category').value = '';
        document.getElementById('new-item-time').value = '';
        document.getElementById('new-item-plan').value = '';
        document.getElementById('new-item-note').value = '';
    }
}

// 关闭新增行程项模态框
function closeAddItemModal() {
    const modal = document.getElementById('add-item-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 保存新增的行程项
function saveNewItem() {
    // 检查写权限
    if (!checkWritePermission()) {
        console.error('保存失败：没有写权限');
        return;
    }
    
    const modal = document.getElementById('add-item-modal');
    if (!modal) {
        console.error('保存失败：找不到模态框');
        alert('保存失败：找不到表单');
        return;
    }
    
    const dayId = modal.dataset.dayId;
    if (!dayId) {
        console.error('保存失败：dayId为空');
        alert('保存失败：日期ID无效');
        return;
    }
    
    const category = document.getElementById('new-item-category').value.trim();
    
    if (!category) {
        alert('请输入事项名称');
        return;
    }
    
    const itemData = {
        category: category,
        time: document.getElementById('new-item-time').value.trim(),
        plan: document.getElementById('new-item-plan').value.trim(),
        note: document.getElementById('new-item-note').value.trim(),
        tag: document.getElementById('new-item-tag').value || '其他'
    };
    
    try {
        addItem(dayId, itemData);
        closeAddItemModal();
    } catch (error) {
        console.error('保存行程项时出错:', error);
        alert('保存失败：' + error.message);
    }
}

// 自动同步功能（仅使用Firebase）
let syncTimeout = null;
// 立即触发上传（不防抖）
function triggerImmediateUpload() {
    // 只使用Firebase同步
    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        return dataSyncFirebase.upload(true).then(result => {
            if (result.success) {
                updateSyncStatus('已上传到云端', 'success');
            } else {
                updateSyncStatus('上传失败: ' + (result.message || '未知错误'), 'error');
            }
            return result;
        }).catch(error => {
            console.error('上传失败:', error);
            updateSyncStatus('上传失败: ' + error.message, 'error');
            return { success: false, message: error.message };
        });
    } else {
        console.log('Firebase未配置，跳过上传');
        return Promise.resolve({ success: false, message: 'Firebase未配置' });
    }
}

function autoSync() {
    // 防抖，避免频繁同步（仅使用Firebase）
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    
    syncTimeout = setTimeout(() => {
        // 只使用Firebase同步
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
            dataSyncFirebase.upload().then(result => {
                if (result.success) {
                    updateSyncStatus('已自动同步', 'success');
                }
            }).catch(() => {
                // 静默处理错误
            });
        }
    }, 2000); // 2秒后同步
}

// 手动上传函数（供按钮调用）
function syncUpload() {
    triggerImmediateUpload();
}

// 手动下载函数（供按钮调用）
function syncDownload() {
    // 只使用Firebase同步
    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        updateSyncStatus('正在下载...', 'info');
        dataSyncFirebase.download().then(result => {
            if (result.success) {
                updateSyncStatus('下载成功', 'success');
                
                // 关键修复：下载完成后，更新 stateManager 的状态
                if (window.stateManager && window.tripDataStructure) {
                    const unifiedData = window.tripDataStructure.loadUnifiedData();
                    if (unifiedData) {
                        window.stateManager.setState({ 
                            tripData: unifiedData,
                            unifiedData: unifiedData 
                        });
                    }
                }
                
                // 使用 setTimeout 确保状态更新完成后再渲染
                setTimeout(() => {
                    // 刷新当前页面显示
                    if (window.UIRenderer) {
                        window.UIRenderer.renderOverview();
                        window.UIRenderer.renderNavigation();
                        const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : 'day1';
                        window.UIRenderer.renderDay(dayId || 'day1');
                    } else {
                        // 降级方案：直接调用全局函数
                        renderOverview();
                        renderNavigation();
                        const currentDayId = window.stateManager ? window.stateManager.getState('currentDayId') : null;
                        if (currentDayId && typeof showDay === 'function') {
                            showDay(currentDayId);
                        }
                    }
                }, 100); // 给状态更新一点时间
            } else {
                updateSyncStatus('下载失败: ' + (result.message || '未知错误'), 'error');
            }
        }).catch(error => {
            console.error('下载失败:', error);
            // 安全处理错误信息
            let errorMessage = '下载失败: 未知错误';
            if (error) {
                if (typeof error === 'string') {
                    errorMessage = `下载失败: ${error}`;
                } else if (error.message) {
                    errorMessage = `下载失败: ${error.message}`;
                } else if (error.toString && error.toString() !== '[object Object]') {
                    errorMessage = `下载失败: ${error.toString()}`;
                }
            }
            updateSyncStatus(errorMessage, 'error');
        });
    } else {
        updateSyncStatus('Firebase未配置', 'error');
    }
}

// getAllEditedData 已移至 modules/data-manager.js

// 返回顶部功能
function initBackToTop() {
    const backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.innerHTML = '↑';
    backToTop.setAttribute('aria-label', '返回顶部');
    document.body.appendChild(backToTop);
    
    // 显示/隐藏按钮
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    });
    
    // 点击返回顶部
    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// 切换同步面板展开/折叠
function toggleSyncPanel() {
    const syncControls = document.querySelector('.sync-controls');
    if (syncControls) {
        syncControls.classList.toggle('expanded');
    }
}

// 开支相关功能已移至 modules/expense-manager.js

// ==================== 事件总线集成 ====================
// 初始化事件监听器，实现模块间解耦

// 等待事件总线加载完成
function initEventBusListeners() {
    if (typeof window.eventBus === 'undefined' || typeof window.EventTypes === 'undefined') {
        console.warn('事件总线未加载，延迟初始化事件监听器');
        setTimeout(initEventBusListeners, 100);
        return;
    }
    
    const { eventBus, EventTypes } = window;
    
    // 1. UI刷新请求事件 - CardSlider响应
    eventBus.on(EventTypes.UI_REFRESH_REQUESTED, (data) => {
        const { dayId, itemId, preserveInputs = true } = data;
        
        // 如果当前有CardSlider实例且是同一个day，直接更新它
        if (typeof window.currentSlider !== 'undefined' && window.currentSlider && window.currentSlider.dayId === dayId) {
            // 如果有 itemId，只更新该卡片，否则更新所有卡片
            if (itemId) {
                // 增量更新：只更新指定的卡片
                const cardIndex = window.currentSlider.cards.findIndex(c => c.id === itemId);
                if (cardIndex !== -1) {
                    // 保存当前卡片的展开状态
                    const currentCard = window.currentSlider.container.querySelector(`.card[data-item-id="${itemId}"]`);
                    if (currentCard) {
                        const cardContent = currentCard.querySelector('.card-content');
                        const isExpanded = cardContent && cardContent.classList.contains('expanded');
                        window.currentSlider.setCardExpanded(itemId, isExpanded);
                    }
                    // 重新加载数据
                    const items = typeof window.getDayItems === 'function' ? window.getDayItems(dayId) : [];
                    window.currentSlider.cards = items;
                    // 只重新渲染这个卡片
                    const newCard = window.currentSlider.createCard(items[cardIndex], cardIndex);
                    const oldCard = window.currentSlider.container.querySelector(`.card[data-item-id="${itemId}"]`);
                    if (oldCard && newCard) {
                        oldCard.replaceWith(newCard);
                        window.currentSlider.attachCardEvents(newCard, cardIndex);
                        
                        // 恢复展开状态
                        const savedExpanded = window.currentSlider.getCardExpanded(itemId);
                        if (savedExpanded) {
                            const cardContent = newCard.querySelector('.card-content');
                            const expandBtn = newCard.querySelector('.card-expand-btn');
                            if (cardContent && expandBtn) {
                                cardContent.classList.remove('collapsed');
                                cardContent.classList.add('expanded');
                                expandBtn.style.transform = 'rotate(180deg)';
                                expandBtn.setAttribute('data-expanded', 'true');
                                expandBtn.title = '收起';
                            }
                        }
                    } else {
                        // 如果找不到旧卡片，重新渲染所有卡片
                        window.currentSlider.renderCards();
                        window.currentSlider.attachCardEventsForAll();
                    }
                } else {
                    // 找不到卡片，重新渲染所有
                    window.currentSlider.renderCards();
                    window.currentSlider.attachCardEventsForAll();
                }
            } else {
                // 没有 itemId，更新所有卡片
                window.currentSlider.renderCards();
                window.currentSlider.attachCardEventsForAll();
            }
        } else {
            // 如果没有CardSlider或不是同一个day，调用showDay刷新整个页面
            if (typeof window.showDay === 'function') {
                window.showDay(dayId);
            }
        }
    });
    
    // 2. 数据更新事件 - CardSlider响应（优化：只刷新相关卡片）
    eventBus.on(EventTypes.ITEM_ADDED, (data) => {
        const { dayId, itemId } = data;
        if (typeof window.currentSlider !== 'undefined' && window.currentSlider && window.currentSlider.dayId === dayId) {
            // 重新加载数据并刷新
            const items = typeof window.getDayItems === 'function' ? window.getDayItems(dayId) : [];
            window.currentSlider.cards = items;
            window.currentSlider.renderCards();
            window.currentSlider.attachCardEventsForAll();
        }
    });
    
    eventBus.on(EventTypes.ITEM_DELETED, (data) => {
        const { dayId, itemId } = data;
        if (typeof window.currentSlider !== 'undefined' && window.currentSlider && window.currentSlider.dayId === dayId) {
            // 从cards中移除被删除的项
            window.currentSlider.cards = window.currentSlider.cards.filter(c => c.id !== itemId);
            window.currentSlider.renderCards();
            window.currentSlider.attachCardEventsForAll();
        }
    });
    
    eventBus.on(EventTypes.ITEM_UPDATED, (data) => {
        const { dayId, itemId } = data;
        if (typeof window.currentSlider !== 'undefined' && window.currentSlider && window.currentSlider.dayId === dayId) {
            // 重新加载数据并刷新
            const items = typeof window.getDayItems === 'function' ? window.getDayItems(dayId) : [];
            window.currentSlider.cards = items;
            window.currentSlider.renderCards();
            window.currentSlider.attachCardEventsForAll();
        }
    });
    
    // 3. 日期切换事件 - 可以用于其他模块（如统计面板）
    eventBus.on(EventTypes.DAY_CHANGED, (data) => {
        const { dayId } = data;
        // 可以在这里添加其他需要响应日期切换的模块
        // 例如：更新统计面板、刷新筛选器等
    });
    
    // 4. 同步请求事件 - FirebaseSync响应
    eventBus.on(EventTypes.SYNC_REQUESTED, (data) => {
        const { dayId, itemId } = data;
        
        if (typeof dataSyncFirebase !== 'undefined') {
            if (itemId && dataSyncFirebase.uploadItem) {
                // 使用增量更新，只上传这个 item
                dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                    console.error('上传 item 失败:', error);
                    // 如果增量更新失败，回退到全量上传
                    if (typeof window.triggerImmediateUpload === 'function') {
                        window.triggerImmediateUpload();
                    }
                });
            } else {
                // 没有 itemId 或增量更新不可用，使用全量上传
                if (typeof window.triggerImmediateUpload === 'function') {
                    window.triggerImmediateUpload();
                }
            }
        }
    });
    
    console.log('✅ 事件总线监听器已初始化');
}

// 大图查看器功能
let imageViewerCurrentIndex = 0;
let imageViewerImages = [];

// 打开大图查看器
function openImageViewer(images, startIndex = 0) {
    if (!images || images.length === 0) return;
    
    imageViewerImages = images;
    imageViewerCurrentIndex = startIndex >= 0 && startIndex < images.length ? startIndex : 0;
    
    const modal = document.getElementById('image-viewer-modal');
    const imgElement = document.getElementById('image-viewer-img');
    const infoElement = document.getElementById('image-viewer-info');
    
    if (!modal || !imgElement) return;
    
    // 显示当前图片
    updateImageViewer();
    
    // 显示模态框
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 禁止背景滚动
}

// 更新大图查看器显示的图片
function updateImageViewer() {
    const imgElement = document.getElementById('image-viewer-img');
    const infoElement = document.getElementById('image-viewer-info');
    
    if (!imgElement || imageViewerImages.length === 0) return;
    
    const currentImage = imageViewerImages[imageViewerCurrentIndex];
    if (currentImage) {
        imgElement.src = currentImage;
        if (infoElement) {
            infoElement.textContent = `${imageViewerCurrentIndex + 1} / ${imageViewerImages.length}`;
        }
    }
}

// 关闭大图查看器
function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // 恢复背景滚动
    }
}

// 上一张图片
function prevImageViewerImage() {
    if (imageViewerImages.length === 0) return;
    imageViewerCurrentIndex = (imageViewerCurrentIndex - 1 + imageViewerImages.length) % imageViewerImages.length;
    updateImageViewer();
}

// 下一张图片
function nextImageViewerImage() {
    if (imageViewerImages.length === 0) return;
    imageViewerCurrentIndex = (imageViewerCurrentIndex + 1) % imageViewerImages.length;
    updateImageViewer();
}

// 初始化大图查看器事件
function initImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (!modal) return;
    
    const closeBtn = document.getElementById('image-viewer-close');
    const prevBtn = document.getElementById('image-viewer-prev');
    const nextBtn = document.getElementById('image-viewer-next');
    const imgElement = document.getElementById('image-viewer-img');
    
    // 关闭按钮
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeImageViewer();
        });
    }
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeImageViewer();
        }
    });
    
    // 上一张按钮
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            prevImageViewerImage();
        });
    }
    
    // 下一张按钮
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            nextImageViewerImage();
        });
    }
    
    // 键盘快捷键（ESC 关闭，左右箭头切换）
    document.addEventListener('keydown', (e) => {
        if (modal.style.display === 'none' || modal.style.display === '') return;
        
        if (e.key === 'Escape') {
            closeImageViewer();
        } else if (e.key === 'ArrowLeft') {
            prevImageViewerImage();
        } else if (e.key === 'ArrowRight') {
            nextImageViewerImage();
        }
    });
    
    // 图片触摸滑动支持（移动端）
    if (imgElement) {
        let touchStartX = 0;
        let touchStartY = 0;
        
        imgElement.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        
        imgElement.addEventListener('touchend', (e) => {
            const touch = e.changedTouches[0];
            const moveX = touch.clientX - touchStartX;
            const moveY = touch.clientY - touchStartY;
            
            // 如果水平移动距离大于垂直移动距离，且超过50px，切换图片
            if (Math.abs(moveX) > Math.abs(moveY) && Math.abs(moveX) > 50) {
                if (moveX > 0) {
                    prevImageViewerImage();
                } else {
                    nextImageViewerImage();
                }
            }
        }, { passive: true });
    }
    
    // 暴露全局函数
    window.openImageViewer = openImageViewer;
    window.closeImageViewer = closeImageViewer;
}

// 在DOM加载完成后初始化大图查看器
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initEventBusListeners();
        initImageViewer();
    });
} else {
    // DOM已经加载完成
    initEventBusListeners();
    initImageViewer();
}

