// 数据同步功能 - 使用GitHub Gist API
class DataSync {
    constructor() {
        this.gistId = localStorage.getItem('trip_gist_id') || null;
        this.githubToken = localStorage.getItem('trip_github_token') || null;
        this.syncInterval = null;
        this.autoSyncEnabled = localStorage.getItem('trip_auto_sync') === 'true';
    }

    // 设置GitHub Token
    setToken(token) {
        // 清理 Token（去除首尾空格）
        token = token ? token.trim() : '';
        
        // 验证 Token 格式（GitHub Token 通常以 ghp_ 开头，但旧版本可能是其他格式）
        if (token && !token.startsWith('ghp_') && !token.startsWith('gho_') && !token.startsWith('ghu_') && !token.startsWith('ghs_') && !token.startsWith('ghr_')) {
            console.warn('警告：Token 格式可能不正确。GitHub Token 通常以 ghp_ 开头');
        }
        
        this.githubToken = token;
        if (token) {
            localStorage.setItem('trip_github_token', token);
        } else {
            localStorage.removeItem('trip_github_token');
        }
    }

    // 设置Gist ID
    setGistId(gistId) {
        this.gistId = gistId;
        localStorage.setItem('trip_gist_id', gistId);
    }

    // 获取所有本地数据
    getAllLocalData() {
        const data = {};
        // 获取所有localStorage中以trip_开头的键（除了配置项）
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('trip_') && 
                !key.includes('_token') && 
                !key.includes('_gist_id') && 
                !key.includes('_auto_sync') &&
                !key.includes('_current_user')) {
                data[key] = localStorage.getItem(key);
            }
        }
        // 确保包含所有需要同步的数据类型：
        // - trip_plan_* (新增的计划项)
        // - trip_card_order_* (卡片顺序)
        // - trip_comments_* (留言)
        // - trip_tag_* (标签)
        // - trip_custom_items_* (自定义项)
        // - trip_images_* (图片)
        // - trip_*_likes_* (点赞数据)
        return data;
    }

    // 设置所有本地数据
    setAllLocalData(data) {
        Object.keys(data).forEach(key => {
            localStorage.setItem(key, data[key]);
        });
    }

    // 创建新的Gist
    async createGist() {
        if (!this.githubToken) {
            throw new Error('请先设置GitHub Token');
        }

        const data = this.getAllLocalData();
        const content = JSON.stringify(data, null, 2);

        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.githubToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                description: '旅行计划数据同步',
                public: false,
                files: {
                    'trip_data.json': {
                        content: content
                    }
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            let errorMessage = error.message || '创建Gist失败';
            
            // 提供更详细的错误信息
            if (response.status === 401) {
                errorMessage = '认证失败：GitHub Token 无效或已过期。请检查：\n1. Token 是否正确（格式：ghp_xxx）\n2. Token 是否已过期\n3. Token 是否有 gist 权限\n4. Token 是否被撤销';
            } else if (response.status === 403) {
                errorMessage = '权限不足：Token 没有 gist 权限。请重新创建 Token 并勾选 gist 权限';
            } else if (response.status === 404) {
                errorMessage = '资源未找到：请检查 Gist ID 是否正确';
            }
            
            throw new Error(errorMessage);
        }

        const result = await response.json();
        this.setGistId(result.id);
        return result.id;
    }

    // 更新Gist
    async updateGist() {
        if (!this.githubToken || !this.gistId) {
            throw new Error('请先设置GitHub Token和Gist ID');
        }

        const data = this.getAllLocalData();
        const content = JSON.stringify(data, null, 2);

        const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.githubToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                files: {
                    'trip_data.json': {
                        content: content
                    }
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            let errorMessage = error.message || '更新Gist失败';
            
            // 提供更详细的错误信息
            if (response.status === 401) {
                errorMessage = '认证失败：GitHub Token 无效或已过期。请检查：\n1. Token 是否正确（格式：ghp_xxx）\n2. Token 是否已过期\n3. Token 是否有 gist 权限\n4. Token 是否被撤销';
            } else if (response.status === 403) {
                errorMessage = '权限不足：Token 没有 gist 权限或无权访问此 Gist。请重新创建 Token 并勾选 gist 权限';
            } else if (response.status === 404) {
                errorMessage = 'Gist 未找到：请检查 Gist ID 是否正确，或该 Gist 已被删除';
            }
            
            throw new Error(errorMessage);
        }

        return await response.json();
    }

    // 从Gist获取数据
    async fetchGist() {
        if (!this.gistId) {
            throw new Error('请先设置Gist ID');
        }

        const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            let errorMessage = error.message || '获取Gist失败';
            
            // 提供更详细的错误信息
            if (response.status === 401) {
                errorMessage = '认证失败：GitHub Token 无效或已过期';
            } else if (response.status === 403) {
                errorMessage = '权限不足：无法访问此 Gist，可能不是你的 Gist 或 Token 权限不足';
            } else if (response.status === 404) {
                errorMessage = 'Gist 未找到：请检查 Gist ID 是否正确，或该 Gist 已被删除';
            }
            
            throw new Error(errorMessage);
        }

        const result = await response.json();
        const file = result.files['trip_data.json'];
        
        if (!file) {
            throw new Error('Gist中未找到数据文件');
        }

        return JSON.parse(file.content);
    }

    // 上传数据到云端
    async upload() {
        try {
            if (!this.gistId) {
                // 如果没有Gist ID，创建一个新的
                await this.createGist();
            } else {
                // 更新现有的Gist
                await this.updateGist();
            }
            return { success: true, message: '同步成功！' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 从云端下载数据（智能合并：保留本地新数据）
    async download(merge = true) {
        try {
            const remoteData = await this.fetchGist();
            
            if (merge) {
                // 智能合并策略：
                // 1. 如果本地没有缓存数据，优先使用云端数据
                // 2. 对于数组类型的数据（留言、计划项等），合并数组
                // 3. 对于其他数据，如果本地有则保留本地，否则使用远程
                const localData = this.getAllLocalData();
                const localDataKeys = Object.keys(localData);
                
                // 检查本地是否有有效数据（排除空值）
                const hasLocalData = localDataKeys.length > 0 && 
                    localDataKeys.some(key => {
                        const value = localData[key];
                        // 检查是否为有效数据（不是空字符串、空数组、空对象）
                        if (!value || value === '[]' || value === '{}' || value === '""') {
                            return false;
                        }
                        try {
                            const parsed = JSON.parse(value);
                            if (Array.isArray(parsed) && parsed.length === 0) return false;
                            if (typeof parsed === 'object' && Object.keys(parsed).length === 0) return false;
                        } catch (e) {
                            // 不是JSON，检查字符串长度
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
                const mergedData = { ...localData }; // 从本地数据开始
                
                Object.keys(remoteData).forEach(key => {
                    if (!localData[key]) {
                        // 本地没有，直接使用远程
                        mergedData[key] = remoteData[key];
                    } else {
                        // 本地有数据，尝试智能合并
                        try {
                            const localValue = localData[key];
                            const remoteValue = remoteData[key];
                            
                            // 尝试解析为JSON
                            const localParsed = JSON.parse(localValue);
                            const remoteParsed = JSON.parse(remoteValue);
                            
                            // 判断数据类型并采用不同策略
                            if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
                                // 数组类型：合并数组（去重）
                                // 适用于：留言、计划项、图片等
                                const merged = [...localParsed];
                                remoteParsed.forEach(item => {
                                    // 简单的去重：对于对象，使用JSON字符串比较
                                    const itemStr = JSON.stringify(item);
                                    if (!merged.some(existing => JSON.stringify(existing) === itemStr)) {
                                        merged.push(item);
                                    }
                                });
                                mergedData[key] = JSON.stringify(merged);
                            } else if (typeof localParsed === 'object' && typeof remoteParsed === 'object' && 
                                      !Array.isArray(localParsed) && !Array.isArray(remoteParsed)) {
                                // 对象类型：合并对象属性
                                // 适用于：点赞数据等
                                // 对于点赞数据，需要保留两个用户的状态
                                const merged = { ...localParsed };
                                // 如果远程数据有userA或userB，合并它们（保留两个用户的状态）
                                if (remoteParsed.userA !== undefined) {
                                    merged.userA = remoteParsed.userA;
                                }
                                if (remoteParsed.userB !== undefined) {
                                    merged.userB = remoteParsed.userB;
                                }
                                // 对于其他属性，也进行合并
                                Object.keys(remoteParsed).forEach(k => {
                                    if (k !== 'userA' && k !== 'userB') {
                                        merged[k] = remoteParsed[k];
                                    }
                                });
                                mergedData[key] = JSON.stringify(merged);
                            } else {
                                // 其他类型（字符串、数字等）：使用远程数据
                                // 适用于：卡片顺序、标签等单一值
                                // 因为这些数据通常是最终状态，应该使用最新的
                                mergedData[key] = remoteValue;
                            }
                        } catch (e) {
                            // 解析失败，使用远程数据（可能是新格式）
                            mergedData[key] = remoteData[key];
                        }
                    }
                });
                
                this.setAllLocalData(mergedData);
            } else {
                // 直接覆盖模式（手动下载时使用）
                this.setAllLocalData(remoteData);
            }
            
            return { success: true, message: '同步成功！数据已更新。', data: remoteData };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 导出数据为JSON
    exportData() {
        const data = this.getAllLocalData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trip_data_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true, message: '数据已导出' };
    }

    // 从JSON导入数据
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

    // 启用/禁用自动同步
    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        localStorage.setItem('trip_auto_sync', enabled.toString());
        
        if (enabled) {
            // 每30秒自动同步一次
            this.syncInterval = setInterval(() => {
                this.upload().then(result => {
                    if (result.success) {
                        updateSyncStatus('自动同步成功', 'success');
                    }
                });
            }, 30000);
        } else {
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }
        }
    }

    // 检查是否有GitHub配置
    isConfigured() {
        return !!(this.githubToken && this.gistId);
    }
}

// 全局同步实例
const dataSync = new DataSync();

// 更新同步状态显示
function updateSyncStatus(message, type = 'info') {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `sync-status ${type}`;
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'sync-status';
        }, 3000);
    }
}

