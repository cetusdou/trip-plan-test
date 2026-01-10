// Cloudinary 服务已移至 modules/cloudinary.js
// 用户认证已移至 modules/auth-manager.js

// 当前日期管理（已移至 State Manager，这里保留变量供过渡期使用）
let currentDayId = 'day1';

// 工具函数已移至 modules/utils.js

/**
 * 获取当前用户（统一接口）
 */
function getCurrentUser() {
    if (window.AuthManager && window.AuthManager.getCurrentUser) {
        return window.AuthManager.getCurrentUser();
    }
    return null;
}

/**
 * 检查写权限（统一接口）
 */
function checkWritePermission() {
    if (window.AuthManager && window.AuthManager.checkWritePermission) {
        return window.AuthManager.checkWritePermission();
    }
    return false;
}

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

window.handleLogin = handleLogin;
window.showInitPasswordModal = showInitPasswordModal;
window.initPasswords = initPasswords;
window.closeInitPasswordModal = closeInitPasswordModal;
window.handleLogout = handleLogout;

// 卡片显示逻辑（滚动模式）
// 将 CardSlider 暴露到全局，供其他模块使用
class CardSlider {
    constructor(containerId, cards, dayId) {
        this.container = document.getElementById(containerId);
        this.cards = cards;
        // 使用 Map 存储卡片展开状态（基于 itemId，不保存到 localStorage）
        this.cardExpandedStates = new Map();
        // 使用 Map 存储正在编辑的卡片数据（临时存储，编辑结束时一次性保存）
        this.editingCards = new Map(); // key: itemId, value: { cardIndex, pendingUpdates }
        
        // 【核心修正】强制提取纯净的 ID 字符串
        let cleanId = 'day1'; // 默认值
        if (typeof dayId === 'string') {
            cleanId = dayId;
        } else if (dayId && typeof dayId === 'object') {
            // 如果传进来的是 day 对象或具有 id 的对象
            // 但排除 unifiedData 对象（有 days 数组）
            if (dayId.days && Array.isArray(dayId.days)) {
                console.error('CardSlider: 错误！传入的是 unifiedData 对象而不是 dayId');
                cleanId = 'day1';
            } else if (dayId.items && Array.isArray(dayId.items)) {
                // 这是 day 对象，提取 id
                cleanId = dayId.id || 'day1';
            } else if (dayId.id) {
                cleanId = dayId.id;
            } else {
                cleanId = 'day1';
            }
        }
        
        // 如果是误传了 tripId，修正它
        if (cleanId.startsWith('trip_')) {
            if (window.stateManager) {
                cleanId = window.stateManager.getState('currentDayId') || 'day1';
            } else {
                cleanId = 'day1';
            }
        }
        
        // 最终验证：确保 cleanId 是有效的 dayId
        if (!cleanId || cleanId.startsWith('trip_')) {
            console.error('CardSlider: 无法获取有效的 dayId，使用默认值 day1', {
                originalDayId: dayId,
                cleanId: cleanId
            });
            cleanId = 'day1';
        }
        
        this.dayId = cleanId;
        this.sortMode = false; // 排序模式：false=普通查看模式，true=排序模式（显示上下箭头）
        this.init();
    }

    init() {
        this.renderCards();
        this.attachCardEventsForAll();
    }

    renderCards() {
        // 保存所有活动的输入框状态，防止在渲染时丢失用户输入
        const activeInputs = this.saveActiveInputs();
        
        // 保存所有卡片的展开状态，防止在渲染时丢失
        const expandedStates = new Map();
        const existingCards = this.container.querySelectorAll('.card');
        existingCards.forEach(card => {
            const itemId = card.dataset.itemId || card.querySelector('[data-item-id]')?.dataset.itemId;
            if (itemId) {
                const cardContent = card.querySelector('.card-content');
                const isExpanded = cardContent && cardContent.classList.contains('expanded');
                expandedStates.set(itemId, isExpanded);
            }
        });
        
        // 查找或创建堆叠容器
        let stack = this.container.querySelector('.cards-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'cards-stack sort-mode';
            this.container.appendChild(stack);
        } else {
            stack.innerHTML = '';
            stack.className = 'cards-stack sort-mode';
        }
        
        // 滚动模式：所有卡片平铺显示，可以滚动查看和编辑
        // 根据sortMode决定是否添加sortable-card类
        for (let i = 0; i < this.cards.length; i++) {
            const card = this.createCard(this.cards[i], i);
            if (this.sortMode) {
                card.classList.add('sortable-card');
            }
            stack.appendChild(card);
        }
        
        // 恢复卡片的展开状态
        expandedStates.forEach((isExpanded, itemId) => {
            this.setCardExpanded(itemId, isExpanded);
            const newCard = stack.querySelector(`.card[data-item-id="${itemId}"]`);
            if (newCard) {
                const cardContent = newCard.querySelector('.card-content');
                const expandBtn = newCard.querySelector('.card-expand-btn');
                if (cardContent && expandBtn) {
                    if (isExpanded) {
                        cardContent.classList.remove('collapsed');
                        cardContent.classList.add('expanded');
                        expandBtn.style.transform = 'rotate(180deg)';
                        expandBtn.setAttribute('data-expanded', 'true');
                        expandBtn.title = '收起';
                    } else {
                        cardContent.classList.remove('expanded');
                        cardContent.classList.add('collapsed');
                        expandBtn.style.transform = 'rotate(0deg)';
                        expandBtn.setAttribute('data-expanded', 'false');
                        expandBtn.title = '展开';
                    }
                }
            }
        });
        
        // 恢复活动的输入框状态
        this.restoreActiveInputs(activeInputs);
    }
    
    // 保存所有活动的输入框状态
    saveActiveInputs() {
        const activeInputs = [];
        const stack = this.container.querySelector('.cards-stack');
        if (!stack) return activeInputs;
        
        // 查找所有活动的输入框（正在编辑的）
        const timeInputs = stack.querySelectorAll('.card-time-input[style*="inline-block"], .card-time-input:not([style*="none"])');
        const categoryInputs = stack.querySelectorAll('.card-category-input[style*="inline-block"], .card-category-input:not([style*="none"])');
        const noteInputs = stack.querySelectorAll('.note-input:focus');
        const planInputs = stack.querySelectorAll('.plan-input:focus, .plan-input-container[style*="block"] .plan-input');
        
        // 保存时间输入框状态
        timeInputs.forEach(input => {
            const card = input.closest('.card');
            if (card) {
                const itemId = card.dataset.itemId || card.querySelector('[data-item-id]')?.dataset.itemId;
                if (itemId) {
                    activeInputs.push({
                        type: 'time',
                        itemId: itemId,
                        value: input.value,
                        index: Array.from(stack.querySelectorAll('.card')).indexOf(card)
                    });
                }
            }
        });
        
        // 保存分类输入框状态
        categoryInputs.forEach(input => {
            const card = input.closest('.card');
            if (card) {
                const itemId = card.dataset.itemId || card.querySelector('[data-item-id]')?.dataset.itemId;
                if (itemId) {
                    activeInputs.push({
                        type: 'category',
                        itemId: itemId,
                        value: input.value,
                        index: Array.from(stack.querySelectorAll('.card')).indexOf(card)
                    });
                }
            }
        });
        
        // 保存备注输入框状态
        noteInputs.forEach(input => {
            const card = input.closest('.card');
            if (card) {
                const itemId = card.dataset.itemId || card.querySelector('[data-item-id]')?.dataset.itemId;
                if (itemId) {
                    activeInputs.push({
                        type: 'note',
                        itemId: itemId,
                        value: input.value,
                        index: Array.from(stack.querySelectorAll('.card')).indexOf(card)
                    });
                }
            }
        });
        
        // 保存计划项输入框状态
        planInputs.forEach(input => {
            const card = input.closest('.card');
            if (card) {
                const itemId = card.dataset.itemId || card.querySelector('[data-item-id]')?.dataset.itemId;
                if (itemId) {
                    activeInputs.push({
                        type: 'plan',
                        itemId: itemId,
                        value: input.value,
                        index: Array.from(stack.querySelectorAll('.card')).indexOf(card)
                    });
                }
            }
        });
        
        return activeInputs;
    }
    
    // 恢复活动的输入框状态
    restoreActiveInputs(activeInputs) {
        if (!activeInputs || activeInputs.length === 0) return;
        
        const stack = this.container.querySelector('.cards-stack');
        if (!stack) return;
        
        activeInputs.forEach(inputState => {
            const cards = stack.querySelectorAll('.card');
            const card = cards[inputState.index];
            if (!card) return;
            
            let input = null;
            let display = null;
            
            switch (inputState.type) {
                case 'time':
                    input = card.querySelector('.card-time-input');
                    display = card.querySelector('.card-time-display');
                    break;
                case 'category':
                    input = card.querySelector('.card-category-input');
                    display = card.querySelector('.card-category-display');
                    break;
                case 'note':
                    input = card.querySelector('.note-input');
                    break;
                case 'plan':
                    const planInputContainer = card.querySelector('.plan-input-container');
                    if (planInputContainer) {
                        planInputContainer.style.display = 'block';
                        input = planInputContainer.querySelector('.plan-input');
                    }
                    break;
            }
            
            if (input) {
                input.value = inputState.value;
                // 如果是时间或分类，显示输入框
                if (inputState.type === 'time' || inputState.type === 'category') {
                    if (display) display.style.display = 'none';
                    input.style.display = 'inline-block';
                    // 延迟聚焦，确保 DOM 已更新
                    setTimeout(() => {
                        input.focus();
                        // 将光标移到末尾
                        input.setSelectionRange(input.value.length, input.value.length);
                    }, 0);
                } else if (inputState.type === 'note' || inputState.type === 'plan') {
                    // 备注和计划项输入框直接聚焦
                    setTimeout(() => {
                        input.focus();
                        input.setSelectionRange(input.value.length, input.value.length);
                    }, 0);
                }
            }
        });
    }
    
