// 数据同步功能 - 使用Firebase Realtime Database
// Firebase SDK 通过 ES6 模块在 index.html 中加载

// 合并统一结构数据
function mergeUnifiedData(localData, remoteData) {
    // 合并days数组
    const mergedDays = [];
    const dayMap = new Map();
    
    // 先添加本地days
    (localData.days || []).forEach(day => {
        dayMap.set(day.id, { ...day });
    });
    
    // 合并远程days
    (remoteData.days || []).forEach(remoteDay => {
        const localDay = dayMap.get(remoteDay.id);
        if (localDay) {
            // 合并items
            const itemMap = new Map();
            (localDay.items || []).forEach(item => {
                itemMap.set(item.id, { ...item });
            });
            
            // 获取本地所有 item IDs（包括已删除的，用于判断哪些是本地删除的）
            const localItemIds = new Set((localDay.items || []).map(item => item.id));
            
            // 合并远程items
            (remoteDay.items || []).forEach(remoteItem => {
                const localItem = itemMap.get(remoteItem.id);
                if (localItem) {
                    // 本地有这个 item，合并属性
                    const localUpdated = new Date(localItem._updatedAt || 0);
                    const remoteUpdated = new Date(remoteItem._updatedAt || 0);
                    if (remoteUpdated > localUpdated) {
                        // 远程更新，使用远程数据，但合并comments、images和plan（保留远程删除的项）
                        remoteItem.comments = mergeComments(localItem.comments || [], remoteItem.comments || []);
                        remoteItem.images = mergeArrays(localItem.images || [], remoteItem.images || []);
                        remoteItem.plan = mergePlanItems(localItem.plan || [], remoteItem.plan || []);
                        itemMap.set(remoteItem.id, remoteItem);
                    } else {
                        // 本地更新，保留本地数据，但合并comments、images和plan
                        // 对于 plan：如果本地更新，以本地为准（包括删除），只添加远程中本地没有的新项
                        localItem.comments = mergeComments(localItem.comments || [], remoteItem.comments || []);
                        localItem.images = mergeArrays(localItem.images || [], remoteItem.images || []);
                        // plan 合并：本地为主，只添加远程中本地没有的新项（不恢复本地已删除的）
                        localItem.plan = mergePlanItemsWithLocalPriority(localItem.plan || [], remoteItem.plan || []);
                        itemMap.set(remoteItem.id, localItem);
                    }
                } else {
                    // 本地没有这个 item
                    // 判断：如果本地 day 有 _lastSync 且比远程 item 的 _updatedAt 新，说明本地有更新，可能删除了这个 item
                    // 为了安全，我们只添加远程中明显是新增的 item（更新时间比本地最后同步时间新）
                    const localDayLastSync = new Date(localDay._lastSync || localData._lastSync || 0);
                    const remoteItemUpdated = new Date(remoteItem._updatedAt || 0);
                    
                    // 如果本地最后同步时间存在且比远程 item 更新时间新，说明本地有更新，可能删除了这个 item
                    // 在这种情况下，不恢复远程的 item（保留本地的删除操作）
                    // 或者，如果本地 item 数量少于远程，说明本地可能删除了某些项，不恢复
                    const localItemCount = (localDay.items || []).length;
                    const remoteItemCount = (remoteDay.items || []).length;
                    const hasLocalUpdates = localDayLastSync > 0 && localItemCount < remoteItemCount;
                    
                    if (hasLocalUpdates && remoteItemUpdated <= localDayLastSync) {
                        // 不添加：可能是本地删除的，或者本地没有这个 item
                        console.log(`跳过恢复远程 item ${remoteItem.id}，本地有更新（最后同步: ${localDayLastSync.toISOString()}, 本地item数: ${localItemCount}, 远程item数: ${remoteItemCount}）`);
                        return; // 跳过这个 item
                    }
                    
                    // 远程 item 是新的（在本地最后同步之后创建的），添加它
                    itemMap.set(remoteItem.id, { ...remoteItem });
                }
            });
            
            localDay.items = Array.from(itemMap.values());
        } else {
            // 远程有新day，添加
            dayMap.set(remoteDay.id, { ...remoteDay });
        }
    });
    
    mergedDays.push(...Array.from(dayMap.values()));
    
    return {
        ...remoteData,
        days: mergedDays,
        _version: Math.max(localData._version || 0, remoteData._version || 0),
        _lastSync: new Date().toISOString()
    };
}

// 合并留言数组（使用哈希值去重，相同哈希值以最新的为准）
function mergeComments(localComments, remoteComments) {
    const commentMap = new Map();
    
    // 先添加本地留言
    localComments.forEach(c => {
        if (c._hash) {
            commentMap.set(c._hash, c);
        } else {
            // 没有哈希值的也保留（向后兼容）
            const tempHash = `temp_${Date.now()}_${Math.random()}`;
            commentMap.set(tempHash, c);
        }
    });
    
    // 合并远程留言
    remoteComments.forEach(c => {
        if (c._hash) {
            const existing = commentMap.get(c._hash);
            if (existing) {
                // 哈希值相同，比较时间戳，保留最新的
                const localTime = new Date(existing._timestamp || existing._updatedAt || 0);
                const remoteTime = new Date(c._timestamp || c._updatedAt || 0);
                if (remoteTime > localTime) {
                    commentMap.set(c._hash, c);
                }
                // 否则保留本地的（已存在）
            } else {
                // 哈希值不同，添加新的
                commentMap.set(c._hash, c);
            }
        } else {
            // 没有哈希值的也保留（向后兼容）
            const tempHash = `temp_${Date.now()}_${Math.random()}`;
            commentMap.set(tempHash, c);
        }
    });
    
    return Array.from(commentMap.values());
}

