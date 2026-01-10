// 数据管理模块
// 负责行程数据的加载、保存、自定义项管理等操作

// 统一数据获取器 - 只从统一结构读取，确保 UI 永远只从一个源头拿数据
function loadTripData() {
    // 只从统一结构加载，移除 trip_data_cache 的旧逻辑
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData) {
            return {
                title: unifiedData.title || '行程计划',
                days: unifiedData.days || [],
                overview: (unifiedData.days || []).map(day => day.title || '')
            };
        }
    }
    
    // 如果没有统一结构，返回空结构（等待从数据库加载）
    return {
        title: '行程计划',
        days: [],
        overview: []
    };
}

// 获取指定日期的数据（统一数据获取入口）
function getDayDataByDayId(dayId) {
    if (typeof tripDataStructure === 'undefined') {
        return null;
    }
    
    // 【关键修复】确保 dayId 是字符串，并且不是 unifiedData 对象
    let cleanDayId = null;
    if (typeof dayId === 'string') {
        cleanDayId = dayId;
    } else if (dayId && typeof dayId === 'object') {
        // 检查是否是 unifiedData 对象（有 days 数组）
        if (dayId.days && Array.isArray(dayId.days)) {
            console.error('getDayDataByDayId: 错误！传入的是 unifiedData 对象而不是 dayId');
            return null;
        } else if (dayId.id) {
            cleanDayId = String(dayId.id);
        } else {
            console.error('getDayDataByDayId: dayId 是对象但没有 id 属性');
            return null;
        }
    } else if (dayId !== null && dayId !== undefined) {
        cleanDayId = String(dayId);
    } else {
        console.error('getDayDataByDayId: dayId 为 null 或 undefined');
        return null;
    }
    
    // 检查是否是 tripId
    if (cleanDayId.startsWith('trip_')) {
        console.error('getDayDataByDayId: 错误！传入的是 tripId 而不是 dayId');
        return null;
    }
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        return null;
    }
    
    const day = tripDataStructure.getDayData(unifiedData, cleanDayId);
    if (!day) {
        return null;
    }
    
    // 确保所有item都有必要的字段
    if (day.items && Array.isArray(day.items)) {
        day.items.forEach(item => {
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
            if (!item.id) {
                // 统一结构中的item缺少id，生成临时id
                item.id = `${cleanDayId}_item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            }
            if (!item.tag) {
                item.tag = item.category || '其他';
            }
        });
        
        // 按order排序
        day.items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    return day;
}

// 获取指定日期的所有items（已排序和过滤）
function getDayItems(dayId) {
    const day = getDayDataByDayId(dayId);
    if (!day || !day.items) {
        return [];
    }
    
    // 应用保存的顺序
    const orderedItems = applyCardOrder(dayId, day.items);
    
    // 应用过滤器（如果存在）
    if (typeof window.applyFilter === 'function') {
        return window.applyFilter(orderedItems, dayId);
    }
    
    return orderedItems;
}

// 工具函数：检查写权限和数据结构
function validateWriteOperation(dayId) {
    if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
        console.error('操作失败：没有写权限');
        return false;
    }
    
    if (!dayId) {
        console.error('操作失败：dayId为空');
        return false;
    }
    
    if (typeof tripDataStructure === 'undefined') {
        console.error('tripDataStructure 未定义，无法操作数据');
        alert('数据管理系统未初始化');
        return false;
    }
    
    return true;
}

// 统一的 UI 刷新机制 - 使用事件总线
// 通过事件总线通知 UI 刷新，实现模块解耦
function refreshUI(dayId, options = {}) {
    const { 
        itemId = null,           // 如果有 itemId，使用增量更新
        skipSync = false,         // 是否跳过同步
        preserveInputs = true     // 是否保护输入框状态
    } = options;
    
    // 通过事件总线通知 UI 刷新
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.UI_REFRESH_REQUESTED, {
            dayId,
            itemId,
            preserveInputs
        });
    } else {
        // 降级方案：如果没有事件总线，使用直接调用
        if (typeof window.currentSlider !== 'undefined' && window.currentSlider && window.currentSlider.dayId === dayId) {
            window.currentSlider.renderCards();
            window.currentSlider.attachCardEventsForAll();
        } else if (typeof window.showDay === 'function') {
            window.showDay(dayId);
        }
    }
    
    // 触发同步（如果需要）
    if (!skipSync) {
        if (typeof window.eventBus !== 'undefined') {
            window.eventBus.emit(window.EventTypes.SYNC_REQUESTED, {
                dayId,
                itemId
            });
        } else {
            // 降级方案：直接调用同步函数
            if (itemId && typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                    console.error('上传 item 失败:', error);
                    if (typeof window.triggerImmediateUpload === 'function') {
                        window.triggerImmediateUpload();
                    }
                });
            } else if (typeof window.triggerImmediateUpload === 'function') {
                window.triggerImmediateUpload();
            }
        }
    }
}

// 工具函数：刷新UI和触发同步（保持向后兼容）
function refreshUIAndSync(dayId, itemId = null) {
    refreshUI(dayId, { itemId });
}

// 添加行程项
function addItem(dayId, itemData) {
    if (!validateWriteOperation(dayId)) return;
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        console.error('无法加载统一数据');
        alert('无法加载数据');
        return;
    }
    
    const newItem = tripDataStructure.addItemData(unifiedData, dayId, itemData);
    if (!newItem) {
        console.error('添加项失败');
        alert('添加项失败');
        return;
    }
    
    // 成功保存项到统一结构
    
    // 通过事件总线通知数据更新
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.ITEM_ADDED, {
            dayId,
            itemId: newItem.id,
            item: newItem
        });
    }
    
    // 刷新UI和同步
    refreshUIAndSync(dayId, newItem.id);
}

// 删除行程项（软删除：移到备份中）
function deleteItem(dayId, itemId) {
    if (!validateWriteOperation(dayId)) return;
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        console.error('无法加载统一数据');
        return;
    }
    
    const success = tripDataStructure.deleteItemData(unifiedData, dayId, itemId);
    if (!success) {
        console.error('删除项失败:', itemId);
        return;
    }
    
    // 成功删除项（已移到备份中）
    
    // 通过事件总线通知数据更新
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.ITEM_DELETED, {
            dayId,
            itemId
        });
    }
    
    // 刷新UI和同步（备份数据会自动包含在 unifiedData 中上传）
    refreshUIAndSync(dayId);
}

// 应用卡片顺序
function applyCardOrder(dayId, items) {
    // 只使用统一结构中的order字段
    if (typeof tripDataStructure === 'undefined') {
        // 如果没有统一结构，直接按order字段排序
        return items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        return items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day || !day.items) {
        return items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    // 创建itemId到item的映射
    const itemMap = new Map();
    items.forEach(item => {
        if (item.id) {
            itemMap.set(item.id, item);
        }
    });
    
    // 按order排序统一结构中的items
    const orderedItems = day.items
        .filter(item => itemMap.has(item.id))
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(item => itemMap.get(item.id))
        .filter(item => item !== undefined);
    
    // 添加没有在统一结构中的项（新添加的项）
    const orderedIds = new Set(orderedItems.map(item => item.id));
    items.forEach(item => {
        if (item.id && !orderedIds.has(item.id)) {
            orderedItems.push(item);
        }
    });
    
    return orderedItems;
}

// 获取所有编辑的数据（用于导出）
// 注意：由于所有数据都在统一结构中，此函数主要用于导出旧格式的兼容数据
function getAllEditedData() {
    // 所有数据都在统一结构中，直接返回空对象
    // 如果需要导出，应该使用统一数据结构
    return {
        timestamp: new Date().toISOString(),
        note: '所有数据都在统一结构中，请使用统一数据结构导出'
    };
}

// 导出到全局
window.loadTripData = loadTripData;
window.getDayData = getDayDataByDayId; // 保持向后兼容，但内部使用新名称
window.getDayItems = getDayItems;
window.addItem = addItem;
window.deleteItem = deleteItem;
window.applyCardOrder = applyCardOrder;
window.getAllEditedData = getAllEditedData;
window.refreshUI = refreshUI;
window.refreshUIAndSync = refreshUIAndSync;

