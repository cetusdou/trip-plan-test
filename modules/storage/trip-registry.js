// 行程注册表（多行程支持）
// 顶层集合 trips/{tripId}，每个文档是一个独立行程的元数据：
//   { title, startDate, overview[], _version, _createdAt, _syncUser }
// 其行程内容（按天）在 trips/{tripId}/days/{dayId}。
//
// 本模块为通用工具，行中页与行前页都可加载：
//   window.tripRegistry.getCurrentId()        当前选中的行程 id（URL ?trip= > localStorage > 'shared'）
//   window.tripRegistry.setCurrentId(id)
//   await window.tripRegistry.list()          列出所有行程 [{id,title,startDate,_createdAt}]
//   await window.tripRegistry.create(title, startDate)  新建行程（含第1天），返回新 id
(function () {
    'use strict';

    const KEY = 'current_trip_id';
    const DEFAULT_ID = 'shared';

    function fbReady() { return !!(window.fb && window.fb.db); }

    function waitForFirebase() {
        if (fbReady()) return Promise.resolve(true);
        return new Promise(resolve => {
            window.addEventListener('firebaseReady', () => resolve(true), { once: true });
            setTimeout(() => resolve(fbReady()), 8000);
        });
    }

    function genId() {
        return 'trip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    // 行程列表内存缓存，避免切换器每次渲染都查询 Firestore
    let _listCache = null;
    function invalidate() { _listCache = null; }

    function getCurrentId() {
        try {
            const fromUrl = new URLSearchParams(location.search).get('trip');
            if (fromUrl) {
                try { localStorage.setItem(KEY, fromUrl); } catch (e) {}
                return fromUrl;
            }
            return localStorage.getItem(KEY) || DEFAULT_ID;
        } catch (e) {
            return DEFAULT_ID;
        }
    }

    function setCurrentId(id) {
        try { localStorage.setItem(KEY, id || DEFAULT_ID); } catch (e) {}
    }

    function currentUser() {
        try { return (window.getCurrentUser && window.getCurrentUser()) || localStorage.getItem('trip_current_user') || 'unknown'; }
        catch (e) { return 'unknown'; }
    }

    async function list(force) {
        if (!force && Array.isArray(_listCache)) return _listCache;
        await waitForFirebase();
        if (!fbReady()) return _listCache || [];
        const { db, collection, getDocs } = window.fb;
        const arr = [];
        try {
            const snap = await getDocs(collection(db, 'trips'));
            snap.forEach(d => {
                const m = d.data() || {};
                arr.push({
                    id: d.id,
                    title: m.title || d.id,
                    startDate: m.startDate || null,
                    _createdAt: m._createdAt || null
                });
            });
        } catch (e) {
            console.error('[tripRegistry] 列出行程失败:', e);
        }
        // 默认行程优先，其余按创建时间
        arr.sort((a, b) => {
            if (a.id === DEFAULT_ID) return -1;
            if (b.id === DEFAULT_ID) return 1;
            return String(a._createdAt || '').localeCompare(String(b._createdAt || ''));
        });
        _listCache = arr;
        return arr;
    }

    async function create(title, startDate) {
        await waitForFirebase();
        if (!fbReady()) throw new Error('Firestore 未就绪');
        const { db, doc, setDoc } = window.fb;
        const id = genId();
        const nowIso = new Date().toISOString();

        const creator = currentUser();
        await setDoc(doc(db, 'trips', id), {
            title: title || '新行程',
            startDate: startDate || null,
            overview: [],
            members: creator && creator !== 'unknown' ? [creator] : [],
            _version: 2,
            _createdAt: nowIso,
            _syncUser: creator
        });

        // 自动创建第 1 天，便于立刻添加行程项
        const dayId = 'day1_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await setDoc(doc(db, 'trips', id, 'days', dayId), {
            id: dayId,
            title: startDate ? ('第1天 · ' + startDate) : '第1天',
            items: {},
            order: 0,
            _updatedAt: nowIso,
            _syncUser: currentUser()
        });

        invalidate();
        return id;
    }

    async function remove(id) {
        await waitForFirebase();
        if (!fbReady()) throw new Error('Firestore 未就绪');
        if (id === DEFAULT_ID) throw new Error('默认行程不可删除');
        const { db, doc, getDocs, collection, deleteDoc } = window.fb;
        try {
            // 删除子集合 days / backup（小规模逐个删除）
            for (const sub of ['days', 'backup']) {
                const snap = await getDocs(collection(db, 'trips', id, sub));
                for (const d of snap.docs) { await deleteDoc(doc(db, 'trips', id, sub, d.id)); }
            }
            await deleteDoc(doc(db, 'trips', id));
            invalidate();
        } catch (e) {
            console.error('[tripRegistry] 删除行程失败:', e);
            throw e;
        }
    }

    window.tripRegistry = {
        DEFAULT_ID,
        getCurrentId,
        setCurrentId,
        list,
        create,
        remove,
        invalidate,
        genId
    };
})();
