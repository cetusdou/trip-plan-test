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
    const days = (originalData.days || []).map((day, dayIndex) => ({
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
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString()
        })),
        order: dayIndex
    }));
    
    // overview从days的title自动生成，不需要单独保存
    const overview = days.map(day => day.title || '');
    
    const structure = {
        id: tripId,
        title: originalData.title || "",
        overview: overview, // 从days的title自动生成
        days: days,
        _backup: [], // 备份已删除的数据
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
                    _user: null
                };
            }
            return p;
        });
    }
    return [];
}

// 数据迁移：将现有分散的localStorage数据合并到新结构（已废弃，不再使用）
// 此函数已停用，不再从分散存储合并数据
async function migrateToUnifiedStructure(originalData) {
    // 开始数据迁移
    
    // 检查是否已经有统一结构的数据
    let unifiedData = null;
    const existingUnifiedData = localStorage.getItem('trip_unified_data');
    if (existingUnifiedData) {
        try {
            const parsed = JSON.parse(existingUnifiedData);
            if (parsed._version === DATA_STRUCTURE_VERSION) {
                // 已存在统一结构数据，合并最新的分散数据
                unifiedData = parsed;
            }
        } catch (e) {
            console.warn('解析现有统一数据失败，重新迁移', e);
        }
    }
    
    // 如果没有现有数据，初始化新结构
    if (!unifiedData) {
        unifiedData = initializeTripDataStructure(originalData);
    }
    
    // 迁移每个day的数据（合并最新的分散数据）
    for (const day of unifiedData.days) {
        const dayId = day.id;
        
        // 确保所有item都有images字段（如果缺失则初始化）
        day.items.forEach((item, index) => {
            // 确保 images 是数组
            if (!item.hasOwnProperty('images') || !Array.isArray(item.images)) {
                item.images = Array.isArray(item.images) ? item.images : [];
            }
            // 确保 comments 是数组
            if (!item.hasOwnProperty('comments') || !Array.isArray(item.comments)) {
                item.comments = Array.isArray(item.comments) ? item.comments : [];
            }
            // spend 可能是数组或 null
            if (!item.hasOwnProperty('spend')) {
                item.spend = null;
            } else if (item.spend !== null && !Array.isArray(item.spend)) {
                // 如果 spend 不是数组也不是 null，转换为数组
                item.spend = [item.spend];
            }
        });
        
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
                    // 检查 savedComments 是否已经是对象（统一结构中的情况）
                    let parsedComments;
                    if (typeof savedComments === 'string') {
                        try {
                            parsedComments = JSON.parse(savedComments);
                        } catch (e) {
                            console.warn(`解析留言数据失败 ${commentKey}:`, e);
                            // 跳过这个 item 的 comments 处理，继续下一个
                            return;
                        }
                    } else {
                        // 如果已经是对象，直接使用
                        parsedComments = savedComments;
                    }
                    // 确保解析出来的是数组
                    const comments = Array.isArray(parsedComments) ? parsedComments : (parsedComments ? [parsedComments] : []);
                    const existingComments = Array.isArray(item.comments) ? item.comments : [];
                    // 使用哈希值去重合并
                    const commentMap = new Map();
                    existingComments.forEach(c => {
                        if (c && c._hash) commentMap.set(c._hash, c);
                    });
                    comments.forEach(c => {
                        if (!c) return; // 跳过 null 或 undefined
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
                    // 如果解析失败，确保 comments 至少是空数组
                    if (!Array.isArray(item.comments)) {
                        item.comments = [];
                    }
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
                const validCustomItems = customItems;
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
    
    // 数据迁移完成
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
        
        // 统一数据已保存
        
        return true;
    } catch (e) {
        console.error('保存统一数据失败:', e);
        if (e.name === 'QuotaExceededError') {
            console.warn('存储空间不足，无法保存数据');
            alert('数据太大，无法保存。请删除一些不需要的内容。');
            return false;
        }
        return false;
    }
}

// 加载统一数据
function loadUnifiedData() {
    const data = localStorage.getItem('trip_unified_data');
    if (data) {
        try {
            // localStorage.getItem() 总是返回字符串或 null
            // 如果是字符串，尝试解析
            if (typeof data === 'string') {
                // 检查是否是无效的字符串（如 "[object Object]"）
                const trimmed = data.trim();
                if (trimmed === '[object Object]' || trimmed === '[object Object]') {
                    console.warn('统一数据是无效的字符串 "[object Object]"，已清除');
                    // 清除无效数据
                    localStorage.removeItem('trip_unified_data');
                    return null;
                }
                // 检查是否是有效的JSON字符串
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    const parsed = JSON.parse(data);
                    // 验证解析后的数据结构
                    if (parsed && typeof parsed === 'object') {
                        // 检查是否是 trip_plan_data 而不是 trip_unified_data
                        if (parsed.trip_unified_data && typeof parsed.trip_unified_data === 'object') {
                            console.warn('loadUnifiedData: 检测到嵌套的 trip_unified_data，尝试提取');
                            const nestedUnifiedData = parsed.trip_unified_data;
                            if (nestedUnifiedData.days && Array.isArray(nestedUnifiedData.days)) {
                                // 成功提取嵌套的 trip_unified_data
                                return nestedUnifiedData;
                            } else {
                                console.error('loadUnifiedData: 嵌套的 trip_unified_data 也无效');
                                return null;
                            }
                        }
                        
                        // 检查是否是有效的统一数据结构
                        if (!parsed.days || !Array.isArray(parsed.days)) {
                            console.error('loadUnifiedData: 解析后的数据缺少 days 数组', {
                                hasDays: !!parsed.days,
                                daysType: typeof parsed.days,
                                keys: Object.keys(parsed),
                                parsedId: parsed.id,
                                isTripPlanData: parsed.trip_unified_data !== undefined
                            });
                            // 如果这是 trip_plan_data 结构，尝试提取 trip_unified_data
                            if (parsed.trip_unified_data) {
                                console.warn('loadUnifiedData: 尝试从 trip_plan_data 中提取 trip_unified_data');
                                return parsed.trip_unified_data;
                            }
                            return null;
                        }
                        
                        // 确保 _backup 字段存在（向后兼容）
                        if (!parsed._backup) {
                            parsed._backup = [];
                        }
                        
                        // 验证数据完整性，成功加载统一数据
                        return parsed;
                    } else {
                        console.error('loadUnifiedData: 解析后的数据不是对象', typeof parsed);
                        return null;
                    }
                } else {
                    console.warn('统一数据不是有效的JSON字符串:', data.substring(0, 50));
                    return null;
                }
            }
            // 理论上不应该到达这里，但为了安全起见
            console.warn('统一数据类型不正确:', typeof data);
            return null;
        } catch (e) {
            console.error('加载统一数据失败:', e, '数据:', typeof data === 'string' ? data.substring(0, 100) : data);
            // 如果解析失败，可能是数据损坏，清除它
            try {
                localStorage.removeItem('trip_unified_data');
                console.warn('已清除损坏的统一数据');
            } catch (clearError) {
                console.error('清除损坏数据失败:', clearError);
            }
            return null;
        }
    }
    console.warn('loadUnifiedData: localStorage 中没有 trip_unified_data');
    return null;
}

// 获取指定day的数据
function getDayData(unifiedData, dayId) {
    // 【关键修复】检查参数顺序：如果第一个参数有 days 数组，说明参数顺序可能错了
    if (unifiedData && unifiedData.days && Array.isArray(unifiedData.days)) {
        // 第一个参数是正确的 unifiedData
        // 继续处理
    } else if (unifiedData && typeof unifiedData === 'object' && !unifiedData.days) {
        // 第一个参数可能是 dayId（对象），第二个参数可能是 unifiedData
        // 交换参数
        console.error('getDayData: 参数顺序错误！第一个参数应该是 unifiedData，第二个参数应该是 dayId', {
            firstParam: unifiedData,
            secondParam: dayId,
            firstParamHasDays: !!unifiedData.days,
            secondParamHasDays: dayId && dayId.days ? true : false
        });
        // 尝试交换参数
        const temp = unifiedData;
        unifiedData = dayId;
        dayId = temp;
    } else {
        console.error('getDayData: unifiedData 无效', {
            unifiedData,
            unifiedDataType: typeof unifiedData,
            hasDays: unifiedData && unifiedData.days ? true : false
        });
        return null;
    }
    
    if (!unifiedData || !unifiedData.days) {
        return null;
    }

    // 【核心修复】统一将 dayId 转为字符串，正确处理对象类型
    let targetId = null;
    
    // 【关键检查】如果 dayId 是 unifiedData 对象（有 days 数组），这是错误的调用
    if (dayId && typeof dayId === 'object' && dayId.days && Array.isArray(dayId.days)) {
        console.error('getDayData: 错误！第二个参数是 unifiedData 对象而不是 dayId', {
            dayId,
            dayIdKeys: Object.keys(dayId),
            dayIdHasDays: !!dayId.days,
            availableDayIds: dayId.days ? dayId.days.map(d => d ? d.id : 'null') : []
        });
        return null;
    }
    
    if (typeof dayId === 'string') {
        // 已经是字符串，直接使用
        targetId = dayId;
    } else if (dayId && typeof dayId === 'object') {
        // 如果是对象，尝试提取 id 属性
        if (dayId.id && typeof dayId.id === 'string') {
            targetId = dayId.id;
        } else if (dayId.id) {
            // id 存在但不是字符串，转换为字符串
            targetId = String(dayId.id);
        } else {
            // 对象但没有 id 属性，尝试转换为字符串（可能是误传）
            targetId = String(dayId);
        }
    } else if (dayId !== null && dayId !== undefined) {
        // 其他类型（数字等），转换为字符串
        targetId = String(dayId);
    } else {
        // null 或 undefined
        return null;
    }

    // 检查是否是 tripId（以 trip_ 开头），如果是则报错
    if (targetId && targetId.startsWith('trip_')) {
        console.error('getDayData: 错误！传入的是 tripId 而不是 dayId', {
            tripId: targetId,
            originalDayId: dayId,
            dayIdType: typeof dayId,
            availableDayIds: unifiedData.days.map(d => d ? d.id : 'null')
        });
        return null;
    }
    
    // 最终验证：确保 targetId 是有效的字符串
    if (!targetId || typeof targetId !== 'string') {
        console.error('getDayData: 无法提取有效的 dayId', {
            originalDayId: dayId,
            dayIdType: typeof dayId,
            extractedTargetId: targetId
        });
        return null;
    }

    // 1. 尝试通过 id 属性匹配 (字符串)
    let day = unifiedData.days.find(d => d && String(d.id) === targetId);

    // 2. 如果找不到，尝试将 dayId 当做数组索引匹配 (数字)
    if (!day && !isNaN(targetId) && !isNaN(parseInt(targetId))) {
        const index = parseInt(targetId);
        if (index >= 0 && index < unifiedData.days.length) {
            day = unifiedData.days[index];
            console.warn('getDayData: 通过数组索引找到 day', {
                requestedId: targetId,
                index: index,
                foundDayId: day ? day.id : null
            });
        }
    }
    
    if (!day) {
        const availableDayIds = unifiedData.days.map(d => d ? d.id : 'null');
        console.error(`getDayData: 无法定位日期数据。请求ID: ${targetId}`, {
            requestedId: targetId,
            availableIds: availableDayIds,
            arrayLength: unifiedData.days.length
        });
    } else {
    }
    return day;
}

// 获取指定item的数据
function getItemData(unifiedData, dayId, itemId) {
    // 【关键修复】检查参数：确保 unifiedData 是有效的统一数据对象
    if (!unifiedData || typeof unifiedData !== 'object') {
        console.error('getItemData: unifiedData 无效', {
            unifiedData,
            unifiedDataType: typeof unifiedData
        });
        return null;
    }
    
    // 【关键检查】如果第一个参数是 unifiedData 对象（有 days 数组），继续处理
    if (!unifiedData.days || !Array.isArray(unifiedData.days)) {
        console.error('getItemData: unifiedData 结构不正确，缺少 days 数组', {
            unifiedData,
            unifiedDataKeys: Object.keys(unifiedData),
            hasDays: !!unifiedData.days,
            daysIsArray: Array.isArray(unifiedData.days)
        });
        return null;
    }
    
    // 【关键检查】如果 dayId 是 unifiedData 对象（有 days 数组），这是错误的调用
    if (dayId && typeof dayId === 'object' && dayId.days && Array.isArray(dayId.days)) {
        console.error('getItemData: 错误！第二个参数是 unifiedData 对象而不是 dayId', {
            dayId,
            dayIdKeys: Object.keys(dayId),
            dayIdHasDays: !!dayId.days,
            availableDayIds: dayId.days ? dayId.days.map(d => d ? d.id : 'null') : []
        });
        return null;
    }
    
    // 【核心修复】统一将 dayId 转为字符串，与 getDayData 逻辑保持一致
    let dayIdStr = null;
    
    if (typeof dayId === 'string') {
        // 已经是字符串，直接使用
        dayIdStr = dayId;
    } else if (dayId && typeof dayId === 'object') {
        // 如果是对象，尝试提取 id 属性
        if (dayId.id && typeof dayId.id === 'string') {
            dayIdStr = dayId.id;
        } else if (dayId.id) {
            // id 存在但不是字符串，转换为字符串
            dayIdStr = String(dayId.id);
        } else {
            // 对象但没有 id 属性，尝试转换为字符串（可能是误传）
            dayIdStr = String(dayId);
        }
    } else if (dayId !== null && dayId !== undefined) {
        // 其他类型（数字等），转换为字符串
        dayIdStr = String(dayId);
    } else {
        // null 或 undefined
        return null;
    }
    
    // 检查是否是 tripId（以 trip_ 开头），如果是则报错
    if (dayIdStr && dayIdStr.startsWith('trip_')) {
        console.error('getItemData: 错误！传入的是 tripId 而不是 dayId', {
            tripId: dayIdStr,
            originalDayId: dayId,
            dayIdType: typeof dayId,
            availableDayIds: unifiedData && unifiedData.days ? unifiedData.days.map(d => d ? d.id : 'null') : []
        });
        return null;
    }
    
    // 最终验证：确保 dayIdStr 是有效的字符串
    if (!dayIdStr || typeof dayIdStr !== 'string') {
        console.error('getItemData: 无法提取有效的 dayId', {
            originalDayId: dayId,
            dayIdType: typeof dayId,
            extractedDayIdStr: dayIdStr
        });
        return null;
    }
    
    // 【关键修复】使用 tripDataStructure.getDayData 确保调用正确的函数
    // 避免被全局 window.getDayData (getDayDataByDayId) 覆盖
    const day = tripDataStructure.getDayData(unifiedData, dayIdStr);
    if (!day) {

        return null;
    }
    if (!day.items) {
        console.warn('getItemData: day.items 不存在', { dayId, dayId: day.id });
        return null;
    }

    // 同样，确保 itemId 是字符串进行比较
    const targetItemId = (typeof itemId === 'object' && itemId !== null && itemId.id) 
        ? String(itemId.id) 
        : String(itemId);
    
    // 1. 尝试通过 id 属性匹配
    let item = day.items.find(item => item && String(item.id) === targetItemId);
    
    // 2. 如果找不到，尝试将 itemId 当做数组索引匹配
    if (!item && !isNaN(targetItemId) && !isNaN(parseInt(targetItemId))) {
        const index = parseInt(targetItemId);
        if (index >= 0 && index < day.items.length) {
            item = day.items[index];
            // 通过数组索引找到 item，无需日志
        }
    }
    
    if (!item) {
        // 找不到 item，无需详细日志
    } else {
        // 成功找到 item，无需日志
    }
    
    return item;
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
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString()
    };
    
    day.items.push(newItem);
    saveUnifiedData(unifiedData);
    return newItem;
}

