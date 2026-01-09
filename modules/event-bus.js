// 事件总线模块
// 使用发布/订阅模式实现模块间解耦

class EventBus {
    constructor() {
        this.events = new Map(); // 存储事件监听器
    }

    /**
     * 订阅事件
     * @param {string} eventName - 事件名称
     * @param {Function} callback - 回调函数
     * @returns {Function} 取消订阅的函数
     */
    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
        
        // 返回取消订阅的函数
        return () => {
            this.off(eventName, callback);
        };
    }

    /**
     * 取消订阅事件
     * @param {string} eventName - 事件名称
     * @param {Function} callback - 要移除的回调函数（可选，不提供则移除所有）
     */
    off(eventName, callback) {
        if (!this.events.has(eventName)) {
            return;
        }
        
        if (callback) {
            const callbacks = this.events.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
            if (callbacks.length === 0) {
                this.events.delete(eventName);
            }
        } else {
            // 移除该事件的所有监听器
            this.events.delete(eventName);
        }
    }

    /**
     * 发布事件
     * @param {string} eventName - 事件名称
     * @param {*} data - 事件数据
     */
    emit(eventName, data = {}) {
        if (!this.events.has(eventName)) {
            return;
        }
        
        const callbacks = this.events.get(eventName);
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`事件处理器执行失败 [${eventName}]:`, error);
            }
        });
    }

    /**
     * 只订阅一次事件
     * @param {string} eventName - 事件名称
     * @param {Function} callback - 回调函数
     */
    once(eventName, callback) {
        const wrapper = (data) => {
            callback(data);
            this.off(eventName, wrapper);
        };
        this.on(eventName, wrapper);
    }

    /**
     * 清除所有事件监听器
     */
    clear() {
        this.events.clear();
    }
}

// 创建全局事件总线实例
const eventBus = new EventBus();

// 导出到全局
window.eventBus = eventBus;

// 事件类型常量（方便使用和避免拼写错误）
window.EventTypes = {
    // 数据更新事件
    DATA_UPDATED: 'data-updated',        // 数据已更新（通用）
    ITEM_ADDED: 'item-added',            // 添加了项
    ITEM_DELETED: 'item-deleted',        // 删除了项
    ITEM_UPDATED: 'item-updated',        // 更新了项
    DAY_UPDATED: 'day-updated',          // 更新了日期信息（如标题）
    
    // UI 刷新事件
    DAY_CHANGED: 'day-changed',          // 切换了日期
    UI_REFRESH_REQUESTED: 'ui-refresh-requested',  // 请求刷新UI
    
    // 同步事件
    SYNC_REQUESTED: 'sync-requested',    // 请求同步到云端
    SYNC_COMPLETED: 'sync-completed',    // 同步完成
    SYNC_FAILED: 'sync-failed',          // 同步失败
    
    // 其他事件
    USER_CHANGED: 'user-changed',        // 用户切换
    FILTER_CHANGED: 'filter-changed',    // 筛选条件改变
};

