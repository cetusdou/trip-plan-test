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
                unifiedData.days.forEach(day => {
                    if (day.items && Array.isArray(day.items)) {
                        day.items.forEach(item => {
                            if (item.spend && Array.isArray(item.spend)) {
                                item.spend.forEach(spendItem => {
                                    expenses.push({
                                        dayId: day.id || '',
                                        dayTitle: day.title || '',
                                        itemId: item.id || '',
                                        itemCategory: item.category || '',
                                        itemTime: item.time || '',
                                        itemName: item.plan?.[0] || '',
                                        spendItem: spendItem.item || '',
                                        amount: parseFloat(spendItem.amount) || 0,
                                        payer: spendItem.payer || ''
                                    });
                                });
                            }
                        });
                    }
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
        
        // 计算每个人的实际支出
        const userExpenses = {
            'mrb': 0,
            'djy': 0
        };
        
        validExpenses.forEach(expense => {
            const payer = expense.payer || '';
            const amount = expense.amount || 0;
            if (payer === 'mrb' || payer === 'djy') {
                userExpenses[payer] = (userExpenses[payer] || 0) + amount;
            }
        });
        
        // 计算总支出（不包括"共同"）
        const totalExpense = validExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
        
        // 平均每人应该支付
        const averagePerPerson = totalExpense / 2;
        
        // 计算每个人的差额
        const mrbActual = userExpenses['mrb'] || 0;
        const djyActual = userExpenses['djy'] || 0;
        const mrbDifference = averagePerPerson - mrbActual;
        const djyDifference = averagePerPerson - djyActual;
        
        // 生成分账结果HTML
        let html = '<div class="expense-split-container">';
        
        // 总支出信息
        html += `
            <div class="expense-split-summary">
                <div class="split-summary-item">
                    <span class="split-label">总支出（不含共同）：</span>
                    <span class="split-value">¥${totalExpense.toFixed(2)}</span>
                </div>
                <div class="split-summary-item">
                    <span class="split-label">平均每人应支付：</span>
                    <span class="split-value">¥${averagePerPerson.toFixed(2)}</span>
                </div>
            </div>
        `;
        
        // 每个人的实际支出和差额
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
                    <tr>
                        <td><strong>mrb</strong></td>
                        <td class="expense-amount">¥${mrbActual.toFixed(2)}</td>
                        <td class="expense-amount">¥${averagePerPerson.toFixed(2)}</td>
                        <td class="${mrbDifference >= 0 ? 'split-owe' : 'split-receive'}">
                            ${mrbDifference >= 0 ? '需支付' : '应收'} ¥${Math.abs(mrbDifference).toFixed(2)}
                        </td>
                    </tr>
                    <tr>
                        <td><strong>djy</strong></td>
                        <td class="expense-amount">¥${djyActual.toFixed(2)}</td>
                        <td class="expense-amount">¥${averagePerPerson.toFixed(2)}</td>
                        <td class="${djyDifference >= 0 ? 'split-owe' : 'split-receive'}">
                            ${djyDifference >= 0 ? '需支付' : '应收'} ¥${Math.abs(djyDifference).toFixed(2)}
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
        
        // 分账说明
        html += `
            <div class="expense-split-note">
                <p><strong>分账说明：</strong></p>
                <ul>
                    <li>总支出不包括"共同"支出的部分（因为每个人独立出了自己的部分）</li>
                    <li>平均每人应支付 = 总支出 ÷ 人数</li>
                    <li>差额 = 平均每人应支付 - 实际支出</li>
                    <li>差额为正表示需要支付给其他人，差额为负表示应该收到其他人的支付</li>
                </ul>
            </div>
        `;
        
        // 如果差额不为0，显示转账建议
        if (Math.abs(mrbDifference) > 0.01 || Math.abs(djyDifference) > 0.01) {
            html += `
                <div class="expense-split-action">
                    <p><strong>转账建议：</strong></p>
            `;
            
            if (mrbDifference > 0 && djyDifference < 0) {
                // mrb需要支付给djy
                html += `<p class="split-action-text">mrb 需要支付给 djy：<strong>¥${Math.abs(mrbDifference).toFixed(2)}</strong></p>`;
            } else if (mrbDifference < 0 && djyDifference > 0) {
                // djy需要支付给mrb
                html += `<p class="split-action-text">djy 需要支付给 mrb：<strong>¥${Math.abs(djyDifference).toFixed(2)}</strong></p>`;
            } else if (Math.abs(mrbDifference) < 0.01 && Math.abs(djyDifference) < 0.01) {
                html += `<p class="split-action-text" style="color: #56ab2f;">✅ 分账平衡，无需转账</p>`;
            }
            
            html += `</div>`;
        } else {
            html += `
                <div class="expense-split-action">
                    <p class="split-action-text" style="color: #56ab2f;">✅ 分账平衡，无需转账</p>
                </div>
            `;
        }
        
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
