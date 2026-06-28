/**
 * 行后复盘留言板管理器
 * 负责管理行后复盘留言板数据和UI渲染
 */
class PostTripMessageBoard {
    constructor() {
        this.messages = {};
        this.container = null;
    }

    /**
     * 初始化留言板管理器
     * @param {HTMLElement} container - 留言板容器
     */
    init(container) {
        this.container = container;
        this.loadData();
        this.render();
        if (window.moduleStore) {
            window.moduleStore.subscribe('postTrip_messages', (data) => {
                this.messages = data || {};
                this.render();
            });
        }
    }

    /**
     * 加载留言板数据（Firestore 缓存）
     */
    loadData() {
        this.messages = (window.moduleStore && window.moduleStore.get('postTrip_messages')) || {};
    }

    /**
     * 保存留言板数据（Firestore）
     */
    saveData() {
        if (window.moduleStore) window.moduleStore.save('postTrip_messages', this.messages);
    }

    /**
     * 添加留言
     * @param {Object} message - 留言
     */
    addMessage(message) {
        const messageId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        this.messages[messageId] = {
            id: messageId,
            ...message,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
            likes: []
        };
        this.saveData();
        this.render();
    }

    /**
     * 更新留言
     * @param {string} messageId - 留言ID
     * @param {Object} updates - 更新内容
     */
    updateMessage(messageId, updates) {
        if (this.messages[messageId]) {
            this.messages[messageId] = {
                ...this.messages[messageId],
                ...updates,
                _updatedAt: new Date().toISOString()
            };
            this.saveData();
            this.render();
        }
    }

    /**
     * 删除留言
     * @param {string} messageId - 留言ID
     */
    deleteMessage(messageId) {
        if (this.messages[messageId]) {
            delete this.messages[messageId];
            this.saveData();
            this.render();
        }
    }

    /**
     * 点赞留言
     * @param {string} messageId - 留言ID
     * @param {string} user - 点赞用户
     */
    toggleLike(messageId, user) {
        if (this.messages[messageId]) {
            const likes = this.messages[messageId].likes || [];
            const userIndex = likes.indexOf(user);
            if (userIndex > -1) {
                likes.splice(userIndex, 1);
            } else {
                likes.push(user);
            }
            this.messages[messageId].likes = likes;
            this.saveData();
            this.render();
        }
    }

    /**
     * 渲染留言板
     */
    render() {
        if (!this.container) return;

        // 将对象转换为数组并按时间排序
        const messagesArray = Object.values(this.messages).sort((a, b) => {
            return new Date(b._createdAt) - new Date(a._createdAt);
        });

        if (messagesArray.length === 0) {
            this.container.innerHTML = `
                <div class="message-board-empty">
                    <p>暂无留言</p>
                    <div class="message-input-form">
                        <input type="text" id="new-message-input" placeholder="输入你的留言..." class="message-input">
                        <button id="send-message-btn" class="btn-primary">发送</button>
                    </div>
                </div>
            `;
            this.attachEvents();
            return;
        }

        let html = '<div class="message-board">';
        messagesArray.forEach((message, index) => {
            html += this.createMessageHTML(message, index);
        });
        html += '</div>';

        // 添加留言输入框
        html += `
            <div class="message-input-form">
                <input type="text" id="new-message-input" placeholder="输入你的留言..." class="message-input">
                <button id="send-message-btn" class="btn-primary">发送</button>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEvents();
    }

    /**
     * 创建留言HTML
     * @param {Object} message - 留言
     * @param {number} index - 索引
     * @returns {string} HTML字符串
     */
    createMessageHTML(message, index) {
        return `
            <div class="message" data-message-id="${message.id}">
                <div class="message-header">
                    <span class="message-user">${message.user || '匿名用户'}</span>
                    <span class="message-date">${new Date(message._createdAt).toLocaleString()}</span>
                </div>
                <div class="message-content">
                    <p>${message.content || ''}</p>
                    ${message.rating ? `<div class="rating">评分: ${'⭐'.repeat(message.rating)}</div>` : ''}
                </div>
                <div class="message-actions">
                    <button class="btn-secondary like-message-btn" data-message-id="${message.id}">
                        ❤️ ${message.likes ? message.likes.length : 0}
                    </button>
                    <button class="btn-secondary edit-message-btn" data-message-id="${message.id}">编辑</button>
                    <button class="btn-danger delete-message-btn" data-message-id="${message.id}">删除</button>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    attachEvents() {
        // 发送留言按钮事件
        const sendBtn = this.container.querySelector('#send-message-btn');
        const input = this.container.querySelector('#new-message-input');
        if (sendBtn && input) {
            sendBtn.addEventListener('click', () => this.handleSendMessage());
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSendMessage();
                }
            });
        }

        // 点赞按钮事件
        const likeBtns = this.container.querySelectorAll('.like-message-btn');
        likeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const messageId = e.target.dataset.messageId;
                const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'anonymous' : 'anonymous';
                this.toggleLike(messageId, currentUser);
            });
        });

        // 编辑按钮事件
        const editBtns = this.container.querySelectorAll('.edit-message-btn');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const messageId = e.target.dataset.messageId;
                this.showEditMessageModal(messageId);
            });
        });

        // 删除按钮事件
        const deleteBtns = this.container.querySelectorAll('.delete-message-btn');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const messageId = e.target.dataset.messageId;
                if (confirm('确定要删除这条留言吗？')) {
                    this.deleteMessage(messageId);
                }
            });
        });
    }

    /**
     * 处理发送留言
     */
    handleSendMessage() {
        const input = this.container.querySelector('#new-message-input');
        if (input) {
            const content = input.value.trim();
            if (content) {
                const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'anonymous' : 'anonymous';
                this.addMessage({
                    user: currentUser,
                    content: content
                });
                input.value = '';
            }
        }
    }

    /**
     * 显示编辑留言模态框
     * @param {string} messageId - 留言ID
     */
    showEditMessageModal(messageId) {
        // 模态框功能开发中
        alert('编辑留言功能开发中...');
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PostTripMessageBoard;
} else if (typeof window !== 'undefined') {
    window.PostTripMessageBoard = PostTripMessageBoard;
}