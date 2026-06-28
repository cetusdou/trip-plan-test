// 统一的数据结构定义和工具函数

 // 数据结构版本（更新为 2，因为改为对象结构）
const DATA_STRUCTURE_VERSION = 2;

// 生成唯一ID
function generateItemId(dayId, index) {
    return `${dayId}_item_${index}_${Date.now()}`;
}

// 辅助函数：将数组转换为对象（用于迁移旧数据）
function arrayToObject(arr, keyField) {
    if (!arr || !Array.isArray(arr)) return {};
    const obj = {};
    arr.forEach((item, index) => {
        if (item) {
            const key = item[keyField] || index.toString();
            obj[key] = item;
        }
    });
    return obj;
}

// 辅助函数：将对象转换为数组（用于向后兼容或需要数组的场景）
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

// 规范化plan数据（支持字符串和数组，转换为对象结构）
function normalizePlan(plan) {
    if (!plan) return {};
    if (typeof plan === 'string') {
        // 字符串转对象，使用时间戳作为 key
        const key = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        return {
            [key]: {
                _text: plan,
                _hash: null,
                _timestamp: Date.now(),
                _user: null
            }
        };
    }
    if (Array.isArray(plan)) {
        // 数组转对象，使用 _hash 或索引作为 key
        const planObj = {};
        plan.forEach((p, index) => {
            if (typeof p === 'string') {
                const key = Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 9);
                planObj[key] = {
                    _text: p,
                    _hash: null,
                    _timestamp: Date.now(),
                    _user: null
                };
            } else if (p && typeof p === 'object' && p._hash) {
                // 如果已有 _hash，使用它作为 key
                planObj[p._hash] = p;
            } else if (p && typeof p === 'object') {
                // 如果没有 _hash，生成一个
                const key = Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 9);
                planObj[key] = {
                    ...p,
                    _hash: p._hash || key,
                    _timestamp: p._timestamp || Date.now(),
                    _user: p._user || null
                };
            }
        });
        return planObj;
    }
    // 如果已经是对象，直接返回（但需要确保每个值都有必要的字段）
    if (typeof plan === 'object' && plan !== null && !Array.isArray(plan)) {
        const normalizedPlan = {};
        Object.keys(plan).forEach(key => {
            const item = plan[key];
            if (item) {
                if (typeof item === 'string') {
                    normalizedPlan[key] = {
                        _text: item,
                        _hash: key,
                        _timestamp: Date.now(),
                        _user: null
                    };
                } else if (typeof item === 'object') {
                    normalizedPlan[key] = {
                        ...item,
                        _hash: item._hash || key,
                        _timestamp: item._timestamp || Date.now(),
                        _user: item._user || null
                    };
                }
            }
        });
        return normalizedPlan;
    }
    return {};
}

// 规范化comments数据（数组转对象）
function normalizeComments(comments) {
    if (!comments) return {};
    if (Array.isArray(comments)) {
        const commentsObj = {};
        comments.forEach(comment => {
            if (comment && comment._hash) {
                commentsObj[comment._hash] = comment;
            } else if (comment) {
                // 如果没有 _hash，生成一个
                const hash = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                commentsObj[hash] = {
                    ...comment,
                    _hash: hash
                };
            }
        });
        return commentsObj;
    }
    if (typeof comments === 'object' && comments !== null && !Array.isArray(comments)) {
        return comments;
    }
    return {};
}