    // 切换排序模式
    toggleSortMode() {
        this.sortMode = !this.sortMode;
        
        // 如果退出排序模式，保存当前顺序
        if (!this.sortMode) {
            this.saveCardOrder();
            
            // 退出排序模式时，重新加载数据并应用排序
            // 从统一结构获取 items
            let items = [];
            if (typeof tripDataStructure !== 'undefined') {
                const unifiedData = tripDataStructure.loadUnifiedData();
                if (unifiedData) {
                    const day = tripDataStructure.getDayData(unifiedData, this.dayId);
                    if (day && day.items) {
                        items = day.items;
                    }
                }
            }
            
            // 应用排序（确保按照保存的 order 字段排序）
            if (typeof window.applyCardOrder === 'function') {
                items = window.applyCardOrder(this.dayId, items);
            } else {
                // 如果没有 applyCardOrder，直接按 order 字段排序
                items = items.sort((a, b) => {
                    const orderA = a.order !== undefined ? a.order : 999999;
                    const orderB = b.order !== undefined ? b.order : 999999;
                    return orderA - orderB;
                });
            }
            
            // 应用筛选（如果需要）
            if (typeof window.applyFilter === 'function') {
                items = window.applyFilter(items, this.dayId);
            }
            
            this.cards = items;
        } else {
            // 如果进入排序模式，按order字段排序（而不是重新加载）
            // 按order字段排序当前cards数组
            this.cards.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 999999;
                const orderB = b.order !== undefined ? b.order : 999999;
                return orderA - orderB;
            });
        }
        
        this.renderCards();
        // 重新绑定事件
        this.attachCardEventsForAll();
        
        // 排序模式下隐藏所有删除按钮
        if (this.sortMode) {
            const deleteBtns = this.container.querySelectorAll('.delete-item-btn');
            deleteBtns.forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
        // 更新按钮状态
        const sortBtn = document.querySelector('.sort-mode-btn');
        if (sortBtn) {
            if (this.sortMode) {
                sortBtn.textContent = '✅ 完成排序';
                sortBtn.classList.add('active');
            } else {
                sortBtn.textContent = '📋 排序';
                sortBtn.classList.remove('active');
            }
        }
    }
    
    // 为所有卡片绑定事件
    attachCardEventsForAll() {
        const cards = this.container.querySelectorAll('.card');
        cards.forEach((card, index) => {
            const cardIndex = parseInt(card.dataset.index);
            if (isNaN(cardIndex)) {
                return;
            }
            this.attachCardEvents(card, cardIndex);
        });
    }

    createCard(cardData, index) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;
        card.dataset.dayId = this.dayId;
        card.dataset.itemIndex = index;
        // 保存itemId以便后续使用统一结构
        if (cardData.id) {
            card.dataset.itemId = cardData.id;
        }
        
        // 获取留言数据、图片和消费表（优先从统一结构读取）
        const itemId = cardData.id || null;
        let comments = [];
        let images = [];
        let spendItems = [];
        if (itemId && typeof tripDataStructure !== 'undefined') {
            // 【关键修复】每次都获取最新的 unifiedData，确保数据是最新的
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                // 验证 unifiedData 的结构
                if (!unifiedData.days || !Array.isArray(unifiedData.days)) {
                    
                } else {
                    // 【实时容错】确保 dayId 安全：如果实例内的脏了，用全局的
                    let safeDayId = this.dayId;
                    if (!safeDayId || String(safeDayId).startsWith('trip_')) {
                        // this.dayId 无效，使用全局 currentDayId
                        if (window.stateManager) {
                            safeDayId = window.stateManager.getState('currentDayId') || 'day1';
                        } else {
                            safeDayId = 'day1';
                        }
                    }
                    // 确保是字符串
                    safeDayId = String(safeDayId);
                    
                    // 【验证】确保 unifiedData 是有效的对象
                    if (!unifiedData || typeof unifiedData !== 'object' || !unifiedData.days) {
                        console.error('createCard: unifiedData 无效，无法获取 item', {
                            unifiedData,
                            unifiedDataType: typeof unifiedData,
                            hasDays: !!unifiedData.days
                        });
                    } else {
                        const item = tripDataStructure.getItemData(unifiedData, safeDayId, itemId);
                        if (item) {
                            // 确保 comments 是数组
                            comments = Array.isArray(item.comments) ? item.comments : (item.comments ? [item.comments] : []);
                            // 确保 images 是数组
                            images = Array.isArray(item.images) ? item.images : (item.images ? [item.images] : []);
                            // spend 可能是数组或 null
                            spendItems = Array.isArray(item.spend) ? item.spend : (item.spend ? [item.spend] : []);
                        } else {
                            // 找不到 item，可能是数据未加载完成
                        }
                    }
                }
            } else {
                console.warn('createCard: 无法加载统一数据', { dayId: this.dayId, itemId });
            }
        }
        // 确保都是数组类型
        if (!Array.isArray(comments)) comments = [];
        if (!Array.isArray(images)) images = [];
        if (!Array.isArray(spendItems)) spendItems = [];
        
        // 调试：检查 comments 是否正确加载
        if (comments.length > 0) {
        } else if (itemId) {
            // 如果没有 comments，检查一下数据是否正确加载
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                // 确保 dayId 安全
                let safeDayId = this.dayId;
                if (!safeDayId || String(safeDayId).startsWith('trip_')) {
                    if (window.stateManager) {
                        safeDayId = window.stateManager.getState('currentDayId') || 'day1';
                    } else {
                        safeDayId = 'day1';
                    }
                }
                // 确保是字符串
                safeDayId = String(safeDayId);
                
                const item = tripDataStructure.getItemData(unifiedData, safeDayId, itemId);
                if (item) {
                }
            }
        }
        // 如果没有从统一结构获取到spend，使用cardData中的spend
        if (spendItems.length === 0 && cardData.spend) {
            spendItems = Array.isArray(cardData.spend) ? cardData.spend : [];
        }
        // 使用LikeHandler获取item点赞（返回格式：{ section: ['user1', 'user2'] }）
        const itemLikes = typeof window.LikeHandler !== 'undefined' && window.LikeHandler ? 
            window.LikeHandler.getLikes(this.dayId, itemId, 'item') : {};
        
        // 获取标签：使用tag字段，如果没有则使用category
        let cardTag = cardData.tag || cardData.category || '其他';
        // 使用 itemId 获取展开状态
        const isExpanded = this.getCardExpanded(itemId);
        let html = `
            <div class="card-header">
                <div class="card-header-main">
                    <div class="card-sort-buttons">
                        <button class="card-sort-btn card-sort-up" data-index="${index}" title="上移">▲</button>
                        <button class="card-sort-btn card-sort-down" data-index="${index}" title="下移">▼</button>
                    </div>
                    <div class="card-header-content">
                        <div class="card-category-container" data-card-index="${index}">
                            <span class="card-category-display">${window.escapeHtml ? window.escapeHtml(cardData.category) : cardData.category}</span>
                            <input type="text" class="card-category-input" value="${window.escapeHtml ? window.escapeHtml(cardData.category) : cardData.category}" style="display: none;" />
                        </div>
                        <div class="card-time-container" data-card-index="${index}">
                            ${cardData.time ? `
                                <span class="card-time-display">${window.escapeHtml ? window.escapeHtml(cardData.time) : cardData.time}</span>
                                <input type="time" class="card-time-input" value="${window.formatTimeForInput ? window.formatTimeForInput(cardData.time) : cardData.time}" style="display: none;" />
                            ` : `
                                <span class="card-time-display" style="display: inline-block; color: #999; cursor: pointer;" title="点击添加时间">+ 添加时间</span>
                                <input type="time" class="card-time-input" value="" style="display: none;" />
                            `}
                        </div>
                        <div class="card-tag tag-${cardTag}" data-card-index="${index}" data-current-tag="${cardTag}">${this.getTagLabel(cardTag)}</div>
                    </div>
                    <div class="card-header-actions">
                        <button class="delete-item-btn" data-item-id="${cardData.id}" title="删除此项" ${this.sortMode ? 'style="display: none;"' : ''}>×</button>
                    </div>
                </div>
            </div>
            <div class="card-content ${isExpanded ? 'expanded' : 'collapsed'}">
        `;
        
        // 添加图片/地图区域
        html += `
            <div class="card-section image-section">
                <div class="image-upload-controls">
                    <label class="image-upload-btn" title="上传图片" style="cursor: pointer; display: inline-block;">
                        📷 上传图片
                        <input type="file" class="image-upload-input" accept="image/*" multiple style="display: none;" />
                    </label>
                </div>
                <div class="image-container">
                    ${images.length > 0 ? `
                        <div class="image-carousel">
                            <button class="carousel-btn carousel-prev" title="上一张">‹</button>
                            <div class="carousel-wrapper">
                                <div class="carousel-track" style="transform: translateX(0);">
                                    ${images.map((img, imgIndex) => `
                                        <div class="carousel-slide">
                                            <img src="${window.escapeHtml ? window.escapeHtml(img) : img}" alt="图片 ${imgIndex + 1}" class="card-image" data-image-url="${window.escapeHtml ? window.escapeHtml(img) : img}" data-image-index="${imgIndex}" style="cursor: pointer;" title="点击查看大图" />
                                            <button class="image-remove-btn" data-image-index="${imgIndex}" title="删除图片">×</button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <button class="carousel-btn carousel-next" title="下一张">›</button>
                            <div class="carousel-indicators">
                                ${images.map((img, imgIndex) => `
                                    <span class="carousel-dot ${imgIndex === 0 ? 'active' : ''}" data-index="${imgIndex}"></span>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="image-placeholder">
                            <div class="image-placeholder-text">暂无图片</div>
                        </div>
                    `}
                </div>
            </div>
        `;
        
        // 读取计划项（优先从localStorage读取修改后的数据）
        // 优先从统一结构读取plan数据
        let planData = null;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                // 确保 dayId 安全
                let safeDayId = this.dayId;
                if (!safeDayId || String(safeDayId).startsWith('trip_')) {
                    if (window.stateManager) {
                        safeDayId = window.stateManager.getState('currentDayId') || 'day1';
                    } else {
                        safeDayId = 'day1';
                    }
                }
                // 确保是字符串
                safeDayId = String(safeDayId);
                
                const item = tripDataStructure.getItemData(unifiedData, safeDayId, itemId);
                if (item && item.plan) {
                    planData = item.plan;
                }
            }
        }
        
        // 如果统一结构没有plan数据，使用cardData.plan
        if (!planData) {
            planData = cardData.plan;
        }
        
        // 如果还是没有，尝试从旧的存储方式读取（兼容旧数据）
        if (!planData) {
            const planKey = `trip_plan_${this.dayId}_${index}`;
            const savedPlan = localStorage.getItem(planKey);
            if (savedPlan) {
                try {
                    planData = JSON.parse(savedPlan);
                } catch (e) {
                    // 如果解析失败，使用原始数据
                }
            }
        }
        
        // 总是显示计划区域，即使没有计划项也可以添加
        // 支持plan为数组或字符串格式
        // 如果是数组，直接使用；如果是字符串，转换为单元素数组
        // 处理plan数据，支持字符串和对象格式，过滤已删除的项
        let planItems = [];
        if (planData) {
            if (Array.isArray(planData)) {
                planItems = planData
                    .filter(item => {
                        // 过滤掉 null 和 undefined
                        if (!item) return false;
                        // 如果是对象，检查是否有 _deleted 标记（如果有且为 true，则过滤掉）
                        if (typeof item === 'object' && item !== null) {
                            // 如果 _deleted 为 true，过滤掉
                            if (item._deleted === true) return false;
                            // 如果有 _text 字段，确保不为空
                            if (item._text !== undefined && item._text !== null) {
                                if (String(item._text).trim().length === 0) return false;
                            } else {
                                // 如果没有 _text 字段，也保留（可能是旧格式）
                                return true;
                            }
                            return true;
                        }
                        // 如果是字符串，确保不为空
                        if (typeof item === 'string') {
                            return item.trim().length > 0;
                        }
                        return false;
                    });
            } else if (typeof planData === 'string') {
                planItems = planData.trim().length > 0 ? [planData] : [];
            }
        }
        
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title plan">计划</div>
                </div>
                <ul class="plan-list">
                    ${planItems.length > 0 ? planItems
                        .filter(planItem => {
                            // 过滤掉 null 和 undefined
                            return planItem !== null && planItem !== undefined;
                        })
                        .map((planItem, filteredIndex) => {
                        // 安全检查：如果 planItem 为 null 或 undefined，跳过
                        if (!planItem) {
                            return '';
                        }
                        // 支持新旧两种格式：字符串或对象
                        let planItemText = '';
                        if (typeof planItem === 'string') {
                            planItemText = planItem;
                        } else if (planItem && typeof planItem === 'object' && planItem._text) {
                            planItemText = planItem._text;
                        } else if (planItem != null) {
                            // 如果既不是字符串也不是对象，转换为字符串
                            planItemText = String(planItem);
                        }
                        const planHash = (planItem && typeof planItem === 'object' && planItem._hash) ? planItem._hash : null;
                        // 使用原始数组中的索引（不是过滤后的索引）
                        const originalPlanItems = Array.isArray(cardData.plan) ? cardData.plan : (cardData.plan ? [cardData.plan] : []);
                        const originalIndex = originalPlanItems.findIndex(p => {
                            // 安全检查：过滤掉 null 和 undefined
                            if (!p || !planItem) {
                                return false;
                            }
                            if (typeof p === 'string' && typeof planItem === 'string') {
                                return p === planItem;
                            } else if (typeof p === 'object' && typeof planItem === 'object' && p !== null && planItem !== null) {
                                return p._hash === planItem._hash || (p._text === planItem._text && !p._hash && !planItem._hash);
                            }
                            return false;
                        });
                        const planIndex = originalIndex !== -1 ? originalIndex : filteredIndex;
                        const planItemLikes = typeof window.LikeHandler !== 'undefined' && window.LikeHandler ? 
                            window.LikeHandler.getLikes(this.dayId, itemId, 'plan', planIndex) : [];
                        // 新格式：planItemLikes 是数组 ['mrb', 'djy']
                        const planItemLikeCount = Array.isArray(planItemLikes) ? planItemLikes.length : 0;
                        const currentUser = getCurrentUser();
                        const isLiked = Array.isArray(planItemLikes) && currentUser && planItemLikes.includes(currentUser);
                    return `
                        <li class="plan-item">
                            <span class="plan-item-text">${window.escapeHtmlKeepBr ? window.escapeHtmlKeepBr(planItemText) : planItemText}</span>
                            <div class="plan-item-actions">
                                <button class="plan-item-like-btn ${isLiked ? 'liked' : ''}" 
                                        data-plan-index="${planIndex}" 
                                        data-plan-hash="${planHash || ''}"
                                        data-item-id="${itemId || ''}"
                                        title="点赞">
                                    <span class="like-icon">${isLiked ? '♥' : '♥'}</span>
                                    ${planItemLikeCount > 0 ? `<span class="like-count">${planItemLikeCount}</span>` : ''}
                                </button>
                                <button class="plan-item-delete-btn" 
                                        data-card-index="${index}"
                                        data-plan-index="${planIndex}"
                                        data-plan-hash="${planHash || ''}"
                                        data-item-id="${itemId || ''}"
                                        title="删除此项">×</button>
                            </div>
                        </li>
                    `;
                    }).join('') : ''}
                    <li class="plan-item plan-add-item">
                        <button class="plan-add-btn" data-card-index="${index}" title="添加计划项">+ 添加计划项</button>
                        <div class="plan-input-container" style="display: none;">
                            <input type="text" class="plan-input" placeholder="输入计划项..." />
                            <div class="plan-input-actions">
                                <button class="plan-input-confirm">✓</button>
                                <button class="plan-input-cancel">✕</button>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        `;
        
        // 备注区域（总是显示，即使没有内容）
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title note">备注</div>
                </div>
                <div class="card-section-content note-content-container" data-card-index="${index}">
                    <div class="note-content-display markdown-content">${window.markdownToHtml ? window.markdownToHtml(cardData.note || '') : (cardData.note || '')}</div>
                    <textarea class="note-content-input" style="display: none;" placeholder="输入备注（支持 Markdown 格式）...">${window.escapeHtml ? window.escapeHtml(cardData.note || '') : (cardData.note || '')}</textarea>
                </div>
            </div>
        `;
        
        // 添加消费表区域（在备注和留言之间）
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title spend">💰 消费表</div>
                </div>
                <div class="card-section-content spend-content">
                    <table class="spend-table">
                        <thead>
                            <tr>
                                <th>项目</th>
                                <th>金额</th>
                                <th>支出人</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody class="spend-tbody">
                            ${spendItems.length > 0 ? spendItems.map((spendItem, spendIndex) => {
                                const itemName = spendItem.item || '';
                                const amount = spendItem.amount || 0;
                                const payer = spendItem.payer || '';
                                return `
                                <tr class="spend-row" data-spend-index="${spendIndex}">
                                    <td class="spend-item-name">${window.escapeHtml ? window.escapeHtml(itemName) : itemName}</td>
                                    <td class="spend-item-amount">¥${parseFloat(amount).toFixed(2)}</td>
                                    <td class="spend-item-payer">${window.escapeHtml ? window.escapeHtml(payer) : payer}</td>
                                    <td class="spend-item-action">
                                        <button class="spend-delete-btn" data-spend-index="${spendIndex}" title="删除">×</button>
                                    </td>
                                </tr>
                                `;
                            }).join('') : '<tr><td colspan="4" class="spend-empty">暂无消费记录</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr class="spend-total-row">
                                <td colspan="3" class="spend-total-label">总计：</td>
                                <td class="spend-total-amount">¥${spendItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="spend-add-container">
                        <button class="spend-add-btn" data-card-index="${index}" title="添加消费项">+ 添加消费项</button>
                        <div class="spend-input-container" style="display: none;">
                            <input type="text" class="spend-item-input" placeholder="项目名称..." />
                            <input type="number" class="spend-amount-input" placeholder="金额" step="0.01" min="0" />
                            <select class="spend-payer-input">
                                <option value="">请选择支出人</option>
                                <option value="mrb">mrb</option>
                                <option value="djy">djy</option>
                                <option value="共同">共同</option>
                            </select>
                            <div class="spend-input-actions">
                                <button class="spend-input-confirm">✓</button>
                                <button class="spend-input-cancel">✕</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 添加留言区域（移到备注下面）- 总是显示，允许添加新留言
        html += `
            <div class="card-section">
                <div class="card-section-title comment"> 留言</div>
                <div class="comments-container">
                    ${comments.length > 0 ? comments
                        .map((comment, originalIndex) => {
                        // 跳过无效的 comments，但不改变索引
                        if (!comment || !comment.message || !comment.user || !comment.timestamp) {
                            console.warn('跳过无效的 comment:', comment);
                            return '';
                        }
                        
                        try {
                            // 使用原始索引来获取点赞数据（因为 LikeHandler 使用的是统一结构中的索引）
                            const commentLikes = typeof window.LikeHandler !== 'undefined' && window.LikeHandler ? 
                                window.LikeHandler.getLikes(this.dayId, itemId, 'comment', originalIndex) : [];
                            // 新格式：commentLikes 是数组 ['mrb', 'djy']
                            const commentLikeCount = Array.isArray(commentLikes) ? commentLikes.length : 0;
                            const currentUser = (typeof window.AuthManager !== 'undefined' && window.AuthManager.getCurrentUser) 
                                               ? window.AuthManager.getCurrentUser() 
                                               : (typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null);
                            const isLiked = Array.isArray(commentLikes) && commentLikes.includes(currentUser);
                            
                            // 安全获取字段值
                            const commentUser = comment.user || 'unknown';
                            const commentMessage = String(comment.message || '');
                            const commentHash = comment._hash || '';
                            const commentTimestamp = comment.timestamp || Date.now();
                            const formattedTime = window.formatTime ? window.formatTime(commentTimestamp) : '';
                            
                            return `
                            <div class="comment-item ${commentUser === 'mrb' ? 'user-a' : 'user-b'}" data-comment-hash="${commentHash}">
                                <div class="comment-header">
                                    <span class="comment-user">${commentUser === 'mrb' ? '👤 mrb' : '👤 djy'}</span>
                                    <span class="comment-time">${formattedTime}</span>
                                    <button class="comment-delete-btn" data-comment-hash="${commentHash}" title="删除留言">×</button>
                                </div>
                                <div class="comment-content">${window.escapeHtml ? window.escapeHtml(commentMessage) : commentMessage}</div>
                                <button class="comment-like-btn ${isLiked ? 'liked' : ''}" 
                                        data-comment-index="${originalIndex}" title="点赞">
                                    <span class="like-icon">${isLiked ? '♥' : '♥'}</span>
                                    ${commentLikeCount > 0 ? `<span class="like-count">${commentLikeCount}</span>` : ''}
                                </button>
                            </div>
                        `;
                        } catch (error) {
                            console.error('渲染 comment 失败:', error, comment);
                            return ''; // 如果渲染失败，返回空字符串
                        }
                    })
                    .filter(html => html !== '') // 过滤掉空字符串
                    .join('') : '<div class="no-comments">暂无留言</div>'}
                </div>
                <div class="comment-input-container">
                    <textarea class="comment-input" placeholder="输入留言..." rows="2"></textarea>
                    <button class="comment-submit">发送</button>
                </div>
            </div>
        `;
        
        // 关闭card-content
        html += '</div>';
        
        // 在卡片最下方添加折叠展开按钮（在card-content外面）
        html += `
            <div class="card-footer">
                <button class="card-expand-btn" data-expanded="${isExpanded}" title="${isExpanded ? '收起' : '展开'}" style="transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};">
                    ▼
                </button>
            </div>
        `;
        
        // 关闭整个card
        html += '</div>';
        card.innerHTML = html;
        
        // 添加事件监听器
        this.attachCardEvents(card, index);
        
        return card;
    }
    
    attachCardEvents(card, index) {
        // 时间编辑事件
        const timeContainer = card.querySelector('.card-time-container');
        if (timeContainer) {
            const timeDisplay = timeContainer.querySelector('.card-time-display');
            const timeInput = timeContainer.querySelector('.card-time-input');
            
            if (timeDisplay && timeInput) {
                // 点击显示区域，切换到编辑模式
                timeDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!checkWritePermission()) return;
                    
                    timeDisplay.style.display = 'none';
                    timeInput.style.display = 'inline-block';
                    timeInput.focus();
                    // 如果没有值，不选中（让用户直接输入）
                    if (timeInput.value) {
                        timeInput.select();
                    }
                });
                
                // 时间输入框失去焦点时保存
                timeInput.addEventListener('blur', () => {
                    const newTime = timeInput.value;
                    const cardData = this.cards[index];
                    if (!cardData) return;
                    
                    const itemId = cardData.id;
                    if (newTime) {
                        // 格式化时间为 HH:mm
                        const formattedTime = window.formatTimeForDisplay ? window.formatTimeForDisplay(newTime) : newTime;
                        timeDisplay.textContent = formattedTime;
                        timeDisplay.style.color = ''; // 移除灰色，恢复正常颜色
                        timeDisplay.title = '点击编辑时间';
                        
                        // 使用统一的更新方法
                        if (itemId) {
                            this.updateCardData(itemId, { time: formattedTime });
                            // 编辑结束后触发同步
                            if (typeof triggerImmediateUpload === 'function') {
                                triggerImmediateUpload();
                            }
                        }
                    } else {
                        // 如果清空时间，恢复显示"添加时间"提示
                        timeDisplay.textContent = '+ 添加时间';
                        timeDisplay.style.color = '#999';
                        timeDisplay.title = '点击添加时间';
                        
                        // 使用统一的更新方法
                        if (itemId) {
                            this.updateCardData(itemId, { time: '' });
                            // 只上传这个 item，不进行全量上传
                            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                    console.error('上传 item 失败:', error);
                                });
                            }
                        }
                    }
                    
                    timeDisplay.style.display = 'inline-block';
                    timeInput.style.display = 'none';
                });
                
                // 按Enter键保存
                timeInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        timeInput.blur();
                    }
                });
            }
        }
        
        // 分类（category）编辑事件
        const categoryContainer = card.querySelector('.card-category-container');
        if (categoryContainer) {
            const categoryDisplay = categoryContainer.querySelector('.card-category-display');
            const categoryInput = categoryContainer.querySelector('.card-category-input');
            
            if (categoryDisplay && categoryInput) {
                categoryDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!checkWritePermission()) return;
                    
                    categoryDisplay.style.display = 'none';
                    categoryInput.style.display = 'inline-block';
                    categoryInput.focus();
                    categoryInput.select();
                });
                
                categoryInput.addEventListener('blur', () => {
                    const newCategory = categoryInput.value.trim();
                    if (newCategory) {
                        categoryDisplay.textContent = newCategory;
                        
                        // 使用统一的更新方法
                        const cardData = this.cards[index];
                        if (cardData) {
                            const itemId = cardData.id;
                            if (itemId) {
                                this.updateCardData(itemId, { category: newCategory });
                                // 只上传这个 item，不进行全量上传
                                if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                        console.error('上传 item 失败:', error);
                                    });
                                }
                            }
                        }
                    }
                    
                    categoryDisplay.style.display = 'inline-block';
                    categoryInput.style.display = 'none';
                });
                
                categoryInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        categoryInput.blur();
                    }
                });
            }
        }
        
        // 备注（note）编辑事件
        const noteContainer = card.querySelector('.note-content-container');
        if (noteContainer) {
            const noteDisplay = noteContainer.querySelector('.note-content-display');
            const noteInput = noteContainer.querySelector('.note-content-input');
            
            if (noteDisplay && noteInput) {
                // 保存备注的函数
                const saveNote = () => {
                    const newNote = noteInput.value.trim();
                    
                    // 使用统一的更新方法
                    const cardData = this.cards[index];
                    if (cardData) {
                        const itemId = cardData.id;
                        if (itemId) {
                            try {
                                // updateCardData 内部会处理增量更新和本地保存
                                // 但是为了确保数据正确保存，我们需要确保本地数据已经更新
                                if (typeof tripDataStructure !== 'undefined') {
                                    const unifiedData = tripDataStructure.loadUnifiedData();
                                    if (unifiedData) {
                                        const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                                        if (item) {
                                            // 先更新本地数据
                                            item.note = newNote;
                                            item._updatedAt = new Date().toISOString();
                                            tripDataStructure.saveUnifiedData(unifiedData);
                                        }
                                    }
                                }
                                
                                // 调用 updateCardData 进行增量更新
                                this.updateCardData(itemId, { note: newNote });
                                
                                // 使用 uploadItem 确保数据上传到云端（updateCardData 的增量更新可能失败）
                                if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).then(result => {
                                        if (result.success) {
                                            console.log('备注已成功上传到云端');
                                        } else {
                                            console.warn('备注上传失败:', result.message);
                                        }
                                    }).catch(error => {
                                        console.error('上传 item 失败:', error);
                                    });
                                }
                                
                                // 更新显示内容
                                noteDisplay.innerHTML = window.markdownToHtml ? window.markdownToHtml(newNote || '') : (newNote || '');
                            } catch (error) {
                                console.error('更新备注失败:', error);
                            }
                        }
                    }
                    
                    // 无论更新是否成功，都要隐藏输入框
                    noteDisplay.style.display = 'block';
                    noteInput.style.display = 'none';
                };
                
                // 标记输入框是否处于编辑状态
                let isEditing = false;
                
                noteDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!checkWritePermission()) return;
                    
                    noteDisplay.style.display = 'none';
                    noteInput.style.display = 'block';
                    noteInput.focus();
                    isEditing = true;
                });
                
                // 处理 blur 事件
                let isSaving = false;
                const handleBlur = () => {
                    // 防止重复保存
                    if (isSaving || !isEditing) return;
                    isSaving = true;
                    isEditing = false;
                    
                    // 使用 setTimeout 延迟处理，确保其他点击事件先执行
                    setTimeout(() => {
                        try {
                            // 检查输入框是否仍然可见（可能已经被其他操作隐藏）
                            if (noteInput.style.display !== 'none' && noteInput.offsetParent !== null) {
                                saveNote();
                            } else {
                                // 如果已经被隐藏，确保状态正确
                                noteDisplay.style.display = 'block';
                                noteInput.style.display = 'none';
                            }
                        } catch (error) {
                            console.error('保存备注时出错:', error);
                            // 即使出错也要隐藏输入框
                            noteDisplay.style.display = 'block';
                            noteInput.style.display = 'none';
                        } finally {
                            isSaving = false;
                        }
                    }, 200);
                };
                
                // 添加文档级别的点击监听器作为备用方案
                let documentClickHandler = null;
                
                const setupDocumentClickHandler = () => {
                    // 如果已经有监听器，先移除
                    if (documentClickHandler) {
                        document.removeEventListener('click', documentClickHandler, true);
                    }
                    
                    documentClickHandler = (e) => {
                        // 如果输入框可见且点击的不是输入框相关元素
                        if (isEditing && noteInput.style.display === 'block' && 
                            !noteContainer.contains(e.target) && 
                            !e.target.closest('.note-content-container')) {
                            // 手动触发保存
                            handleBlur();
                        }
                    };
                    
                    // 使用捕获阶段，确保在其他点击事件之前处理
                    setTimeout(() => {
                        document.addEventListener('click', documentClickHandler, true);
                    }, 100);
                };
                
                // 当输入框获得焦点时，添加文档点击监听器
                noteInput.addEventListener('focus', () => {
                    setupDocumentClickHandler();
                });
                
                // 当输入框失去焦点时，移除文档点击监听器并保存
                noteInput.addEventListener('blur', () => {
                    handleBlur();
                    // 延迟移除监听器，确保点击事件能先处理
                    setTimeout(() => {
                        if (documentClickHandler) {
                            document.removeEventListener('click', documentClickHandler, true);
                            documentClickHandler = null;
                        }
                    }, 300);
                });
                
                // 添加 Enter 键保存（Ctrl+Enter 或 Cmd+Enter）
                noteInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        saveNote();
                        noteInput.blur();
                    }
                });
            }
        }
        
        // 图片上传事件
        const imageUploadBtn = card.querySelector('.image-upload-btn');
        const imageUploadInput = card.querySelector('.image-upload-input');
        
        if (imageUploadBtn && imageUploadInput) {
            // console.log('找到图片上传按钮和输入框，开始绑定事件', { cardIndex: index });
            
            // 防止重复触发的标志
            let isProcessing = false;
            let touchStartTime = 0;
            let touchStartY = 0;
            let touchStartX = 0;
            
            // 由于使用了 label，点击 label 会自动触发 input
            // 只需要处理 change 事件即可
            // 但为了兼容性，仍然保留一些事件处理
            
            // 移除旧的事件监听器（如果存在）- 通过克隆节点来移除所有事件监听器
            if (imageUploadInput.dataset.uploadHandler && imageUploadInput.parentNode) {
                const newInput = imageUploadInput.cloneNode(true);
                imageUploadInput.parentNode.replaceChild(newInput, imageUploadInput);
            }
            
            // 获取实际的 input 元素（可能是新克隆的）
            const actualInput = card.querySelector('.image-upload-input');
            if (!actualInput) return;
            
            // 标记已绑定事件监听器
            actualInput.dataset.uploadHandler = 'bound';
            
            // 创建新的事件处理函数
            const uploadHandler = (e) => {
                // 防止重复处理
                if (isProcessing) {
                    console.log('图片上传正在处理中，跳过重复触发');
                    e.target.value = ''; // 清空输入，防止重复触发
                    return;
                }
                isProcessing = true;
                
                // 延迟处理，确保在移动设备上文件选择完成
                setTimeout(() => {
                    const files = Array.from(e.target.files || []);
                    
                    if (files.length === 0) {
                        // 如果没有文件，可能是用户取消了选择
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                        return;
                    }
                    
                    // 检查文件大小（限制为10MB）
                    const maxSize = 10 * 1024 * 1024; // 10MB
                    const validFiles = files.filter(file => {
                        // 验证文件类型
                        if (!file.type || !file.type.startsWith('image/')) {
                            alert(`文件 "${file.name}" 不是有效的图片文件`);
                            return false;
                        }
                        
                        // 验证文件大小
                        if (file.size > maxSize) {
                            alert(`文件 "${file.name}" 太大（${(file.size / 1024 / 1024).toFixed(2)}MB），最大支持10MB`);
                            return false;
                        }
                        
                        // 验证文件大小不为0
                        if (file.size === 0) {
                            alert(`文件 "${file.name}" 为空，无法上传`);
                            return false;
                        }
                        
                        return true;
                    });
                    
                    if (validFiles.length === 0) {
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                        return;
                    }
                    
                    // 显示上传进度提示
                    const uploadBtn = card.querySelector('.image-upload-btn');
                    const originalText = uploadBtn ? uploadBtn.textContent : '';
                    
                    // 更新状态栏
                    if (typeof updateSyncStatus === 'function') {
                        updateSyncStatus(`正在上传 ${validFiles.length} 张图片到 Cloudinary...`, 'info');
                    }
                    
                    if (uploadBtn) {
                        uploadBtn.textContent = `📤 上传中 (0/${validFiles.length})...`;
                        uploadBtn.disabled = true;
                    }
                    
                    // 跟踪上传进度
                    let uploadedCount = 0;
                    
                    // 上传图片到 Cloudinary
                    const uploadPromises = validFiles.map((file, fileIndex) => {
                        return cloudinaryService.uploadImage(file)
                            .then(result => {
                                uploadedCount++;
                                console.log(`✅ 图片 ${file.name} 上传成功:`, result.url);
                                
                                // 更新按钮进度
                                if (uploadBtn) {
                                    uploadBtn.textContent = `📤 上传中 (${uploadedCount}/${validFiles.length})...`;
                                }
                                
                                // 验证 URL 是否为有效的 Cloudinary URL
                                if (!result.url || !result.url.includes('cloudinary.com')) {
                                    console.warn('⚠️ 警告：返回的 URL 可能不是有效的 Cloudinary URL:', result.url);
                                }
                                
                                return {
                                    url: result.url,
                                    fileName: file.name,
                                    publicId: result.publicId
                                };
                            })
                            .catch(error => {
                                console.error(`❌ 图片 ${file.name} 上传失败:`, error);
                                throw error;
                            });
                    });
                    
                    // 保留旧代码作为备用（如果需要）
                    const readers = validFiles.map((file, fileIndex) => {
                        return new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            
                            // 设置超时（30秒）
                            const timeout = setTimeout(() => {
                                reader.abort();
                                reject(new Error(`读取文件 "${file.name}" 超时`));
                            }, 30000);
                            
                            reader.onload = (event) => {
                                clearTimeout(timeout);
                                // 验证读取结果是否为有效的图片数据
                                if (!event.target.result || !event.target.result.startsWith('data:image/')) {
                                    reject(new Error(`文件 "${file.name}" 不是有效的图片格式`));
                                } else {
                                    resolve(event.target.result);
                                }
                            };
                            
                            reader.onerror = (error) => {
                                clearTimeout(timeout);
                                reject(new Error(`读取文件 "${file.name}" 失败: ${error.message || '未知错误'}`));
                            };
                            
                            reader.onabort = () => {
                                clearTimeout(timeout);
                                reject(new Error(`读取文件 "${file.name}" 被中断`));
                            };
                            
                            try {
                                reader.readAsDataURL(file);
                            } catch (error) {
                                clearTimeout(timeout);
                                reject(new Error(`无法读取文件 "${file.name}": ${error.message}`));
                            }
                        });
                    });
                    
                    // 使用 Cloudinary 上传
                    Promise.all(uploadPromises).then(imageResults => {
                        const itemId = card.dataset.itemId || null;
                        const currentImages = this.getImages(this.dayId, index, itemId);
                        
                        // 提取 URL 数组
                        const imageUrls = imageResults.map(img => img.url);
                        const uploadedFileNames = imageResults.map(img => img.fileName).join('、');
                        
                        // 去重：只添加不存在的图片 URL
                        const existingUrls = new Set(currentImages);
                        const newImageUrls = imageUrls.filter(url => !existingUrls.has(url));
                        
                        // 只保存 Cloudinary URL，不保存 base64
                        const newImages = [...currentImages, ...newImageUrls];
                        this.setImages(this.dayId, index, newImages, itemId);
                        
                        // 如果所有图片都已存在，说明可能是重复触发
                        if (newImageUrls.length === 0 && imageUrls.length > 0) {
                            console.warn('⚠️ 警告：所有图片都已存在，可能是重复触发上传');
                            isProcessing = false; // 重置标志
                            e.target.value = ''; // 清空输入
                            if (uploadBtn) {
                                uploadBtn.disabled = false;
                                uploadBtn.textContent = originalText;
                            }
                            return;
                        }
                        
                        // 验证图片是否能正常显示（检查 URL 格式）
                        const invalidUrls = imageUrls.filter(url => !url || !url.startsWith('http'));
                        if (invalidUrls.length > 0) {
                            console.warn('⚠️ 警告：部分图片 URL 格式可能不正确:', invalidUrls);
                        }
                        
                        // 显示成功消息
                        const successMessage = `✅ 成功上传 ${imageUrls.length} 张图片到 Cloudinary${uploadedFileNames ? `: ${uploadedFileNames}` : ''}`;
                        console.log(successMessage);
                        
                        if (typeof updateSyncStatus === 'function') {
                            updateSyncStatus(successMessage, 'success');
                            // 3秒后清除成功消息
                            setTimeout(() => {
                                if (typeof updateSyncStatus === 'function') {
                                    updateSyncStatus('', '');
                                }
                            }, 3000);
                        }
                        
                        this.renderCards();
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                console.error('上传 item 到 Firebase 失败:', error);
                            });
                        } else {
                            // 如果没有部分上传方法，使用全量上传
                            triggerImmediateUpload();
                        }
                        
                        // 恢复按钮状态并显示成功提示
                        if (uploadBtn) {
                            uploadBtn.textContent = '✅ 上传完成';
                            uploadBtn.style.color = '#28a745';
                            setTimeout(() => {
                                uploadBtn.textContent = originalText;
                                uploadBtn.style.color = '';
                                uploadBtn.disabled = false;
                            }, 2000);
                        } else {
                            if (uploadBtn) {
                                uploadBtn.textContent = originalText;
                                uploadBtn.disabled = false;
                            }
                        }
                        
                        // 清空文件输入并重置标志
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                    }).catch(error => {
                        console.error('❌ 图片上传失败:', error);
                        const errorMessage = `图片上传失败: ${error.message}`;
                        
                        if (typeof updateSyncStatus === 'function') {
                            updateSyncStatus(errorMessage, 'error');
                            setTimeout(() => {
                                if (typeof updateSyncStatus === 'function') {
                                    updateSyncStatus('', '');
                                }
                            }, 5000);
                        }
                        
                        alert(errorMessage);
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                        
                        // 恢复按钮状态
                        if (uploadBtn) {
                            uploadBtn.textContent = originalText;
                            uploadBtn.disabled = false;
                            uploadBtn.style.color = '';
                        }
                    });
                }, 100); // 延迟100ms，确保文件选择完成
            };
            
            // 绑定事件监听器
            actualInput.addEventListener('change', uploadHandler);
        }
        
        // 标签点击修改
        const cardTag = card.querySelector('.card-tag');
        if (cardTag) {
            cardTag.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.editTag(index);
            });
        }
        
        // 计划项添加按钮
        const planAddBtn = card.querySelector('.plan-add-btn');
        const planInputContainer = card.querySelector('.plan-input-container');
        const planInput = card.querySelector('.plan-input');
        const planInputConfirm = card.querySelector('.plan-input-confirm');
        const planInputCancel = card.querySelector('.plan-input-cancel');
        
        if (planAddBtn && planInputContainer) {
            // 点击添加按钮，显示输入框
            planAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                planAddBtn.style.display = 'none';
                planInputContainer.style.display = 'flex';
                planInput.focus();
            });
            
            // 确认添加
            if (planInputConfirm && planInput) {
                const confirmAdd = async () => {
                    const newItem = planInput.value.trim();
                    console.log('确认添加计划项:', newItem, 'cardIndex:', index);
                    if (newItem) {
                        try {
                            await this.addPlanItem(index, newItem);
                            console.log('addPlanItem 执行完成');
                            // 重置输入框和UI状态
                            planInput.value = '';
                            planInputContainer.style.display = 'none';
                            planAddBtn.style.display = 'block';
                        } catch (error) {
                            console.error('添加计划项失败:', error);
                        }
                    } else {
                        // 如果为空，恢复按钮显示
                        planInputContainer.style.display = 'none';
                        planAddBtn.style.display = 'block';
                        planInput.value = '';
                    }
                };
                
                planInputConfirm.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    confirmAdd();
                });
                
                planInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        confirmAdd();
                    }
                });
            }
            
            // 取消按钮
            if (planInputCancel) {
                planInputCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    planInput.value = '';
                    planInputContainer.style.display = 'none';
                    planAddBtn.style.display = 'block';
                });
            }
            
            // 取消添加
            if (planInputCancel) {
                planInputCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    planInputContainer.style.display = 'none';
                    planAddBtn.style.display = 'block';
                    planInput.value = '';
                });
            }
        }
        
        // 展开/收起功能 - 同时绑定到footer和按钮
        const cardFooter = card.querySelector('.card-footer');
        const expandBtn = card.querySelector('.card-expand-btn');
        
        // 为footer添加点击事件（作为备用）
        if (cardFooter) {
            cardFooter.addEventListener('click', (e) => {
                // 如果点击的不是按钮本身，也触发展开/收起
                if (e.target !== expandBtn && !expandBtn.contains(e.target)) {
                    if (expandBtn) {
                        expandBtn.click();
                    }
                }
            });
        }
        
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const itemId = card.dataset.itemId || null;
                const isExpanded = expandBtn.dataset.expanded === 'true';
                const newIsExpanded = !isExpanded;
                this.setCardExpanded(itemId, newIsExpanded);
                
                // 直接更新当前卡片的展开状态，避免重新渲染整个卡片列表
                const cardContent = card.querySelector('.card-content');
                if (cardContent) {
                    if (newIsExpanded) {
                        cardContent.classList.remove('collapsed');
                        cardContent.classList.add('expanded');
                        expandBtn.style.transform = 'rotate(180deg)';
                        expandBtn.setAttribute('data-expanded', 'true');
                        expandBtn.title = '收起';
                    } else {
                        cardContent.classList.remove('expanded');
                        cardContent.classList.add('collapsed');
                        expandBtn.style.transform = 'rotate(0deg)';
                        expandBtn.setAttribute('data-expanded', 'false');
                        expandBtn.title = '展开';
                    }
                } else {
                    // 如果找不到card-content，重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                }
            });
            
            // 也处理触摸事件，确保移动设备上也能正常工作
            expandBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const itemId = card.dataset.itemId || null;
                const isExpanded = expandBtn.dataset.expanded === 'true';
                const newIsExpanded = !isExpanded;
                this.setCardExpanded(itemId, newIsExpanded);
                
                // 直接更新当前卡片的展开状态，避免重新渲染整个卡片列表
                const cardContent = card.querySelector('.card-content');
                if (cardContent) {
                    if (newIsExpanded) {
                        cardContent.classList.remove('collapsed');
                        cardContent.classList.add('expanded');
                        expandBtn.style.transform = 'rotate(180deg)';
                        expandBtn.setAttribute('data-expanded', 'true');
                        expandBtn.title = '收起';
                    } else {
                        cardContent.classList.remove('expanded');
                        cardContent.classList.add('collapsed');
                        expandBtn.style.transform = 'rotate(0deg)';
                        expandBtn.setAttribute('data-expanded', 'false');
                        expandBtn.title = '展开';
                    }
                } else {
                    // 如果找不到card-content，重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                }
            });
        }
        
        // 排序按钮（仅在排序模式下启用）
        const sortButtons = card.querySelector('.card-sort-buttons');
        if (sortButtons) {
            if (this.sortMode) {
                sortButtons.style.display = 'flex';
                
                const upBtn = sortButtons.querySelector('.card-sort-up');
                const downBtn = sortButtons.querySelector('.card-sort-down');
                
                // 清除旧的事件监听器（通过克隆节点）
                const newSortButtons = sortButtons.cloneNode(true);
                sortButtons.parentNode.replaceChild(newSortButtons, sortButtons);
                
                const newUpBtn = newSortButtons.querySelector('.card-sort-up');
                const newDownBtn = newSortButtons.querySelector('.card-sort-down');
                
                // 禁用第一个的上移按钮和最后一个的下移按钮
                if (newUpBtn) {
                    if (index === 0) {
                        newUpBtn.disabled = true;
                    } else {
                        newUpBtn.disabled = false;
                        newUpBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.moveCardUp(index);
                        });
                    }
                }
                
                if (newDownBtn) {
                    if (index === this.cards.length - 1) {
                        newDownBtn.disabled = true;
                    } else {
                        newDownBtn.disabled = false;
                        newDownBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.moveCardDown(index);
                        });
                    }
                }
            } else {
                sortButtons.style.display = 'none';
            }
        }
        
        // 图片轮播控制
        const carousel = card.querySelector('.image-carousel');
        if (carousel) {
            let currentIndex = 0;
            const itemId = card.dataset.itemId || null;
            const images = this.getImages(this.dayId, index, itemId);
            const track = carousel.querySelector('.carousel-track');
            const prevBtn = carousel.querySelector('.carousel-prev');
            const nextBtn = carousel.querySelector('.carousel-next');
            const dots = carousel.querySelectorAll('.carousel-dot');
            const removeBtns = carousel.querySelectorAll('.image-remove-btn');
            
            const updateCarousel = () => {
                track.style.transform = `translateX(-${currentIndex * 100}%)`;
                dots.forEach((dot, i) => {
                    dot.classList.toggle('active', i === currentIndex);
                });
            };
            
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIndex = (currentIndex - 1 + images.length) % images.length;
                    updateCarousel();
                });
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIndex = (currentIndex + 1) % images.length;
                    updateCarousel();
                });
            }
            
            dots.forEach((dot, i) => {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIndex = i;
                    updateCarousel();
                });
            });
            
            // 触摸滑动支持（用于轮播切换，但只在水平滑动时切换，垂直滑动允许页面滚动）
            let carouselStartX = 0;
            let carouselStartY = 0;
            let carouselIsDragging = false;
            let carouselDirection = null; // 'horizontal' 或 'vertical' 或 null
            
            track.addEventListener('touchstart', (e) => {
                // 如果是图片或删除按钮，不处理轮播滑动
                if (e.target.closest('.card-image') || e.target.closest('.image-remove-btn')) {
                    return;
                }
                carouselStartX = e.touches[0].clientX;
                carouselStartY = e.touches[0].clientY;
                carouselIsDragging = true;
                carouselDirection = null;
            }, { passive: true });
            
            track.addEventListener('touchmove', (e) => {
                if (!carouselIsDragging || e.touches.length === 0) return;
                
                const touch = e.touches[0];
                const moveX = Math.abs(touch.clientX - carouselStartX);
                const moveY = Math.abs(touch.clientY - carouselStartY);
                
                // 如果已经确定是垂直滑动，立即退出，允许页面滚动
                if (carouselDirection === 'vertical') {
                    carouselIsDragging = false;
                    return; // 不阻止默认行为，允许页面正常滚动
                }
                
                // 优先检测垂直滑动：如果垂直移动距离明显大于水平移动距离，认为是垂直滑动（页面滚动）
                // 必须在任何 preventDefault 调用之前检测，确保垂直滚动不被阻止
                if (!carouselDirection && (moveX > 10 || moveY > 10)) {
                    if (moveY > moveX * 1.2 && moveY > 15) {
                        // 垂直滑动，允许页面滚动，立即取消拖拽标记并退出
                        // 不调用 preventDefault，允许页面正常滚动
                        carouselDirection = 'vertical';
                        carouselIsDragging = false;
                        carouselStartX = 0;
                        carouselStartY = 0;
                        return; // 立即退出，不阻止默认行为
                    } else if (moveX > moveY * 1.2 && moveX > 15) {
                        // 水平移动距离明显大于垂直移动，认为是水平滑动（轮播切换）
                        carouselDirection = 'horizontal';
                    }
                }
                
                // 只处理水平滑动：阻止默认行为，避免页面左右滚动
                // 但需要确保垂直移动不会被阻止（通过上面的提前检测和返回）
                if (carouselDirection === 'horizontal' && moveX > moveY * 1.2 && moveX > 15) {
                    e.preventDefault(); // 只在确认是水平滑动时阻止
                } else if (moveY > moveX * 1.2 && moveY > 15) {
                    // 如果在处理过程中发现是垂直滑动，切换到垂直模式并退出
                    carouselDirection = 'vertical';
                    carouselIsDragging = false;
                    return; // 不阻止，允许页面滚动
                }
            }, { passive: false }); // 需要 passive: false 以便在必要时调用 preventDefault
            
            track.addEventListener('touchend', (e) => {
                // 如果是垂直滑动，不处理轮播切换
                if (carouselDirection === 'vertical') {
                    carouselIsDragging = false;
                    carouselDirection = null;
                    carouselStartX = 0;
                    carouselStartY = 0;
                    return;
                }
                
                if (!carouselIsDragging || carouselDirection !== 'horizontal') {
                    carouselIsDragging = false;
                    carouselDirection = null;
                    carouselStartX = 0;
                    carouselStartY = 0;
                    return;
                }
                
                carouselIsDragging = false;
                const endX = e.changedTouches[0].clientX;
                const diff = carouselStartX - endX;
                
                // 只有在明显的水平滑动时才切换轮播
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        currentIndex = (currentIndex + 1) % images.length;
                    } else {
                        currentIndex = (currentIndex - 1 + images.length) % images.length;
                    }
                    updateCarousel();
                }
                
                carouselDirection = null;
                carouselStartX = 0;
                carouselStartY = 0;
            }, { passive: true });
            
            // 删除图片（只删除 URL，不删除 Cloudinary 上的实际文件）
            removeBtns.forEach((btn, btnIndex) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    const itemId = card.dataset.itemId || null;
                    const images = this.getImages(this.dayId, index, itemId);
                    
                    // 从本地数组中删除 URL
                    images.splice(btnIndex, 1);
                    this.setImages(this.dayId, index, images, itemId);
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                    
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    }
                });
            });
            
            // 图片点击查看大图
            const cardImages = carousel.querySelectorAll('.card-image');
            cardImages.forEach((img, imgIndex) => {
                // 记录触摸开始位置和时间（用于判断是点击还是滑动）
                let touchStartX = 0;
                let touchStartY = 0;
                let touchStartTime = 0;
                let isImageDrag = false; // 标记是否在拖拽（用于轮播切换）
                
                // 点击事件处理（桌面端）
                const handleImageClick = (e) => {
                    // 如果是删除按钮的点击，不触发大图查看
                    if (e.target.closest('.image-remove-btn')) {
                        return;
                    }
                    
                    // 如果正在拖拽（轮播切换），不触发大图查看
                    if (isImageDrag) {
                        return;
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // 打开大图查看器
                    if (typeof openImageViewer === 'function') {
                        openImageViewer(images, imgIndex);
                    }
                };
                
                img.addEventListener('click', handleImageClick);
                
                // 移动端支持触摸（但要区分点击和滑动）
                img.addEventListener('touchstart', (e) => {
                    const touch = e.touches[0];
                    touchStartX = touch.clientX;
                    touchStartY = touch.clientY;
                    touchStartTime = Date.now();
                    isImageDrag = false;
                }, { passive: true });
                
                img.addEventListener('touchmove', (e) => {
                    // 使用 passive: true，不允许 preventDefault，确保不会阻止页面滚动
                    // 如果移动距离超过阈值，判断是拖拽还是滚动
                    if (e.touches.length > 0) {
                        const touch = e.touches[0];
                        const moveX = Math.abs(touch.clientX - touchStartX);
                        const moveY = Math.abs(touch.clientY - touchStartY);
                        
                        // 优先检测垂直滑动：如果垂直移动距离明显大于水平移动距离，认为是页面滚动
                        // 不应该阻止，允许页面正常滚动
                        if (moveY > moveX * 1.2 && moveY > 15) {
                            // 垂直滚动，允许页面滚动，不标记为拖拽，直接返回
                            isImageDrag = false; // 确保不标记为拖拽
                            return;
                        }
                        
                        // 水平移动或移动距离较小，可能是拖拽（用于判断点击还是滑动）
                        if ((moveX > moveY * 1.2 && moveX > 15) || (moveX > 10 && moveY < 10)) {
                            isImageDrag = true;
                        }
                    }
                }, { passive: true }); // 使用 passive: true，不允许 preventDefault，确保不会阻止页面滚动
                
                img.addEventListener('touchend', (e) => {
                    const touch = e.changedTouches[0];
                    const moveX = Math.abs(touch.clientX - touchStartX);
                    const moveY = Math.abs(touch.clientY - touchStartY);
                    const touchDuration = Date.now() - touchStartTime;
                    
                    // 如果移动距离小于10px且触摸时间小于300ms，认为是点击
                    if (!isImageDrag && moveX < 10 && moveY < 10 && touchDuration < 300) {
                        handleImageClick(e);
                    }
                    
                    // 重置状态
                    isImageDrag = false;
                }, { passive: true });
            });
        }
        
        // 删除行程项（排序模式下禁用）
        const deleteBtn = card.querySelector('.delete-item-btn');
        if (deleteBtn) {
            // 排序模式下隐藏删除按钮
            if (this.sortMode) {
                deleteBtn.style.display = 'none';
            }
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // 排序模式下禁止删除
                if (this.sortMode) {
                    return;
                }
                
                // 防止重复弹窗：检查是否正在处理删除
                if (deleteBtn.dataset.deleting === 'true') {
                    return;
                }
                
                if (confirm('确定要删除这个行程项吗？')) {
                    deleteBtn.dataset.deleting = 'true';
                    const itemId = deleteBtn.dataset.itemId;
                    if (itemId) {
                        // 优先使用统一结构的删除方法
                        if (typeof tripDataStructure !== 'undefined') {
                            const unifiedData = tripDataStructure.loadUnifiedData();
                            if (unifiedData) {
                                const success = tripDataStructure.deleteItemData(unifiedData, this.dayId, itemId);
                                if (success) {
                                    tripDataStructure.saveUnifiedData(unifiedData);
                                    // 只上传被删除的卡片（部分更新）
                                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                        dataSyncFirebase.uploadItem(this.dayId, itemId).then(result => {
                                            if (result.success) {
                                                console.log('卡片删除已同步到云端:', result.message);
                                            } else {
                                                console.warn('卡片删除同步失败:', result.message);
                                                // 如果部分更新失败，回退到全量上传
                                                triggerImmediateUpload();
                                            }
                                        }).catch(error => {
                                            console.error('卡片删除同步出错:', error);
                                            // 如果部分更新失败，回退到全量上传
                                            triggerImmediateUpload();
                                        });
                                    } else {
                                        // 如果部分更新方法不可用，使用全量上传
                                        triggerImmediateUpload();
                                    }
                                    // 重新渲染当前视图，而不是重新加载整个day
                                    this.cards = this.cards.filter(c => c.id !== itemId);
                                    this.renderCards();
                                    this.attachCardEventsForAll();
                                    deleteBtn.dataset.deleting = 'false';
                                    return;
                                }
                            }
                        }
                        // 使用统一结构删除
                        deleteItem(this.dayId, itemId);
                        // 重新渲染当前视图
                        this.cards = this.cards.filter(c => c.id !== itemId);
                        this.renderCards();
                        this.attachCardEventsForAll();
                        deleteBtn.dataset.deleting = 'false';
                    } else {
                        deleteBtn.dataset.deleting = 'false';
                    }
                } else {
                    deleteBtn.dataset.deleting = 'false';
                }
            });
        }
        
        // 计划项删除事件
        card.querySelectorAll('.plan-item-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const planHash = btn.dataset.planHash || null;
                const cardIndex = parseInt(btn.dataset.cardIndex);
                const itemId = btn.dataset.itemId || null;
                // 直接删除，不需要确认
                this.deletePlanItem(cardIndex, planIndex, planHash, itemId);
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const planHash = btn.dataset.planHash || null;
                const cardIndex = parseInt(btn.dataset.cardIndex);
                const itemId = btn.dataset.itemId || null;
                // 直接删除，不需要确认
                this.deletePlanItem(cardIndex, planIndex, planHash, itemId);
            });
        });
        
        // 保存按钮事件
        // 计划项like事件（统一处理 click 和 touchend）
        card.querySelectorAll('.plan-item-like-btn').forEach(btn => {
            // 触摸相关变量
            let touchStartX = 0;
            let touchStartY = 0;
            
            // 创建统一的点赞处理函数
            const handlePlanLike = (e) => {
                // 如果是触摸事件，检查移动距离（避免滚动时误触发）
                if (e.type === 'touchend') {
                    const touch = e.changedTouches[0];
                    const moveX = Math.abs(touch.clientX - touchStartX);
                    const moveY = Math.abs(touch.clientY - touchStartY);
                    // 如果移动距离超过10px，认为是滚动操作，不触发点赞
                    if (moveX > 10 || moveY > 10) {
                        return;
                    }
                }
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 防止短时间内重复触发
                if (btn.dataset.processing === 'true') {
                    return;
                }
                btn.dataset.processing = 'true';
                
                const planIndex = parseInt(btn.dataset.planIndex);
                const itemId = card.dataset.itemId || null;
                
                // 保存当前滚动位置和卡片滚动位置
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                
                if (typeof window.LikeHandler !== 'undefined' && window.LikeHandler) {
                    const success = window.LikeHandler.toggleLike(this.dayId, itemId, 'plan', planIndex);
                    if (success) {
                        // 使用统一的UI刷新
                        if (typeof window.refreshUI === 'function') {
                            window.refreshUI(this.dayId, { itemId, skipSync: false });
                        } else {
                            // 重新加载数据并刷新
                            if (typeof tripDataStructure !== 'undefined') {
                                const unifiedData = tripDataStructure.loadUnifiedData();
                                if (unifiedData) {
                                    const day = tripDataStructure.getDayData(unifiedData, this.dayId);
                                    if (day && day.items) {
                                        this.cards = day.items;
                                        this.renderCards();
                                        this.attachCardEventsForAll();
                                    }
                                }
                            }
                        }
                    }
                } else {
                    console.error('LikeHandler 未定义');
                }
                
                // 使用requestAnimationFrame确保DOM更新完成后再恢复滚动位置
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                    // 延迟重置处理标志，避免快速重复点击
                    setTimeout(() => {
                        btn.dataset.processing = 'false';
                    }, 300);
                });
            };
            
            // 记录触摸开始位置
            btn.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
            }, { passive: true });
            
            // 同时绑定 click 和 touchend 事件
            btn.addEventListener('click', handlePlanLike);
            btn.addEventListener('touchend', handlePlanLike);
        });
        
        // 留言like事件（统一处理 click 和 touchend）
        card.querySelectorAll('.comment-like-btn').forEach(btn => {
            // 触摸相关变量
            let touchStartX = 0;
            let touchStartY = 0;
            
            // 创建统一的点赞处理函数
            const handleCommentLike = (e) => {
                // 如果是触摸事件，检查移动距离（避免滚动时误触发）
                if (e.type === 'touchend') {
                    const touch = e.changedTouches[0];
                    const moveX = Math.abs(touch.clientX - touchStartX);
                    const moveY = Math.abs(touch.clientY - touchStartY);
                    // 如果移动距离超过10px，认为是滚动操作，不触发点赞
                    if (moveX > 10 || moveY > 10) {
                        return;
                    }
                }
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 防止短时间内重复触发
                if (btn.dataset.processing === 'true') {
                    return;
                }
                btn.dataset.processing = 'true';
                
                const commentIndex = parseInt(btn.dataset.commentIndex);
                const itemId = card.dataset.itemId || null;
                
                // 保存当前滚动位置和卡片滚动位置
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                
                if (typeof window.LikeHandler !== 'undefined' && window.LikeHandler) {
                    const success = window.LikeHandler.toggleLike(this.dayId, itemId, 'comment', commentIndex);
                    if (success) {
                        // 使用统一的UI刷新
                        if (typeof window.refreshUI === 'function') {
                            window.refreshUI(this.dayId, { itemId, skipSync: false });
                        } else {
                            // 重新加载数据并刷新
                            if (typeof tripDataStructure !== 'undefined') {
                                const unifiedData = tripDataStructure.loadUnifiedData();
                                if (unifiedData) {
                                    const day = tripDataStructure.getDayData(unifiedData, this.dayId);
                                    if (day && day.items) {
                                        this.cards = day.items;
                                        this.renderCards();
                                        this.attachCardEventsForAll();
                                    }
                                }
                            }
                        }
                    }
                } else {
                    console.error('LikeHandler 未定义');
                }
                
                // 使用requestAnimationFrame确保DOM更新完成后再恢复滚动位置
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                    // 延迟重置处理标志，避免快速重复点击
                    setTimeout(() => {
                        btn.dataset.processing = 'false';
                    }, 300);
                });
            };
            
            // 记录触摸开始位置
            btn.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
            }, { passive: true });
            
            // 同时绑定 click 和 touchend 事件
            btn.addEventListener('click', handleCommentLike);
            btn.addEventListener('touchend', handleCommentLike);
        });
        
        // 留言提交事件
        const commentInput = card.querySelector('.comment-input');
        const commentSubmit = card.querySelector('.comment-submit');
        
        commentSubmit.addEventListener('click', async () => {
            const message = commentInput.value.trim();
            if (message) {
                const itemId = card.dataset.itemId || null;
                await this.addComment(this.dayId, index, message, itemId);
                commentInput.value = '';
                // 重新渲染卡片
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    // 重新绑定事件
                }
                this.attachCardEventsForAll();
            }
        });
        
        // 回车发送留言
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commentSubmit.click();
            }
        });
        
        // 删除留言按钮
        const commentDeleteBtns = card.querySelectorAll('.comment-delete-btn');
        commentDeleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                // 直接删除，不需要确认
                const commentHash = btn.dataset.commentHash;
                if (commentHash) {
                    const itemId = card.dataset.itemId || null;
                    await this.deleteComment(this.dayId, index, commentHash, itemId);
                    // 重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                }
            });
        });
        
        // 消费表相关事件
        const spendAddBtn = card.querySelector('.spend-add-btn');
        const spendInputContainer = card.querySelector('.spend-input-container');
        const spendItemInput = card.querySelector('.spend-item-input');
        const spendAmountInput = card.querySelector('.spend-amount-input');
        const spendInputConfirm = card.querySelector('.spend-input-confirm');
        const spendInputCancel = card.querySelector('.spend-input-cancel');
        
        if (spendAddBtn && spendInputContainer) {
            // 点击添加按钮，显示输入框
            spendAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                spendAddBtn.style.display = 'none';
                spendInputContainer.style.display = 'flex';
                spendItemInput.focus();
            });
            
            // 确认添加消费项
            const spendPayerInput = card.querySelector('.spend-payer-input');
            if (spendInputConfirm && spendItemInput && spendAmountInput && spendPayerInput) {
                // 设置默认支出人为当前用户
                const currentUser = getCurrentUser();
                if (currentUser) {
                    spendPayerInput.value = currentUser;
                }
                
                const confirmAdd = async () => {
                    const itemName = spendItemInput.value.trim();
                    const amount = parseFloat(spendAmountInput.value);
                    const payer = spendPayerInput.value || '';
                    
                    if (itemName && !isNaN(amount) && amount > 0) {
                        await this.addSpendItem(index, itemName, amount, payer);
                        // 重置输入框和UI状态
                        spendItemInput.value = '';
                        spendAmountInput.value = '';
                        // 重置为当前用户（如果有）
                        if (typeof currentUser !== 'undefined' && currentUser) {
                            spendPayerInput.value = currentUser;
                        } else {
                            spendPayerInput.value = '';
                        }
                        spendInputContainer.style.display = 'none';
                        spendAddBtn.style.display = 'block';
                    } else {
                        alert('请输入有效的项目名称和金额');
                    }
                };
                
                spendInputConfirm.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    confirmAdd();
                });
                
                spendAmountInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        spendPayerInput.focus();
                    }
                });
            }
            
            // 取消按钮
            if (spendInputCancel) {
                spendInputCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    spendItemInput.value = '';
                    spendAmountInput.value = '';
                    const spendPayerInput = card.querySelector('.spend-payer-input');
                    if (spendPayerInput) {
                        // 重置为当前用户（如果有）
                        if (typeof currentUser !== 'undefined' && currentUser) {
                            spendPayerInput.value = currentUser;
                        } else {
                            spendPayerInput.value = '';
                        }
                    }
                    spendInputContainer.style.display = 'none';
                    spendAddBtn.style.display = 'block';
                });
            }
        }
        
        // 删除消费项按钮
        const spendDeleteBtns = card.querySelectorAll('.spend-delete-btn');
        spendDeleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const spendIndex = parseInt(btn.dataset.spendIndex);
                await this.deleteSpendItem(index, spendIndex);
                // 重新渲染
                this.renderCards();
                // 重新绑定事件
                this.attachCardEventsForAll();
            });
        });
    }
    
    // 添加消费项
    async addSpendItem(cardIndex, itemName, amount, payer = '') {
        console.log('addSpendItem 被调用:', { cardIndex, itemName, amount, payer, dayId: this.dayId });
        // 检查写权限
        if (!checkWritePermission()) {
            console.warn('没有写权限');
            return;
        }
        
        const card = this.cards[cardIndex];
        console.log('card对象:', card, 'card.id:', card?.id);
        if (!card) {
            console.warn('card不存在');
            return;
        }
        
        const newSpendItem = {
            item: itemName,
            amount: parseFloat(amount),
            payer: payer || ''
        };
        
        // 获取当前消费表
        let spendItems = card.spend || [];
        if (!Array.isArray(spendItems)) {
            spendItems = [];
        }
        spendItems.push(newSpendItem);
        card.spend = spendItems;
        
        // 保存到统一结构
        const itemId = card.id;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                console.log('找到的item:', item ? '存在' : '不存在', itemId);
                if (item) {
                    console.log('更新item.spend，旧spend长度:', item.spend?.length || 0, '新spend长度:', spendItems.length);
                    item.spend = spendItems;
                    item._updatedAt = new Date().toISOString();
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    console.log('保存结果:', saveSuccess);
                    
                    if (saveSuccess !== false) {
                        triggerImmediateUpload();
                        
                        // 重新渲染卡片以显示新添加的消费项
                        this.renderCards();
                        console.log('重新渲染完成');
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        return;
                    } else {
                        console.warn('保存失败');
                    }
                } else {
                    console.warn('未找到item:', itemId);
                }
            } else {
                console.warn('统一数据不存在');
            }
        } else {
            console.warn('itemId不存在或tripDataStructure未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
        }
        
        // 如果保存失败，也重新渲染（至少显示在内存中）
        console.log('回退：重新渲染卡片');
        this.renderCards();
                // 重新绑定事件
        this.attachCardEventsForAll();
    }
    
    // 删除消费项
    async deleteSpendItem(cardIndex, spendIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const card = this.cards[cardIndex];
        if (!card) return;
        
        let spendItems = card.spend || [];
        if (!Array.isArray(spendItems) || spendIndex < 0 || spendIndex >= spendItems.length) {
            return;
        }
        
        // 从数组中删除
        spendItems.splice(spendIndex, 1);
        card.spend = spendItems;
        
        // 保存到统一结构
        const itemId = card.id;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    item.spend = spendItems;
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    } else {
                        // 如果没有部分上传方法，使用全量上传
                        if (typeof triggerImmediateUpload === 'function') {
                            triggerImmediateUpload();
                        }
                    }
                    return;
                } else {
                    console.warn('未找到item:', itemId);
                }
            } else {
                console.warn('统一数据不存在');
            }
        } else {
            console.warn('itemId不存在或tripDataStructure未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
        }
        
        // 如果保存失败，也重新渲染（至少显示在内存中）
        this.renderCards();
                // 重新绑定事件
        this.attachCardEventsForAll();
    }
    
    // 删除留言
    async deleteComment(dayId, itemIndex, commentHash, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const comments = this.getComments(dayId, itemIndex, itemId);
        const commentIndex = comments.findIndex(c => c._hash === commentHash);
        
        if (commentIndex === -1) return;
        
        // 从数组中删除
        comments.splice(commentIndex, 1);
        
        // 优先保存到统一结构
        // 如果itemId参数为null，尝试从card获取
        if (!itemId) {
            const card = this.cards[itemIndex];
            itemId = card?.id || null;
        }
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    item.comments = comments;
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                        dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    }
                    return;
                }
            }
        } else {
            console.error('tripDataStructure 未定义或 itemId 为空，无法保存留言');
        }
    }
    
    // 获取留言
    getComments(dayId, itemIndex, itemId = null) {
        // 只从统一结构读取
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            return [];
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return [];
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            return [];
        }
        
        // 确保返回的是数组
        const comments = item.comments;
        if (Array.isArray(comments)) {
            return comments;
        } else if (comments) {
            // 如果不是数组但有值，转换为数组
            return [comments];
        } else {
            return [];
        }
    }
    
    // 添加留言
    async addComment(dayId, itemIndex, message, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 如果 itemId 为空，尝试从 cards 数组中获取
        if (!itemId && this.cards && this.cards[itemIndex]) {
            itemId = this.cards[itemIndex].id || null;
        }
        
        if (!itemId) {
            console.error('addComment: itemId 为空，无法保存留言', { dayId, itemIndex, itemId });
            return;
        }
        
        const comments = this.getComments(dayId, itemIndex, itemId);
        
        // 生成时间戳
        const timestamp = Date.now();
        
        // 生成哈希值
        const currentUser = getCurrentUser();
        const hash = await generateContentHash(message, currentUser, timestamp);
        
        // 检查是否已存在相同哈希的留言（防止重复）
        const existingComment = comments.find(c => c && c._hash === hash);
        if (existingComment) {
            // 如果已存在，不重复添加
            console.log('留言已存在，跳过添加');
            return;
        }
        
        // 添加新留言，包含哈希值
        const newComment = {
            user: currentUser,
            message: message,
            timestamp: timestamp,
            _hash: hash // 添加哈希值用于去重
        };
        comments.push(newComment);
        
        // 只保存到统一结构
        if (typeof tripDataStructure === 'undefined') {
            console.error('tripDataStructure 未定义，无法保存留言');
            return;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            console.error('无法加载统一数据');
            return;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            console.error('找不到 item', { dayId, itemId, unifiedData: !!unifiedData });
            // 尝试列出所有 items 来调试
            const day = tripDataStructure.getDayData(unifiedData, dayId);
            if (day && day.items) {
                console.log('当前 day 的 items:', day.items.map(i => ({ id: i.id, category: i.category })));
                // 检查 itemId 是否匹配
                const foundItem = day.items.find(i => {
                    const match = i.id === itemId;
                    if (!match) {
                        // 检查类型是否不同
                        if (String(i.id) === String(itemId)) {
                            console.warn(`itemId 类型不匹配: 存储的是 ${typeof i.id} "${i.id}", 查找的是 ${typeof itemId} "${itemId}"`);
                        }
                    }
                    return match;
                });
                if (!foundItem) {
                    console.error('itemId 在所有 items 中都找不到:', itemId);
                    console.log('所有 itemIds:', day.items.map(i => ({ id: i.id, idType: typeof i.id })));
                }
            }
            return;
        }
        
        // 确保 comments 是数组
        if (!Array.isArray(item.comments)) {
            item.comments = [];
        }
        
        item.comments = comments;
        item._updatedAt = new Date().toISOString();
        tripDataStructure.saveUnifiedData(unifiedData);
        
        // 通过事件总线通知数据更新
        if (typeof window.eventBus !== 'undefined') {
            window.eventBus.emit(window.EventTypes.ITEM_UPDATED, {
                dayId,
                itemId
            });
        }
        
        // 使用增量更新，只上传这个 item
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
            dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                console.error('上传 item 失败:', error);
            });
        } else {
            if (typeof window.triggerImmediateUpload === 'function') {
                window.triggerImmediateUpload();
            }
        }
    }
    
    // 格式化时间
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    
    // 获取图片（多张）
    getImages(dayId, itemIndex, itemId = null) {
        // 只从统一结构读取
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            return [];
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return [];
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        return item ? (item.images || []) : [];
    }
    
    // 设置图片（多张）
    setImages(dayId, itemIndex, imageUrls, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 只保存到统一结构
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            console.error('tripDataStructure 未定义或 itemId 为空，无法保存图片');
            return;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            console.error('无法加载统一数据');
            return;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            console.error('找不到 item');
            return;
        }
        
        item.images = imageUrls || [];
        item._updatedAt = new Date().toISOString();
        tripDataStructure.saveUnifiedData(unifiedData);
        
        // 只上传这个 item，不进行全量上传
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
            dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                console.error('上传 item 失败:', error);
            });
        } else {
            triggerImmediateUpload();
        }
    }
    
    // 点赞函数已移至 modules/like-handler.js，使用 LikeHandler 统一处理
    
    // 获取卡片展开状态
    // 获取卡片展开状态（基于 itemId，不保存到 localStorage）
    getCardExpanded(itemId) {
        if (!itemId) return false;
        return this.cardExpandedStates.get(itemId) || false;
    }
    
    // 设置卡片展开状态（基于 itemId，不保存到 localStorage）
    setCardExpanded(itemId, expanded) {
        if (!itemId) return;
        this.cardExpandedStates.set(itemId, expanded);
    }
    
    // 获取标签标签
    getTagLabel(tag) {
        const labels = {
            '景点': '🏛️ 景点',
            '美食': '🍜 美食',
            '住宿': '🏨 住宿',
            '赶路': '🚗 赶路',
            '其他': '📋 其他'
        };
        return labels[tag] || tag;
    }
    
    // 更新卡片数据（统一方法）- 使用真正的增量更新
    updateCardData(itemId, updates) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 更新 this.cards 数组中的数据（内存中的引用）
        const card = this.cards.find(c => c.id === itemId);
        if (card) {
            Object.assign(card, updates);
        }
        
        // 使用真正的增量更新：直接更新 Firebase，而不是全量保存到 localStorage
        if (typeof tripDataStructure !== 'undefined' && typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.cloudIncrementalUpdate) {
            // 只更新统一数据结构中的 item（不触发全量保存）
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    // 更新内存中的 item
                    Object.assign(item, updates);
                    item._updatedAt = new Date().toISOString();
                    
                    // 获取数组索引（因为 Firebase 中数组存储为对象，需要使用索引而不是字符串ID）
                    const dayIndex = dataSyncFirebase.getDayIndex(this.dayId);
                    const itemIndex = dataSyncFirebase.getItemIndex(this.dayId, itemId);
                    
                    // 先确保数据已保存到 localStorage（无论增量更新是否成功）
                    tripDataStructure.saveUnifiedData(unifiedData);
                    
                    if (dayIndex !== null && itemIndex !== null) {
                        // 使用正确的数组索引路径进行增量更新
                        const subPath = `days/${dayIndex}/items/${itemIndex}`;
                        dataSyncFirebase.cloudIncrementalUpdate(subPath, updates).then(result => {
                            if (!result.success) {
                                console.warn('增量更新失败，但数据已保存到本地:', result.message);
                                // 如果增量更新失败，尝试使用 uploadItem 作为备用方案
                                if (dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
                                        console.error('备用上传方案也失败:', err);
                                    });
                                }
                            }
                        }).catch(error => {
                            console.error('增量更新出错，但数据已保存到本地:', error);
                            // 如果增量更新出错，尝试使用 uploadItem 作为备用方案
                            if (dataSyncFirebase.uploadItem) {
                                dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
                                    console.error('备用上传方案也失败:', err);
                                });
                            }
                        });
                    } else {
                        console.warn('无法获取数组索引，数据已保存到本地', { dayId: this.dayId, itemId, dayIndex, itemIndex });
                        // 如果无法获取索引，尝试使用 uploadItem 上传整个 item
                        if (dataSyncFirebase.uploadItem) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
                                console.error('上传 item 失败:', err);
                            });
                        }
                    }
                    return; // 已经处理，不需要继续执行
                }
            }
        }
        
        // 回退方案：如果增量更新不可用，使用全量保存
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    Object.assign(item, updates);
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                }
            }
        }
    }
    
    // 编辑标签
    editTag(cardIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const card = this.cards[cardIndex];
        if (!card) return;
        
        // 获取当前标签（优先使用tag字段，如果没有则使用category作为标签）
        const currentTag = card.tag || card.category || '其他';
        const tags = ['景点', '美食', '住宿', '赶路', '其他'];
        const currentIndex = tags.indexOf(currentTag);
        const nextIndex = (currentIndex + 1) % tags.length;
        const newTag = tags[nextIndex];
        
        // 只更新tag字段，不修改category（标题）
        card.tag = newTag;
        
        // 只保存到统一结构
        const itemId = card.id;
        if (!itemId || typeof tripDataStructure === 'undefined') {
            console.error('itemId 为空或 tripDataStructure 未定义，无法保存标签');
            return;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            console.error('无法加载统一数据');
            return;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
        if (!item) {
            console.error('找不到 item');
            return;
        }
        
        item.tag = newTag;
        item._updatedAt = new Date().toISOString();
        tripDataStructure.saveUnifiedData(unifiedData);
        
        // 重新渲染
        this.renderCards();
        // 重新绑定事件
        this.attachCardEventsForAll();
        
        // 只上传这个 item，不进行全量上传
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                console.error('上传 item 失败:', error);
            });
        }
    }
    
    // 添加计划项
    async addPlanItem(cardIndex, newItem) {
        console.log('addPlanItem 被调用:', { cardIndex, newItem, dayId: this.dayId });
        // 检查写权限
        if (!checkWritePermission()) {
            console.warn('没有写权限');
            return;
        }
        
        const card = this.cards[cardIndex];
        console.log('card对象:', card, 'card.id:', card?.id);
        if (!card || !newItem || !newItem.trim()) {
            console.warn('card或newItem无效');
            return;
        }
        
        const trimmedItem = newItem.trim();
        
        // 更新plan数组
        if (!card.plan) {
            card.plan = [];
        }
        const planItems = Array.isArray(card.plan) ? card.plan : [card.plan];
        
        // 生成时间戳和哈希值
        const currentUser = getCurrentUser();
        const timestamp = Date.now();
        const hash = await generateContentHash(trimmedItem, currentUser, timestamp);
        
        // 检查是否已存在相同哈希的计划项（防止重复）
        const existingItem = planItems.find(item => {
            if (typeof item === 'string') {
                // 如果是字符串，需要检查是否有对应的哈希值存储
                return false; // 旧数据没有哈希，允许添加
            } else if (typeof item === 'object') {
                // 如果是对象，检查哈希值
                // 已删除的项已被过滤，这里不再需要检查
                return item._hash === hash;
            }
            return false;
        });
        
        if (existingItem) {
            // 如果已存在，不重复添加
            return;
        }
        
        // 添加新计划项，包含哈希值
        const newPlanItem = {
            _text: trimmedItem,
            _hash: hash,
            _timestamp: timestamp,
            _user: currentUser
        };
        planItems.push(newPlanItem);
        card.plan = planItems;
        
        // 优先保存到统一结构
        const itemId = card.id;
        console.log('准备保存到统一结构:', { itemId, dayId: this.dayId, planItemsCount: planItems.length });
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            console.log('统一数据:', unifiedData ? '存在' : '不存在');
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                console.log('找到的item:', item ? '存在' : '不存在', itemId);
                if (item) {
                    console.log('更新item.plan，旧plan长度:', item.plan?.length || 0, '新plan长度:', planItems.length);
                    item.plan = planItems;
                    item._updatedAt = new Date().toISOString();
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    console.log('保存结果:', saveSuccess);
                    
                    if (saveSuccess !== false) {
                        // 更新this.cards数组中的card对象，保持同步
                        card.plan = planItems;
                        console.log('card.plan已更新，准备重新渲染');
                        
                        // 重新渲染
                        this.renderCards();
                        console.log('重新渲染完成');
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        
                        // 使用增量更新，只上传这个 item
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                console.error('上传 item 失败:', error);
                            });
                        } else {
                            triggerImmediateUpload();
                        }
                        return;
                    } else {
                        console.error('保存到统一结构失败');
                        alert('保存失败，请重试');
                    }
                } else {
                    console.error(`未找到item: ${itemId}`);
                    alert('找不到数据项，请刷新页面重试');
                }
            } else {
                console.error('统一数据不存在');
                alert('数据加载失败，请刷新页面重试');
            }
        } else {
            console.error('itemId不存在或tripDataStructure未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
            alert('数据项ID无效，请刷新页面重试');
        }
    }
    
    // 删除计划项（硬删除，使用哈希或索引）
    deletePlanItem(cardIndex, planIndex, planHash = null, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) {
            console.warn('删除 plan 项失败：没有写权限');
            return;
        }
        
        const card = this.cards[cardIndex];
        if (!card) {
            console.warn('删除 plan 项失败：找不到卡片，cardIndex:', cardIndex);
            return;
        }
        
        console.log('删除 plan 项:', { cardIndex, planIndex, planHash, itemId, dayId: this.dayId });
        
        // 优先使用统一数据结构
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    let planItems = Array.isArray(item.plan) ? [...item.plan] : (item.plan ? [item.plan] : []);
                    console.log('当前 plan 项数量:', planItems.length, 'plan 项:', planItems);
                    
                    // 优先使用哈希值查找（最可靠）
                    let targetIndex = -1;
                    if (planHash && planHash.trim() !== '') {
                        console.log('使用哈希查找:', planHash);
                        targetIndex = planItems.findIndex(p => {
                            if (typeof p === 'object' && p._hash === planHash) {
                                return true;
                            }
                            return false;
                        });
                        console.log('哈希查找结果:', targetIndex);
                    }
                    
                    // 如果哈希找不到，使用索引
                    if (targetIndex === -1) {
                        console.log('哈希找不到，使用索引:', planIndex);
                        targetIndex = planIndex;
                    }
                    
                    // 检查索引是否有效
                    console.log('目标索引:', targetIndex, 'plan 项长度:', planItems.length);
                    if (targetIndex >= 0 && targetIndex < planItems.length) {
                        console.log('准备删除索引', targetIndex, '的 plan 项:', planItems[targetIndex]);
                        // 真正从数组中删除
                        planItems.splice(targetIndex, 1);
                        console.log('删除后 plan 项数量:', planItems.length);
                        
                        // 确保 plan 是数组格式
                        if (!Array.isArray(planItems)) {
                            planItems = planItems.length > 0 ? [planItems] : [];
                        }
                        
                        // 使用 updateItemData 更新统一数据结构
                        const updateSuccess = tripDataStructure.updateItemData(unifiedData, this.dayId, itemId, { plan: planItems });
                        console.log('更新统一数据结构结果:', updateSuccess);
                        
                        if (updateSuccess) {
                            // 更新本地 card 数据
                            card.plan = planItems;
                            
                            // 保存当前滚动位置
                            const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                            const cardElement = this.container.querySelector(`.card[data-index="${cardIndex}"]`);
                            const cardScrollTop = cardElement ? cardElement.scrollTop : 0;
                            
                            // 硬删除后立即上传完整数组，确保 Firebase 端同步的是更新后的完整数组
                            // 这样合并逻辑就不会"救回"已删除的项
                            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.updateArrayField) {
                                // 使用 updateArrayField 上传完整数组，确保彻底删除
                                dataSyncFirebase.updateArrayField(this.dayId, itemId, 'plan', planItems).then(result => {
                                    if (result.success) {
                                        console.log('plan 项删除已同步到云端（完整数组）:', result.message);
                                    } else {
                                        console.warn('plan 项删除同步失败，回退到 uploadItem:', result.message);
                                        // 如果 updateArrayField 失败，回退到 uploadItem
                                        if (dataSyncFirebase.uploadItem) {
                                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                                console.error('plan 项删除同步出错:', error);
                                            });
                                        }
                                    }
                                }).catch(error => {
                                    console.error('plan 项删除同步出错:', error);
                                    // 回退到 uploadItem
                                    if (dataSyncFirebase.uploadItem) {
                                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
                                            console.error('回退上传也失败:', err);
                                        });
                                    }
                                });
                            } else if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                // 如果 updateArrayField 不可用，使用 uploadItem
                                dataSyncFirebase.uploadItem(this.dayId, itemId).then(result => {
                                    if (result.success) {
                                        console.log('plan 项删除已同步到云端:', result.message);
                                    } else {
                                        console.warn('plan 项删除同步失败:', result.message);
                                    }
                                }).catch(error => {
                                    console.error('plan 项删除同步出错:', error);
                                });
                            }
                            
                            // 重新渲染
                            this.renderCards();
                            this.attachCardEventsForAll();
                            
                            // 恢复滚动位置
                            requestAnimationFrame(() => {
                                window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                                const newCard = this.container.querySelector(`.card[data-index="${cardIndex}"]`);
                                if (newCard) {
                                    newCard.scrollTop = cardScrollTop;
                                }
                            });
                            
                            console.log('plan 项删除成功');
                            return;
                        } else {
                            console.error('更新统一数据结构失败');
                            alert('删除失败，请重试');
                        }
                    } else {
                        console.error('索引无效:', targetIndex, 'plan 项长度:', planItems.length);
                        alert('删除失败：索引无效');
                    }
                } else {
                    console.error('删除 plan 项失败：找不到 item，itemId:', itemId);
                    alert('删除失败：找不到数据项');
                }
            } else {
                console.error('删除 plan 项失败：统一数据不存在');
                alert('删除失败：数据加载失败');
            }
        } else {
            console.error('删除 plan 项失败：itemId 为空或 tripDataStructure 未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
            alert('删除失败：数据项ID无效');
        }
    }
    
    // 拖拽开始（排序模式）
    handleDragStart(e, card, index) {
        if (!this.sortMode) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.isDraggingCard = true;
        this.dragCardIndex = parseInt(index);
        this.dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
        
        card.classList.add('dragging');
        card.style.zIndex = '1000';
        card.style.cursor = 'grabbing';
        
        // 使用箭头函数保持this上下文
        this.dragMoveHandler = (evt) => {
            evt.preventDefault();
            this.handleDragMove(evt);
        };
        this.dragEndHandler = (evt) => {
            evt.preventDefault();
            this.handleDragEnd(evt);
        };
        
        document.addEventListener('mousemove', this.dragMoveHandler, { passive: false });
        document.addEventListener('mouseup', this.dragEndHandler);
        document.addEventListener('touchmove', this.dragMoveHandler, { passive: false });
        document.addEventListener('touchend', this.dragEndHandler);
    }
    
    handleDragMove(e) {
        if (!this.isDraggingCard || !this.sortMode) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = currentY - this.dragStartY;
        
        const cards = Array.from(this.container.querySelectorAll('.card'));
        const currentCard = cards.find(c => parseInt(c.dataset.index) === this.dragCardIndex);
        if (!currentCard) {
            return;
        }
        
        // 更新当前卡片位置
        currentCard.style.transform = `translateY(${deltaY}px)`;
        currentCard.style.opacity = '0.8';
        
        const cardHeight = currentCard.offsetHeight + 20; // 加上间距
        const threshold = cardHeight / 2;
        
        // 找到目标位置 - dataset.index就是数组索引
        let targetIndex = this.dragCardIndex;
        const currentRect = currentCard.getBoundingClientRect();
        const currentCenter = currentRect.top + currentRect.height / 2;
        
        // 按dataset.index排序卡片（即按数组索引排序）
        const sortedCards = cards.map(card => ({
            card: card,
            index: parseInt(card.dataset.index)
        })).sort((a, b) => a.index - b.index);
        
        const currentCardArrayIndex = sortedCards.findIndex(item => item.index === this.dragCardIndex);
        
        sortedCards.forEach((item, arrayIndex) => {
            if (arrayIndex === currentCardArrayIndex) return;
            
            const rect = item.card.getBoundingClientRect();
            const cardCenter = rect.top + rect.height / 2;
            const distance = Math.abs(cardCenter - currentCenter);
            
            if (distance < threshold) {
                if (currentCenter < cardCenter && arrayIndex > currentCardArrayIndex) {
                    targetIndex = item.index;
                } else if (currentCenter > cardCenter && arrayIndex < currentCardArrayIndex) {
                    targetIndex = item.index;
                }
            }
        });
        
        // 更新其他卡片的位置提示
        sortedCards.forEach((item, arrayIndex) => {
            if (item.index === this.dragCardIndex) return;
            
            if (targetIndex > this.dragCardIndex && item.index > this.dragCardIndex && item.index <= targetIndex) {
                item.card.style.transform = `translateY(-${cardHeight}px)`;
            } else if (targetIndex < this.dragCardIndex && item.index < this.dragCardIndex && item.index >= targetIndex) {
                item.card.style.transform = `translateY(${cardHeight}px)`;
            } else {
                item.card.style.transform = '';
            }
        });
    }
    
    handleDragEnd(e) {
        if (!this.isDraggingCard || !this.sortMode) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const cards = Array.from(this.container.querySelectorAll('.card'));
        const currentCard = cards.find(c => parseInt(c.dataset.index) === this.dragCardIndex);
        
        let targetIndex = this.dragCardIndex;
        
        // 计算最终位置 - 使用dataset.index
        if (currentCard) {
            const currentRect = currentCard.getBoundingClientRect();
            const currentCenter = currentRect.top + currentRect.height / 2;
            
            // 按dataset.index排序卡片
            const sortedCards = cards.map(card => ({
                card: card,
                index: parseInt(card.dataset.index)
            })).sort((a, b) => a.index - b.index);
            
            const currentCardArrayIndex = sortedCards.findIndex(item => item.index === this.dragCardIndex);
            
            sortedCards.forEach((item, arrayIndex) => {
                if (arrayIndex === currentCardArrayIndex) return;
                
                const rect = item.card.getBoundingClientRect();
                const cardCenter = rect.top + rect.height / 2;
                
                if (Math.abs(cardCenter - currentCenter) < rect.height / 2) {
                    if (currentCenter < cardCenter && arrayIndex > currentCardArrayIndex) {
                        targetIndex = item.index;
                    } else if (currentCenter > cardCenter && arrayIndex < currentCardArrayIndex) {
                        targetIndex = item.index;
                    }
                }
            });
            
            if (targetIndex !== this.dragCardIndex) {
                // 直接使用数组索引操作（dragCardIndex和targetIndex就是数组索引）
                // 先更新 this.cards 数组
                const [movedItem] = this.cards.splice(this.dragCardIndex, 1);
                this.cards.splice(targetIndex, 0, movedItem);
                
                // 保存新顺序到 localStorage
                this.reorderCards(this.dragCardIndex, targetIndex);
                
            }
        }
        
        // 清理状态
        this.isDraggingCard = false;
        cards.forEach(card => {
            card.classList.remove('dragging');
            card.style.transform = '';
            card.style.opacity = '';
            card.style.zIndex = '';
            card.style.cursor = '';
        });
        
        // 移除事件监听器
        if (this.dragMoveHandler) {
            document.removeEventListener('mousemove', this.dragMoveHandler);
            document.removeEventListener('touchmove', this.dragMoveHandler);
        }
        if (this.dragEndHandler) {
            document.removeEventListener('mouseup', this.dragEndHandler);
            document.removeEventListener('touchend', this.dragEndHandler);
        }
        
        // 重新渲染以更新索引和事件
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 上移卡片
    moveCardUp(index) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        if (index <= 0) {
            return; // 已经在最上面
        }
        
        // 交换位置
        const [movedItem] = this.cards.splice(index, 1);
        this.cards.splice(index - 1, 0, movedItem);
        
        // 保存顺序
        this.saveCardOrder();
        
        // 重新渲染（这会重新创建所有卡片，所以事件会重新绑定）
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 下移卡片
    moveCardDown(index) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        if (index >= this.cards.length - 1) {
            return; // 已经在最下面
        }
        
        // 交换位置
        const [movedItem] = this.cards.splice(index, 1);
        this.cards.splice(index + 1, 0, movedItem);
        
        // 保存顺序
        this.saveCardOrder();
        
        // 重新渲染（这会重新创建所有卡片，所以事件会重新绑定）
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 保存卡片顺序
    saveCardOrder() {
        // 优先更新统一结构中的order字段
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const day = tripDataStructure.getDayData(unifiedData, this.dayId);
                if (day) {
                    // 更新每个item的order字段
                    this.cards.forEach((card, idx) => {
                        if (card.id) {
                            const item = tripDataStructure.getItemData(unifiedData, this.dayId, card.id);
                            if (item) {
                                item.order = idx;
                                item._updatedAt = new Date().toISOString();
                            }
                        }
                    });
                    
                    // 保存统一结构
                    tripDataStructure.saveUnifiedData(unifiedData);
                    triggerImmediateUpload();
                    
                    // 同时更新this.cards数组中的order字段
                    this.cards.forEach((card, idx) => {
                        card.order = idx;
                    });
                }
            }
        }
        
        // 构建顺序信息 - 使用 itemId 作为唯一标识
        const orderInfo = this.cards.map((item, idx) => {
            return {
                index: idx,
                id: item.id || `${this.dayId}_item_${idx}`,
                category: item.category
            };
        });
        
        // 保存顺序到统一结构
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const day = tripDataStructure.getDayData(unifiedData, this.dayId);
                if (day) {
                    // 更新每个 item 的 order 字段
                    orderInfo.forEach((orderItem, idx) => {
                        const item = day.items?.find(i => i.id === orderItem.id);
                        if (item) {
                            item.order = idx;
                        }
                    });
                    tripDataStructure.saveUnifiedData(unifiedData);
                }
            }
        }
    }
    
    // 保存卡片数据并同步
    saveCard(cardIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 保存卡片顺序（如果顺序有变化）
        this.saveCardOrder();
        
        // 触发自动同步
        autoSync();
        
        updateSyncStatus('卡片已保存并同步', 'success');
    }
    
    // 重新排序卡片
    reorderCards(fromIndex, toIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        this.saveCardOrder();
    }

    // 工具函数已移至 modules/utils.js，直接使用全局函数
    // 不再需要包装方法，直接使用 window.escapeHtml 等
}

// 将 CardSlider 暴露到全局，供其他模块使用
if (typeof window !== 'undefined') {
    window.CardSlider = CardSlider;
}

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
        const tripData = loadTripData();
        const day = tripData.days.find(d => d.id === actualDayId);
        if (!day) {
            console.warn(`无法找到 dayId=${actualDayId} 的数据，无法进入排序模式`);
            return;
        }
        
        // 从统一结构加载数据
        let dayItems = day.items || [];
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const unifiedDay = tripDataStructure.getDayData(unifiedData, actualDayId);
                if (unifiedDay && unifiedDay.items) {
                    dayItems = unifiedDay.items;
                }
            }
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

