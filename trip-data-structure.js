// 统一的数据结构定义和工具函数

// 数据结构版本
const DATA_STRUCTURE_VERSION = 1;

// 生成唯一ID
function generateItemId(dayId, index) {
    return `${dayId}_item_${index}_${Date.now()}`;
}

// 初始化统一的数据结构
function initializeTripDataStructure(originalData) {
    const tripId = `trip_${Date.now()}`;
    const structure = {
        id: tripId,
        title: originalData.title || "",
        overview: originalData.overview || [],
        days: (originalData.days || []).map((day, dayIndex) => ({
            id: day.id || `day${dayIndex + 1}`,
            title: day.title || "",
            items: (day.items || []).map((item, itemIndex) => ({
                id: generateItemId(day.id || `day${dayIndex + 1}`, itemIndex),
                category: item.category || "",
                time: item.time || "",
                tag: item.tag || "其他",
                plan: normalizePlan(item.plan || []),
                note: item.note || "",
                rating: item.rating || "",
                images: [],
                comments: [],
                spend: null,
                order: itemIndex,
                _deleted: false,
                _createdAt: new Date().toISOString(),
                _updatedAt: new Date().toISOString()
            })),
            order: dayIndex
        })),
        _version: DATA_STRUCTURE_VERSION,
        _lastSync: null,
        _syncUser: null
    };
    return structure;
}

// 规范化plan数据（支持字符串和数组）
function normalizePlan(plan) {
    if (!plan) return [];
    if (typeof plan === 'string') {
        return [plan];
    }
    if (Array.isArray(plan)) {
        return plan.map(p => {
            if (typeof p === 'string') {
                return {
                    _text: p,
                    _hash: null,
                    _timestamp: Date.now(),
                    _user: null,
                    _deleted: false
                };
            }
            return p;
        });
    }
    return [];
}

