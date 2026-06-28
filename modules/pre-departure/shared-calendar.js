/**
 * 共享日历 / 有空时间收集（双模式：选有空 / 选没空）
 * 规则：每个日期对每个人有三种状态——有空(free,绿)、没空(busy,红)、未标记(默认有空)。
 *   即「都不选则默认是有空时间」。聚合时：某人当天可用 = 没把这天标成 busy。
 * 顶部可切换录入模式：有空模式点格=标绿；没空模式点格=标红；再点一次取消(回到默认)。
 * 数据通过 moduleStore 持久化到 Firestore 并实时同步。
 *
 * 数据模型（moduleStore key: preDeparture_calendar）：
 *   { users: { [name]: { free: ['YYYY-MM-DD',...], busy: ['YYYY-MM-DD',...], _updatedAt } } }
 *   兼容旧数据：旧记录的 dates 视为 free。
 */
class SharedCalendar {
    constructor() {
        this.container = null;
        this.data = { users: {} };
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth(); // 0-11
        this.me = this.loadMe();
        this.mode = this.loadMode(); // 'free' | 'busy'
    }

    init(container) {
        this.container = container;
        this.scheduleContainer = document.getElementById('schedule-container');
        this.loadData();
        this.render();
        if (window.moduleStore) {
            window.moduleStore.subscribe('preDeparture_calendar', (data) => {
                this.data = this.normalize(data);
                this.render();
            });
        }
    }

