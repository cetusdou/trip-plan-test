// 当前用户管理
let currentUser = localStorage.getItem('trip_current_user') || 'userA';
let currentDayId = 'day1';

// 用户管理函数
function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem('trip_current_user', user);
    updateUserSelector();
    // 重新渲染当前卡片以更新留言和评分
    if (currentDayId) {
        showDay(currentDayId);
    }
}

function updateUserSelector() {
    document.querySelectorAll('.user-btn').forEach(btn => {
        if (btn.dataset.user === currentUser) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// 滑动卡片逻辑
class CardSlider {
    constructor(containerId, cards, dayId) {
        this.container = document.getElementById(containerId);
        this.cards = cards;
        this.dayId = dayId;
        this.currentIndex = 0;
        this.isDragging = false;
        this.startX = 0;
        this.currentX = 0;
        this.threshold = 50; // 滑动阈值
        this.init();
    }

    init() {
        this.renderCards();
        this.attachEventListeners();
    }

    renderCards() {
        // 查找或创建堆叠容器
        let stack = this.container.querySelector('.cards-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'cards-stack';
            // 确保指示器在stack之前
            const indicator = this.container.querySelector('.card-indicator');
            if (indicator) {
                this.container.insertBefore(stack, indicator);
            } else {
                this.container.appendChild(stack);
            }
        } else {
            stack.innerHTML = '';
        }
        
        // 创建卡片（从后往前，最后一张在最上面）
        for (let i = this.cards.length - 1; i >= 0; i--) {
            const card = this.createCard(this.cards[i], i);
            stack.appendChild(card);
        }
        
        this.updateIndicator();
    }

    createCard(cardData, index) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;
        card.dataset.dayId = this.dayId;
        card.dataset.itemIndex = index;
        
        // 获取留言和评分数据
        const comments = this.getComments(this.dayId, index);
        const ratings = this.getRatings(this.dayId, index);
        
        let html = `
            <div class="card-header">
                <div class="card-category">${this.escapeHtml(cardData.category)}</div>
                ${cardData.time ? `<div class="card-time">${this.escapeHtml(cardData.time)}</div>` : ''}
            </div>
            <div class="card-content">
        `;
        
        if (cardData.plan) {
            html += `
                <div class="card-section">
                    <div class="card-section-title plan">计划</div>
                    <div class="card-section-content">${cardData.plan}</div>
                </div>
            `;
        }
        
        if (cardData.note) {
            html += `
                <div class="card-section">
                    <div class="card-section-title note">备注</div>
                    <div class="card-section-content note-content">${cardData.note}</div>
                </div>
            `;
        }
        
        if (cardData.rating) {
            html += `
                <div class="card-section">
                    <div class="card-section-title rating">原始评分</div>
                    <div class="card-section-content rating-content">${this.escapeHtml(cardData.rating)}</div>
                </div>
            `;
        }
        
        // 添加评分区域
        html += `
            <div class="card-section">
                <div class="card-section-title rating">我的评分</div>
                <div class="rating-input-container">
                    <div class="star-rating">
                        ${[1, 2, 3, 4, 5].map(star => `
                            <span class="star" data-rating="${star}">⭐</span>
                        `).join('')}
                    </div>
                    <div class="rating-display">
                        ${ratings.userA ? `<span class="rating-item user-a">用户A: ${ratings.userA}⭐</span>` : ''}
                        ${ratings.userB ? `<span class="rating-item user-b">用户B: ${ratings.userB}⭐</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // 添加留言区域
        html += `
            <div class="card-section">
                <div class="card-section-title comment">💬 留言</div>
                <div class="comments-container">
                    ${comments.map(comment => `
                        <div class="comment-item ${comment.user === 'userA' ? 'user-a' : 'user-b'}">
                            <div class="comment-header">
                                <span class="comment-user">${comment.user === 'userA' ? '👤 用户A' : '👤 用户B'}</span>
                                <span class="comment-time">${this.formatTime(comment.timestamp)}</span>
                            </div>
                            <div class="comment-content">${this.escapeHtml(comment.message)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="comment-input-container">
                    <textarea class="comment-input" placeholder="输入留言..." rows="2"></textarea>
                    <button class="comment-submit">发送</button>
                </div>
            </div>
        `;
        
        html += '</div>';
        card.innerHTML = html;
        
        // 添加事件监听器
        this.attachCardEvents(card, index);
        
        return card;
    }
    
    attachCardEvents(card, index) {
        // 评分点击事件
        const stars = card.querySelectorAll('.star');
        const ratings = this.getRatings(this.dayId, index);
        const currentRating = ratings[currentUser] || 0;
        
        // 高亮当前用户的评分
        stars.forEach((star, i) => {
            if (i < currentRating) {
                star.classList.add('active');
            }
            star.addEventListener('click', () => {
                this.setRating(this.dayId, index, i + 1);
                // 重新渲染卡片
                this.renderCards();
            });
        });
        
        // 留言提交事件
        const commentInput = card.querySelector('.comment-input');
        const commentSubmit = card.querySelector('.comment-submit');
        
        commentSubmit.addEventListener('click', () => {
            const message = commentInput.value.trim();
            if (message) {
                this.addComment(this.dayId, index, message);
                commentInput.value = '';
                // 重新渲染卡片
                this.renderCards();
            }
        });
        
        // 回车发送留言
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commentSubmit.click();
            }
        });
    }
    
    // 获取留言
    getComments(dayId, itemIndex) {
        const key = `trip_comments_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }
    
    // 添加留言
    addComment(dayId, itemIndex, message) {
        const key = `trip_comments_${dayId}_${itemIndex}`;
        const comments = this.getComments(dayId, itemIndex);
        comments.push({
            user: currentUser,
            message: message,
            timestamp: Date.now()
        });
        localStorage.setItem(key, JSON.stringify(comments));
        // 如果启用了自动同步，尝试上传
        if (typeof dataSync !== 'undefined' && dataSync.autoSyncEnabled) {
            dataSync.upload().catch(() => {}); // 静默失败，不干扰用户体验
        }
    }
    
    // 获取评分
    getRatings(dayId, itemIndex) {
        const key = `trip_ratings_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : {};
    }
    
    // 设置评分
    setRating(dayId, itemIndex, rating) {
        const key = `trip_ratings_${dayId}_${itemIndex}`;
        const ratings = this.getRatings(dayId, itemIndex);
        ratings[currentUser] = rating;
        localStorage.setItem(key, JSON.stringify(ratings));
        // 如果启用了自动同步，尝试上传
        if (typeof dataSync !== 'undefined' && dataSync.autoSyncEnabled) {
            dataSync.upload().catch(() => {}); // 静默失败，不干扰用户体验
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    attachEventListeners() {
        const cards = this.container.querySelectorAll('.card');
        
        cards.forEach(card => {
            // 触摸事件
            card.addEventListener('touchstart', (e) => this.handleStart(e, card), { passive: false });
            card.addEventListener('touchmove', (e) => this.handleMove(e, card), { passive: false });
            card.addEventListener('touchend', (e) => this.handleEnd(e, card), { passive: false });
            
            // 鼠标事件
            card.addEventListener('mousedown', (e) => this.handleStart(e, card));
            card.addEventListener('mousemove', (e) => this.handleMove(e, card));
            card.addEventListener('mouseup', (e) => this.handleEnd(e, card));
            card.addEventListener('mouseleave', (e) => this.handleEnd(e, card));
        });
    }

    handleStart(e, card) {
        if (card !== this.getTopCard()) return;
        
        this.isDragging = true;
        this.startX = this.getEventX(e);
        card.classList.add('swiping');
        e.preventDefault();
    }

    handleMove(e, card) {
        if (!this.isDragging || card !== this.getTopCard()) return;
        
        this.currentX = this.getEventX(e);
        const deltaX = this.currentX - this.startX;
        
        if (Math.abs(deltaX) > 5) {
            card.style.transform = `translateX(${deltaX}px) rotate(${deltaX * 0.1}deg)`;
        }
        
        e.preventDefault();
    }

    handleEnd(e, card) {
        if (!this.isDragging || card !== this.getTopCard()) return;
        
        this.isDragging = false;
        const deltaX = this.currentX - this.startX;
        
        card.classList.remove('swiping');
        card.style.transform = '';
        
        if (Math.abs(deltaX) > this.threshold) {
            if (deltaX > 0) {
                this.swipeRight(card);
            } else {
                this.swipeLeft(card);
            }
        }
    }

    getEventX(e) {
        return e.touches ? e.touches[0].clientX : e.clientX;
    }

    getTopCard() {
        const cards = this.container.querySelectorAll('.card');
        return cards[cards.length - 1];
    }

    swipeLeft(card) {
        card.classList.add('swiped-left');
        setTimeout(() => {
            card.remove();
            this.currentIndex++;
            this.updateIndicator();
            
            // 如果没有更多卡片，可以重新开始或显示完成消息
            if (this.currentIndex >= this.cards.length) {
                this.showCompletion();
            }
        }, 300);
    }

    swipeRight(card) {
        card.classList.add('swiped-right');
        setTimeout(() => {
            card.remove();
            this.currentIndex++;
            this.updateIndicator();
            
            if (this.currentIndex >= this.cards.length) {
                this.showCompletion();
            }
        }, 300);
    }

    updateIndicator() {
        // 查找指示器（在容器内部，但不在stack内部）
        let indicator = this.container.querySelector('.card-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'card-indicator';
            this.container.appendChild(indicator);
        }
        const remaining = this.cards.length - this.currentIndex;
        indicator.textContent = remaining > 0 ? `${this.currentIndex + 1} / ${this.cards.length}` : '已完成';
    }

    showCompletion() {
        const stack = this.container.querySelector('.cards-stack');
        stack.innerHTML = `
            <div class="card" style="display: flex; align-items: center; justify-content: center; flex-direction: column;">
                <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
                <div style="font-size: 24px; color: #2c3e50; font-weight: 600;">今日行程已完成！</div>
            </div>
        `;
    }

    reset() {
        this.currentIndex = 0;
        this.renderCards();
    }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化用户选择器
    initUserSelector();
    
    // 渲染总览和导航
    renderOverview();
    renderNavigation();
    
    // 默认显示第一天
    showDay('day1');
    
    // 返回顶部按钮
    initBackToTop();
    
    // 如果已配置同步且启用自动同步，初始化自动同步
    if (typeof dataSync !== 'undefined' && dataSync.isConfigured() && dataSync.autoSyncEnabled) {
        dataSync.setAutoSync(true);
    }
    
    // 点击模态框外部关闭
    const modal = document.getElementById('sync-config-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeSyncConfig();
            }
        });
    }
});

// 初始化用户选择器
function initUserSelector() {
    updateUserSelector();
    
    document.querySelectorAll('.user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setCurrentUser(btn.dataset.user);
        });
    });
}

// 渲染总览
function renderOverview() {
    const header = document.querySelector('.header');
    if (header && tripData) {
        header.innerHTML = `<h1>${tripData.title}</h1>`;
    }
}

// 渲染导航
function renderNavigation() {
    const navContainer = document.querySelector('.nav-container');
    if (!navContainer || !tripData) return;
    
    let html = '<h2>行程总览</h2><ul class="nav-list">';
    tripData.overview.forEach((item, index) => {
        const dayId = `day${index + 1}`;
        html += `
            <li class="nav-item">
                <a href="#" class="nav-link" data-day="${dayId}">${item}</a>
            </li>
        `;
    });
    html += '</ul>';
    navContainer.innerHTML = html;
    
    // 添加导航点击事件
    navContainer.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const dayId = link.dataset.day;
            showDay(dayId);
            
            // 更新活动状态
            navContainer.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

// 显示指定日期的行程
function showDay(dayId) {
    currentDayId = dayId;
    const day = tripData.days.find(d => d.id === dayId);
    if (!day) return;
    
    // 更新日期标题
    const dayHeader = document.querySelector('.day-header');
    if (dayHeader) {
        dayHeader.innerHTML = `<h2>${day.title}</h2>`;
    }
    
    // 创建卡片滑动器
    const cardsContainer = document.getElementById('cards-container');
    if (cardsContainer) {
        // 确保有指示器
        let indicator = cardsContainer.querySelector('.card-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'card-indicator';
            cardsContainer.appendChild(indicator);
        }
        
        // 创建新的滑动器
        const slider = new CardSlider('cards-container', day.items, dayId);
        
        // 滚动到卡片区域
        cardsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

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

