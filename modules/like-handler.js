// 统一的点赞处理模块
// 抽象出通用的点赞逻辑，处理 item、plan item、comment 的点赞操作

class LikeHandler {
    /**
     * 获取点赞数组（通用方法）
     * @param {string} dayId - 日期ID
     * @param {string} itemId - 卡片ID
     * @param {string} type - 类型：'item' | 'plan' | 'comment'
     * @param {number|string} index - 索引（planIndex 或 commentIndex，item 类型不需要）
     * @param {string} section - 仅用于 item 类型，指定 section（如 'images', 'comments'）
     * @returns {Array|Object} 返回点赞数组或对象
     */
    static getLikes(dayId, itemId, type, index = null, section = null) {
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            return type === 'item' ? {} : [];
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            return type === 'item' ? {} : [];
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            return type === 'item' ? {} : [];
        }
        
        switch (type) {
            case 'item':
                // Item 点赞：返回 { section: ['user1', 'user2'] }
                if (!item._likes) return {};
                const convertedLikes = {};
                for (const sec in item._likes) {
                    if (Array.isArray(item._likes[sec])) {
                        convertedLikes[sec] = item._likes[sec];
                    } else {
                        convertedLikes[sec] = [];
                    }
                }
                return section ? (convertedLikes[section] || []) : convertedLikes;
                
            case 'plan':
                // Plan item 点赞：返回 ['user1', 'user2']
                if (!item.plan || !Array.isArray(item.plan) || index < 0 || index >= item.plan.length) {
                    return [];
                }
                const planItem = item.plan[index];
                if (!planItem || typeof planItem !== 'object' || !planItem._likes) {
                    return [];
                }
                return Array.isArray(planItem._likes) ? planItem._likes : [];
                
            case 'comment':
                // Comment 点赞：返回 ['user1', 'user2']
                if (!item.comments || !Array.isArray(item.comments) || index < 0 || index >= item.comments.length) {
                    return [];
                }
                const comment = item.comments[index];
                if (!comment || typeof comment !== 'object' || !comment._likes) {
                    return [];
                }
                return Array.isArray(comment._likes) ? comment._likes : [];
                
            default:
                return type === 'item' ? {} : [];
        }
    }
    
    /**
     * 切换点赞状态（通用方法）
     * @param {string} dayId - 日期ID
     * @param {string} itemId - 卡片ID
     * @param {string} type - 类型：'item' | 'plan' | 'comment'
     * @param {number|string} index - 索引（planIndex 或 commentIndex，item 类型需要 section）
     * @param {string} section - 仅用于 item 类型，指定 section
     * @returns {boolean} 是否成功
     */
    static toggleLike(dayId, itemId, type, index = null, section = null) {
        // 检查写权限
        if (typeof window.checkWritePermission === 'function' && !window.checkWritePermission()) {
            return false;
        }
        
        if (typeof tripDataStructure === 'undefined' || !itemId) {
            console.error('tripDataStructure 未定义或 itemId 为空，无法保存点赞');
            return false;
        }
        
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (!unifiedData) {
            console.error('无法加载统一数据');
            return false;
        }
        
        const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
        if (!item) {
            console.error('找不到 item');
            return false;
        }
        
        const currentUser = typeof window.currentUser !== 'undefined' ? window.currentUser : 
                           (typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') : null);
        
        if (!currentUser) {
            console.error('无法获取当前用户');
            return false;
        }
        
        let targetLikes = null;
        let targetObject = null;
        
        switch (type) {
            case 'item':
                // Item 点赞：操作 item._likes[section]
                if (!section) {
                    console.error('item 类型需要指定 section');
                    return false;
                }
                if (!item._likes) item._likes = {};
                if (!item._likes[section]) item._likes[section] = [];
                if (!Array.isArray(item._likes[section])) item._likes[section] = [];
                targetLikes = item._likes[section];
                targetObject = item;
                break;
                
            case 'plan':
                // Plan item 点赞：操作 plan[index]._likes
                if (index === null || index < 0 || !item.plan || !Array.isArray(item.plan) || index >= item.plan.length) {
                    console.error('找不到 plan item');
                    return false;
                }
                const planItem = item.plan[index];
                if (!planItem || typeof planItem !== 'object') {
                    console.error('plan item 无效');
                    return false;
                }
                if (!planItem._likes) planItem._likes = [];
                if (!Array.isArray(planItem._likes)) planItem._likes = [];
                targetLikes = planItem._likes;
                targetObject = planItem;
                break;
                
            case 'comment':
                // Comment 点赞：操作 comments[index]._likes
                if (index === null || index < 0 || !item.comments || !Array.isArray(item.comments) || index >= item.comments.length) {
                    console.error('找不到 comment');
                    return false;
                }
                const comment = item.comments[index];
                if (!comment || typeof comment !== 'object') {
                    console.error('comment 无效');
                    return false;
                }
                if (!comment._likes) comment._likes = [];
                if (!Array.isArray(comment._likes)) comment._likes = [];
                targetLikes = comment._likes;
                targetObject = comment;
                break;
                
            default:
                console.error('未知的点赞类型:', type);
                return false;
        }
        
        // 切换点赞状态：如果已点赞则移除，否则添加
        const userIndex = targetLikes.indexOf(currentUser);
        if (userIndex > -1) {
            targetLikes.splice(userIndex, 1); // 取消点赞
        } else {
            targetLikes.push(currentUser); // 点赞
        }
        

        const timestamp = new Date().toISOString();
        if (targetObject._updatedAt !== undefined || type !== 'item') {
            targetObject._updatedAt = timestamp;
        }
        item._updatedAt = timestamp; // 确保父级 item 也标记为已更新

        // 1. 保存到本地统一结构 (localStorage)
        const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
        if (saveSuccess === false) {
            console.error('点赞保存到本地失败');
            return false;
        }

        // 2. 触发增量同步到云端 (Firebase)
        if (window.dataSyncFirebase && window.dataSyncFirebase.cloudIncrementalUpdate) {
            let cloudPath = `days/${dayId}/items/${itemId}`;
            let updatePayload = {};

            // 根据类型构建精确的云端路径和数据包
            switch (type) {
                case 'item':
                    updatePayload[`_likes/${section}`] = targetLikes;
                    break;
                case 'plan':
                    // 注意：数组操作在 Firebase 中通常推荐全量覆盖该子路径以确保顺序
                    updatePayload[`plan/${index}/_likes`] = targetLikes;
                    updatePayload[`plan/${index}/_updatedAt`] = timestamp;
                    break;
                case 'comment':
                    updatePayload[`comments/${index}/_likes`] = targetLikes;
                    updatePayload[`comments/${index}/_updatedAt`] = timestamp;
                    break;
            }

            // 发送增量更新补丁
            window.dataSyncFirebase.cloudIncrementalUpdate(cloudPath, updatePayload)
                .then(res => {
                    if (!res.success) console.warn('点赞同步延迟:', res.message);
                })
                .catch(err => console.error('点赞同步失败:', err));
        }

        return true;
    }
}

// 导出到全局以便 CardSlider 调用
window.LikeHandler = LikeHandler;