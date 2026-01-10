// 数据同步功能 - 使用Firebase Realtime Database
// Firebase SDK 通过 ES6 模块在 index.html 中加载

// 同步哈希生成函数（用于合并时处理旧数据，生成确定性哈希）
// 注意：这是同步版本，用于合并逻辑中。新数据应该使用 generateContentHash（异步）
function generateSyncHash(content, user, timestamp) {
    const hashString = `${content}|${user}|${timestamp}`;
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
        const char = hashString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 16);
}

// 工具函数：安全解析统一数据结构
// 注意：Firebase 返回的已经是对象，此函数主要用于兼容旧数据（localStorage 中的字符串）
function parseUnifiedData(data) {
    if (!data) return null;
    
    // 如果已经是对象，直接使用（Firebase 返回的情况）
    if (typeof data === 'object' && data !== null) {
        return data;
    }
    
    // 如果是字符串，尝试解析（localStorage 中的旧数据）
    if (typeof data === 'string') {
        const trimmed = data.trim();
        // 检查是否是无效的字符串
        if (trimmed === '[object Object]') {
            console.warn('统一数据是无效的字符串 "[object Object]"');
            return null;
        }
        // 检查是否是有效的 JSON 字符串
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.warn('解析 JSON 字符串失败:', e);
                return null;
            }
        }
        console.warn('统一数据不是有效的 JSON 字符串:', trimmed.substring(0, 50));
        return null;
    }
    
    console.warn('统一数据格式不正确:', typeof data);
    return null;
}

// 工具函数：获取当前用户
function getCurrentUser() {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
}

// 工具函数：合并点赞对象（提取重复逻辑）
function mergeLikesObject(localLikes, remoteLikes, currentUser) {
    if (!localLikes && !remoteLikes) return null;
    if (!localLikes) return remoteLikes;
    if (!remoteLikes) return localLikes;
    
    const mergedLikes = {};
    const allSections = new Set([...Object.keys(localLikes), ...Object.keys(remoteLikes)]);
    
    for (const section of allSections) {
        mergedLikes[section] = mergeLikesIncremental(
            localLikes[section] || [],
            remoteLikes[section] || [],
            currentUser
        );
    }
    
    return mergedLikes;
}

