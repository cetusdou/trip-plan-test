/**
 * 时间线管理器
 * 负责管理用户的时间线数据和UI渲染
 */
class TimelineManager {
    constructor() {
        this.timelineData = {};
        this.container = null;
    }

    /**
     * 初始化时间线管理器
     * @param {HTMLElement} container - 时间线容器
     */
    init(container) {
        this.container = container;
        this.loadData();
        this.render();
    }

    /**
     * 加载时间线数据
     */
    loadData() {
        // 从 stateManager 或 localStorage 加载数据
        if (typeof window !== 'undefined' && window.stateManager) {
            const state = window.stateManager.getState('preDeparture');
            if (state && state.timeline) {
                this.timelineData = state.timeline;
            }
        }
    }

    /**
     * 保存时间线数据
     */
    saveData() {
        // 保存到 stateManager 和 localStorage
        if (typeof window !== 'undefined' && window.stateManager) {
            window.stateManager.setState({
                preDeparture: {
                    ...window.stateManager.getState('preDeparture'),
                    timeline: this.timelineData
                }
            });
        }
    }

    /**
     * 添加时间线条目
     * @param {Object} entry - 时间线条目
     */
    addEntry(entry) {
        const entryId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        this.timelineData[entryId] = {
            id: entryId,
            ...entry,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString()
        };
        this.saveData();
        this.render();
    }

    /**
     * 更新时间线条目
     * @param {string} entryId - 条目ID
     * @param {Object} updates - 更新内容
     */
    updateEntry(entryId, updates) {
        if (this.timelineData[entryId]) {
            this.timelineData[entryId] = {
                ...this.timelineData[entryId],
                ...updates,
                _updatedAt: new Date().toISOString()
            };
            this.saveData();
            this.render();
        }
    }

    /**
     * 删除时间线条目
     * @param {string} entryId - 条目ID
     */
    deleteEntry(entryId) {
        if (this.timelineData[entryId]) {
            delete this.timelineData[entryId];
            this.saveData();
            this.render();
        }
    }

    /**
     * 渲染时间线
     */
    render() {
        if (!this.container) return;

        // 将对象转换为数组并按时间排序
        const entries = Object.values(this.timelineData).sort((a, b) => {
            return new Date(a._createdAt) - new Date(b._createdAt);
        });

        if (entries.length === 0) {
            this.container.innerHTML = `
                <div class="timeline-empty">
                    <p>暂无时间线数据</p>
                    <button id="add-timeline-entry-btn" class="btn-primary">添加时间线条目</button>
                </div>
            `;
            this.attachEvents();
            return;
        }

        let html = '<div class="timeline">';
        entries.forEach((entry, index) => {
            html += this.createEntryHTML(entry, index);
        });
        html += '</div>';

        this.container.innerHTML = html;
        this.attachEvents();
    }