// 删除item（软删除：移到备份中）
function deleteItemData(unifiedData, dayId, itemId) {
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day || !day.items) return false;
    
    const itemIndex = day.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return false;
    
    // 获取要删除的 item（深拷贝，避免引用问题）
    const deletedItem = JSON.parse(JSON.stringify(day.items[itemIndex]));
    
    // 初始化备份数组（如果不存在）
    if (!unifiedData._backup) {
        unifiedData._backup = [];
    }
    
    // 将删除的数据添加到备份中，包含删除时间和用户信息
    const backupEntry = {
        ...deletedItem,
        _deletedAt: new Date().toISOString(),
        _deletedBy: typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null,
        _deletedFromDay: dayId,
        _originalItemId: itemId
    };
    
    unifiedData._backup.push(backupEntry);
    
    // 从原数组中删除
    day.items.splice(itemIndex, 1);
    
    // 更新 order 字段（重新排序剩余的 items）
    day.items.forEach((item, index) => {
        item.order = index;
    });
    
    saveUnifiedData(unifiedData);
    return true;
}

// 恢复已删除的 item（从备份中恢复）
function restoreItemFromBackup(unifiedData, backupIndex, targetDayId = null) {
    if (!unifiedData || !unifiedData._backup || !Array.isArray(unifiedData._backup)) {
        console.error('备份数据不存在或格式不正确');
        return false;
    }
    
    if (backupIndex < 0 || backupIndex >= unifiedData._backup.length) {
        console.error('备份索引无效:', backupIndex);
        return false;
    }
    
    const backupEntry = unifiedData._backup[backupIndex];
    if (!backupEntry) {
        console.error('备份项不存在');
        return false;
    }
    
    // 确定目标 dayId（优先使用参数，否则使用备份中的原始 dayId）
    const dayId = targetDayId || backupEntry._deletedFromDay;
    if (!dayId) {
        console.error('无法确定目标 dayId');
        return false;
    }
    
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day) {
        console.error('目标 day 不存在:', dayId);
        return false;
    }
    
    // 创建恢复的 item（移除备份相关的元数据）
    const restoredItem = { ...backupEntry };
    delete restoredItem._deletedAt;
    delete restoredItem._deletedBy;
    delete restoredItem._deletedFromDay;
    delete restoredItem._originalItemId;
    
    // 更新恢复时间
    restoredItem._restoredAt = new Date().toISOString();
    restoredItem._restoredBy = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
    
    // 添加到目标 day 的 items 数组末尾
    if (!day.items) {
        day.items = [];
    }
    restoredItem.order = day.items.length;
    day.items.push(restoredItem);
    
    // 从备份中移除（可选：保留备份记录，只标记为已恢复）
    // 这里选择移除，如果需要保留历史，可以改为标记
    unifiedData._backup.splice(backupIndex, 1);
    
    saveUnifiedData(unifiedData);
    return true;
}

// 获取所有备份数据
function getBackupData(unifiedData) {
    if (!unifiedData || !unifiedData._backup) {
        return [];
    }
    return unifiedData._backup;
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
    normalizePlan,
    getUnifiedDataSize,
    DATA_STRUCTURE_VERSION
};