// 规范化images数据（数组转对象）
function normalizeImages(images) {
    if (!images) return {};
    if (Array.isArray(images)) {
        const imagesObj = {};
        images.forEach((image, index) => {
            if (image) {
                // 使用索引作为 key，或者如果 image 是对象且有 url，使用 url 的哈希作为 key
                const key = typeof image === 'string' 
                    ? index.toString() 
                    : (image.url ? image.url.split('/').pop().replace(/[.#$\/\[\]]/g, '_') : index.toString());
                imagesObj[key] = typeof image === 'string' ? { url: image } : image;
            }
        });
        return imagesObj;
    }
    if (typeof images === 'object' && images !== null && !Array.isArray(images)) {
        return images;
    }
    return {};
}

// 初始化统一的数据结构
function initializeTripDataStructure(originalData) {
    const tripId = `trip_${Date.now()}`;
    // days 改为对象结构，使用 dayId 作为 key
    const daysObj = {};
    (originalData.days || []).forEach((day, dayIndex) => {
        const dayId = day.id || `day${dayIndex + 1}`;
        
        // items 从数组改为对象结构
        const itemsObj = {};
        (day.items || []).forEach((item, itemIndex) => {
            const itemId = generateItemId(dayId, itemIndex);
            itemsObj[itemId] = {
                id: itemId,
                category: item.category || "",
                time: item.time || "",
                tag: item.tag || "其他",
                plan: normalizePlan(item.plan || []), // 对象结构
                note: item.note || "",
                rating: item.rating || "",
                images: normalizeImages(item.images || []), // 对象结构
                comments: normalizeComments(item.comments || []), // 对象结构
                spend: item.spend || null,
                order: itemIndex,
                _createdAt: new Date().toISOString(),
                _updatedAt: new Date().toISOString()
            };
        });
        
        daysObj[dayId] = {
            id: dayId,
            title: day.title || "",
            items: itemsObj, // 对象结构，使用 itemId 作为 key
            order: dayIndex
        };
    });
    
    // overview从days的title自动生成，不需要单独保存
    // 将 days 对象转换为数组来生成 overview
    const overview = Object.values(daysObj)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(day => day.title || '');
    
    const structure = {
        id: tripId,
        title: originalData.title || "",
        overview: overview, // 从days的title自动生成
        days: daysObj, // 对象结构，使用 dayId 作为 key
        _backup: {}, // 备份已删除的数据（对象结构，时间戳作为 key）
        _version: DATA_STRUCTURE_VERSION,
        _lastSync: null,
        _syncUser: null
    };
    return structure;
}

// 规范化plan数据（支持字符串和数组，转换为对象结构）
// 注意：这个函数已被第38行的 normalizePlan 函数替代，保留此函数仅用于向后兼容
// 实际应该使用第38行的版本，它返回对象结构 {}

// 保存统一数据
function saveUnifiedData(data) {
    data._lastSync = new Date().toISOString();
    data._syncUser = localStorage.getItem('trip_current_user') || null;
    
    try {
        const jsonString = JSON.stringify(data);
        const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
        
        // 检查数据大小（localStorage通常限制在5-10MB）
        if (sizeInMB > 4) {
            console.warn(`⚠️ 统一数据较大 (${sizeInMB.toFixed(2)}MB)，接近localStorage限制。建议清理不需要的数据。`);
        }
        
        // 检查localStorage剩余空间
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
        } catch (e) {

            alert('存储空间不足，请清理浏览器数据或减少数据量。');
            return false;
        }
        
        localStorage.setItem('trip_unified_data', jsonString);
        
        // 统一数据已保存
        
        return true;
    } catch (e) {

        if (e.name === 'QuotaExceededError') {

            alert('数据太大，无法保存。请删除一些不需要的内容。');
            return false;
        }
        return false;
    }
}

// 更新所有现有花销，添加参与人信息（默认mrb和djy共同支付）
function updateExistingExpensesWithParticipants() {
    const unifiedData = loadUnifiedData();
    if (!unifiedData || !unifiedData.days) {
        return;
    }
    
    let updated = false;
    
    // 遍历所有天
    const daysArray = objectToArray(unifiedData.days);
    daysArray.forEach(day => {
        if (!day || !day.items) {
            return;
        }
        
        // 遍历所有项目
        const itemsArray = objectToArray(day.items);
        itemsArray.forEach(item => {
            if (!item || !item.spend || !Array.isArray(item.spend)) {
                return;
            }
            
            // 遍历所有消费项
            item.spend.forEach(spendItem => {
                if (spendItem && !spendItem.participants) {
                    // 为没有参与人信息的消费项添加默认参与人
                    spendItem.participants = ['mrb', 'djy'];
                    updated = true;
                }
            });
        });
    });
    
    // 如果有更新，保存数据
    if (updated) {
        saveUnifiedData(unifiedData);

    }
}

// 加载统一数据
function loadUnifiedData() {
    const data = localStorage.getItem('trip_unified_data');
    if (data) {
        try {
            if (typeof data === 'string') {
                const trimmed = data.trim();
                if (trimmed === '[object Object]') {

                    localStorage.removeItem('trip_unified_data');
                    return null;
                }
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    const parsed = JSON.parse(data);
                    if (parsed && typeof parsed === 'object') {
                        // 确保 days 是对象结构
                        if (!parsed.days || typeof parsed.days !== 'object' || Array.isArray(parsed.days)) {
                            parsed.days = {};
                        }
                        
                        // 【重要修改】trip_unified_data 下不应该有 _backup 字段
                        // _backup 应该是独立的顶级字段，和 trip_unified_data 同级
                        // 因此从 trip_unified_data 中移除 _backup
                        if (parsed._backup) {
                            delete parsed._backup;
                        }
                        
                        // 确保版本号正确
                        if (!parsed._version || parsed._version < DATA_STRUCTURE_VERSION) {
                            parsed._version = DATA_STRUCTURE_VERSION;
                        }
                        
                        return parsed;
                    }
                }
            }
        } catch (e) {

            try {
                localStorage.removeItem('trip_unified_data');

            } catch (clearError) {

            }
        }
    }
    return null;
}

// 获取指定day的数据
function getDayData(unifiedData, dayId) {
    if (!unifiedData || !unifiedData.days || typeof unifiedData.days !== 'object' || Array.isArray(unifiedData.days)) {
        return null;
    }
    
    let targetId = null;
    
    if (typeof dayId === 'string') {
        targetId = dayId;
    } else if (dayId && typeof dayId === 'object' && dayId.id) {
        targetId = String(dayId.id);
    } else if (dayId !== null && dayId !== undefined) {
        targetId = String(dayId);
    } else {
        return null;
    }
    
    return unifiedData.days[targetId] || null;
}

// 获取指定item的数据
function getItemData(unifiedData, dayId, itemId) {
    if (!unifiedData || !unifiedData.days || typeof unifiedData.days !== 'object' || Array.isArray(unifiedData.days)) {
        return null;
    }
    
    let dayIdStr = null;
    if (typeof dayId === 'string') {
        dayIdStr = dayId;
    } else if (dayId && typeof dayId === 'object' && dayId.id) {
        dayIdStr = String(dayId.id);
    } else if (dayId !== null && dayId !== undefined) {
        dayIdStr = String(dayId);
    } else {
        return null;
    }
    
    const day = unifiedData.days[dayIdStr];
    if (!day || !day.items || typeof day.items !== 'object' || Array.isArray(day.items)) {
        return null;
    }
    
    const targetItemId = (typeof itemId === 'object' && itemId !== null && itemId.id) 
        ? String(itemId.id) 
        : String(itemId);
    
    return day.items[targetItemId] || null;
}

// 更新item数据
function updateItemData(unifiedData, dayId, itemId, updates) {
    const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
    if (!item) return false;
    
    Object.assign(item, updates);
    item._updatedAt = new Date().toISOString();
    saveUnifiedData(unifiedData);
    return true;
}

// 添加新item
function addItemData(unifiedData, dayId, itemData) {
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day) return false;
    
    // 确保 items 是对象结构
    if (!day.items || typeof day.items !== 'object' || Array.isArray(day.items)) {
        day.items = {};
    }
    
    // 生成新的 itemId
    const itemCount = Object.keys(day.items).length;
    const newItemId = generateItemId(dayId, itemCount);
    
    const newItem = {
        id: newItemId,
        category: itemData.category || "",
        time: itemData.time || "",
        tag: itemData.tag || "其他",
        plan: normalizePlan(itemData.plan || []), // 对象结构
        note: itemData.note || "",
        rating: itemData.rating || "",
        images: normalizeImages(itemData.images || []), // 对象结构
        comments: normalizeComments(itemData.comments || []), // 对象结构
        spend: itemData.spend || null,
        order: itemCount,
        isCustom: true,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString()
    };
    
    // 使用 itemId 作为 key 添加到 items 对象
    day.items[newItemId] = newItem;
    saveUnifiedData(unifiedData);
    
    // 【关键修复】更新 stateManager 中的 tripData
    if (typeof window !== 'undefined' && window.stateManager) {
        window.stateManager.setState({ tripData: unifiedData });
    }
    
    return newItem;
}

