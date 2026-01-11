
/**
 * 用户认证管理模块 (极速版)
 * 策略：优先信任本地缓存，直接进入系统，后台静默验证
 */

(function() {
    'use strict';

    // 状态与常量
    let currentUser = null;
    let isLoggedIn = false;
    const STORAGE_KEYS = {
        USER: 'trip_current_user',
        PASS_HASH: 'trip_password_hash',
        REMEMBER: 'trip_remember_me'
    };

    // ==========================================
    // 1. 基础 UI 和 状态函数 (保持不变)
    // ==========================================
    function checkFirebaseAvailable() {
        return typeof window.firebaseDatabase !== 'undefined';
    }

    /**
     * 从Firebase读取密码配置
     */
    async function fetchPasswordsFromFirebase() {
        if (!checkFirebaseAvailable()) {
            throw new Error('Firebase数据库未初始化');
        }

        const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
        
        // 先尝试读取根路径
        const rootRef = ref(window.firebaseDatabase, '/');
        const rootSnapshot = await get(rootRef);
        const rootData = rootSnapshot.val();
        
        let passwords = null;
        
        if (rootData) {
            // 尝试不同的键名格式
            if (rootData.user_passwords) {
                passwords = rootData.user_passwords;
            } else if (rootData['"user_passwords"']) {
                passwords = rootData['"user_passwords"'];
            } else {
                // 遍历所有键，查找可能的密码数据
                for (const key in rootData) {
                    if (key === 'user_passwords' || key === '"user_passwords"') {
                        passwords = rootData[key];
                        break;
                    }
                }
            }
        }
        
        return passwords;
    }
    function showLoginUI() {
        // ... (保持你原有的逻辑: 显示登录框，隐藏主内容) ...
        const loginModal = document.getElementById('login-modal');
        const loggedInContainer = document.getElementById('user-logged-in');
        const mainContent = document.getElementById('main-content');
        
        if (loginModal) loginModal.style.display = 'flex';
        if (loggedInContainer) loggedInContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        
        isLoggedIn = false;
        currentUser = null;
        updateStateManager(false, null);
    }

    function showLoggedInUI(user) {
        // ... (保持你原有的逻辑: 隐藏登录框，显示主内容) ...
        const loginModal = document.getElementById('login-modal');
        const loggedInContainer = document.getElementById('user-logged-in');
        const mainContent = document.getElementById('main-content');
        const userNameSpan = document.getElementById('logged-in-user-name');
        
        // 关键：强制隐藏登录框
        if (loginModal) loginModal.style.setProperty('display', 'none', 'important');
        if (loggedInContainer) loggedInContainer.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'block';
        if (userNameSpan) userNameSpan.textContent = user === 'mrb' ? '👤 mrb' : '👤 djy';
        
        isLoggedIn = true;
        currentUser = user;
        window.currentUser = user; // 兼容全局
        localStorage.setItem('trip_current_user', user);
        updateStateManager(true, user);
    }

    function updateStateManager(status, user) {
        if (window.stateManager) {
            window.stateManager.setState({ isLoggedIn: status, currentUser: user });
        }
    }

    function notifyStatus(msg, type = 'info') {
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus(msg, type);
        }
    }

    // ==========================================
    // 2. 核心逻辑修改：验证流程
    // ==========================================

    /**
     * 等待 Firebase 就绪 (用于后台验证)
     */
    function waitForFirebase() {
        return new Promise((resolve) => {
            if (window.firebaseDatabase) return resolve(window.firebaseDatabase);
            // 监听事件
            window.addEventListener('firebaseReady', () => resolve(window.firebaseDatabase), { once: true });
            // 超时兜底 (5秒后如果还没连上，就不验证了，默认相信本地)
            setTimeout(() => resolve(null), 10000); 
        });
    }

    /**
     * 后台静默验证 (不阻塞 UI)
     */
    async function backgroundVerify(user, localPass) {
        console.log('正在后台静默验证密码...');
        const db = await waitForFirebase();
        
        if (!db) {
            console.log('Firebase 连接超时，保持离线登录状态');
            return;
        }

        try {
            const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const snapshot = await get(ref(db, 'user_passwords'));
            const data = snapshot.val();
            const passwords = data?.user_passwords || data?.['"user_passwords"'] || data;

            if (passwords && passwords[user]) {
                const cloudPass = passwords[user];
                if (cloudPass !== localPass) {
                    // 😱 发现密码不对！(可能在别处修改了密码)
                    console.warn('后台验证失败：密码已变更，强制登出');
                    alert('您的登录凭证已过期（密码可能已修改），请重新登录');
                    handleLogout();
                } else {
                    console.log('✅ 后台验证通过');
                }
            }
        } catch (e) {
            console.warn('后台验证出错(可能是网络问题)，忽略:', e);
        }
    }

    /**
     * 🔥 启动检查 (你的需求：有缓存直接进)
     */
    function initAutoLogin() {
        const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
        const savedPass = localStorage.getItem(STORAGE_KEYS.PASS_HASH);
        
        if (savedUser && savedPass) {
            // 1. ⚡️ 只要本地有值，直接进系统！完全不等待 Firebase
            console.log('发现本地缓存，立即登录:', savedUser);
            showLoggedInUI(savedUser);
            
            // 触发数据加载 (如果你的数据加载函数需要联网，它自己会去等 Firebase)
            if (typeof window.onLoginSuccess === 'function') {
                window.onLoginSuccess();
            }

            // 2. 🕵️ 在后台悄悄检查一下密码对不对 (安全兜底)
            backgroundVerify(savedUser, savedPass);
        } else {
            // 本地没数据，才显示登录框
            showLoginUI();
        }
    }

    // ==========================================
    // 3. 用户交互操作 (保持原有逻辑框架)
    // ==========================================
    
    async function handleLogin() {
        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');
        
        if (!usernameEl || !passwordEl) {
            alert('找不到登录表单元素，请刷新页面重试');
            return;
        }
        
        const username = usernameEl.value.trim().toLowerCase();
        const password = passwordEl.value;
        
        // 验证用户名
        if (!username || (username !== 'mrb' && username !== 'djy')) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('用户名不存在', 'error');
            }
            return;
        }
        
        if (!password) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('请输入密码', 'error');
            }
            return;
        }
        
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus('正在验证密码...', 'info');
        }
        
        try {
            if (!checkFirebaseAvailable()) {
                alert('Firebase数据库未初始化，请刷新页面重试');
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('Firebase数据库未初始化', 'error');
                }
                return;
            }
            
            const passwords = await fetchPasswordsFromFirebase();
            
            if (!passwords) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('无法读取密码数据', 'error');
                }
                return;
            }
            
            const storedPassword = passwords[username];
            
            if (!storedPassword) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('该用户密码未初始化，请先初始化密码', 'error');
                }
                return;
            }
            
            // 验证密码（明文比较）
            if (storedPassword === password) {
                // 登录成功
                localStorage.setItem('trip_password_hash', password);
                showLoggedInUI(username);
                
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('登录成功，正在下载数据...', 'info');
                }
                
                // 登录后下载数据并渲染
                if (typeof window.onLoginSuccess === 'function') {
                    window.onLoginSuccess();
                }
            } else {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('密码错误', 'error');
                }
            }
        } catch (error) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus(`登录失败: ${error.message}`, 'error');
            }
        }
    }

    function handleLogout() {
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.PASS_HASH);
        // 重载页面以清空内存状态
        location.reload();
    }

    async function checkLoginStatus() {
        const savedUser = localStorage.getItem('trip_current_user');
        const savedPasswordHash = localStorage.getItem('trip_password_hash');
        if (savedUser && savedPasswordHash) {
            // 验证保存的密码hash是否有效（需要从Firebase验证）
            return await verifyStoredPassword(savedUser, savedPasswordHash);
        } else {
            showLoginUI();
            
            // 更新 stateManager 的状态（如果存在）
            if (window.stateManager) {
                window.stateManager.setState({ isLoggedIn: false, currentUser: null });
            }
            
            return false;
        }
    }

    async function verifyStoredPassword(user, storedPassword) {
        try {
            if (!checkFirebaseAvailable()) {
                showLoginUI();
                return false;
            }
            
            const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
            const snapshot = await get(passwordsRef);
            const passwords = snapshot.val();
            
            // 测试模式：明文比较
            if (passwords && passwords[user] === storedPassword) {
                // 密码验证成功，保持登录状态
                showLoggedInUI(user);
                
                // 更新 stateManager 的状态（如果存在）
                if (window.stateManager) {
                    window.stateManager.setState({ isLoggedIn: true, currentUser: user });
                }
                
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('正在下载数据...', 'info');
                }
                
                // 登录后下载数据并渲染
                if (typeof window.onLoginSuccess === 'function') {
                    window.onLoginSuccess();
                }
                
                return true;
            } else {
                // 密码验证失败，需要重新登录
                localStorage.removeItem('trip_password_hash');
                localStorage.removeItem('trip_current_user');
                showLoginUI();
                
                // 更新 stateManager 的状态（如果存在）
                if (window.stateManager) {
                    window.stateManager.setState({ isLoggedIn: false, currentUser: null });
                }
                
                return false;
            }
        } catch (error) {
            console.error('验证存储密码时出错:', error);
            showLoginUI();
            
            // 更新 stateManager 的状态（如果存在）
            if (window.stateManager) {
                window.stateManager.setState({ isLoggedIn: false, currentUser: null });
            }
            
            return false;
        }
    }
    function checkWritePermission() {
        if (!isLoggedIn || !currentUser) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('请先登录才能进行此操作', 'error');
            }
            return false;
        }
        return true;
    }

    /**
     * 显示初始化密码模态框
     */
    function showInitPasswordModal() {
        const modal = document.getElementById('init-password-modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            alert('找不到初始化密码模态框，请检查页面是否完整加载');
        }
    }

    /**
     * 关闭初始化密码模态框
     */
    function closeInitPasswordModal() {
        const modal = document.getElementById('init-password-modal');
        if (modal) {
            modal.style.display = 'none';
            // 清空输入
            const mrbInput = document.getElementById('init-mrb-password');
            const djyInput = document.getElementById('init-djy-password');
            if (mrbInput) mrbInput.value = '';
            if (djyInput) djyInput.value = '';
        }
    }

    /**
     * 初始化密码
     */
    async function initPasswords() {
        const mrbPasswordEl = document.getElementById('init-mrb-password');
        const djyPasswordEl = document.getElementById('init-djy-password');
        
        if (!mrbPasswordEl || !djyPasswordEl) {
            alert('找不到密码输入框，请检查页面是否完整加载');
            return;
        }
        
        const mrbPassword = mrbPasswordEl.value;
        const djyPassword = djyPasswordEl.value;
        
        if (!mrbPassword || !djyPassword) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('请为两个用户都设置密码', 'error');
            }
            return;
        }
        
        if (mrbPassword.length < 4 || djyPassword.length < 4) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('密码长度至少为4位', 'error');
            }
            return;
        }
        
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus('正在初始化密码...', 'info');
        }
        
        try {
            if (!checkFirebaseAvailable()) {
                alert('Firebase数据库未初始化，请刷新页面重试');
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('Firebase数据库未初始化', 'error');
                }
                return;
            }
            
            const { ref, set, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
            
            await set(passwordsRef, {
                mrb: mrbPassword,
                djy: djyPassword
            });
            
            // 验证保存是否成功
            const verifySnapshot = await get(passwordsRef);
            const verifyData = verifySnapshot.val();
            
            if (verifyData && verifyData.mrb && verifyData.djy) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('密码初始化成功！现在可以登录了', 'success');
                }
                closeInitPasswordModal();
            } else {
                throw new Error('保存后验证失败，数据可能未正确写入');
            }
        } catch (error) {
            console.error('初始化密码时出错:', error);
            alert(`初始化失败: ${error.message}\n请查看控制台获取详细信息`);
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus(`初始化失败: ${error.message}`, 'error');
            }
        }
    }

    /**
     * 获取当前用户
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * 获取登录状态
     */
    function getLoginStatus() {
        return isLoggedIn;
    }


    // ==========================================
    // 导出与执行
    // ==========================================
    function init() {
        console.log('🔔 [AuthManager] 被 AppInitializer 唤醒，开始初始化...');
        
        // 1. 绑定按钮事件 (防止点击无反应)
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            // 先移除旧的以防万一
            loginBtn.removeEventListener('click', handleLogin);
            loginBtn.addEventListener('click', handleLogin);
            console.log('✅ [AuthManager] 登录按钮事件已绑定');
        } else {
            console.warn('⚠️ [AuthManager] 未找到 #login-btn，无法绑定点击事件');
        }

        // 2. 执行自动登录逻辑
        initAutoLogin();
    }
    window.AuthManager = {
        checkLoginStatus,
        handleLogin,
        handleLogout,
        checkWritePermission,
        showInitPasswordModal,
        closeInitPasswordModal,
        initPasswords,
        getCurrentUser,
        getLoginStatus,
        showLoginUI, // 添加 showLoginUI 到 AuthManager 对象
        init // 添加 init 到 AuthManager 对象
    };

    // 

    // // 🚀 页面加载即运行
    // if (document.readyState === 'loading') {
    //     document.addEventListener('DOMContentLoaded', initAutoLogin);
    // } else {
    //     initAutoLogin();
    // }


    // 为了向后兼容，也导出到原来的全局函数名
    window.checkLoginStatus = checkLoginStatus;
    window.handleLogin = handleLogin;
    window.handleLogout = handleLogout;
    window.checkWritePermission = checkWritePermission;
    window.showInitPasswordModal = showInitPasswordModal;
    window.closeInitPasswordModal = closeInitPasswordModal;
    window.initPasswords = initPasswords;
    window.showLoginUI = showLoginUI;

})();