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
    // 关键修复：day.items 现在是对象结构，需要适配
    if (day.items) {
        let itemsArray = [];
        if (Array.isArray(day.items)) {
            itemsArray = day.items;
        } else if (typeof day.items === 'object' && day.items !== null) {
            // 对象结构：转换为数组进行处理
            itemsArray = Object.values(day.items).filter(item => item !== null && item !== undefined);
        }
        
        itemsArray.forEach(item => {
            // 确保 images 是对象结构（如果原来是数组，需要转换）
            if (item.images) {
                if (Array.isArray(item.images)) {
                    // 从数组转换为对象
                    const imagesObj = {};
                    item.images.forEach((img, index) => {
                        if (img) {
                            const key = typeof img === 'string' ? index.toString() : (img.url ? img.url.split('/').pop().replace(/[.#$\/\[\]]/g, '_') : index.toString());
                            imagesObj[key] = typeof img === 'string' ? { url: img } : img;
                        }
                    });
                    item.images = imagesObj;
                } else if (typeof item.images !== 'object' || item.images === null) {
                    item.images = {};
                }
            } else {
                item.images = {};
            }
            
            // 确保 comments 是对象结构（如果原来是数组，需要转换）
            if (item.comments) {
                if (Array.isArray(item.comments)) {
                    // 从数组转换为对象
                    const commentsObj = {};
                    item.comments.forEach(comment => {
                        if (comment && comment._hash) {
                            commentsObj[comment._hash] = comment;
                        } else if (comment) {
                            const hash = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                            comment._hash = hash;
                            commentsObj[hash] = comment;
                        }
                    });
                    item.comments = commentsObj;
                } else if (typeof item.comments !== 'object' || item.comments === null) {
                    item.comments = {};
                }
            } else {
                item.comments = {};
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
        
        // 如果原来是对象结构，将处理后的数组转换回对象
        if (!Array.isArray(day.items)) {
            const itemsObj = {};
            itemsArray.forEach(item => {
                if (item && item.id) {
                    itemsObj[item.id] = item;
                }
            });
            day.items = itemsObj;
        } else {
            // 如果是数组，直接排序（但不修改原数组，因为数组已经在统一结构中按 order 排序）
            // day.items 已经是排序后的数组
        }
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

// 辅助函数：回退上传整个 items 数组（当无法找到索引时）
function fallbackUploadItemsArray(dayId, dayIndex, items) {
    if (typeof window.dataSyncFirebase === 'undefined' || !window.dataSyncFirebase.cloudIncrementalUpdate) {
        console.warn('dataSyncFirebase 未定义，无法上传 items');
        return;
    }
    
    // 如果 dayIndex 为 null，尝试获取
    if (dayIndex === null || dayIndex === undefined) {
        dayIndex = window.dataSyncFirebase.getDayIndex ? window.dataSyncFirebase.getDayIndex(dayId) : null;
    }
    
    if (dayIndex === null) {
        console.warn(`无法找到 dayId=${dayId} 的索引，回退到全量上传`);
        if (window.dataSyncFirebase.upload) {
            window.dataSyncFirebase.upload(true).catch(error => {
                console.error('回退全量上传失败:', error);
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
            console.log(`回退：已上传整个 items 数组，items 数量: ${itemsArray.length}`);
        } else {
            console.warn('回退上传 items 数组失败:', result.message);
        }
    }).catch(error => {
        console.error('回退上传 items 数组出错:', error);
    });
}

// 删除行程项（软删除：移到备份中）
function deleteItem(dayId, itemId) {
    if (!validateWriteOperation(dayId)) return;
    
    const unifiedData = tripDataStructure.loadUnifiedData();
    if (!unifiedData) {
        console.error('无法加载统一数据');
        return;
    }
    
    const deleteResult = tripDataStructure.deleteItemData(unifiedData, dayId, itemId);
    if (!deleteResult || !deleteResult.success) {
        console.error('删除项失败:', itemId);
        return;
    }
    
    // 成功删除项（已移到备份中）
    // 确保 _backup 字段存在且已初始化（对象结构）
    if (!unifiedData._backup || typeof unifiedData._backup !== 'object' || unifiedData._backup === null) {
        unifiedData._backup = {};
        tripDataStructure.saveUnifiedData(unifiedData);
    }
    
    // 通过事件总线通知数据更新
    if (typeof window.eventBus !== 'undefined') {
        window.eventBus.emit(window.EventTypes.ITEM_DELETED, {
            dayId,
            itemId
        });
    }
    
    // 使用增量更新来只上传新添加的备份项（而不是整个备份对象）
    // _backup 现在是对象结构，使用 update 方法只更新新添加的那一条
    if (typeof window.dataSyncFirebase !== 'undefined' && window.dataSyncFirebase && window.dataSyncFirebase.cloudIncrementalUpdate) {
        const { timestampKey, backupEntry } = deleteResult;
        if (timestampKey && backupEntry) {
            // 只上传新添加的那一条备份项，使用时间戳作为 key
            // 直接更新 _backup/{timestampKey} 路径，使用 update 方法只更新这一条
            const updates = {};
            updates[`_backup/${timestampKey}`] = backupEntry;
            updates['_lastSync'] = new Date().toISOString();
            updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
            
            window.dataSyncFirebase.update(window.dataSyncFirebase.databaseRef, updates).then(() => {
                console.log(`删除项后已增量更新备份字段，备份 key: ${timestampKey}`);
                    // 备份字段更新成功，现在还需要更新 day.items（对象结构）
                    // 关键修复：items 现在是对象结构，需要删除特定的 item，而不是替换整个 items
                    // 获取更新后的 day 数据
                    const latestUnifiedData = tripDataStructure.loadUnifiedData();
                    const day = tripDataStructure.getDayData(latestUnifiedData, dayId);
                    if (day && day.items) {
                        // days 和 items 现在都是对象结构，直接使用 dayId 和 itemId 删除
                        // 路径格式：days/{dayId}/items/{itemId}
                        const updates = {};
                        updates[`trip_unified_data/days/${dayId}/items/${itemId}`] = null; // 设置为 null 来删除
                        updates['_lastSync'] = new Date().toISOString();
                        updates['_syncUser'] = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'unknown' : 'unknown';
                        
                        window.dataSyncFirebase.update(window.dataSyncFirebase.databaseRef, updates).then(() => {
                            console.log(`删除项后已删除云端 item，dayId: ${dayId}, itemId: ${itemId}`);
                        }).catch(deleteError => {
                            console.error('删除云端 item 出错:', deleteError);
                            // 如果直接删除失败（可能是 Firebase 中还是数组格式），尝试上传整个 items 对象
                            // 将 items 对象转换为数组（按 order 排序）作为回退方案
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
                            
                            // 回退：使用 cloudIncrementalUpdate 上传整个 items 数组
                            window.dataSyncFirebase.cloudIncrementalUpdate(`days/${dayId}`, { items: itemsArray }, false).then(itemsResult => {
                                if (itemsResult.success) {
                                    console.log(`回退：已上传整个 items 数组，items 数量: ${itemsArray.length}`);
                                } else {
                                    console.warn('回退上传 items 数组失败:', itemsResult.message);
                                    // 最终回退：全量上传
                                    if (window.dataSyncFirebase.upload) {
                                        window.dataSyncFirebase.upload(true).catch(uploadError => {
                                            console.error('最终回退全量上传也失败:', uploadError);
                                        });
                                    }
                                }
                            }).catch(itemsError => {
                                console.error('回退上传 items 数组出错:', itemsError);
                                // 最终回退：全量上传
                                if (window.dataSyncFirebase.upload) {
                                    window.dataSyncFirebase.upload(true).catch(uploadError => {
                                        console.error('最终回退全量上传也失败:', uploadError);
                                    });
                                }
                            });
                        });
                    }
            }).catch(error => {
                console.error('删除项后增量更新备份字段出错:', error);
                // 如果增量更新失败，回退到全量上传
                if (window.dataSyncFirebase.upload) {
                    window.dataSyncFirebase.upload(true).catch(uploadError => {
                        console.error('回退全量上传也失败:', uploadError);
                    });
                }
            });
        } else {
            console.warn('删除项成功，但未获取到备份信息，跳过备份同步');
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
            console.error('applyCardOrder: 转换 items 对象失败', { dayId, items, error: e });
            return [];
        }
    } else {
        // 如果 items 类型不正确，返回空数组
        console.warn('applyCardOrder: items 类型不正确', { dayId, items, itemsType: typeof items });
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

