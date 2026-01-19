/**
 * 开支管理模块
 * 负责收集、统计和显示开支数据，以及计算分账
 */

// 使用 IIFE 封装模块，避免污染全局作用域
(function() {
    'use strict';

    /**
     * 收集所有消费数据
     * @returns {Array} 消费记录数组
     */
    function getAllExpenses() {
        const expenses = [];
        
        // 只从统一数据结构读取
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData && unifiedData.days) {
                // days 现在是对象结构，需要转换为数组处理
                let daysArray = [];
                if (Array.isArray(unifiedData.days)) {
                    daysArray = unifiedData.days;
                } else if (typeof unifiedData.days === 'object' && unifiedData.days !== null) {
                    daysArray = Object.values(unifiedData.days).sort((a, b) => (a.order || 0) - (b.order || 0));
                }
                
                daysArray.forEach(day => {
                    if (!day) return;
                    
                    // items 现在是对象结构，需要转换为数组处理
                    let itemsArray = [];
                    if (Array.isArray(day.items)) {
                        itemsArray = day.items;
                    } else if (day.items && typeof day.items === 'object' && day.items !== null) {
                        itemsArray = Object.values(day.items);
                    }
                    
                    itemsArray.forEach(item => {
                        if (!item) return;
                        if (item.spend && Array.isArray(item.spend)) {
                            item.spend.forEach(spendItem => {
                                expenses.push({
                                    dayId: day.id || '',
                                    dayTitle: day.title || '',
                                    itemId: item.id || '',
                                    itemCategory: item.category || '',
                                    itemTime: item.time || '',
                                    itemName: (item.plan && typeof item.plan === 'object' && !Array.isArray(item.plan)) 
                                        ? Object.values(item.plan)[0]?._text || ''
                                        : (Array.isArray(item.plan) ? item.plan[0] : ''),
                                    spendItem: spendItem.item || '',
                                    amount: parseFloat(spendItem.amount) || 0,
                                    payer: spendItem.payer || '',
                                    participants: spendItem.participants || []
                                });
                            });
                        }
                    });
                });
            }
        }
        
        return expenses;
    }

    /**
     * 转义 HTML 字符串（如果全局函数存在）
     * @param {string} str - 需要转义的字符串
     * @returns {string} 转义后的字符串
     */
    function escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        // 简单的 HTML 转义实现
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 显示开支总计弹窗
     */
    function showExpenseSummary() {
        const modal = document.getElementById('expense-summary-modal');
        const content = document.getElementById('expense-summary-content');
        
        if (!modal || !content) return;
        
        const expenses = getAllExpenses();
        
        if (expenses.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">暂无消费记录</p>';
            modal.style.display = 'flex';
            return;
        }
        
        // 按支出人统计
        const payerStats = {};
        // 按日期统计
        const dayStats = {};
        // 总计
        let totalAmount = 0;
        
        expenses.forEach(expense => {
            const amount = expense.amount || 0;
            totalAmount += amount;
            
            // 按支出人统计
            const payer = expense.payer || '未指定';
            if (!payerStats[payer]) {
                payerStats[payer] = { amount: 0, count: 0, items: [] };
            }
            payerStats[payer].amount += amount;
            payerStats[payer].count += 1;
            payerStats[payer].items.push(expense);
            
            // 按日期统计
            const dayTitle = expense.dayTitle || '未知日期';
            if (!dayStats[dayTitle]) {
                dayStats[dayTitle] = { amount: 0, count: 0, items: [] };
            }
            dayStats[dayTitle].amount += amount;
            dayStats[dayTitle].count += 1;
            dayStats[dayTitle].items.push(expense);
        });
        
        // 生成HTML
        let html = '<div class="expense-summary-container">';
        
        // 总计
        html += `
            <div class="expense-summary-section">
                <h3> 总计</h3>
                <div class="expense-total">
                    <span class="expense-total-label">总支出：</span>
                    <span class="expense-total-amount">¥${totalAmount.toFixed(2)}</span>
                </div>
                <div class="expense-total">
                    <span class="expense-total-label">消费项数：</span>
                    <span class="expense-total-count">${expenses.length} 项</span>
                </div>
            </div>
        `;
        
        // 按支出人统计
        html += `
            <div class="expense-summary-section">
                <h3> 按支出人统计</h3>
                <table class="expense-summary-table">
                    <thead>
                        <tr>
                            <th>支出人</th>
                            <th>金额</th>
                            <th>项数</th>
                            <th>占比</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        Object.keys(payerStats).sort().forEach(payer => {
            const stats = payerStats[payer];
            const percentage = totalAmount > 0 ? ((stats.amount / totalAmount) * 100).toFixed(1) : 0;
            html += `
                <tr>
                    <td>${payer === '未指定' ? '<span style="color: #999;">未指定</span>' : escapeHtml(payer)}</td>
                    <td class="expense-amount">¥${stats.amount.toFixed(2)}</td>
                    <td>${stats.count}</td>
                    <td>${percentage}%</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        // 按日期统计
        html += `
            <div class="expense-summary-section">
                <h3> 按日期统计</h3>
                <table class="expense-summary-table">
                    <thead>
                        <tr>
                            <th>日期</th>
                            <th>金额</th>
                            <th>项数</th>
                            <th>占比</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        Object.keys(dayStats).sort().forEach(dayTitle => {
            const stats = dayStats[dayTitle];
            const percentage = totalAmount > 0 ? ((stats.amount / totalAmount) * 100).toFixed(1) : 0;
            html += `
                <tr>
                    <td>${escapeHtml(dayTitle)}</td>
                    <td class="expense-amount">¥${stats.amount.toFixed(2)}</td>
                    <td>${stats.count}</td>
                    <td>${percentage}%</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        // 详细列表
        html += `
            <div class="expense-summary-section">
                <h3> 详细列表</h3>
                <div class="expense-detail-list">
        `;
        
        expenses.forEach((expense, index) => {
            html += `
                <div class="expense-detail-item">
                    <div class="expense-detail-header">
                        <span class="expense-detail-day">${escapeHtml(expense.dayTitle)}</span>
                        <span class="expense-detail-amount">¥${expense.amount.toFixed(2)}</span>
                    </div>
                    <div class="expense-detail-content">
                        <span class="expense-detail-item-name">${escapeHtml(expense.spendItem || '未命名')}</span>
                        <span class="expense-detail-payer">${expense.payer ? '👤 ' + escapeHtml(expense.payer) : ''}</span>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        // 一键分账按钮和结果
        html += `
            <div class="expense-summary-section">
                <h3>💸 一键分账</h3>
                <button class="btn-split-expense" onclick="calculateExpenseSplit()">计算分账</button>
                <div id="expense-split-result" style="display: none; margin-top: 16px;"></div>
            </div>
        `;
        
        html += '</div>';
        
        content.innerHTML = html;
        modal.style.display = 'flex';
    }

    /**
     * 关闭开支总计弹窗
     */
    function closeExpenseSummary() {
        const modal = document.getElementById('expense-summary-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * 计算分账
     */
    function calculateExpenseSplit() {
        const resultDiv = document.getElementById('expense-split-result');
        if (!resultDiv) return;
        
        const expenses = getAllExpenses();
        
        // 过滤掉"共同"支出（因为每个人独立出了自己的部分，不计算在内）
        const validExpenses = expenses.filter(expense => {
            const payer = expense.payer || '';
            return payer !== '共同' && payer !== '' && payer !== '未指定';
        });
        
        if (validExpenses.length === 0) {
            resultDiv.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">没有有效的个人支出记录（已排除"共同"支出）</p>';
            resultDiv.style.display = 'block';
            return;
        }
        
        // 收集所有唯一的参与人
        const allParticipants = new Set();
        validExpenses.forEach(expense => {
            const participants = expense.participants || [];
            participants.forEach(participant => {
                allParticipants.add(participant);
            });
        });
        
        // 如果没有参与人，使用默认的1-10人列表
        if (allParticipants.size === 0) {
            for (let i = 1; i <= 10; i++) {
                allParticipants.add(`p${i}`);
            }
        }
        
        // 计算每个人的实际支出
        const userExpenses = {};
        
        // 初始化用户支出为0
        allParticipants.forEach(user => {
            userExpenses[user] = 0;
        });
        
        // 计算每个人实际支付的金额
        validExpenses.forEach(expense => {
            const payer = expense.payer || '';
            const amount = expense.amount || 0;
            if (userExpenses.hasOwnProperty(payer)) {
                userExpenses[payer] = (userExpenses[payer] || 0) + amount;
            }
        });
        
        // 计算总支出
        let totalExpense = 0;
        validExpenses.forEach(expense => {
            totalExpense += expense.amount || 0;
        });
        
        // 计算每个人应该支付的金额（按照所有参与人平摊）
        const userShouldPay = {};
        const participantCount = allParticipants.size;
        
        // 初始化每个人应该支付的金额为0
        allParticipants.forEach(user => {
            userShouldPay[user] = 0;
        });
        
        // 按照所有参与人平摊，不考虑每个消费项的具体参与人
        if (participantCount > 0) {
            const splitPerPerson = totalExpense / participantCount;
            allParticipants.forEach(user => {
                userShouldPay[user] = splitPerPerson;
            });
        }
        
        // 计算每个人的差额
        const userDifferences = {};
        allParticipants.forEach(user => {
            const actual = userExpenses[user] || 0;
            const shouldPay = userShouldPay[user] || 0;
            userDifferences[user] = shouldPay - actual;
        });
        
        // 生成分账结果HTML
        let html = '<div class="expense-split-container">';
        
        // 总支出信息
        html += `
            <div class="expense-split-summary">
                <div class="split-summary-item">
                    <span class="split-label">总支出（不含共同）：</span>
                    <span class="split-value">¥${totalExpense.toFixed(2)}</span>
                </div>
            </div>
        `;
        
        // 每个人的实际支出、应支付和差额
        html += `
            <table class="expense-split-table">
                <thead>
                    <tr>
                        <th>人员</th>
                        <th>实际支出</th>
                        <th>应支付</th>
                        <th>差额</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // 按用户排序
        const sortedUsers = Array.from(allParticipants).sort();
        
        sortedUsers.forEach(user => {
            const actual = userExpenses[user] || 0;
            const shouldPay = userShouldPay[user] || 0;
            const difference = userDifferences[user] || 0;
            
            html += `
                <tr>
                    <td><strong>${user}</strong></td>
                    <td class="expense-amount">¥${actual.toFixed(2)}</td>
                    <td class="expense-amount">¥${shouldPay.toFixed(2)}</td>
                    <td class="${difference >= 0 ? 'split-owe' : 'split-receive'}">
                        ${difference >= 0 ? '需支付' : '应收'} ¥${Math.abs(difference).toFixed(2)}
                    </td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        // 分账说明
        html += `
            <div class="expense-split-note">
                <p><strong>分账说明：</strong></p>
                <ul>
                    <li>总支出不包括"共同"支出的部分（因为每个人独立出了自己的部分）</li>
                    <li>每个消费项根据参与分账人数量平摊</li>
                    <li>应支付 = 所有参与的消费项金额 ÷ 参与人数 的总和</li>
                    <li>差额 = 应支付 - 实际支出</li>
                    <li>差额为正表示需要支付给其他人，差额为负表示应该收到其他人的支付</li>
                </ul>
            </div>
        `;
        
        // 转账建议
        html += `
            <div class="expense-split-action">
                <p><strong>转账建议：</strong></p>
        `;
        
        // 找出需要支付和需要收款的人
        const oweMoney = [];
        const receiveMoney = [];
        
        sortedUsers.forEach(user => {
            const difference = userDifferences[user] || 0;
            if (difference > 0.01) {
                oweMoney.push({ user, amount: difference });
            } else if (difference < -0.01) {
                receiveMoney.push({ user, amount: Math.abs(difference) });
            }
        });
        
        // 如果所有人都平衡
        if (oweMoney.length === 0 && receiveMoney.length === 0) {
            html += `<p class="split-action-text" style="color: #56ab2f;">✅ 分账平衡，无需转账</p>`;
        } else {
            // 简化的转账建议（只是展示，实际应用中可能需要更复杂的算法）
            html += `<ul class="split-action-list">`;
            
            // 先处理需要支付的人
            oweMoney.forEach(ower => {
                html += `<li class="split-action-item">${ower.user} 需要支付：<strong>¥${ower.amount.toFixed(2)}</strong></li>`;
            });
            
            // 再处理需要收款的人
            receiveMoney.forEach(receiver => {
                html += `<li class="split-action-item">${receiver.user} 应该收到：<strong>¥${receiver.amount.toFixed(2)}</strong></li>`;
            });
            
            html += `</ul>`;
        }
        
        html += `</div>`;
        
        html += '</div>';
        
        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';
    }

    // 将函数暴露到全局作用域，供 HTML 中的 onclick 使用
    window.getAllExpenses = getAllExpenses;
    window.showExpenseSummary = showExpenseSummary;
    window.closeExpenseSummary = closeExpenseSummary;
    window.calculateExpenseSplit = calculateExpenseSplit;

})();