// 合并数组（去重）
function mergeArrays(localArray, remoteArray) {
    return Array.from(new Set([...localArray, ...remoteArray]));
}

// 合并 plan 项数组（使用哈希值去重，相同哈希值以最新的为准）
function mergePlanItems(localPlans, remotePlans) {
    const planMap = new Map();
    
    // 先添加本地 plan 项
    localPlans.forEach(p => {
        // plan 项可能是字符串或对象
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (planObj._hash) {
            planMap.set(planObj._hash, planObj);
        } else {
            // 没有哈希值的也保留（向后兼容），使用文本作为临时键
            const tempKey = planObj._text || JSON.stringify(planObj);
            planMap.set(tempKey, planObj);
        }
    });
    
    // 合并远程 plan 项
    remotePlans.forEach(p => {
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (planObj._hash) {
            const existing = planMap.get(planObj._hash);
            if (existing) {
                // 哈希值相同，比较时间戳，保留最新的
                const localTime = new Date(existing._timestamp || existing._updatedAt || 0);
                const remoteTime = new Date(planObj._timestamp || planObj._updatedAt || 0);
                if (remoteTime > localTime) {
                    planMap.set(planObj._hash, planObj);
                }
                // 否则保留本地的（已存在）
            } else {
                // 哈希值不同，添加新的
                planMap.set(planObj._hash, planObj);
            }
        } else {
            // 没有哈希值的也保留（向后兼容），使用文本作为临时键
            const tempKey = planObj._text || JSON.stringify(planObj);
            const existing = planMap.get(tempKey);
            if (existing) {
                // 比较时间戳，保留最新的
                const localTime = new Date(existing._timestamp || existing._updatedAt || 0);
                const remoteTime = new Date(planObj._timestamp || planObj._updatedAt || 0);
                if (remoteTime > localTime) {
                    planMap.set(tempKey, planObj);
                }
            } else {
                planMap.set(tempKey, planObj);
            }
        }
    });
    
    return Array.from(planMap.values());
}

// 合并 plan 项数组（本地优先：以本地为准，只添加远程中本地没有的新项）
// 用于本地 item 更新时，确保本地删除的项不会被远程恢复
function mergePlanItemsWithLocalPriority(localPlans, remotePlans) {
    const planMap = new Map();
    
    // 先添加本地 plan 项（本地为主）
    localPlans.forEach(p => {
        // plan 项可能是字符串或对象
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (planObj._hash) {
            planMap.set(planObj._hash, planObj);
        } else {
            // 没有哈希值的也保留（向后兼容），使用文本作为临时键
            const tempKey = planObj._text || JSON.stringify(planObj);
            planMap.set(tempKey, planObj);
        }
    });
    
    // 只添加远程中本地没有的新项（不恢复本地已删除的）
    remotePlans.forEach(p => {
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (planObj._hash) {
            // 如果本地没有这个哈希值，说明是远程新增的，添加它
            if (!planMap.has(planObj._hash)) {
                planMap.set(planObj._hash, planObj);
            }
            // 如果本地已有，说明本地保留了它（或本地有更新的版本），不覆盖
        } else {
            // 没有哈希值的也检查（向后兼容），使用文本作为临时键
            const tempKey = planObj._text || JSON.stringify(planObj);
            if (!planMap.has(tempKey)) {
                planMap.set(tempKey, planObj);
            }
        }
    });
    
    return Array.from(planMap.values());
}

class DataSyncFirebase {
    constructor() {
        this.database = null;
        this.databaseRef = null;
        this.syncInterval = null;
        this.autoSyncEnabled = localStorage.getItem('trip_auto_sync') === 'true';
        this.listeners = [];
        this.isInitialized = false;
        this.uploadDebounceTimer = null; // 上传防抖定时器
        this.uploadDebounceDelay = 2000; // 防抖延迟时间（2秒）
    }

    // 等待 Firebase 加载完成
    async waitForFirebase() {
        if (window.firebaseLoaded && window.firebaseDatabase) {
            return true;
        }
        
        return new Promise((resolve) => {
            if (window.firebaseLoaded && window.firebaseDatabase) {
                resolve(true);
                return;
            }
            
            window.addEventListener('firebaseReady', () => {
                resolve(true);
            }, { once: true });
            
            // 超时检查
            setTimeout(() => {
                if (window.firebaseLoaded && window.firebaseDatabase) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }, 5000);
        });
    }

    // 初始化Firebase
    async initialize(firebaseConfig) {
        try {
            // 等待 Firebase SDK 加载
            const firebaseReady = await this.waitForFirebase();
            if (!firebaseReady || !window.firebaseDatabase) {
                throw new Error('Firebase SDK未加载，请检查Firebase脚本是否正确引入');
            }

            // 如果已经初始化过，先清理
            if (this.database) {
                this.cleanup();
            }

            // 使用全局的 Firebase Database 实例
            this.database = window.firebaseDatabase;
            
            // 设置数据库路径（使用配置中的路径，或默认路径）
            const dbPath = firebaseConfig.databasePath || 'trip_plan_data';
            
            // 使用新的 Firebase SDK v9+ 的 API
            // 需要动态导入 ref 和 set 函数
            const { ref, set, get, onValue, off } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            
            this.databaseRef = ref(this.database, dbPath);
            this.ref = ref;
            this.set = set;
            this.get = get;
            this.onValue = onValue;
            this.off = off;
            
            // 保存路径信息用于调试
            this.dbPath = dbPath;

            // 保存配置到localStorage
            localStorage.setItem('trip_firebase_config', JSON.stringify(firebaseConfig));
            
            this.isInitialized = true;
            return { success: true, message: 'Firebase初始化成功' };
        } catch (error) {
            return { success: false, message: `Firebase初始化失败: ${error.message}` };
        }
    }

