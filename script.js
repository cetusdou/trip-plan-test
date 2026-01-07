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
        this.startY = 0;
        this.startTime = 0;
        this.threshold = 40; // 滑动阈值（40px，在手机上更容易触发）
        this.sortMode = false; // 排序模式
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
        
        // 根据模式渲染
        if (this.sortMode) {
            // 排序模式：所有卡片平铺显示
            stack.className = 'cards-stack sort-mode';
            for (let i = 0; i < this.cards.length; i++) {
                const card = this.createCard(this.cards[i], i);
                card.classList.add('sortable-card');
                stack.appendChild(card);
            }
        } else {
            // 正常模式：堆叠显示
            stack.className = 'cards-stack';
            // 只显示从 currentIndex 开始的卡片（已经滑过的卡片不显示）
            for (let i = this.cards.length - 1; i >= this.currentIndex; i--) {
                const card = this.createCard(this.cards[i], i);
                stack.appendChild(card);
            }
        }
        
        this.updateIndicator();
    }
    
    // 切换排序模式
    toggleSortMode() {
        this.sortMode = !this.sortMode;
        
        // 退出排序模式时，重置当前索引并重新加载顺序
        if (!this.sortMode) {
            this.currentIndex = 0;
            // 重新应用保存的顺序（确保使用最新的顺序）
            const day = tripData.days.find(d => d.id === this.dayId);
            if (day) {
                const customItems = getCustomItems(this.dayId);
                const allItems = [...day.items, ...customItems];
                const orderedItems = applyCardOrder(this.dayId, allItems);
                const filteredItems = applyFilter(orderedItems);
                // 更新cards数组为最新的顺序
                this.cards = filteredItems;
                console.log('退出排序模式，更新后的cards顺序:', this.cards.map((c, i) => `${i}:${c.category || c.id}`).join(', '));
            }
        }
        
        this.renderCards();
        // 重新绑定事件（重要：排序模式下需要重新绑定拖拽事件）
        this.attachCardEventsForAll();
        // 重新绑定滑动事件（退出排序模式后需要恢复滑动功能）
        this.attachEventListeners();
        
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
        console.log('绑定拖拽事件，卡片数量:', cards.length, '排序模式:', this.sortMode);
        cards.forEach((card, index) => {
            const cardIndex = parseInt(card.dataset.index);
            if (isNaN(cardIndex)) {
                console.warn('卡片索引无效:', card.dataset.index);
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
        
        // 获取留言和评分数据
        const comments = this.getComments(this.dayId, index);
        const ratings = this.getRatings(this.dayId, index);
        const images = this.getImages(this.dayId, index);
        const itemLikes = this.getItemLikes(this.dayId, index);
        
        const cardTag = cardData.tag || '其他';
        const isExpanded = this.getCardExpanded(this.dayId, index);
        let html = `
            <div class="card-header">
                <div class="card-header-main">
                    <div class="card-sort-buttons">
                        <button class="card-sort-btn card-sort-up" data-index="${index}" title="上移">▲</button>
                        <button class="card-sort-btn card-sort-down" data-index="${index}" title="下移">▼</button>
                    </div>
                    <div class="card-header-content">
                        <div class="card-category">${this.escapeHtml(cardData.category)}</div>
                        ${cardData.time ? `<div class="card-time">${this.escapeHtml(cardData.time)}</div>` : ''}
                        <div class="card-tag tag-${cardTag}">${this.getTagLabel(cardTag)}</div>
                    </div>
                    <div class="card-header-actions">
                        <button class="card-expand-btn" data-expanded="${isExpanded}" title="${isExpanded ? '收起' : '展开'}">
                            ${isExpanded ? '▼' : '▶'}
                        </button>
                        ${cardData.isCustom ? `
                            <button class="delete-item-btn" data-item-id="${cardData.id}" title="删除此项">🗑️</button>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="card-content ${isExpanded ? 'expanded' : 'collapsed'}">
        `;
        
        // 添加图片/地图区域
        html += `
            <div class="card-section image-section">
                <div class="image-upload-controls">
                    <button class="image-upload-btn" title="上传图片">
                        📷 上传图片
                        <input type="file" class="image-upload-input" accept="image/*" multiple style="display: none;" />
                    </button>
                </div>
                <div class="image-container">
                    ${images.length > 0 ? `
                        <div class="image-carousel">
                            <button class="carousel-btn carousel-prev" title="上一张">‹</button>
                            <div class="carousel-wrapper">
                                <div class="carousel-track" style="transform: translateX(0);">
                                    ${images.map((img, imgIndex) => `
                                        <div class="carousel-slide">
                                            <img src="${this.escapeHtml(img)}" alt="图片 ${imgIndex + 1}" class="card-image" />
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
                            <div class="image-placeholder-icon">🗺️</div>
                            <div class="image-placeholder-text">暂无图片</div>
                        </div>
                    `}
                </div>
            </div>
        `;
        
        if (cardData.plan) {
            const planLikes = itemLikes.plan || { userA: false, userB: false };
            const planLikeCount = (planLikes.userA ? 1 : 0) + (planLikes.userB ? 1 : 0);
            html += `
                <div class="card-section">
                    <div class="card-section-header">
                        <div class="card-section-title plan">计划</div>
                        <button class="like-btn ${planLikes[currentUser] ? 'liked' : ''}" data-section="plan" title="点赞">
                            <span class="like-icon">${planLikes[currentUser] ? '❤️' : '🤍'}</span>
                            <span class="like-count">${planLikeCount > 0 ? planLikeCount : ''}</span>
                        </button>
                    </div>
                    <div class="card-section-content">${cardData.plan}</div>
                </div>
            `;
        }
        
        if (cardData.note) {
            const noteLikes = itemLikes.note || { userA: false, userB: false };
            const noteLikeCount = (noteLikes.userA ? 1 : 0) + (noteLikes.userB ? 1 : 0);
            html += `
                <div class="card-section">
                    <div class="card-section-header">
                        <div class="card-section-title note">备注</div>
                        <button class="like-btn ${noteLikes[currentUser] ? 'liked' : ''}" data-section="note" title="点赞">
                            <span class="like-icon">${noteLikes[currentUser] ? '❤️' : '🤍'}</span>
                            <span class="like-count">${noteLikeCount > 0 ? noteLikeCount : ''}</span>
                        </button>
                    </div>
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
                    ${comments.map((comment, commentIndex) => {
                        const commentLikes = this.getCommentLikes(this.dayId, index, commentIndex);
                        const commentLikeCount = (commentLikes.userA ? 1 : 0) + (commentLikes.userB ? 1 : 0);
                        return `
                        <div class="comment-item ${comment.user === 'userA' ? 'user-a' : 'user-b'}">
                            <div class="comment-header">
                                <span class="comment-user">${comment.user === 'userA' ? '👤 用户A' : '👤 用户B'}</span>
                                <span class="comment-time">${this.formatTime(comment.timestamp)}</span>
                            </div>
                            <div class="comment-content">${this.escapeHtml(comment.message)}</div>
                            <button class="comment-like-btn ${commentLikes[currentUser] ? 'liked' : ''}" 
                                    data-comment-index="${commentIndex}" title="点赞">
                                <span class="like-icon">${commentLikes[currentUser] ? '❤️' : '🤍'}</span>
                                <span class="like-count">${commentLikeCount > 0 ? commentLikeCount : ''}</span>
                            </button>
                        </div>
                    `;
                    }).join('')}
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
                // 重新绑定事件
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
            });
        });
        
        // 图片上传事件
        const imageUploadBtn = card.querySelector('.image-upload-btn');
        const imageUploadInput = card.querySelector('.image-upload-input');
        
        if (imageUploadBtn && imageUploadInput) {
            imageUploadBtn.addEventListener('click', () => {
                imageUploadInput.click();
            });
            
            imageUploadInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    const readers = files.map(file => {
                        return new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (event) => resolve(event.target.result);
                            reader.readAsDataURL(file);
                        });
                    });
                    
                    Promise.all(readers).then(imageUrls => {
                        const currentImages = this.getImages(this.dayId, index);
                        this.setImages(this.dayId, index, [...currentImages, ...imageUrls]);
                        this.renderCards();
                        // 重新绑定事件
                        if (!this.sortMode) {
                            this.attachEventListeners();
                        }
                        this.attachCardEventsForAll();
                    });
                }
                // 清空input，允许重复选择相同文件
                e.target.value = '';
            });
        }
        
        // 展开/收起功能
        const expandBtn = card.querySelector('.card-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const isExpanded = expandBtn.dataset.expanded === 'true';
                this.setCardExpanded(this.dayId, index, !isExpanded);
                this.renderCards();
                // 重新绑定事件（重要：重新渲染后需要重新绑定滑动事件）
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
            });
            
            // 也处理触摸事件，确保移动设备上也能正常工作
            expandBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const isExpanded = expandBtn.dataset.expanded === 'true';
                this.setCardExpanded(this.dayId, index, !isExpanded);
                this.renderCards();
                // 重新绑定事件（重要：重新渲染后需要重新绑定滑动事件）
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
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
            const images = this.getImages(this.dayId, index);
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
            
            // 触摸滑动支持
            let startX = 0;
            let isDragging = false;
            track.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                isDragging = true;
            });
            
            track.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
            });
            
            track.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                const endX = e.changedTouches[0].clientX;
                const diff = startX - endX;
                
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        currentIndex = (currentIndex + 1) % images.length;
                    } else {
                        currentIndex = (currentIndex - 1 + images.length) % images.length;
                    }
                    updateCarousel();
                }
            });
            
            // 删除图片
            removeBtns.forEach((btn, btnIndex) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const images = this.getImages(this.dayId, index);
                    images.splice(btnIndex, 1);
                    this.setImages(this.dayId, index, images);
                    this.renderCards();
                    // 重新绑定事件
                    if (!this.sortMode) {
                        this.attachEventListeners();
                    }
                    this.attachCardEventsForAll();
                });
            });
        }
        
        // 删除自定义行程项
        const deleteBtn = card.querySelector('.delete-item-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这个行程项吗？')) {
                    const itemId = deleteBtn.dataset.itemId;
                    deleteCustomItem(this.dayId, itemId);
                }
            });
        }
        
        // 行程项like事件
        card.querySelectorAll('.like-btn[data-section]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const section = btn.dataset.section;
                // 保存当前滚动位置
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                this.toggleItemLike(this.dayId, index, section);
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                // 恢复滚动位置
                window.scrollTo({ top: scrollTop, behavior: 'instant' });
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const section = btn.dataset.section;
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                this.toggleItemLike(this.dayId, index, section);
                this.renderCards();
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                window.scrollTo({ top: scrollTop, behavior: 'instant' });
            });
        });
        
        // 留言like事件
        card.querySelectorAll('.comment-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const commentIndex = parseInt(btn.dataset.commentIndex);
                // 保存当前滚动位置
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                this.toggleCommentLike(this.dayId, index, commentIndex);
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                // 恢复滚动位置
                window.scrollTo({ top: scrollTop, behavior: 'instant' });
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const commentIndex = parseInt(btn.dataset.commentIndex);
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                this.toggleCommentLike(this.dayId, index, commentIndex);
                this.renderCards();
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                window.scrollTo({ top: scrollTop, behavior: 'instant' });
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
                // 重新绑定事件
                if (!this.sortMode) {
                    this.attachEventListeners();
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
        // 自动同步到Gist
        autoSyncToGist();
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
        // 自动同步到Gist
        autoSyncToGist();
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
    getImages(dayId, itemIndex) {
        const key = `trip_images_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }
    
    // 设置图片（多张）
    setImages(dayId, itemIndex, imageUrls) {
        const key = `trip_images_${dayId}_${itemIndex}`;
        if (imageUrls && imageUrls.length > 0) {
            localStorage.setItem(key, JSON.stringify(imageUrls));
        } else {
            localStorage.removeItem(key);
        }
        // 自动同步到Gist
        autoSyncToGist();
    }
    
    // 获取行程项点赞
    getItemLikes(dayId, itemIndex) {
        const key = `trip_item_likes_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : {};
    }
    
    // 切换行程项点赞
    toggleItemLike(dayId, itemIndex, section) {
        const key = `trip_item_likes_${dayId}_${itemIndex}`;
        const likes = this.getItemLikes(dayId, itemIndex);
        if (!likes[section]) {
            likes[section] = { userA: false, userB: false };
        }
        likes[section][currentUser] = !likes[section][currentUser];
        localStorage.setItem(key, JSON.stringify(likes));
        // 自动同步到Gist
        autoSyncToGist();
    }
    
    // 获取留言点赞
    getCommentLikes(dayId, itemIndex, commentIndex) {
        const key = `trip_comment_likes_${dayId}_${itemIndex}_${commentIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : { userA: false, userB: false };
    }
    
    // 切换留言点赞
    toggleCommentLike(dayId, itemIndex, commentIndex) {
        const key = `trip_comment_likes_${dayId}_${itemIndex}_${commentIndex}`;
        const likes = this.getCommentLikes(dayId, itemIndex, commentIndex);
        likes[currentUser] = !likes[currentUser];
        localStorage.setItem(key, JSON.stringify(likes));
        // 自动同步到Gist
        autoSyncToGist();
    }
    
    // 获取卡片展开状态
    getCardExpanded(dayId, itemIndex) {
        const key = `trip_card_expanded_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data === 'true';
    }
    
    // 设置卡片展开状态
    setCardExpanded(dayId, itemIndex, expanded) {
        const key = `trip_card_expanded_${dayId}_${itemIndex}`;
        localStorage.setItem(key, expanded.toString());
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
    
    // 拖拽开始（排序模式）
    handleDragStart(e, card, index) {
        console.log('handleDragStart 被调用，排序模式:', this.sortMode, '索引:', index);
        if (!this.sortMode) {
            console.warn('不在排序模式，无法拖拽');
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.isDraggingCard = true;
        this.dragCardIndex = parseInt(index);
        this.dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
        
        console.log('开始拖拽，卡片索引:', this.dragCardIndex, '起始Y:', this.dragStartY);
        
        card.classList.add('dragging');
        card.style.zIndex = '1000';
        card.style.cursor = 'grabbing';
        
        // 使用箭头函数保持this上下文
        this.dragMoveHandler = (evt) => {
            evt.preventDefault();
            console.log('拖拽移动中，Y:', evt.touches ? evt.touches[0].clientY : evt.clientY);
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
            console.warn('拖拽结束但状态异常');
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
            
            console.log('拖拽结束，原索引:', this.dragCardIndex, '目标索引:', targetIndex);
            
            if (targetIndex !== this.dragCardIndex) {
                // 直接使用数组索引操作（dragCardIndex和targetIndex就是数组索引）
                console.log('重新排序，从索引', this.dragCardIndex, '移动到', targetIndex);
                
                // 先更新 this.cards 数组
                const [movedItem] = this.cards.splice(this.dragCardIndex, 1);
                this.cards.splice(targetIndex, 0, movedItem);
                
                // 保存新顺序到 localStorage
                this.reorderCards(this.dragCardIndex, targetIndex);
                
                console.log('排序完成，新顺序:', this.cards.map((c, i) => `${i}:${c.category || c.id}`).join(', '));
            } else {
                console.log('位置未改变，无需重新排序');
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
        if (index <= 0) {
            console.log('已经在最上面，无法上移');
            return; // 已经在最上面
        }
        
        console.log('上移卡片，索引:', index);
        
        // 交换位置
        const [movedItem] = this.cards.splice(index, 1);
        this.cards.splice(index - 1, 0, movedItem);
        
        console.log('移动完成，新顺序:', this.cards.map((c, i) => `${i}:${c.category || c.id}`).join(', '));
        
        // 保存顺序
        this.saveCardOrder();
        
        // 重新渲染（这会重新创建所有卡片，所以事件会重新绑定）
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 下移卡片
    moveCardDown(index) {
        if (index >= this.cards.length - 1) {
            console.log('已经在最下面，无法下移');
            return; // 已经在最下面
        }
        
        console.log('下移卡片，索引:', index);
        
        // 交换位置
        const [movedItem] = this.cards.splice(index, 1);
        this.cards.splice(index + 1, 0, movedItem);
        
        console.log('移动完成，新顺序:', this.cards.map((c, i) => `${i}:${c.category || c.id}`).join(', '));
        
        // 保存顺序
        this.saveCardOrder();
        
        // 重新渲染（这会重新创建所有卡片，所以事件会重新绑定）
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 保存卡片顺序
    saveCardOrder() {
        console.log('保存卡片顺序，当前cards:', this.cards.map((c, i) => `${i}:${c.category || c.id}`).join(', '));
        
        // 构建顺序信息 - 使用更可靠的唯一标识
        const orderInfo = this.cards.map((item, idx) => {
            // 对于自定义项，使用id；对于原始项，使用category+time组合作为唯一标识
            let uniqueId;
            if (item.isCustom && item.id) {
                uniqueId = item.id;
            } else {
                // 原始项：使用category + time + plan的前几个字符作为唯一标识
                const time = item.time || '';
                const plan = (item.plan || '').substring(0, 20);
                uniqueId = `${item.category || 'item'}_${time}_${plan}`.replace(/\s+/g, '_');
            }
            
            return {
                index: idx,
                id: uniqueId,
                category: item.category,
                isCustom: item.isCustom || false
            };
        });
        
        console.log('保存的顺序信息:', orderInfo);
        
        // 保存顺序
        const orderKey = `trip_card_order_${this.dayId}`;
        localStorage.setItem(orderKey, JSON.stringify(orderInfo));
        
        // 保存自定义项的新顺序（保持完整数据）
        const newCustomItems = this.cards.filter(item => item.isCustom);
        if (newCustomItems.length > 0) {
            localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(newCustomItems));
        }
        
        // 自动同步到Gist
        autoSyncToGist();
    }
    
    // 重新排序卡片（保留用于兼容）
    reorderCards(fromIndex, toIndex) {
        this.saveCardOrder();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    attachEventListeners() {
        // 排序模式下不绑定滑动事件，避免冲突
        if (this.sortMode) return;
        
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
        // 排序模式下不处理滑动
        if (this.sortMode) return;
        
        // 如果正在拖拽排序，不处理滑动
        if (this.isDraggingCard) return;
        
        // 如果点击的是交互元素（按钮、输入框等），不处理滑动
        const target = e.target;
        if (target && (
            target.tagName === 'BUTTON' ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'A' ||
            target.closest('button') ||
            target.closest('input') ||
            target.closest('textarea') ||
            target.closest('a') ||
            target.closest('.card-expand-btn') ||
            target.closest('.card-sort-btn') ||
            target.closest('.comment-submit') ||
            target.closest('.image-upload-btn') ||
            target.closest('.star') ||
            target.closest('.comment-like-btn') ||
            target.closest('.item-like-btn')
        )) {
            return;
        }
        
        if (card !== this.getTopCard()) return;
        
        this.isDragging = true;
        this.startX = this.getEventX(e);
        this.startY = e.touches ? e.touches[0].clientY : e.clientY;
        this.startTime = Date.now();
        card.classList.add('swiping');
        // 不阻止默认行为，让点击事件能正常工作
    }

    handleMove(e, card) {
        if (!this.isDragging || card !== this.getTopCard()) return;
        
        this.currentX = this.getEventX(e);
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaX = this.currentX - this.startX;
        const deltaY = Math.abs(currentY - this.startY);
        
        // 如果垂直移动距离明显大于水平移动距离（超过2倍），可能是滚动操作，不处理滑动
        if (deltaY > Math.abs(deltaX) * 2 && deltaY > 30) {
            this.isDragging = false;
            card.classList.remove('swiping');
            card.style.transform = '';
            return;
        }
        
        // 只有水平移动距离大于5px时才开始滑动动画
        if (Math.abs(deltaX) > 5) {
            card.style.transform = `translateX(${deltaX}px) rotate(${deltaX * 0.1}deg)`;
            e.preventDefault();
            console.log('滑动中，deltaX:', deltaX, 'deltaY:', deltaY);
        }
    }

    handleEnd(e, card) {
        if (!this.isDragging || card !== this.getTopCard()) {
            this.isDragging = false;
            return;
        }
        
        const deltaX = this.currentX - this.startX;
        const deltaTime = Date.now() - this.startTime;
        const absDeltaX = Math.abs(deltaX);
        
        this.isDragging = false;
        card.classList.remove('swiping');
        card.style.transform = '';
        
        // 如果移动距离很小（小于阈值），不触发滑动
        if (absDeltaX < this.threshold) {
            return;
        }
        
        // 如果时间很短（小于100ms）且移动距离不够大，可能是误触，不触发滑动
        if (deltaTime < 100 && absDeltaX < this.threshold * 1.5) {
            return;
        }
        
        // 明显的滑动才触发翻页
        console.log('滑动结束，deltaX:', deltaX, 'absDeltaX:', absDeltaX, 'threshold:', this.threshold, 'deltaTime:', deltaTime);
        if (absDeltaX > this.threshold) {
            console.log('触发翻页，方向:', deltaX > 0 ? '右' : '左');
            if (deltaX > 0) {
                this.swipeRight(card);
            } else {
                this.swipeLeft(card);
            }
        } else {
            console.log('滑动距离不足，未触发翻页');
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
        // 排序模式下不处理滑动
        if (this.sortMode) return;
        
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
        // 排序模式下不处理滑动
        if (this.sortMode) return;
        
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
        // 排序模式下不显示指示器
        if (this.sortMode) {
            const indicator = this.container.querySelector('.card-indicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
            return;
        }
        
        // 查找指示器（在容器内部，但不在stack内部）
        let indicator = this.container.querySelector('.card-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'card-indicator';
            this.container.appendChild(indicator);
        }
        
        indicator.style.display = 'block';
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

// 从配置文件或URL参数中读取配置
function loadConfigFromURL() {
    // 首先尝试从config.js加载配置
    if (typeof tripConfig !== 'undefined') {
        if (tripConfig.githubToken && typeof dataSync !== 'undefined') {
            dataSync.setToken(tripConfig.githubToken);
            updateSyncStatus('Token已从配置文件导入', 'success');
        }
        if (tripConfig.gistId && typeof dataSync !== 'undefined') {
            dataSync.setGistId(tripConfig.gistId);
            updateSyncStatus('Gist ID已从配置文件导入', 'success');
        }
        if (tripConfig.autoSync && typeof dataSync !== 'undefined') {
            dataSync.setAutoSync(tripConfig.autoSync);
            if (tripConfig.autoSync) {
                updateSyncStatus('自动同步已启用', 'success');
            }
        }
    }
    
    // 然后从URL参数读取（URL参数优先级更高）
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const gistId = urlParams.get('gist_id') || urlParams.get('gistId');
    const autoSync = urlParams.get('auto_sync') === 'true' || urlParams.get('autoSync') === 'true';
    
    if (token && typeof dataSync !== 'undefined') {
        dataSync.setToken(token);
        updateSyncStatus('Token已从URL导入', 'success');
    }
    
    if (gistId && typeof dataSync !== 'undefined') {
        dataSync.setGistId(gistId);
        updateSyncStatus('Gist ID已从URL导入', 'success');
    }
    
    if (autoSync && typeof dataSync !== 'undefined') {
        dataSync.setAutoSync(true);
        updateSyncStatus('自动同步已启用', 'success');
    }
    
    // 如果从URL导入了配置，清除URL参数（保护隐私）
    if (token || gistId || autoSync) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    // 首先从URL加载配置
    loadConfigFromURL();
    
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
        dayHeader.innerHTML = `
            <h2>${day.title}</h2>
            <div class="day-header-actions">
                <button class="add-item-btn" onclick="showAddItemModal('${dayId}')" title="新增行程项">
                    ➕ 新增行程项
                </button>
                <button class="filter-btn" onclick="toggleFilterPanel()" title="筛选">
                    🔍 筛选
                </button>
                <button class="sort-mode-btn" onclick="toggleSortMode()" title="排序">
                    📋 排序
                </button>
            </div>
        `;
    }
    
    // 获取自定义添加的行程项
    const customItems = getCustomItems(dayId);
    const allItems = [...day.items, ...customItems];
    
    // 应用保存的顺序
    const orderedItems = applyCardOrder(dayId, allItems);
    
    // 应用筛选
    const filteredItems = applyFilter(orderedItems);
    
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
        const slider = new CardSlider('cards-container', filteredItems, dayId);
        // 只有在当前日期时才保存引用，避免跨日期状态混乱
        if (dayId === currentDayId) {
            currentSlider = slider; // 保存引用
        }
        
        // 滚动到卡片区域
        cardsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 应用卡片顺序
function applyCardOrder(dayId, items) {
    const orderKey = `trip_card_order_${dayId}`;
    const orderData = localStorage.getItem(orderKey);
    if (!orderData) {
        console.log('没有保存的顺序，使用原始顺序');
        return items;
    }
    
    try {
        const order = JSON.parse(orderData);
        console.log('应用保存的顺序，order:', order);
        console.log('原始items:', items.map((i, idx) => `${idx}:${i.category || i.id}`).join(', '));
        
        const orderedItems = [];
        // 创建映射：对于自定义项使用id，对于原始项使用category+time+plan组合
        const itemMap = new Map();
        items.forEach(item => {
            let key;
            if (item.isCustom && item.id) {
                key = item.id;
            } else {
                const time = item.time || '';
                const plan = (item.plan || '').substring(0, 20);
                key = `${item.category || 'item'}_${time}_${plan}`.replace(/\s+/g, '_');
            }
            // 如果key已存在，添加索引后缀确保唯一性
            if (itemMap.has(key)) {
                let counter = 1;
                while (itemMap.has(`${key}_${counter}`)) {
                    counter++;
                }
                key = `${key}_${counter}`;
            }
            itemMap.set(key, item);
        });
        
        console.log('itemMap keys:', Array.from(itemMap.keys()));
        
        // 按照保存的顺序排列
        order.forEach(orderItem => {
            const item = itemMap.get(orderItem.id);
            if (item) {
                orderedItems.push(item);
                itemMap.delete(orderItem.id);
            } else {
                console.warn('未找到匹配的项，id:', orderItem.id);
            }
        });
        
        // 添加未排序的项（新添加的项）
        itemMap.forEach(item => {
            console.log('添加未排序的项:', item.category || item.id);
            orderedItems.push(item);
        });
        
        console.log('应用顺序后的items:', orderedItems.map((i, idx) => `${idx}:${i.category || i.id}`).join(', '));
        
        return orderedItems;
    } catch (e) {
        console.error('应用顺序时出错:', e);
        return items;
    }
}

// 应用筛选
let currentFilter = null;
function applyFilter(items) {
    if (!currentFilter) return items;
    return items.filter(item => {
        const tag = item.tag || '其他';
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

// 设置筛选
function setFilter(tag) {
    currentFilter = tag;
    if (currentDayId) {
        showDay(currentDayId);
    }
    const panel = document.getElementById('filter-panel');
    if (panel) {
        panel.style.display = 'none';
    }
}

// 切换排序模式
let currentSlider = null;
function toggleSortMode() {
    const cardsContainer = document.getElementById('cards-container');
    if (!cardsContainer) return;
    
    // 如果currentSlider不存在或日期不匹配，重新创建
    if (!currentSlider || currentSlider.dayId !== currentDayId) {
        const day = tripData.days.find(d => d.id === currentDayId);
        if (!day) return;
        const customItems = getCustomItems(currentDayId);
        const allItems = [...day.items, ...customItems];
        const orderedItems = applyCardOrder(currentDayId, allItems);
        const filteredItems = applyFilter(orderedItems);
        currentSlider = new CardSlider('cards-container', filteredItems, currentDayId);
    }
    
    currentSlider.toggleSortMode();
}

// 获取自定义添加的行程项
function getCustomItems(dayId) {
    const key = `trip_custom_items_${dayId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

// 添加自定义行程项
function addCustomItem(dayId, itemData) {
    const key = `trip_custom_items_${dayId}`;
    const items = getCustomItems(dayId);
    const newItem = {
        ...itemData,
        id: `custom_${Date.now()}`,
        isCustom: true,
        tag: itemData.tag || '其他'
    };
    items.push(newItem);
    localStorage.setItem(key, JSON.stringify(items));
    
    // 自动同步到Gist
    autoSyncToGist();
    
    showDay(dayId);
}

// 删除自定义行程项
function deleteCustomItem(dayId, itemId) {
    const key = `trip_custom_items_${dayId}`;
    const items = getCustomItems(dayId);
    const filtered = items.filter(item => item.id !== itemId);
    localStorage.setItem(key, JSON.stringify(filtered));
    
    // 自动同步到Gist
    autoSyncToGist();
    
    showDay(dayId);
}

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
    const modal = document.getElementById('add-item-modal');
    if (!modal) return;
    
    const dayId = modal.dataset.dayId;
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
        rating: '',
        tag: document.getElementById('new-item-tag').value || '其他'
    };
    
    addCustomItem(dayId, itemData);
    closeAddItemModal();
}

// 自动同步到Gist（如果已配置）
let syncTimeout = null;
function autoSyncToGist() {
    // 如果未配置Gist，不执行
    if (typeof dataSync === 'undefined' || !dataSync.isConfigured()) {
        return;
    }
    
    // 防抖，避免频繁同步
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    
    syncTimeout = setTimeout(() => {
        dataSync.upload().then(result => {
            if (result.success) {
                console.log('数据已自动同步到GitHub Gist');
                updateSyncStatus('已自动同步', 'success');
            } else {
                console.warn('自动同步失败:', result.message);
            }
        }).catch(error => {
            console.warn('自动同步错误:', error);
        });
    }, 2000); // 2秒后同步
}

// 获取所有编辑的数据
function getAllEditedData() {
    const data = {
        customItems: {},
        cardOrders: {},
        images: {},
        comments: {},
        ratings: {},
        likes: {},
        timestamp: new Date().toISOString()
    };
    
    // 收集所有localStorage中的数据
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('trip_')) {
            if (key.includes('_custom_items_')) {
                const dayId = key.replace('trip_custom_items_', '');
                data.customItems[dayId] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_card_order_')) {
                const dayId = key.replace('trip_card_order_', '');
                data.cardOrders[dayId] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_images_')) {
                data.images[key] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_comments_')) {
                data.comments[key] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_ratings_')) {
                data.ratings[key] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_likes_')) {
                data.likes[key] = JSON.parse(localStorage.getItem(key));
            }
        }
    }
    
    return data;
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

// 切换同步面板展开/折叠
function toggleSyncPanel() {
    const syncControls = document.querySelector('.sync-controls');
    if (syncControls) {
        syncControls.classList.toggle('expanded');
    }
}