// 删除item（软删除：移到备份中）
/**
 * 创建备份条目（统一的备份方法）
 * @param {Object} unifiedData - 统一数据结构
 * @param {string} type - 备份类型：'item' | 'plan_item' | 'comment'
 * @param {Object} deletedData - 被删除的数据对象（深拷贝）
 * @param {Object} metadata - 元数据：{ dayId, itemId, hash?, index? }
 * @returns {Object} { success: boolean, timestampKey?: string, backupEntry?: Object }
 */
function createBackupEntry(unifiedData, type, deletedData, metadata) {
    // 【修复】确保 unifiedData 是有效的
    if (!unifiedData || typeof unifiedData !== 'object') {

        return { success: false };
    }
    
    // 初始化备份对象（如果不存在）
    if (!unifiedData._backup || typeof unifiedData._backup !== 'object' || unifiedData._backup === null) {
        unifiedData._backup = {};

    }
    
    // 生成唯一的时间戳作为 key（确保唯一性）
    // Firebase 不允许 key 中包含 ".", "#", "$", "/", "[", "]" 等字符
    // 使用纯数字时间戳 + 随机字符串，避免特殊字符
    const timestamp = new Date().toISOString();
    const timestampKey = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // 获取当前用户
    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
    
    // 根据类型创建不同的备份条目
    let backupEntry = {
        _type: type,
        _deletedAt: timestamp,
        _deletedBy: currentUser,
        _dayId: metadata.dayId || null,
        _itemId: metadata.itemId || null,
        _originalItemId: metadata.itemId || null
    };
    
    // 根据类型添加特定的数据字段
    switch (type) {
        case 'item':
            // Item 备份：包含完整的 item 数据
            backupEntry = {
                ...deletedData,
                ...backupEntry,
                _deletedFromDay: metadata.dayId || null
            };
            break;
            
        case 'plan_item':
            // Plan item 备份：包含 plan item 数据
            backupEntry._planItem = deletedData;
            backupEntry._planHash = metadata.hash || null;
            break;
            
        case 'comment':
            // Comment 备份：包含 comment 数据
            backupEntry._comment = deletedData;
            backupEntry._commentHash = metadata.hash || null;
            backupEntry._commentIndex = metadata.index !== undefined ? metadata.index : null;
            break;
            
        default:
            // 默认：直接包含数据
            backupEntry._data = deletedData;
            if (metadata.hash) backupEntry._hash = metadata.hash;
            if (metadata.index !== undefined) backupEntry._index = metadata.index;
            break;
    }
    
    // 使用时间戳作为 key 添加到备份对象
    unifiedData._backup[timestampKey] = backupEntry;
    
    // 保存备份数据到本地 localStorage

    const saveResult = saveUnifiedData(unifiedData);

    // 如果保存成功，同步备份数据到云端作为独立字段
    if (saveResult) {
        // 同步备份数据到云端（只上传新添加的那一条备份项）
        if (typeof window.dataSyncFirebase !== 'undefined' && window.dataSyncFirebase.update) {
            try {
                // 只上传新添加的那一条备份项，使用时间戳作为 key
                const updates = {};
                updates[`_backup/${timestampKey}`] = backupEntry;
                updates['_lastSync'] = new Date().toISOString();
                updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                
                window.dataSyncFirebase.update(window.dataSyncFirebase.databaseRef, updates).then(() => {

                }).catch(backupError => {

                    // 如果备份同步失败，不影响本地操作
                });
            } catch (e) {

                // 同步失败不影响本地操作
            }
        }
        
        // 验证备份是否已保存到本地
        try {
            const localStorageData = localStorage.getItem('trip_unified_data');
            if (localStorageData) {
                const parsedData = JSON.parse(localStorageData);
                if (parsedData && parsedData._backup && typeof parsedData._backup === 'object' && parsedData._backup[timestampKey]) {
                    const backupCount = Object.keys(parsedData._backup).length;

                    return { success: true, timestampKey, backupEntry };
                } else {

                }
            }
        } catch (e) {

        }
    }
    
    return { success: saveResult, timestampKey, backupEntry };
}

