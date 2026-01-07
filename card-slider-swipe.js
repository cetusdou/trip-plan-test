// 滑动卡片功能（备用代码）
// 此文件包含滑动切换卡片的所有逻辑，如果将来需要恢复滑动功能，可以重新引入

class CardSliderSwipe {
    // 滑动相关属性
    constructor() {
        this.currentIndex = 0;
        this.isDragging = false;
        this.startX = 0;
        this.currentX = 0;
        this.startY = 0;
        this.startTime = 0;
        this.threshold = 40; // 滑动阈值（40px，在手机上更容易触发）
    }

    // 绑定滑动事件监听器
    attachSwipeListeners() {
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
            target.closest('.card-save-btn') ||
            target.closest('.comment-submit') ||
            target.closest('.image-upload-btn') ||
            target.closest('.comment-like-btn') ||
            target.closest('.plan-item-like-btn') ||
            target.closest('.plan-item-delete-btn') ||
            target.closest('.item-like-btn') ||
            target.closest('.card-tag') ||
            target.closest('.plan-add-btn')
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
        if (absDeltaX > this.threshold) {
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

    // 滑动模式的渲染逻辑
    renderCardsSwipeMode() {
        // 正常模式：堆叠显示
        stack.className = 'cards-stack';
        // 只显示从 currentIndex 开始的卡片（已经滑过的卡片不显示）
        for (let i = this.cards.length - 1; i >= this.currentIndex; i--) {
            const card = this.createCard(this.cards[i], i);
            stack.appendChild(card);
        }
    }
}

