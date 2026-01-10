/**
 * 状态管理模块
 * 管理应用全局状态，提供响应式更新机制
 */

(function() {
    'use strict';

    class StateManager {
    constructor() {
        this.state = {
            currentUser: null,
            isLoggedIn: false,
            currentDayId: 'day1',
            currentFilter: null,
            currentSlider: null,
            tripData: null,
            unifiedData: null
        };
        
        // 订阅者列表：{ event: [callback1, callback2, ...] }
        this.subscribers = new Map();
    }

    /**
     * 获取状态
     */
    getState(key = null) {
        if (key) {
            return this.state[key];
        }
        return { ...this.state }; // 返回副本，避免直接修改
    }

    /**
     * 设置状态（会触发订阅者）
     * 只有当值真正改变时才会触发通知
     */
    setState(updates) {
        const prevState = { ...this.state };
        const changedKeys = [];
        
        // 更新状态，并记录真正改变的键
        Object.keys(updates).forEach(key => {
            if (key in this.state) {
                const oldValue = this.state[key];
                const newValue = updates[key];
                
                // 比较值是否真正改变
                let hasChanged = false;
                
                // 对于简单类型，使用严格相等
                if (oldValue !== newValue) {
                    // 对于对象和数组，使用 JSON.stringify（可能不够精确，但对于我们的用例足够）
                    if (typeof oldValue === 'object' && typeof newValue === 'object' && oldValue !== null && newValue !== null) {
                        try {
                            hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);
                        } catch (e) {
                            // JSON.stringify 失败（如包含循环引用），使用引用比较
                            hasChanged = oldValue !== newValue;
                        }
                    } else {
                        hasChanged = true;
                    }
                }
                
                if (hasChanged) {
                    this.state[key] = newValue;
                    changedKeys.push(key);
                }
            }
        });
        
        // 只触发真正改变的键的订阅者
        changedKeys.forEach(key => {
            this.notify(key, this.state[key], prevState[key]);
        });
    }

    /**
     * 订阅状态变化
     * @param {string} key - 状态键名
     * @param {Function} callback - 回调函数 (newValue, oldValue) => {}
     * @returns {Function} 取消订阅的函数
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, []);
        }
        
        this.subscribers.get(key).push(callback);
        
        // 返回取消订阅的函数
        return () => {
            const callbacks = this.subscribers.get(key);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            }
        };
    }

    /**
     * 通知订阅者
     */
    notify(key, newValue, oldValue) {
        const callbacks = this.subscribers.get(key);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`状态订阅回调执行失败 (${key}):`, error);
                }
            });
        }
    }

    /**
     * 初始化状态（从 localStorage 等恢复）
     */
    initialize() {
        // 恢复当前用户
        const savedUser = localStorage.getItem('trip_current_user');
        if (savedUser) {
            this.setState({ currentUser: savedUser, isLoggedIn: true });
        }
        
        // 恢复当前日期
        const savedDayId = localStorage.getItem('trip_current_day_id');
        if (savedDayId) {
            this.setState({ currentDayId: savedDayId });
        }
    }
}

    // 创建单例
    const stateManager = new StateManager();

    // 暴露到全局（供其他模块使用）
    if (window) {
        window.stateManager = stateManager;
        window.StateManager = StateManager;
    }
})();
