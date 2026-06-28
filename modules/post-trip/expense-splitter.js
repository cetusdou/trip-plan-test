/**
 * 分账管理器
 * 负责管理分账数据和UI渲染
 */
class ExpenseSplitter {
    constructor() {
        this.expenses = {};
        this.participants = [];
        this.container = null;
    }

    /**
     * 初始化分账管理器
     * @param {HTMLElement} container - 分账容器
     */
    init(container) {
        this.container = container;
        this.loadData();
        this.render();
    }

    /**
     * 加载分账数据
     */
    loadData() {
        // 从 stateManager 或 localStorage 加载数据
        if (typeof window !== 'undefined' && window.stateManager) {
            const state = window.stateManager.getState('postTrip');
            if (state && state.expenses) {
                this.expenses = state.expenses;
            }
            if (state && state.participants) {
                this.participants = state.participants;
            }
        }
    }

    /**
     * 保存分账数据
     */
    saveData() {
        // 保存到 stateManager 和 localStorage
        if (typeof window !== 'undefined' && window.stateManager) {
            window.stateManager.setState({
                postTrip: {
                    ...window.stateManager.getState('postTrip'),
                    expenses: this.expenses,
                    participants: this.participants
                }
            });
        }
    }

    /**
     * 添加参与者
     * @param {string} participant - 参与者名称
     */
    addParticipant(participant) {
        if (participant && !this.participants.includes(participant)) {
            this.participants.push(participant);
            this.saveData();
            this.render();
        }
    }

    /**
     * 删除参与者
     * @param {string} participant - 参与者名称
     */
    removeParticipant(participant) {
        const index = this.participants.indexOf(participant);
        if (index > -1) {
            this.participants.splice(index, 1);
            this.saveData();
            this.render();
        }
    }

    /**
     * 添加消费记录
     * @param {Object} expense - 消费记录
     */
    addExpense(expense) {
        const expenseId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        this.expenses[expenseId] = {
            id: expenseId,
            ...expense,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString()
        };
        this.saveData();
        this.render();
    }

    /**
     * 更新消费记录
     * @param {string} expenseId - 消费记录ID
     * @param {Object} updates - 更新内容
     */
    updateExpense(expenseId, updates) {
        if (this.expenses[expenseId]) {
            this.expenses[expenseId] = {
                ...this.expenses[expenseId],
                ...updates,
                _updatedAt: new Date().toISOString()
            };
            this.saveData();
            this.render();
        }
    }

    /**
     * 删除消费记录
     * @param {string} expenseId - 消费记录ID
     */
    deleteExpense(expenseId) {
        if (this.expenses[expenseId]) {
            delete this.expenses[expenseId];
            this.saveData();
            this.render();
        }
    }

    /**
     * 计算每个人的消费总额
     * @returns {Object} 每个人的消费总额
     */
    calculateTotalPerPerson() {
        const totals = {};

        // 初始化所有参与者的总额为0
        this.participants.forEach(participant => {
            totals[participant] = 0;
        });

        // 计算每个人的消费
        Object.values(this.expenses).forEach(expense => {
            const payer = expense.payer;
            const amount = parseFloat(expense.amount) || 0;
            const splitBetween = expense.splitBetween || this.participants;
            const splitAmount = amount / splitBetween.length;

            // 付款人增加总金额
            if (payer) {
                totals[payer] = (totals[payer] || 0) + amount;
            }

            // 被分摊的人减少分摊金额
            splitBetween.forEach(person => {
                totals[person] = (totals[person] || 0) - splitAmount;
            });
        });

        return totals;
    }

    /**
     * 计算分账结果
     * @returns {Object} 分账结果
     */
    calculateSettlement() {
        const totals = this.calculateTotalPerPerson();
        const result = {
            totals: totals,
            transactions: []
        };

        // 计算每个人应该支付或收到的金额
        const debtors = [];
        const creditors = [];

        Object.entries(totals).forEach(([person, total]) => {
            if (total > 0) {
                // 应该收到钱
                creditors.push({ person, amount: total });
            } else if (total < 0) {
                // 应该支付钱
                debtors.push({ person, amount: -total });
            }
        });

        // 简化交易：让债务人直接支付给债权人
        let debtorIndex = 0;
        let creditorIndex = 0;

        while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
            const debtor = debtors[debtorIndex];
            const creditor = creditors[creditorIndex];

            const amount = Math.min(debtor.amount, creditor.amount);

            if (amount > 0) {
                result.transactions.push({
                    from: debtor.person,
                    to: creditor.person,
                    amount: amount
                });
            }

            debtor.amount -= amount;
            creditor.amount -= amount;

            if (debtor.amount <= 0) debtorIndex++;
            if (creditor.amount <= 0) creditorIndex++;
        }