// 数据迁移：将现有分散的localStorage数据合并到新结构
async function migrateToUnifiedStructure(originalData, force = false) {
    console.log('开始数据迁移...', force ? '(强制重新迁移)' : '');
    
    // 检查是否已经有统一结构的数据
    let unifiedData = null;
    const existingUnifiedData = localStorage.getItem('trip_unified_data');
    if (existingUnifiedData && !force) {
        try {
            const parsed = JSON.parse(existingUnifiedData);
            if (parsed._version === DATA_STRUCTURE_VERSION) {
                console.log('已存在统一结构数据，合并最新的分散数据...');
                unifiedData = parsed;
            }
        } catch (e) {
            console.warn('解析现有统一数据失败，重新迁移', e);
        }
    }
    
    // 如果没有现有数据或强制迁移，初始化新结构
    if (!unifiedData) {
        unifiedData = initializeTripDataStructure(originalData);
    }
    
    // 迁移每个day的数据（合并最新的分散数据）
    for (const day of unifiedData.days) {
        const dayId = day.id;
        
        // 迁移标签（如果统一数据中没有或分散数据更新）
        day.items.forEach((item, index) => {
            const tagKey = `trip_tag_${dayId}_${index}`;
            const savedTag = localStorage.getItem(tagKey);
            if (savedTag) {
                // 如果统一数据中没有tag，或者分散数据存在，则使用分散数据
                if (!item.tag || savedTag !== item.tag) {
                    item.tag = savedTag;
                }
            }
        });
        
        // 迁移图片（合并，保留统一数据和分散数据中的所有图片）
        day.items.forEach((item, index) => {
            const imageKey = `trip_images_${dayId}_${index}`;
            const savedImages = localStorage.getItem(imageKey);
            if (savedImages) {
                try {
                    const images = JSON.parse(savedImages);
                    // 合并图片，去重
                    const existingImages = item.images || [];
                    const allImages = [...existingImages, ...images];
                    // 简单的去重（基于URL）
                    item.images = Array.from(new Set(allImages));
                } catch (e) {
                    console.warn(`解析图片数据失败 ${imageKey}:`, e);
                }
            }
        });
        
        // 迁移留言（合并，使用哈希值去重）
        day.items.forEach((item, index) => {
            const commentKey = `trip_comments_${dayId}_${index}`;
            const savedComments = localStorage.getItem(commentKey);
            if (savedComments) {
                try {
                    const comments = JSON.parse(savedComments);
                    const existingComments = item.comments || [];
                    // 使用哈希值去重合并
                    const commentMap = new Map();
                    existingComments.forEach(c => {
                        if (c._hash) commentMap.set(c._hash, c);
                    });
                    comments.forEach(c => {
                        if (c._hash && !commentMap.has(c._hash)) {
                            commentMap.set(c._hash, c);
                        } else if (!c._hash) {
                            // 没有哈希值的旧留言，也添加（可能重复，但保留）
                            commentMap.set(JSON.stringify(c), c);
                        }
                    });
                    item.comments = Array.from(commentMap.values());
                } catch (e) {
                    console.warn(`解析留言数据失败 ${commentKey}:`, e);
                }
            }
        });
        
        // 迁移计划项（如果分散数据存在，使用分散数据）
        day.items.forEach((item, index) => {
            const planKey = `trip_plan_${dayId}_${index}`;
            const savedPlan = localStorage.getItem(planKey);
            if (savedPlan) {
                try {
                    const planData = JSON.parse(savedPlan);
                    if (Array.isArray(planData) && planData.length > 0) {
                        // 如果分散数据存在且有内容，使用分散数据
                        item.plan = planData;
                    }
                } catch (e) {
                    console.warn(`解析计划数据失败 ${planKey}:`, e);
                }
            }
        });
        
        // 迁移自定义项
        const customItemsKey = `trip_custom_items_${dayId}`;
        const savedCustomItems = localStorage.getItem(customItemsKey);
        if (savedCustomItems) {
            try {
                const customItems = JSON.parse(savedCustomItems);
                const validCustomItems = customItems.filter(item => !item._deleted);
                validCustomItems.forEach(customItem => {
                    // 确保自定义项有完整的结构
                    const migratedItem = {
                        id: customItem.id || generateItemId(dayId, day.items.length),
                        category: customItem.category || "",
                        time: customItem.time || "",
                        tag: customItem.tag || "其他",
                        plan: normalizePlan(customItem.plan || []),
                        note: customItem.note || "",
                        rating: customItem.rating || "",
                        images: customItem.images || [],
                        comments: customItem.comments || [],
                        spend: customItem.spend || null,
                        order: customItem.order !== undefined ? customItem.order : day.items.length,
                        isCustom: true,
                        _deleted: false,
                        _createdAt: customItem._createdAt || new Date().toISOString(),
                        _updatedAt: customItem._updatedAt || new Date().toISOString()
                    };
                    day.items.push(migratedItem);
                });
            } catch (e) {
                console.warn(`解析自定义项数据失败 ${customItemsKey}:`, e);
            }
        }
        
        // 迁移卡片顺序
        const orderKey = `trip_card_order_${dayId}`;
        const savedOrder = localStorage.getItem(orderKey);
        if (savedOrder) {
            try {
                const order = JSON.parse(savedOrder);
                // 根据顺序重新排列items
                const itemMap = new Map();
                day.items.forEach(item => {
                    // 对于原始项，使用category+time+plan组合作为key
                    if (!item.isCustom) {
                        const time = item.time || '';
                        const plan = (item.plan && item.plan.length > 0) 
                            ? (typeof item.plan[0] === 'string' ? item.plan[0] : item.plan[0]._text || '')
                            : '';
                        const key = `${item.category || 'item'}_${time}_${plan.substring(0, 20)}`.replace(/\s+/g, '_');
                        itemMap.set(key, item);
                    } else {
                        itemMap.set(item.id, item);
                    }
                });
                
                const orderedItems = [];
                order.forEach(orderItem => {
                    const item = itemMap.get(orderItem.id);
                    if (item) {
                        orderedItems.push(item);
                        itemMap.delete(orderItem.id);
                    }
                });
                
                // 添加未排序的项
                itemMap.forEach(item => {
                    orderedItems.push(item);
                });
                
                day.items = orderedItems;
                // 更新order字段
                day.items.forEach((item, index) => {
                    item.order = index;
                });
            } catch (e) {
                console.warn(`解析顺序数据失败 ${orderKey}:`, e);
            }
        }
    }
    
    // 保存统一结构
    saveUnifiedData(unifiedData);
    
    console.log('数据迁移完成');
    return unifiedData;
}

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
            console.error('❌ localStorage空间不足，无法保存数据:', e);
            alert('存储空间不足，请清理浏览器数据或减少数据量。');
            return false;
        }
        
        localStorage.setItem('trip_unified_data', jsonString);
        
        if (sizeInMB > 1) {
            console.log(`✅ 统一数据已保存 (${sizeInMB.toFixed(2)}MB)`);
        }
        
        return true;
    } catch (e) {
        console.error('保存统一数据失败:', e);
        // 如果数据太大，尝试清理已删除的项
        if (e.name === 'QuotaExceededError') {
            console.warn('存储空间不足，尝试清理已删除的数据...');
            cleanupDeletedData(data);
            try {
                const jsonString = JSON.stringify(data);
                localStorage.setItem('trip_unified_data', jsonString);
                console.log('✅ 清理后保存成功');
                return true;
            } catch (e2) {
                console.error('清理后仍无法保存:', e2);
                alert('数据太大，无法保存。请删除一些不需要的内容。');
                return false;
            }
        }
        return false;
    }
}

