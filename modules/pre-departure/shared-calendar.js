/**
 * 共享日历管理器
 * 负责管理共享日历数据和UI渲染
 */
class SharedCalendar {
    constructor() {
        this.calendarData = {};
        this.container = null;
    }

    /**
     * 初始化共享日历管理器
     * @param {HTMLElement} container - 日历容器
     */
    init(container) {
        this.container = container;
        this.loadData();
        this.render();
    }

    /**
     * 加载日历数据
     */
    loadData() {
        // 从 stateManager 或 localStorage 加载数据
        if (typeof window !== 'undefined' && window.stateManager) {
            const state = window.stateManager.getState('preDeparture');
            if (state && state.calendar) {
                this.calendarData = state.calendar;
            }
        }
    }

    /**
     * 保存日历数据
     */
    saveData() {
        // 保存到 stateManager 和 localStorage
        if (typeof window !== 'undefined' && window.stateManager) {
            window.stateManager.setState({
                preDeparture: {
                    ...window.stateManager.getState('preDeparture'),
                    calendar: this.calendarData
                }
            });
        }
    }

    /**
     * 添加日历选择
     * @param {Object} selection - 日历选择
     */
    addSelection(selection) {
        const selectionId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        this.calendarData[selectionId] = {
            id: selectionId,
            ...selection,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString()
        };
        this.saveData();
        this.render();
    }

    /**
     * 更新日历选择
     * @param {string} selectionId - 选择ID
     * @param {Object} updates - 更新内容
     */
    updateSelection(selectionId, updates) {
        if (this.calendarData[selectionId]) {
            this.calendarData[selectionId] = {
                ...this.calendarData[selectionId],
                ...updates,
                _updatedAt: new Date().toISOString()
            };
            this.saveData();
            this.render();
        }
    }

    /**
     * 删除日历选择
     * @param {string} selectionId - 选择ID
     */
    deleteSelection(selectionId) {
        if (this.calendarData[selectionId]) {
            delete this.calendarData[selectionId];
            this.saveData();
            this.render();
        }
    }

    /**
     * 渲染日历
     */
    render() {
        if (!this.container) return;

        // 将对象转换为数组并按时间排序
        const selections = Object.values(this.calendarData).sort((a, b) => {
            return new Date(a._createdAt) - new Date(b._createdAt);
        });

        if (selections.length === 0) {
            this.container.innerHTML = `
                <div class="calendar-empty">
                    <p>暂无日历选择数据</p>
                    <button id="add-calendar-selection-btn" class="btn-primary">添加日历选择</button>
                </div>
            `;
            this.attachEvents();
            return;
        }

        let html = '<div class="calendar">';
        selections.forEach((selection, index) => {
            html += this.createSelectionHTML(selection, index);
        });
        html += '</div>';

        this.container.innerHTML = html;
        this.attachEvents();
    }

