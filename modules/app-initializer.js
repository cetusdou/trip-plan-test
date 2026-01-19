/**
 * 应用初始化模块
 * 定义严格的生命周期和初始化顺序
 */

(function() {
    'use strict';

    /**
     * 应用生命周期管理
     */
    class AppInitializer {
        constructor() {
            this.initialized = false;
            this.initOrder = [];
        }

        /**
         * 按顺序初始化应用
         */
        async initialize() {
            if (this.initialized) {
                return;
            }
            try {
                // 阶段 1: 初始化 EventBus
                
                await this.initEventBus();
                
                // 阶段 2: 初始化 State Manager
                await this.initStateManager();
                
                // 阶段 3: 初始化数据管理（绑定数据监听）
                await this.initDataManager();
                await this.initFirebaseSync();
                // 阶段 4: 初始化 UI 渲染器（订阅状态变化）
                await this.initUIRenderer();
                
                // 阶段 5: 初始化认证管理器（检查登录状态）
                await this.initAuthManager();
                


                
                // 阶段 7: 初始化其他模块
                await this.initOtherModules();
                
                // 阶段 8: 初始化数据结构
                await this.initDataStructure();
                
                // 阶段 9: 根据登录状态通知 UIRenderer 渲染
                await this.finalize();
                
                this.initialized = true;
                // 触发初始化完成事件
                if (window.eventBus) {
                    window.eventBus.emit('app-initialized', { timestamp: Date.now() });
                }
                
            } catch (error) {
                throw error;
            }
        }

        /**
         * 阶段 1: 初始化 EventBus
         */
        async initEventBus() {
            if (!window.eventBus) {
                throw new Error('EventBus 未加载');
            }
            
            this.recordStep('EventBus');
        }

        /**
         * 阶段 2: 初始化 State Manager
         */
        async initStateManager() {
            if (!window.stateManager) {
                throw new Error('StateManager 未加载');
            }
            
            // 从 localStorage 恢复状态
            window.stateManager.initialize();
            
            this.recordStep('StateManager');
        }

        /**
         * 阶段 3: 初始化数据管理（绑定数据监听）
         */
        async initDataManager() {
            // 订阅数据更新事件，更新 State Manager
            if (window.eventBus) {
                window.eventBus.on('item-updated', (data) => {
                    // 数据更新时，刷新 State Manager 中的 tripData
                    if (window.tripDataStructure && window.stateManager) {
                        const unifiedData = window.tripDataStructure.loadUnifiedData();
                        if (unifiedData) {
                            window.stateManager.setState({ tripData: unifiedData });
                        }
                    }
                });
            }
            
            this.recordStep('DataManager');
        }

        /**
         * 阶段 4: 初始化 UI 渲染器（订阅状态变化）
         */
        async initUIRenderer() {
            if (window.UIRenderer && window.UIRenderer.initialize) {
                window.UIRenderer.initialize();
            } else {
            }
            
            this.recordStep('UIRenderer');
        }

        /**
         * 阶段 5: 初始化认证管理器（检查登录状态）
         */
        async initAuthManager() {
            // 等待 Firebase 加载
            if (typeof window.firebaseLoaded === 'undefined' || !window.firebaseLoaded) {
                await new Promise((resolve) => {
                    if (window.firebaseLoaded) {
                        resolve();
                    } else {
                        window.addEventListener('firebaseReady', resolve, { once: true });
                        // 超时保护
                        setTimeout(resolve, 5000);
                    }
                });
            }
            
            // 订阅登录状态变化，更新 State Manager
            if (window.stateManager && window.AuthManager) {
                // 监听登录成功：AuthManager 会调用 onLoginSuccess 回调
                // onLoginSuccess 在 script.js 中定义，会更新状态并触发渲染
            }
            
            // 关键修复：检查登录状态（如果 localStorage 中有缓存，自动恢复登录）
            if (window.AuthManager && window.AuthManager.init) {
                window.AuthManager.init();
            } else {
                console.error('❌ AuthManager 未加载或缺少 init 方法 (请检查 AuthManager.js 是否已更新)');
                // 兼容旧版本：如果还没更新 AuthManager，尝试调用 checkLoginStatus
                if (window.AuthManager && window.AuthManager.checkLoginStatus) {
                    await window.AuthManager.checkLoginStatus();
                }
            }
            
            this.recordStep('AuthManager');
        }

        /**
         * 阶段 6: 初始化 Firebase 同步
         */
        async initFirebaseSync() {
            // 检查 dataSyncFirebase 是否已加载
            if (!window.dataSyncFirebase) {
                this.recordStep('FirebaseSync');
                return;
            }
            
            // 等待 Firebase SDK 加载（最多等待 10 秒）
            let firebaseReady = false;
            if (window.firebaseLoaded && window.firebaseDatabase) {
                firebaseReady = true;
            } else {
                try {
                    firebaseReady = await Promise.race([
                        new Promise((resolve) => {
                            if (window.firebaseLoaded && window.firebaseDatabase) {
                                resolve(true);
                            } else {
                                window.addEventListener('firebaseReady', () => {
                                    resolve(window.firebaseLoaded && window.firebaseDatabase);
                                }, { once: true });
                            }
                        }),
                        new Promise((resolve) => {
                            setTimeout(() => {
                                resolve(window.firebaseLoaded && window.firebaseDatabase);
                            }, 10000);
                        })
                    ]);
                } catch (error) {
                    firebaseReady = false;
                }
            }
            
            // 初始化 Firebase 同步
            try {
                let initResult = null;
                
                // 优先使用默认配置（从 index.html 加载的）
                if (firebaseReady && window.firebaseConfig && window.firebaseDatabase) {
                    const defaultConfig = {
                        ...window.firebaseConfig,
                        databasePath: 'trip_plan_data'
                    };
                    initResult = await window.dataSyncFirebase.initialize(defaultConfig);
                } else {
                    // 尝试从 localStorage 加载配置
                    initResult = await window.dataSyncFirebase.loadConfig();
                }
                
                if (initResult && initResult.success) {
                    // 如果已登录，静默下载数据（不显示错误）
                    const isLoggedIn = window.stateManager ? window.stateManager.getState('isLoggedIn') : false;
                    if (isLoggedIn) {
                        window.dataSyncFirebase.download().then(result => {
                            if (result.success) {
                                const unifiedData = window.tripDataStructure ? window.tripDataStructure.loadUnifiedData() : null;
                                if (unifiedData && window.stateManager) {
                                    window.stateManager.setState({ tripData: unifiedData });
                                }
                            }
                        }).catch(() => {
                            // 静默处理错误
                        });
                    }
                    
                    // 启用自动同步（如果已登录）
                    if (isLoggedIn && window.dataSyncFirebase.setAutoSync) {
                        window.dataSyncFirebase.setAutoSync(true);
                    }
                } else {
                    const message = initResult ? initResult.message : '未知错误';
                }
            } catch (error) {
            }
            
            this.recordStep('FirebaseSync');
        }

        /**
         * 阶段 7: 初始化其他模块
         */
        async initOtherModules() {
            // 初始化事件总线监听器
            if (window.initEventBusListeners) {
                window.initEventBusListeners();
            }
            
            // 初始化返回顶部按钮
            if (window.initBackToTop) {
                window.initBackToTop();
            }
            
            this.recordStep('OtherModules');
        }

        /**
         * 阶段 8: 初始化数据结构
         */
        async initDataStructure() {
            if (window.tripDataStructure) {
                try {
                    const existingData = window.tripDataStructure.loadUnifiedData();
                    if (!existingData) {
                        // 如果没有现有数据，创建空数据结构，不使用默认卡片
                        const newData = {
                            id: 'trip_1',
                            title: '我的行程',
                            overview: [],
                            days: {},
                            _backup: {},
                            _version: 2,
                            _lastSync: new Date().toISOString(),
                            _syncUser: null
                        };
                        window.tripDataStructure.saveUnifiedData(newData);
                        
                        // 更新 State Manager
                        if (window.stateManager) {
                            window.stateManager.setState({ tripData: newData, unifiedData: newData });
                        }
                    } else {
                        // 更新 State Manager
                        if (window.stateManager) {
                            window.stateManager.setState({ tripData: existingData, unifiedData: existingData });
                        }
                    }
                    
                    // 更新所有现有花销，添加默认参与人信息
                    if (window.tripDataStructure && window.tripDataStructure.updateExistingExpensesWithParticipants) {
                        window.tripDataStructure.updateExistingExpensesWithParticipants();
                    }
                } catch (error) {
                }
            }
            
            this.recordStep('DataStructure');
        }

        /**
         * 阶段 8: 最终化（根据登录状态通知 UIRenderer 渲染）
         */
        async finalize() {
            // 等待一小段时间，确保登录状态检查已完成
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 检查登录状态（优先从 AuthManager 获取，其次从 stateManager）
            let isLoggedIn = false;
            if (window.AuthManager && window.AuthManager.getLoginStatus) {
                isLoggedIn = window.AuthManager.getLoginStatus();
            } else if (window.stateManager) {
                isLoggedIn = window.stateManager.getState('isLoggedIn') || false;
            }
            
            // 如果 localStorage 中有登录信息但状态未更新，重新检查
            const savedUser = localStorage.getItem('trip_current_user');
            const savedPasswordHash = localStorage.getItem('trip_password_hash');
            if (savedUser && savedPasswordHash && !isLoggedIn) {
                if (window.AuthManager && window.AuthManager.checkLoginStatus) {
                    await window.AuthManager.checkLoginStatus();
                    // 再次检查登录状态
                    if (window.AuthManager && window.AuthManager.getLoginStatus) {
                        isLoggedIn = window.AuthManager.getLoginStatus();
                    }
                }
            }
            
            if (isLoggedIn && window.UIRenderer) {
                // 已登录，直接渲染
                window.UIRenderer.renderOverview();
                window.UIRenderer.renderNavigation();
                const currentDayId = window.stateManager ? window.stateManager.getState('currentDayId') : 'day1';
                window.UIRenderer.renderDay(currentDayId);
            } else {
                // 未登录，显示登录界面
                if (window.AuthManager && window.AuthManager.showLoginUI) {
                    window.AuthManager.showLoginUI();
                }
            }
            
            this.recordStep('Finalize');
        }

        /**
         * 记录初始化步骤
         */
        recordStep(step) {
            this.initOrder.push(step);
        }

        /**
         * 获取初始化顺序
         */
        getInitOrder() {
            return [...this.initOrder];
        }
    }

    // 创建单例
    const appInitializer = new AppInitializer();

    // 暴露到全局
    if (window) {
        window.AppInitializer = appInitializer;
        window.appInitializer = appInitializer;
    }
})();