    /**
     * 创建时间线条目HTML
     * @param {Object} entry - 时间线条目
     * @param {number} index - 索引
     * @returns {string} HTML字符串
     */
    createEntryHTML(entry, index) {
        return `
            <div class="timeline-entry" data-entry-id="${entry.id}">
                <div class="timeline-entry-header">
                    <span class="timeline-entry-title">${entry.title || '未命名'}</span>
                    <span class="timeline-entry-date">${new Date(entry._createdAt).toLocaleString()}</span>
                </div>
                <div class="timeline-entry-content">
                    <p>${entry.description || ''}</p>
                    ${entry.timeRange ? `<div class="time-range">时间范围: ${entry.timeRange}</div>` : ''}
                    ${entry.participants ? `<div class="participants">参与人: ${entry.participants.join(', ')}</div>` : ''}
                </div>
                <div class="timeline-entry-actions">
                    <button class="btn-secondary edit-entry-btn" data-entry-id="${entry.id}">编辑</button>
                    <button class="btn-danger delete-entry-btn" data-entry-id="${entry.id}">删除</button>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    attachEvents() {
        // 添加条目按钮事件
        const addBtn = this.container.querySelector('#add-timeline-entry-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddEntryModal());
        }

        // 编辑按钮事件
        const editBtns = this.container.querySelectorAll('.edit-entry-btn');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const entryId = e.target.dataset.entryId;
                this.showEditEntryModal(entryId);
            });
        });

        // 删除按钮事件
        const deleteBtns = this.container.querySelectorAll('.delete-entry-btn');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const entryId = e.target.dataset.entryId;
                if (confirm('确定要删除这个时间线条目吗？')) {
                    this.deleteEntry(entryId);
                }
            });
        });
    }

    /**
     * 显示添加条目模态框
     */
    showAddEntryModal() {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>添加时间线条目</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="entry-title">标题:</label>
                        <input type="text" id="entry-title" class="form-input" placeholder="输入标题">
                    </div>
                    <div class="form-group">
                        <label for="entry-description">描述:</label>
                        <textarea id="entry-description" class="form-textarea" placeholder="输入描述" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="entry-time-range">时间范围:</label>
                        <input type="text" id="entry-time-range" class="form-input" placeholder="例如: 2024-01-15 至 2024-01-20">
                    </div>
                    <div class="form-group">
                        <label for="entry-participants">参与人 (用逗号分隔):</label>
                        <input type="text" id="entry-participants" class="form-input" placeholder="例如: 张三, 李四, 王五">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary modal-cancel">取消</button>
                    <button class="btn-primary modal-confirm">确认添加</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 获取元素
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.modal-cancel');
        const confirmBtn = modal.querySelector('.modal-confirm');
        const titleInput = modal.querySelector('#entry-title');
        const descriptionInput = modal.querySelector('#entry-description');
        const timeRangeInput = modal.querySelector('#entry-time-range');
        const participantsInput = modal.querySelector('#entry-participants');

        // 关闭模态框
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        // 绑定事件
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // 确认添加
        confirmBtn.addEventListener('click', () => {
            const title = titleInput.value.trim();
            const description = descriptionInput.value.trim();
            const timeRange = timeRangeInput.value.trim();
            const participantsInputValue = participantsInput.value.trim();
            const participants = participantsInputValue ? participantsInputValue.split(',').map(p => p.trim()) : [];

            if (!title) {
                alert('请输入标题');
                return;
            }

            this.addEntry({
                title: title,
                description: description,
                timeRange: timeRange || null,
                participants: participants.length > 0 ? participants : null
            });

            closeModal();
        });

        // 自动聚焦
        titleInput.focus();
    }

    /**
     * 显示编辑条目模态框
     * @param {string} entryId - 条目ID
     */
    showEditEntryModal(entryId) {
        const entry = this.timelineData[entryId];
        if (!entry) return;

        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>编辑时间线条目</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="entry-title">标题:</label>
                        <input type="text" id="entry-title" class="form-input" value="${entry.title || ''}">
                    </div>
                    <div class="form-group">
                        <label for="entry-description">描述:</label>
                        <textarea id="entry-description" class="form-textarea" rows="3">${entry.description || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="entry-time-range">时间范围:</label>
                        <input type="text" id="entry-time-range" class="form-input" value="${entry.timeRange || ''}">
                    </div>
                    <div class="form-group">
                        <label for="entry-participants">参与人 (用逗号分隔):</label>
                        <input type="text" id="entry-participants" class="form-input" value="${entry.participants ? entry.participants.join(', ') : ''}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary modal-cancel">取消</button>
                    <button class="btn-primary modal-confirm">确认修改</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 获取元素
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.modal-cancel');
        const confirmBtn = modal.querySelector('.modal-confirm');
        const titleInput = modal.querySelector('#entry-title');
        const descriptionInput = modal.querySelector('#entry-description');
        const timeRangeInput = modal.querySelector('#entry-time-range');
        const participantsInput = modal.querySelector('#entry-participants');

        // 关闭模态框
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        // 绑定事件
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // 确认修改
        confirmBtn.addEventListener('click', () => {
            const title = titleInput.value.trim();
            const description = descriptionInput.value.trim();
            const timeRange = timeRangeInput.value.trim();
            const participantsInputValue = participantsInput.value.trim();
            const participants = participantsInputValue ? participantsInputValue.split(',').map(p => p.trim()) : [];

            if (!title) {
                alert('请输入标题');
                return;
            }

            this.updateEntry(entryId, {
                title: title,
                description: description,
                timeRange: timeRange || null,
                participants: participants.length > 0 ? participants : null
            });

            closeModal();
        });

        // 自动聚焦
        titleInput.focus();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimelineManager;
} else if (typeof window !== 'undefined') {
    window.TimelineManager = TimelineManager;
}