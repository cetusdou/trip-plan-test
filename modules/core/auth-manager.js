/**
 * 用户管理模块（简单密码验证版）
 * - 预置五个固定用户：djy / xwz / mrb / hrz / zyt。
 * - 初始密码 = 用户名 + '1234'（如 djy1234），首次登录自动在 Firestore 建账户。
 * - 登录成功后记住会话；可在顶部「🔑」修改自己的密码；「×」退出登录。
 * - 密码以明文存于 Firestore users/{name}（简单验证，仅供小范围私密使用）。
 */
(function () {
    'use strict';

    const USERS = ['djy', 'xwz', 'mrb', 'hrz', 'zyt'];
    const SESSION_KEY = 'trip_logged_in';     // 当前已登录用户名
    const CURRENT_KEY = 'trip_current_user';   // 兼容各模块读取的“当前用户”
    let inited = false;

    function isValidUser(name) { return USERS.indexOf(name) > -1; }
    function defaultPassword(name) { return name + '1234'; }

    // ---------- Firestore 账户 ----------
    function fbReady() { return !!(window.fb && window.fb.db); }
    function waitForFirebase() {
        if (fbReady()) return Promise.resolve(true);
        return new Promise(resolve => {
            window.addEventListener('firebaseReady', () => resolve(true), { once: true });
            setTimeout(() => resolve(fbReady()), 8000);
        });
    }

    async function getUserDoc(name) {
        await waitForFirebase();
        if (!fbReady()) return null;
        const { db, doc, getDoc } = window.fb;
        try {
            const snap = await getDoc(doc(db, 'users', name));
            return snap.exists() ? (snap.data() || {}) : null;
        } catch (e) { console.error('[Auth] 读取账户失败:', e); return null; }
    }

    async function ensureUser(name) {
        if (!fbReady()) return { password: defaultPassword(name) };
        let data = await getUserDoc(name);
        if (!data || typeof data.password !== 'string') {
            const { db, doc, setDoc } = window.fb;
            data = { password: defaultPassword(name), _createdAt: new Date().toISOString() };
            try { await setDoc(doc(db, 'users', name), data); } catch (e) { console.error('[Auth] 初始化账户失败:', e); }
        }
        return data;
    }

    async function verifyPassword(name, password) {
        const data = await ensureUser(name);
        return !!data && data.password === password;
    }

    async function changePassword(name, oldPw, newPw) {
        const ok = await verifyPassword(name, oldPw);
        if (!ok) return { success: false, message: '原密码不正确' };
        if (!newPw || newPw.length < 4) return { success: false, message: '新密码至少 4 位' };
        const { db, doc, setDoc } = window.fb;
        try {
            await setDoc(doc(db, 'users', name), { password: newPw, _updatedAt: new Date().toISOString() }, { merge: true });
            return { success: true };
        } catch (e) {
            return { success: false, message: '修改失败：' + (e.message || e) };
        }
    }

    // ---------- 会话 ----------
    function getSessionUser() {
        try { const n = localStorage.getItem(SESSION_KEY); return isValidUser(n) ? n : null; } catch (e) { return null; }
    }
    function setSession(name) {
        try {
            localStorage.setItem(SESSION_KEY, name);
            localStorage.setItem(CURRENT_KEY, name);
            localStorage.setItem('predep_cal_name', name);
        } catch (e) {}
        window.currentUser = name;
        if (window.stateManager) window.stateManager.setState({ isLoggedIn: true, currentUser: name });
    }
    function clearSession() {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(CURRENT_KEY);
        } catch (e) {}
        window.currentUser = null;
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
        // 注册按钮隐藏（固定五个用户）
        const regBtn = document.getElementById('register-btn');
        if (regBtn) regBtn.style.display = 'none';

        const userInput = document.getElementById('login-username');
        if (userInput) {
            userInput.setAttribute('placeholder', '用户名：djy / xwz / mrb / hrz / zyt');
            userInput.value = userInput.value || '';
        }
        const pwInput = document.getElementById('login-password');
        if (pwInput) pwInput.setAttribute('placeholder', '初始密码为 用户名+1234');

        // 内容就绪后再显示登录框
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
        // 放在退出按钮前面
        const logout = bar.querySelector('.btn-logout');
        if (logout) bar.insertBefore(btn, logout); else bar.appendChild(btn);
    }

    function setLoginMessage(msg, isError) {
        let el = document.getElementById('login-message');
        if (!el) {
            const form = document.querySelector('#login-modal .login-form');
            if (!form) { if (msg) alert(msg); return; }
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
        const ok = await verifyPassword(name, pw);
        if (!ok) { setLoginMessage('密码错误（初始密码为 用户名+1234）', true); return; }

        setSession(name);
        location.reload();
    }

    function handleLogout() {
        clearSession();
        location.reload();
    }

    // 使用页内模态框（此环境会屏蔽原生 prompt/alert，因此不能用它们）
    function buildChangePasswordModal() {
        if (document.getElementById('change-pw-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'change-pw-modal';
        modal.className = 'modal';
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
                        <label for="cpw-new">新密码（至少 4 位）</label>
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
        const name = getSessionUser();
        if (!name) return;
        const oldPw = (document.getElementById('cpw-old') || {}).value || '';
        const newPw = (document.getElementById('cpw-new') || {}).value || '';
        const confirmPw = (document.getElementById('cpw-confirm') || {}).value || '';

        if (!oldPw) { setChangePwMessage('请输入当前密码', true); return; }
        if (newPw.length < 4) { setChangePwMessage('新密码至少 4 位', true); return; }
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
        setSession(name);
        showContent(name);
        if (typeof window.onLoginSuccess === 'function') window.onLoginSuccess();
    }

    function init() {
        if (inited) return;
        inited = true;

        const session = getSessionUser();
        if (session) {
            proceed(session);
        } else {
            showLoginUI();
        }
    }

    function checkWritePermission() { return !!getSessionUser(); }
    function getCurrentUser() {
        try { return localStorage.getItem(CURRENT_KEY) || getSessionUser(); } catch (e) { return getSessionUser(); }
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
        getLoginStatus: () => !!getSessionUser(),
        checkLoginStatus: async () => !!getSessionUser(),
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
    window.checkLoginStatus = async () => !!getSessionUser();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
