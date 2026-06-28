// 通用模块数据存储（用于行前准备 / 行后复盘的各功能区）
// Firestore 模型：trips/{scopeId}/sections/{key}  =>  { data: {...}, _updatedAt }
//   scopeId 默认 'shared'（行前的日历/留言等全组共享）；
//   调用 setScoped(true) 后改用「当前行程 id」(trip-registry)，实现行后照片/分账按行程区分。
// 用法：
//   window.moduleStore.setScoped(true)      // 行后页：按当前行程隔离
//   window.moduleStore.get(key)             // 同步读缓存
//   window.moduleStore.save(key, dataObj)   // 写 Firestore + 缓存
//   window.moduleStore.subscribe(key, cb)   // 实时订阅
//   await window.moduleStore.switchTrip(id) // 切换行程：重订阅所有 key
(function () {
    'use strict';
    const DEFAULT_ID = 'shared';

    class ModuleStore {
        constructor() {
            this.cache = {};
            this.ready = false;
            this.unsubs = {};
            this.subs = {};          // key -> callback（用于切换行程时重订阅）
            this.scoped = false;     // false=固定 'shared'，true=按当前行程 id
        }

        setScoped(b) { this.scoped = !!b; }

        scopeId() {
            if (this.scoped && window.tripRegistry && window.tripRegistry.getCurrentId) {
                return window.tripRegistry.getCurrentId() || DEFAULT_ID;
            }
            return DEFAULT_ID;
        }

        async waitForFirebase() {
            if (window.fb && window.fb.db) { this.ready = true; return true; }
            return new Promise(resolve => {
                window.addEventListener('firebaseReady', () => { this.ready = true; resolve(true); }, { once: true });
                setTimeout(() => resolve(!!(window.fb && window.fb.db)), 8000);
            });
        }

        docRef(key) {
            const { db, doc } = window.fb;
            return doc(db, 'trips', this.scopeId(), 'sections', String(key));
        }

        get(key) { return this.cache[key] || {}; }

        async save(key, dataObj) {
            this.cache[key] = dataObj || {};
            await this.waitForFirebase();
            if (!(window.fb && window.fb.db)) return;
            const { setDoc } = window.fb;
            try {
                await setDoc(this.docRef(key), {
                    data: dataObj || {},
                    _updatedAt: new Date().toISOString(),
                    _syncUser: localStorage.getItem('trip_current_user') || 'unknown'
                });
            } catch (e) { /* 静默 */ }
        }

        async hydrate(keys) {
            await this.waitForFirebase();
            if (!(window.fb && window.fb.db)) return;
            const { getDoc } = window.fb;
            for (const key of keys) {
                try {
                    const snap = await getDoc(this.docRef(key));
                    this.cache[key] = snap.exists() ? (snap.data().data || {}) : {};
                } catch (e) { this.cache[key] = {}; }
            }
        }

        subscribe(key, cb) {
            this.subs[key] = cb;
            this.waitForFirebase().then(() => {
                if (!(window.fb && window.fb.db)) return;
                const { onSnapshot } = window.fb;
                if (this.unsubs[key]) this.unsubs[key]();
                this.unsubs[key] = onSnapshot(this.docRef(key), snap => {
                    const d = snap.exists() ? (snap.data().data || {}) : {};
                    this.cache[key] = d;
                    if (cb) cb(d);
                }, () => {});
            });
        }

        // 切换到另一个行程：清空缓存并对所有已订阅 key 重新订阅（回调会以新行程数据触发）
        async switchTrip(tripId) {
            if (window.tripRegistry) window.tripRegistry.setCurrentId(tripId);
            this.scoped = true;
            const keys = Object.keys(this.subs);
            keys.forEach(k => { this.cache[k] = {}; });
            keys.forEach(k => { this.subscribe(k, this.subs[k]); });
            return { success: true };
        }
    }

    window.moduleStore = new ModuleStore();
})();
