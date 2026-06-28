/**
 * 共享日历 / 有空时间收集
 * 每个人填写自己的名字后，在月历上点选「我有空」的日期；
 * 系统实时汇总每天有多少人有空，并高亮「最佳日期」（有空人数最多）。
 * 数据通过 moduleStore 持久化到 Firestore 并实时同步。
 *
 * 数据模型（moduleStore key: preDeparture_calendar）：
 *   { users: { [name]: { dates: ['YYYY-MM-DD', ...], _updatedAt } } }
 */
class SharedCalendar {
    constructor() {
        this.container = null;
        this.data = { users: {} };
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth(); // 0-11
        this.me = this.loadMe();
    }

    init(container) {
        this.container = container;
        this.loadData();
        this.render();
        if (window.moduleStore) {
            window.moduleStore.subscribe('preDeparture_calendar', (data) => {
                this.data = this.normalize(data);
                // 避免正在输入名字时被实时刷新打断
                if (!this.isEditingName()) this.render();
            });
        }
    }

    // ---------- 数据 ----------
    normalize(data) {
        if (data && typeof data === 'object' && data.users && typeof data.users === 'object') {
            return { users: data.users };
        }
        return { users: {} };
    }

    loadData() {
        this.data = this.normalize(window.moduleStore && window.moduleStore.get('preDeparture_calendar'));
    }

    saveData() {
        if (window.moduleStore) window.moduleStore.save('preDeparture_calendar', this.data);
    }

    loadMe() {
        try {
            return localStorage.getItem('trip_current_user')
                || localStorage.getItem('predep_cal_name')
                || '游客';
        } catch (e) { return '游客'; }
    }

    // ---------- 工具 ----------
    pad(n) { return n < 10 ? '0' + n : '' + n; }
    dateStr(y, m, d) { return `${y}-${this.pad(m + 1)}-${this.pad(d)}`; }
    escape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    getUsers() { return Object.keys(this.data.users || {}); }
    getDatesOf(user) {
        const u = this.data.users[user];
        return (u && Array.isArray(u.dates)) ? u.dates : [];
    }
    availabilityFor(ds) {
        return this.getUsers().filter(u => this.getDatesOf(u).includes(ds));
    }

    toggleDate(ds) {
        if (!this.data.users[this.me]) this.data.users[this.me] = { dates: [] };
        const arr = this.data.users[this.me].dates || [];
        const i = arr.indexOf(ds);
        if (i > -1) arr.splice(i, 1); else arr.push(ds);
        arr.sort();
        this.data.users[this.me].dates = arr;
        this.data.users[this.me]._updatedAt = new Date().toISOString();
        this.saveData();
        this.render();
    }

    prevMonth() { if (--this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; } this.render(); }
    nextMonth() { if (++this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; } this.render(); }

    bestDates() {
        const counts = {};
        this.getUsers().forEach(u => this.getDatesOf(u).forEach(d => { counts[d] = (counts[d] || 0) + 1; }));
        const entries = Object.entries(counts);
        if (!entries.length) return [];
        const max = Math.max(...entries.map(e => e[1]));
        return entries.filter(e => e[1] === max).map(e => e[0]).sort();
    }

    isEditingName() { return false; }

    // ---------- 渲染 ----------
    render() {
        if (!this.container) return;
        const y = this.viewYear, m = this.viewMonth;
        const totalUsers = this.getUsers().length;
        const startWeekday = new Date(y, m, 1).getDay(); // 0=周日
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const now = new Date();
        const todayStr = this.dateStr(now.getFullYear(), now.getMonth(), now.getDate());
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

        let cells = '';
        for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell cal-empty"></div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = this.dateStr(y, m, d);
            const who = this.availabilityFor(ds);
            const count = who.length;
            const mine = who.includes(this.me);
            const ratio = totalUsers ? (count / totalUsers) : 0;
            const cls = ['cal-cell'];
            if (count > 0) cls.push('cal-has');
            if (mine) cls.push('cal-mine');
            if (ds === todayStr) cls.push('cal-today');
            const style = count > 0 ? ` style="--lvl:${ratio.toFixed(2)}"` : '';
            const titleAttr = count > 0 ? ` title="有空：${this.escape(who.join('、'))}"` : ' title="暂无人有空"';
            cells += `<div class="${cls.join(' ')}" data-date="${ds}"${style}${titleAttr}>` +
                `<span class="cal-num">${d}</span>` +
                (count > 0 ? `<span class="cal-count">${count}</span>` : '') +
                '</div>';
        }

        const best = this.bestDates();
        const users = this.getUsers();

        this.container.innerHTML = `
            <div class="cal-toolbar">
                <span class="cal-me">我是：<strong class="cal-me-name">${this.escape(this.me)}</strong></span>
                <span class="cal-hint">点日期格 = 切换「我有空」（在顶部切换用户）</span>
            </div>
            <div class="cal-monthbar">
                <button class="cal-nav" id="cal-prev" title="上个月">‹</button>
                <span class="cal-title">${y} 年 ${m + 1} 月</span>
                <button class="cal-nav" id="cal-next" title="下个月">›</button>
            </div>
            <div class="cal-grid cal-weekdays">${weekdays.map(w => `<div class="cal-wd">${w}</div>`).join('')}</div>
            <div class="cal-grid cal-days">${cells}</div>
            <div class="cal-summary">
                <div class="cal-best"><strong>⭐ 最佳日期</strong>${best.length
                    ? best.map(d => `<span class="cal-best-tag">${d}（${this.availabilityFor(d).length} 人）<button class="cal-best-make" data-date="${d}" title="用此日期创建行程">＋ 建行程</button></span>`).join('')
                    : '<span class="cal-none">还没有人选择</span>'}</div>
                <div class="cal-users"><strong>👥 参与者（${users.length}）</strong>${users.length
                    ? users.map(u => `<span class="cal-user-tag${u === this.me ? ' is-me' : ''}">${this.escape(u)}：${this.getDatesOf(u).length} 天</span>`).join('')
                    : '<span class="cal-none">暂无</span>'}</div>
            </div>
        `;

        this.attachEvents();
    }

    attachEvents() {
        const prev = this.container.querySelector('#cal-prev');
        if (prev) prev.addEventListener('click', () => this.prevMonth());
        const next = this.container.querySelector('#cal-next');
        if (next) next.addEventListener('click', () => this.nextMonth());

        this.container.querySelectorAll('.cal-days .cal-cell[data-date]').forEach(cell => {
            cell.addEventListener('click', () => this.toggleDate(cell.dataset.date));
        });

        this.container.querySelectorAll('.cal-best-make[data-date]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.createTripFromDate(btn.dataset.date);
            });
        });
    }

    // 用某个最佳日期创建一个新行程，并跳转到行程规划页
    async createTripFromDate(ds) {
        if (!window.tripRegistry) { alert('行程模块未加载，请刷新后重试'); return; }
        const title = prompt('行程名称：', '行程 ' + ds);
        if (title === null) return;
        try {
            const id = await window.tripRegistry.create((title || ('行程 ' + ds)).trim(), ds);
            window.tripRegistry.setCurrentId(id);
            window.location.href = 'itinerary-planning.html?trip=' + encodeURIComponent(id);
        } catch (e) {
            alert('创建失败：' + (e.message || e));
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedCalendar;
} else if (typeof window !== 'undefined') {
    window.SharedCalendar = SharedCalendar;
}
