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
                // 1. 对于数组类型的数据（留言、计划项等），合并数组
                // 2. 对于其他数据，如果本地有则保留本地，否则使用远程
                const localData = this.getAllLocalData();
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
        document.getElementById('github-token-input').value = dataSync.githubToken || '';
        document.getElementById('gist-id-input').value = dataSync.gistId || '';
        document.getElementById('auto-sync-checkbox').checked = dataSync.autoSyncEnabled;
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
function saveSyncConfig() {
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
}

// 手动同步（上传）
async function syncUpload() {
    updateSyncStatus('正在上传...', 'info');
    
    // 检查要上传的数据
    const dataToUpload = dataSync.getAllLocalData();
    const dataKeys = Object.keys(dataToUpload);
    const planKeys = dataKeys.filter(k => k.includes('trip_plan_'));
    const orderKeys = dataKeys.filter(k => k.includes('trip_card_order_'));
    const commentKeys = dataKeys.filter(k => k.includes('trip_comments_'));
    const tagKeys = dataKeys.filter(k => k.includes('trip_tag_'));
    
    const result = await dataSync.upload();
    
    if (result.success) {
        const summary = `同步成功！\n包含：${dataKeys.length} 个数据项\n- 计划项: ${planKeys.length}\n- 卡片顺序: ${orderKeys.length}\n- 留言: ${commentKeys.length}\n- 标签: ${tagKeys.length}`;
        updateSyncStatus(summary, 'success');
        if (currentDayId) {
            showDay(currentDayId);
        }
    } else {
        updateSyncStatus(result.message, 'error');
    }
}

// 手动同步（下载）- 使用覆盖模式，完全替换本地数据
async function syncDownload() {
    updateSyncStatus('正在下载...', 'info');
    const result = await dataSync.download(false); // false = 覆盖模式
    updateSyncStatus(result.message, result.success ? 'success' : 'error');
    if (result.success && currentDayId) {
        showDay(currentDayId);
    }
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