function deleteItemData(unifiedData, dayId, itemId) {
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day || !day.items) return false;
    
    // 确保 items 是对象结构
    if (Array.isArray(day.items)) {
        const itemsObj = {};
        day.items.forEach(item => {
            if (item && item.id) {
                itemsObj[item.id] = item;
            }
        });
        day.items = itemsObj;
    }
    
    // 确保 itemId 是字符串
    const targetItemId = String(itemId);
    
    // 从对象中获取 item
    const deletedItem = day.items[targetItemId];
    if (!deletedItem) return false;
    
    // 获取要删除的 item（深拷贝，避免引用问题）
    const itemToBackup = JSON.parse(JSON.stringify(deletedItem));
    
    // 使用统一的备份方法
    const backupResult = createBackupEntry(unifiedData, 'item', itemToBackup, {
        dayId: dayId,
        itemId: targetItemId
    });
    
    if (!backupResult.success) {

        return false;
    }
    
    // 从对象中删除 item（使用 delete 操作符）
    delete day.items[targetItemId];
    
    // 更新 order 字段（重新排序剩余的 items）
    const remainingItems = Object.values(day.items);
    remainingItems.forEach((item, index) => {
        if (item) {
            item.order = index;
        }
    });
    
    // 确保保存包含删除后的数据
    saveUnifiedData(unifiedData);
    
    // 【关键修复】更新 stateManager 中的 tripData
    if (typeof window !== 'undefined' && window.stateManager) {
        window.stateManager.setState({ tripData: unifiedData });
    }
    
    // 【新增】显式触发增量更新请求，将删除操作同步到云端
    // 调用 cloudIncrementalBackup 方法实现"一箭双雕"：
    // 1. 同步删除原位数据（将路径设为 null）
    // 2. 同步新增备份数据（上传到 _backup 节点）
    if (typeof window.dataSyncFirebase !== 'undefined' && window.dataSyncFirebase && window.dataSyncFirebase.cloudIncrementalBackup) {
        try {
            window.dataSyncFirebase.cloudIncrementalBackup(dayId, targetItemId, backupResult.timestampKey, backupResult.backupEntry);

        } catch (e) {

        }
    } else {

    }
    
    // 返回备份信息
    return {
        success: true,
        timestampKey: backupResult.timestampKey,
        backupEntry: backupResult.backupEntry
    };
}

