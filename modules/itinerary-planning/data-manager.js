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
// 【重要】此函数返回的 day 对象中，day.items 永远保持为对象结构
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
            return null;
        } else if (dayId.id) {
            cleanDayId = String(dayId.id);
        } else {
            return null;
        }
    } else if (dayId !== null && dayId !== undefined) {
        cleanDayId = String(dayId);
    } else {
        return null;
    }
    
    // 检查是否是 tripId
    if (cleanDayId.startsWith('trip_')) {
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
    
    // 【重要】确保 day.items 永远是对象结构
    if (day.items) {
        // 如果是数组，转换为对象结构
        if (Array.isArray(day.items)) {
            const itemsObj = {};
            day.items.forEach(item => {
                if (item && item.id) {
                    itemsObj[item.id] = item;
                }
            });
            day.items = itemsObj;
        } else if (typeof day.items !== 'object' || day.items === null) {
            day.items = {};
        }
        
        // 确保所有item都有必要的字段
        Object.values(day.items).forEach(item => {
            if (!item.id) {
                item.id = `${cleanDayId}_item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            }
            if (!item.tag) {
                item.tag = item.category || '其他';
            }
            if (!item.images || typeof item.images !== 'object' || Array.isArray(item.images)) {
                item.images = {};
            }
            if (!item.comments || typeof item.comments !== 'object' || Array.isArray(item.comments)) {
                item.comments = {};
            }
            if (!item.hasOwnProperty('spend')) {
                item.spend = null;
            }
        });
    } else {
        day.items = {};
    }
    
    return day;
}

// 获取指定日期的所有items（已排序和过滤）
function getDayItems(dayId) {
    const day = getDayDataByDayId(dayId);
    if (!day || !day.items) {
        return [];
    }
    
    // 关键修复：day.items 现在是对象结构，需要转换为数组
    let itemsArray = [];
    if (Array.isArray(day.items)) {
        itemsArray = day.items;
    } else if (typeof day.items === 'object' && day.items !== null) {
        // 对象结构：转换为数组
        itemsArray = Object.values(day.items).filter(item => item !== null && item !== undefined);
    }
    
    // 应用保存的顺序
    const orderedItems = applyCardOrder(dayId, itemsArray);
    
    // 应用过滤器（如果存在）
    if (typeof window.applyFilter === 'function') {
        return window.applyFilter(orderedItems, dayId);
    }
    
    return orderedItems;
}

// 工具函数：检查写权限和数据结构
// @param {string|null} dayId - 天数ID（对于 addDay 操作可以为 null）
function validateWriteOperation(dayId) {
    if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
        return false;
    }
    
    // 对于 addDay 操作，dayId 可以为空（因为是添加新的一天）
    // 但对于其他操作（addItem, deleteItem, deleteDay 等），dayId 是必需的
    if (dayId === undefined) {
        // dayId 为 undefined 表示这是 addDay 操作，允许通过
    } else if (!dayId) {
        return false;
    }
    
    if (typeof tripDataStructure === 'undefined') {
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
    
    console.log(`[refreshUI] 触发刷新，dayId: ${dayId}, itemId: ${itemId}`);
    
    // 通过事件总线通知 UI 刷新
    if (typeof window.eventBus !== 'undefined') {
        console.log(`[refreshUI] 发送事件: UI_REFRESH_REQUESTED`);
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
    if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
        alert('请先加入该行程后再添加内容');
        return;
    }
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        alert('无法加载数据');
        return;
    }
    
    const newItem = tripDataStructure.addItemData(unifiedData, dayId, itemData);
    if (!newItem) {
        alert('添加项失败');
        return;
    }
    
    // 通过事件总线通知数据更新（标记为本地触发，避免同步死循环）
    if (window.stateManager){
        window.stateManager.setState({
            days: unifiedData.days
        });
    }
    if (typeof window.eventBus !== 'undefined') {
        const realDay = tripDataStructure.getDayData(unifiedData, dayId);
        const finalDayId = realDay?realDay.id:dayId;
        window.eventBus.emit(window.EventTypes.ITEM_ADDED, {
            dayId: finalDayId,
            itemId: newItem.id,
            item: newItem,
            source: 'local'  // 标记为本地触发
        });
        
        // 触发同步（但不刷新UI，避免重复渲染）
        window.eventBus.emit(window.EventTypes.SYNC_REQUESTED, {
            dayId,
            itemId: newItem.id,
            source: 'local'  // 标记为本地触发
        });
    } else {
        refreshUIAndSync(dayId, newItem.id);
    }

    // 兜底：直接重渲染当前天，确保新卡片立即出现（不依赖事件/模糊匹配是否命中）
    try {
        const realDay = tripDataStructure.getDayData(unifiedData, dayId);
        const renderId = realDay ? realDay.id : dayId;
        if (window.UIRenderer && typeof window.UIRenderer.renderDay === 'function') {
            window.UIRenderer.renderDay(renderId);
        }
    } catch (e) { /* 重渲染失败不阻塞添加 */ }
}

// 辅助函数：回退上传整个 items 数组（当无法找到索引时）
function fallbackUploadItemsArray(dayId, dayIndex, items) {
    if (typeof window.dataSyncFirebase === 'undefined' || !window.dataSyncFirebase.cloudIncrementalUpdate) {
        return;
    }
    
    // 如果 dayIndex 为 null，尝试获取
    if (dayIndex === null || dayIndex === undefined) {
        dayIndex = window.dataSyncFirebase.getDayIndex ? window.dataSyncFirebase.getDayIndex(dayId) : null;
    }
    
    if (dayIndex === null) {
        if (window.dataSyncFirebase.upload) {
            window.dataSyncFirebase.upload(true).catch(error => {
            });
        }
        return;
    }
    
    // 将 items 对象转换为数组（如果它是对象）
    let itemsArray = [];
    if (Array.isArray(items)) {
        itemsArray = items;
    } else if (typeof items === 'object' && items !== null) {
        // 对象结构：转换为数组（按 order 排序）
        itemsArray = Object.values(items).sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 999999;
            const orderB = b.order !== undefined ? b.order : 999999;
            return orderA - orderB;
        });
    }
    
    // 上传整个 items 数组
    window.dataSyncFirebase.cloudIncrementalUpdate(`days/${dayIndex}`, { items: itemsArray }, false).then(result => {
        if (result.success) {
        } else {
        }
    }).catch(error => {
    });
}

// 删除行程项（软删除：移到备份中）
function deleteItem(dayId, itemId) {
    if (!validateWriteOperation(dayId)) return;
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        return;
    }
    
    const deleteResult = tripDataStructure.deleteItemData(unifiedData, dayId, itemId);
    if (!deleteResult || !deleteResult.success) {
        if (deleteResult && deleteResult.reason === 'not_member') {
            alert('请先加入该行程后再操作');
        } else if (deleteResult && deleteResult.reason === 'not_owner') {
            alert('只能删除自己添加的内容');
        }
        return;
    }
    
    // 成功删除项（已移到备份中）
    // 确保 _backup 字段存在且已初始化（对象结构）
    if (!unifiedData._backup || typeof unifiedData._backup !== 'object' || unifiedData._backup === null) {
        unifiedData._backup = {};
        tripDataStructure.saveUnifiedData(unifiedData);
    }
    
    // 通过事件总线通知数据更新（标记为本地触发，避免同步死循环）
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.ITEM_DELETED, {
            dayId,
            itemId,
            source: 'local'  // 标记为本地触发
        });
    }
    
    // 【关键优化】使用 Firebase 原子更新进行细粒度同步
    if (typeof window.dataSyncFirebase !== 'undefined' && window.dataSyncFirebase && window.dataSyncFirebase.update) {
        const { timestampKey, backupEntry } = deleteResult;
        if (timestampKey && backupEntry) {
            // 原子更新：同时更新备份和删除 item
            const updates = {};
            updates[`trip_unified_data/_backup/${timestampKey}`] = backupEntry;
            updates[`trip_unified_data/days/${dayId}/items/${itemId}`] = null; // 设置为 null 来删除
            updates['_lastSync'] = new Date().toISOString();
            updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
            
            window.dataSyncFirebase.update(window.dataSyncFirebase.databaseRef, updates).then(() => {
            }).catch(deleteError => {
                // 如果直接删除失败，尝试回退方案
                const latestUnifiedData = tripDataStructure.loadUnifiedData();
                const day = tripDataStructure.getDayData(latestUnifiedData, dayId);
                if (day && day.items && window.dataSyncFirebase.cloudIncrementalUpdate) {
                    // 回退：上传整个 items 对象
                    let itemsArray = [];
                    if (Array.isArray(day.items)) {
                        itemsArray = day.items;
                    } else if (typeof day.items === 'object' && day.items !== null) {
                        itemsArray = Object.values(day.items).sort((a, b) => {
                            const orderA = a.order !== undefined ? a.order : 999999;
                            const orderB = b.order !== undefined ? b.order : 999999;
                            return orderA - orderB;
                        });
                    }
                    
                    window.dataSyncFirebase.cloudIncrementalUpdate(`days/${dayId}`, { items: itemsArray }, false).then(itemsResult => {
                        if (!itemsResult.success && window.dataSyncFirebase.upload) {
                            window.dataSyncFirebase.upload(true).catch(() => {});
                        }
                    }).catch(() => {
                        if (window.dataSyncFirebase.upload) {
                            window.dataSyncFirebase.upload(true).catch(() => {});
                        }
                    });
                }
            });
        }
    }
    
    // 刷新UI
    refreshUI(dayId, { itemId });
}

// 应用卡片顺序
function applyCardOrder(dayId, items) {
    // 关键修复：items 现在可能是对象结构或数组，需要先转换为数组
    let itemsArray = [];
    
    // 确保 items 是有效值
    if (!items) {
        return [];
    }
    
    if (Array.isArray(items)) {
        itemsArray = items.filter(item => item !== null && item !== undefined);
    } else if (typeof items === 'object' && items !== null) {
        // 对象结构：转换为数组
        try {
            itemsArray = Object.values(items).filter(item => item !== null && item !== undefined);
        } catch (e) {
            return [];
        }
    } else {
        // 如果 items 类型不正确，返回空数组
        return [];
    }
    
    // 只使用统一结构中的order字段
    if (typeof tripDataStructure === 'undefined') {
        // 如果没有统一结构，直接按order字段排序
        return itemsArray.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        return itemsArray.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    const day = tripDataStructure.getDayData(unifiedData, dayId);
    if (!day || !day.items) {
        return itemsArray.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    // day.items 现在也是对象结构，需要转换为数组
    let dayItemsArray = [];
    if (Array.isArray(day.items)) {
        dayItemsArray = day.items;
    } else if (typeof day.items === 'object' && day.items !== null) {
        dayItemsArray = Object.values(day.items).filter(item => item !== null && item !== undefined);
    }
    
    // 创建itemId到item的映射
    const itemMap = new Map();
    itemsArray.forEach(item => {
        if (item && item.id) {
            itemMap.set(item.id, item);
        }
    });
    
    // 按order排序统一结构中的items
    const orderedItems = dayItemsArray
        .filter(item => item && item.id && itemMap.has(item.id))
        .sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 999999;
            const orderB = b.order !== undefined ? b.order : 999999;
            return orderA - orderB;
        })
        .map(item => itemMap.get(item.id))
        .filter(item => item !== undefined && item !== null);
    
    // 添加没有在统一结构中的项（新添加的项）
    const orderedIds = new Set(orderedItems.map(item => item.id).filter(id => id));
    itemsArray.forEach(item => {
        if (item && item.id && !orderedIds.has(item.id)) {
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

// 添加天数
function addDay() {
    if (!validateWriteOperation()) return;
    if (typeof window.canEditCurrentTrip === 'function' && !window.canEditCurrentTrip()) {
        alert('请先加入该行程后再添加内容');
        return;
    }
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        alert('无法加载数据');
        return;
    }
    
    const newDay = tripDataStructure.addDayData(unifiedData);
    if (!newDay) {
        alert('添加天数失败');
        return;
    }
    
    // 确保 dayId 是字符串
    const newDayId = String(newDay.id);
    
    // 通过事件总线通知数据更新（标记为本地触发，避免同步死循环）
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.DAY_ADDED, {
            dayId: newDayId,
            day: newDay,
            source: 'local'  // 标记为本地触发
        });
    }
    
    // 刷新导航和UI
    if (window.UIRenderer) {
        window.UIRenderer.renderNavigation();
        // 自动跳转到新添加的天数
        window.UIRenderer.renderDay(newDayId);
    }
    
    // 触发同步
    if (typeof window.triggerImmediateUpload === 'function') {
        window.triggerImmediateUpload();
    }
}

// 删除天数
function deleteDay(dayId) {
    // 确保 dayId 是字符串
    const targetDayId = String(dayId);
    if (!validateWriteOperation()) return;
    
    // 确认删除
    if (!confirm('确定要删除这一天吗？此操作会删除这一天的所有行程项。')) {
        return;
    }
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        return;
    }
    
    const deleteResult = tripDataStructure.deleteDayData(unifiedData, targetDayId);
    if (!deleteResult) {
        alert('删除天数失败');
        return;
    }
    
    // 通过事件总线通知数据更新（标记为本地触发，避免同步死循环）
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.DAY_DELETED, {
            dayId: targetDayId,
            source: 'local'  // 标记为本地触发
        });
    }
    
    // 刷新导航和UI
    if (window.UIRenderer) {
        window.UIRenderer.renderNavigation();
        // 如果删除的是当前显示的天数，跳转到第一天
        const currentDayId = window.stateManager ? window.stateManager.getState('currentDayId') : null;
        if (currentDayId === targetDayId) {
            // 跳转到第一天
            const daysArray = tripDataStructure.objectToArray(unifiedData.days);
            if (daysArray.length > 0) {
                const firstDayId = String(daysArray[0].id);
                window.UIRenderer.renderDay(firstDayId);
            }
        }
    }
    
    // 触发同步
    if (typeof window.triggerImmediateUpload === 'function') {
        window.triggerImmediateUpload();
    }
}

// 导出到全局
window.loadTripData = loadTripData;
window.getDayData = getDayDataByDayId; // 保持向后兼容，但内部使用新名称
window.getDayItems = getDayItems;
window.addItem = addItem;
window.deleteItem = deleteItem;
window.addDay = addDay;
window.deleteDay = deleteDay;
window.applyCardOrder = applyCardOrder;
window.getAllEditedData = getAllEditedData;
window.refreshUI = refreshUI;
window.refreshUIAndSync = refreshUIAndSync;

