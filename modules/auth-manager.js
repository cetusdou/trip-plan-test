/**
 * 用户认证管理模块
 * 负责用户登录、登出、密码验证和UI状态管理
 */

(function() {
    'use strict';

    // 私有状态
    let currentUser = null;
    let isLoggedIn = false;

    /**
     * 检查Firebase是否可用
     */
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

    /**
     * 显示登录界面（导出供外部调用）
     */
    function showLoginUI() {
        const loginModal = document.getElementById('login-modal');
        const loggedInContainer = document.getElementById('user-logged-in');
        const mainContent = document.getElementById('main-content');
        
        if (loginModal) loginModal.style.display = 'flex';
        if (loggedInContainer) loggedInContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        
        isLoggedIn = false;
        currentUser = null;
        
        // 清空输入框
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
    }

    /**
     * 显示已登录界面
     */
    function showLoggedInUI(user) {
        const loginModal = document.getElementById('login-modal');
        const loggedInContainer = document.getElementById('user-logged-in');
        const mainContent = document.getElementById('main-content');
        const userNameSpan = document.getElementById('logged-in-user-name');
        
        // 确保登录弹窗关闭
        if (loginModal) {
            loginModal.style.setProperty('display', 'none', 'important');
        }
        if (loggedInContainer) loggedInContainer.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'block';
        if (userNameSpan) userNameSpan.textContent = user === 'mrb' ? '👤 mrb' : '👤 djy';
        
        isLoggedIn = true;
        currentUser = user;
        localStorage.setItem('trip_current_user', user);
        
        // 更新全局状态
        window.currentUser = user;
    }

    /**
     * 处理登录
     */
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

    /**
     * 验证存储的密码（用于页面刷新后保持登录状态）
     */
    async function verifyStoredPassword(user, storedPassword) {
        try {
            if (!checkFirebaseAvailable()) {
                showLoginUI();
                return;
            }
            
            const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
            const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
            const snapshot = await get(passwordsRef);
            const passwords = snapshot.val();
            
            // 测试模式：明文比较
            if (passwords && passwords[user] === storedPassword) {
                // 密码验证成功，保持登录状态
                showLoggedInUI(user);
                
                if (typeof window.updateSyncStatus === 'function') {
                    window.updateSyncStatus('正在下载数据...', 'info');
                }
                
                // 登录后下载数据并渲染
                if (typeof window.onLoginSuccess === 'function') {
                    window.onLoginSuccess();
                }
            } else {
                // 密码验证失败，需要重新登录
                localStorage.removeItem('trip_password_hash');
                localStorage.removeItem('trip_current_user');
                showLoginUI();
            }
        } catch (error) {
            console.error('验证存储密码时出错:', error);
            showLoginUI();
        }
    }

    /**
     * 检查登录状态
     */
    function checkLoginStatus() {
        const savedUser = localStorage.getItem('trip_current_user');
        const savedPasswordHash = localStorage.getItem('trip_password_hash');
        if (savedUser && savedPasswordHash) {
            // 验证保存的密码hash是否有效（需要从Firebase验证）
            verifyStoredPassword(savedUser, savedPasswordHash);
        } else {
            showLoginUI();
        }
    }

    /**
     * 退出登录
     */
    function handleLogout() {
        localStorage.removeItem('trip_password_hash');
        localStorage.removeItem('trip_current_user');
        showLoginUI();
        
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus('已退出登录', 'info');
        }
    }

    /**
     * 检查写权限（只有登录后才能写入）
     */
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

    // 导出到全局
    window.AuthManager = {
        checkLoginStatus,
        handleLogin,
        handleLogout,
        checkWritePermission,
        showInitPasswordModal,
        closeInitPasswordModal,
        initPasswords,
        getCurrentUser,
        getLoginStatus
    };

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