// 恢复已删除的 item（从备份中恢复）
// backupKey: 备份项的 key（时间戳）
function restoreItemFromBackup(unifiedData, backupKey, targetDayId = null) {
    if (!unifiedData || !unifiedData._backup || typeof unifiedData._backup !== 'object' || unifiedData._backup === null) {

        return false;
    }
    
    const backupEntry = unifiedData._backup[backupKey];
    if (!backupEntry) {

        return false;
    }
    
    // 确定目标 dayId（优先使用参数，否则使用备份中的原始 dayId）
    const dayId = targetDayId || backupEntry._deletedFromDay;
    if (!dayId) {

        return false;
    }
    
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day) {

        return false;
    }
    
    // 创建恢复的 item（移除备份相关的元数据）
    const restoredItem = { ...backupEntry };
    delete restoredItem._deletedAt;
    delete restoredItem._deletedBy;
    delete restoredItem._deletedFromDay;
    delete restoredItem._originalItemId;
    delete restoredItem._type;
    
    // 更新恢复时间
    restoredItem._restoredAt = new Date().toISOString();
    restoredItem._restoredBy = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
    
    // 确保 items 是对象结构
    if (!day.items || typeof day.items !== 'object' || Array.isArray(day.items)) {
        day.items = {};
    }
    
    // 获取恢复的 itemId（优先使用备份中的 id，否则生成新的）
    const restoredItemId = restoredItem.id || backupEntry._originalItemId || generateItemId(dayId, Object.keys(day.items).length);
    restoredItem.id = restoredItemId;
    restoredItem.order = Object.keys(day.items).length;
    
    // 使用 itemId 作为 key 添加到 items 对象
    day.items[restoredItemId] = restoredItem;
    
    // 从备份中移除（可选：保留备份记录，只标记为已恢复）
    // 这里选择移除，如果需要保留历史，可以改为标记
    delete unifiedData._backup[backupKey];
    
    // 保存更新后的数据到本地 localStorage
    const saveResult = saveUnifiedData(unifiedData);
    
    // 如果保存成功，同步这些更改到云端
    if (saveResult) {
        // 同步恢复操作到云端
        if (typeof window.dataSyncFirebase !== 'undefined' && window.dataSyncFirebase.update) {
            try {
                const updates = {};
                
                // 1. 从云端 _backup 字段中删除恢复的条目
                updates[`_backup/${backupKey}`] = null; // 使用 null 表示删除
                
                // 2. 更新云端 trip_unified_data 中的数据
                updates[`trip_unified_data/days/${dayId}/items/${restoredItemId}`] = restoredItem;
                
                // 3. 更新元数据
                updates['_lastSync'] = new Date().toISOString();
                updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                
                window.dataSyncFirebase.update(window.dataSyncFirebase.databaseRef, updates).then(() => {

                }).catch(error => {

                    // 如果同步失败，不影响本地恢复
                });
            } catch (e) {

                // 同步失败不影响本地恢复
            }
        }
    }
    
    return true;
}

// 获取所有备份数据（返回对象）
function getBackupData(unifiedData) {
    if (!unifiedData || !unifiedData._backup || typeof unifiedData._backup !== 'object' || unifiedData._backup === null) {
        return {};
    }
    return unifiedData._backup;
}