// 合并统一结构数据
function mergeUnifiedData(localData, remoteData) {
    // 验证参数
    if (!localData || typeof localData !== 'object') {
        console.error('mergeUnifiedData: localData 无效', localData);
        return remoteData || null;
    }
    if (!remoteData || typeof remoteData !== 'object') {
        console.error('mergeUnifiedData: remoteData 无效', remoteData);
        return localData || null;
    }
    
    // 确保 days 是数组
    const localDays = Array.isArray(localData.days) ? localData.days : [];
    const remoteDays = Array.isArray(remoteData.days) ? remoteData.days : [];
    
    // 合并days数组
    const mergedDays = [];
    const dayMap = new Map();
    
    // 先添加本地days
    localDays.forEach(day => {
        if (day && day.id) {
            dayMap.set(day.id, { ...day });
        }
    });
    
    // 合并远程days
    remoteDays.forEach(remoteDay => {
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
                        // 远程更新，使用远程数据，但合并comments、images、plan和_likes
                        remoteItem.comments = mergeComments(localItem.comments || [], remoteItem.comments || []);
                        remoteItem.images = mergeArrays(localItem.images || [], remoteItem.images || []);
                        remoteItem.plan = mergePlanItems(localItem.plan || [], remoteItem.plan || []);
                        // 合并点赞
                        remoteItem._likes = mergeLikesObject(localItem._likes, remoteItem._likes, getCurrentUser());
                        itemMap.set(remoteItem.id, remoteItem);
                    } else {
                    // 本地更新，保留本地数据，但合并comments、images、plan和_likes
                    // 对于 plan：如果本地更新，以本地为准，只添加远程中本地没有的新项
                    localItem.comments = mergeComments(localItem.comments || [], remoteItem.comments || []);
                    localItem.images = mergeArrays(localItem.images || [], remoteItem.images || []);
                    localItem.plan = mergePlanItemsWithLocalPriority(localItem.plan || [], remoteItem.plan || []);
                    // 合并点赞（本地优先）
                    localItem._likes = mergeLikesObject(remoteItem._likes, localItem._likes, getCurrentUser());
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

// 增量更新点赞数组：保留远程的所有点赞，只根据本地操作添加/删除当前用户
function mergeLikesIncremental(localLikes, remoteLikes, currentUser) {
    if (!currentUser) {
        // 如果没有当前用户信息，直接返回远程的点赞
        return remoteLikes || localLikes || [];
    }
    
    // 转换旧格式到新格式
    const normalizeLikes = (likes) => {
        if (Array.isArray(likes)) {
            return likes;
        } else if (typeof likes === 'object' && likes !== null) {
            // 旧格式：{ mrb: boolean, djy: boolean }
            return Object.keys(likes).filter(k => likes[k]);
        }
        return [];
    };
    
    const remoteLikesArray = normalizeLikes(remoteLikes);
    const localLikesArray = normalizeLikes(localLikes);
    
    // 以远程的点赞数组为基础（保留所有用户的点赞）
    const mergedLikes = [...remoteLikesArray];
    
    // 检查本地是否有当前用户的点赞操作
    const localHasUser = localLikesArray.includes(currentUser);
    const remoteHasUser = remoteLikesArray.includes(currentUser);
    
    // 如果本地的状态与远程不同，说明本地有操作，应用本地的操作
    if (localHasUser !== remoteHasUser) {
        if (localHasUser) {
            // 本地用户点赞了，但远程没有，添加
            if (!mergedLikes.includes(currentUser)) {
                mergedLikes.push(currentUser);
            }
        } else {
            // 本地用户取消点赞了，但远程有，删除
            const index = mergedLikes.indexOf(currentUser);
            if (index > -1) {
                mergedLikes.splice(index, 1);
            }
        }
    }
    
    return mergedLikes;
}

// 合并留言数组（使用哈希值去重，相同哈希值以最新的为准）
function mergeComments(localComments, remoteComments) {
    const commentMap = new Map();
    
    // 先添加本地留言
    localComments.forEach(c => {
        // 过滤掉 null 和 undefined
        if (!c) {
            return;
        }
        if (c._hash) {
            commentMap.set(c._hash, c);
        } else {
            // 没有哈希值的旧数据：使用内容生成确定性哈希（向后兼容）
            // 这样每次合并时，相同内容的旧数据会得到相同的哈希，避免重复
            const message = c.message || '';
            const user = c.user || '';
            // 修复：只使用内容和用户生成哈希，不使用时间戳
            const deterministicHash = generateSyncHash(message, user, null);
            // 为旧数据添加哈希值，避免下次合并时再次生成
            c._hash = deterministicHash;
            commentMap.set(deterministicHash, c);
        }
    });
    
    // 合并远程留言
    remoteComments.forEach(c => {
        // 过滤掉 null 和 undefined
        if (!c) {
            return;
        }
        if (c._hash) {
            const existing = commentMap.get(c._hash);
            if (existing) {
                // 哈希值相同，比较时间戳，保留最新的，但合并 _likes 字段
                const localTime = new Date(existing._timestamp || existing._updatedAt || 0);
                const remoteTime = new Date(c._timestamp || c._updatedAt || 0);
                if (remoteTime > localTime) {
                    // 使用远程数据，但增量更新 _likes（只更新当前用户的点赞状态）
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    c._likes = mergeLikesIncremental(existing._likes, c._likes, currentUser);
                    commentMap.set(c._hash, c);
                } else {
                    // 保留本地的，但增量更新远程的 _likes（只更新当前用户的点赞状态）
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    existing._likes = mergeLikesIncremental(c._likes, existing._likes, currentUser);
                }
                // 否则保留本地的（已存在）
            } else {
                // 哈希值不同，添加新的
                commentMap.set(c._hash, c);
            }
        } else {
            // 没有哈希值的旧数据：使用内容生成确定性哈希（向后兼容）
            const message = c.message || '';
            const user = c.user || '';
            // 修复：只使用内容和用户生成哈希，不使用时间戳
            const deterministicHash = generateSyncHash(message, user, null);
            const existing = commentMap.get(deterministicHash);
            if (existing) {
                // 如果本地已有相同哈希的留言，比较时间戳，保留最新的
                const localTime = new Date(existing.timestamp || existing._timestamp || 0);
                const remoteTime = new Date(c.timestamp || c._timestamp || 0);
                if (remoteTime > localTime) {
                    c._hash = deterministicHash;
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    c._likes = mergeLikesIncremental(existing._likes, c._likes, currentUser);
                    commentMap.set(deterministicHash, c);
                } else {
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    existing._likes = mergeLikesIncremental(c._likes, existing._likes, currentUser);
                }
            } else {
                // 为旧数据添加哈希值
                c._hash = deterministicHash;
                commentMap.set(deterministicHash, c);
            }
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
        // 过滤掉 null 和 undefined
        if (!p) {
            return;
        }
        // plan 项可能是字符串或对象
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (!planObj) {
            return;
        }
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
        // 过滤掉 null 和 undefined
        if (!p) {
            return;
        }
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (!planObj) {
            return;
        }
        if (planObj._hash) {
            const existing = planMap.get(planObj._hash);
            if (existing) {
                // 哈希值相同，比较时间戳，保留最新的，但合并 _likes 字段
                const localTime = new Date(existing._timestamp || existing._updatedAt || 0);
                const remoteTime = new Date(planObj._timestamp || planObj._updatedAt || 0);
                if (remoteTime > localTime) {
                    // 使用远程数据，但增量更新 _likes（只更新当前用户的点赞状态）
                    // mergeLikesIncremental(localLikes, remoteLikes, currentUser) - 以 remoteLikes 为基础，应用 localLikes 中当前用户的操作
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    planObj._likes = mergeLikesIncremental(existing._likes, planObj._likes, currentUser);
                    planMap.set(planObj._hash, planObj);
                } else {
                    // 保留本地的，但增量更新远程的 _likes（只更新当前用户的点赞状态）
                    // mergeLikesIncremental(localLikes, remoteLikes, currentUser) - 以 remoteLikes 为基础，应用 localLikes 中当前用户的操作
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    existing._likes = mergeLikesIncremental(existing._likes, planObj._likes, currentUser);
                }
                // 否则保留本地的（已存在）
            } else {
                // 哈希值不同，添加新的
                planMap.set(planObj._hash, planObj);
            }
        } else {
            // 没有哈希值的旧数据：使用内容生成确定性哈希（向后兼容）
            const text = planObj._text || JSON.stringify(planObj);
            const user = planObj._user || '';
            // 修复：只使用内容和用户生成哈希，不使用时间戳
            const deterministicHash = generateSyncHash(text, user, null);
            const existing = planMap.get(deterministicHash);
            if (existing) {
                // 比较时间戳，保留最新的，但合并 _likes
                const localTime = new Date(existing._timestamp || existing._updatedAt || 0);
                const remoteTime = new Date(planObj._timestamp || planObj._updatedAt || 0);
                if (remoteTime > localTime) {
                    planObj._hash = deterministicHash;
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    planObj._likes = mergeLikesIncremental(existing._likes, planObj._likes, currentUser);
                    planMap.set(deterministicHash, planObj);
                } else {
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    existing._likes = mergeLikesIncremental(existing._likes, planObj._likes, currentUser);
                }
            } else {
                // 为旧数据添加哈希值
                planObj._hash = deterministicHash;
                planMap.set(deterministicHash, planObj);
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
        // 过滤掉 null 和 undefined
        if (!p) {
            return;
        }
        // plan 项可能是字符串或对象
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (!planObj) {
            return;
        }
        if (planObj._hash) {
            planMap.set(planObj._hash, planObj);
        } else {
            // 没有哈希值的旧数据：使用内容生成确定性哈希（向后兼容）
            const text = planObj._text || JSON.stringify(planObj);
            const user = planObj._user || '';
            // 修复：只使用内容和用户生成哈希，不使用时间戳
            const deterministicHash = generateSyncHash(text, user, null);
            planObj._hash = deterministicHash;
            planMap.set(deterministicHash, planObj);
        }
    });
    
    // 只添加远程中本地没有的新项（不恢复本地已删除的），但对于已存在的项合并 _likes
    remotePlans.forEach(p => {
        // 过滤掉 null 和 undefined
        if (!p) {
            return;
        }
        const planObj = typeof p === 'string' ? { _text: p } : p;
        if (!planObj) {
            return;
        }
        if (planObj._hash) {
            const existing = planMap.get(planObj._hash);
            if (!existing) {
                // 如果本地没有这个哈希值，说明是远程新增的，添加它
                planMap.set(planObj._hash, planObj);
            } else {
                    // 如果本地已有，增量更新 _likes 字段（只更新当前用户的点赞状态）
                    // mergeLikesIncremental(localLikes, remoteLikes, currentUser) - 以 remoteLikes 为基础，应用 localLikes 中当前用户的操作
                    const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                    existing._likes = mergeLikesIncremental(existing._likes, planObj._likes, currentUser);
            }
            // 如果本地已有，说明本地保留了它（或本地有更新的版本），不覆盖
        } else {
            // 没有哈希值的旧数据：使用内容生成确定性哈希（向后兼容）
            const text = planObj._text || JSON.stringify(planObj);
            const user = planObj._user || '';
            // 修复：只使用内容和用户生成哈希，不使用时间戳
            const deterministicHash = generateSyncHash(text, user, null);
            const existing = planMap.get(deterministicHash);
            if (!existing) {
                // 如果本地没有，添加它（远程新增的）
                planObj._hash = deterministicHash;
                planMap.set(deterministicHash, planObj);
            } else {
                // 如果本地已有，增量更新 _likes 字段
                const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null;
                existing._likes = mergeLikesIncremental(existing._likes, planObj._likes, currentUser);
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
            // 需要动态导入 ref, set, update, get, onValue, off 函数
            const { ref, set, update, get, onValue, off } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            
            this.databaseRef = ref(this.database, dbPath);
            this.ref = ref;
            this.set = set;
            this.update = update;
            this.get = get;
            this.onValue = onValue;
            this.off = off;
            
            // 保存路径信息用于调试
            this.dbPath = dbPath;

            // 保存配置到localStorage（localStorage 需要字符串）
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
        
        // 如果没有默认配置，尝试从localStorage加载（localStorage 返回字符串，需要解析）
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
    // 返回对象格式，直接用于 Firebase（Firebase 会自动序列化）
    getAllLocalData() {
        const data = {};
        
        // 优先使用统一结构
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                // 直接存储对象，Firebase 会自动序列化
                data['trip_unified_data'] = unifiedData;
                // 仍然包含其他配置数据（如果有）
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('trip_') && 
                        !key.includes('_token') && 
                        !key.includes('_auto_sync') &&
                        !key.includes('_current_user') &&
                        !key.includes('_firebase_config') &&
                        key !== 'trip_unified_data') {
                        // 只包含配置类数据
                        if (key.includes('_config') || key.includes('_password')) {
                            data[key] = this.parseLocalStorageValue(localStorage.getItem(key));
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
                !key.includes('_auto_sync') &&
                !key.includes('_current_user') &&
                !key.includes('_firebase_config')) {
                data[key] = this.parseLocalStorageValue(localStorage.getItem(key));
            }
        }
        return data;
    }
    
    // 工具函数：解析 localStorage 中的值（localStorage 总是返回字符串）
    parseLocalStorageValue(value) {
        if (!value) return value;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    // 设置所有本地数据（优先使用统一结构）
    // Firebase 返回的是对象，在存入 localStorage 前统一转换为字符串
    setAllLocalData(data) {
        // 调试：检查传入的数据结构
        if (!data || typeof data !== 'object') {
            console.error('setAllLocalData: data 参数无效', data);
            return;
        }
        
        // 优先处理统一结构数据
        if (data['trip_unified_data'] && typeof tripDataStructure !== 'undefined') {
            // Firebase 返回的已经是对象，直接传给 saveUnifiedData（它会处理字符串转换）
            let unifiedData = data['trip_unified_data'];
            
            // 如果 unifiedData 是字符串，尝试解析
            if (typeof unifiedData === 'string') {
                try {
                    unifiedData = JSON.parse(unifiedData);
                } catch (e) {
                    console.error('setAllLocalData: 无法解析 trip_unified_data 字符串', e);
                    unifiedData = null;
                }
            }
            
            // 验证 unifiedData 的结构
            if (unifiedData && typeof unifiedData === 'object') {
                // 检查是否是有效的统一数据结构（应该有 days 数组）
                if (!unifiedData.days || !Array.isArray(unifiedData.days)) {
                    console.error('setAllLocalData: trip_unified_data 结构不正确', {
                        hasDays: !!unifiedData.days,
                        daysIsArray: Array.isArray(unifiedData.days),
                        unifiedDataKeys: Object.keys(unifiedData),
                        unifiedDataType: typeof unifiedData
                    });
                    
                    // 尝试修复：如果 unifiedData 本身就是一个包含 days 的对象，但被嵌套了
                    // 检查是否有其他可能的键包含 days
                    if (unifiedData.trip_unified_data && typeof unifiedData.trip_unified_data === 'object') {
                        console.warn('setAllLocalData: 检测到嵌套的 trip_unified_data，尝试提取');
                        unifiedData = unifiedData.trip_unified_data;
                    }
                    
                    // 再次检查
                    if (!unifiedData.days || !Array.isArray(unifiedData.days)) {
                        console.error('setAllLocalData: 无法修复数据，跳过保存');
                        // 删除统一数据键，避免重复处理
                        delete data['trip_unified_data'];
                        return;
                    }
                }
                
                // 数据结构正确，保存
                tripDataStructure.saveUnifiedData(unifiedData);
            } else {
                console.error('setAllLocalData: trip_unified_data 不是对象', {
                    unifiedDataType: typeof unifiedData,
                    unifiedData: unifiedData
                });
            }
            // 删除统一数据键，避免重复处理
            delete data['trip_unified_data'];
        }
        
        // 处理其他数据：统一在存入 localStorage 前转换为字符串
        Object.keys(data).forEach(key => {
            try {
                // localStorage 必须存字符串，统一转换
                const value = typeof data[key] === 'object' && data[key] !== null 
                    ? JSON.stringify(data[key]) 
                    : String(data[key]);
                localStorage.setItem(key, value);
            } catch (e) {
                console.warn(`保存数据失败 ${key}:`, e);
            }
        });
    }

    // 硬删除一个行程项（使用路径设为 null）
    // 在 Firebase 中，将一个路径设为 null 等同于彻底删除该节点
    // 这是"键-值"模型下的硬删除操作
    async cloudDeleteItem(dayId, itemId) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Firebase未初始化，请先配置');
            }
            
            // 检查写权限
            if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
                throw new Error('未登录，无法删除数据');
            }
            
            // 获取数组索引（因为 Firebase 中数组存储为对象）
            const dayIndex = this.getDayIndex(dayId);
            const itemIndex = this.getItemIndex(dayId, itemId);
            
            if (dayIndex === null || itemIndex === null) {
                throw new Error(`无法找到 dayId=${dayId} 或 itemId=${itemId} 的索引`);
            }
            
            const subPath = `days/${dayIndex}/items/${itemIndex}`;
            const updates = {};
            // 在 Firebase 中，将一个路径设为 null 等同于彻底删除该节点
            updates[`trip_unified_data/${subPath}`] = null;
            updates['_lastSync'] = new Date().toISOString();
            updates['_syncUser'] = getCurrentUser() || 'unknown';
            
            await this.update(this.databaseRef, updates);
            return { success: true, message: `已删除卡片 ${itemId}` };
        } catch (error) {
            return { success: false, message: `删除卡片失败: ${error.message}` };
        }
    }

    // 辅助函数：将 dayId 转换为数组索引
    // 因为 Firebase 中数组存储为对象，键是索引（0, 1, 2...）
    getDayIndex(dayId) {
        if (typeof tripDataStructure === 'undefined') {
            return null;
        }
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData || !unifiedData.days || !Array.isArray(unifiedData.days)) {
            return null;
        }
        const dayIndex = unifiedData.days.findIndex(day => day && day.id === dayId);
        return dayIndex >= 0 ? dayIndex : null;
    }
    
    // 辅助函数：将 itemId 转换为数组索引（在指定 day 中）
    getItemIndex(dayId, itemId) {
        if (typeof tripDataStructure === 'undefined') {
            return null;
        }
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData || !unifiedData.days || !Array.isArray(unifiedData.days)) {
            return null;
        }
        const day = tripDataStructure.getDayData(unifiedData, dayId);
        if (!day || !day.items || !Array.isArray(day.items)) {
            return null;
        }
        const itemIndex = day.items.findIndex(item => item && item.id === itemId);
        return itemIndex >= 0 ? itemIndex : null;
    }

    // 上传单个卡片到云端（增量更新）
    // 使用统一增量更新函数
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
                // 如果 item 不存在，说明被删除了，使用硬删除函数
                return await this.cloudDeleteItem(dayId, itemId);
            }
            
            // 获取数组索引（因为 Firebase 中数组存储为对象）
            const dayIndex = this.getDayIndex(dayId);
            const itemIndex = this.getItemIndex(dayId, itemId);
            
            if (dayIndex === null || itemIndex === null) {
                throw new Error(`无法找到 dayId=${dayId} 或 itemId=${itemId} 的索引`);
            }
            
            // 使用统一增量更新函数：直接更新整个 item
            // 路径使用数组索引：days/0/items/1
            const subPath = `days/${dayIndex}/items/${itemIndex}`;
            const result = await this.cloudIncrementalUpdate(subPath, item);
            
            if (result.success) {
                result.message = `已增量更新卡片 ${itemId}`;
            }
            return result;
        } catch (error) {
            return { success: false, message: `上传卡片失败: ${error.message}` };
        }
    }
    
    // 统一增量更新函数（核心函数）
    // 基于路径和键值对进行增量更新，处理 99% 的改动（点赞、改备注、换图片、改时间等）
    // 这是 Firebase Realtime Database "路径即定位，更新即改值" 的核心实现
    // @param {string} subPath - 相对于 trip_unified_data 的子路径 (例如: 'days/day1/items/item123')
    // @param {Object} dataObj - 要更新的键值对 (例如: { note: '新备注', _likes: {...} })
    // @param {boolean} autoMetadata - 是否自动添加元数据（_updatedAt, _lastSync, _syncUser），默认 true
    async cloudIncrementalUpdate(subPath, dataObj, autoMetadata = true) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Firebase未初始化，请先配置');
            }
            
            // 检查写权限
            if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
                throw new Error('未登录，无法上传数据');
            }
            
            const updates = {};
            const timestamp = new Date().toISOString();
            const user = getCurrentUser() || 'unknown';
            
            // 构建更新对象：Firebase 支持使用 '/' 拼接长路径键，实现深度增量更新
            // 将整个数据库看作一个巨大的、多层嵌套的 JavaScript 对象
            // 路径决定了要修改对象的哪一部分，值决定了该位置变成什么内容
            // 处理空路径情况（用于更新顶层字段，如 _backup）
            const basePath = subPath ? `trip_unified_data/${subPath}` : 'trip_unified_data';
            
            Object.keys(dataObj).forEach(key => {
                // 跳过特殊删除标记（由 cloudDeleteItem 处理）
                if (key === '__delete__') {
                    return;
                }
                // null 值用于删除操作（将路径设为 null 等同于删除该节点）
                if (dataObj[key] === null) {
                    updates[`${basePath}/${key}`] = null;
                } else {
                    updates[`${basePath}/${key}`] = dataObj[key];
                }
            });
            
            // 自动附加元数据，用于合并逻辑判断
            if (autoMetadata) {
                // 如果 subPath 为空，元数据应该附加到子路径（如果有）或者顶层字段（如果 subPath 为空且是更新顶层字段）
                // 但对于顶层字段（如 _backup），我们不添加 _updatedAt，因为 _backup 本身是一个数组，不是对象
                if (subPath) {
                    updates[`${basePath}/_updatedAt`] = timestamp;
                }
                // 顶层元数据始终更新
                updates['_lastSync'] = timestamp;
                updates['_syncUser'] = user;
            }
            
            // 使用 Firebase 的 update 方法执行原子级写入
            // 这是真正的并发协作：多个用户同时修改不同字段时，Firebase 会在云端合并这些键，互不干扰
            await this.update(this.databaseRef, updates);
            
            return { 
                success: true, 
                message: `增量更新成功: ${subPath}` 
            };
        } catch (error) {
            return { success: false, message: `增量更新失败: ${error.message}` };
        }
    }

    // 增量更新特定字段（用于点赞、评论等操作）
    // 使用统一增量更新函数
    async updateItemField(dayId, itemId, field, value) {
        // 获取数组索引（因为 Firebase 中数组存储为对象）
        const dayIndex = this.getDayIndex(dayId);
        const itemIndex = this.getItemIndex(dayId, itemId);
        
        if (dayIndex === null || itemIndex === null) {
            return { success: false, message: `无法找到 dayId=${dayId} 或 itemId=${itemId} 的索引` };
        }
        
        const subPath = `days/${dayIndex}/items/${itemIndex}`;
        const result = await this.cloudIncrementalUpdate(subPath, { [field]: value });
        if (result.success) {
            result.message = `已更新字段 ${field}`;
        }
        return result;
    }

    // 更新嵌套字段（例如：更新某个评论、某个计划项等）
    // 使用路径定位到嵌套对象，实现更细粒度的更新
    // @param {string} dayId - 日期ID
    // @param {string} itemId - 卡片ID
    // @param {string} nestedPath - 嵌套路径，例如 'comments/0' 或 'plan/1'
    // @param {Object} dataObj - 要更新的键值对
    async updateNestedField(dayId, itemId, nestedPath, dataObj) {
        // 获取数组索引（因为 Firebase 中数组存储为对象）
        const dayIndex = this.getDayIndex(dayId);
        const itemIndex = this.getItemIndex(dayId, itemId);
        
        if (dayIndex === null || itemIndex === null) {
            return { success: false, message: `无法找到 dayId=${dayId} 或 itemId=${itemId} 的索引` };
        }
        
        const subPath = `days/${dayIndex}/items/${itemIndex}/${nestedPath}`;
        return await this.cloudIncrementalUpdate(subPath, dataObj);
    }

    // 更新整个数组字段（例如：更新所有评论、所有计划项）
    // 用于批量更新数组内容
    async updateArrayField(dayId, itemId, fieldName, arrayValue) {
        // 获取数组索引（因为 Firebase 中数组存储为对象）
        const dayIndex = this.getDayIndex(dayId);
        const itemIndex = this.getItemIndex(dayId, itemId);
        
        if (dayIndex === null || itemIndex === null) {
            return { success: false, message: `无法找到 dayId=${dayId} 或 itemId=${itemId} 的索引` };
        }
        
        const subPath = `days/${dayIndex}/items/${itemIndex}`;
        return await this.cloudIncrementalUpdate(subPath, { [fieldName]: arrayValue });
    }

    // 上传数据到云端（带防抖，直接上传，依赖 onValue 实时监听处理冲突）
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

                    // 直接上传本地数据，不先下载
                    // 依赖 onValue 实时监听来处理其他用户的更新
                    const data = this.getAllLocalData();
                    
                    // 检查数据是否为空
                    const dataKeys = Object.keys(data);
                    if (dataKeys.length === 0) {
                        resolve({ success: false, message: '没有数据需要上传（localStorage为空）' });
                        return;
                    }
                    
                    // 确保 _backup 字段被包含在上传的数据中
                    if (data['trip_unified_data'] && typeof data['trip_unified_data'] === 'object') {
                        // 确保 _backup 字段存在且是数组
                        if (!data['trip_unified_data']._backup || !Array.isArray(data['trip_unified_data']._backup)) {
                            data['trip_unified_data']._backup = [];
                        }
                        console.log(`上传数据包含备份字段，备份数量: ${data['trip_unified_data']._backup.length}`);
                    }
                    
                    // 添加时间戳
                    data._lastSync = new Date().toISOString();
                    data._syncUser = localStorage.getItem('trip_current_user') || 'unknown';

                    // 上传到Firebase（直接传对象，Firebase 会自动序列化）
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
                // 创建新的数据结构（直接使用对象，不需要 JSON.stringify）
                processedRemoteData = {
                    trip_unified_data: unifiedDataObj
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
                // 智能合并策略
                const localData = this.getAllLocalData();
                const localDataKeys = Object.keys(localData);
                
                // 检查本地是否有有效数据（localData 已经是对象，不需要 parse）
                const hasLocalData = localDataKeys.length > 0 && 
                    localDataKeys.some(key => {
                        const value = localData[key];
                        if (!value) return false;
                        // 如果是对象或数组，检查是否为空
                        if (Array.isArray(value) && value.length === 0) return false;
                        if (typeof value === 'object' && Object.keys(value).length === 0) return false;
                        // 如果是字符串，检查是否为空
                        if (typeof value === 'string' && (value === '[]' || value === '{}' || value === '""' || value.trim().length === 0)) return false;
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
                    // 安全解析本地和远程统一数据
                    const localUnified = parseUnifiedData(localData['trip_unified_data']);
                    const remoteUnified = parseUnifiedData(processedRemoteData['trip_unified_data']);
                    
                    if (remoteUnified && localUnified) {
                        // 合并两个统一结构
                        const mergedUnified = mergeUnifiedData(localUnified, remoteUnified);
                        mergedData['trip_unified_data'] = mergedUnified; // 直接使用对象
                    } else if (remoteUnified) {
                        // 只有远程有统一结构，使用远程的（直接使用对象）
                        mergedData['trip_unified_data'] = remoteUnified;
                    } else if (localUnified) {
                        // 只有本地有统一结构，保留本地的（直接使用对象）
                        mergedData['trip_unified_data'] = localUnified;
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
                            
                            // Firebase 返回的已经是对象，直接使用
                            const localParsed = localValue;
                            const remoteParsed = remoteValue;
                            
                            if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
                                // 合并数组：使用哈希值去重
                                const merged = [...localParsed];
                                
                                remoteParsed.forEach(remoteItem => {
                                    // 检查是否已存在（优先使用哈希值匹配，最后才用深度比较）
                                    const existingIndex = merged.findIndex(existing => {
                                        if (existing._hash && remoteItem._hash) return existing._hash === remoteItem._hash;
                                        if (existing.id && remoteItem.id) return existing.id === remoteItem.id;
                                        if (existing._text && remoteItem._text) return existing._text === remoteItem._text;
                                        // 深度比较（仅作为最后手段，因为性能较差）
                                        return JSON.stringify(existing) === JSON.stringify(remoteItem);
                                    });
                                    
                                    if (existingIndex === -1) {
                                        // 不存在，添加
                                        merged.push(remoteItem);
                                    } else {
                                        // 已存在，合并（保留本地，更新远程的新字段）
                                        merged[existingIndex] = { ...merged[existingIndex], ...remoteItem };
                                    }
                                });
                                
                                mergedData[key] = merged; // 直接使用对象
                            } else if (typeof localParsed === 'object' && typeof remoteParsed === 'object' && 
                                      !Array.isArray(localParsed) && !Array.isArray(remoteParsed)) {
                                const merged = { ...localParsed, ...remoteParsed };
                                mergedData[key] = merged; // 直接使用对象
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
                // Firebase 返回的已经是对象，直接使用
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
                    
                    // 先合并数据到 localStorage（避免数据丢失）
                    // 无论是否有活动输入框，都要先保存数据
                    this.mergeAndRefresh(remoteData, null); // 先合并数据，不刷新UI
                    
                    // 检查是否有活动的输入框，如果有则延迟刷新UI，避免打断用户输入
                    const hasActiveInput = this.hasActiveInputs();
                    if (hasActiveInput) {
                        // 延迟刷新UI，给用户时间完成输入
                        setTimeout(() => {
                            // 再次检查，如果输入框仍然活动，再延迟
                            if (this.hasActiveInputs()) {
                                console.log('检测到活动输入框，延迟UI刷新');
                                // 继续延迟，但不丢失数据
                                setTimeout(() => {
                                    if (typeof window.showDay === 'function' && window.currentDayId) {
                                        window.showDay(window.currentDayId);
                                    }
                                    if (callback) callback();
                                }, 1000);
                                return;
                            }
                            // 执行UI刷新
                            if (typeof window.showDay === 'function' && window.currentDayId) {
                                window.showDay(window.currentDayId);
                            }
                            if (callback) callback();
                        }, 1000); // 延迟1秒刷新UI
                    } else {
                        // 没有活动输入框，立即刷新UI
                        if (typeof window.showDay === 'function' && window.currentDayId) {
                            window.showDay(window.currentDayId);
                        }
                        if (callback) callback();
                    }
                }
            });

            this.listeners.push(unsubscribe);
            return { success: true, message: '实时同步已启动' };
        } catch (error) {
            return { success: false, message: `启动实时同步失败: ${error.message}` };
        }
    }
    
    // 检查是否有活动的输入框
    hasActiveInputs() {
        const activeInputs = document.querySelectorAll(
            '.card-time-input:focus, .card-category-input:focus, .note-input:focus, .plan-input:focus, ' +
            '.card-time-input[style*="inline-block"], .card-category-input[style*="inline-block"], ' +
            '.plan-input-container[style*="block"]'
        );
        return activeInputs.length > 0;
    }
    
    // 合并数据并刷新UI
    mergeAndRefresh(remoteData, callback) {
        // 移除元数据
        delete remoteData._lastSync;
        delete remoteData._syncUser;
        
        // 合并数据（Firebase 返回的已经是对象）
        const localData = this.getAllLocalData();
        const mergedData = { ...localData };
        
        // 优先处理统一结构数据
        if (remoteData['trip_unified_data'] || localData['trip_unified_data']) {
            const localUnified = parseUnifiedData(localData['trip_unified_data']);
            const remoteUnified = parseUnifiedData(remoteData['trip_unified_data']);
            
            if (remoteUnified && localUnified) {
                mergedData['trip_unified_data'] = mergeUnifiedData(localUnified, remoteUnified);
            } else if (remoteUnified) {
                mergedData['trip_unified_data'] = remoteUnified;
            } else if (localUnified) {
                mergedData['trip_unified_data'] = localUnified;
            }
            
            delete remoteData['trip_unified_data'];
            delete localData['trip_unified_data'];
        }
        
        // 合并其他数据
        Object.keys(remoteData).forEach(key => {
            if (!localData[key]) {
                mergedData[key] = remoteData[key];
            } else {
                try {
                    const localParsed = localData[key];
                    const remoteParsed = remoteData[key];
                    
                    if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
                        const merged = [...localParsed];
                        remoteParsed.forEach(remoteItem => {
                            const existingIndex = merged.findIndex(existing => {
                                if (existing._hash && remoteItem._hash) return existing._hash === remoteItem._hash;
                                if (existing.id && remoteItem.id) return existing.id === remoteItem.id;
                                if (existing._text && remoteItem._text) return existing._text === remoteItem._text;
                                // 深度比较（仅作为最后手段，因为性能较差）
                                return JSON.stringify(existing) === JSON.stringify(remoteItem);
                            });
                            
                            if (existingIndex === -1) {
                                merged.push(remoteItem);
                            } else {
                                merged[existingIndex] = { ...merged[existingIndex], ...remoteItem };
                            }
                        });
                        mergedData[key] = merged;
                    } else if (typeof localParsed === 'object' && typeof remoteParsed === 'object' && 
                              !Array.isArray(localParsed) && !Array.isArray(remoteParsed)) {
                        mergedData[key] = { ...localParsed, ...remoteParsed };
                    } else {
                        mergedData[key] = remoteParsed;
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
}

// 全局实例
let dataSyncFirebase = new DataSyncFirebase();

// 暴露到全局
if (typeof window !== 'undefined') {
    window.dataSyncFirebase = dataSyncFirebase;
}