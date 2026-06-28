// 行程切换器（多行程）
// 渲染到 #trip-switcher：下拉选择行程 + 新建 + 删除（默认行程不可删）。
// 依赖：window.tripRegistry（列出/新建/删除）、window.firestoreStore.switchTrip（切换并刷新）。
(function () {
    'use strict';

    let mounted = false;

    function el() { return document.getElementById('trip-switcher'); }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    async function render() {
        const c = el();
        const reg = window.tripRegistry;
        if (!c || !reg) return;

        const current = reg.getCurrentId();
        let trips = [];
        try { trips = await reg.list(); } catch (e) {}
        // 保证当前行程一定在列表里（即使元数据文档尚未建立）
        if (!trips.find(t => t.id === current)) {
            trips.unshift({ id: current, title: current === reg.DEFAULT_ID ? '我的行程' : current });
        }

        const opts = trips.map(t => {
            const label = escapeHtml(t.title) + (t.startDate ? (' · ' + t.startDate) : '');
            return `<option value="${escapeHtml(t.id)}" ${t.id === current ? 'selected' : ''}>${label}</option>`;
        }).join('');

        // 成员/加入状态（仅行中页：成员信息存于行程元数据）
        let memberHtml = '';
        const store = window.firestoreStore;
        const me = (window.getCurrentUser && window.getCurrentUser()) || null;
        if (store && store.getMembers) {
            const members = store.getMembers() || [];
            const joined = me && members.indexOf(me) > -1;
            memberHtml = `<span class="ts-members" title="成员：${members.length ? escapeHtml(members.join('、')) : '暂无'}">👥 ${members.length}</span>`
                + (joined
                    ? '<button class="ts-btn ts-leave" id="ts-leave" title="退出该行程">已加入 · 退出</button>'
                    : '<button class="ts-btn ts-join" id="ts-join" title="加入该行程后才能编辑">加入行程</button>');
        }

        c.innerHTML = `
            <span class="ts-label">📌 行程</span>
            <select class="ts-select" id="ts-select">${opts}</select>
            <button class="ts-btn ts-new" id="ts-new" title="新建行程">＋ 新建</button>
            ${current !== reg.DEFAULT_ID ? '<button class="ts-btn ts-del" id="ts-del" title="删除当前行程">🗑 删除</button>' : ''}
            ${memberHtml}
        `;

        const sel = c.querySelector('#ts-select');
        if (sel) sel.addEventListener('change', e => doSwitch(e.target.value));
        const nw = c.querySelector('#ts-new');
        if (nw) nw.addEventListener('click', onNew);
        const del = c.querySelector('#ts-del');
        if (del) del.addEventListener('click', onDelete);
        const joinBtn = c.querySelector('#ts-join');
        if (joinBtn) joinBtn.addEventListener('click', onJoin);
        const leaveBtn = c.querySelector('#ts-leave');
        if (leaveBtn) leaveBtn.addEventListener('click', onLeave);
    }

    async function onJoin() {
        if (!window.firestoreStore || !window.firestoreStore.joinTrip) return;
        try { await window.firestoreStore.joinTrip(); } catch (e) { alert('加入失败：' + (e.message || e)); }
        await render();
    }

    async function onLeave() {
        if (!window.firestoreStore || !window.firestoreStore.leaveTrip) return;
        if (!confirm('退出后将无法添加/编辑该行程内容，确定退出？')) return;
        try { await window.firestoreStore.leaveTrip(); } catch (e) { alert('退出失败：' + (e.message || e)); }
        await render();
    }

    // 同时驱动行中（firestoreStore）与行后（moduleStore）两套存储，
    // 各页只会存在其中一个，互不影响。
    async function applySwitch(id) {
        if (window.tripRegistry) window.tripRegistry.setCurrentId(id);
        const tasks = [];
        if (window.firestoreStore && window.firestoreStore.switchTrip) tasks.push(window.firestoreStore.switchTrip(id));
        if (window.moduleStore && window.moduleStore.switchTrip) tasks.push(window.moduleStore.switchTrip(id));
        if (!tasks.length) { location.reload(); return; }
        try { await Promise.all(tasks); } catch (e) { console.error(e); }
    }

    async function doSwitch(id) {
        if (!id || id === window.tripRegistry.getCurrentId()) return;
        await applySwitch(id);
        await render();
    }

    async function onNew() {
        const title = prompt('新行程名称：', '新行程');
        if (title === null) return;
        try {
            const id = await window.tripRegistry.create((title || '新行程').trim(), null);
            await applySwitch(id);
        } catch (e) {
            alert('创建失败：' + (e.message || e));
        }
        await render();
    }

    async function onDelete() {
        const reg = window.tripRegistry;
        const id = reg.getCurrentId();
        if (id === reg.DEFAULT_ID) return;
        if (!confirm('确定删除当前行程及其所有内容？此操作不可恢复。')) return;
        try {
            await reg.remove(id);
            await applySwitch(reg.DEFAULT_ID);
        } catch (e) {
            alert('删除失败：' + (e.message || e));
        }
        await render();
    }

    function init() {
        if (mounted || !el()) return;
        mounted = true;
        render();
    }

    window.addEventListener('firebaseReady', () => setTimeout(init, 300));
    if (document.readyState !== 'loading') setTimeout(init, 500);
    else document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    try { window.eventBus && window.eventBus.on && window.eventBus.on('trip:switched', render); } catch (e) {}

    window.tripSwitcher = { render, init };
})();