        return result;
    }

    /**
     * 渲染分账界面
     */
    render() {
        if (!this.container) return;

        const settlement = this.calculateSettlement();

        let html = '<div class="expense-splitter">';

        // 参与者管理部分
        html += `
            <div class="participants-section">
                <h3>参与者管理</h3>
                <div class="participants-list">
                    ${this.participants.length > 0 ? 
                        this.participants.map(participant => `
                            <div class="participant-item">
                                <span>${participant}</span>
                                <button class="btn-danger remove-participant-btn" data-participant="${participant}">删除</button>
                            </div>
                        `).join('') : 
                        '<p class="placeholder">暂无参与者</p>'
                    }
                </div>
                <div class="add-participant-form">
                    <input type="text" id="new-participant-input" placeholder="输入参与者名称" class="participant-input">
                    <button id="add-participant-btn" class="btn-primary">添加</button>
                </div>
            </div>
        `;

        // 消费记录部分
        html += `
            <div class="expenses-section">
                <h3>消费记录</h3>
                <div class="expenses-list">
                    ${Object.keys(this.expenses).length > 0 ? 
                        Object.values(this.expenses).map(expense => this.createExpenseHTML(expense)).join('') : 
                        '<p class="placeholder">暂无消费记录</p>'
                    }
                </div>
                <button id="add-expense-btn" class="btn-primary">添加消费记录</button>
            </div>
        `;

        // 分账结果部分
        html += `
            <div class="settlement-section">
                <h3>分账结果</h3>
                <div class="totals">
                    <h4>个人消费总额:</h4>
                    ${Object.entries(settlement.totals).map(([person, total]) => `
                        <div class="total-item">
                            <span>${person}:</span>
                            <span class="${total >= 0 ? 'positive' : 'negative'}">
                                ${total >= 0 ? '+' : ''}${total.toFixed(2)} 元
                            </span>
                        </div>
                    `).join('')}
                </div>
                <div class="transactions">
                    <h4>建议交易:</h4>
                    ${settlement.transactions.length > 0 ? 
                        settlement.transactions.map((transaction, index) => `
                            <div class="transaction-item">
                                <span>${transaction.from} → ${transaction.to}</span>
                                <span>${transaction.amount.toFixed(2)} 元</span>
                            </div>
                        `).join('') : 
                        '<p class="placeholder">无需交易</p>'
                    }
                </div>
            </div>
        `;

        html += '</div>';

        this.container.innerHTML = html;
        this.attachEvents();
    }

    /**
     * 创建消费记录HTML
     * @param {Object} expense - 消费记录
     * @returns {string} HTML字符串
     */
    createExpenseHTML(expense) {
        return `
            <div class="expense-item" data-expense-id="${expense.id}">
                <div class="expense-header">
                    <span class="expense-payer">付款人: ${expense.payer || '未知'}</span>
                    <span class="expense-amount">金额: ${expense.amount || 0} 元</span>
                </div>
                <div class="expense-content">
                    <div class="expense-description">描述: ${expense.description || '无'}</div>
                    <div class="expense-date">日期: ${new Date(expense._createdAt).toLocaleString()}</div>
                    ${expense.splitBetween ? `<div class="expense-split-between">
                        分摊人: ${expense.splitBetween.join(', ')}
                    </div>` : ''}
                </div>
                <div class="expense-actions">
                    <button class="btn-secondary edit-expense-btn" data-expense-id="${expense.id}">编辑</button>
                    <button class="btn-danger delete-expense-btn" data-expense-id="${expense.id}">删除</button>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    attachEvents() {
        // 添加参与者按钮事件
        const addParticipantBtn = this.container.querySelector('#add-participant-btn');
        const participantInput = this.container.querySelector('#new-participant-input');
        if (addParticipantBtn && participantInput) {
            addParticipantBtn.addEventListener('click', () => {
                const participant = participantInput.value.trim();
                if (participant) {
                    this.addParticipant(participant);
                    participantInput.value = '';
                }
            });

            participantInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addParticipantBtn.click();
                }
            });
        }

        // 删除参与者按钮事件
        const removeParticipantBtns = this.container.querySelectorAll('.remove-participant-btn');
        removeParticipantBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const participant = e.target.dataset.participant;
                if (confirm(`确定要删除参与者 "${participant}" 吗？`)) {
                    this.removeParticipant(participant);
                }
            });
        });

        // 添加消费记录按钮事件
        const addExpenseBtn = this.container.querySelector('#add-expense-btn');
        if (addExpenseBtn) {
            addExpenseBtn.addEventListener('click', () => {
                this.showAddExpenseModal();
            });
        }

        // 编辑消费记录按钮事件
        const editExpenseBtns = this.container.querySelectorAll('.edit-expense-btn');
        editExpenseBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const expenseId = e.target.dataset.expenseId;
                this.showEditExpenseModal(expenseId);
            });
        });

        // 删除消费记录按钮事件
        const deleteExpenseBtns = this.container.querySelectorAll('.delete-expense-btn');
        deleteExpenseBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const expenseId = e.target.dataset.expenseId;
                if (confirm('确定要删除这条消费记录吗？')) {
                    this.deleteExpense(expenseId);
                }
            });
        });
    }

    /**
     * 显示添加消费记录模态框
     */
    showAddExpenseModal() {
        // 模态框功能开发中
        alert('添加消费记录功能开发中...');
    }

    /**
     * 显示编辑消费记录模态框
     * @param {string} expenseId - 消费记录ID
     */
    showEditExpenseModal(expenseId) {
        // 模态框功能开发中
        alert('编辑消费记录功能开发中...');
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExpenseSplitter;
} else if (typeof window !== 'undefined') {
    window.ExpenseSplitter = ExpenseSplitter;
}