// 清理已删除的数据（永久删除标记为_deleted的项）
function cleanupDeletedData(data) {
    if (!data || !data.days) return;
    
    let cleanedCount = 0;
    data.days.forEach(day => {
        if (day.items) {
            const originalLength = day.items.length;
            // 过滤掉已删除的项
            day.items = day.items.filter(item => !item._deleted);
            cleanedCount += originalLength - day.items.length;
            
            // 清理plan中的已删除项
            day.items.forEach(item => {
                if (item.plan && Array.isArray(item.plan)) {
                    const originalPlanLength = item.plan.length;
                    item.plan = item.plan.filter(p => !p._deleted);
                    cleanedCount += originalPlanLength - item.plan.length;
                }
            });
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 清理了 ${cleanedCount} 个已删除的项`);
    }
}

// 加载统一数据
function loadUnifiedData() {
    const data = localStorage.getItem('trip_unified_data');
    if (data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('加载统一数据失败:', e);
            return null;
        }
    }
    return null;
}

// 获取指定day的数据
function getDayData(unifiedData, dayId) {
    if (!unifiedData || !unifiedData.days) return null;
    return unifiedData.days.find(d => d.id === dayId);
}

// 获取指定item的数据
function getItemData(unifiedData, dayId, itemId) {
    const day = getDayData(unifiedData, dayId);
    if (!day) return null;
    return day.items.find(item => item.id === itemId);
}

// 更新item数据
function updateItemData(unifiedData, dayId, itemId, updates) {
    const item = getItemData(unifiedData, dayId, itemId);
    if (!item) return false;
    
    Object.assign(item, updates);
    item._updatedAt = new Date().toISOString();
    saveUnifiedData(unifiedData);
    return true;
}

// 添加新item
function addItemData(unifiedData, dayId, itemData) {
    const day = getDayData(unifiedData, dayId);
    if (!day) return false;
    
    const newItem = {
        id: generateItemId(dayId, day.items.length),
        category: itemData.category || "",
        time: itemData.time || "",
        tag: itemData.tag || "其他",
        plan: normalizePlan(itemData.plan || []),
        note: itemData.note || "",
        rating: itemData.rating || "",
        images: itemData.images || [],
        comments: itemData.comments || [],
        spend: itemData.spend || null,
        order: day.items.length,
        isCustom: true,
        _deleted: false,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString()
    };
    
    day.items.push(newItem);
    saveUnifiedData(unifiedData);
    return newItem;
}

// 删除item（软删除）
function deleteItemData(unifiedData, dayId, itemId) {
    const item = getItemData(unifiedData, dayId, itemId);
    if (!item) return false;
    
    item._deleted = true;
    item._updatedAt = new Date().toISOString();
    saveUnifiedData(unifiedData);
    return true;
}

// 导出供全局使用
// 获取统一数据大小（MB）
function getUnifiedDataSize() {
    const data = localStorage.getItem('trip_unified_data');
    if (!data) return 0;
    return new Blob([data]).size / (1024 * 1024);
}

// 导出供全局使用
window.tripDataStructure = {
    initializeTripDataStructure,
    migrateToUnifiedStructure,
    saveUnifiedData,
    loadUnifiedData,
    getDayData,
    getItemData,
    updateItemData,
    addItemData,
    deleteItemData,
    normalizePlan,
    getUnifiedDataSize,
    cleanupDeletedData,
    DATA_STRUCTURE_VERSION
};