// 显示同步配置对话框
function showSyncConfig() {
    const modal = document.getElementById('sync-config-modal');
    if (modal) {
        modal.style.display = 'flex';
        
        // 检查当前使用的同步方式（默认使用 Firebase）
        const syncType = localStorage.getItem('trip_sync_type') || 'firebase';
        const syncTypeSelect = document.getElementById('sync-type-select');
        if (syncTypeSelect) {
            syncTypeSelect.value = syncType;
            toggleSyncType();
        }
        
        // 加载Gist配置
        const tokenInput = document.getElementById('github-token-input');
        const gistIdInput = document.getElementById('gist-id-input');
        if (tokenInput) tokenInput.value = dataSync.githubToken || '';
        if (gistIdInput) gistIdInput.value = dataSync.gistId || '';
        
        // 加载Firebase配置（优先使用默认配置）
        const apiKeyInput = document.getElementById('firebase-api-key');
        const authDomainInput = document.getElementById('firebase-auth-domain');
        const databaseUrlInput = document.getElementById('firebase-database-url');
        const projectIdInput = document.getElementById('firebase-project-id');
        const databasePathInput = document.getElementById('firebase-database-path');
        
        if (window.firebaseConfig) {
            // 使用默认配置填充
            if (apiKeyInput) apiKeyInput.value = window.firebaseConfig.apiKey || '';
            if (authDomainInput) authDomainInput.value = window.firebaseConfig.authDomain || '';
            if (databaseUrlInput) databaseUrlInput.value = window.firebaseConfig.databaseURL || '';
            if (projectIdInput) projectIdInput.value = window.firebaseConfig.projectId || '';
            if (databasePathInput) databasePathInput.value = 'trip_plan_data';
        } else {
            // 从localStorage加载配置
            const firebaseConfig = localStorage.getItem('trip_firebase_config');
            if (firebaseConfig) {
                try {
                    const config = JSON.parse(firebaseConfig);
                    if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
                    if (authDomainInput) authDomainInput.value = config.authDomain || '';
                    if (databaseUrlInput) databaseUrlInput.value = config.databaseURL || '';
                    if (projectIdInput) projectIdInput.value = config.projectId || '';
                    if (databasePathInput) databasePathInput.value = config.databasePath || 'trip_plan_data';
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
        
        const autoSyncCheckbox = document.getElementById('auto-sync-checkbox');
        if (autoSyncCheckbox) {
            autoSyncCheckbox.checked = dataSync.autoSyncEnabled;
        }
    }
}

// 切换同步方式显示
function toggleSyncType() {
    const syncTypeSelect = document.getElementById('sync-type-select');
    if (!syncTypeSelect) return;
    
    const syncType = syncTypeSelect.value;
    const gistConfig = document.getElementById('gist-config');
    const firebaseConfig = document.getElementById('firebase-config');
    const autoSyncDesc = document.getElementById('auto-sync-desc');
    
    if (syncType === 'gist') {
        if (gistConfig) gistConfig.style.display = 'block';
        if (firebaseConfig) firebaseConfig.style.display = 'none';
        if (autoSyncDesc) autoSyncDesc.textContent = '（每30秒自动上传）';
    } else {
        if (gistConfig) gistConfig.style.display = 'none';
        if (firebaseConfig) firebaseConfig.style.display = 'block';
        if (autoSyncDesc) autoSyncDesc.textContent = '（实时同步，数据变化时自动同步）';
    }
}

// 关闭同步配置对话框
function closeSyncConfig() {
    const modal = document.getElementById('sync-config-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 保存同步配置
async function saveSyncConfig() {
    const syncType = document.getElementById('sync-type-select').value;
    localStorage.setItem('trip_sync_type', syncType);
    
    if (syncType === 'gist') {
        // 保存Gist配置
        const token = document.getElementById('github-token-input').value.trim();
        const gistId = document.getElementById('gist-id-input').value.trim();
        const autoSync = document.getElementById('auto-sync-checkbox').checked;

        if (token) {
            dataSync.setToken(token);
        }
        if (gistId) {
            dataSync.setGistId(gistId);
        }
        dataSync.setAutoSync(autoSync);

        updateSyncStatus('配置已保存', 'success');
        closeSyncConfig();
        
        // 如果配置完成，尝试自动同步
        if (dataSync.isConfigured()) {
            dataSync.upload();
        }
    } else {
        // 保存Firebase配置
        const apiKeyInput = document.getElementById('firebase-api-key');
        const authDomainInput = document.getElementById('firebase-auth-domain');
        const databaseUrlInput = document.getElementById('firebase-database-url');
        const projectIdInput = document.getElementById('firebase-project-id');
        const databasePathInput = document.getElementById('firebase-database-path');
        const autoSyncCheckbox = document.getElementById('auto-sync-checkbox');
        
        if (!apiKeyInput || !authDomainInput || !databaseUrlInput || !projectIdInput || !autoSyncCheckbox) return;
        
        const apiKey = apiKeyInput.value.trim();
        const authDomain = authDomainInput.value.trim();
        const databaseURL = databaseUrlInput.value.trim();
        const projectId = projectIdInput.value.trim();
        const databasePath = databasePathInput.value.trim() || 'trip_plan_data';
        const autoSync = autoSyncCheckbox.checked;
        
        // 如果使用默认配置（从index.html加载的），可以直接使用
        if (window.firebaseConfig && window.firebaseDatabase && !apiKey && !authDomain && !databaseURL && !projectId) {
            // 使用已加载的Firebase配置
            const defaultConfig = {
                ...window.firebaseConfig,
                databasePath: databasePath
            };
            const result = await dataSyncFirebase.initialize(defaultConfig);
            if (result.success) {
                dataSyncFirebase.setAutoSync(autoSync);
                updateSyncStatus('Firebase配置已保存并初始化成功（使用默认配置）', 'success');
                closeSyncConfig();
                if (autoSync) {
                    dataSyncFirebase.download();
                }
                return;
            }
        }
        
        // 如果填写了配置信息，使用填写的配置
        if (!apiKey || !authDomain || !databaseURL || !projectId) {
            // 如果Firebase已加载，尝试使用默认配置
            if (window.firebaseConfig && window.firebaseDatabase) {
                const defaultConfig = {
                    ...window.firebaseConfig,
                    databasePath: databasePath
                };
                const result = await dataSyncFirebase.initialize(defaultConfig);
                if (result.success) {
                    dataSyncFirebase.setAutoSync(autoSync);
                    updateSyncStatus('Firebase配置已保存并初始化成功（使用默认配置）', 'success');
                    closeSyncConfig();
                    if (autoSync) {
                        dataSyncFirebase.download();
                    }
                    return;
                }
            }
            updateSyncStatus('请填写完整的Firebase配置信息，或使用默认配置', 'error');
            return;
        }
        
        const firebaseConfig = {
            apiKey: apiKey,
            authDomain: authDomain,
            databaseURL: databaseURL,
            projectId: projectId,
            databasePath: databasePath
        };
        
        // 初始化Firebase
        if (typeof dataSyncFirebase === 'undefined') {
            updateSyncStatus('Firebase同步模块未加载，请确保已引入sync-firebase.js', 'error');
            return;
        }
        
        const result = await dataSyncFirebase.initialize(firebaseConfig);
        if (result.success) {
            dataSyncFirebase.setAutoSync(autoSync);
            updateSyncStatus('Firebase配置已保存并初始化成功', 'success');
            closeSyncConfig();
            
            // 如果启用自动同步，尝试下载数据
            if (autoSync) {
                dataSyncFirebase.download();
            }
        } else {
            updateSyncStatus(result.message, 'error');
        }
    }
}

// 手动同步（上传）
async function syncUpload() {
    updateSyncStatus('正在上传...', 'info');
    
    // 检查使用的同步方式（默认使用 Firebase）
    const syncType = localStorage.getItem('trip_sync_type') || 'firebase';
    let syncInstance = dataSync;
    
    // 根据同步类型选择正确的同步实例
    if (syncType === 'firebase' && typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        syncInstance = dataSyncFirebase;
    } else if (syncType === 'gist' && dataSync.isConfigured()) {
        syncInstance = dataSync;
    } else if (syncType === 'firebase') {
        // 如果 Firebase 未配置，提示用户
        if (typeof dataSyncFirebase === 'undefined' || !dataSyncFirebase.isConfigured()) {
            updateSyncStatus('Firebase 未配置，请先配置 Firebase', 'error');
            return;
        }
        syncInstance = dataSyncFirebase;
    } else {
        updateSyncStatus('请先配置同步方式', 'error');
        return;
    }
    
    // 检查要上传的数据（用于显示统计信息）
    const dataToUpload = syncInstance.getAllLocalData();
    const dataKeys = Object.keys(dataToUpload);
    const planKeys = dataKeys.filter(k => k.includes('trip_plan_'));
    const orderKeys = dataKeys.filter(k => k.includes('trip_card_order_'));
    const commentKeys = dataKeys.filter(k => k.includes('trip_comments_'));
    const tagKeys = dataKeys.filter(k => k.includes('trip_tag_'));
    
    // 手动同步时，Firebase使用立即上传模式（immediate = true），Gist 不需要参数
    const result = syncType === 'firebase' 
        ? await syncInstance.upload(true)  // Firebase 需要 immediate 参数
        : await syncInstance.upload();     // Gist 不需要参数
    
    if (result.success) {
        const summary = `同步成功！\n包含：${dataKeys.length} 个数据项\n- 计划项: ${planKeys.length}\n- 卡片顺序: ${orderKeys.length}\n- 留言: ${commentKeys.length}\n- 标签: ${tagKeys.length}`;
        updateSyncStatus(summary, 'success');
        // 不再自动跳转，让用户看到同步信息
        // 如果需要刷新数据，可以手动点击日期链接
    } else {
        updateSyncStatus(result.message, 'error');
    }
}

// 手动同步（下载）- 使用覆盖模式，完全替换本地数据
async function syncDownload() {
    updateSyncStatus('正在下载...', 'info');
    
    // 检查使用的同步方式（默认使用 Firebase）
    const syncType = localStorage.getItem('trip_sync_type') || 'firebase';
    let syncInstance = dataSync;
    
    if (syncType === 'firebase' && typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        syncInstance = dataSyncFirebase;
    } else if (!dataSync.isConfigured()) {
        updateSyncStatus('请先配置同步方式', 'error');
        return;
    }
    
    const result = await syncInstance.download(false); // false = 覆盖模式
    updateSyncStatus(result.message, result.success ? 'success' : 'error');
    // 不再自动跳转，让用户看到同步信息
    // 如果需要刷新数据，可以手动点击日期链接
}

// 导出数据
function exportData() {
    const result = dataSync.exportData();
    updateSyncStatus(result.message, 'success');
}

// 显示当前配置信息（用于备份）
function showConfigInfo() {
    const gistId = dataSync.gistId || '未设置';
    const hasToken = !!dataSync.githubToken;
    const tokenInfo = hasToken ? `已设置（${dataSync.githubToken.substring(0, 10)}...）` : '未设置';
    
    const info = `
当前配置信息（请妥善保存）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gist ID: ${gistId}
GitHub Token: ${tokenInfo}
自动同步: ${dataSync.autoSyncEnabled ? '已启用' : '未启用'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

如果清理了缓存，可以通过以下方式恢复：
1. 访问 https://gist.github.com 找到你的 Gist
2. 从 URL 中获取 Gist ID
3. 重新配置 Gist ID 和 Token
4. 点击"下载"按钮恢复数据

建议：将 Gist ID 和 Token 保存在 config.js 文件中作为备份。
    `;
    
    alert(info);
    
    // 如果配置了 Gist，也显示 Gist 的访问链接
    if (gistId && gistId !== '未设置') {
        const gistUrl = `https://gist.github.com/${gistId}`;
        if (confirm(`是否要打开 Gist 页面查看数据？\n\n${gistUrl}`)) {
            window.open(gistUrl, '_blank');
        }
    }
}

// 导入数据
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                updateSyncStatus('正在导入...', 'info');
                const result = await dataSync.importData(file);
                updateSyncStatus(result.message, 'success');
                // 导入数据后刷新显示，但不跳转（已移除showDay中的跳转代码）
                if (currentDayId) {
                    showDay(currentDayId);
                }
            } catch (error) {
                updateSyncStatus(error.message, 'error');
            }
        }
    };
    input.click();
}

// 留言去重函数
async function deduplicateComments() {
    try {
        updateSyncStatus('正在扫描留言...', 'info');
        
        // 获取所有留言相关的localStorage键
        const commentKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('trip_comments_')) {
                commentKeys.push(key);
            }
        }
        
        if (commentKeys.length === 0) {
            updateSyncStatus('没有找到留言数据', 'info');
            return;
        }
        
        let totalComments = 0;
        let totalRemoved = 0;
        let totalHashesAdded = 0;
        
        // 遍历所有留言键
        for (const key of commentKeys) {
            try {
                const data = localStorage.getItem(key);
                if (!data) continue;
                
                const comments = JSON.parse(data);
                if (!Array.isArray(comments) || comments.length === 0) continue;
                
                totalComments += comments.length;
                
                // 为没有哈希值的旧留言生成哈希值
                for (const comment of comments) {
                    if (!comment._hash && comment.message && comment.user && comment.timestamp) {
                        comment._hash = await generateContentHash(comment.message, comment.user, comment.timestamp);
                        totalHashesAdded++;
                    }
                }
                
                // 基于哈希值去重，保留最早的留言
                const seenHashes = new Map();
                const uniqueComments = [];
                
                // 先按时间戳排序，确保保留最早的
                const sortedComments = [...comments].sort((a, b) => {
                    const timeA = a.timestamp || 0;
                    const timeB = b.timestamp || 0;
                    return timeA - timeB;
                });
                
                for (const comment of sortedComments) {
                    // 如果有哈希值，使用哈希值去重
                    if (comment._hash) {
                        if (!seenHashes.has(comment._hash)) {
                            seenHashes.set(comment._hash, true);
                            uniqueComments.push(comment);
                        } else {
                            totalRemoved++;
                        }
                    } else {
                        // 没有哈希值的旧数据，使用内容+用户组合去重（忽略时间戳）
                        // 因为相同用户发送的相同内容应该被认为是重复的
                        const fallbackKey = `${comment.message}|${comment.user}`;
                        if (!seenHashes.has(fallbackKey)) {
                            seenHashes.set(fallbackKey, true);
                            uniqueComments.push(comment);
                        } else {
                            totalRemoved++;
                        }
                    }
                }
                
                // 如果去重后有变化，更新localStorage
                if (uniqueComments.length !== comments.length) {
                    localStorage.setItem(key, JSON.stringify(uniqueComments));
                }
            } catch (error) {
                console.error(`处理 ${key} 时出错:`, error);
            }
        }
        
        // 显示结果
        let message = `去重完成！\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `扫描留言数: ${totalComments}\n`;
        message += `删除重复: ${totalRemoved} 条\n`;
        message += `保留留言: ${totalComments - totalRemoved} 条\n`;
        if (totalHashesAdded > 0) {
            message += `为旧留言生成哈希值: ${totalHashesAdded} 条\n`;
        }
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `已清理 ${commentKeys.length} 个位置的留言数据`;
        
        updateSyncStatus(message, totalRemoved > 0 ? 'success' : 'info');
        
        // 如果删除了重复留言，刷新当前页面显示
        if (totalRemoved > 0 && typeof window.currentDayId !== 'undefined' && window.currentDayId) {
            if (typeof window.showDay === 'function') {
                setTimeout(() => {
                    window.showDay(window.currentDayId);
                }, 500);
            }
        }
    } catch (error) {
        console.error('去重时出错:', error);
        updateSyncStatus(`去重失败: ${error.message}`, 'error');
    }
}

