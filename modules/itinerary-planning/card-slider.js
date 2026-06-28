/**
 * 卡片滑动/列表管理模块
 * 负责行程卡片的渲染、交互和数据更新
 * 从 script.js 提取并重构
 */
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
        
        // 处理dayId参数，确保得到有效的dayId字符串
        if (typeof dayId === 'string') {
            cleanId = dayId;
        } else if (dayId && typeof dayId === 'object') {
            // 如果是unifiedData对象（有days数组），使用默认值并报错
            if (dayId.days && Array.isArray(dayId.days)) {
            } else {
                // 从对象中提取id，优先使用day对象的id
                cleanId = dayId.id || 'day1';
            }
        }
        
        // 修正tripId前缀问题
        if (cleanId.startsWith('trip_')) {
            cleanId = window.stateManager?.getState('currentDayId') || 'day1';
        }
        
        // 最终验证：确保cleanId有效
        if (!cleanId || cleanId.startsWith('trip_')) {
            cleanId = 'day1';
        }
        
        this.dayId = cleanId;
        this.sortMode = false; // 排序模式：false=普通查看模式，true=排序模式（显示上下箭头）
        this.init();
    }

    async init() {
        await this.renderCards();
        this.attachCardEventsForAll();
    }

    async renderCards() {
        // 【关键修复】防止并发渲染导致的 AABBCC 问题
        if (this.isRendering) {
            return;
        }
        this.isRendering = true;
        
        try {
            const latestTripData = window.stateManager.getState('tripData')||window.tripDataStructure.loadTripData();
            let dayData = window.tripDataStructure.getDayData(latestTripData, this.dayId);
            if (dayData && dayData.items) {
                // 【关键修复】确保 dayData.items 是对象
                if (typeof dayData.items === 'object' && !Array.isArray(dayData.items)) {
                    this.cards = Object.values(dayData.items).sort((a, b) => (a.order || 0) - (b.order || 0));
                } else if (Array.isArray(dayData.items)) {
                    this.cards = dayData.items.sort((a, b) => (a.order || 0) - (b.order || 0));
                } else {
                    this.cards = [];
                }
                console.log(`[CardSlider] 渲染已就绪，当前 Items 数量: ${this.cards.length}`);
            } else {
                this.cards = [];
            }
        } finally {
            this.isRendering = false;
        }
        
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
            // 关键修复：先移除所有子元素，再清空innerHTML
            while (stack.firstChild) {
                stack.removeChild(stack.firstChild);
            }
            stack.innerHTML = '';
            stack.className = 'cards-stack sort-mode';
        }

        console.log('--- 准备渲染循环 ---');
        console.log('this.cards 长度:', this.cards.length);
        console.log('第一个 Card 的内容:', this.cards[0]);

        // 如果你用了筛选逻辑，请检查这里
        const filtered = this.cards; // 假设你没有复杂的筛选
        console.log('最终进入循环的长度:', filtered.length);
        
        // 滚动模式：所有卡片平铺显示，可以滚动查看和编辑
        // 根据sortMode决定是否添加sortable-card类
        for (let i = 0; i < this.cards.length; i++) {
            const card = await this.createCard(this.cards[i], i);
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
            
            // 如果 items 是对象结构，转换为数组（根据 order 排序）
            if (items && typeof items === 'object' && !Array.isArray(items)) {
                items = Object.values(items).sort((a, b) => {
                    const orderA = a.order !== undefined ? a.order : 999999;
                    const orderB = b.order !== undefined ? b.order : 999999;
                    return orderA - orderB;
                });
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
    
    /**
     * 【优化】只更新单个卡片的 DOM（避免暴力重绘整个容器）
     * @param {string} itemId - 要更新的卡片ID
     */
    async updateSingleCard(itemId) {
        // 找到对应的卡片元素
        const cardElement = this.container.querySelector(`.card[data-item-id="${itemId}"]`);
        if (!cardElement) {
            return;
        }
        
        // 保存当前卡片的展开状态
        const cardContent = cardElement.querySelector('.card-content');
        const wasExpanded = cardContent && cardContent.classList.contains('expanded');
        
        // 从数据源获取最新数据
        const itemIndex = this.cards.findIndex(card => card && card.id === itemId);
        if (itemIndex === -1) {
            return;
        }
        
        // 【关键修复】确保 cardData 有效
        const cardData = this.cards[itemIndex];
        if (!cardData || !cardData.id) {
            return;
        }
        
        // 重新创建卡片
        const newCard = await this.createCard(cardData, itemIndex);
        
        // 恢复展开状态
        if (wasExpanded) {
            const newCardContent = newCard.querySelector('.card-content');
            if (newCardContent) {
                newCardContent.classList.remove('collapsed');
                newCardContent.classList.add('expanded');
            }
        }
        
        // 替换旧卡片
        cardElement.parentNode.replaceChild(newCard, cardElement);
    }
    
    /**
     * 【优化】只移除单个卡片的 DOM
     * @param {string} itemId - 要移除的卡片ID
     */
    removeSingleCard(itemId) {
        const cardElement = this.container.querySelector(`.card[data-item-id="${itemId}"]`);
        if (cardElement) {
            cardElement.parentNode.removeChild(cardElement);
        }
    }
    async createCard(cardData, index) {
        // 【关键修复】确保 cardData 有效
        if (!cardData || !cardData.id) {
            return document.createElement('div');
        }
        
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;
        card.dataset.dayId = this.dayId;
        card.dataset.itemIndex = index;
        card.dataset.itemId = cardData.id;

        // 1. 准备数据：集中处理数据获取、清洗和格式化
        const data = this._prepareCardData(cardData, index);

        // 2. 组装 HTML：调用各区域的渲染函数
        const spendSection = await this._renderSpendSection(data.spendItems, index);
        
        const htmlParts = [
            this._renderHeader(cardData, index, data),
            `<div class="card-content ${data.isExpanded ? 'expanded' : 'collapsed'}">`,
            this._renderImageSection(data.images),
            this._renderPlanSection(data.planItems, cardData.id, index),
            this._renderNoteSection(data.note, index),
            spendSection,
            this._renderCommentSection(data.comments, cardData.id, index),
            `</div>`, // End card-content
            this._renderFooter(data.isExpanded)
        ];

        card.innerHTML = htmlParts.join('');

        // 3. 绑定事件
        this.attachCardEvents(card, index);

        return card;
    }

    /**
     * 数据层：负责从 UnifiedData 获取最新数据，并做标准化处理
     * * 包含原代码中所有的数据读取、兼容性处理和空值检查逻辑
     */
    _prepareCardData(cardData, index) {
        const itemId = cardData.id || null;
        let safeDayId = this._resolveSafeDayId();

        // 默认值
        const result = {
            comments: [],
            images: [],
            spendItems: [],
            planItems: [],
            note: cardData.note || '',
            tag: cardData.tag || cardData.category || '其他',
            isExpanded: this.getCardExpanded(itemId)
        };

        // 尝试从统一数据结构加载最新数据
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData && unifiedData.days) {
                const item = tripDataStructure.getItemData(unifiedData, safeDayId, itemId);
                if (item) {
                    // 1. 处理评论 (对象转数组 + 排序)
                    result.comments = this._normalizeComments(item.comments);
                    
                    // 2. 处理图片 (对象转数组 + 提取URL)
                    result.images = this._normalizeImages(item.images);
                    
                    // 3. 处理消费 (数组检查)
                    result.spendItems = Array.isArray(item.spend) ? item.spend : (item.spend ? [item.spend] : []);
                    
                    // 4. 处理计划 (这是最复杂的逻辑，单独封装)
                    result.planItems = this._normalizePlans(item.plan);
                    
                    // 5. 更新其他字段
                    if (item.note !== undefined) result.note = item.note;
                    if (item.tag !== undefined) result.tag = item.tag;
                }
            } else {
            }
        }

        // 降级策略：如果统一数据结构没数据，使用 cardData 或 localStorage
        if (result.spendItems.length === 0 && cardData.spend) {
            result.spendItems = Array.isArray(cardData.spend) ? cardData.spend : [];
        }
        
        // 计划项的特殊降级逻辑 (兼容旧数据和 localStorage)
        if (result.planItems.length === 0) {
            let rawPlan = cardData.plan;
            // 尝试 localStorage
            const planKey = `trip_plan_${this.dayId}_${index}`;
            const savedPlan = localStorage.getItem(planKey);
            if (savedPlan) {
                try { rawPlan = JSON.parse(savedPlan); } catch (e) {}
            }
            result.planItems = this._normalizePlans(rawPlan);
        }

        return result;
    }

    // --- 辅助数据处理方法 ---

    _normalizeComments(commentsData) {
        let comments = [];
        if (commentsData && typeof commentsData === 'object' && !Array.isArray(commentsData)) {
            comments = Object.values(commentsData);
        } else if (Array.isArray(commentsData)) {
            comments = commentsData;
        } else if (commentsData) {
            comments = [commentsData];
        }
        return comments
            .filter(c => c && !c._deleted)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }

    _normalizeImages(imagesData) {
        let images = [];
        if (imagesData && typeof imagesData === 'object' && !Array.isArray(imagesData)) {
            images = Object.values(imagesData);
        } else if (Array.isArray(imagesData)) {
            images = imagesData;
        } else if (imagesData) {
            images = [imagesData];
        }
        return images.map(img => 
            (typeof img === 'object' && img !== null) ? (img.url || img) : img
        );
    }

    _normalizePlans(planData) {
        if (!planData) return [];
        let plans = [];
        
        if (Array.isArray(planData)) {
            plans = planData;
        } else if (typeof planData === 'object' && planData !== null) {
            plans = Object.values(planData);
        } else if (typeof planData === 'string') {
            plans = [planData];
        }

        return plans
            .filter(item => {
                if (!item) return false;
                if (typeof item === 'object' && item._deleted === true) return false;
                // 检查内容是否为空
                const text = (typeof item === 'object') ? item._text : item;
                return String(text || '').trim().length > 0;
            })
            .sort((a, b) => {
                const timeA = (a && a._timestamp) ? a._timestamp : 0;
                const timeB = (b && b._timestamp) ? b._timestamp : 0;
                return timeA - timeB;
            });
    }

    _resolveSafeDayId() {
        let safeDayId = this.dayId;
        if (!safeDayId || String(safeDayId).startsWith('trip_')) {
            if (window.stateManager) {
                safeDayId = window.stateManager.getState('currentDayId') || 'day1';
            } else {
                safeDayId = 'day1';
            }
        }
        return String(safeDayId);
    }

    _escape(str) {
        return window.escapeHtml ? window.escapeHtml(str) : (str || '');
    }

    // --- 视图渲染子方法 (View Renderers) ---

    _renderHeader(cardData, index, data) {
        const safeCategory = this._escape(cardData.category);
        const safeTime = this._escape(cardData.time);
        const timeInputVal = window.formatTimeForInput ? window.formatTimeForInput(cardData.time) : cardData.time;

        return `
            <div class="card-header">
                <div class="card-header-main">
                    <div class="card-sort-buttons">
                        <button class="card-sort-btn card-sort-up" data-index="${index}" title="上移">▲</button>
                        <button class="card-sort-btn card-sort-down" data-index="${index}" title="下移">▼</button>
                    </div>
                    <div class="card-header-content">
                        <div class="card-category-container" data-card-index="${index}">
                            <span class="card-category-display">${safeCategory}</span>
                            <input type="text" class="card-category-input" value="${safeCategory}" style="display: none;" />
                        </div>
                        <div class="card-time-container" data-card-index="${index}">
                            ${cardData.time ? `
                                <span class="card-time-display">${safeTime}</span>
                                <input type="time" class="card-time-input" value="${timeInputVal}" style="display: none;" />
                            ` : `
                                <span class="card-time-display" style="display: inline-block; color: #999; cursor: pointer;" title="点击添加时间">+ 添加时间</span>
                                <input type="time" class="card-time-input" value="" style="display: none;" />
                            `}
                        </div>
                        <div class="card-tag tag-${data.tag}" data-card-index="${index}" data-current-tag="${data.tag}">${this.getTagLabel(data.tag)}</div>
                    </div>
                    <div class="card-header-actions">
                        ${((typeof window.canDeleteItem !== 'function') || window.canDeleteItem(cardData))
                            ? `<button class="delete-item-btn" data-item-id="${cardData.id}" title="删除此项" ${this.sortMode ? 'style="display: none;"' : ''}>×</button>`
                            : ''}
                    </div>
                </div>
            </div>`;
    }

    _renderImageSection(images) {
        let content = '';
        if (images.length > 0) {
            const slides = images.map((img, i) => `
                <div class="carousel-slide">
                    <img src="${this._escape(img)}" alt="图片 ${i + 1}" class="card-image" data-image-url="${this._escape(img)}" data-image-index="${i}" style="cursor: pointer;" title="点击查看大图" />
                    <button class="image-remove-btn" data-image-index="${i}" title="删除图片">×</button>
                </div>`).join('');
            
            const dots = images.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');

            content = `
                <div class="image-carousel">
                    <button class="carousel-btn carousel-prev" title="上一张">‹</button>
                    <div class="carousel-wrapper">
                        <div class="carousel-track" style="transform: translateX(0);">${slides}</div>
                    </div>
                    <button class="carousel-btn carousel-next" title="下一张">›</button>
                    <div class="carousel-indicators">${dots}</div>
                </div>`;
        } else {
            content = `<div class="image-placeholder"><div class="image-placeholder-text">暂无图片</div></div>`;
        }

        return `
            <div class="card-section image-section">
                <div class="image-upload-controls">
                    <label class="image-upload-btn" title="上传图片" style="cursor: pointer; display: inline-block;">
                        📷 上传图片
                        <input type="file" class="image-upload-input" accept="image/*" multiple style="display: none;" />
                    </label>
                </div>
                <div class="image-container">${content}</div>
            </div>`;
    }

    // 权限助手：当前用户 / 是否已加入当前行程（成员才能添加，删除还需是作者）
    _me() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    _canEdit() { return (typeof window.canEditCurrentTrip !== 'function') || window.canEditCurrentTrip(); }

    _renderPlanSection(planItems, itemId, cardIndex) {
        const me = this._me();
        const canEdit = this._canEdit();
        const listHtml = planItems.length > 0 ? planItems.map((item, idx) => {
            const text = (typeof item === 'object') ? item._text : item;
            const hash = (typeof item === 'object') ? item._hash : '';
            const owner = (typeof item === 'object') ? (item._user || null) : null;
            const canDel = canEdit && (!owner || owner === me);
            const safeText = window.escapeHtmlKeepBr ? window.escapeHtmlKeepBr(text) : this._escape(text);
            
            // 获取点赞状态
            const likes = (window.LikeHandler) ? window.LikeHandler.getLikes(this.dayId, itemId, 'plan', idx) : [];
            const likeCount = Array.isArray(likes) ? likes.length : 0;
            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const isLiked = Array.isArray(likes) && currentUser && likes.includes(currentUser);

            return `
                <li class="plan-item">
                    <span class="plan-item-text">${safeText}</span>
                    <div class="plan-item-actions">
                        <button class="plan-item-like-btn ${isLiked ? 'liked' : ''}" 
                                data-plan-index="${idx}" data-plan-hash="${hash}" data-item-id="${itemId || ''}" title="点赞">
                            <span class="like-icon">♥</span>
                            ${likeCount > 0 ? `<span class="like-count">${likeCount}</span>` : ''}
                        </button>
                        ${canDel ? `<button class="plan-item-delete-btn" 
                                data-card-index="${cardIndex}" data-plan-index="${idx}" data-plan-hash="${hash}" data-item-id="${itemId || ''}" title="删除此项">×</button>` : ''}
                    </div>
                </li>`;
        }).join('') : '';

        return `
            <div class="card-section">
                <div class="card-section-header"><div class="card-section-title plan">计划</div></div>
                <ul class="plan-list">
                    ${listHtml}
                    ${canEdit ? `<li class="plan-item plan-add-item">
                        <button class="plan-add-btn" data-card-index="${cardIndex}" title="添加计划项">+ 添加计划项</button>
                        <div class="plan-input-container" style="display: none;">
                            <input type="text" class="plan-input" placeholder="输入计划项..." />
                            <div class="plan-input-actions">
                                <button class="plan-input-confirm">✓</button>
                                <button class="plan-input-cancel">✕</button>
                            </div>
                        </div>
                    </li>` : ''}
                </ul>
            </div>`;
    }

    _renderNoteSection(note, index) {
        const safeNote = this._escape(note);
        const htmlContent = window.markdownToHtml ? window.markdownToHtml(note) : note;
        
        return `
            <div class="card-section">
                <div class="card-section-header"><div class="card-section-title note">备注</div></div>
                <div class="card-section-content note-content-container" data-card-index="${index}">
                    <div class="note-content-display markdown-content">${htmlContent}</div>
                    <textarea class="note-content-input" style="display: none;" placeholder="输入备注（支持 Markdown 格式）...">${safeNote}</textarea>
                </div>
            </div>`;
    }

    async _renderSpendSection(spendItems, index) {
        // 获取所有参与人列表（从Firebase的user_passwords中获取，排除root）
        const getParticipantsList = async () => {
            try {
                // 从Firebase获取所有已注册的用户
                const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
                const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
                const snapshot = await get(passwordsRef);
                const passwords = snapshot.val();
                if (passwords) {
                    // 获取所有用户名，排除root账户
                    const allUsers = Object.keys(passwords);
                    const participants = allUsers.filter(user => user !== 'root');
                    return participants.length > 0 ? participants : ['p1', 'p2', 'p3', 'p4', 'p5'];
                }
            } catch (error) {
            }
            // 默认返回1-5人的列表
            return ['p1', 'p2', 'p3', 'p4', 'p5'];
        };
        
        // 获取参与人列表
        const participantsList = await getParticipantsList();
        
        // 生成参与人选择HTML
        const renderParticipantOptions = (index) => {
            return participantsList.map((participant, i) => `
                <div class="participant-option">
                    <input type="checkbox" id="participant-${participant}-${index}" value="${participant}" class="participant-checkbox" checked>
                    <label for="participant-${participant}-${index}">
                        <span class="participant-name">${participant}</span>
                    </label>
                </div>
            `).join('');
        };
        
        // 生成支出人选择HTML
        const renderPayerOptions = () => {
            return participantsList.map((participant, i) => `
                <option value="${participant}">${participant}</option>
            `).join('');
        };
        
        const me = this._me();
        const canEdit = this._canEdit();
        const rows = spendItems.length > 0 ? spendItems.map((item, i) => {
            // 处理参与人信息，默认显示所有参与人
            const participants = item.participants || [];
            const participantsText = participants.length > 0 ? participants.join(', ') : '未指定';
            const owner = item._user || null;
            const canDel = canEdit && (!owner || owner === me);
            return `
            <tr class="spend-row" data-spend-index="${i}">
                <td class="spend-item-name">${this._escape(item.item)}</td>
                <td class="spend-item-amount">¥${parseFloat(item.amount).toFixed(2)}</td>
                <td class="spend-item-payer">${this._escape(item.payer)}</td>
                <td class="spend-item-participants">${this._escape(participantsText)}</td>
                <td class="spend-item-action">
                    ${canDel ? `<button class="spend-delete-btn" data-spend-index="${i}" title="删除">×</button>` : ''}
                </td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" class="spend-empty">暂无消费记录</td></tr>';

        const total = spendItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

        return `
            <div class="card-section">
                <div class="card-section-header"><div class="card-section-title spend">💰 消费表</div></div>
                <div class="card-section-content spend-content">
                    <table class="spend-table">
                        <thead><tr><th>项目</th><th>金额</th><th>支出人</th><th>参与人</th><th></th></tr></thead>
                        <tbody class="spend-tbody">${rows}</tbody>
                        <tfoot>
                            <tr class="spend-total-row">
                                <td colspan="4" class="spend-total-label">总计：</td>
                                <td class="spend-total-amount">¥${total.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="spend-add-container" ${canEdit ? '' : 'style="display: none;"'}>
                        <button class="spend-add-btn" data-card-index="${index}" title="添加消费项">+ 添加消费项</button>
                        <div class="spend-input-container" style="display: none;">
                        <input type="text" class="spend-item-input" placeholder="项目名称..." />
                        <input type="number" class="spend-amount-input" placeholder="金额" step="0.01" min="0" />
                        <select class="spend-payer-input">
                            <option value="">请选择支出人</option>
                            ${renderPayerOptions()}
                            <option value="共同">共同</option>
                        </select>
                        <div class="spend-participants">
                            <div class="participants-title">参与分账人</div>
                            <div class="participants-options">
                                ${renderParticipantOptions(index)}
                            </div>
                        </div>
                        <div class="spend-input-actions">
                            <button class="spend-input-confirm">✓</button>
                                <button class="spend-input-cancel">✕</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    _renderCommentSection(comments, itemId, index) {
        const me = this._me();
        const canEdit = this._canEdit();
        const listHtml = comments.length > 0 ? comments.map((comment, i) => {
            const user = comment.user || 'unknown';
            const canDel = canEdit && (!comment.user || comment.user === me);
            const msg = String(comment.message || '');
            const formattedTime = window.formatTime ? window.formatTime(comment.timestamp) : '';
            
            // 获取点赞状态
            const likes = (window.LikeHandler) ? window.LikeHandler.getLikes(this.dayId, itemId, 'comment', i) : [];
            const likeCount = Array.isArray(likes) ? likes.length : 0;
            const currentUser = (typeof window.AuthManager !== 'undefined') ? window.AuthManager.getCurrentUser() : null;
            const isLiked = Array.isArray(likes) && currentUser && likes.includes(currentUser);

            // 获取当前登录用户（用于样式区分）
            const loggedInUser = (typeof window.AuthManager !== 'undefined') ? window.AuthManager.getCurrentUser() : null;
            
            return `
                <div class="comment-item ${user === loggedInUser ? 'user-a' : 'user-b'}" data-comment-hash="${comment._hash || ''}">
                    <div class="comment-header">
                        <span class="comment-user">👤 ${this._escape(user)}</span>
                        <span class="comment-time">${formattedTime}</span>
                    </div>
                    <div class="comment-content">${this._escape(msg)}</div>
                    ${canDel ? `<button class="comment-delete-btn" data-comment-hash="${comment._hash || ''}" title="删除留言">×</button>` : ''}
                    <button class="comment-like-btn ${isLiked ? 'liked' : ''}" 
                            data-comment-index="${i}" title="点赞">
                        <span class="like-icon">♥</span>
                        ${likeCount > 0 ? `<span class="like-count">${likeCount}</span>` : ''}
                    </button>
                </div>`;
        }).join('') : '<div class="no-comments">暂无留言</div>';

        return `
            <div class="card-section">
                <div class="card-section-title comment"> 留言</div>
                <div class="comments-container">${listHtml}</div>
                ${canEdit ? `<div class="comment-input-container">
                    <textarea class="comment-input" placeholder="输入留言..." rows="2"></textarea>
                    <button class="comment-submit">发送</button>
                </div>` : ''}
            </div>`;
    }

    _renderFooter(isExpanded) {
        return `
            <div class="card-footer">
                <button class="card-expand-btn" data-expanded="${isExpanded}" title="${isExpanded ? '收起' : '展开'}" 
                        style="transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};">
                    ▼
                </button>
            </div>`;
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
                                        } else {
                                        }
                                    }).catch(error => {
                                    });
                                }
                                
                                // 更新显示内容
                                noteDisplay.innerHTML = window.markdownToHtml ? window.markdownToHtml(newNote || '') : (newNote || '');
                            } catch (error) {
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
                                // 更新按钮进度
                                if (uploadBtn) {
                                    uploadBtn.textContent = `📤 上传中 (${uploadedCount}/${validFiles.length})...`;
                                }
                                
                                // 验证 URL 是否为有效的 Cloudinary URL
                                if (!result.url || !result.url.includes('cloudinary.com')) {
                                }
                                
                                return {
                                    url: result.url,
                                    fileName: file.name,
                                    publicId: result.publicId
                                };
                            })
                            .catch(error => {
                                throw error;
                            });
                    });
                    
                    // 调试：检查 uploadPromises 是否为数组
                    console.log('uploadPromises 是否为数组:', Array.isArray(uploadPromises));
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
                        const existingUrls = new Set(Object.values(currentImages).map(img => img.url));
                        const newImagesObj = { ...currentImages };
                        const newImageUrls = [];
                        
                        imageResults.forEach(img => {
                            if (!existingUrls.has(img.url)) {
                                const key = img.url.split('/').pop().replace(/[.#$\/\[\]]/g, '_');
                                newImagesObj[key] = { url: img.url, fileName: img.fileName };
                                newImageUrls.push(img.url);
                            }
                        });
                        
                        // 只保存 Cloudinary URL，不保存 base64
                        this.setImages(this.dayId, index, newImagesObj, itemId);
                        
                        // 如果所有图片都已存在，说明可能是重复触发
                        if (newImageUrls.length === 0 && imageUrls.length > 0) {
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
                        }
                        
                        // 显示成功消息
                        const successMessage = `✅ 成功上传 ${imageUrls.length} 张图片到 Cloudinary${uploadedFileNames ? `: ${uploadedFileNames}` : ''}`;
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
                    if (newItem) {
                        try {
                            await this.addPlanItem(index, newItem);
                            // 重置输入框和UI状态
                            planInput.value = '';
                            planInputContainer.style.display = 'none';
                            planAddBtn.style.display = 'block';
                        } catch (error) {
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
                    
                    // 从对象中删除指定索引的图片
                    const imageKeys = Object.keys(images);
                    if (btnIndex >= 0 && btnIndex < imageKeys.length) {
                        const keyToRemove = imageKeys[btnIndex];
                        delete images[keyToRemove];
                        this.setImages(this.dayId, index, images, itemId);
                        this.renderCards();
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            });
                        }
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
            
            // 防止重复绑定事件监听器：检查是否已经绑定过
            if (!deleteBtn.dataset.deleteHandlerAttached) {
                deleteBtn.dataset.deleteHandlerAttached = 'true';
                
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
                            // 使用统一结构删除（deleteItem 函数已经处理了备份和同步）
                            // 注意：这里不直接重新渲染，而是等待事件总线的 ITEM_DELETED 事件
                            // 这样可以避免重复渲染（事件总线已经在 script.js 中处理了渲染）
                            deleteItem(this.dayId, itemId);
                            deleteBtn.dataset.deleting = 'false';
                        } else {
                            deleteBtn.dataset.deleting = 'false';
                        }
                    } else {
                        deleteBtn.dataset.deleting = 'false';
                    }
                });
            }
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
                        console.log(`[CardSlider] 点赞成功，刷新卡片: ${itemId}`);
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
                                        // 如果 items 是对象结构，转换为数组
                                        let itemsArray = day.items;
                                        if (itemsArray && typeof itemsArray === 'object' && !Array.isArray(itemsArray)) {
                                            itemsArray = Object.values(itemsArray).sort((a, b) => {
                                                const orderA = a.order !== undefined ? a.order : 999999;
                                                const orderB = b.order !== undefined ? b.order : 999999;
                                                return orderA - orderB;
                                            });
                                        }
                                        this.cards = itemsArray;
                                        this.renderCards();
                                        this.attachCardEventsForAll();
                                    }
                                }
                            }
                        }
                    }
                } else {
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
                        console.log(`[CardSlider] 评论点赞成功，刷新卡片: ${itemId}`);
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
                                        // 如果 items 是对象结构，转换为数组
                                        let itemsArray = day.items;
                                        if (itemsArray && typeof itemsArray === 'object' && !Array.isArray(itemsArray)) {
                                            itemsArray = Object.values(itemsArray).sort((a, b) => {
                                                const orderA = a.order !== undefined ? a.order : 999999;
                                                const orderB = b.order !== undefined ? b.order : 999999;
                                                return orderA - orderB;
                                            });
                                        }
                                        this.cards = itemsArray;
                                        this.renderCards();
                                        this.attachCardEventsForAll();
                                    }
                                }
                            }
                        }
                    }
                } else {
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
                // addComment 内部已经调用 updateSingleCard，这里不需要再调用
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
                    // deleteComment 内部已经调用 updateSingleCard，这里不需要再调用
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
                    
                    // 获取选中的参与人
                    const participantCheckboxes = card.querySelectorAll('.participant-checkbox');
                    const participants = Array.from(participantCheckboxes)
                        .filter(checkbox => checkbox.checked)
                        .map(checkbox => checkbox.value);
                    
                    if (itemName && !isNaN(amount) && amount > 0) {
                        await this.addSpendItem(index, itemName, amount, payer, participants);
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
                // deleteSpendItem 内部已经调用 updateSingleCard，这里不需要再调用
            });
        });
    }
    
    // 添加消费项
    async addSpendItem(cardIndex, itemName, amount, payer = '', participants = []) {
        // 检查写权限
        if (!checkWritePermission()) {
            return;
        }
        if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
            alert('请先加入该行程后再添加内容');
            return;
        }
        
        const card = this.cards[cardIndex];
        if (!card) {
            return;
        }
        
        const itemId = card.id;
        if (!itemId) {
            return;
        }
        
        const newSpendItem = {
            item: itemName,
            amount: parseFloat(amount) || 0,
            payer: payer || '',
            participants: participants || [],
            _user: (typeof getCurrentUser === 'function' ? getCurrentUser() : (window.getCurrentUser && window.getCurrentUser())) || 'unknown'
        };
        
        // 关键修复：从统一结构获取最新的 spend 数据，而不是从 card.spend 获取
        let spendItems = [];
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    // 确保 spend 是数组
                    if (Array.isArray(item.spend)) {
                        spendItems = [...item.spend]; // 创建副本
                    } else if (item.spend) {
                        spendItems = [item.spend];
                    } else {
                        spendItems = [];
                    }
                } else {
                    // 如果找不到 item，使用 card.spend 作为回退
                    spendItems = Array.isArray(card.spend) ? [...card.spend] : (card.spend ? [card.spend] : []);
                }
            } else {
                // 如果统一数据不存在，使用 card.spend 作为回退
                spendItems = Array.isArray(card.spend) ? [...card.spend] : (card.spend ? [card.spend] : []);
            }
        } else {
            // 如果 tripDataStructure 不存在，使用 card.spend
            spendItems = Array.isArray(card.spend) ? [...card.spend] : (card.spend ? [card.spend] : []);
        }
        
        // 添加新的消费项
        spendItems.push(newSpendItem);
        
        // 保存到统一结构
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    item.spend = spendItems;
                    item._updatedAt = new Date().toISOString();
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    
                    // 更新内存中的 card 对象，保持同步
                    card.spend = spendItems;
                    
                    if (saveSuccess === true) {
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            });
                        } else {
                            // 如果没有部分上传方法，使用全量上传
                            if (typeof triggerImmediateUpload === 'function') {
                                triggerImmediateUpload();
                            }
                        }
                        
                        // 【优化】使用单卡片更新，避免整个容器重绘导致闪烁
                        this.updateSingleCard(itemId);
                        return;
                    } else {
                    }
                } else {
                }
            } else {
            }
        } else {
        }
        
        // 如果保存失败，也更新 card 对象并重新渲染（至少显示在内存中）
        card.spend = spendItems;
        this.updateSingleCard(itemId);
    }
    
    // 删除消费项
    async deleteSpendItem(cardIndex, spendIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
            alert('请先加入该行程后再操作');
            return;
        }
        
        const card = this.cards[cardIndex];
        if (!card) {
            return;
        }
        
        const itemId = card.id;
        if (!itemId) {
            return;
        }
        
        // 关键修复：从统一结构获取最新的 spend 数据，而不是从 card.spend 获取
        let spendItems = [];
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    // 确保 spend 是数组
                    if (Array.isArray(item.spend)) {
                        spendItems = [...item.spend]; // 创建副本，避免直接修改原数组
                    } else if (item.spend) {
                        spendItems = [item.spend];
                    } else {
                        spendItems = [];
                    }
                } else {
                    return;
                }
            } else {
                return;
            }
        } else {
            // 如果 tripDataStructure 不存在，尝试从 card.spend 获取
            spendItems = Array.isArray(card.spend) ? [...card.spend] : (card.spend ? [card.spend] : []);
        }
        
        // 验证索引有效性
        if (spendIndex < 0 || spendIndex >= spendItems.length) {
            return;
        }
        
        // 归属校验：只能删除自己添加的消费项（无归属的旧数据放行）
        const spendOwner = spendItems[spendIndex] && spendItems[spendIndex]._user;
        const meNow = (window.getCurrentUser && window.getCurrentUser()) || null;
        if (spendOwner && spendOwner !== meNow) {
            alert('只能删除自己添加的内容');
            return;
        }
        
        // 从数组中删除指定项
        spendItems.splice(spendIndex, 1);
        
        // 更新统一结构
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    // 如果数组为空，设置为 null；否则设置为数组
                    item.spend = spendItems.length > 0 ? spendItems : null;
                    item._updatedAt = new Date().toISOString();
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    
                    // 更新内存中的 card 对象，保持同步
                    card.spend = item.spend;
                    
                    if (saveSuccess === true) {
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            });
                        } else {
                            // 如果没有部分上传方法，使用全量上传
                            if (typeof triggerImmediateUpload === 'function') {
                                triggerImmediateUpload();
                            }
                        }
                        
                        // 【优化】使用单卡片更新，避免整个容器重绘导致闪烁
                        this.updateSingleCard(itemId);
                        return;
                    } else {
                    }
                } else {
                }
            } else {
            }
        } else {
        }
        
        // 如果保存失败，也更新 card 对象并重新渲染（至少显示在内存中）
        card.spend = spendItems.length > 0 ? spendItems : null;
        this.updateSingleCard(itemId);
    }
    
    // 删除留言
    async deleteComment(dayId, itemIndex, commentHash, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
            alert('请先加入该行程后再操作');
            return;
        }
        
        const comments = this.getComments(dayId, itemIndex, itemId);
        const commentIndex = comments.findIndex(c => c._hash === commentHash);
        
        if (commentIndex === -1) return;
        
        // 归属校验：只能删除自己发的留言（无归属的旧数据放行）
        const commentOwner = comments[commentIndex] && comments[commentIndex].user;
        const meNow = (window.getCurrentUser && window.getCurrentUser()) || null;
        if (commentOwner && commentOwner !== meNow) {
            alert('只能删除自己添加的内容');
            return;
        }
        
        // 获取要删除的 comment（深拷贝，避免引用问题）
        const deletedComment = JSON.parse(JSON.stringify(comments[commentIndex]));
        
        // 优先保存到统一结构
        // 如果itemId参数为null，尝试从card获取
        if (!itemId) {
            const card = this.cards[itemIndex];
            itemId = card?.id || null;
        }
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                // 使用统一的备份方法
                const backupResult = tripDataStructure.createBackupEntry(unifiedData, 'comment', deletedComment, {
                    dayId: dayId,
                    itemId: itemId,
                    hash: commentHash,
                    index: commentIndex
                });
                
                if (!backupResult.success) {
                    return;
                }
                
                const timestampKey = backupResult.timestampKey;
                const backupEntry = backupResult.backupEntry;
                
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    // 关键修复：comments 现在是对象结构 {hash: comment}，需要使用 hash 删除
                    if (!item.comments || typeof item.comments !== 'object' || Array.isArray(item.comments)) {
                        // 如果 comments 不存在或不是对象结构，初始化为对象
                        item.comments = {};
                    }
                    // 从对象中删除指定的 comment（使用 hash 作为 key）
                    delete item.comments[commentHash];
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    
                    // 同步备份字段到 Firebase（只上传新添加的那一条备份项）
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.update) {
                        // 只上传新添加的那一条备份项，使用时间戳作为 key
                        const updates = {};
                        updates[`_backup/${timestampKey}`] = backupEntry;
                        updates['_lastSync'] = new Date().toISOString();
                        updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                        
                        dataSyncFirebase.update(dataSyncFirebase.databaseRef, updates).then(() => {
                        }).catch(backupError => {
                            // 如果备份同步失败，回退到全量上传
                            if (dataSyncFirebase.upload) {
                                dataSyncFirebase.upload(true).catch(error => {
                                });
                            }
                        });
                    }
                    
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                        dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                        });
                    }
                    
                    // 【优化】使用单卡片更新，避免整个容器重绘导致闪烁
                    this.updateSingleCard(itemId);
                    return;
                }
            }
        } else {
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
        
        // 关键修复：comments 现在是对象结构 {hash: comment}，需要转换为数组并按时间排序
        const comments = item.comments;
        if (Array.isArray(comments)) {
            // 数组结构（向后兼容）
            return comments
                .filter(c => c && !c._deleted)
                .sort((a, b) => {
                    // 按时间戳排序（旧的在前）
                    const timeA = a.timestamp || 0;
                    const timeB = b.timestamp || 0;
                    return timeA - timeB;
                });
        } else if (comments && typeof comments === 'object' && comments !== null) {
            // 对象结构：转换为数组并按时间排序
            return Object.values(comments)
                .filter(c => c && !c._deleted)
                .sort((a, b) => {
                    // 按时间戳排序（旧的在前）
                    const timeA = a.timestamp || 0;
                    const timeB = b.timestamp || 0;
                    return timeA - timeB;
                });
        } else {
            return [];
        }
    }
    
    // 添加留言
    async addComment(dayId, itemIndex, message, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
            alert('请先加入该行程后再添加内容');
            return;
        }
        
        // 如果 itemId 为空，尝试从 cards 数组中获取
        if (!itemId && this.cards && this.cards[itemIndex]) {
            itemId = this.cards[itemIndex].id || null;
        }
        
        if (!itemId) {
            return;
        }
        
        // const comments = this.getComments(dayId, itemIndex, itemId);
        
        // 生成时间戳
        const timestamp = Date.now();
        
        // 生成哈希值
        const currentUser = getCurrentUser();
        const hash = await generateContentHash(message, currentUser, timestamp);
        
        // 只保存到统一结构
        if (typeof tripDataStructure === 'undefined') {
            return;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            // 尝试列出所有 items 来调试
            const day = tripDataStructure.getDayData(unifiedData, dayId);
            if (day && day.items) {
                // 关键修复：day.items 现在是对象结构，需要适配
                let itemsArray = [];
                if (Array.isArray(day.items)) {
                    itemsArray = day.items;
                } else if (typeof day.items === 'object' && day.items !== null) {
                    itemsArray = Object.values(day.items);
                }
                
                console.log('当前 day 的 items:', itemsArray.map(i => ({ id: i.id, category: i.category })));
                // 检查 itemId 是否匹配
                const foundItem = itemsArray.find(i => {
                    const match = i && i.id === itemId;
                    if (!match) {
                        // 检查类型是否不同
                        if (i && String(i.id) === String(itemId)) {
                        }
                    }
                    return match;
                });
                if (!foundItem) {
                    console.log('所有 itemIds:', itemsArray.map(i => ({ id: i.id, idType: typeof i.id })));
                }
            }
            return;
        }
        
        // 关键修复：comments 现在是对象结构 {hash: comment}，需要适配
        // 确保 comments 是对象结构
        if (!item.comments || typeof item.comments !== 'object' || Array.isArray(item.comments)) {
            // 如果 comments 不存在或不是对象结构，初始化为对象
            item.comments = {};
        }
        
        // 检查是否已存在相同哈希的留言（防止重复）
        if (item.comments[hash]) {
            // 如果已存在，不重复添加
            return;
        }
        
        // 添加新留言到对象结构中（使用 hash 作为 key）
        const newComment = {
            user: currentUser,
            message: message,
            timestamp: timestamp,
            _hash: hash // 添加哈希值用于去重
        };
        item.comments[hash] = newComment;
        item._updatedAt = new Date().toISOString();
        tripDataStructure.saveUnifiedData(unifiedData);
        
        // 使用增量更新，只更新新添加的这个 comment（对象结构）
        // 关键：使用 Firebase 的 update 方法，直接更新 comments/{hash} 路径
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.update && itemId) {
            // 使用 update 方法直接更新特定路径
            const updates = {};
            // 路径格式：trip_unified_data/days/{dayId}/items/{itemId}/comments/{hash}
            updates[`trip_unified_data/days/${dayId}/items/${itemId}/comments/${hash}`] = newComment;
            updates['_lastSync'] = new Date().toISOString();
            updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
            
            dataSyncFirebase.update(dataSyncFirebase.databaseRef, updates).then(() => {
            }).catch(error => {
                // 回退：上传整个 item
                if (dataSyncFirebase.uploadItem) {
                    dataSyncFirebase.uploadItem(dayId, itemId).catch(uploadError => {
                    });
                }
            });
        } else {
            // 如果没有增量更新方法，使用全量上传
            if (typeof window.triggerImmediateUpload === 'function') {
                window.triggerImmediateUpload();
            }
        }
        
        // 【优化】使用单卡片更新，避免整个容器重绘导致闪烁
        this.updateSingleCard(itemId);
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
    
    // 获取图片（多张）- 返回对象结构 {key: {url, ...}}
    getImages(dayId, itemIndex, itemId = null) {
        // 只从统一结构读取
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            return {};
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return {};
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            return {};
        }
        
        // 确保返回的是对象
        let images = item.images || {};
        if (Array.isArray(images)) {
            // 如果是数组，转换为对象
            const imagesObj = {};
            images.forEach((img, index) => {
                const key = typeof img === 'object' && img.url 
                    ? img.url.split('/').pop().replace(/[.#$\/\[\]]/g, '_') 
                    : `image_${index}`;
                imagesObj[key] = typeof img === 'object' ? img : { url: img };
            });
            images = imagesObj;
        } else if (typeof images !== 'object' || images === null) {
            images = {};
        }
        return images;
    }
    
    // 设置图片（多张）- 接受对象结构 {key: {url, ...}} 或数组
    setImages(dayId, itemIndex, imagesData, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 只保存到统一结构
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            return;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            return;
        }
        
        // 确保保存的是对象结构
        let imagesObj = imagesData || {};
        if (Array.isArray(imagesObj)) {
            // 如果是数组，转换为对象
            const tempObj = {};
            imagesObj.forEach((img, index) => {
                const key = typeof img === 'object' && img.url 
                    ? img.url.split('/').pop().replace(/[.#$\/\[\]]/g, '_') 
                    : `image_${index}`;
                tempObj[key] = typeof img === 'object' ? img : { url: img };
            });
            imagesObj = tempObj;
        } else if (typeof imagesObj !== 'object' || imagesObj === null) {
            imagesObj = {};
        }
        
        item.images = imagesObj;
        item._updatedAt = new Date().toISOString();
        tripDataStructure.saveUnifiedData(unifiedData);
        
        // 只上传这个 item，不进行全量上传
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
            dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
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
                                // 如果增量更新失败，尝试使用 uploadItem 作为备用方案
                                if (dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
                                    });
                                }
                            }
                        }).catch(error => {
                            // 如果增量更新出错，尝试使用 uploadItem 作为备用方案
                            if (dataSyncFirebase.uploadItem) {
                                dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
                                });
                            }
                        });
                    } else {
                        // 如果无法获取索引，尝试使用 uploadItem 上传整个 item
                        if (dataSyncFirebase.uploadItem) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(err => {
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
            return;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
        if (!item) {
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
            });
        }
    }
    
    // 添加计划项
    async addPlanItem(cardIndex, newItem) {
        // 检查写权限
        if (!checkWritePermission()) {
            return;
        }
        if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
            alert('请先加入该行程后再添加内容');
            return;
        }
        
        const card = this.cards[cardIndex];
        if (!card || !newItem || !newItem.trim()) {
            return;
        }
        
        const trimmedItem = newItem.trim();
        
        // 关键修复：plan 现在是对象结构 {hash: planItem}，需要适配
        // 生成时间戳和哈希值
        const currentUser = getCurrentUser();
        const timestamp = Date.now();
        const hash = await generateContentHash(trimmedItem, currentUser, timestamp);
        
        // 优先保存到统一结构
        const itemId = card.id;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    // 确保 plan 是对象结构
                    if (!item.plan || typeof item.plan !== 'object' || Array.isArray(item.plan)) {
                        item.plan = {};
                    }
                    
                    // 检查是否已存在相同哈希的计划项（防止重复）
                    if (item.plan[hash]) {
                        return;
                    }
                    
                    // 添加新计划项到对象结构中（使用 hash 作为 key）
                    const newPlanItem = {
                        _text: trimmedItem,
                        _hash: hash,
                        _timestamp: timestamp,
                        _user: currentUser
                    };
                    item.plan[hash] = newPlanItem;
                    item._updatedAt = new Date().toISOString();
                    
                    // 更新 card.plan（用于渲染）
                    card.plan = item.plan;
        
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    if (saveSuccess !== false) {
                        // 【优化】使用单卡片更新，避免整个容器重绘导致闪烁
                        this.updateSingleCard(itemId);
                        
                        // 使用增量更新，只更新新添加的这个 plan item（对象结构）
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.update && itemId) {
                            // 使用 update 方法直接更新特定路径
                            const updates = {};
                            // 路径格式：trip_unified_data/days/{dayId}/items/{itemId}/plan/{hash}
                            updates[`trip_unified_data/days/${this.dayId}/items/${itemId}/plan/${hash}`] = newPlanItem;
                            updates['_lastSync'] = new Date().toISOString();
                            updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                            
                            dataSyncFirebase.update(dataSyncFirebase.databaseRef, updates).then(() => {
                            }).catch(error => {
                                // 回退：上传整个 item
                                if (dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).catch(uploadError => {
                                    });
                                }
                            });
                        } else {
                            // 如果没有增量更新方法，使用全量上传
                            if (typeof window.triggerImmediateUpload === 'function') {
                                window.triggerImmediateUpload();
                            }
                        }
                        return;
                    } else {
                        alert('保存失败，请重试');
                    }
                } else {
                    alert('找不到数据项，请刷新页面重试');
                }
            } else {
                alert('数据加载失败，请刷新页面重试');
            }
        } else {
            alert('数据项ID无效，请刷新页面重试');
        }
    }
    
    // 删除计划项（硬删除，使用哈希或索引）
    deletePlanItem(cardIndex, planIndex, planHash = null, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) {
            return;
        }
        if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
            alert('请先加入该行程后再操作');
            return;
        }
        
        const card = this.cards[cardIndex];
        if (!card) {
            return;
        }
        // 优先使用统一数据结构
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    // 关键修复：plan 现在是对象结构 {hash: planItem}，需要适配
                    // 确保 plan 是对象结构
                    if (!item.plan || typeof item.plan !== 'object' || Array.isArray(item.plan)) {
                        // 如果是数组，转换为对象
                        if (Array.isArray(item.plan)) {
                            const planObj = {};
                            item.plan.forEach((p, idx) => {
                                if (p && typeof p === 'object' && p._hash) {
                                    planObj[p._hash] = p;
                                } else if (p) {
                                    const key = Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 9);
                                    planObj[key] = typeof p === 'string' ? { _text: p, _hash: key, _timestamp: Date.now() } : { ...p, _hash: key };
                                }
                            });
                            item.plan = planObj;
                        } else {
                            item.plan = {};
                        }
                    }
                    
                    // 优先使用哈希值查找（最可靠）
                    let targetHash = null;
                    if (planHash && planHash.trim() !== '') {
                        targetHash = planHash;
                    } else {
                        // 如果没有哈希，使用索引查找（需要转换为数组）
                        const planArray = Object.values(item.plan).sort((a, b) => {
                            const timeA = (a && typeof a === 'object' && a._timestamp) ? a._timestamp : 0;
                            const timeB = (b && typeof b === 'object' && b._timestamp) ? b._timestamp : 0;
                            return timeA - timeB;
                        });
                        if (planIndex >= 0 && planIndex < planArray.length) {
                            const planItem = planArray[planIndex];
                            targetHash = (planItem && typeof planItem === 'object' && planItem._hash) ? planItem._hash : null;
                        }
                    }
                    
                    // 检查哈希是否有效
                    if (targetHash && item.plan[targetHash]) {
                        // 归属校验：只能删除自己添加的计划项（无归属的旧数据放行）
                        const planOwner = item.plan[targetHash]._user || null;
                        const meNow = (window.getCurrentUser && window.getCurrentUser()) || null;
                        if (planOwner && planOwner !== meNow) {
                            alert('只能删除自己添加的内容');
                            return;
                        }
                        // 获取要删除的 plan item（深拷贝，避免引用问题）
                        const deletedPlanItem = JSON.parse(JSON.stringify(item.plan[targetHash]));
                        // 使用统一的备份方法
                        const backupResult = tripDataStructure.createBackupEntry(unifiedData, 'plan_item', deletedPlanItem, {
                            dayId: this.dayId,
                            itemId: itemId,
                            hash: targetHash
                        });
                        
                        if (!backupResult.success) {
                            return;
                        }
                        
                        const timestampKey = backupResult.timestampKey;
                        const backupEntry = backupResult.backupEntry;
                        
                        // 真正从对象中删除（使用 delete 操作符）
                        delete item.plan[targetHash];
                        console.log('删除后 plan 项数量:', Object.keys(item.plan).length);
                        
                        // 更新 item._updatedAt
                        item._updatedAt = new Date().toISOString();
                        const updateSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                        if (updateSuccess) {
                            // 更新本地 card 数据
                            card.plan = item.plan;
                            
                            // 保存当前滚动位置
                            const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                            const cardElement = this.container.querySelector(`.card[data-index="${cardIndex}"]`);
                            const cardScrollTop = cardElement ? cardElement.scrollTop : 0;
                            
                            // 同步到 Firebase：先更新 _backup 字段，再删除 plan 对象中的项
                            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.update) {
                                // 只上传新添加的那一条备份项，使用时间戳作为 key
                                const updates = {};
                                updates[`_backup/${timestampKey}`] = backupEntry;
                                // 删除 plan 对象中的项（设置为 null）
                                updates[`trip_unified_data/days/${this.dayId}/items/${itemId}/plan/${targetHash}`] = null;
                                updates['_lastSync'] = new Date().toISOString();
                                updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                                
                                dataSyncFirebase.update(dataSyncFirebase.databaseRef, updates).then(() => {
                                }).catch(error => {
                                    // 如果增量更新失败，回退到 uploadItem
                                    if (dataSyncFirebase.uploadItem) {
                                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(uploadError => {
                                        });
                                    }
                                });
                            } else {
                                // 如果没有 update 方法，使用全量上传
                                if (typeof window.triggerImmediateUpload === 'function') {
                                    window.triggerImmediateUpload();
                                }
                            }
                            
                            // 【优化】使用单卡片更新，避免整个容器重绘导致闪烁
                            this.updateSingleCard(itemId);
                            return;
                        } else {
                            alert('删除失败，请重试');
                        }
                    } else {
                        alert('删除失败：找不到要删除的计划项');
                    }
                } else {
                    alert('删除失败：找不到数据项');
                }
            } else {
                alert('删除失败：数据加载失败');
            }
        } else {
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
                    // 关键修复：day.items 现在是对象结构，不能使用 find 方法
                    orderInfo.forEach((orderItem, idx) => {
                        if (day.items && typeof day.items === 'object' && !Array.isArray(day.items)) {
                            // 对象结构：直接使用 itemId 作为 key
                            const item = day.items[orderItem.id];
                            if (item) {
                                item.order = idx;
                            }
                        } else if (Array.isArray(day.items)) {
                            // 数组结构（向后兼容）
                            const item = day.items.find(i => i && i.id === orderItem.id);
                            if (item) {
                                item.order = idx;
                            }
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

    destroy() {
        console.log(`[Slider ${this.instanceId}] 正在执行销毁...`);
        // 1. 解除事件总线的监听，防止“幽灵刷新”
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        // 2. 物理清空 DOM 容器，确保下一任 Slider 拿到的是白纸
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
// 暴露到全局
window.CardSlider = CardSlider;