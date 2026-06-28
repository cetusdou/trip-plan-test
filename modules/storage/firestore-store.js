// Firestore 存储层（按天一个文档）+ 内存缓存 + 实时监听
// 数据模型：
//   trips/{TRIP_ID}                     { title, overview[], order, _version }
//   trips/{TRIP_ID}/days/{dayId}        { id, title, order, items:{itemId:{...}}, _updatedAt }
//   trips/{TRIP_ID}/backup/{key}        { ...备份条目 }
//
// 为最大化复用既有重型模块（card-slider/data-manager/like-handler/expense-manager），
// 本文件对外暴露与旧实现同名的 window.tripDataStructure 与 window.dataSyncFirebase。
// 读取走内存缓存（同步），写入按“天”整体回写 Firestore（异步）。

(function () {
    'use strict';

    // 当前行程 id（多行程）：来自 trip-registry（URL ?trip= > localStorage > 'shared'）
    function CTID() {
        return (window.tripRegistry && window.tripRegistry.getCurrentId)
            ? window.tripRegistry.getCurrentId()
            : 'shared';
    }
    const DATA_STRUCTURE_VERSION = 2;

    // ============ 通用工具（取自旧 trip-data-structure.js） ============
    function generateItemId(dayId, index) {
        return `${dayId}_item_${index}_${Date.now()}`;
    }

    function objectToArray(obj, sortKey = 'order') {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return Array.isArray(obj) ? obj : [];
        }
        return Object.values(obj).sort((a, b) => {
            if (sortKey && a[sortKey] !== undefined && b[sortKey] !== undefined) {
                return (a[sortKey] || 0) - (b[sortKey] || 0);
            }
            return 0;
        });
    }

    function normalizePlan(plan) {
        if (!plan) return {};
        if (typeof plan === 'string') {
            const key = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            return { [key]: { _text: plan, _hash: null, _timestamp: Date.now(), _user: null } };
        }
        if (Array.isArray(plan)) {
            const planObj = {};
            plan.forEach((p, index) => {
                if (typeof p === 'string') {
                    const key = Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 9);
                    planObj[key] = { _text: p, _hash: null, _timestamp: Date.now(), _user: null };
                } else if (p && typeof p === 'object' && p._hash) {
                    planObj[p._hash] = p;
                } else if (p && typeof p === 'object') {
                    const key = Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 9);
                    planObj[key] = { ...p, _hash: p._hash || key, _timestamp: p._timestamp || Date.now(), _user: p._user || null };
                }
            });
            return planObj;
        }
        if (typeof plan === 'object') {
            const normalized = {};
            Object.keys(plan).forEach(key => {
                const item = plan[key];
                if (!item) return;
                if (typeof item === 'string') {
                    normalized[key] = { _text: item, _hash: key, _timestamp: Date.now(), _user: null };
                } else if (typeof item === 'object') {
                    normalized[key] = { ...item, _hash: item._hash || key, _timestamp: item._timestamp || Date.now(), _user: item._user || null };
                }
            });
            return normalized;
        }
        return {};
    }

    function normalizeComments(comments) {
        if (!comments) return {};
        if (Array.isArray(comments)) {
            const obj = {};
            comments.forEach(comment => {
                if (comment && comment._hash) obj[comment._hash] = comment;
                else if (comment) {
                    const hash = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    obj[hash] = { ...comment, _hash: hash };
                }
            });
            return obj;
        }
        if (typeof comments === 'object') return comments;
        return {};
    }

    function normalizeImages(images) {
        if (!images) return {};
        if (Array.isArray(images)) {
            const obj = {};
            images.forEach((image, index) => {
                if (!image) return;
                const key = typeof image === 'string'
                    ? index.toString()
                    : (image.url ? image.url.split('/').pop().replace(/[.#$/\[\]]/g, '_') : index.toString());
                obj[key] = typeof image === 'string' ? { url: image } : image;
            });
            return obj;
        }
        if (typeof images === 'object') return images;
        return {};
    }

    // 统一上报写入/读取错误：控制台 + 顶部同步状态条，避免静默失败难以排查
    function reportError(scope, e) {
        const msg = (e && (e.code || e.message)) ? `${e.code || ''} ${e.message || ''}`.trim() : String(e);
        console.error(`[firestore-store] ${scope} 失败:`, e);
        try {
            if (typeof window.updateSyncStatus === 'function') {
                let hint = msg;
                if (/permission-denied|insufficient permissions/i.test(msg)) {
                    hint = '写入被拒绝（Firestore 规则未放开）：' + msg;
                }
                window.updateSyncStatus('保存失败：' + hint, 'error');
            }
        } catch (_) {}
    }

    function getCurrentUser() {
        if (window.fb && window.fb.auth && window.fb.auth.currentUser) {
            return emailToUsername(window.fb.auth.currentUser.email);
        }
        return (typeof localStorage !== 'undefined' && localStorage.getItem('trip_current_user')) || null;
    }

    function emailToUsername(email) {
        if (!email) return null;
        return email.split('@')[0];
    }

    // ============ Firestore Store ============
    class FirestoreStore {
        constructor() {
            this.cache = null;           // 统一数据结构（内存）
            this.ready = false;          // Firebase SDK 就绪
            this.hydrated = false;       // 首次加载完成
            this.databaseRef = { __firestore: true }; // 兼容旧 update(ref, ...) 调用
            this.unsubDays = null;
            this.unsubTrip = null;
            this._refreshCb = null;
        }

        async waitForFirebase() {
            if (window.fb && window.fb.db) { this.ready = true; return true; }
            return new Promise(resolve => {
                window.addEventListener('firebaseReady', () => { this.ready = true; resolve(true); }, { once: true });
                setTimeout(() => resolve(!!(window.fb && window.fb.db)), 8000);
            });
        }

        isConfigured() {
            return this.ready && !!(window.fb && window.fb.db);
        }

        tripRef() {
            const { db, doc } = window.fb;
            return doc(db, 'trips', CTID());
        }
        daysCol() {
            const { db, collection } = window.fb;
            return collection(db, 'trips', CTID(), 'days');
        }
        dayRef(dayId) {
            const { db, doc } = window.fb;
            return doc(db, 'trips', CTID(), 'days', String(dayId));
        }
        backupCol() {
            const { db, collection } = window.fb;
            return collection(db, 'trips', CTID(), 'backup');
        }
        backupRef(key) {
            const { db, doc } = window.fb;
            return doc(db, 'trips', CTID(), 'backup', String(key));
        }

        emptyCache() {
            return {
                id: CTID(),
                title: '',
                overview: [],
                members: [],
                days: {},
                _backup: {},
                _version: DATA_STRUCTURE_VERSION
            };
        }

        // 首次全量加载 + 建立实时监听
        async hydrate() {
            await this.waitForFirebase();
            if (!this.isConfigured()) return { success: false, message: 'Firestore 未就绪' };

            const { getDoc, getDocs } = window.fb;
            const cache = this.emptyCache();

            try {
                const tripSnap = await getDoc(this.tripRef());
                if (tripSnap.exists()) {
                    const meta = tripSnap.data();
                    cache.title = meta.title || '';
                    cache.overview = meta.overview || [];
                    cache.members = Array.isArray(meta.members) ? meta.members : [];
                    cache._version = meta._version || DATA_STRUCTURE_VERSION;
                }

                const daysSnap = await getDocs(this.daysCol());
                daysSnap.forEach(d => {
                    const day = d.data() || {};
                    if (!day.items || typeof day.items !== 'object') day.items = {};
                    day.id = day.id || d.id;
                    cache.days[d.id] = day;
                });

                const backupSnap = await getDocs(this.backupCol());
                backupSnap.forEach(b => { cache._backup[b.id] = b.data(); });

                cache.overview = this.buildOverview(cache.days);
                this.cache = cache;
                this.hydrated = true;

                this.pushToState();
                this.startRealtimeSync(this._refreshCb);
                try { window.eventBus && window.eventBus.emit && window.eventBus.emit('trip:hydrated', { tripId: CTID() }); } catch (e) {}
                try { window.tripSwitcher && window.tripSwitcher.render && window.tripSwitcher.render(); } catch (e) {}
                return { success: true, message: '已从 Firestore 加载', data: cache };
            } catch (e) {
                this.cache = this.cache || cache;
                return { success: false, message: '加载失败: ' + (e.message || e) };
            }
        }

        buildOverview(daysObj) {
            return Object.values(daysObj || {})
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(day => day.title || '');
        }

        pushToState() {
            if (window.stateManager && this.cache) {
                window.stateManager.setState({ tripData: this.cache, unifiedData: this.cache });
            }
        }

        refreshUI() {
            try {
                if (window.UIRenderer) {
                    window.UIRenderer.renderOverview && window.UIRenderer.renderOverview();
                    window.UIRenderer.renderNavigation && window.UIRenderer.renderNavigation();
                    const dayId = window.stateManager ? window.stateManager.getState('currentDayId') : (window.currentDayId || null);
                    if (dayId && window.UIRenderer.renderDay) window.UIRenderer.renderDay(dayId);
                }
                if (typeof window.showDay === 'function' && window.currentDayId) {
                    window.showDay(window.currentDayId);
                }
            } catch (e) { /* 渲染失败不阻塞 */ }
        }

        // 实时监听：天集合 + trip 元数据
        startRealtimeSync(callback) {
            if (!this.isConfigured()) return { success: false };
            this._refreshCb = callback || this._refreshCb;
            const { onSnapshot } = window.fb;
            this.stopRealtimeSync();

            this.unsubDays = onSnapshot(this.daysCol(), snap => {
                if (!this.cache) this.cache = this.emptyCache();
                snap.docChanges().forEach(change => {
                    const id = change.doc.id;
                    if (change.type === 'removed') {
                        delete this.cache.days[id];
                    } else {
                        const day = change.doc.data() || {};
                        if (!day.items || typeof day.items !== 'object') day.items = {};
                        day.id = day.id || id;
                        this.cache.days[id] = day;
                    }
                });
                this.cache.overview = this.buildOverview(this.cache.days);
                this.pushToState();
                // 避免打断正在输入的用户
                if (!this.hasActiveInputs()) {
                    this.refreshUI();
                    if (this._refreshCb) this._refreshCb(this.cache);
                }
            }, () => {});

            this.unsubTrip = onSnapshot(this.tripRef(), snap => {
                if (snap.exists() && this.cache) {
                    const meta = snap.data();
                    this.cache.title = meta.title || this.cache.title;
                    if (Array.isArray(meta.members)) this.cache.members = meta.members;
                    this.pushToState();
                    if (!this.hasActiveInputs()) this.refreshUI();
                }
            }, () => {});

            return { success: true };
        }

        stopRealtimeSync() {
            if (this.unsubDays) { this.unsubDays(); this.unsubDays = null; }
            if (this.unsubTrip) { this.unsubTrip(); this.unsubTrip = null; }
        }

        // 切换到另一个行程：停止监听 → 重置缓存 → 重新加载（hydrate 会重建监听）→ 刷新 UI
        async switchTrip(tripId) {
            if (!tripId) return { success: false };
            if (window.tripRegistry) window.tripRegistry.setCurrentId(tripId);
            this.stopRealtimeSync();
            this.cache = null;
            this.hydrated = false;
            const res = await this.hydrate();
            // 选中新行程的第一天，避免沿用上一个行程的 currentDayId
            try {
                const days = this.cache ? Object.values(this.cache.days || {}) : [];
                days.sort((a, b) => (a.order || 0) - (b.order || 0));
                const firstId = days.length ? (days[0].id || days[0].dayId) : null;
                if (window.stateManager) window.stateManager.setState({ currentDayId: firstId });
                window.currentDayId = firstId;
            } catch (e) {}
            this.refreshUI();
            if (this._refreshCb) this._refreshCb(this.cache);
            try { window.eventBus && window.eventBus.emit && window.eventBus.emit('trip:switched', { tripId }); } catch (e) {}
            return res;
        }

        // ---------- 成员（加入/退出当前行程）----------
        getMembers() {
            return (this.cache && Array.isArray(this.cache.members)) ? this.cache.members : [];
        }
        isMember(user) {
            if (!user) return false;
            return this.getMembers().indexOf(user) > -1;
        }
        async setMembers(members) {
            await this.waitForFirebase();
            if (!this.isConfigured()) return { success: false };
            const { getDoc, setDoc } = window.fb;
            try {
                // 以云端为准做读改写，避免覆盖他人并发加入
                let current = [];
                const snap = await getDoc(this.tripRef());
                if (snap.exists() && Array.isArray(snap.data().members)) current = snap.data().members.slice();
                // members 为期望的最终集合的“增量意图”，这里直接采用传入结果
                const finalMembers = members;
                await setDoc(this.tripRef(), { members: finalMembers, _updatedAt: new Date().toISOString() }, { merge: true });
                if (this.cache) this.cache.members = finalMembers;
                this.pushToState();
                this.refreshUI();
                return { success: true };
            } catch (e) {
                reportError('setMembers', e);
                return { success: false, message: e.message || String(e) };
            }
        }
        async joinTrip(user) {
            const me = user || getCurrentUser();
            if (!me) return { success: false, message: '未登录' };
            await this.waitForFirebase();
            const { getDoc } = window.fb;
            let members = [];
            try {
                const snap = await getDoc(this.tripRef());
                if (snap.exists() && Array.isArray(snap.data().members)) members = snap.data().members.slice();
            } catch (e) {}
            if (members.indexOf(me) === -1) members.push(me);
            return this.setMembers(members);
        }
        async leaveTrip(user) {
            const me = user || getCurrentUser();
            if (!me) return { success: false };
            await this.waitForFirebase();
            const { getDoc } = window.fb;
            let members = [];
            try {
                const snap = await getDoc(this.tripRef());
                if (snap.exists() && Array.isArray(snap.data().members)) members = snap.data().members.slice();
            } catch (e) {}
            members = members.filter(m => m !== me);
            return this.setMembers(members);
        }

        hasActiveInputs() {
            try {
                const active = document.querySelectorAll(
                    '.card-time-input:focus, .card-category-input:focus, .note-input:focus, .plan-input:focus, ' +
                    '.card-time-input[style*="inline-block"], .card-category-input[style*="inline-block"], ' +
                    '.plan-input-container[style*="block"]'
                );
                return active.length > 0;
            } catch (e) { return false; }
        }

        // ============ 持久化（按天整体回写，简单且稳健） ============
        async persistDay(dayId) {
            if (!this.isConfigured() || !this.cache) {
                reportError('persistDay', new Error('Firestore 未就绪，无法保存（请检查网络/Firebase 初始化）'));
                return;
            }
            const day = this.cache.days[dayId];
            const { setDoc, deleteDoc } = window.fb;
            if (!day) {
                try { await deleteDoc(this.dayRef(dayId)); } catch (e) { reportError('persistDay(delete)', e); }
                return;
            }
            const payload = { ...day, id: day.id || dayId, _updatedAt: new Date().toISOString(), _syncUser: getCurrentUser() || 'unknown' };
            if (!payload.items || typeof payload.items !== 'object') payload.items = {};
            try {
                await setDoc(this.dayRef(dayId), payload);
                if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('已保存', 'success');
            } catch (e) { reportError('persistDay', e); }
        }

        async persistTripMeta() {
            if (!this.isConfigured() || !this.cache) return;
            const { setDoc } = window.fb;
            try {
                await setDoc(this.tripRef(), {
                    title: this.cache.title || '',
                    overview: this.cache.overview || [],
                    _version: this.cache._version || DATA_STRUCTURE_VERSION,
                    _lastSync: new Date().toISOString(),
                    _syncUser: getCurrentUser() || 'unknown'
                }, { merge: true });
            } catch (e) { reportError('persistTripMeta', e); }
        }

        async persistBackup(key, entry) {
            if (!this.isConfigured()) return;
            const { setDoc } = window.fb;
            try { await setDoc(this.backupRef(key), entry); } catch (e) { reportError('persistBackup', e); }
        }

        async persistBackupDelete(key) {
            if (!this.isConfigured()) return;
            const { deleteDoc } = window.fb;
            try { await deleteDoc(this.backupRef(key)); } catch (e) { reportError('persistBackupDelete', e); }
        }
    }

    const store = new FirestoreStore();

    // ============ window.tripDataStructure 兼容层 ============
    function loadUnifiedData() {
        return store.cache;
    }

    function saveUnifiedData(data) {
        // 仅同步内存缓存与 stateManager；实际持久化由 dataSyncFirebase.* 显式触发
        if (data && typeof data === 'object') {
            store.cache = data;
            store.pushToState();
        }
        return true;
    }

    function getDayData(unifiedData, dayId) {
        const data = unifiedData || store.cache;
        if (!data || !data.days || typeof data.days !== 'object') return null;
        let targetId = null;
        if (typeof dayId === 'string') targetId = dayId;
        else if (dayId && typeof dayId === 'object' && dayId.id) targetId = String(dayId.id);
        else if (dayId !== null && dayId !== undefined) targetId = String(dayId);
        else return null;
        return data.days[targetId] || null;
    }

    function getItemData(unifiedData, dayId, itemId) {
        const day = getDayData(unifiedData, dayId);
        if (!day || !day.items || typeof day.items !== 'object') return null;
        const targetItemId = (typeof itemId === 'object' && itemId && itemId.id) ? String(itemId.id) : String(itemId);
        return day.items[targetItemId] || null;
    }

    function addItemData(unifiedData, dayId, itemData) {
        const data = unifiedData || store.cache;
        const day = getDayData(data, dayId);
        if (!day) return false;
        if (!day.items || typeof day.items !== 'object') day.items = {};
        const itemCount = Object.keys(day.items).length;
        const newItemId = generateItemId(dayId, itemCount);
        const newItem = {
            id: newItemId,
            category: itemData.category || '',
            time: itemData.time || '',
            tag: itemData.tag || '其他',
            plan: normalizePlan(itemData.plan || []),
            note: itemData.note || '',
            rating: itemData.rating || '',
            images: normalizeImages(itemData.images || []),
            comments: normalizeComments(itemData.comments || []),
            spend: itemData.spend || null,
            order: itemCount,
            isCustom: true,
            _createdBy: getCurrentUser() || 'unknown',
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString()
        };
        day.items[newItemId] = newItem;
        saveUnifiedData(data);
        store.persistDay(dayId);
        return newItem;
    }

    function createBackupEntry(unifiedData, type, deletedData, metadata) {
        const data = unifiedData || store.cache;
        if (!data || typeof data !== 'object') return { success: false };
        if (!data._backup || typeof data._backup !== 'object') data._backup = {};
        const timestamp = new Date().toISOString();
        const timestampKey = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const currentUser = getCurrentUser();
        let backupEntry = {
            _type: type,
            _deletedAt: timestamp,
            _deletedBy: currentUser,
            _dayId: metadata.dayId || null,
            _itemId: metadata.itemId || null,
            _originalItemId: metadata.itemId || null
        };
        switch (type) {
            case 'item':
                backupEntry = { ...deletedData, ...backupEntry, _deletedFromDay: metadata.dayId || null };
                break;
            case 'day':
                backupEntry = { ...backupEntry, _day: deletedData, _deletedFromDay: metadata.dayId || null };
                break;
            case 'plan_item':
                backupEntry._planItem = deletedData;
                backupEntry._planHash = metadata.hash || null;
                break;
            case 'comment':
                backupEntry._comment = deletedData;
                backupEntry._commentHash = metadata.hash || null;
                backupEntry._commentIndex = metadata.index !== undefined ? metadata.index : null;
                break;
            default:
                backupEntry._data = deletedData;
                if (metadata.hash) backupEntry._hash = metadata.hash;
                if (metadata.index !== undefined) backupEntry._index = metadata.index;
        }
        data._backup[timestampKey] = backupEntry;
        saveUnifiedData(data);
        store.persistBackup(timestampKey, backupEntry);
        return { success: true, timestampKey, backupEntry };
    }

    function deleteItemData(unifiedData, dayId, itemId) {
        const data = unifiedData || store.cache;
        const day = getDayData(data, dayId);
        if (!day || !day.items) return false;
        const targetItemId = String(itemId);
        const deletedItem = day.items[targetItemId];
        if (!deletedItem) return false;
        // 权限：必须是该行程成员；只能删除自己添加的项（无归属的旧数据允许成员删除）
        const me = getCurrentUser();
        if (!store.isMember(me)) return { success: false, reason: 'not_member' };
        const owner = deletedItem._createdBy || deletedItem._user;
        if (owner && owner !== me) return { success: false, reason: 'not_owner' };
        const itemToBackup = JSON.parse(JSON.stringify(deletedItem));
        const backupResult = createBackupEntry(data, 'item', itemToBackup, { dayId, itemId: targetItemId });
        if (!backupResult.success) return false;
        delete day.items[targetItemId];
        Object.values(day.items).forEach((item, index) => { if (item) item.order = index; });
        saveUnifiedData(data);
        store.persistDay(dayId);
        return { success: true, timestampKey: backupResult.timestampKey, backupEntry: backupResult.backupEntry };
    }

    function addDayData(unifiedData, dayTitle = '') {
        const data = unifiedData || store.cache;
        if (!data || !data.days || typeof data.days !== 'object') return null;
        const dayCount = Object.keys(data.days).length;
        const newDayId = `day${dayCount + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newDay = { id: newDayId, title: dayTitle || `第${dayCount + 1}天`, items: {}, order: dayCount };
        data.days[newDayId] = newDay;
        data.overview = store.buildOverview(data.days);
        saveUnifiedData(data);
        store.persistDay(newDayId);
        store.persistTripMeta();
        return newDay;
    }

    function deleteDayData(unifiedData, dayId) {
        const data = unifiedData || store.cache;
        if (!data || !data.days || typeof data.days !== 'object') return false;
        const dayToDelete = data.days[dayId];
        if (!dayToDelete) return false;
        const dayToBackup = JSON.parse(JSON.stringify(dayToDelete));
        const backupResult = createBackupEntry(data, 'day', dayToBackup, { dayId });
        if (!backupResult.success) return false;
        delete data.days[dayId];
        Object.values(data.days).forEach((day, index) => { if (day) day.order = index; });
        data.overview = store.buildOverview(data.days);
        saveUnifiedData(data);
        store.persistDay(dayId); // day 已不在 cache → 触发删除文档
        store.persistTripMeta();
        return true;
    }

    function restoreItemFromBackup(unifiedData, backupKey, targetDayId = null) {
        const data = unifiedData || store.cache;
        if (!data || !data._backup) return false;
        const backupEntry = data._backup[backupKey];
        if (!backupEntry) return false;
        const dayId = targetDayId || backupEntry._deletedFromDay;
        if (!dayId) return false;
        const day = getDayData(data, dayId);
        if (!day) return false;
        const restoredItem = { ...backupEntry };
        ['_deletedAt', '_deletedBy', '_deletedFromDay', '_originalItemId', '_type', '_dayId', '_itemId'].forEach(k => delete restoredItem[k]);
        restoredItem._restoredAt = new Date().toISOString();
        restoredItem._restoredBy = getCurrentUser();
        if (!day.items || typeof day.items !== 'object') day.items = {};
        const restoredItemId = restoredItem.id || backupEntry._originalItemId || generateItemId(dayId, Object.keys(day.items).length);
        restoredItem.id = restoredItemId;
        restoredItem.order = Object.keys(day.items).length;
        day.items[restoredItemId] = restoredItem;
        delete data._backup[backupKey];
        saveUnifiedData(data);
        store.persistDay(dayId);
        store.persistBackupDelete(backupKey);
        return true;
    }

    function getBackupData(unifiedData) {
        const data = unifiedData || store.cache;
        return (data && data._backup) ? data._backup : {};
    }

    function clearBackupData(unifiedData) {
        const data = unifiedData || store.cache;
        if (!data) return false;
        const keys = Object.keys(data._backup || {});
        data._backup = {};
        saveUnifiedData(data);
        keys.forEach(k => store.persistBackupDelete(k));
        return true;
    }

    function getUnifiedDataSize() {
        try { return new Blob([JSON.stringify(store.cache || {})]).size / (1024 * 1024); } catch (e) { return 0; }
    }

    function updateItemData(unifiedData, dayId, itemId, updates) {
        const item = getItemData(unifiedData, dayId, itemId);
        if (!item) return false;
        Object.assign(item, updates);
        item._updatedAt = new Date().toISOString();
        saveUnifiedData(unifiedData || store.cache);
        store.persistDay(dayId);
        return true;
    }

    function initializeTripDataStructure(originalData) {
        // 兼容旧导入流程：把原始数据写入 Firestore（按天）
        const daysObj = {};
        (originalData.days || []).forEach((day, dayIndex) => {
            const dayId = day.id || `day${dayIndex + 1}`;
            const itemsObj = {};
            (day.items || []).forEach((item, itemIndex) => {
                const itemId = generateItemId(dayId, itemIndex);
                itemsObj[itemId] = {
                    id: itemId,
                    category: item.category || '', time: item.time || '', tag: item.tag || '其他',
                    plan: normalizePlan(item.plan || []), note: item.note || '', rating: item.rating || '',
                    images: normalizeImages(item.images || []), comments: normalizeComments(item.comments || []),
                    spend: item.spend || null, order: itemIndex,
                    _createdAt: new Date().toISOString(), _updatedAt: new Date().toISOString()
                };
            });
            daysObj[dayId] = { id: dayId, title: day.title || '', items: itemsObj, order: dayIndex };
        });
        const structure = {
            id: CTID(), title: originalData.title || '', overview: store.buildOverview(daysObj),
            days: daysObj, _backup: {}, _version: DATA_STRUCTURE_VERSION
        };
        store.cache = structure;
        saveUnifiedData(structure);
        store.persistTripMeta();
        Object.keys(daysObj).forEach(dayId => store.persistDay(dayId));
        return structure;
    }

    function updateExistingExpensesWithParticipants() {
        const data = store.cache;
        if (!data || !data.days) return;
        let updated = false;
        objectToArray(data.days).forEach(day => {
            if (!day || !day.items) return;
            objectToArray(day.items).forEach(item => {
                if (!item || !item.spend || !Array.isArray(item.spend)) return;
                item.spend.forEach(s => { if (s && !s.participants) { s.participants = ['mrb', 'djy']; updated = true; } });
            });
        });
        if (updated) saveUnifiedData(data);
    }

    window.tripDataStructure = {
        initializeTripDataStructure,
        saveUnifiedData,
        loadUnifiedData,
        loadTripData: loadUnifiedData,
        getDayData,
        getItemData,
        updateItemData,
        addItemData,
        deleteItemData,
        restoreItemFromBackup,
        getBackupData,
        clearBackupData,
        normalizePlan,
        normalizeComments,
        normalizeImages,
        objectToArray,
        getUnifiedDataSize,
        createBackupEntry,
        updateExistingExpensesWithParticipants,
        addDayData,
        deleteDayData,
        DATA_STRUCTURE_VERSION
    };

    // ============ window.dataSyncFirebase 兼容层 ============
    // 把旧的 RTDB 扁平路径更新归约为“重写受影响的天文档 / 备份文档”。
    function parseDayIdFromPath(path) {
        // 支持： trip_unified_data/days/<dayId>/items/...  或  days/<dayId>/...
        const m = String(path).match(/days\/([^/]+)/);
        return m ? m[1] : null;
    }

    function applyFlatUpdates(updates) {
        const dayIds = new Set();
        Object.keys(updates || {}).forEach(path => {
            const value = updates[path];
            if (path === '_lastSync' || path === '_syncUser') return;
            // 整树上传：'trip_unified_data' = 完整统一数据 → 覆盖缓存并整体回写
            if (path === 'trip_unified_data') {
                if (value && typeof value === 'object') {
                    store.cache = value;
                    store.pushToState();
                    store.persistTripMeta();
                    Object.keys(value.days || {}).forEach(id => store.persistDay(id));
                }
                return;
            }
            // 备份路径
            const backupMatch = path.match(/(?:^|\/)_backup\/([^/]+)$/);
            if (backupMatch) {
                const key = backupMatch[1];
                if (value === null) store.persistBackupDelete(key);
                else store.persistBackup(key, value);
                return;
            }
            if (path === '_backup') {
                if (value && typeof value === 'object') {
                    Object.keys(value).forEach(k => store.persistBackup(k, value[k]));
                }
                return;
            }
            const dayId = parseDayIdFromPath(path);
            if (dayId) dayIds.add(dayId);
        });
        // cache 已被调用方更新，按天整体回写
        dayIds.forEach(dayId => store.persistDay(dayId));
    }

    const dataSyncFirebase = {
        databaseRef: store.databaseRef,
        isConfigured: () => store.isConfigured(),
        getDayIndex: (dayId) => dayId,
        getItemIndex: (dayId, itemId) => itemId,

        // 旧式：update(ref, updates)
        update: async (_ref, updates) => {
            try { applyFlatUpdates(updates); return { success: true }; }
            catch (e) { return { success: false, message: e.message }; }
        },

        // 上传单个卡片 → 重写该天文档
        uploadItem: async (dayId, itemId) => {
            try {
                const item = getItemData(store.cache, dayId, itemId);
                if (!item) { await store.persistDay(dayId); return { success: true, message: `已删除卡片 ${itemId}` }; }
                await store.persistDay(dayId);
                return { success: true, message: `已更新卡片 ${itemId}` };
            } catch (e) { return { success: false, message: e.message }; }
        },

        // 增量更新 → 解析天 → 重写该天文档
        cloudIncrementalUpdate: async (subPath, dataObj /*, autoMetadata */) => {
            try {
                const dayId = parseDayIdFromPath(subPath);
                if (dayId) {
                    // 若调用方传入 items 数组（重排序），先写回 cache 的 items map 顺序
                    if (dataObj && dataObj.items) {
                        const day = store.cache && store.cache.days[dayId];
                        if (day) {
                            if (Array.isArray(dataObj.items)) {
                                const map = {};
                                dataObj.items.forEach((it, idx) => { if (it && it.id) { it.order = idx; map[it.id] = it; } });
                                day.items = map;
                            } else if (typeof dataObj.items === 'object') {
                                day.items = dataObj.items;
                            }
                        }
                    }
                    await store.persistDay(dayId);
                }
                return { success: true, message: `增量更新成功: ${subPath}` };
            } catch (e) { return { success: false, message: e.message }; }
        },

        updateItemField: async (dayId, itemId, field, value) => {
            const item = getItemData(store.cache, dayId, itemId);
            if (item) { item[field] = value; item._updatedAt = new Date().toISOString(); }
            await store.persistDay(dayId);
            return { success: true };
        },

        updateNestedField: async (dayId /*, itemId, nestedPath, dataObj */) => {
            await store.persistDay(dayId);
            return { success: true };
        },

        updateArrayField: async (dayId, itemId, fieldName, arrayValue) => {
            const item = getItemData(store.cache, dayId, itemId);
            if (item) { item[fieldName] = arrayValue; item._updatedAt = new Date().toISOString(); }
            await store.persistDay(dayId);
            return { success: true };
        },

        cloudDeleteItem: async (dayId, itemId) => {
            const day = getDayData(store.cache, dayId);
            if (day && day.items) delete day.items[itemId];
            await store.persistDay(dayId);
            return { success: true, message: `已删除卡片 ${itemId}` };
        },

        cloudIncrementalBackup: async (dayId, itemId, timestampKey, backupEntry) => {
            const day = getDayData(store.cache, dayId);
            if (day && day.items && day.items[itemId]) delete day.items[itemId];
            await store.persistDay(dayId);
            if (timestampKey && backupEntry) await store.persistBackup(timestampKey, backupEntry);
            return { success: true, timestampKey };
        },

        // 整体上传：按天逐个回写（极少用到）
        upload: async () => {
            try {
                if (!store.cache) return { success: false, message: '无数据' };
                await store.persistTripMeta();
                await Promise.all(Object.keys(store.cache.days || {}).map(id => store.persistDay(id)));
                return { success: true, message: '已上传到 Firestore' };
            } catch (e) { return { success: false, message: e.message }; }
        },

        // 下载：重新 hydrate
        download: async () => {
            return await store.hydrate();
        },

        getAllLocalData: () => ({
            trip_unified_data: store.cache,
            _backup: (store.cache && store.cache._backup) || {}
        }),
        setAllLocalData: (data) => {
            if (data && data.trip_unified_data && typeof data.trip_unified_data === 'object') {
                store.cache = data.trip_unified_data;
                store.pushToState();
            }
        },

        startRealtimeSync: (cb) => store.startRealtimeSync(cb),
        stopRealtimeSync: () => store.stopRealtimeSync(),
        switchTrip: (tripId) => store.switchTrip(tripId),
        getMembers: () => store.getMembers(),
        isMember: (user) => store.isMember(user),
        joinTrip: (user) => store.joinTrip(user),
        leaveTrip: (user) => store.leaveTrip(user),
        setAutoSync: (enabled) => {
            localStorage.setItem('trip_auto_sync', enabled ? 'true' : 'false');
            if (enabled) store.startRealtimeSync(store._refreshCb); else store.stopRealtimeSync();
        },
        cleanup: () => store.stopRealtimeSync(),
        loadConfig: async () => { await store.waitForFirebase(); return { success: store.isConfigured() }; },
        initialize: async () => { await store.waitForFirebase(); return { success: store.isConfigured() }; }
    };

    window.dataSyncFirebase = dataSyncFirebase;
    window.firestoreStore = store;

    // 全局权限助手（供 data-manager / ui-renderer / card-slider 使用）
    // 是否已加入当前行程（加入后才能添加/编辑内容）
    window.canEditCurrentTrip = function () {
        const u = (window.getCurrentUser && window.getCurrentUser()) || null;
        return !!u && store.isMember(u);
    };
    // 是否可删除某行程项：必须是成员，且只能删自己加的（无归属的旧数据允许成员删）
    window.canDeleteItem = function (item) {
        if (!window.canEditCurrentTrip()) return false;
        const u = (window.getCurrentUser && window.getCurrentUser()) || null;
        const owner = item && (item._createdBy || item._user);
        return !owner || owner === u;
    };

    // Firebase 就绪后预热（实际加载在登录成功后由 onLoginSuccess→download 触发）
    store.waitForFirebase();
})();
