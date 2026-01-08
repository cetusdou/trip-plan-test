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
            
            // 合并远程items
            (remoteDay.items || []).forEach(remoteItem => {
                const localItem = itemMap.get(remoteItem.id);
                if (localItem) {
                    // 合并item属性（优先使用更新的）
                    const localUpdated = new Date(localItem._updatedAt || 0);
                    const remoteUpdated = new Date(remoteItem._updatedAt || 0);
                    if (remoteUpdated > localUpdated) {
                        // 远程更新，使用远程数据
                        itemMap.set(remoteItem.id, { ...remoteItem });
                    } else {
                        // 本地更新，保留本地数据，但合并comments和images
                        localItem.comments = mergeComments(localItem.comments || [], remoteItem.comments || []);
                        localItem.images = mergeArrays(localItem.images || [], remoteItem.images || []);
                        itemMap.set(remoteItem.id, localItem);
                    }
                } else {
                    // 远程有新item，添加
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

// 合并留言数组（使用哈希值去重）
function mergeComments(localComments, remoteComments) {
    const commentMap = new Map();
    localComments.forEach(c => {
        if (c._hash) commentMap.set(c._hash, c);
    });
    remoteComments.forEach(c => {
        if (c._hash && !commentMap.has(c._hash)) {
            commentMap.set(c._hash, c);
        }
    });
    return Array.from(commentMap.values());
}

// 合并数组（去重）
function mergeArrays(localArray, remoteArray) {
    return Array.from(new Set([...localArray, ...remoteArray]));
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
        // 优先处理统一结构数据
        if (data['trip_unified_data'] && typeof tripDataStructure !== 'undefined') {
            try {
                const unifiedData = JSON.parse(data['trip_unified_data']);
                tripDataStructure.saveUnifiedData(unifiedData);
                // 删除统一数据键，避免重复处理
                delete data['trip_unified_data'];
            } catch (e) {
                console.warn('解析统一数据失败:', e);
            }
        }
        
        // 处理其他数据
        Object.keys(data).forEach(key => {
            localStorage.setItem(key, data[key]);
        });
    }

    // 上传数据到云端（带防抖）
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
            const hasRealData = dataKeys.some(key => key !== '_lastSync' && key !== '_syncUser');
            
            if (!hasRealData) {
                const pathInfo = this.dbPath || '未知路径';
                return { 
                    success: false, 
                    message: `云端数据为空（只有元数据）。\n\n路径: ${pathInfo}\n数据键: ${dataKeys.join(', ')}\n\n请先上传数据，然后再尝试下载。` 
                };
            }

            // 移除元数据
            delete remoteData._lastSync;
            delete remoteData._syncUser;

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
                    this.setAllLocalData(remoteData);
                    return { success: true, message: '同步成功！已从云端加载数据。', data: remoteData };
                }
                
                // 本地有数据，使用合并策略
                const mergedData = { ...localData };
                
                // 优先处理统一结构数据
                if (remoteData['trip_unified_data'] || localData['trip_unified_data']) {
                    const localUnified = localData['trip_unified_data'] ? JSON.parse(localData['trip_unified_data']) : null;
                    const remoteUnified = remoteData['trip_unified_data'] ? JSON.parse(remoteData['trip_unified_data']) : null;
                    
                    if (remoteUnified && localUnified) {
                        // 合并两个统一结构
                        const mergedUnified = mergeUnifiedData(localUnified, remoteUnified);
                        mergedData['trip_unified_data'] = JSON.stringify(mergedUnified);
                    } else if (remoteUnified) {
                        // 只有远程有统一结构，使用远程的
                        mergedData['trip_unified_data'] = remoteData['trip_unified_data'];
                    } else if (localUnified) {
                        // 只有本地有统一结构，保留本地的
                        mergedData['trip_unified_data'] = localData['trip_unified_data'];
                    }
                    
                    // 删除已处理的键，避免重复处理
                    delete remoteData['trip_unified_data'];
                    delete localData['trip_unified_data'];
                }
                
                Object.keys(remoteData).forEach(key => {
                    if (!localData[key]) {
                        mergedData[key] = remoteData[key];
                    } else {
                        try {
                            const localValue = localData[key];
                            const remoteValue = remoteData[key];
                            
                            const localParsed = JSON.parse(localValue);
                            const remoteParsed = JSON.parse(remoteValue);
                            
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
                this.setAllLocalData(remoteData);
            }
            
            return { success: true, message: '同步成功！数据已更新。', data: remoteData };
        } catch (error) {
            return { success: false, message: `下载失败: ${error.message}` };
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