    /**
     * 创建日历选择HTML
     * @param {Object} selection - 日历选择
     * @param {number} index - 索引
     * @returns {string} HTML字符串
     */
    createSelectionHTML(selection, index) {
        return `
            <div class="calendar-selection" data-selection-id="${selection.id}">
                <div class="calendar-selection-header">
                    <span class="calendar-selection-user">${selection.user || '匿名用户'}</span>
                    <span class="calendar-selection-date">${new Date(selection._createdAt).toLocaleString()}</span>
                </div>
                <div class="calendar-selection-content">
                    ${selection.availableDates ? `<div class="available-dates">
                        <h4>可用日期:</h4>
                        <ul>${selection.availableDates.map(date => `<li>${date}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${selection.preferredDates ? `<div class="preferred-dates">
                        <h4>偏好日期:</h4>
                        <ul>${selection.preferredDates.map(date => `<li>${date}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${selection.note ? `<div class="note">备注: ${selection.note}</div>` : ''}
                </div>
                <div class="calendar-selection-actions">
                    <button class="btn-secondary edit-selection-btn" data-selection-id="${selection.id}">编辑</button>
                    <button class="btn-danger delete-selection-btn" data-selection-id="${selection.id}">删除</button>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    attachEvents() {
        // 添加选择按钮事件
        const addBtn = this.container.querySelector('#add-calendar-selection-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddSelectionModal());
        }

        // 编辑按钮事件
        const editBtns = this.container.querySelectorAll('.edit-selection-btn');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectionId = e.target.dataset.selectionId;
                this.showEditSelectionModal(selectionId);
            });
        });

        // 删除按钮事件
        const deleteBtns = this.container.querySelectorAll('.delete-selection-btn');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectionId = e.target.dataset.selectionId;
                if (confirm('确定要删除这个日历选择吗？')) {
                    this.deleteSelection(selectionId);
                }
            });
        });
    }

    /**
     * 显示添加选择模态框
     */
    showAddSelectionModal() {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>添加日历选择</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="selection-user">用户名称:</label>
                        <input type="text" id="selection-user" class="form-input" placeholder="输入你的名称">
                    </div>
                    <div class="form-group">
                        <label for="selection-available-dates">可用日期 (每行一个):</label>
                        <textarea id="selection-available-dates" class="form-textarea" placeholder="例如:\n2024-01-15\n2024-01-16\n2024-01-17" rows="4"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="selection-preferred-dates">偏好日期 (每行一个):</label>
                        <textarea id="selection-preferred-dates" class="form-textarea" placeholder="例如:\n2024-01-15\n2024-01-16" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="selection-note">备注:</label>
                        <input type="text" id="selection-note" class="form-input" placeholder="输入备注">
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
        const userInput = modal.querySelector('#selection-user');
        const availableDatesInput = modal.querySelector('#selection-available-dates');
        const preferredDatesInput = modal.querySelector('#selection-preferred-dates');
        const noteInput = modal.querySelector('#selection-note');

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
            const user = userInput.value.trim();
            const availableDatesText = availableDatesInput.value.trim();
            const preferredDatesText = preferredDatesInput.value.trim();
            const note = noteInput.value.trim();

            if (!user) {
                alert('请输入用户名称');
                return;
            }

            const availableDates = availableDatesText ? availableDatesText.split('\n').map(date => date.trim()).filter(date => date) : [];
            const preferredDates = preferredDatesText ? preferredDatesText.split('\n').map(date => date.trim()).filter(date => date) : [];

            if (availableDates.length === 0 && preferredDates.length === 0) {
                alert('请至少输入可用日期或偏好日期');
                return;
            }

            this.addSelection({
                user: user,
                availableDates: availableDates.length > 0 ? availableDates : null,
                preferredDates: preferredDates.length > 0 ? preferredDates : null,
                note: note || null
            });

            closeModal();
        });

        // 自动聚焦
        userInput.focus();
    }

    /**
     * 显示编辑选择模态框
     * @param {string} selectionId - 选择ID
     */
    showEditSelectionModal(selectionId) {
        const selection = this.calendarData[selectionId];
        if (!selection) return;

        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>编辑日历选择</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="selection-user">用户名称:</label>
                        <input type="text" id="selection-user" class="form-input" value="${selection.user || ''}">
                    </div>
                    <div class="form-group">
                        <label for="selection-available-dates">可用日期 (每行一个):</label>
                        <textarea id="selection-available-dates" class="form-textarea" rows="4">${selection.availableDates ? selection.availableDates.join('\n') : ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="selection-preferred-dates">偏好日期 (每行一个):</label>
                        <textarea id="selection-preferred-dates" class="form-textarea" rows="3">${selection.preferredDates ? selection.preferredDates.join('\n') : ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="selection-note">备注:</label>
                        <input type="text" id="selection-note" class="form-input" value="${selection.note || ''}">
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
        const userInput = modal.querySelector('#selection-user');
        const availableDatesInput = modal.querySelector('#selection-available-dates');
        const preferredDatesInput = modal.querySelector('#selection-preferred-dates');
        const noteInput = modal.querySelector('#selection-note');

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
            const user = userInput.value.trim();
            const availableDatesText = availableDatesInput.value.trim();
            const preferredDatesText = preferredDatesInput.value.trim();
            const note = noteInput.value.trim();

            if (!user) {
                alert('请输入用户名称');
                return;
            }

            const availableDates = availableDatesText ? availableDatesText.split('\n').map(date => date.trim()).filter(date => date) : [];
            const preferredDates = preferredDatesText ? preferredDatesText.split('\n').map(date => date.trim()).filter(date => date) : [];

            if (availableDates.length === 0 && preferredDates.length === 0) {
                alert('请至少输入可用日期或偏好日期');
                return;
            }

            this.updateSelection(selectionId, {
                user: user,
                availableDates: availableDates.length > 0 ? availableDates : null,
                preferredDates: preferredDates.length > 0 ? preferredDates : null,
                note: note || null
            });

            closeModal();
        });

        // 自动聚焦
        userInput.focus();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedCalendar;
} else if (typeof window !== 'undefined') {
    window.SharedCalendar = SharedCalendar;
}