/**
 * 用户管理模块（Firebase Auth 版）
 * - 预置五个固定用户：djy / xwz / mrb / hrz / zyt。
 * - 登录方式：Email/Password。前端输「用户名 + 密码」，内部映射为合成邮箱 <name>@trip.local。
 * - 账户与初始密码由 scripts/setup-users.js 用 Admin SDK 创建（初始密码 = 用户名+1234）。
 * - 会话由 Firebase Auth 持久化（IndexedDB），刷新自动保持登录。
 * - 身份对外仍以「用户名」字符串暴露（getCurrentUser 返回 djy），业务数据无需迁移。
 */
(function () {
    'use strict';

    const USERS = ['djy', 'xwz', 'mrb', 'hrz', 'zyt'];
    const EMAIL_DOMAIN = 'trip.local';
    const SESSION_KEY = 'trip_logged_in';      // 缓存：已登录用户名（用于刷新瞬间的同步判断）
    const CURRENT_KEY = 'trip_current_user';    // 各模块读取的「当前用户」
    let inited = false;

    function isValidUser(name) { return USERS.indexOf(name) > -1; }
    function emailOf(name) { return `${name}@${EMAIL_DOMAIN}`; }
    function usernameFromUser(user) {
        if (!user) return null;
        if (user.displayName && isValidUser(user.displayName)) return user.displayName;
        const local = (user.email || '').split('@')[0];
        return local || null;
    }

    // ---------- Firebase ----------
    function fbReady() { return !!(window.fb && window.fb.auth); }
    function waitForFirebase() {
        if (fbReady()) return Promise.resolve(true);
        return new Promise(resolve => {
            window.addEventListener('firebaseReady', () => resolve(true), { once: true });
            setTimeout(() => resolve(fbReady()), 8000);
        });
    }

    function mapAuthError(e) {
        const code = (e && e.code) || '';
        if (code.indexOf('wrong-password') > -1 || code.indexOf('invalid-credential') > -1 || code.indexOf('user-not-found') > -1) {
            return '用户名或密码错误';
        }
        if (code.indexOf('too-many-requests') > -1) return '尝试次数过多，请稍后再试';
        if (code.indexOf('network') > -1) return '网络异常，请检查网络后重试';
        return '登录失败：' + (e && (e.message || e.code) || '未知错误');
    }

    // ---------- 本地缓存（仅作刷新瞬间的同步判断，真相以 Auth 为准）----------
    function cacheUser(name) {
        try {
            localStorage.setItem(SESSION_KEY, name);
            localStorage.setItem(CURRENT_KEY, name);
            localStorage.setItem('predep_cal_name', name);
        } catch (e) {}
        window.currentUser = name;
        if (window.stateManager) window.stateManager.setState({ isLoggedIn: true, currentUser: name });
    }
    function clearCache() {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(CURRENT_KEY);
        } catch (e) {}
        window.currentUser = null;
        if (window.stateManager) window.stateManager.setState({ isLoggedIn: false, currentUser: null });
    }
    function getCachedUser() {
        try { const n = localStorage.getItem(SESSION_KEY); return isValidUser(n) ? n : null; } catch (e) { return null; }
    }

    // ---------- UI ----------
    function showLoginUI() {
        const loginModal = document.getElementById('login-modal');
        const registerModal = document.getElementById('register-modal');
        const mainContent = document.getElementById('main-content');
        const loggedInBar = document.getElementById('user-logged-in');

        if (mainContent) mainContent.style.display = 'none';
        if (loggedInBar) loggedInBar.style.display = 'none';
        if (registerModal) registerModal.style.display = 'none';

        // 先把内容调成最终态，再显示，避免“原始登录框”闪一下
        const regBtn = document.getElementById('register-btn');
        if (regBtn) regBtn.style.display = 'none';

        const userInput = document.getElementById('login-username');
        if (userInput) {
            userInput.setAttribute('placeholder', '用户名：djy / xwz / mrb / hrz / zyt');
            userInput.value = userInput.value || '';
        }
        const pwInput = document.getElementById('login-password');
        if (pwInput) pwInput.setAttribute('placeholder', '初始密码为 用户名+1234');

        if (loginModal) loginModal.style.setProperty('display', 'flex', 'important');

        const loginBtn = document.getElementById('login-btn');
        if (loginBtn && !loginBtn._bound) {
            loginBtn._bound = true;
            loginBtn.addEventListener('click', handleLogin);
        }
        [userInput, pwInput].forEach(el => {
            if (el && !el._enterBound) {
                el._enterBound = true;
                el.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
            }
        });
    }

    function showContent(name) {
        const loginModal = document.getElementById('login-modal');
        const registerModal = document.getElementById('register-modal');
        const mainContent = document.getElementById('main-content');
        const loggedInBar = document.getElementById('user-logged-in');
        const nameEl = document.getElementById('logged-in-user-name');

        if (loginModal) loginModal.style.setProperty('display', 'none', 'important');
        if (registerModal) registerModal.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        if (loggedInBar) loggedInBar.style.display = 'flex';
        if (nameEl) nameEl.textContent = `👤 ${name}`;

        injectChangePasswordBtn();
    }

    function injectChangePasswordBtn() {
        const bar = document.querySelector('.sync-buttons-top');
        if (!bar || document.getElementById('change-pw-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'change-pw-btn';
        btn.className = 'sync-btn';
        btn.title = '修改密码';
        btn.textContent = '🔑';
        btn.addEventListener('click', handleChangePassword);
        const logout = bar.querySelector('.btn-logout');
        if (logout) bar.insertBefore(btn, logout); else bar.appendChild(btn);
    }

    function setLoginMessage(msg, isError) {
        let el = document.getElementById('login-message');
        if (!el) {
            const form = document.querySelector('#login-modal .login-form');
            if (!form) return;
            el = document.createElement('div');
            el.id = 'login-message';
            el.style.cssText = 'margin-top:10px;font-size:13px;text-align:center;';
            form.appendChild(el);
        }
        el.textContent = msg || '';
        el.style.color = isError ? '#c0392b' : '#2e7d32';
    }

    // ---------- 动作 ----------
    async function handleLogin() {
        const userInput = document.getElementById('login-username');
        const pwInput = document.getElementById('login-password');
        const name = (userInput && userInput.value || '').trim().toLowerCase();
        const pw = (pwInput && pwInput.value) || '';

        if (!isValidUser(name)) { setLoginMessage('用户名无效，请使用 djy / xwz / mrb / hrz / zyt', true); return; }
        if (!pw) { setLoginMessage('请输入密码', true); return; }

        setLoginMessage('验证中…', false);
        await waitForFirebase();
        if (!fbReady()) { setLoginMessage('登录服务未就绪，请稍后重试', true); return; }
        try {
            await window.fb.signInWithEmailAndPassword(window.fb.auth, emailOf(name), pw);
            cacheUser(name);
            location.reload();
        } catch (e) {
            setLoginMessage(mapAuthError(e), true);
        }
    }

    async function handleLogout() {
        try { if (fbReady()) await window.fb.signOut(window.fb.auth); } catch (e) {}
        clearCache();
        location.reload();
    }

    async function changePassword(name, oldPw, newPw) {
        if (!fbReady()) return { success: false, message: '登录服务未就绪' };
        const auth = window.fb.auth;
        const user = auth.currentUser;
        if (!user) return { success: false, message: '未登录' };
        if (!newPw || newPw.length < 6) return { success: false, message: '新密码至少 6 位' };
        try {
            const cred = window.fb.EmailAuthProvider.credential(user.email, oldPw);
            await window.fb.reauthenticateWithCredential(user, cred);
        } catch (e) {
            return { success: false, message: '原密码不正确' };
        }
        try {
            await window.fb.updatePassword(user, newPw);
            return { success: true };
        } catch (e) {
            return { success: false, message: '修改失败：' + (e.message || e.code || e) };
        }
    }

    // 使用页内模态框（此环境会屏蔽原生 prompt/alert）
    function buildChangePasswordModal() {
        if (document.getElementById('change-pw-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'change-pw-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h3>修改密码</h3>
                    <button class="modal-close" id="cpw-close" type="button">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="cpw-old">当前密码</label>
                        <input type="password" id="cpw-old" class="form-input" placeholder="请输入当前密码" autocomplete="current-password">
                    </div>
                    <div class="form-group">
                        <label for="cpw-new">新密码（至少 6 位）</label>
                        <input type="password" id="cpw-new" class="form-input" placeholder="请输入新密码" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label for="cpw-confirm">确认新密码</label>
                        <input type="password" id="cpw-confirm" class="form-input" placeholder="请再次输入新密码" autocomplete="new-password">
                    </div>
                    <div id="cpw-msg" style="font-size:13px;text-align:center;min-height:18px;"></div>
                    <div class="config-actions" style="margin-top:16px;">
                        <button class="btn-primary" id="cpw-save" type="button">保存</button>
                        <button class="btn-secondary" id="cpw-cancel" type="button">取消</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        modal.querySelector('#cpw-close').addEventListener('click', closeChangePasswordModal);
        modal.querySelector('#cpw-cancel').addEventListener('click', closeChangePasswordModal);
        modal.querySelector('#cpw-save').addEventListener('click', saveChangePassword);
        modal.querySelectorAll('input').forEach(el => {
            el.addEventListener('keydown', e => { if (e.key === 'Enter') saveChangePassword(); });
        });
        modal.addEventListener('click', e => { if (e.target === modal) closeChangePasswordModal(); });
    }

    function setChangePwMessage(msg, isError) {
        const el = document.getElementById('cpw-msg');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = isError ? '#c0392b' : '#2e7d32';
    }

    function openChangePasswordModal() {
        buildChangePasswordModal();
        const modal = document.getElementById('change-pw-modal');
        ['cpw-old', 'cpw-new', 'cpw-confirm'].forEach(id => { const i = document.getElementById(id); if (i) i.value = ''; });
        setChangePwMessage('', false);
        if (modal) modal.style.setProperty('display', 'flex', 'important');
        const first = document.getElementById('cpw-old');
        if (first) setTimeout(() => first.focus(), 50);
    }

    function closeChangePasswordModal() {
        const modal = document.getElementById('change-pw-modal');
        if (modal) modal.style.setProperty('display', 'none', 'important');
    }

    async function saveChangePassword() {
        const name = getCurrentUser();
        if (!name) return;
        const oldPw = (document.getElementById('cpw-old') || {}).value || '';
        const newPw = (document.getElementById('cpw-new') || {}).value || '';
        const confirmPw = (document.getElementById('cpw-confirm') || {}).value || '';

        if (!oldPw) { setChangePwMessage('请输入当前密码', true); return; }
        if (newPw.length < 6) { setChangePwMessage('新密码至少 6 位', true); return; }
        if (newPw !== confirmPw) { setChangePwMessage('两次输入的新密码不一致', true); return; }

        setChangePwMessage('保存中…', false);
        const res = await changePassword(name, oldPw, newPw);
        if (res.success) {
            setChangePwMessage('密码修改成功', false);
            setTimeout(closeChangePasswordModal, 800);
        } else {
            setChangePwMessage(res.message || '修改失败', true);
        }
    }

    function handleChangePassword() { openChangePasswordModal(); }

    function proceed(name) {
        cacheUser(name);
        showContent(name);
        if (typeof window.onLoginSuccess === 'function') window.onLoginSuccess();
    }

    function init() {
        if (inited) return;
        inited = true;

        waitForFirebase().then(() => {
            if (!fbReady()) { showLoginUI(); return; }
            window.fb.onAuthStateChanged(window.fb.auth, (user) => {
                if (user) {
                    const name = usernameFromUser(user);
                    if (name) { proceed(name); return; }
                }
                clearCache();
                showLoginUI();
            });
        });
    }

    // ---------- 对外查询 ----------
    function getLoginStatus() {
        if (fbReady() && window.fb.auth.currentUser) return true;
        return !!getCachedUser();
    }
    async function checkLoginStatus() {
        await waitForFirebase();
        if (!fbReady()) return !!getCachedUser();
        if (window.fb.auth.currentUser) return true;
        return await new Promise(resolve => {
            const unsub = window.fb.onAuthStateChanged(window.fb.auth, u => { unsub(); resolve(!!u); });
        });
    }
    function checkWritePermission() { return getLoginStatus(); }
    function getCurrentUser() {
        if (fbReady() && window.fb.auth.currentUser) return usernameFromUser(window.fb.auth.currentUser);
        try { return localStorage.getItem(CURRENT_KEY); } catch (e) { return getCachedUser(); }
    }
    function noop() {}

    window.AuthManager = {
        init,
        USERS,
        getCurrentUser,
        checkWritePermission,
        changePassword: handleChangePassword,
        handleLogin,
        handleLogout,
        getLoginStatus,
        checkLoginStatus,
        showLoginUI,
        showRegisterModal: noop,
        closeRegisterModal: noop,
        registerUser: noop
    };

    // 向后兼容的全局函数
    window.checkWritePermission = checkWritePermission;
    window.getCurrentUser = getCurrentUser;
    window.handleLogin = handleLogin;
    window.handleLogout = handleLogout;
    window.showRegisterModal = noop;
    window.closeRegisterModal = noop;
    window.registerUser = noop;
    window.showLoginUI = showLoginUI;
    window.checkLoginStatus = checkLoginStatus;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