// 清空所有备份数据
function clearBackupData(unifiedData) {
    if (!unifiedData) {
        return false;
    }
    
    // 清空本地备份数据
    unifiedData._backup = {};
    
    // 保存更新后的数据到本地 localStorage
    const saveResult = saveUnifiedData(unifiedData);
    
    // 如果保存成功，同步清空操作到云端
    if (saveResult) {
        // 同步清空备份操作到云端
        if (typeof window.dataSyncFirebase !== 'undefined' && window.dataSyncFirebase.update) {
            try {
                const updates = {};
                
                // 清空云端 _backup 字段
                updates['_backup'] = {};
                
                // 更新元数据
                updates['_lastSync'] = new Date().toISOString();
                updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                
                window.dataSyncFirebase.update(window.dataSyncFirebase.databaseRef, updates).then(() => {

                }).catch(error => {

                    // 如果同步失败，不影响本地操作
                });
            } catch (e) {

                // 同步失败不影响本地操作
            }
        }
    }
    
    return saveResult;
}

// 导出供全局使用
// 获取统一数据大小（MB）
function getUnifiedDataSize() {
    const data = localStorage.getItem('trip_unified_data');
    if (!data) return 0;
    return new Blob([data]).size / (1024 * 1024);
}

// 添加新的天数
function addDayData(unifiedData, dayTitle = '') {
    if (!unifiedData || !unifiedData.days || typeof unifiedData.days !== 'object' || Array.isArray(unifiedData.days)) {

        return null;
    }
    
    // 计算新的天数序号
    const dayCount = Object.keys(unifiedData.days).length;
    
    // 【改进】使用时间戳 + 随机字符串生成唯一的 dayId
    // 避免在多个设备同步时可能出现的冲突
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const newDayId = `day${dayCount + 1}_${timestamp}_${randomStr}`;
    
    // 创建新的天数
    const newDay = {
        id: newDayId,
        title: dayTitle || `第${dayCount + 1}天`,
        items: {},
        order: dayCount
    };
    
    // 添加到 days 对象
    unifiedData.days[newDayId] = newDay;
    
    // 保存数据
    const saveResult = saveUnifiedData(unifiedData);
    
    if (saveResult) {

        // 【重要修改】添加天数时不再调用 triggerImmediateUpload()
        // 新添加的天数将通过实时监听自动同步到云端

        return newDay;
    } else {

        return null;
    }
}

// 删除天数
function deleteDayData(unifiedData, dayId) {
    if (!unifiedData || !unifiedData.days || typeof unifiedData.days !== 'object' || Array.isArray(unifiedData.days)) {

        return false;
    }
    
    // 检查天数是否存在
    const dayToDelete = unifiedData.days[dayId];
    if (!dayToDelete) {

        return false;
    }
    
    // 深拷贝要删除的天数数据
    const dayToBackup = JSON.parse(JSON.stringify(dayToDelete));
    
    // 创建备份
    const backupResult = createBackupEntry(unifiedData, 'day', dayToBackup, {
        dayId: dayId
    });
    
    if (!backupResult.success) {

        return false;
    }
    
    // 从 days 对象中删除
    delete unifiedData.days[dayId];
    
    // 重新排序剩余的天数
    const remainingDays = Object.values(unifiedData.days);
    remainingDays.forEach((day, index) => {
        if (day) {
            day.order = index;
        }
    });
    
    // 保存数据
    const saveResult = saveUnifiedData(unifiedData);
    
    if (saveResult) {

        // 【重要修改】删除天数时不再调用 triggerImmediateUpload()
        // 备份数据已经在 createBackupEntry 函数中通过增量更新同步到云端
        // 原位数据的删除将通过实时监听自动同步

        return true;
    } else {

        return false;
    }
}

// 导出供全局使用
window.tripDataStructure = {
    initializeTripDataStructure,
    // migrateToUnifiedStructure, // 已废弃，不再使用
    saveUnifiedData,
    loadUnifiedData,
    getDayData,
    getItemData,
    updateItemData,
    addItemData,
    deleteItemData,
    restoreItemFromBackup,
    getBackupData,
    clearBackupData,
    normalizePlan,
    getUnifiedDataSize,
    createBackupEntry,
    updateExistingExpensesWithParticipants,
    addDayData,
    deleteDayData,
    DATA_STRUCTURE_VERSION
};

