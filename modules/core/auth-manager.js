
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
     * 从数据库读取邀请码（不初始化，直接读取）
     */
    async function getInviteCodesFromDatabase() {
        try {
            if (!checkFirebaseAvailable()) {
                return null;
            }
            
            const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const inviteCodesRef = ref(window.firebaseDatabase, 'invite_codes');
            const snapshot = await get(inviteCodesRef);
            return snapshot.val();
        } catch (error) {
            return null;
        }
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
        if (userNameSpan) userNameSpan.textContent = `👤 ${user}`;
        
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
        const db = await waitForFirebase();
        
        if (!db) {
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
                    alert('您的登录凭证已过期（密码可能已修改），请重新登录');
                    handleLogout();
                }
            }
        } catch (e) {
            // 静默忽略错误
        }
    }

    /**
     * 自动登录检查
     */
    function initAutoLogin() {
        const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
        const savedPass = localStorage.getItem(STORAGE_KEYS.PASS_HASH);
        
        if (savedUser && savedPass) {
            showLoggedInUI(savedUser);
            
            if (typeof window.onLoginSuccess === 'function') {
                window.onLoginSuccess();
            }

            backgroundVerify(savedUser, savedPass);
        } else {
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
        
        // 验证用户名 - 支持 root（调试账户）和自定义账户
        // root 账户始终有效，其他账户需要先注册
        const isRootUser = username === 'root';
        
        if (!username) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('请输入用户名', 'error');
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
            
            // root账户特殊处理：如果密码未设置，允许直接登录
            let storedPassword = passwords[username];
            
            if (isRootUser && !storedPassword) {
                storedPassword = 'root123';
                const { ref, update } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
                const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
                await update(passwordsRef, { root: storedPassword });
            } else if (!storedPassword) {
                // 其他账户需要先注册
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('该用户未注册，请先注册账户', 'error');
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
            showLoginUI();
            
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
     * 显示注册账户模态框
     */
    function showRegisterModal() {
        const modal = document.getElementById('register-modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            alert('找不到注册账户模态框，请检查页面是否完整加载');
        }
    }

    /**
     * 关闭注册账户模态框
     */
    function closeRegisterModal() {
        const modal = document.getElementById('register-modal');
        if (modal) {
            modal.style.display = 'none';
            const usernameInput = document.getElementById('register-username');
            const passwordInput = document.getElementById('register-password');
            const confirmInput = document.getElementById('register-confirm');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (confirmInput) confirmInput.value = '';
        }
    }

    /**
     * 注册新账户
     */
    async function registerUser() {
        const usernameEl = document.getElementById('register-username');
        const passwordEl = document.getElementById('register-password');
        const confirmEl = document.getElementById('register-confirm');
        const inviteCodeEl = document.getElementById('register-invite-code');
        
        if (!usernameEl || !passwordEl || !confirmEl || !inviteCodeEl) {
            alert('找不到注册表单元素，请检查页面是否完整加载');
            return;
        }
        
        const username = usernameEl.value.trim().toLowerCase();
        const password = passwordEl.value;
        const confirm = confirmEl.value;
        const inviteCode = inviteCodeEl.value.trim();
        
        // 验证用户名格式
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!username || !usernameRegex.test(username)) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('用户名只能包含字母、数字和下划线', 'error');
            }
            return;
        }
        
        // 验证密码长度
        if (!password || password.length < 4) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('密码长度至少为4位', 'error');
            }
            return;
        }
        
        // 验证密码确认
        if (password !== confirm) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('两次输入的密码不一致', 'error');
            }
            return;
        }
        
        // 验证邀请码（从数据库验证）
        if (!inviteCode) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus('请输入邀请码', 'error');
            }
            return;
        }
        
        // 从 Firebase 数据库验证邀请码
        try {
            const { ref, get, update } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const inviteCodesRef = ref(window.firebaseDatabase, 'invite_codes');
            const snapshot = await get(inviteCodesRef);
            const inviteCodesData = snapshot.val();
            
            if (!inviteCodesData || !inviteCodesData[inviteCode]) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('邀请码无效，请输入正确的邀请码', 'error');
                }
                return;
            }
            
            // 检查邀请码是否已被使用
            if (inviteCodesData[inviteCode].used) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('该邀请码已被使用，请使用其他邀请码', 'error');
                }
                return;
            }
            
            // 标记邀请码为已使用
            await update(inviteCodesRef, { 
                [inviteCode]: { 
                    used: true,
                    used_by: username,
                    used_at: new Date().toISOString()
                }
            });
        } catch (error) {
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus(`验证邀请码失败: ${error.message}`, 'error');
            }
            return;
        }
        
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus('正在注册账户...', 'info');
        }
        
        try {
            if (!checkFirebaseAvailable()) {
                alert('Firebase数据库未初始化，请刷新页面重试');
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('Firebase数据库未初始化', 'error');
                }
                return;
            }
            
            const { ref, update, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
            
            // 检查用户名是否已存在
            const existingSnapshot = await get(passwordsRef);
            const existingData = existingSnapshot.val() || {};
            
            if (existingData[username]) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('该用户名已存在，请选择其他用户名', 'error');
                }
                return;
            }
            
            // 使用 update 而不是 set，只添加新用户，不覆盖现有用户
            await update(passwordsRef, { [username]: password });
            
            // 验证保存是否成功
            const verifySnapshot = await get(passwordsRef);
            const verifyData = verifySnapshot.val();
            
            if (verifyData && verifyData[username]) {
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('账户注册成功！现在可以登录了', 'success');
                }
                // 显示明显的注册成功提示
                alert('🎉 账户注册成功！\n\n您现在可以使用注册的用户名和密码登录系统。');
                closeRegisterModal();
            } else {
                throw new Error('注册后验证失败，数据可能未正确写入');
            }
        } catch (error) {
            alert(`注册失败: ${error.message}\n请查看控制台获取详细信息`);
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus(`注册失败: ${error.message}`, 'error');
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
        // 绑定按钮事件
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.removeEventListener('click', handleLogin);
            loginBtn.addEventListener('click', handleLogin);
        }
        
        // 绑定注册按钮事件
        const registerBtn = document.getElementById('register-btn');
        if (registerBtn) {
            registerBtn.removeEventListener('click', showRegisterModal);
            registerBtn.addEventListener('click', showRegisterModal);
        }
        
        // 确保全局函数可用
        window.showRegisterModal = showRegisterModal;
        window.closeRegisterModal = closeRegisterModal;
        window.registerUser = registerUser;

        // 预加载邀请码（后台静默执行，仅读取不初始化）
        getInviteCodesFromDatabase().catch(() => {});

        // 执行自动登录逻辑
        initAutoLogin();
    }
    window.AuthManager = {
        checkLoginStatus,
        handleLogin,
        handleLogout,
        checkWritePermission,
        showRegisterModal,
        closeRegisterModal,
        registerUser,
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
    window.showRegisterModal = showRegisterModal;
    window.closeRegisterModal = closeRegisterModal;
    window.registerUser = registerUser;
    window.showLoginUI = showLoginUI;

})();