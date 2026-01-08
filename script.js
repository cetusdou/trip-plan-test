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

// 卡片显示逻辑（滚动模式）
class CardSlider {
    constructor(containerId, cards, dayId) {
        this.container = document.getElementById(containerId);
        this.cards = cards;
        this.dayId = dayId;
        this.sortMode = false; // 排序模式：false=普通查看模式，true=排序模式（显示上下箭头）
        this.init();
    }

    init() {
        this.renderCards();
        this.attachCardEventsForAll();
    }

    renderCards() {
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
    }
    
    // 切换排序模式
    toggleSortMode() {
        this.sortMode = !this.sortMode;
        
        // 重新应用保存的顺序（确保使用最新的顺序）
        const day = tripData.days.find(d => d.id === this.dayId);
        if (day) {
            const customItems = getCustomItems(this.dayId);
            const allItems = [...day.items, ...customItems];
            const orderedItems = applyCardOrder(this.dayId, allItems);
            const filteredItems = applyFilter(orderedItems);
            // 更新cards数组为最新的顺序
            this.cards = filteredItems;
        }
        
        this.renderCards();
        // 重新绑定事件
        this.attachCardEventsForAll();
        
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
        
        // 获取留言数据
        const comments = this.getComments(this.dayId, index);
        const images = this.getImages(this.dayId, index);
        const itemLikes = this.getItemLikes(this.dayId, index);
        
        // 获取标签：优先使用tag字段，如果没有则从localStorage读取，最后才使用category作为标签
        let cardTag = cardData.tag;
        if (!cardTag && !cardData.isCustom) {
            // 对于原始项，检查是否有保存的tag
            const tagKey = `trip_tag_${this.dayId}_${index}`;
            const savedTag = localStorage.getItem(tagKey);
            if (savedTag) {
                cardTag = savedTag;
            } else {
                // 如果没有保存的tag，使用category作为标签（向后兼容）
                cardTag = cardData.category || '其他';
            }
        } else if (!cardTag) {
            // 自定义项如果没有tag，使用category作为标签
            cardTag = cardData.category || '其他';
        }
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
                        <div class="card-tag tag-${cardTag}" data-card-index="${index}" data-current-tag="${cardTag}">${this.getTagLabel(cardTag)}</div>
                    </div>
                    <div class="card-header-actions">
                        <button class="card-save-btn" data-card-index="${index}" title="保存并同步">💾</button>
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
        
        // 读取计划项（优先从localStorage读取修改后的数据）
        let planData = cardData.plan;
        if (!cardData.isCustom) {
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
        // 如果是数组，直接使用；如果是字符串，转换为单元素数组（向后兼容）
        const planItems = planData 
            ? (Array.isArray(planData) 
                ? planData.filter(item => item && item.trim().length > 0) // 过滤空项
                : [planData].filter(item => item && item.trim().length > 0))
            : [];
        
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title plan">计划</div>
                </div>
                <ul class="plan-list">
                    ${planItems.length > 0 ? planItems.map((planItem, planIndex) => {
                        const planItemLikes = this.getPlanItemLikes(this.dayId, index, planIndex);
                        const planItemLikeCount = (planItemLikes.userA ? 1 : 0) + (planItemLikes.userB ? 1 : 0);
                    return `
                        <li class="plan-item">
                            <span class="plan-item-text">${this.escapeHtmlKeepBr(planItem)}</span>
                            <div class="plan-item-actions">
                                <button class="plan-item-like-btn ${planItemLikes[currentUser] ? 'liked' : ''}" 
                                        data-plan-index="${planIndex}" 
                                        title="点赞">
                                    <span class="like-icon">${planItemLikes[currentUser] ? '❤️' : '🤍'}</span>
                                    <span class="like-count">${planItemLikeCount > 0 ? planItemLikeCount : ''}</span>
                                </button>
                                <button class="plan-item-delete-btn" 
                                        data-card-index="${index}"
                                        data-plan-index="${planIndex}" 
                                        title="删除此项">🗑️</button>
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
        
        if (cardData.note) {
            html += `
                <div class="card-section">
                    <div class="card-section-header">
                        <div class="card-section-title note">备注</div>
                    </div>
                    <div class="card-section-content note-content">${cardData.note}</div>
                </div>
            `;
        }
        
        // 添加留言区域（移到备注下面）
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
        // 图片上传事件
        const imageUploadBtn = card.querySelector('.image-upload-btn');
        const imageUploadInput = card.querySelector('.image-upload-input');
        
        if (imageUploadBtn && imageUploadInput) {
            // 防止重复触发的标志
            let isProcessing = false;
            let touchStartTime = 0;
            let touchStartY = 0;
            let touchStartX = 0;
            
            // 统一的触发函数
            const triggerFileInput = (e) => {
                // 如果正在处理，忽略
                if (isProcessing) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                
                // 检查是否为有效的点击（不是滑动）
                if (e.type === 'touchend') {
                    const touch = e.changedTouches[0];
                    const touchEndY = touch.clientY;
                    const touchEndX = touch.clientX;
                    const deltaY = Math.abs(touchEndY - touchStartY);
                    const deltaX = Math.abs(touchEndX - touchStartX);
                    const touchDuration = Date.now() - touchStartTime;
                    
                    // 如果是滑动（移动距离超过10px）或长按（超过300ms），忽略
                    if (deltaY > 10 || deltaX > 10 || touchDuration > 300 || touchDuration < 0) {
                        return;
                    }
                }
                
                isProcessing = true;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 立即触发文件选择器
                imageUploadInput.click();
                
                // 重置标志（延迟一点，确保文件选择器已打开）
                setTimeout(() => {
                    isProcessing = false;
                }, 300);
            };
            
            // 触摸开始事件（移动端）
            imageUploadBtn.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchStartTime = Date.now();
                touchStartY = touch.clientY;
                touchStartX = touch.clientX;
            }, { passive: true });
            
            // 触摸结束事件（移动端）- 优先处理
            imageUploadBtn.addEventListener('touchend', triggerFileInput, { passive: false });
            
            // 点击事件（桌面端）- 延迟处理，避免与触摸事件冲突
            imageUploadBtn.addEventListener('click', (e) => {
                // 如果是触摸设备，忽略 click 事件（因为 touchend 已经处理了）
                // 通过检查是否有最近的触摸事件来判断
                const timeSinceTouch = Date.now() - touchStartTime;
                if (timeSinceTouch < 500) {
                    // 最近有触摸事件，忽略 click
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                // 桌面端，正常处理
                triggerFileInput(e);
            });
            
            imageUploadInput.addEventListener('change', (e) => {
                // 延迟处理，确保在移动设备上文件选择完成
                setTimeout(() => {
                    const files = Array.from(e.target.files || []);
                    
                    if (files.length === 0) {
                        // 如果没有文件，可能是用户取消了选择
                        e.target.value = '';
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
                        return;
                    }
                    
                    // 显示上传进度提示
                    const uploadBtn = card.querySelector('.image-upload-btn');
                    const originalText = uploadBtn ? uploadBtn.textContent : '';
                    if (uploadBtn) {
                        uploadBtn.textContent = '📤 上传中...';
                        uploadBtn.disabled = true;
                    }
                    
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
                    
                    Promise.all(readers).then(imageUrls => {
                        const currentImages = this.getImages(this.dayId, index);
                        this.setImages(this.dayId, index, [...currentImages, ...imageUrls]);
                        this.renderCards();
                        // 重新绑定事件
                        if (!this.sortMode) {
                            this.attachEventListeners();
                        }
                        this.attachCardEventsForAll();
                        // 自动同步
                        autoSyncToGist();
                        
                        // 恢复按钮状态
                        if (uploadBtn) {
                            uploadBtn.textContent = originalText;
                            uploadBtn.disabled = false;
                        }
                    }).catch(error => {
                        alert(`上传图片失败: ${error.message}`);
                        e.target.value = '';
                        
                        // 恢复按钮状态
                        if (uploadBtn) {
                            uploadBtn.textContent = originalText;
                            uploadBtn.disabled = false;
                        }
                    });
                }, 100); // 延迟100ms，确保文件选择完成
            });
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
                const confirmAdd = () => {
                    const newItem = planInput.value.trim();
                    if (newItem) {
                        this.addPlanItem(index, newItem);
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
        
        // 计划项删除事件
        card.querySelectorAll('.plan-item-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const cardIndex = parseInt(btn.dataset.cardIndex);
                if (confirm('确定要删除这个计划项吗？')) {
                    this.deletePlanItem(cardIndex, planIndex);
                }
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const cardIndex = parseInt(btn.dataset.cardIndex);
                if (confirm('确定要删除这个计划项吗？')) {
                    this.deletePlanItem(cardIndex, planIndex);
                }
            });
        });
        
        // 保存按钮事件
        const saveBtn = card.querySelector('.card-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.saveCard(index);
            });
            
            // 也处理触摸事件
            saveBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.saveCard(index);
            });
        }
        
        // 计划项like事件
        card.querySelectorAll('.plan-item-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                // 保存当前滚动位置和卡片滚动位置
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.togglePlanItemLike(this.dayId, index, planIndex);
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                // 使用requestAnimationFrame确保DOM更新完成后再恢复滚动位置
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    // 恢复卡片内部滚动位置
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.togglePlanItemLike(this.dayId, index, planIndex);
                this.renderCards();
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
        });
        
        // 留言like事件
        card.querySelectorAll('.comment-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const commentIndex = parseInt(btn.dataset.commentIndex);
                // 保存当前滚动位置和卡片滚动位置
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.toggleCommentLike(this.dayId, index, commentIndex);
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                // 使用requestAnimationFrame确保DOM更新完成后再恢复滚动位置
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    // 恢复卡片内部滚动位置
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const commentIndex = parseInt(btn.dataset.commentIndex);
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.toggleCommentLike(this.dayId, index, commentIndex);
                this.renderCards();
                if (!this.sortMode) {
                    this.attachEventListeners();
                }
                this.attachCardEventsForAll();
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
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
    
    // 获取计划项点赞
    getPlanItemLikes(dayId, itemIndex, planIndex) {
        const key = `trip_plan_item_likes_${dayId}_${itemIndex}_${planIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : { userA: false, userB: false };
    }
    
    // 切换计划项点赞
    togglePlanItemLike(dayId, itemIndex, planIndex) {
        const key = `trip_plan_item_likes_${dayId}_${itemIndex}_${planIndex}`;
        const likes = this.getPlanItemLikes(dayId, itemIndex, planIndex);
        likes[currentUser] = !likes[currentUser];
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
    
    // 编辑标签
    editTag(cardIndex) {
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
        
        // 保存到localStorage（如果是自定义项）
        if (card.isCustom) {
            const customItems = JSON.parse(localStorage.getItem(`trip_custom_items_${this.dayId}`) || '[]');
            const itemIndex = customItems.findIndex(item => item.id === card.id);
            if (itemIndex !== -1) {
                customItems[itemIndex].tag = newTag;
                localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(customItems));
            }
        } else {
            // 对于原始项，保存tag到单独的存储
            const tagKey = `trip_tag_${this.dayId}_${cardIndex}`;
            localStorage.setItem(tagKey, newTag);
        }
        
        // 重新渲染
        this.renderCards();
        if (!this.sortMode) {
            this.attachEventListeners();
        }
        this.attachCardEventsForAll();
        
        // 自动同步
        autoSyncToGist();
    }
    
    // 添加计划项
    addPlanItem(cardIndex, newItem) {
        const card = this.cards[cardIndex];
        if (!card || !newItem || !newItem.trim()) return;
        
        // 更新plan数组
        if (!card.plan) {
            card.plan = [];
        }
        const planItems = Array.isArray(card.plan) ? card.plan : [card.plan];
        planItems.push(newItem.trim());
        card.plan = planItems;
        
        // 保存到localStorage（如果是自定义项）
        if (card.isCustom) {
            const customItems = JSON.parse(localStorage.getItem(`trip_custom_items_${this.dayId}`) || '[]');
            const itemIndex = customItems.findIndex(item => item.id === card.id);
            if (itemIndex !== -1) {
                customItems[itemIndex].plan = planItems;
                localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(customItems));
            }
        } else {
            // 对于原始项，保存到单独的存储
            const key = `trip_plan_${this.dayId}_${cardIndex}`;
            localStorage.setItem(key, JSON.stringify(planItems));
        }
        
        // 重新渲染
        this.renderCards();
        if (!this.sortMode) {
            this.attachEventListeners();
        }
        this.attachCardEventsForAll();
        
        // 自动同步
        autoSyncToGist();
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
    
    // 转义HTML但保留<br>标签
    escapeHtmlKeepBr(text) {
        if (!text) return '';
        // 先转义所有HTML
        const div = document.createElement('div');
        div.textContent = text;
        let escaped = div.innerHTML;
        // 将转义后的<br>还原为实际的<br>标签
        escaped = escaped.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
        return escaped;
    }

    // 滑动相关代码已移至 card-slider-swipe.js（备用）
}

// 从配置文件或URL参数中读取配置
function loadConfigFromURL() {
    // 不再从config.js导入，只使用本地缓存的token
    // Token和Gist ID已经缓存在localStorage中，DataSync构造函数会自动读取
    
    // 从URL参数读取（URL参数优先级更高，用于首次配置）
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
    
    // 如果已配置同步，页面加载时自动下载数据（合并策略）
    const syncType = localStorage.getItem('trip_sync_type') || 'gist';
    
    if (syncType === 'firebase' && typeof dataSyncFirebase !== 'undefined') {
        // 等待Firebase加载完成
        const initFirebase = async () => {
            // 如果Firebase已加载，使用默认配置初始化
            if (window.firebaseConfig && window.firebaseDatabase) {
                const defaultConfig = {
                    ...window.firebaseConfig,
                    databasePath: 'trip_plan_data'
                };
                const result = await dataSyncFirebase.initialize(defaultConfig);
                if (result.success) {
                    // 先尝试从Firebase下载数据（静默，不显示错误）
                    dataSyncFirebase.download().then(result => {
                        if (result.success) {
                            // 下载成功后，重新显示当前日期以刷新数据
                            if (currentDayId) {
                                showDay(currentDayId);
                            }
                        }
                    }).catch(() => {
                        // 静默处理错误，不影响页面正常使用
                    });
                    
                    // 如果启用自动同步，初始化实时同步
                    if (dataSyncFirebase.autoSyncEnabled) {
                        dataSyncFirebase.setAutoSync(true);
                    }
                }
            } else {
                // 尝试从localStorage加载配置
                dataSyncFirebase.loadConfig().then(result => {
                    if (result.success && dataSyncFirebase.isConfigured()) {
                        // 先尝试从Firebase下载数据（静默，不显示错误）
                        dataSyncFirebase.download().then(result => {
                            if (result.success) {
                                // 下载成功后，重新显示当前日期以刷新数据
                                if (currentDayId) {
                                    showDay(currentDayId);
                                }
                            }
                        }).catch(() => {
                            // 静默处理错误，不影响页面正常使用
                        });
                        
                        // 如果启用自动同步，初始化实时同步
                        if (dataSyncFirebase.autoSyncEnabled) {
                            dataSyncFirebase.setAutoSync(true);
                        }
                    }
                });
            }
        };
        
        // 如果Firebase已加载，直接初始化；否则等待加载完成
        if (window.firebaseLoaded) {
            initFirebase();
        } else {
            window.addEventListener('firebaseReady', initFirebase, { once: true });
        }
    } else if (typeof dataSync !== 'undefined' && dataSync.isConfigured()) {
        // 先尝试从 Gist 下载数据（静默，不显示错误）
        dataSync.download().then(result => {
            if (result.success) {
                // 下载成功后，重新显示当前日期以刷新数据
                if (currentDayId) {
                    showDay(currentDayId);
                }
            }
        }).catch(() => {
            // 静默处理错误，不影响页面正常使用
        });
        
        // 如果启用自动同步，初始化自动同步
        if (dataSync.autoSyncEnabled) {
            dataSync.setAutoSync(true);
        }
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
    
    // 创建卡片容器（滚动模式）
    const cardsContainer = document.getElementById('cards-container');
    if (cardsContainer) {
        // 创建新的卡片显示器（滚动模式）
        const slider = new CardSlider('cards-container', filteredItems, dayId);
        // 只有在当前日期时才保存引用，避免跨日期状态混乱
        if (dayId === currentDayId) {
            currentSlider = slider; // 保存引用
        }
        
        // 不再自动滚动到卡片区域，让用户保持在当前位置
    }
}

// 应用卡片顺序
function applyCardOrder(dayId, items) {
    const orderKey = `trip_card_order_${dayId}`;
    const orderData = localStorage.getItem(orderKey);
    if (!orderData) {
        return items;
    }
    
    try {
        const order = JSON.parse(orderData);
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
        
        // 按照保存的顺序排列
        order.forEach(orderItem => {
            const item = itemMap.get(orderItem.id);
            if (item) {
                orderedItems.push(item);
                itemMap.delete(orderItem.id);
            } else {
            }
        });
        
        // 添加未排序的项（新添加的项）
        itemMap.forEach(item => {
            orderedItems.push(item);
        });
        
        return orderedItems;
    } catch (e) {
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
        tag: document.getElementById('new-item-tag').value || '其他'
    };
    
    addCustomItem(dayId, itemData);
    closeAddItemModal();
}

// 自动同步到Gist（如果已配置）
let syncTimeout = null;
function autoSyncToGist() {
    // 防抖，避免频繁同步
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    
    syncTimeout = setTimeout(() => {
        // 检查使用的同步方式
        const syncType = localStorage.getItem('trip_sync_type') || 'gist';
        let syncInstance = null;
        
        if (syncType === 'firebase' && typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
            syncInstance = dataSyncFirebase;
        } else if (typeof dataSync !== 'undefined' && dataSync.isConfigured()) {
            syncInstance = dataSync;
        }
        
        if (!syncInstance) {
            // 未配置，不执行同步
            return;
        }
        
        syncInstance.upload().then(result => {
            if (result.success) {
                updateSyncStatus('已自动同步', 'success');
            }
        }).catch(() => {
            // 静默处理错误
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