    // 从localStorage加载配置
    async loadConfig() {
        // 优先使用默认配置（从index.html加载的）
        if (window.firebaseConfig && window.firebaseDatabase) {
            const defaultConfig = {
                ...window.firebaseConfig,
                databasePath: 'trip_plan_data'
            };
            return await this.initialize(defaultConfig);
        }
        
        // 如果没有默认配置，尝试从localStorage加载
        const configStr = localStorage.getItem('trip_firebase_config');
        if (configStr) {
            try {
                const config = JSON.parse(configStr);
                return await this.initialize(config);
            } catch (e) {
                return { success: false, message: '配置加载失败' };
            }
        }
        return { success: false, message: '未找到Firebase配置' };
    }

    // 检查是否已配置
    isConfigured() {
        return this.isInitialized && this.database !== null;
    }

    // 获取所有本地数据（优先使用统一结构）
    getAllLocalData() {
        const data = {};
        
        // 优先使用统一结构
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                data['trip_unified_data'] = JSON.stringify(unifiedData);
                // 仍然包含其他配置数据（如果有）
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('trip_') && 
                        !key.includes('_token') && 
                        !key.includes('_gist_id') && 
                        !key.includes('_auto_sync') &&
                        !key.includes('_current_user') &&
                        !key.includes('_firebase_config') &&
                        key !== 'trip_unified_data') {
                        // 只包含配置类数据，不包含已迁移到统一结构的数据
                        if (key.includes('_config') || key.includes('_password')) {
                            data[key] = localStorage.getItem(key);
                        }
                    }
                }
                return data;
            }
        }
        
        // 如果没有统一结构，回退到旧的分散存储方式
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('trip_') && 
                !key.includes('_token') && 
                !key.includes('_gist_id') && 
                !key.includes('_auto_sync') &&
                !key.includes('_current_user') &&
                !key.includes('_firebase_config')) {
                data[key] = localStorage.getItem(key);
            }
        }
        return data;
    }

    // 设置所有本地数据（优先使用统一结构）
    setAllLocalData(data) {
        console.log('setAllLocalData 接收到的数据:', Object.keys(data), 'trip_unified_data 类型:', typeof data['trip_unified_data']);
        
        // 优先处理统一结构数据
        if (data['trip_unified_data'] && typeof tripDataStructure !== 'undefined') {
            try {
                let unifiedData = data['trip_unified_data'];
                console.log('处理 trip_unified_data，类型:', typeof unifiedData);
                
                // 如果已经是对象，直接使用；如果是字符串，则解析
                if (typeof unifiedData === 'string') {
                    // 检查是否是无效的字符串（如 "[object Object]"）
                    const trimmed = unifiedData.trim();
                    if (trimmed === '[object Object]' || trimmed === '[object Object]') {
                        console.warn('统一数据是无效的字符串 "[object Object]"');
                        unifiedData = null;
                    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        // 是有效的 JSON 字符串，尝试解析
                        console.log('解析 JSON 字符串，长度:', unifiedData.length);
                        unifiedData = JSON.parse(unifiedData);
                        console.log('解析成功，数据类型:', typeof unifiedData);
                    } else {
                        console.warn('统一数据不是有效的 JSON 字符串:', trimmed.substring(0, 50));
                        unifiedData = null;
                    }
                } else if (typeof unifiedData === 'object' && unifiedData !== null) {
                    // 已经是对象，直接使用
                    console.log('统一数据已经是对象，直接使用');
                    unifiedData = unifiedData;
                } else {
                    console.warn('统一数据格式不正确:', typeof unifiedData);
                    unifiedData = null;
                }
                
                if (unifiedData) {
                    console.log('保存统一数据到 localStorage');
                    tripDataStructure.saveUnifiedData(unifiedData);
                    console.log('保存成功');
                } else {
                    console.warn('统一数据为空，跳过保存');
                }
                // 删除统一数据键，避免重复处理
                delete data['trip_unified_data'];
            } catch (e) {
                console.error('解析统一数据失败:', e, '数据:', typeof data['trip_unified_data'] === 'string' ? data['trip_unified_data'].substring(0, 100) : data['trip_unified_data']);
            }
        } else {
            console.log('没有 trip_unified_data 或 tripDataStructure 未定义');
        }
        
        // 处理其他数据
        Object.keys(data).forEach(key => {
            // 如果值是对象，需要先转换为字符串
            if (typeof data[key] === 'object' && data[key] !== null) {
                try {
                    localStorage.setItem(key, JSON.stringify(data[key]));
                } catch (e) {
                    console.warn(`保存数据失败 ${key}:`, e);
                }
            } else {
                localStorage.setItem(key, data[key]);
            }
        });
    }

    // 上传单个卡片到云端（部分更新）
    async uploadItem(dayId, itemId) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Firebase未初始化，请先配置');
            }
            
            // 检查写权限
            if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
                throw new Error('未登录，无法上传数据');
            }
            
            if (typeof tripDataStructure === 'undefined') {
                throw new Error('统一数据结构未加载');
            }
            
            // 获取统一数据
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (!unifiedData) {
                throw new Error('本地没有数据');
            }
            
            // 获取要上传的 item
            const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
            if (!item) {
                // 如果 item 不存在，说明被删除了，需要从云端删除
                const snapshot = await this.get(this.databaseRef);
                const remoteData = snapshot.val() || {};
                
                if (remoteData.trip_unified_data) {
                    let remoteUnified = remoteData.trip_unified_data;
                    if (typeof remoteUnified === 'string') {
                        remoteUnified = JSON.parse(remoteUnified);
                    }
                    
                    // 从远程数据中删除这个 item
                    const remoteDay = remoteUnified.days?.find(d => d.id === dayId);
                    if (remoteDay && remoteDay.items) {
                        const itemIndex = remoteDay.items.findIndex(i => i.id === itemId);
                        if (itemIndex !== -1) {
                            remoteDay.items.splice(itemIndex, 1);
                            // 更新远程数据
                            remoteData.trip_unified_data = JSON.stringify(remoteUnified);
                            remoteData._lastSync = new Date().toISOString();
                            remoteData._syncUser = localStorage.getItem('trip_current_user') || 'unknown';
                            await this.set(this.databaseRef, remoteData);
                            return { success: true, message: `已删除卡片 ${itemId}` };
                        }
                    }
                }
                return { success: false, message: '未找到要删除的卡片' };
            }
            
            // 直接上传，不进行下载合并
            console.log(`上传卡片 ${itemId}...`);
            
            // 获取远程数据
            const snapshot = await this.get(this.databaseRef);
            const remoteData = snapshot.val() || {};
            
            // 解析远程统一数据
            let remoteUnified = null;
            if (remoteData.trip_unified_data) {
                const unifiedStr = remoteData.trip_unified_data;
                if (typeof unifiedStr === 'string') {
                    remoteUnified = JSON.parse(unifiedStr);
                } else {
                    remoteUnified = unifiedStr;
                }
            }
            
            // 如果远程没有统一数据，使用本地数据结构
            if (!remoteUnified) {
                remoteUnified = {
                    id: unifiedData.id || 'trip_plan',
                    title: unifiedData.title || '行程计划',
                    days: []
                };
            }
            
            // 找到或创建对应的 day
            let remoteDay = remoteUnified.days?.find(d => d.id === dayId);
            if (!remoteDay) {
                remoteDay = {
                    id: dayId,
                    items: []
                };
                if (!remoteUnified.days) {
                    remoteUnified.days = [];
                }
                remoteUnified.days.push(remoteDay);
            }
            
            // 更新或添加 item
            if (!remoteDay.items) {
                remoteDay.items = [];
            }
            const existingItemIndex = remoteDay.items.findIndex(i => i.id === itemId);
            if (existingItemIndex !== -1) {
                // 更新现有 item
                remoteDay.items[existingItemIndex] = { ...item };
            } else {
                // 添加新 item
                remoteDay.items.push({ ...item });
            }
            
            // 保存到远程
            remoteData.trip_unified_data = JSON.stringify(remoteUnified);
            remoteData._lastSync = new Date().toISOString();
            remoteData._syncUser = localStorage.getItem('trip_current_user') || 'unknown';
            
            await this.set(this.databaseRef, remoteData);
            
            return { 
                success: true, 
                message: `已上传卡片 ${itemId}` 
            };
        } catch (error) {
            return { success: false, message: `上传卡片失败: ${error.message}` };
        }
    }

    // 上传数据到云端（带防抖，上传前先下载并合并）
    async upload(immediate = false) {
        // 如果不是立即上传，使用防抖
        if (!immediate && this.uploadDebounceTimer) {
            clearTimeout(this.uploadDebounceTimer);
        }
        
        return new Promise((resolve) => {
            const doUpload = async () => {
                try {
                    if (!this.isConfigured()) {
                        throw new Error('Firebase未初始化，请先配置');
                    }
                    
                    // 检查写权限
                    if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
                        throw new Error('未登录，无法上传数据');
                    }

                    // 上传前先下载并合并数据，防止冲突
                    console.log('上传前先下载并合并数据...');
                    try {
                        const downloadResult = await this.download(true); // 使用合并模式下载
                        if (downloadResult.success) {
                            console.log('下载并合并成功，准备上传合并后的数据');
                        } else {
                            console.warn('下载失败，继续使用本地数据上传:', downloadResult.message);
                        }
                    } catch (downloadError) {
                        console.warn('上传前下载失败，继续使用本地数据上传:', downloadError);
                    }

                    const data = this.getAllLocalData();
                    
                    // 检查数据是否为空
                    const dataKeys = Object.keys(data);
                    if (dataKeys.length === 0) {
                        resolve({ success: false, message: '没有数据需要上传（localStorage为空）' });
                        return;
                    }
                    
                    // 添加时间戳
                    data._lastSync = new Date().toISOString();
                    data._syncUser = localStorage.getItem('trip_current_user') || 'unknown';

                    // 上传到Firebase（使用新的 SDK API）
                    // 调试信息：显示上传路径和数据项数量
                    const uploadPath = this.databaseRef.toString();
                    await this.set(this.databaseRef, data);
                    
                    resolve({ 
                        success: true, 
                        message: `同步成功！已上传 ${dataKeys.length} 个数据项到路径: ${uploadPath}` 
                    });
                } catch (error) {
                    resolve({ success: false, message: `上传失败: ${error.message}` });
                }
            };
            
            if (immediate) {
                // 立即上传（用于手动同步）
                doUpload();
            } else {
                // 防抖上传（用于自动同步）
                this.uploadDebounceTimer = setTimeout(doUpload, this.uploadDebounceDelay);
            }
        });
    }

    // 从云端下载数据
    async download(merge = true) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Firebase未初始化，请先配置');
            }

            // 使用新的 Firebase SDK API
            const snapshot = await this.get(this.databaseRef);
            const remoteData = snapshot.val();

            // 调试信息：检查数据路径和内容
            if (!remoteData) {
                // 尝试检查数据库路径是否正确
                const pathInfo = this.dbPath || '未知路径';
                return { 
                    success: false, 
                    message: `云端没有数据。\n\n路径: ${pathInfo}\n\n可能的原因：\n1) 数据还未上传（请先点击"上传"按钮）\n2) 数据库路径不匹配（检查配置中的"数据库路径"）\n3) Firebase 数据库规则不允许读取（需要在 Firebase 控制台设置规则）\n\n建议：\n- 在 Firebase 控制台的 Realtime Database 中查看是否有数据\n- 检查数据库路径是否与上传时一致` 
                };
            }
            
            // 调试信息：检查数据是否为空对象
            const dataKeys = Object.keys(remoteData);
            console.log('从 Firebase 下载的数据键:', dataKeys);
            
            // 检查数据格式：可能是统一数据结构对象，也可能是包含 trip_unified_data 的对象
            const isUnifiedDataStructure = remoteData.id && remoteData.title && remoteData.days;
            const hasTripUnifiedData = remoteData.trip_unified_data !== undefined;
            
            console.log('数据格式检查:', {
                isUnifiedDataStructure,
                hasTripUnifiedData,
                dataKeys
            });
            
            // 如果 remoteData 本身就是统一数据结构（没有 trip_unified_data 字段）
            let processedRemoteData = remoteData;
            if (isUnifiedDataStructure && !hasTripUnifiedData) {
                console.log('检测到 remoteData 本身就是统一数据结构，转换为 trip_unified_data 格式');
                // 将整个 remoteData 包装为 trip_unified_data
                const unifiedDataObj = { ...remoteData };
                // 移除元数据（这些会在保存时重新添加）
                delete unifiedDataObj._lastSync;
                delete unifiedDataObj._syncUser;
                // 创建新的数据结构
                processedRemoteData = {
                    trip_unified_data: JSON.stringify(unifiedDataObj)
                };
                console.log('已转换数据格式');
            }
            
            const hasRealData = dataKeys.some(key => key !== '_lastSync' && key !== '_syncUser' && key !== 'trip_unified_data') || processedRemoteData.trip_unified_data;
            
            if (!hasRealData) {
                const pathInfo = this.dbPath || '未知路径';
                return { 
                    success: false, 
                    message: `云端数据为空（只有元数据）。\n\n路径: ${pathInfo}\n数据键: ${dataKeys.join(', ')}\n\n请先上传数据，然后再尝试下载。` 
                };
            }

            if (merge) {
                // 智能合并策略（与Gist版本相同）
                const localData = this.getAllLocalData();
                const localDataKeys = Object.keys(localData);
                
                // 检查本地是否有有效数据
                const hasLocalData = localDataKeys.length > 0 && 
                    localDataKeys.some(key => {
                        const value = localData[key];
                        if (!value || value === '[]' || value === '{}' || value === '""') {
                            return false;
                        }
                        try {
                            const parsed = JSON.parse(value);
                            if (Array.isArray(parsed) && parsed.length === 0) return false;
                            if (typeof parsed === 'object' && Object.keys(parsed).length === 0) return false;
                        } catch (e) {
                            if (value.trim().length === 0) return false;
                        }
                        return true;
                    });
                
                // 如果本地没有有效数据，直接使用云端数据
                if (!hasLocalData) {
                    this.setAllLocalData(processedRemoteData);
                    return { success: true, message: '同步成功！已从云端加载数据。', data: processedRemoteData };
                }
                
                // 本地有数据，使用合并策略
                const mergedData = { ...localData };
                
                // 优先处理统一结构数据
                if (processedRemoteData['trip_unified_data'] || localData['trip_unified_data']) {
                    let localUnified = null;
                    let remoteUnified = null;
                    
                    // 安全解析本地统一数据
                    if (localData['trip_unified_data']) {
                        try {
                            let localValue = localData['trip_unified_data'];
                            // 如果已经是对象，直接使用；如果是字符串，则解析
                            if (typeof localValue === 'string') {
                                // 检查是否是无效的字符串（如 "[object Object]"）
                                const trimmed = localValue.trim();
                                if (trimmed === '[object Object]' || trimmed === '[object Object]') {
                                    console.warn('本地统一数据是无效的字符串 "[object Object]"');
                                    localUnified = null;
                                } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                                    // 是有效的 JSON 字符串，尝试解析
                                    localUnified = JSON.parse(localValue);
                                } else {
                                    console.warn('本地统一数据不是有效的 JSON 字符串:', trimmed.substring(0, 50));
                                    localUnified = null;
                                }
                            } else if (typeof localValue === 'object' && localValue !== null) {
                                // 已经是对象，直接使用
                                localUnified = localValue;
                            } else {
                                console.warn('本地统一数据格式不正确:', typeof localValue);
                                localUnified = null;
                            }
                        } catch (e) {
                            console.warn('解析本地统一数据失败:', e, '数据:', typeof localData['trip_unified_data'] === 'string' ? localData['trip_unified_data'].substring(0, 100) : localData['trip_unified_data']);
                            localUnified = null;
                        }
                    }
                    
                    // 安全解析远程统一数据
                    if (processedRemoteData['trip_unified_data']) {
                        try {
                            let remoteValue = processedRemoteData['trip_unified_data'];
                            // 如果已经是对象，直接使用；如果是字符串，则解析
                            if (typeof remoteValue === 'string') {
                                // 检查是否是无效的字符串（如 "[object Object]"）
                                const trimmed = remoteValue.trim();
                                if (trimmed === '[object Object]' || trimmed === '[object Object]') {
                                    console.warn('远程统一数据是无效的字符串 "[object Object]"');
                                    remoteUnified = null;
                                } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                                    // 是有效的 JSON 字符串，尝试解析
                                    remoteUnified = JSON.parse(remoteValue);
                                } else {
                                    console.warn('远程统一数据不是有效的 JSON 字符串:', trimmed.substring(0, 50));
                                    remoteUnified = null;
                                }
                            } else if (typeof remoteValue === 'object' && remoteValue !== null) {
                                // 已经是对象，直接使用
                                remoteUnified = remoteValue;
                            } else {
                                console.warn('远程统一数据格式不正确:', typeof remoteValue);
                                remoteUnified = null;
                            }
                        } catch (e) {
                            console.warn('解析远程统一数据失败:', e, '数据:', typeof processedRemoteData['trip_unified_data'] === 'string' ? processedRemoteData['trip_unified_data'].substring(0, 100) : processedRemoteData['trip_unified_data']);
                            remoteUnified = null;
                        }
                    }
                    
                    if (remoteUnified && localUnified) {
                        // 合并两个统一结构
                        const mergedUnified = mergeUnifiedData(localUnified, remoteUnified);
                        mergedData['trip_unified_data'] = JSON.stringify(mergedUnified);
                    } else if (remoteUnified) {
                        // 只有远程有统一结构，使用远程的（确保是字符串格式）
                        mergedData['trip_unified_data'] = typeof remoteUnified === 'object' ? JSON.stringify(remoteUnified) : processedRemoteData['trip_unified_data'];
                    } else if (localUnified) {
                        // 只有本地有统一结构，保留本地的（确保是字符串格式）
                        mergedData['trip_unified_data'] = typeof localUnified === 'object' ? JSON.stringify(localUnified) : localData['trip_unified_data'];
                    }
                    
                    // 删除已处理的键，避免重复处理
                    delete processedRemoteData['trip_unified_data'];
                    delete localData['trip_unified_data'];
                }
                
                Object.keys(processedRemoteData).forEach(key => {
                    if (!localData[key]) {
                        mergedData[key] = processedRemoteData[key];
                    } else {
                        try {
                            const localValue = localData[key];
                            const remoteValue = processedRemoteData[key];
                            
                            // 安全解析：如果已经是对象，直接使用；如果是字符串，则解析
                            const localParsed = typeof localValue === 'string' ? JSON.parse(localValue) : localValue;
                            const remoteParsed = typeof remoteValue === 'string' ? JSON.parse(remoteValue) : remoteValue;
                            
                            if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
                                // 处理软删除：移除本地已删除的项（如果远程也标记为删除）
                                const merged = localParsed.filter(localItem => {
                                    // 如果本地项标记为删除，检查远程是否也有相同的项
                                    if (localItem._deleted) {
                                        // 如果远程也有相同的项且未删除，保留它（可能是其他用户恢复了）
                                        const remoteItem = remoteParsed.find(r => {
                                            // 优先使用哈希值匹配（最可靠）
                                            if (localItem._hash && r._hash) return localItem._hash === r._hash;
                                            // 使用id或其他唯一标识符匹配
                                            if (localItem.id && r.id) return localItem.id === r.id;
                                            if (localItem._text && r._text) return localItem._text === r._text;
                                            return JSON.stringify(localItem) === JSON.stringify(r);
                                        });
                                        // 如果远程项存在且未删除，保留它
                                        return remoteItem && !remoteItem._deleted;
                                    }
                                    return true;
                                });
                                
                                // 添加远程的新项或更新的项
                                remoteParsed.forEach(remoteItem => {
                                    // 跳过已删除的远程项
                                    if (remoteItem._deleted) {
                                        // 从本地也删除该项
                                        const localIndex = merged.findIndex(localItem => {
                                            // 优先使用哈希值匹配
                                            if (localItem._hash && remoteItem._hash) return localItem._hash === remoteItem._hash;
                                            if (localItem.id && remoteItem.id) return localItem.id === remoteItem.id;
                                            if (localItem._text && remoteItem._text) return localItem._text === remoteItem._text;
                                            return JSON.stringify(localItem) === JSON.stringify(remoteItem);
                                        });
                                        if (localIndex !== -1) {
                                            merged.splice(localIndex, 1);
                                        }
                                        return;
                                    }
                                    
                                    // 检查是否已存在（优先使用哈希值匹配）
                                    const exists = merged.some(existing => {
                                        // 优先使用哈希值匹配（最可靠，用于留言和计划项去重）
                                        if (existing._hash && remoteItem._hash) {
                                            return existing._hash === remoteItem._hash;
                                        }
                                        // 其次使用id匹配
                                        if (existing.id && remoteItem.id) {
                                            return existing.id === remoteItem.id;
                                        }
                                        // 再次使用_text匹配（计划项）
                                        if (existing._text && remoteItem._text) {
                                            return existing._text === remoteItem._text;
                                        }
                                        // 最后使用完整对象匹配
                                        return JSON.stringify(existing) === JSON.stringify(remoteItem);
                                    });
                                    if (!exists) {
                                        merged.push(remoteItem);
                                    } else {
                                        // 如果已存在，更新它（保留本地未删除的项，但更新其他属性）
                                        const existingIndex = merged.findIndex(existing => {
                                            // 优先使用哈希值匹配
                                            if (existing._hash && remoteItem._hash) {
                                                return existing._hash === remoteItem._hash;
                                            }
                                            if (existing.id && remoteItem.id) {
                                                return existing.id === remoteItem.id;
                                            }
                                            if (existing._text && remoteItem._text) {
                                                return existing._text === remoteItem._text;
                                            }
                                            return JSON.stringify(existing) === JSON.stringify(remoteItem);
                                        });
                                        if (existingIndex !== -1 && !merged[existingIndex]._deleted) {
                                            // 合并属性，但保留 _deleted 状态（如果本地未删除）
                                            merged[existingIndex] = { ...merged[existingIndex], ...remoteItem, _deleted: merged[existingIndex]._deleted || false };
                                        }
                                    }
                                });
                                mergedData[key] = JSON.stringify(merged);
                            } else if (typeof localParsed === 'object' && typeof remoteParsed === 'object' && 
                                      !Array.isArray(localParsed) && !Array.isArray(remoteParsed)) {
                                const merged = { ...localParsed };
                                if (remoteParsed.userA !== undefined) {
                                    merged.userA = remoteParsed.userA;
                                }
                                if (remoteParsed.userB !== undefined) {
                                    merged.userB = remoteParsed.userB;
                                }
                                Object.keys(remoteParsed).forEach(k => {
                                    if (k !== 'userA' && k !== 'userB') {
                                        merged[k] = remoteParsed[k];
                                    }
                                });
                                mergedData[key] = JSON.stringify(merged);
                            } else {
                                mergedData[key] = remoteValue;
                            }
                        } catch (e) {
                            mergedData[key] = remoteData[key];
                        }
                    }
                });
                
                this.setAllLocalData(mergedData);
            } else {
                // 直接覆盖模式
                console.log('覆盖模式：直接使用云端数据', remoteData);
                // 确保 trip_unified_data 是字符串格式
                if (remoteData['trip_unified_data']) {
                    const unifiedData = remoteData['trip_unified_data'];
                    if (typeof unifiedData === 'object' && unifiedData !== null) {
                        // 如果是对象，转换为字符串
                        remoteData['trip_unified_data'] = JSON.stringify(unifiedData);
                        console.log('已将 trip_unified_data 从对象转换为字符串');
                    } else if (typeof unifiedData === 'string') {
                        // 已经是字符串，检查是否是有效的 JSON
                        const trimmed = unifiedData.trim();
                        if (trimmed === '[object Object]') {
                            console.warn('云端 trip_unified_data 是无效的 "[object Object]" 字符串');
                            delete remoteData['trip_unified_data'];
                        }
                    }
                }
                this.setAllLocalData(remoteData);
            }
            
            return { success: true, message: '同步成功！数据已更新。', data: remoteData };
        } catch (error) {
            // 安全处理错误信息
            let errorMessage = '下载失败';
            if (error) {
                if (typeof error === 'string') {
                    errorMessage = `下载失败: ${error}`;
                } else if (error.message) {
                    errorMessage = `下载失败: ${error.message}`;
                } else if (error.toString && error.toString() !== '[object Object]') {
                    errorMessage = `下载失败: ${error.toString()}`;
                } else {
                    errorMessage = '下载失败: 未知错误';
                }
            }
            console.error('下载失败:', error);
            return { success: false, message: errorMessage };
        }
    }

    // 启用实时监听（Firebase特有功能）
    startRealtimeSync(callback) {
        if (!this.isConfigured()) {
            return { success: false, message: 'Firebase未初始化' };
        }

        try {
            // 移除旧的监听器
            this.stopRealtimeSync();

            // 添加新的监听器（使用新的 Firebase SDK API）
            // 这是真正的实时同步：当 Firebase 数据库发生变化时，这个回调会自动触发
            const unsubscribe = this.onValue(this.databaseRef, (snapshot) => {
                const remoteData = snapshot.val();
                if (remoteData) {
                    // 避免处理自己刚刚上传的数据（通过检查 _syncUser）
                    const syncUser = remoteData._syncUser;
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                    
                    // 如果是自己上传的数据，跳过处理（避免循环刷新）
                    // 但如果是对方上传的数据，需要处理
                    if (syncUser && syncUser === currentUser) {
                        // 这是自己上传的数据，不需要刷新
                        return;
                    }
                    
                    // 移除元数据
                    delete remoteData._lastSync;
                    delete remoteData._syncUser;
                    
                    // 合并数据
                    const localData = this.getAllLocalData();
                    const mergedData = { ...localData };
                    
                    Object.keys(remoteData).forEach(key => {
                        if (!localData[key]) {
                            mergedData[key] = remoteData[key];
                        } else {
                            // 使用时间戳判断哪个更新（如果有_lastSync）
                            // 这里简化处理，直接合并
                            try {
                                const localValue = localData[key];
                                const remoteValue = remoteData[key];
                                
                                const localParsed = JSON.parse(localValue);
                                const remoteParsed = JSON.parse(remoteValue);
                                
                                if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
                                    // 处理软删除：移除本地已删除的项（如果远程也标记为删除）
                                    const merged = localParsed.filter(localItem => {
                                        if (localItem._deleted) {
                                            const remoteItem = remoteParsed.find(r => {
                                                // 优先使用哈希值匹配（最可靠）
                                                if (localItem._hash && r._hash) return localItem._hash === r._hash;
                                                // 使用id或其他唯一标识符匹配
                                                if (localItem.id && r.id) return localItem.id === r.id;
                                                if (localItem._text && r._text) return localItem._text === r._text;
                                                return JSON.stringify(localItem) === JSON.stringify(r);
                                            });
                                            return remoteItem && !remoteItem._deleted;
                                        }
                                        return true;
                                    });
                                    
                                    // 添加远程的新项或更新的项
                                    remoteParsed.forEach(remoteItem => {
                                        if (remoteItem._deleted) {
                                        const localIndex = merged.findIndex(localItem => {
                                            // 优先使用哈希值匹配
                                            if (localItem._hash && remoteItem._hash) return localItem._hash === remoteItem._hash;
                                            if (localItem.id && remoteItem.id) return localItem.id === remoteItem.id;
                                            if (localItem._text && remoteItem._text) return localItem._text === remoteItem._text;
                                            return JSON.stringify(localItem) === JSON.stringify(remoteItem);
                                        });
                                            if (localIndex !== -1) {
                                                merged.splice(localIndex, 1);
                                            }
                                            return;
                                        }
                                        
                                        // 检查是否已存在（优先使用哈希值匹配）
                                        const exists = merged.some(existing => {
                                            // 优先使用哈希值匹配（最可靠，用于留言和计划项去重）
                                            if (existing._hash && remoteItem._hash) {
                                                return existing._hash === remoteItem._hash;
                                            }
                                            // 其次使用id匹配
                                            if (existing.id && remoteItem.id) {
                                                return existing.id === remoteItem.id;
                                            }
                                            // 再次使用_text匹配（计划项）
                                            if (existing._text && remoteItem._text) {
                                                return existing._text === remoteItem._text;
                                            }
                                            // 最后使用完整对象匹配
                                            return JSON.stringify(existing) === JSON.stringify(remoteItem);
                                        });
                                        if (!exists) {
                                            merged.push(remoteItem);
                                        } else {
                                            const existingIndex = merged.findIndex(existing => {
                                                // 优先使用哈希值匹配
                                                if (existing._hash && remoteItem._hash) {
                                                    return existing._hash === remoteItem._hash;
                                                }
                                                if (existing.id && remoteItem.id) {
                                                    return existing.id === remoteItem.id;
                                                }
                                                if (existing._text && remoteItem._text) {
                                                    return existing._text === remoteItem._text;
                                                }
                                                return JSON.stringify(existing) === JSON.stringify(remoteItem);
                                            });
                                            if (existingIndex !== -1 && !merged[existingIndex]._deleted) {
                                                merged[existingIndex] = { ...merged[existingIndex], ...remoteItem, _deleted: merged[existingIndex]._deleted || false };
                                            }
                                        }
                                    });
                                    mergedData[key] = JSON.stringify(merged);
                                } else if (typeof localParsed === 'object' && typeof remoteParsed === 'object' && 
                                          !Array.isArray(localParsed) && !Array.isArray(remoteParsed)) {
                                    const merged = { ...localParsed, ...remoteParsed };
                                    if (remoteParsed.userA !== undefined) merged.userA = remoteParsed.userA;
                                    if (remoteParsed.userB !== undefined) merged.userB = remoteParsed.userB;
                                    mergedData[key] = JSON.stringify(merged);
                                } else {
                                    mergedData[key] = remoteValue;
                                }
                            } catch (e) {
                                mergedData[key] = remoteData[key];
                            }
                        }
                    });
                    
                    this.setAllLocalData(mergedData);
                    
                    // 调用回调函数通知数据更新
                    if (callback) {
                        callback(mergedData);
                    }
                }
            });

            this.listeners.push(unsubscribe);
            return { success: true, message: '实时同步已启动' };
        } catch (error) {
            return { success: false, message: `启动实时同步失败: ${error.message}` };
        }
    }

    // 停止实时监听
    stopRealtimeSync() {
        this.listeners.forEach(unsubscribe => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.listeners = [];
    }

    // 启用/禁用自动同步
    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        localStorage.setItem('trip_auto_sync', enabled ? 'true' : 'false');

        if (enabled) {
            // 启动实时同步
            this.startRealtimeSync((data) => {
                // 数据更新时的回调
                // 注意：这里不显示状态消息，避免频繁提示
                // 刷新当前页面显示 - 这是真正的实时同步核心
                if (typeof window.currentDayId !== 'undefined' && window.currentDayId) {
                    if (typeof window.showDay === 'function') {
                        // 重新渲染当前日期，实现真正的实时同步
                        window.showDay(window.currentDayId);
                    }
                }
            });
        } else {
            // 停止实时同步
            this.stopRealtimeSync();
        }
    }

    // 清理资源
    cleanup() {
        this.stopRealtimeSync();
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        if (this.uploadDebounceTimer) {
            clearTimeout(this.uploadDebounceTimer);
            this.uploadDebounceTimer = null;
        }
    }

    // 导出数据（与Gist版本兼容）
    exportData() {
        const data = this.getAllLocalData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trip_data_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, message: '数据已导出' };
    }

    // 导入数据（与Gist版本兼容）
    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.setAllLocalData(data);
                    resolve({ success: true, message: '数据已导入' });
                } catch (error) {
                    reject({ success: false, message: '文件格式错误' });
                }
            };
            reader.onerror = () => reject({ success: false, message: '读取文件失败' });
            reader.readAsText(file);
        });
    }
}

// 全局实例
let dataSyncFirebase = new DataSyncFirebase();