    // ---------- 数据 ----------
    normalize(data) {
        const usersIn = (data && typeof data === 'object' && data.users && typeof data.users === 'object') ? data.users : {};
        const users = {};
        Object.keys(usersIn).forEach(name => {
            const r = usersIn[name] || {};
            const free = Array.isArray(r.free) ? r.free.slice() : (Array.isArray(r.dates) ? r.dates.slice() : []);
            const busy = Array.isArray(r.busy) ? r.busy.slice() : [];
            // 同一天不可既 free 又 busy：busy 优先
            const freeClean = free.filter(d => busy.indexOf(d) === -1);
            users[name] = { free: freeClean, busy, _updatedAt: r._updatedAt };
        });
        return { users };
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

    loadMode() {
        try { return localStorage.getItem('predep_cal_mode') === 'busy' ? 'busy' : 'free'; } catch (e) { return 'free'; }
    }
    setMode(mode) {
        this.mode = mode === 'busy' ? 'busy' : 'free';
        try { localStorage.setItem('predep_cal_mode', this.mode); } catch (e) {}
        this.render();
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
    recOf(user) {
        const u = this.data.users[user] || {};
        return { free: Array.isArray(u.free) ? u.free : [], busy: Array.isArray(u.busy) ? u.busy : [] };
    }
    meRec() {
        if (!this.data.users[this.me]) this.data.users[this.me] = { free: [], busy: [] };
        const r = this.data.users[this.me];
        if (!Array.isArray(r.free)) r.free = [];
        if (!Array.isArray(r.busy)) r.busy = [];
        return r;
    }

    // 某天可用 = 没把这天标成 busy（未标记=默认有空）
    isAvailable(user, ds) { return this.recOf(user).busy.indexOf(ds) === -1; }
    availableUsersFor(ds) { return this.getUsers().filter(u => this.isAvailable(u, ds)); }
    freeUsersFor(ds) { return this.getUsers().filter(u => this.recOf(u).free.indexOf(ds) > -1); }
    busyUsersFor(ds) { return this.getUsers().filter(u => this.recOf(u).busy.indexOf(ds) > -1); }

    toggleDate(ds) {
        const r = this.meRec();
        const rm = (arr, v) => { const i = arr.indexOf(v); if (i > -1) arr.splice(i, 1); };
        if (this.mode === 'busy') {
            rm(r.free, ds);
            if (r.busy.indexOf(ds) > -1) rm(r.busy, ds); else r.busy.push(ds);
        } else {
            rm(r.busy, ds);
            if (r.free.indexOf(ds) > -1) rm(r.free, ds); else r.free.push(ds);
        }
        r.free.sort(); r.busy.sort();
        r._updatedAt = new Date().toISOString();
        this.saveData();
        this.render();
    }

    prevMonth() { if (--this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; } this.render(); }
    nextMonth() { if (++this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; } this.render(); }

    // 固定的五个默认用户（作为时间表的列）
    defaultUsers() {
        if (window.AuthManager && Array.isArray(window.AuthManager.USERS) && window.AuthManager.USERS.length) {
            return window.AuthManager.USERS.slice();
        }
        return ['djy', 'xwz', 'mrb', 'hrz', 'zyt'];
    }

    // 从今天起的最近 N 天
    nextDays(n) {
        const out = [];
        const wk = ['日', '一', '二', '三', '四', '五', '六'];
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        for (let i = 0; i < n; i++) {
            const d = new Date(base.getTime() + i * 86400000);
            const dow = d.getDay();
            out.push({
                ds: this.dateStr(d.getFullYear(), d.getMonth(), d.getDate()),
                label: `${d.getMonth() + 1}/${d.getDate()} 周${wk[dow]}`,
                weekend: dow === 0 || dow === 6,
                today: i === 0
            });
        }
        return out;
    }

    // ---------- 渲染 ----------
    render() {
        if (!this.container) return;
        const y = this.viewYear, m = this.viewMonth;
        const totalUsers = this.getUsers().length;
        const startWeekday = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const now = new Date();
        const todayStr = this.dateStr(now.getFullYear(), now.getMonth(), now.getDate());
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

        let cells = '';
        for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell cal-empty"></div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = this.dateStr(y, m, d);
            const freeWho = this.freeUsersFor(ds);
            const busyWho = this.busyUsersFor(ds);
            const freeN = freeWho.length;
            const busyN = busyWho.length;
            const myFree = freeWho.includes(this.me);
            const myBusy = busyWho.includes(this.me);

            const cls = ['cal-cell'];
            let style = '';
            if (busyN > 0) {
                cls.push('cal-busy');
                style = ` style="--lvl:${(totalUsers ? busyN / totalUsers : 0).toFixed(2)}"`;
            } else if (freeN > 0) {
                cls.push('cal-free');
                style = ` style="--lvl:${(totalUsers ? freeN / totalUsers : 0).toFixed(2)}"`;
            }
            if (myFree) cls.push('cal-mine-free');
            if (myBusy) cls.push('cal-mine-busy');
            if (ds === todayStr) cls.push('cal-today');

            const tip = [];
            if (freeN) tip.push('有空：' + freeWho.join('、'));
            if (busyN) tip.push('没空：' + busyWho.join('、'));
            const titleAttr = ` title="${this.escape(tip.join('  |  ') || '未标记（默认有空）')}"`;

            cells += `<div class="${cls.join(' ')}" data-date="${ds}"${style}${titleAttr}>` +
                `<span class="cal-num">${d}</span>` +
                (freeN ? `<span class="cal-count cal-count-free">${freeN}</span>` : '') +
                (busyN ? `<span class="cal-count cal-count-busy">${busyN}</span>` : '') +
                '</div>';
        }

        const isBusyMode = this.mode === 'busy';

        this.container.innerHTML = `
            <div class="cal-toolbar">
                <span class="cal-me">我是：<strong class="cal-me-name">${this.escape(this.me)}</strong></span>
                <div class="cal-mode-bar" role="group" aria-label="录入模式">
                    <button class="cal-mode-btn ${isBusyMode ? '' : 'active'}" data-mode="free" type="button">✅ 选有空</button>
                    <button class="cal-mode-btn ${isBusyMode ? 'active' : ''}" data-mode="busy" type="button">🚫 选没空</button>
                </div>
            </div>
            <div class="cal-legend">
                <span class="cal-lg cal-lg-free">绿=有空</span>
                <span class="cal-lg cal-lg-busy">红=没空</span>
                <span class="cal-lg cal-lg-default">未标记=默认有空</span>
                <span class="cal-hint">当前：${isBusyMode ? '点格标「没空」' : '点格标「有空」'}（再点取消）</span>
            </div>
            <div class="cal-monthbar">
                <button class="cal-nav" id="cal-prev" title="上个月">‹</button>
                <span class="cal-title">${y} 年 ${m + 1} 月</span>
                <button class="cal-nav" id="cal-next" title="下个月">›</button>
            </div>
            <div class="cal-grid cal-weekdays">${weekdays.map(w => `<div class="cal-wd">${w}</div>`).join('')}</div>
            <div class="cal-grid cal-days">${cells}</div>
        `;

        this.attachEvents();
        this.renderSchedule();
    }

    // 最近 30 天时间表：行=日期，列=五个默认用户，最后一列可点击「添加行程」
    renderSchedule() {
        if (!this.scheduleContainer) return;
        const users = this.defaultUsers();
        const days = this.nextDays(30);

        const head = '<tr>' +
            '<th class="sch-date">日期</th>' +
            users.map(u => `<th class="sch-uhead" title="${this.escape(u)}">${this.escape(u)}</th>`).join('') +
            '<th class="sch-act">添加</th>' +
            '</tr>';

        const body = days.map(day => {
            const cellsHtml = users.map(u => {
                const r = this.recOf(u);
                let cls = 'sch-cell', sym = '·', t = '默认有空';
                if (r.busy.indexOf(day.ds) > -1) { cls += ' sch-busy'; sym = '✕'; t = '没空'; }
                else if (r.free.indexOf(day.ds) > -1) { cls += ' sch-free'; sym = '✓'; t = '有空'; }
                else { cls += ' sch-default'; }
                return `<td class="${cls}" title="${this.escape(u + '：' + t)}">${sym}</td>`;
            }).join('');
            const avail = this.availableUsersFor(day.ds).length;
            const rowCls = 'sch-row' + (day.today ? ' sch-today' : '') + (day.weekend ? ' sch-weekend' : '');
            return `<tr class="${rowCls}">` +
                `<td class="sch-date"><span class="sch-d">${day.label}</span><span class="sch-avail" title="可用人数">${avail}/${users.length}</span></td>` +
                cellsHtml +
                `<td class="sch-act"><button class="sch-add" data-date="${day.ds}" title="用这天创建行程">＋ 行程</button></td>` +
                '</tr>';
        }).join('');

        this.scheduleContainer.innerHTML =
            `<div class="sch-legend">
                <span class="cal-lg cal-lg-free">✓ 有空</span>
                <span class="cal-lg cal-lg-busy">✕ 没空</span>
                <span class="cal-lg cal-lg-default">· 默认有空</span>
             </div>
             <div class="sch-wrap"><table class="sch-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;

        this.scheduleContainer.querySelectorAll('.sch-add[data-date]').forEach(btn => {
            btn.addEventListener('click', () => this.createTripFromDate(btn.dataset.date));
        });
    }

    attachEvents() {
        const prev = this.container.querySelector('#cal-prev');
        if (prev) prev.addEventListener('click', () => this.prevMonth());
        const next = this.container.querySelector('#cal-next');
        if (next) next.addEventListener('click', () => this.nextMonth());

        this.container.querySelectorAll('.cal-mode-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });

        this.container.querySelectorAll('.cal-days .cal-cell[data-date]').forEach(cell => {
            cell.addEventListener('click', () => this.toggleDate(cell.dataset.date));
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
