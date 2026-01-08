// 数据同步功能 - 使用Firebase Realtime Database
// Firebase SDK 通过 ES6 模块在 index.html 中加载

class DataSyncFirebase {
    constructor() {
        this.database = null;
        this.databaseRef = null;
        this.syncInterval = null;
        this.autoSyncEnabled = localStorage.getItem('trip_auto_sync') === 'true';
        this.listeners = [];
        this.isInitialized = false;
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

    // 获取所有本地数据（与Gist版本兼容）
    getAllLocalData() {
        const data = {};
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

    // 设置所有本地数据（与Gist版本兼容）
    setAllLocalData(data) {
        Object.keys(data).forEach(key => {
            localStorage.setItem(key, data[key]);
        });
    }

    // 上传数据到云端
    async upload() {
        try {
            if (!this.isConfigured()) {
                throw new Error('Firebase未初始化，请先配置');
            }

            const data = this.getAllLocalData();
            
            // 添加时间戳
            data._lastSync = new Date().toISOString();
            data._syncUser = localStorage.getItem('trip_current_user') || 'unknown';

            // 上传到Firebase（使用新的 SDK API）
            await this.set(this.databaseRef, data);
            
            return { success: true, message: '同步成功！' };
        } catch (error) {
            return { success: false, message: `上传失败: ${error.message}` };
        }
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

            if (!remoteData) {
                return { success: false, message: '云端没有数据' };
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
                                const merged = [...localParsed];
                                remoteParsed.forEach(item => {
                                    const itemStr = JSON.stringify(item);
                                    if (!merged.some(existing => JSON.stringify(existing) === itemStr)) {
                                        merged.push(item);
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
            const unsubscribe = this.onValue(this.databaseRef, (snapshot) => {
                const remoteData = snapshot.val();
                if (remoteData) {
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
                                    const merged = [...localParsed];
                                    remoteParsed.forEach(item => {
                                        const itemStr = JSON.stringify(item);
                                        if (!merged.some(existing => JSON.stringify(existing) === itemStr)) {
                                            merged.push(item);
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
                if (typeof updateSyncStatus === 'function') {
                    updateSyncStatus('数据已实时更新', 'success');
                }
                // 刷新当前页面显示
                if (typeof currentDayId !== 'undefined' && currentDayId) {
                    if (typeof showDay === 'function') {
                        showDay(currentDayId);
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

