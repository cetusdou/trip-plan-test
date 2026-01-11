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
                        // days 现在是对象结构，不是数组
                        if (!parsed.days || (typeof parsed.days !== 'object' || parsed.days === null || Array.isArray(parsed.days))) {
                            // 如果 days 不存在或不是对象（而是数组或 null），可能是旧数据，在迁移阶段处理
                            if (!parsed.days) {
                                parsed.days = {};
                            }
                        }
                        
                        // 检查版本，如果是旧版本，进行数据迁移
                        const currentVersion = parsed._version || 1;
                        let needMigration = currentVersion < DATA_STRUCTURE_VERSION;
                        let needSave = false;
                        
                        // 首先检查 days 是否为数组（旧格式），如果是，需要迁移为对象结构
                        if (parsed.days && Array.isArray(parsed.days)) {
                            const daysObj = {};
                            parsed.days.forEach(day => {
                                if (day && day.id) {
                                    daysObj[day.id] = day;
                                }
                            });
                            parsed.days = daysObj;
                            needSave = true;
                            needMigration = true;
                            console.log('已从数组格式迁移 days 到对象格式');
                        } else if (!parsed.days || typeof parsed.days !== 'object' || parsed.days === null || Array.isArray(parsed.days)) {
                            // 如果 days 不存在或格式不正确，初始化为空对象
                            parsed.days = {};
                            needSave = true;
                        }
                        
                        // 确保 _backup 字段存在（向后兼容：支持从数组迁移到对象）
                        if (!parsed._backup) {
                            parsed._backup = {};
                            needSave = true;
                        } else if (Array.isArray(parsed._backup)) {
                            // 如果是从旧数组格式迁移过来的，转换为对象格式
                            const backupObj = {};
                            parsed._backup.forEach((entry, index) => {
                                if (entry && entry._deletedAt) {
                                    const safeKey = String(entry._deletedAt).replace(/[.#$\/\[\]]/g, '_') + '_' + Date.now() + '_' + index;
                                    backupObj[safeKey] = entry;
                                } else if (entry) {
                                    const timestamp = Date.now() + '_' + index;
                                    entry._deletedAt = new Date().toISOString();
                                    backupObj[timestamp] = entry;
                                }
                            });
                            parsed._backup = backupObj;
                            needSave = true;
                            needMigration = true;
                            console.log('已从数组格式迁移 _backup 到对象格式');
                        } else if (typeof parsed._backup !== 'object' || parsed._backup === null) {
                            parsed._backup = {};
                            needSave = true;
                        }
                        
                        // 迁移 items、plan、comments、images 从数组到对象
                        if (needMigration || currentVersion < DATA_STRUCTURE_VERSION) {
                            console.log('开始数据迁移：将数组结构转换为对象结构');
                            
                            // 迁移 days 从数组到对象结构
                            if (parsed.days) {
                                // 如果 days 是数组，转换为对象结构
                                if (Array.isArray(parsed.days)) {
                                    const daysObj = {};
                                    parsed.days.forEach(day => {
                                        if (day && day.id) {
                                            daysObj[day.id] = day;
                                        }
                                    });
                                    parsed.days = daysObj;
                                    needSave = true;
                                } else if (typeof parsed.days !== 'object' || parsed.days === null) {
                                    // 如果 days 不是对象或为 null，初始化为空对象
                                    parsed.days = {};
                                    needSave = true;
                                }
                                
                                // 迁移 days 中的 items（确保每个 day 的 items 都是对象结构）
                                Object.keys(parsed.days).forEach(dayId => {
                                    const day = parsed.days[dayId];
                                    if (!day) return;
                                    
                                    if (day && Array.isArray(day.items)) {
                                        // 将 items 数组转换为对象
                                        const itemsObj = {};
                                        day.items.forEach(item => {
                                            if (item && item.id) {
                                                // 迁移 item 内的 plan、comments、images
                                                if (Array.isArray(item.plan)) {
                                                    item.plan = normalizePlan(item.plan);
                                                } else if (!item.plan || typeof item.plan !== 'object') {
                                                    item.plan = normalizePlan(item.plan || []);
                                                }
                                                
                                                if (Array.isArray(item.comments)) {
                                                    item.comments = normalizeComments(item.comments);
                                                } else if (!item.comments || typeof item.comments !== 'object') {
                                                    item.comments = normalizeComments(item.comments || []);
                                                }
                                                
                                                if (Array.isArray(item.images)) {
                                                    item.images = normalizeImages(item.images);
                                                } else if (!item.images || typeof item.images !== 'object') {
                                                    item.images = normalizeImages(item.images || []);
                                                }
                                                
                                                itemsObj[item.id] = item;
                                            }
                                        });
                                        day.items = itemsObj;
                                        needSave = true;
                                    } else if (day && day.items && typeof day.items === 'object' && !Array.isArray(day.items)) {
                                        // 如果已经是对象，但内部的 plan/comments/images 可能是数组，也需要迁移
                                        Object.keys(day.items).forEach(itemId => {
                                            const item = day.items[itemId];
                                            if (item) {
                                                if (Array.isArray(item.plan)) {
                                                    item.plan = normalizePlan(item.plan);
                                                    needSave = true;
                                                }
                                                if (Array.isArray(item.comments)) {
                                                    item.comments = normalizeComments(item.comments);
                                                    needSave = true;
                                                }
                                                if (Array.isArray(item.images)) {
                                                    item.images = normalizeImages(item.images);
                                                    needSave = true;
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                            
                            // 更新版本号
                            parsed._version = DATA_STRUCTURE_VERSION;
                            needSave = true;
                            console.log('数据迁移完成：已转换为对象结构');
                        }
                        
                        // 如果进行了迁移，保存回 localStorage
                        if (needSave) {
                            try {
                                saveUnifiedData(parsed);
                                console.log('已保存迁移后的数据');
                            } catch (e) {
                                console.warn('迁移数据后保存失败:', e);
                            }
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
    // 【关键修复】检查参数顺序：如果第一个参数有 days（数组或对象），说明参数顺序可能错了
    if (unifiedData && unifiedData.days && (Array.isArray(unifiedData.days) || (typeof unifiedData.days === 'object' && unifiedData.days !== null))) {
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
    
    // 【关键检查】如果 dayId 是 unifiedData 对象（有 days），这是错误的调用
    if (dayId && typeof dayId === 'object' && dayId.days) {
        const availableDayIds = dayId.days && typeof dayId.days === 'object' && !Array.isArray(dayId.days)
            ? Object.keys(dayId.days).filter(id => id)
            : (Array.isArray(dayId.days) ? dayId.days.map(d => d ? d.id : 'null') : []);
        console.error('getDayData: 错误！第二个参数是 unifiedData 对象而不是 dayId', {
            dayId,
            dayIdKeys: Object.keys(dayId),
            dayIdHasDays: !!dayId.days,
            availableDayIds: availableDayIds
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
        const availableDayIds = unifiedData.days && typeof unifiedData.days === 'object' && !Array.isArray(unifiedData.days)
            ? Object.keys(unifiedData.days).filter(id => id)
            : (Array.isArray(unifiedData.days) ? unifiedData.days.map(d => d ? d.id : 'null') : []);
        console.error('getDayData: 错误！传入的是 tripId 而不是 dayId', {
            tripId: targetId,
            originalDayId: dayId,
            dayIdType: typeof dayId,
            availableDayIds: availableDayIds
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

    // days 现在是对象结构 {dayId: dayData}
    // 如果 days 是数组（旧数据），先转换为对象
    if (Array.isArray(unifiedData.days)) {
        const daysObj = {};
        unifiedData.days.forEach(day => {
            if (day && day.id) {
                daysObj[day.id] = day;
            }
        });
        unifiedData.days = daysObj;
        // 保存迁移后的数据
        if (typeof saveUnifiedData === 'function') {
            saveUnifiedData(unifiedData);
        }
    }
    
    // 确保 days 是对象结构
    if (!unifiedData.days || typeof unifiedData.days !== 'object' || unifiedData.days === null || Array.isArray(unifiedData.days)) {
        unifiedData.days = {};
        return null;
    }
    
    // 直接从对象中获取 day（使用 dayId 作为 key）
    const day = unifiedData.days[targetId];
    
    if (!day) {
        const availableDayIds = Object.keys(unifiedData.days).filter(id => id);
        console.error(`getDayData: 无法定位日期数据。请求ID: ${targetId}`, {
            requestedId: targetId,
            availableIds: availableDayIds,
            daysCount: Object.keys(unifiedData.days).length
        });
        return null;
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
    
    // 【关键检查】days 现在是对象结构 {dayId: dayData}，不再是数组
    // 如果 days 是数组（旧数据），先转换为对象
    if (!unifiedData.days) {
        console.error('getItemData: unifiedData 结构不正确，缺少 days', {
            unifiedData,
            unifiedDataKeys: Object.keys(unifiedData),
            hasDays: !!unifiedData.days
        });
        return null;
    }
    
    // 如果 days 是数组（旧数据），转换为对象结构
    if (Array.isArray(unifiedData.days)) {
        const daysObj = {};
        unifiedData.days.forEach(day => {
            if (day && day.id) {
                daysObj[day.id] = day;
            }
        });
        unifiedData.days = daysObj;
        // 保存迁移后的数据
        if (typeof saveUnifiedData === 'function') {
            saveUnifiedData(unifiedData);
        }
    } else if (typeof unifiedData.days !== 'object' || unifiedData.days === null) {
        console.error('getItemData: unifiedData.days 类型不正确，应该是对象结构', {
            unifiedData,
            unifiedDataKeys: Object.keys(unifiedData),
            hasDays: !!unifiedData.days,
            daysType: typeof unifiedData.days,
            daysIsArray: Array.isArray(unifiedData.days)
        });
        unifiedData.days = {}; // 初始化为空对象
        return null;
    }
    
    // 【关键检查】如果 dayId 是 unifiedData 对象（有 days），这是错误的调用
    if (dayId && typeof dayId === 'object' && dayId.days) {
        const availableDayIds = dayId.days && typeof dayId.days === 'object' && !Array.isArray(dayId.days)
            ? Object.keys(dayId.days).filter(id => id)
            : (Array.isArray(dayId.days) ? dayId.days.map(d => d ? d.id : 'null') : []);
        console.error('getItemData: 错误！第二个参数是 unifiedData 对象而不是 dayId', {
            dayId,
            dayIdKeys: Object.keys(dayId),
            dayIdHasDays: !!dayId.days,
            availableDayIds: availableDayIds
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
            availableDayIds: unifiedData && unifiedData.days 
                ? (typeof unifiedData.days === 'object' && !Array.isArray(unifiedData.days)
                    ? Object.keys(unifiedData.days).filter(id => id)
                    : (Array.isArray(unifiedData.days) ? unifiedData.days.map(d => d ? d.id : 'null') : []))
                : []
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
    // items 现在是对象结构 {itemId: itemData}
    // 如果 day.items 是数组（旧数据），需要先迁移
    if (!day.items) {
        console.warn('getItemData: day.items 不存在', { dayId, dayId: day.id });
        return null;
    }
    
    // 处理旧数据：如果 items 是数组，转换为对象
    if (Array.isArray(day.items)) {
        const itemsObj = {};
        day.items.forEach(item => {
            if (item && item.id) {
                itemsObj[item.id] = item;
            }
        });
        day.items = itemsObj;
        // 保存迁移后的数据
        if (typeof saveUnifiedData === 'function') {
            saveUnifiedData(unifiedData);
        }
    }
    
    // 确保 items 是对象
    if (typeof day.items !== 'object' || day.items === null || Array.isArray(day.items)) {
        day.items = {};
        return null;
    }

    // 同样，确保 itemId 是字符串进行比较
    const targetItemId = (typeof itemId === 'object' && itemId !== null && itemId.id) 
        ? String(itemId.id) 
        : String(itemId);
    
    // 直接从对象中获取 item
    const item = day.items[targetItemId];
    
    return item || null;
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
    
    // 保存备份数据
    saveUnifiedData(unifiedData);
    
    // 验证备份是否已保存
    const savedData = loadUnifiedData();
    if (savedData && savedData._backup && typeof savedData._backup === 'object' && savedData._backup[timestampKey]) {
        const backupCount = Object.keys(savedData._backup).length;
        console.log(`已创建备份条目（类型: ${type}），当前备份数量: ${backupCount}，备份 key: ${timestampKey}`);
        return { success: true, timestampKey, backupEntry };
    } else {
        console.warn(`警告：备份条目（类型: ${type}）可能未正确保存`);
        return { success: false };
    }
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
        console.error('创建备份失败，取消删除操作');
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
        console.error('备份数据不存在或格式不正确');
        return false;
    }
    
    const backupEntry = unifiedData._backup[backupKey];
    if (!backupEntry) {
        console.error('备份项不存在，key:', backupKey);
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
    
    saveUnifiedData(unifiedData);
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
    unifiedData._backup = {};
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
    DATA_STRUCTURE_VERSION
};

