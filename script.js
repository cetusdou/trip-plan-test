// Cloudinary 配置
// 请在使用前配置你的 Cloudinary 信息
// Cloudinary 配置
// 请在使用前配置你的 Cloudinary 信息：
// 1. 登录 https://cloudinary.com/ 创建账户
// 2. 在 Dashboard 中找到你的 Cloud Name
// 3. 在 Settings > Upload 中创建一个 Upload Preset（推荐使用 "Unsigned" 模式，更安全）
// 4. 将 cloudName 和 uploadPreset 填入下面的配置中
const CLOUDINARY_CONFIG = {
    cloudName: 'deesradkv', // 请配置：你的 Cloudinary Cloud Name（例如：'mycloud'）
    uploadPreset: 'test-trip-plan', // 请配置：你的 Upload Preset 名称（例如：'my_upload_preset'）
    apiKey: '' // 可选：如果需要签名上传，填入 API Key（通常不需要）
};

// Cloudinary 图片上传服务
class CloudinaryUploadService {
    constructor(config) {
        this.cloudName = config.cloudName;
        this.uploadPreset = config.uploadPreset;
        this.apiKey = config.apiKey;
    }
    
    // 检查配置是否完整
    isConfigured() {
        return !!(this.cloudName && this.uploadPreset);
    }
    
    // 上传图片到 Cloudinary
    async uploadImage(file) {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary 未配置，请先设置 cloudName 和 uploadPreset');
        }
        
        // 先压缩图片
        const compressedFile = await this.compressImageFile(file);
        
        // 创建 FormData
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('upload_preset', this.uploadPreset);
        formData.append('cloud_name', this.cloudName);
        
        // 生成唯一的 public_id（使用时间戳和随机数）
        const publicId = `trip_plan/${Date.now()}_${Math.random().toString(36).substring(7)}`;
        formData.append('public_id', publicId);
        
        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || '上传失败');
            }
            
            const result = await response.json();
            
            // 返回 Cloudinary URL
            // 使用优化后的 URL（自动格式和压缩）
            const optimizedUrl = result.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
            
            return {
                url: optimizedUrl,
                publicId: result.public_id,
                originalUrl: result.secure_url
            };
        } catch (error) {
            console.error('Cloudinary 上传失败:', error);
            throw new Error(`图片上传失败: ${error.message}`);
        }
    }
    
    // 压缩图片文件（转换为 Blob，限制尺寸和质量）
    async compressImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const img = new Image();
                
                img.onload = () => {
                    // 限制最大尺寸
                    const MAX_WIDTH = 1920;
                    const MAX_HEIGHT = 1080;
                    let width = img.width;
                    let height = img.height;
                    
                    // 计算缩放比例
                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
                    }
                    
                    // 创建 canvas 进行压缩
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    // 绘制图片
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 转换为 Blob（质量 0.8）
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('图片压缩失败'));
                        }
                    }, 'image/jpeg', 0.8);
                };
                
                img.onerror = () => {
                    reject(new Error('无法加载图片'));
                };
                
                img.src = event.target.result;
            };
            
            reader.onerror = () => {
                reject(new Error('无法读取文件'));
            };
            
            reader.readAsDataURL(file);
        });
    }
    
    // 删除 Cloudinary 中的图片
    async deleteImage(publicId) {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary 未配置');
        }
        
        try {
            // 注意：删除需要签名，或者使用 Cloudinary Admin API
            // 这里使用简单的删除请求（如果 preset 配置允许）
            const timestamp = Math.round(new Date().getTime() / 1000);
            const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${this.apiKey || ''}`;
            
            // 如果配置了 API Key，可以使用签名删除
            // 否则，需要使用服务器端 API 或配置允许删除的 preset
            console.warn('图片删除功能需要配置签名或使用服务器端 API');
            
            // 简单实现：返回成功（实际删除需要在服务器端实现）
            return { success: true, message: '图片已标记删除（需要在服务器端实际删除）' };
        } catch (error) {
            console.error('删除图片失败:', error);
            // 即使删除失败，也不阻止流程继续
            return { success: false, message: error.message };
        }
    }
}

// 创建 Cloudinary 上传服务实例
const cloudinaryService = new CloudinaryUploadService(CLOUDINARY_CONFIG);

// 当前用户管理
let currentUser = null; // 初始为null，需要登录
let isLoggedIn = false; // 登录状态
let currentDayId = 'day1';
// 将 currentDayId 和 showDay 暴露到全局，供实时同步回调使用
window.currentDayId = currentDayId;

// 简单的密码哈希函数（使用SHA-256）
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// 生成内容哈希值（用于去重）
async function generateContentHash(content, user, timestamp) {
    // 使用内容、用户和时间戳生成哈希，确保唯一性
    const hashString = `${content}|${user}|${timestamp}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(hashString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // 使用前16位作为短哈希
}

// 检查是否已登录
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

// 显示登录界面
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

// 显示已登录界面
function showLoggedInUI(user) {
    const loginModal = document.getElementById('login-modal');
    const loggedInContainer = document.getElementById('user-logged-in');
    const mainContent = document.getElementById('main-content');
    const userNameSpan = document.getElementById('logged-in-user-name');
    
    // 确保登录弹窗关闭（使用 !important 覆盖 CSS）
    if (loginModal) {
        loginModal.style.setProperty('display', 'none', 'important');
    }
    if (loggedInContainer) loggedInContainer.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
    if (userNameSpan) userNameSpan.textContent = user === 'mrb' ? '👤 mrb' : '👤 djy';
    
    isLoggedIn = true;
    currentUser = user;
    localStorage.setItem('trip_current_user', user);
}

// 处理登录
async function handleLogin() {
    // 添加调试信息
    console.log('handleLogin 被调用');
    
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
        updateSyncStatus('用户名不存在', 'error');
        return;
    }
    
    if (!password) {
        updateSyncStatus('请输入密码', 'error');
        return;
    }
    
    updateSyncStatus('正在验证密码...', 'info');
    
    try {
        // 测试模式：使用明文密码（不进行hash）
        console.log('使用明文密码验证（测试模式）');
        
        // 检查Firebase是否可用
        console.log('检查Firebase配置...');
        console.log('window.firebaseDatabase:', typeof window.firebaseDatabase);
        
        if (typeof window.firebaseDatabase === 'undefined') {
            alert('Firebase数据库未初始化，请刷新页面重试');
            updateSyncStatus('Firebase数据库未初始化', 'error');
            return;
        }
        
        // 从Firebase读取密码配置
        console.log('从Firebase读取密码配置...');
        const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
        
        // 检查数据库URL
        console.log('数据库URL:', window.firebaseDatabase.app.options.databaseURL);
        
        // 先尝试读取根路径，看看有什么数据
        const rootRef = ref(window.firebaseDatabase, '/');
        const rootSnapshot = await get(rootRef);
        const rootData = rootSnapshot.val();
        console.log('根路径数据:', rootData);
        console.log('根路径数据键:', rootData ? Object.keys(rootData) : '无数据');
        
        let passwords;
        
        // 方法1：直接从根路径数据中获取（优先使用）
        if (rootData) {
            // 尝试不同的键名格式
            if (rootData.user_passwords) {
                console.log('从根路径数据中获取密码 (user_passwords)');
                passwords = rootData.user_passwords;
            } else if (rootData['"user_passwords"']) {
                console.log('从根路径数据中获取密码 ("user_passwords")');
                passwords = rootData['"user_passwords"'];
            } else {
                // 遍历所有键，查找可能的密码数据
                console.warn('user_passwords 路径不存在，检查其他路径...');
                for (const key in rootData) {
                    console.log(`发现路径: ${key}`, rootData[key]);
                    // 尝试匹配可能的键名（包括带引号的）
                    if (key === 'user_passwords' || key === '"user_passwords"') {
                        passwords = rootData[key];
                        console.log('从根路径中找到密码数据:', passwords);
                        break;
                    }
                }
            }
            console.log('读取到的密码数据:', passwords);
        }
        
        // 方法2：如果方法1失败，尝试直接读取 user_passwords 路径
        if (!passwords) {
            console.log('尝试直接读取 user_passwords 路径...');
            const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
            console.log('读取密码路径:', passwordsRef.toString());
            
            try {
                const snapshot = await get(passwordsRef);
                console.log('Snapshot对象:', snapshot);
                console.log('Snapshot存在:', snapshot.exists());
                console.log('Snapshot值:', snapshot.val());
                passwords = snapshot.val();
                console.log('读取到的密码数据:', passwords);
                
                // 如果读取失败，尝试使用不同的方法
                if (!passwords && snapshot.exists()) {
                    console.warn('数据存在但值为null，可能是权限问题');
                }
            } catch (readError) {
                console.error('读取密码时出错:', readError);
                console.error('错误代码:', readError.code);
                console.error('错误消息:', readError.message);
                if (readError.code === 'PERMISSION_DENIED') {
                    alert('Firebase数据库权限被拒绝。请检查数据库规则，确保允许读取 user_passwords 路径。\n\n建议的规则：\n{\n  "rules": {\n    "user_passwords": {\n      ".read": true,\n      ".write": true\n    }\n  }\n}');
                }
                throw readError;
            }
        }
        
        console.log('准备验证密码...');
        console.log('passwords对象:', passwords);
        console.log('passwords类型:', typeof passwords);
        console.log('passwords是否为null:', passwords === null);
        console.log('passwords是否为undefined:', passwords === undefined);
        console.log('username:', username);
        console.log('输入的密码:', password);
        
        // 尝试不同的方式访问密码数据
        let storedPassword = null;
        if (passwords) {
            // 方法1：直接属性访问（不带引号）
            storedPassword = passwords[username];
            console.log('方法1 - passwords[username]:', storedPassword);
            
            // 方法2：尝试带引号的键名（因为Firebase可能存储了带引号的键）
            if (!storedPassword) {
                const quotedKey = `"${username}"`;
                storedPassword = passwords[quotedKey];
                console.log(`方法2 - passwords["${username}"]:`, storedPassword);
            }
            
            // 方法3：遍历所有键，进行模糊匹配
            if (!storedPassword) {
                const keys = Object.keys(passwords);
                console.log('passwords的键:', keys);
                console.log('passwords的值:', Object.values(passwords));
                
                // 尝试遍历查找（支持带引号和不带引号的键）
                for (const key in passwords) {
                    console.log(`键: ${key}, 值: ${passwords[key]}, 类型: ${typeof passwords[key]}`);
                    // 匹配：key === username 或 key === "username" 或 key === '"username"'
                    if (key === username || key === `"${username}"` || key === `'"${username}"'`) {
                        storedPassword = passwords[key];
                        console.log('找到匹配的键:', key, '密码:', storedPassword);
                        break;
                    }
                    // 也尝试去掉键的引号后比较
                    const keyWithoutQuotes = key.replace(/^["']|["']$/g, '');
                    if (keyWithoutQuotes === username) {
                        storedPassword = passwords[key];
                        console.log('通过去引号匹配找到键:', key, '密码:', storedPassword);
                        break;
                    }
                }
            }
        }
        
        console.log('最终获取的密码:', storedPassword);
        console.log('passwords[username]:', passwords ? passwords[username] : 'passwords为空');
        
        if (!passwords) {
            console.error('passwords为空，无法验证');
            updateSyncStatus('无法读取密码数据', 'error');
            return;
        }
        
        if (!storedPassword) {
            console.error('该用户的密码不存在');
            console.log('可用的用户:', Object.keys(passwords));
            updateSyncStatus('该用户密码未初始化，请先初始化密码', 'error');
            return;
        }
        
        // 验证密码（明文比较）
        console.log('开始密码比较...');
        console.log('存储的密码:', storedPassword);
        console.log('输入的密码:', password);
        console.log('存储的密码类型:', typeof storedPassword);
        console.log('输入的密码类型:', typeof password);
        console.log('密码是否匹配:', storedPassword === password);
        
        if (storedPassword === password) {
            // 登录成功
            console.log('密码验证成功，登录成功！');
            // 保存明文密码到localStorage（测试模式）
            localStorage.setItem('trip_password_hash', password);
            showLoggedInUI(username);
            updateSyncStatus('登录成功，正在下载数据...', 'info');
            
            // 登录后第一件事：从数据库拉取数据覆盖本地内容
            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
                dataSyncFirebase.download(false).then(result => {
                    if (result.success) {
                        updateSyncStatus('数据下载成功', 'success');
                        // 下载完成后渲染内容
                        renderOverview();
                        renderNavigation();
                        if (currentDayId) {
                            showDay(currentDayId);
                        } else {
                            showDay('day1');
                        }
                    } else {
                        updateSyncStatus('下载失败: ' + (result.message || '未知错误') + '，使用本地数据', 'error');
                        // 即使下载失败，也渲染本地内容
                        renderOverview();
                        renderNavigation();
                        if (currentDayId) {
                            showDay(currentDayId);
                        } else {
                            showDay('day1');
                        }
                    }
                }).catch(error => {
                    console.error('下载失败:', error);
                    updateSyncStatus('下载失败，使用本地数据', 'error');
                    // 即使下载失败，也渲染本地内容
                    renderOverview();
                    renderNavigation();
                    if (currentDayId) {
                        showDay(currentDayId);
                    } else {
                        showDay('day1');
                    }
                });
            } else {
                // Firebase未配置，直接渲染本地内容
                updateSyncStatus('Firebase未配置，使用本地数据', 'info');
                renderOverview();
                renderNavigation();
                if (currentDayId) {
                    showDay(currentDayId);
                } else {
                    showDay('day1');
                }
            }
        } else {
            console.log('密码验证失败');
            console.log('存储的密码类型:', typeof passwords[username]);
            console.log('输入的密码类型:', typeof password);
            console.log('存储的密码长度:', passwords[username] ? passwords[username].length : 0);
            console.log('输入的密码长度:', password ? password.length : 0);
            updateSyncStatus('密码错误', 'error');
        }
    } catch (error) {
        updateSyncStatus(`登录失败: ${error.message}`, 'error');
    }
}

// 验证存储的密码（用于页面刷新后保持登录状态）
async function verifyStoredPassword(user, storedPassword) {
    try {
        if (typeof window.firebaseDatabase === 'undefined') {
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
            updateSyncStatus('正在下载数据...', 'info');
            
            // 登录后第一件事：从数据库拉取数据覆盖本地内容
            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
                dataSyncFirebase.download(false).then(result => {
                    if (result.success) {
                        updateSyncStatus('数据下载成功', 'success');
                        // 下载完成后渲染内容
                        renderOverview();
                        renderNavigation();
                        if (currentDayId) {
                            showDay(currentDayId);
                        } else {
                            showDay('day1');
                        }
                    } else {
                        updateSyncStatus('下载失败: ' + (result.message || '未知错误') + '，使用本地数据', 'error');
                        // 即使下载失败，也渲染本地内容
                        renderOverview();
                        renderNavigation();
                        if (currentDayId) {
                            showDay(currentDayId);
                        } else {
                            showDay('day1');
                        }
                    }
                }).catch(error => {
                    console.error('下载失败:', error);
                    updateSyncStatus('下载失败，使用本地数据', 'error');
                    // 即使下载失败，也渲染本地内容
                    renderOverview();
                    renderNavigation();
                    if (currentDayId) {
                        showDay(currentDayId);
                    } else {
                        showDay('day1');
                    }
                });
            } else {
                // Firebase未配置，直接渲染本地内容
                updateSyncStatus('Firebase未配置，使用本地数据', 'info');
                renderOverview();
                renderNavigation();
                if (currentDayId) {
                    showDay(currentDayId);
                } else {
                    showDay('day1');
                }
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

// 退出登录
function handleLogout() {
    localStorage.removeItem('trip_password_hash');
    localStorage.removeItem('trip_current_user');
    showLoginUI();
    updateSyncStatus('已退出登录', 'info');
}

// 显示初始化密码模态框
function showInitPasswordModal() {
    // 添加调试信息
    console.log('showInitPasswordModal 被调用');
    
    const modal = document.getElementById('init-password-modal');
    if (modal) {
        modal.style.display = 'flex';
        console.log('模态框已显示');
    } else {
        alert('找不到初始化密码模态框，请检查页面是否完整加载');
        console.error('找不到 init-password-modal 元素');
    }
}

// 关闭初始化密码模态框
function closeInitPasswordModal() {
    const modal = document.getElementById('init-password-modal');
    if (modal) {
        modal.style.display = 'none';
        // 清空输入
        document.getElementById('init-mrb-password').value = '';
        document.getElementById('init-djy-password').value = '';
    }
}

// 初始化密码
async function initPasswords() {
    // 添加调试信息
    console.log('initPasswords 被调用');
    
    const mrbPasswordEl = document.getElementById('init-mrb-password');
    const djyPasswordEl = document.getElementById('init-djy-password');
    
    if (!mrbPasswordEl || !djyPasswordEl) {
        alert('找不到密码输入框，请检查页面是否完整加载');
        return;
    }
    
    const mrbPassword = mrbPasswordEl.value;
    const djyPassword = djyPasswordEl.value;
    
    if (!mrbPassword || !djyPassword) {
        updateSyncStatus('请为两个用户都设置密码', 'error');
        return;
    }
    
    if (mrbPassword.length < 4 || djyPassword.length < 4) {
        updateSyncStatus('密码长度至少为4位', 'error');
        return;
    }
    
    updateSyncStatus('正在初始化密码...', 'info');
    
    try {
        // 测试模式：使用明文密码（不进行hash）
        console.log('使用明文密码存储（测试模式）');
        
        // 检查Firebase是否可用
        console.log('检查Firebase配置...');
        console.log('window.firebaseDatabase:', typeof window.firebaseDatabase);
        
        if (typeof window.firebaseDatabase === 'undefined') {
            alert('Firebase数据库未初始化，请刷新页面重试');
            updateSyncStatus('Firebase数据库未初始化', 'error');
            return;
        }
        
        console.log('保存密码到Firebase（明文）...');
        const { ref, set, get } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js");
        const passwordsRef = ref(window.firebaseDatabase, 'user_passwords');
        console.log('保存密码路径:', passwordsRef.toString());
        console.log('准备保存的数据（明文）:', { mrb: mrbPassword, djy: djyPassword });
        
        try {
            await set(passwordsRef, {
                mrb: mrbPassword,
                djy: djyPassword
            });
            console.log('密码保存成功！');
            
            // 验证保存是否成功
            const verifySnapshot = await get(passwordsRef);
            const verifyData = verifySnapshot.val();
            console.log('验证保存结果:', verifyData ? '成功' : '失败');
            console.log('保存的数据:', verifyData);
            
            if (verifyData && verifyData.mrb && verifyData.djy) {
                updateSyncStatus('密码初始化成功！现在可以登录了', 'success');
                closeInitPasswordModal();
            } else {
                throw new Error('保存后验证失败，数据可能未正确写入');
            }
        } catch (setError) {
            console.error('保存密码时出错:', setError);
            throw setError; // 重新抛出错误，让外层catch处理
        }
    } catch (error) {
        console.error('初始化密码时出错:', error);
        console.error('错误堆栈:', error.stack);
        alert(`初始化失败: ${error.message}\n请查看控制台获取详细信息`);
        updateSyncStatus(`初始化失败: ${error.message}`, 'error');
    }
}

// 检查写权限（只有登录后才能写入）
function checkWritePermission() {
    if (!isLoggedIn || !currentUser) {
        updateSyncStatus('请先登录才能进行此操作', 'error');
        return false;
    }
    return true;
}

// 将函数暴露到全局，供其他模块使用
window.checkWritePermission = checkWritePermission;
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

window.handleLogin = handleLogin;
window.showInitPasswordModal = showInitPasswordModal;
window.initPasswords = initPasswords;
window.closeInitPasswordModal = closeInitPasswordModal;
window.handleLogout = handleLogout;

// 卡片显示逻辑（滚动模式）
class CardSlider {
    constructor(containerId, cards, dayId) {
        this.container = document.getElementById(containerId);
        this.cards = cards;
        // 使用 Map 存储卡片展开状态（基于 itemId，不保存到 localStorage）
        this.cardExpandedStates = new Map();
        // 使用 Map 存储正在编辑的卡片数据（临时存储，编辑结束时一次性保存）
        this.editingCards = new Map(); // key: itemId, value: { cardIndex, pendingUpdates }
        this.dayId = dayId;
        this.sortMode = false; // 排序模式：false=普通查看模式，true=排序模式（显示上下箭头）
        this.init();
    }

    init() {
        this.renderCards();
        this.attachCardEventsForAll();
    }

    renderCards() {
        // 查找或创建堆叠容器
        let stack = this.container.querySelector('.cards-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'cards-stack sort-mode';
            this.container.appendChild(stack);
        } else {
            stack.innerHTML = '';
            stack.className = 'cards-stack sort-mode';
        }
        
        // 滚动模式：所有卡片平铺显示，可以滚动查看和编辑
        // 根据sortMode决定是否添加sortable-card类
        for (let i = 0; i < this.cards.length; i++) {
            const card = this.createCard(this.cards[i], i);
            if (this.sortMode) {
                card.classList.add('sortable-card');
            }
            stack.appendChild(card);
        }
    }
    
    // 切换排序模式
    toggleSortMode() {
        this.sortMode = !this.sortMode;
        
        // 如果退出排序模式，保存当前顺序
        if (!this.sortMode) {
            this.saveCardOrder();
        }
        
        // 如果进入排序模式，按order字段排序（而不是重新加载）
        if (this.sortMode) {
            // 按order字段排序当前cards数组
            this.cards.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 999999;
                const orderB = b.order !== undefined ? b.order : 999999;
                return orderA - orderB;
            });
        } else {
            // 退出排序模式时，重新加载数据以确保顺序正确
            let day = null;
            if (typeof tripDataStructure !== 'undefined') {
                const unifiedData = tripDataStructure.loadUnifiedData();
                if (unifiedData) {
                    day = tripDataStructure.getDayData(unifiedData, this.dayId);
                }
            }
            if (!day) {
                const tripData = loadTripData();
                day = tripData.days?.find(d => d.id === this.dayId);
            }
            if (day) {
                // 从统一结构加载数据时，需要过滤已删除的项
                let dayItems = day.items || [];
                if (typeof tripDataStructure !== 'undefined') {
                    const unifiedData = tripDataStructure.loadUnifiedData();
                    if (unifiedData) {
                        const unifiedDay = tripDataStructure.getDayData(unifiedData, this.dayId);
                        if (unifiedDay && unifiedDay.items) {
                            // 过滤掉已删除的项，并按order排序
                            dayItems = unifiedDay.items
                                .filter(item => !item._deleted)
                                .sort((a, b) => (a.order || 0) - (b.order || 0));
                        }
                    }
                } else {
                    // 如果没有统一结构，也过滤已删除的项（如果有_deleted属性）
                    dayItems = dayItems.filter(item => !item._deleted);
                }
                
                const customItems = getCustomItems(this.dayId);
                const allItems = [...dayItems, ...customItems];
                
                // 为所有项添加tag属性
                allItems.forEach((item, index) => {
                    if (!item.tag) {
                        if (item.isCustom) {
                            item.tag = item.tag || item.category || '其他';
                        } else {
                            const tagKey = `trip_tag_${this.dayId}_${index}`;
                            const savedTag = localStorage.getItem(tagKey);
                            item.tag = savedTag || item.category || '其他';
                        }
                    }
                });
                
                const orderedItems = applyCardOrder(this.dayId, allItems);
                const filteredItems = applyFilter(orderedItems, this.dayId);
                // 再次确保过滤掉已删除的项
                const finalItems = filteredItems.filter(item => !item._deleted);
                // 更新cards数组为最新的顺序
                this.cards = finalItems;
            }
        }
        
        this.renderCards();
        // 重新绑定事件
        this.attachCardEventsForAll();
        
        // 排序模式下隐藏所有删除按钮
        if (this.sortMode) {
            const deleteBtns = this.container.querySelectorAll('.delete-item-btn');
            deleteBtns.forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
        // 更新按钮状态
        const sortBtn = document.querySelector('.sort-mode-btn');
        if (sortBtn) {
            if (this.sortMode) {
                sortBtn.textContent = '✅ 完成排序';
                sortBtn.classList.add('active');
            } else {
                sortBtn.textContent = '📋 排序';
                sortBtn.classList.remove('active');
            }
        }
    }
    
    // 为所有卡片绑定事件
    attachCardEventsForAll() {
        const cards = this.container.querySelectorAll('.card');
        cards.forEach((card, index) => {
            const cardIndex = parseInt(card.dataset.index);
            if (isNaN(cardIndex)) {
                return;
            }
            this.attachCardEvents(card, cardIndex);
        });
    }

    createCard(cardData, index) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;
        card.dataset.dayId = this.dayId;
        card.dataset.itemIndex = index;
        // 保存itemId以便后续使用统一结构
        if (cardData.id) {
            card.dataset.itemId = cardData.id;
        }
        
        // 获取留言数据、图片和消费表（优先从统一结构读取）
        const itemId = cardData.id || null;
        let comments = [];
        let images = [];
        let spendItems = [];
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    comments = item.comments || [];
                    images = item.images || [];
                    spendItems = item.spend || [];
                }
            }
        }
        // 如果没有从统一结构获取到，使用旧方法
        if (comments.length === 0) {
            comments = this.getComments(this.dayId, index, itemId);
        }
        if (images.length === 0) {
            images = this.getImages(this.dayId, index, itemId);
        }
        // 如果没有从统一结构获取到spend，使用cardData中的spend
        if (spendItems.length === 0 && cardData.spend) {
            spendItems = Array.isArray(cardData.spend) ? cardData.spend : [];
        }
        const itemLikes = this.getItemLikes(this.dayId, index, itemId);
        
        // 获取标签：优先使用tag字段，如果没有则从localStorage读取，最后才使用category作为标签
        let cardTag = cardData.tag;
        if (!cardTag && !cardData.isCustom) {
            // 对于原始项，检查是否有保存的tag
            const tagKey = `trip_tag_${this.dayId}_${index}`;
            const savedTag = localStorage.getItem(tagKey);
            if (savedTag) {
                cardTag = savedTag;
            } else {
                // 如果没有保存的tag，使用category作为标签（向后兼容）
                cardTag = cardData.category || '其他';
            }
        } else if (!cardTag) {
            // 自定义项如果没有tag，使用category作为标签
            cardTag = cardData.category || '其他';
        }
        // 使用 itemId 获取展开状态
        const isExpanded = this.getCardExpanded(itemId);
        let html = `
            <div class="card-header">
                <div class="card-header-main">
                    <div class="card-sort-buttons">
                        <button class="card-sort-btn card-sort-up" data-index="${index}" title="上移">▲</button>
                        <button class="card-sort-btn card-sort-down" data-index="${index}" title="下移">▼</button>
                    </div>
                    <div class="card-header-content">
                        <div class="card-category-container" data-card-index="${index}">
                            <span class="card-category-display">${this.escapeHtml(cardData.category)}</span>
                            <input type="text" class="card-category-input" value="${this.escapeHtml(cardData.category)}" style="display: none;" />
                        </div>
                        <div class="card-time-container" data-card-index="${index}">
                            ${cardData.time ? `
                                <span class="card-time-display">${this.escapeHtml(cardData.time)}</span>
                                <input type="time" class="card-time-input" value="${this.formatTimeForInput(cardData.time)}" style="display: none;" />
                            ` : `
                                <span class="card-time-display" style="display: inline-block; color: #999; cursor: pointer;" title="点击添加时间">+ 添加时间</span>
                                <input type="time" class="card-time-input" value="" style="display: none;" />
                            `}
                        </div>
                        <div class="card-tag tag-${cardTag}" data-card-index="${index}" data-current-tag="${cardTag}">${this.getTagLabel(cardTag)}</div>
                    </div>
                    <div class="card-header-actions">
                        <button class="delete-item-btn" data-item-id="${cardData.id}" title="删除此项" ${this.sortMode ? 'style="display: none;"' : ''}>×</button>
                    </div>
                </div>
            </div>
            <div class="card-content ${isExpanded ? 'expanded' : 'collapsed'}">
        `;
        
        // 添加图片/地图区域
        html += `
            <div class="card-section image-section">
                <div class="image-upload-controls">
                    <label class="image-upload-btn" title="上传图片" style="cursor: pointer; display: inline-block;">
                        📷 上传图片
                        <input type="file" class="image-upload-input" accept="image/*" multiple style="display: none;" />
                    </label>
                </div>
                <div class="image-container">
                    ${images.length > 0 ? `
                        <div class="image-carousel">
                            <button class="carousel-btn carousel-prev" title="上一张">‹</button>
                            <div class="carousel-wrapper">
                                <div class="carousel-track" style="transform: translateX(0);">
                                    ${images.map((img, imgIndex) => `
                                        <div class="carousel-slide">
                                            <img src="${this.escapeHtml(img)}" alt="图片 ${imgIndex + 1}" class="card-image" />
                                            <button class="image-remove-btn" data-image-index="${imgIndex}" title="删除图片">×</button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <button class="carousel-btn carousel-next" title="下一张">›</button>
                            <div class="carousel-indicators">
                                ${images.map((img, imgIndex) => `
                                    <span class="carousel-dot ${imgIndex === 0 ? 'active' : ''}" data-index="${imgIndex}"></span>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="image-placeholder">
                            <div class="image-placeholder-icon">🗺️</div>
                            <div class="image-placeholder-text">暂无图片</div>
                        </div>
                    `}
                </div>
            </div>
        `;
        
        // 读取计划项（优先从localStorage读取修改后的数据）
        // 优先从统一结构读取plan数据
        let planData = null;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item && item.plan) {
                    planData = item.plan;
                }
            }
        }
        
        // 如果统一结构没有plan数据，使用cardData.plan
        if (!planData) {
            planData = cardData.plan;
        }
        
        // 如果还是没有，尝试从旧的存储方式读取（仅对非自定义项）
        if (!planData && !cardData.isCustom) {
            const planKey = `trip_plan_${this.dayId}_${index}`;
            const savedPlan = localStorage.getItem(planKey);
            if (savedPlan) {
                try {
                    planData = JSON.parse(savedPlan);
                } catch (e) {
                    // 如果解析失败，使用原始数据
                }
            }
        }
        
        // 总是显示计划区域，即使没有计划项也可以添加
        // 支持plan为数组或字符串格式
        // 如果是数组，直接使用；如果是字符串，转换为单元素数组（向后兼容）
        // 处理plan数据，支持字符串和对象格式，过滤已删除的项
        let planItems = [];
        if (planData) {
            if (Array.isArray(planData)) {
                planItems = planData
                    .map(item => {
                        // 过滤掉 null 和 undefined
                        if (!item) {
                            return null;
                        }
                        // 如果是对象且标记为删除，返回null（不显示）
                        if (typeof item === 'object' && item._deleted) {
                            return null;
                        }
                        // 如果是对象，保留对象本身（用于后续渲染时提取_text）
                        if (typeof item === 'object' && item !== null) {
                            return item;
                        }
                        // 如果是字符串，直接返回
                        if (typeof item === 'string') {
                            return item;
                        }
                        return null;
                    })
                    .filter(item => item !== null && item !== undefined && (typeof item === 'string' ? item.trim().length > 0 : true));
            } else if (typeof planData === 'string') {
                planItems = [planData].filter(item => item && item.trim().length > 0);
            }
        }
        
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title plan">计划</div>
                </div>
                <ul class="plan-list">
                    ${planItems.length > 0 ? planItems
                        .filter(planItem => {
                            // 过滤掉 null、undefined 和已删除的项
                            if (!planItem) {
                                return false;
                            }
                            // 过滤掉已删除的项（兼容旧数据）
                            if (typeof planItem === 'object' && planItem._deleted) {
                                return false;
                            }
                            return true;
                        })
                        .map((planItem, filteredIndex) => {
                        // 安全检查：如果 planItem 为 null 或 undefined，跳过
                        if (!planItem) {
                            return '';
                        }
                        // 支持新旧两种格式：字符串或对象
                        const planItemText = typeof planItem === 'string' ? planItem : (planItem && planItem._text ? planItem._text : planItem || '');
                        const planHash = (planItem && typeof planItem === 'object' && planItem._hash) ? planItem._hash : null;
                        // 使用原始数组中的索引（不是过滤后的索引）
                        const originalPlanItems = Array.isArray(cardData.plan) ? cardData.plan : (cardData.plan ? [cardData.plan] : []);
                        const originalIndex = originalPlanItems.findIndex(p => {
                            // 安全检查：过滤掉 null 和 undefined
                            if (!p || !planItem) {
                                return false;
                            }
                            if (typeof p === 'string' && typeof planItem === 'string') {
                                return p === planItem;
                            } else if (typeof p === 'object' && typeof planItem === 'object' && p !== null && planItem !== null) {
                                return p._hash === planItem._hash || (p._text === planItem._text && !p._hash && !planItem._hash);
                            }
                            return false;
                        });
                        const planIndex = originalIndex !== -1 ? originalIndex : filteredIndex;
                        const planItemLikes = this.getPlanItemLikes(this.dayId, index, planIndex, itemId);
                        // 新格式：planItemLikes 是数组 ['mrb', 'djy']
                        const planItemLikeCount = Array.isArray(planItemLikes) ? planItemLikes.length : 0;
                        const isLiked = Array.isArray(planItemLikes) && planItemLikes.includes(currentUser);
                    return `
                        <li class="plan-item">
                            <span class="plan-item-text">${this.escapeHtmlKeepBr(planItemText)}</span>
                            <div class="plan-item-actions">
                                <button class="plan-item-like-btn ${isLiked ? 'liked' : ''}" 
                                        data-plan-index="${planIndex}" 
                                        data-plan-hash="${planHash || ''}"
                                        data-item-id="${itemId || ''}"
                                        title="点赞">
                                    <span class="like-icon">${isLiked ? '❤️' : '🤍'}</span>
                                    ${planItemLikeCount > 0 ? `<span class="like-count">${planItemLikeCount}</span>` : ''}
                                </button>
                                <button class="plan-item-delete-btn" 
                                        data-card-index="${index}"
                                        data-plan-index="${planIndex}"
                                        data-plan-hash="${planHash || ''}"
                                        data-item-id="${itemId || ''}"
                                        title="删除此项">×</button>
                            </div>
                        </li>
                    `;
                    }).join('') : ''}
                    <li class="plan-item plan-add-item">
                        <button class="plan-add-btn" data-card-index="${index}" title="添加计划项">+ 添加计划项</button>
                        <div class="plan-input-container" style="display: none;">
                            <input type="text" class="plan-input" placeholder="输入计划项..." />
                            <div class="plan-input-actions">
                                <button class="plan-input-confirm">✓</button>
                                <button class="plan-input-cancel">✕</button>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        `;
        
        // 备注区域（总是显示，即使没有内容）
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title note">备注</div>
                </div>
                <div class="card-section-content note-content-container" data-card-index="${index}">
                    <div class="note-content-display markdown-content">${this.markdownToHtml(cardData.note || '')}</div>
                    <textarea class="note-content-input" style="display: none;" placeholder="输入备注（支持 Markdown 格式）...">${this.escapeHtml(cardData.note || '')}</textarea>
                </div>
            </div>
        `;
        
        // 添加消费表区域（在备注和留言之间）
        html += `
            <div class="card-section">
                <div class="card-section-header">
                    <div class="card-section-title spend">💰 消费表</div>
                </div>
                <div class="card-section-content spend-content">
                    <table class="spend-table">
                        <thead>
                            <tr>
                                <th>项目</th>
                                <th>金额</th>
                                <th>支出人</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody class="spend-tbody">
                            ${spendItems.length > 0 ? spendItems.map((spendItem, spendIndex) => {
                                const itemName = spendItem.item || '';
                                const amount = spendItem.amount || 0;
                                const payer = spendItem.payer || '';
                                return `
                                <tr class="spend-row" data-spend-index="${spendIndex}">
                                    <td class="spend-item-name">${this.escapeHtml(itemName)}</td>
                                    <td class="spend-item-amount">¥${parseFloat(amount).toFixed(2)}</td>
                                    <td class="spend-item-payer">${this.escapeHtml(payer)}</td>
                                    <td class="spend-item-action">
                                        <button class="spend-delete-btn" data-spend-index="${spendIndex}" title="删除">×</button>
                                    </td>
                                </tr>
                                `;
                            }).join('') : '<tr><td colspan="4" class="spend-empty">暂无消费记录</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr class="spend-total-row">
                                <td colspan="3" class="spend-total-label">总计：</td>
                                <td class="spend-total-amount">¥${spendItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="spend-add-container">
                        <button class="spend-add-btn" data-card-index="${index}" title="添加消费项">+ 添加消费项</button>
                        <div class="spend-input-container" style="display: none;">
                            <input type="text" class="spend-item-input" placeholder="项目名称..." />
                            <input type="number" class="spend-amount-input" placeholder="金额" step="0.01" min="0" />
                            <select class="spend-payer-input">
                                <option value="">请选择支出人</option>
                                <option value="mrb">mrb</option>
                                <option value="djy">djy</option>
                                <option value="共同">共同</option>
                            </select>
                            <div class="spend-input-actions">
                                <button class="spend-input-confirm">✓</button>
                                <button class="spend-input-cancel">✕</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 添加留言区域（移到备注下面）
        html += `
            <div class="card-section">
                <div class="card-section-title comment">💬 留言</div>
                <div class="comments-container">
                    ${comments.map((comment, commentIndex) => {
                        const commentLikes = this.getCommentLikes(this.dayId, index, commentIndex, itemId);
                        // 新格式：commentLikes 是数组 ['mrb', 'djy']
                        const commentLikeCount = Array.isArray(commentLikes) ? commentLikes.length : 0;
                        const isLiked = Array.isArray(commentLikes) && commentLikes.includes(currentUser);
                        return `
                        <div class="comment-item ${comment.user === 'mrb' ? 'user-a' : 'user-b'}" data-comment-hash="${comment._hash || ''}">
                            <div class="comment-header">
                                <span class="comment-user">${comment.user === 'mrb' ? '👤 mrb' : '👤 djy'}</span>
                                <span class="comment-time">${this.formatTime(comment.timestamp)}</span>
                                <button class="comment-delete-btn" data-comment-hash="${comment._hash || ''}" title="删除留言">×</button>
                            </div>
                            <div class="comment-content">${this.escapeHtml(comment.message)}</div>
                            <button class="comment-like-btn ${isLiked ? 'liked' : ''}" 
                                    data-comment-index="${commentIndex}" title="点赞">
                                <span class="like-icon">${isLiked ? '❤️' : '🤍'}</span>
                                ${commentLikeCount > 0 ? `<span class="like-count">${commentLikeCount}</span>` : ''}
                            </button>
                        </div>
                    `;
                    }).join('')}
                </div>
                <div class="comment-input-container">
                    <textarea class="comment-input" placeholder="输入留言..." rows="2"></textarea>
                    <button class="comment-submit">发送</button>
                </div>
            </div>
        `;
        
        // 关闭card-content
        html += '</div>';
        
        // 在卡片最下方添加折叠展开按钮（在card-content外面）
        html += `
            <div class="card-footer">
                <button class="card-expand-btn" data-expanded="${isExpanded}" title="${isExpanded ? '收起' : '展开'}" style="transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};">
                    ▼
                </button>
            </div>
        `;
        
        // 关闭整个card
        html += '</div>';
        card.innerHTML = html;
        
        // 添加事件监听器
        this.attachCardEvents(card, index);
        
        return card;
    }
    
    attachCardEvents(card, index) {
        // 时间编辑事件
        const timeContainer = card.querySelector('.card-time-container');
        if (timeContainer) {
            const timeDisplay = timeContainer.querySelector('.card-time-display');
            const timeInput = timeContainer.querySelector('.card-time-input');
            
            if (timeDisplay && timeInput) {
                // 点击显示区域，切换到编辑模式
                timeDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!checkWritePermission()) return;
                    
                    timeDisplay.style.display = 'none';
                    timeInput.style.display = 'inline-block';
                    timeInput.focus();
                    // 如果没有值，不选中（让用户直接输入）
                    if (timeInput.value) {
                        timeInput.select();
                    }
                });
                
                // 时间输入框失去焦点时保存
                timeInput.addEventListener('blur', () => {
                    const newTime = timeInput.value;
                    const cardData = this.cards[index];
                    if (!cardData) return;
                    
                    const itemId = cardData.id;
                    if (newTime) {
                        // 格式化时间为 HH:mm
                        const formattedTime = this.formatTimeForDisplay(newTime);
                        timeDisplay.textContent = formattedTime;
                        timeDisplay.style.color = ''; // 移除灰色，恢复正常颜色
                        timeDisplay.title = '点击编辑时间';
                        
                        // 使用统一的更新方法
                        if (itemId) {
                            this.updateCardData(itemId, { time: formattedTime });
                            // 编辑结束后触发同步
                            if (typeof triggerImmediateUpload === 'function') {
                                triggerImmediateUpload();
                            }
                        }
                    } else {
                        // 如果清空时间，恢复显示"添加时间"提示
                        timeDisplay.textContent = '+ 添加时间';
                        timeDisplay.style.color = '#999';
                        timeDisplay.title = '点击添加时间';
                        
                        // 使用统一的更新方法
                        if (itemId) {
                            this.updateCardData(itemId, { time: '' });
                            // 只上传这个 item，不进行全量上传
                            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                    console.error('上传 item 失败:', error);
                                });
                            }
                        }
                    }
                    
                    timeDisplay.style.display = 'inline-block';
                    timeInput.style.display = 'none';
                });
                
                // 按Enter键保存
                timeInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        timeInput.blur();
                    }
                });
            }
        }
        
        // 分类（category）编辑事件
        const categoryContainer = card.querySelector('.card-category-container');
        if (categoryContainer) {
            const categoryDisplay = categoryContainer.querySelector('.card-category-display');
            const categoryInput = categoryContainer.querySelector('.card-category-input');
            
            if (categoryDisplay && categoryInput) {
                categoryDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!checkWritePermission()) return;
                    
                    categoryDisplay.style.display = 'none';
                    categoryInput.style.display = 'inline-block';
                    categoryInput.focus();
                    categoryInput.select();
                });
                
                categoryInput.addEventListener('blur', () => {
                    const newCategory = categoryInput.value.trim();
                    if (newCategory) {
                        categoryDisplay.textContent = newCategory;
                        
                        // 使用统一的更新方法
                        const cardData = this.cards[index];
                        if (cardData) {
                            const itemId = cardData.id;
                            if (itemId) {
                                this.updateCardData(itemId, { category: newCategory });
                                // 只上传这个 item，不进行全量上传
                                if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                        console.error('上传 item 失败:', error);
                                    });
                                }
                            }
                        }
                    }
                    
                    categoryDisplay.style.display = 'inline-block';
                    categoryInput.style.display = 'none';
                });
                
                categoryInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        categoryInput.blur();
                    }
                });
            }
        }
        
        // 备注（note）编辑事件
        const noteContainer = card.querySelector('.note-content-container');
        if (noteContainer) {
            const noteDisplay = noteContainer.querySelector('.note-content-display');
            const noteInput = noteContainer.querySelector('.note-content-input');
            
            if (noteDisplay && noteInput) {
                // 保存备注的函数
                const saveNote = () => {
                    const newNote = noteInput.value.trim();
                    noteDisplay.innerHTML = this.markdownToHtml(newNote || '');
                    
                    // 使用统一的更新方法
                    const cardData = this.cards[index];
                    if (cardData) {
                        const itemId = cardData.id;
                        if (itemId) {
                            try {
                                this.updateCardData(itemId, { note: newNote });
                                // 只上传这个 item，不进行全量上传
                                if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                    dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                        console.error('上传 item 失败:', error);
                                    });
                                }
                            } catch (error) {
                                console.error('更新备注失败:', error);
                            }
                        }
                    }
                    
                    // 无论更新是否成功，都要隐藏输入框
                    noteDisplay.style.display = 'block';
                    noteInput.style.display = 'none';
                };
                
                // 标记输入框是否处于编辑状态
                let isEditing = false;
                
                noteDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!checkWritePermission()) return;
                    
                    noteDisplay.style.display = 'none';
                    noteInput.style.display = 'block';
                    noteInput.focus();
                    isEditing = true;
                });
                
                // 处理 blur 事件
                let isSaving = false;
                const handleBlur = () => {
                    // 防止重复保存
                    if (isSaving || !isEditing) return;
                    isSaving = true;
                    isEditing = false;
                    
                    // 使用 setTimeout 延迟处理，确保其他点击事件先执行
                    setTimeout(() => {
                        try {
                            // 检查输入框是否仍然可见（可能已经被其他操作隐藏）
                            if (noteInput.style.display !== 'none' && noteInput.offsetParent !== null) {
                                saveNote();
                            } else {
                                // 如果已经被隐藏，确保状态正确
                                noteDisplay.style.display = 'block';
                                noteInput.style.display = 'none';
                            }
                        } catch (error) {
                            console.error('保存备注时出错:', error);
                            // 即使出错也要隐藏输入框
                            noteDisplay.style.display = 'block';
                            noteInput.style.display = 'none';
                        } finally {
                            isSaving = false;
                        }
                    }, 200);
                };
                
                // 添加文档级别的点击监听器作为备用方案
                let documentClickHandler = null;
                
                const setupDocumentClickHandler = () => {
                    // 如果已经有监听器，先移除
                    if (documentClickHandler) {
                        document.removeEventListener('click', documentClickHandler, true);
                    }
                    
                    documentClickHandler = (e) => {
                        // 如果输入框可见且点击的不是输入框相关元素
                        if (isEditing && noteInput.style.display === 'block' && 
                            !noteContainer.contains(e.target) && 
                            !e.target.closest('.note-content-container')) {
                            // 手动触发保存
                            handleBlur();
                        }
                    };
                    
                    // 使用捕获阶段，确保在其他点击事件之前处理
                    setTimeout(() => {
                        document.addEventListener('click', documentClickHandler, true);
                    }, 100);
                };
                
                // 当输入框获得焦点时，添加文档点击监听器
                noteInput.addEventListener('focus', () => {
                    setupDocumentClickHandler();
                });
                
                // 当输入框失去焦点时，移除文档点击监听器并保存
                noteInput.addEventListener('blur', () => {
                    handleBlur();
                    // 延迟移除监听器，确保点击事件能先处理
                    setTimeout(() => {
                        if (documentClickHandler) {
                            document.removeEventListener('click', documentClickHandler, true);
                            documentClickHandler = null;
                        }
                    }, 300);
                });
                
                // 添加 Enter 键保存（Ctrl+Enter 或 Cmd+Enter）
                noteInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        saveNote();
                        noteInput.blur();
                    }
                });
            }
        }
        
        // 图片上传事件
        const imageUploadBtn = card.querySelector('.image-upload-btn');
        const imageUploadInput = card.querySelector('.image-upload-input');
        
        if (imageUploadBtn && imageUploadInput) {
            console.log('找到图片上传按钮和输入框，开始绑定事件', { cardIndex: index });
            
            // 防止重复触发的标志
            let isProcessing = false;
            let touchStartTime = 0;
            let touchStartY = 0;
            let touchStartX = 0;
            
            // 由于使用了 label，点击 label 会自动触发 input
            // 只需要处理 change 事件即可
            // 但为了兼容性，仍然保留一些事件处理
            
            // 移除旧的事件监听器（如果存在）- 通过克隆节点来移除所有事件监听器
            if (imageUploadInput.dataset.uploadHandler && imageUploadInput.parentNode) {
                const newInput = imageUploadInput.cloneNode(true);
                imageUploadInput.parentNode.replaceChild(newInput, imageUploadInput);
            }
            
            // 获取实际的 input 元素（可能是新克隆的）
            const actualInput = card.querySelector('.image-upload-input');
            if (!actualInput) return;
            
            // 标记已绑定事件监听器
            actualInput.dataset.uploadHandler = 'bound';
            
            // 创建新的事件处理函数
            const uploadHandler = (e) => {
                // 防止重复处理
                if (isProcessing) {
                    console.log('图片上传正在处理中，跳过重复触发');
                    e.target.value = ''; // 清空输入，防止重复触发
                    return;
                }
                isProcessing = true;
                
                // 延迟处理，确保在移动设备上文件选择完成
                setTimeout(() => {
                    const files = Array.from(e.target.files || []);
                    
                    if (files.length === 0) {
                        // 如果没有文件，可能是用户取消了选择
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                        return;
                    }
                    
                    // 检查文件大小（限制为10MB）
                    const maxSize = 10 * 1024 * 1024; // 10MB
                    const validFiles = files.filter(file => {
                        // 验证文件类型
                        if (!file.type || !file.type.startsWith('image/')) {
                            alert(`文件 "${file.name}" 不是有效的图片文件`);
                            return false;
                        }
                        
                        // 验证文件大小
                        if (file.size > maxSize) {
                            alert(`文件 "${file.name}" 太大（${(file.size / 1024 / 1024).toFixed(2)}MB），最大支持10MB`);
                            return false;
                        }
                        
                        // 验证文件大小不为0
                        if (file.size === 0) {
                            alert(`文件 "${file.name}" 为空，无法上传`);
                            return false;
                        }
                        
                        return true;
                    });
                    
                    if (validFiles.length === 0) {
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                        return;
                    }
                    
                    // 显示上传进度提示
                    const uploadBtn = card.querySelector('.image-upload-btn');
                    const originalText = uploadBtn ? uploadBtn.textContent : '';
                    
                    // 更新状态栏
                    if (typeof updateSyncStatus === 'function') {
                        updateSyncStatus(`正在上传 ${validFiles.length} 张图片到 Cloudinary...`, 'info');
                    }
                    
                    if (uploadBtn) {
                        uploadBtn.textContent = `📤 上传中 (0/${validFiles.length})...`;
                        uploadBtn.disabled = true;
                    }
                    
                    // 跟踪上传进度
                    let uploadedCount = 0;
                    
                    // 上传图片到 Cloudinary
                    const uploadPromises = validFiles.map((file, fileIndex) => {
                        return cloudinaryService.uploadImage(file)
                            .then(result => {
                                uploadedCount++;
                                console.log(`✅ 图片 ${file.name} 上传成功:`, result.url);
                                
                                // 更新按钮进度
                                if (uploadBtn) {
                                    uploadBtn.textContent = `📤 上传中 (${uploadedCount}/${validFiles.length})...`;
                                }
                                
                                // 验证 URL 是否为有效的 Cloudinary URL
                                if (!result.url || !result.url.includes('cloudinary.com')) {
                                    console.warn('⚠️ 警告：返回的 URL 可能不是有效的 Cloudinary URL:', result.url);
                                }
                                
                                return {
                                    url: result.url,
                                    fileName: file.name,
                                    publicId: result.publicId
                                };
                            })
                            .catch(error => {
                                console.error(`❌ 图片 ${file.name} 上传失败:`, error);
                                throw error;
                            });
                    });
                    
                    // 保留旧代码作为备用（如果需要）
                    const readers = validFiles.map((file, fileIndex) => {
                        return new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            
                            // 设置超时（30秒）
                            const timeout = setTimeout(() => {
                                reader.abort();
                                reject(new Error(`读取文件 "${file.name}" 超时`));
                            }, 30000);
                            
                            reader.onload = (event) => {
                                clearTimeout(timeout);
                                // 验证读取结果是否为有效的图片数据
                                if (!event.target.result || !event.target.result.startsWith('data:image/')) {
                                    reject(new Error(`文件 "${file.name}" 不是有效的图片格式`));
                                } else {
                                    resolve(event.target.result);
                                }
                            };
                            
                            reader.onerror = (error) => {
                                clearTimeout(timeout);
                                reject(new Error(`读取文件 "${file.name}" 失败: ${error.message || '未知错误'}`));
                            };
                            
                            reader.onabort = () => {
                                clearTimeout(timeout);
                                reject(new Error(`读取文件 "${file.name}" 被中断`));
                            };
                            
                            try {
                                reader.readAsDataURL(file);
                            } catch (error) {
                                clearTimeout(timeout);
                                reject(new Error(`无法读取文件 "${file.name}": ${error.message}`));
                            }
                        });
                    });
                    
                    // 使用 Cloudinary 上传
                    Promise.all(uploadPromises).then(imageResults => {
                        const itemId = card.dataset.itemId || null;
                        const currentImages = this.getImages(this.dayId, index, itemId);
                        
                        // 提取 URL 数组
                        const imageUrls = imageResults.map(img => img.url);
                        const uploadedFileNames = imageResults.map(img => img.fileName).join('、');
                        
                        // 去重：只添加不存在的图片 URL
                        const existingUrls = new Set(currentImages);
                        const newImageUrls = imageUrls.filter(url => !existingUrls.has(url));
                        
                        // 只保存 Cloudinary URL，不保存 base64
                        const newImages = [...currentImages, ...newImageUrls];
                        this.setImages(this.dayId, index, newImages, itemId);
                        
                        // 如果所有图片都已存在，说明可能是重复触发
                        if (newImageUrls.length === 0 && imageUrls.length > 0) {
                            console.warn('⚠️ 警告：所有图片都已存在，可能是重复触发上传');
                            isProcessing = false; // 重置标志
                            e.target.value = ''; // 清空输入
                            if (uploadBtn) {
                                uploadBtn.disabled = false;
                                uploadBtn.textContent = originalText;
                            }
                            return;
                        }
                        
                        // 验证图片是否能正常显示（检查 URL 格式）
                        const invalidUrls = imageUrls.filter(url => !url || !url.startsWith('http'));
                        if (invalidUrls.length > 0) {
                            console.warn('⚠️ 警告：部分图片 URL 格式可能不正确:', invalidUrls);
                        }
                        
                        // 显示成功消息
                        const successMessage = `✅ 成功上传 ${imageUrls.length} 张图片到 Cloudinary${uploadedFileNames ? `: ${uploadedFileNames}` : ''}`;
                        console.log(successMessage);
                        
                        if (typeof updateSyncStatus === 'function') {
                            updateSyncStatus(successMessage, 'success');
                            // 3秒后清除成功消息
                            setTimeout(() => {
                                if (typeof updateSyncStatus === 'function') {
                                    updateSyncStatus('', '');
                                }
                            }, 3000);
                        }
                        
                        this.renderCards();
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                                console.error('上传 item 到 Firebase 失败:', error);
                            });
                        } else {
                            // 如果没有部分上传方法，使用全量上传
                            triggerImmediateUpload();
                        }
                        
                        // 恢复按钮状态并显示成功提示
                        if (uploadBtn) {
                            uploadBtn.textContent = '✅ 上传完成';
                            uploadBtn.style.color = '#28a745';
                            setTimeout(() => {
                                uploadBtn.textContent = originalText;
                                uploadBtn.style.color = '';
                                uploadBtn.disabled = false;
                            }, 2000);
                        } else {
                            if (uploadBtn) {
                                uploadBtn.textContent = originalText;
                                uploadBtn.disabled = false;
                            }
                        }
                        
                        // 清空文件输入并重置标志
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                    }).catch(error => {
                        console.error('❌ 图片上传失败:', error);
                        const errorMessage = `图片上传失败: ${error.message}`;
                        
                        if (typeof updateSyncStatus === 'function') {
                            updateSyncStatus(errorMessage, 'error');
                            setTimeout(() => {
                                if (typeof updateSyncStatus === 'function') {
                                    updateSyncStatus('', '');
                                }
                            }, 5000);
                        }
                        
                        alert(errorMessage);
                        e.target.value = '';
                        isProcessing = false; // 重置标志
                        
                        // 恢复按钮状态
                        if (uploadBtn) {
                            uploadBtn.textContent = originalText;
                            uploadBtn.disabled = false;
                            uploadBtn.style.color = '';
                        }
                    });
                }, 100); // 延迟100ms，确保文件选择完成
            };
            
            // 绑定事件监听器
            actualInput.addEventListener('change', uploadHandler);
        }
        
        // 标签点击修改
        const cardTag = card.querySelector('.card-tag');
        if (cardTag) {
            cardTag.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.editTag(index);
            });
        }
        
        // 计划项添加按钮
        const planAddBtn = card.querySelector('.plan-add-btn');
        const planInputContainer = card.querySelector('.plan-input-container');
        const planInput = card.querySelector('.plan-input');
        const planInputConfirm = card.querySelector('.plan-input-confirm');
        const planInputCancel = card.querySelector('.plan-input-cancel');
        
        if (planAddBtn && planInputContainer) {
            // 点击添加按钮，显示输入框
            planAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                planAddBtn.style.display = 'none';
                planInputContainer.style.display = 'flex';
                planInput.focus();
            });
            
            // 确认添加
            if (planInputConfirm && planInput) {
                const confirmAdd = async () => {
                    const newItem = planInput.value.trim();
                    console.log('确认添加计划项:', newItem, 'cardIndex:', index);
                    if (newItem) {
                        try {
                            await this.addPlanItem(index, newItem);
                            console.log('addPlanItem 执行完成');
                            // 重置输入框和UI状态
                            planInput.value = '';
                            planInputContainer.style.display = 'none';
                            planAddBtn.style.display = 'block';
                        } catch (error) {
                            console.error('添加计划项失败:', error);
                        }
                    } else {
                        // 如果为空，恢复按钮显示
                        planInputContainer.style.display = 'none';
                        planAddBtn.style.display = 'block';
                        planInput.value = '';
                    }
                };
                
                planInputConfirm.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    confirmAdd();
                });
                
                planInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        confirmAdd();
                    }
                });
            }
            
            // 取消按钮
            if (planInputCancel) {
                planInputCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    planInput.value = '';
                    planInputContainer.style.display = 'none';
                    planAddBtn.style.display = 'block';
                });
            }
            
            // 取消添加
            if (planInputCancel) {
                planInputCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    planInputContainer.style.display = 'none';
                    planAddBtn.style.display = 'block';
                    planInput.value = '';
                });
            }
        }
        
        // 展开/收起功能 - 同时绑定到footer和按钮
        const cardFooter = card.querySelector('.card-footer');
        const expandBtn = card.querySelector('.card-expand-btn');
        
        // 为footer添加点击事件（作为备用）
        if (cardFooter) {
            cardFooter.addEventListener('click', (e) => {
                // 如果点击的不是按钮本身，也触发展开/收起
                if (e.target !== expandBtn && !expandBtn.contains(e.target)) {
                    if (expandBtn) {
                        expandBtn.click();
                    }
                }
            });
        }
        
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const itemId = card.dataset.itemId || null;
                const isExpanded = expandBtn.dataset.expanded === 'true';
                const newIsExpanded = !isExpanded;
                this.setCardExpanded(itemId, newIsExpanded);
                
                // 直接更新当前卡片的展开状态，避免重新渲染整个卡片列表
                const cardContent = card.querySelector('.card-content');
                if (cardContent) {
                    if (newIsExpanded) {
                        cardContent.classList.remove('collapsed');
                        cardContent.classList.add('expanded');
                        expandBtn.style.transform = 'rotate(180deg)';
                        expandBtn.setAttribute('data-expanded', 'true');
                        expandBtn.title = '收起';
                    } else {
                        cardContent.classList.remove('expanded');
                        cardContent.classList.add('collapsed');
                        expandBtn.style.transform = 'rotate(0deg)';
                        expandBtn.setAttribute('data-expanded', 'false');
                        expandBtn.title = '展开';
                    }
                } else {
                    // 如果找不到card-content，重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                }
            });
            
            // 也处理触摸事件，确保移动设备上也能正常工作
            expandBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const itemId = card.dataset.itemId || null;
                const isExpanded = expandBtn.dataset.expanded === 'true';
                const newIsExpanded = !isExpanded;
                this.setCardExpanded(itemId, newIsExpanded);
                
                // 直接更新当前卡片的展开状态，避免重新渲染整个卡片列表
                const cardContent = card.querySelector('.card-content');
                if (cardContent) {
                    if (newIsExpanded) {
                        cardContent.classList.remove('collapsed');
                        cardContent.classList.add('expanded');
                        expandBtn.style.transform = 'rotate(180deg)';
                        expandBtn.setAttribute('data-expanded', 'true');
                        expandBtn.title = '收起';
                    } else {
                        cardContent.classList.remove('expanded');
                        cardContent.classList.add('collapsed');
                        expandBtn.style.transform = 'rotate(0deg)';
                        expandBtn.setAttribute('data-expanded', 'false');
                        expandBtn.title = '展开';
                    }
                } else {
                    // 如果找不到card-content，重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                }
            });
        }
        
        // 排序按钮（仅在排序模式下启用）
        const sortButtons = card.querySelector('.card-sort-buttons');
        if (sortButtons) {
            if (this.sortMode) {
                sortButtons.style.display = 'flex';
                
                const upBtn = sortButtons.querySelector('.card-sort-up');
                const downBtn = sortButtons.querySelector('.card-sort-down');
                
                // 清除旧的事件监听器（通过克隆节点）
                const newSortButtons = sortButtons.cloneNode(true);
                sortButtons.parentNode.replaceChild(newSortButtons, sortButtons);
                
                const newUpBtn = newSortButtons.querySelector('.card-sort-up');
                const newDownBtn = newSortButtons.querySelector('.card-sort-down');
                
                // 禁用第一个的上移按钮和最后一个的下移按钮
                if (newUpBtn) {
                    if (index === 0) {
                        newUpBtn.disabled = true;
                    } else {
                        newUpBtn.disabled = false;
                        newUpBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.moveCardUp(index);
                        });
                    }
                }
                
                if (newDownBtn) {
                    if (index === this.cards.length - 1) {
                        newDownBtn.disabled = true;
                    } else {
                        newDownBtn.disabled = false;
                        newDownBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.moveCardDown(index);
                        });
                    }
                }
            } else {
                sortButtons.style.display = 'none';
            }
        }
        
        // 图片轮播控制
        const carousel = card.querySelector('.image-carousel');
        if (carousel) {
            let currentIndex = 0;
            const itemId = card.dataset.itemId || null;
            const images = this.getImages(this.dayId, index, itemId);
            const track = carousel.querySelector('.carousel-track');
            const prevBtn = carousel.querySelector('.carousel-prev');
            const nextBtn = carousel.querySelector('.carousel-next');
            const dots = carousel.querySelectorAll('.carousel-dot');
            const removeBtns = carousel.querySelectorAll('.image-remove-btn');
            
            const updateCarousel = () => {
                track.style.transform = `translateX(-${currentIndex * 100}%)`;
                dots.forEach((dot, i) => {
                    dot.classList.toggle('active', i === currentIndex);
                });
            };
            
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIndex = (currentIndex - 1 + images.length) % images.length;
                    updateCarousel();
                });
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIndex = (currentIndex + 1) % images.length;
                    updateCarousel();
                });
            }
            
            dots.forEach((dot, i) => {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIndex = i;
                    updateCarousel();
                });
            });
            
            // 触摸滑动支持
            let startX = 0;
            let isDragging = false;
            track.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                isDragging = true;
            });
            
            track.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
            });
            
            track.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                const endX = e.changedTouches[0].clientX;
                const diff = startX - endX;
                
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        currentIndex = (currentIndex + 1) % images.length;
                    } else {
                        currentIndex = (currentIndex - 1 + images.length) % images.length;
                    }
                    updateCarousel();
                }
            });
            
            // 删除图片（只删除 URL，不删除 Cloudinary 上的实际文件）
            removeBtns.forEach((btn, btnIndex) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const itemId = card.dataset.itemId || null;
                    const images = this.getImages(this.dayId, index, itemId);
                    
                    // 从本地数组中删除 URL
                    images.splice(btnIndex, 1);
                    this.setImages(this.dayId, index, images, itemId);
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                    
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    }
                });
            });
        }
        
        // 删除行程项（排序模式下禁用）
        const deleteBtn = card.querySelector('.delete-item-btn');
        if (deleteBtn) {
            // 排序模式下隐藏删除按钮
            if (this.sortMode) {
                deleteBtn.style.display = 'none';
            }
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // 排序模式下禁止删除
                if (this.sortMode) {
                    return;
                }
                
                // 防止重复弹窗：检查是否正在处理删除
                if (deleteBtn.dataset.deleting === 'true') {
                    return;
                }
                
                if (confirm('确定要删除这个行程项吗？')) {
                    deleteBtn.dataset.deleting = 'true';
                    const itemId = deleteBtn.dataset.itemId;
                    if (itemId) {
                        // 优先使用统一结构的删除方法
                        if (typeof tripDataStructure !== 'undefined') {
                            const unifiedData = tripDataStructure.loadUnifiedData();
                            if (unifiedData) {
                                const success = tripDataStructure.deleteItemData(unifiedData, this.dayId, itemId);
                                if (success) {
                                    tripDataStructure.saveUnifiedData(unifiedData);
                                    // 只上传被删除的卡片（部分更新）
                                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                        dataSyncFirebase.uploadItem(this.dayId, itemId).then(result => {
                                            if (result.success) {
                                                console.log('卡片删除已同步到云端:', result.message);
                                            } else {
                                                console.warn('卡片删除同步失败:', result.message);
                                                // 如果部分更新失败，回退到全量上传
                                                triggerImmediateUpload();
                                            }
                                        }).catch(error => {
                                            console.error('卡片删除同步出错:', error);
                                            // 如果部分更新失败，回退到全量上传
                                            triggerImmediateUpload();
                                        });
                                    } else {
                                        // 如果部分更新方法不可用，使用全量上传
                                        triggerImmediateUpload();
                                    }
                                    // 重新渲染当前视图，而不是重新加载整个day
                                    this.cards = this.cards.filter(c => c.id !== itemId);
                                    this.renderCards();
                                    this.attachCardEventsForAll();
                                    deleteBtn.dataset.deleting = 'false';
                                    return;
                                }
                            }
                        }
                        // 回退到旧方法（仅自定义项）
                        deleteCustomItem(this.dayId, itemId);
                        // 重新渲染当前视图
                        this.cards = this.cards.filter(c => c.id !== itemId);
                        this.renderCards();
                        this.attachCardEventsForAll();
                        deleteBtn.dataset.deleting = 'false';
                    } else {
                        deleteBtn.dataset.deleting = 'false';
                    }
                } else {
                    deleteBtn.dataset.deleting = 'false';
                }
            });
        }
        
        // 计划项删除事件
        card.querySelectorAll('.plan-item-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const planHash = btn.dataset.planHash || null;
                const cardIndex = parseInt(btn.dataset.cardIndex);
                const itemId = btn.dataset.itemId || null;
                // 直接删除，不需要确认
                this.deletePlanItem(cardIndex, planIndex, planHash, itemId);
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const planHash = btn.dataset.planHash || null;
                const cardIndex = parseInt(btn.dataset.cardIndex);
                const itemId = btn.dataset.itemId || null;
                // 直接删除，不需要确认
                this.deletePlanItem(cardIndex, planIndex, planHash, itemId);
            });
        });
        
        // 保存按钮事件
        // 计划项like事件
        card.querySelectorAll('.plan-item-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const itemId = card.dataset.itemId || null;
                // 保存当前滚动位置和卡片滚动位置
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.togglePlanItemLike(this.dayId, index, planIndex, itemId);
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    // 重新绑定事件
                }
                this.attachCardEventsForAll();
                // 使用requestAnimationFrame确保DOM更新完成后再恢复滚动位置
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    // 恢复卡片内部滚动位置
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const planIndex = parseInt(btn.dataset.planIndex);
                const itemId = card.dataset.itemId || null;
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.togglePlanItemLike(this.dayId, index, planIndex, itemId);
                this.renderCards();
                if (!this.sortMode) {
                    // 重新绑定事件
                }
                this.attachCardEventsForAll();
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
        });
        
        // 留言like事件
        card.querySelectorAll('.comment-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const commentIndex = parseInt(btn.dataset.commentIndex);
                const itemId = card.dataset.itemId || null;
                // 保存当前滚动位置和卡片滚动位置
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.toggleCommentLike(this.dayId, index, commentIndex, itemId);
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    // 重新绑定事件
                }
                this.attachCardEventsForAll();
                // 使用requestAnimationFrame确保DOM更新完成后再恢复滚动位置
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    // 恢复卡片内部滚动位置
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
            
            // 也处理触摸事件
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const commentIndex = parseInt(btn.dataset.commentIndex);
                const itemId = card.dataset.itemId || null;
                const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const cardScrollTop = card.scrollTop;
                this.toggleCommentLike(this.dayId, index, commentIndex, itemId);
                this.renderCards();
                if (!this.sortMode) {
                    // 重新绑定事件
                }
                this.attachCardEventsForAll();
                requestAnimationFrame(() => {
                    window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                    const newCard = this.container.querySelector(`.card[data-index="${index}"]`);
                    if (newCard) {
                        newCard.scrollTop = cardScrollTop;
                    }
                });
            });
        });
        
        // 留言提交事件
        const commentInput = card.querySelector('.comment-input');
        const commentSubmit = card.querySelector('.comment-submit');
        
        commentSubmit.addEventListener('click', async () => {
            const message = commentInput.value.trim();
            if (message) {
                const itemId = card.dataset.itemId || null;
                await this.addComment(this.dayId, index, message, itemId);
                commentInput.value = '';
                // 重新渲染卡片
                this.renderCards();
                // 重新绑定事件
                if (!this.sortMode) {
                    // 重新绑定事件
                }
                this.attachCardEventsForAll();
            }
        });
        
        // 回车发送留言
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commentSubmit.click();
            }
        });
        
        // 删除留言按钮
        const commentDeleteBtns = card.querySelectorAll('.comment-delete-btn');
        commentDeleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                // 直接删除，不需要确认
                const commentHash = btn.dataset.commentHash;
                if (commentHash) {
                    const itemId = card.dataset.itemId || null;
                    await this.deleteComment(this.dayId, index, commentHash, itemId);
                    // 重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                }
            });
        });
        
        // 消费表相关事件
        const spendAddBtn = card.querySelector('.spend-add-btn');
        const spendInputContainer = card.querySelector('.spend-input-container');
        const spendItemInput = card.querySelector('.spend-item-input');
        const spendAmountInput = card.querySelector('.spend-amount-input');
        const spendInputConfirm = card.querySelector('.spend-input-confirm');
        const spendInputCancel = card.querySelector('.spend-input-cancel');
        
        if (spendAddBtn && spendInputContainer) {
            // 点击添加按钮，显示输入框
            spendAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                spendAddBtn.style.display = 'none';
                spendInputContainer.style.display = 'flex';
                spendItemInput.focus();
            });
            
            // 确认添加消费项
            const spendPayerInput = card.querySelector('.spend-payer-input');
            if (spendInputConfirm && spendItemInput && spendAmountInput && spendPayerInput) {
                // 设置默认支出人为当前用户
                if (typeof currentUser !== 'undefined' && currentUser) {
                    spendPayerInput.value = currentUser;
                }
                
                const confirmAdd = async () => {
                    const itemName = spendItemInput.value.trim();
                    const amount = parseFloat(spendAmountInput.value);
                    const payer = spendPayerInput.value || '';
                    
                    if (itemName && !isNaN(amount) && amount > 0) {
                        await this.addSpendItem(index, itemName, amount, payer);
                        // 重置输入框和UI状态
                        spendItemInput.value = '';
                        spendAmountInput.value = '';
                        // 重置为当前用户（如果有）
                        if (typeof currentUser !== 'undefined' && currentUser) {
                            spendPayerInput.value = currentUser;
                        } else {
                            spendPayerInput.value = '';
                        }
                        spendInputContainer.style.display = 'none';
                        spendAddBtn.style.display = 'block';
                    } else {
                        alert('请输入有效的项目名称和金额');
                    }
                };
                
                spendInputConfirm.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    confirmAdd();
                });
                
                spendAmountInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        spendPayerInput.focus();
                    }
                });
            }
            
            // 取消按钮
            if (spendInputCancel) {
                spendInputCancel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    spendItemInput.value = '';
                    spendAmountInput.value = '';
                    const spendPayerInput = card.querySelector('.spend-payer-input');
                    if (spendPayerInput) {
                        // 重置为当前用户（如果有）
                        if (typeof currentUser !== 'undefined' && currentUser) {
                            spendPayerInput.value = currentUser;
                        } else {
                            spendPayerInput.value = '';
                        }
                    }
                    spendInputContainer.style.display = 'none';
                    spendAddBtn.style.display = 'block';
                });
            }
        }
        
        // 删除消费项按钮
        const spendDeleteBtns = card.querySelectorAll('.spend-delete-btn');
        spendDeleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const spendIndex = parseInt(btn.dataset.spendIndex);
                await this.deleteSpendItem(index, spendIndex);
                // 重新渲染
                this.renderCards();
                // 重新绑定事件
                this.attachCardEventsForAll();
            });
        });
    }
    
    // 添加消费项
    async addSpendItem(cardIndex, itemName, amount, payer = '') {
        console.log('addSpendItem 被调用:', { cardIndex, itemName, amount, payer, dayId: this.dayId });
        // 检查写权限
        if (!checkWritePermission()) {
            console.warn('没有写权限');
            return;
        }
        
        const card = this.cards[cardIndex];
        console.log('card对象:', card, 'card.id:', card?.id);
        if (!card) {
            console.warn('card不存在');
            return;
        }
        
        const newSpendItem = {
            item: itemName,
            amount: parseFloat(amount),
            payer: payer || ''
        };
        
        // 获取当前消费表
        let spendItems = card.spend || [];
        if (!Array.isArray(spendItems)) {
            spendItems = [];
        }
        spendItems.push(newSpendItem);
        card.spend = spendItems;
        
        // 保存到统一结构
        const itemId = card.id;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                console.log('找到的item:', item ? '存在' : '不存在', itemId);
                if (item) {
                    console.log('更新item.spend，旧spend长度:', item.spend?.length || 0, '新spend长度:', spendItems.length);
                    item.spend = spendItems;
                    item._updatedAt = new Date().toISOString();
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    console.log('保存结果:', saveSuccess);
                    
                    if (saveSuccess !== false) {
                        triggerImmediateUpload();
                        
                        // 重新渲染卡片以显示新添加的消费项
                        this.renderCards();
                        console.log('重新渲染完成');
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        return;
                    } else {
                        console.warn('保存失败');
                    }
                } else {
                    console.warn('未找到item:', itemId);
                }
            } else {
                console.warn('统一数据不存在');
            }
        } else {
            console.warn('itemId不存在或tripDataStructure未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
        }
        
        // 如果保存失败，也重新渲染（至少显示在内存中）
        console.log('回退：重新渲染卡片');
        this.renderCards();
                // 重新绑定事件
        this.attachCardEventsForAll();
    }
    
    // 删除消费项
    async deleteSpendItem(cardIndex, spendIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const card = this.cards[cardIndex];
        if (!card) return;
        
        let spendItems = card.spend || [];
        if (!Array.isArray(spendItems) || spendIndex < 0 || spendIndex >= spendItems.length) {
            return;
        }
        
        // 从数组中删除
        spendItems.splice(spendIndex, 1);
        card.spend = spendItems;
        
        // 保存到统一结构
        const itemId = card.id;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    item.spend = spendItems;
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    } else {
                        // 如果没有部分上传方法，使用全量上传
                        if (typeof triggerImmediateUpload === 'function') {
                            triggerImmediateUpload();
                        }
                    }
                    return;
                } else {
                    console.warn('未找到item:', itemId);
                }
            } else {
                console.warn('统一数据不存在');
            }
        } else {
            console.warn('itemId不存在或tripDataStructure未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
        }
        
        // 如果保存失败，也重新渲染（至少显示在内存中）
        this.renderCards();
                // 重新绑定事件
        this.attachCardEventsForAll();
    }
    
    // 删除留言
    async deleteComment(dayId, itemIndex, commentHash, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const comments = this.getComments(dayId, itemIndex, itemId);
        const commentIndex = comments.findIndex(c => c._hash === commentHash);
        
        if (commentIndex === -1) return;
        
        // 从数组中删除
        comments.splice(commentIndex, 1);
        
        // 优先保存到统一结构
        // 如果itemId参数为null，尝试从card获取
        if (!itemId) {
            const card = this.cards[itemIndex];
            itemId = card?.id || null;
        }
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    item.comments = comments;
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                        dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    }
                    return;
                }
            }
        }
        
        // 回退到旧的存储方式
        const key = `trip_comments_${dayId}_${itemIndex}`;
        localStorage.setItem(key, JSON.stringify(comments));
        // 如果无法使用统一结构，回退到全量上传
        if (typeof triggerImmediateUpload === 'function') {
            triggerImmediateUpload();
        }
    }
    
    // 获取留言
    getComments(dayId, itemIndex, itemId = null) {
        // 优先从统一结构读取（使用itemId）
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    return item.comments || [];
                }
            }
        }
        
        // 回退到旧的存储方式（使用itemIndex）
        const key = `trip_comments_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }
    
    // 添加留言
    async addComment(dayId, itemIndex, message, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const comments = this.getComments(dayId, itemIndex, itemId);
        
        // 生成时间戳
        const timestamp = Date.now();
        
        // 生成哈希值
        const hash = await generateContentHash(message, currentUser, timestamp);
        
        // 检查是否已存在相同哈希的留言（防止重复）
        const existingComment = comments.find(c => c._hash === hash);
        if (existingComment) {
            // 如果已存在，不重复添加
            return;
        }
        
        // 添加新留言，包含哈希值
        const newComment = {
            user: currentUser,
            message: message,
            timestamp: timestamp,
            _hash: hash // 添加哈希值用于去重
        };
        comments.push(newComment);
        
        // 优先保存到统一结构
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    item.comments = comments;
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    triggerImmediateUpload();
                    return;
                }
            }
        }
        
        // 回退到旧的存储方式
        const key = `trip_comments_${dayId}_${itemIndex}`;
        localStorage.setItem(key, JSON.stringify(comments));
        // 自动同步
        autoSyncToGist();
    }
    
    // 格式化时间
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    
    // 获取图片（多张）
    getImages(dayId, itemIndex, itemId = null) {
        // 优先从统一结构读取（使用itemId）
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    return item.images || [];
                }
            }
        }
        
        // 回退到旧的存储方式（使用itemIndex）
        const key = `trip_images_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }
    
    // 设置图片（多张）
    setImages(dayId, itemIndex, imageUrls, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 优先保存到统一结构
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    item.images = imageUrls || [];
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                        dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    } else {
                        // 如果没有部分上传方法，使用全量上传
                        triggerImmediateUpload();
                    }
                    return;
                }
            }
        }
        
        // 回退到旧的存储方式
        const key = `trip_images_${dayId}_${itemIndex}`;
        if (imageUrls && imageUrls.length > 0) {
            localStorage.setItem(key, JSON.stringify(imageUrls));
        } else {
            localStorage.removeItem(key);
        }
        // 自动同步
        autoSyncToGist();
    }
    
    // 获取行程项点赞（返回格式：{ section: ['user1', 'user2'] }）
    getItemLikes(dayId, itemIndex, itemId = null) {
        // 优先从统一结构读取（使用itemId）
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item && item._likes) {
                    // 转换旧格式到新格式（兼容性处理）
                    const convertedLikes = {};
                    for (const section in item._likes) {
                        if (typeof item._likes[section] === 'object' && !Array.isArray(item._likes[section])) {
                            // 旧格式：{ mrb: boolean, djy: boolean }
                            const users = [];
                            if (item._likes[section].mrb) users.push('mrb');
                            if (item._likes[section].djy) users.push('djy');
                            convertedLikes[section] = users;
                        } else if (Array.isArray(item._likes[section])) {
                            // 新格式：['mrb', 'djy']
                            convertedLikes[section] = item._likes[section];
                        }
                    }
                    return convertedLikes;
                }
            }
        }
        
        // 回退到旧的存储方式（使用itemIndex）
        const key = itemId 
            ? `trip_item_likes_${dayId}_${itemId}`
            : `trip_item_likes_${dayId}_${itemIndex}`;
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);
            // 转换旧格式到新格式
            const convertedLikes = {};
            for (const section in parsed) {
                if (typeof parsed[section] === 'object' && !Array.isArray(parsed[section])) {
                    const users = [];
                    if (parsed[section].mrb) users.push('mrb');
                    if (parsed[section].djy) users.push('djy');
                    convertedLikes[section] = users;
                } else if (Array.isArray(parsed[section])) {
                    convertedLikes[section] = parsed[section];
                }
            }
            return convertedLikes;
        }
        return {};
    }
    
    // 切换行程项点赞（新格式：{ section: ['user1', 'user2'] }）
    toggleItemLike(dayId, itemIndex, section, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 如果itemId为null，尝试从card获取
        if (!itemId) {
            const card = this.cards[itemIndex];
            itemId = card?.id || null;
        }
        
        // 优先保存到统一结构
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item) {
                    // 初始化 _likes 字段
                    if (!item._likes) {
                        item._likes = {};
                    }
                    if (!item._likes[section]) {
                        item._likes[section] = [];
                    }
                    // 确保是数组格式
                    if (!Array.isArray(item._likes[section])) {
                        // 转换旧格式
                        const users = [];
                        if (item._likes[section].mrb) users.push('mrb');
                        if (item._likes[section].djy) users.push('djy');
                        item._likes[section] = users;
                    }
                    // 切换点赞状态：如果已点赞则移除，否则添加
                    const userIndex = item._likes[section].indexOf(currentUser);
                    if (userIndex > -1) {
                        item._likes[section].splice(userIndex, 1); // 取消点赞
                    } else {
                        item._likes[section].push(currentUser); // 点赞
                    }
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                        dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    } else {
                        // 如果没有部分上传方法，使用全量上传
                        if (typeof triggerImmediateUpload === 'function') {
                            triggerImmediateUpload();
                        }
                    }
                    return;
                }
            }
        }
        
        // 回退到旧的存储方式
        const key = itemId 
            ? `trip_item_likes_${dayId}_${itemId}`
            : `trip_item_likes_${dayId}_${itemIndex}`;
        const likes = this.getItemLikes(dayId, itemIndex, itemId);
        if (!likes[section]) {
            likes[section] = [];
        }
        const userIndex = likes[section].indexOf(currentUser);
        if (userIndex > -1) {
            likes[section].splice(userIndex, 1);
        } else {
            likes[section].push(currentUser);
        }
        localStorage.setItem(key, JSON.stringify(likes));
        // 如果无法使用统一结构，回退到全量上传
        if (typeof triggerImmediateUpload === 'function') {
            triggerImmediateUpload();
        }
    }
    
    // 获取计划项点赞（返回格式：['user1', 'user2']）
    getPlanItemLikes(dayId, itemIndex, planIndex, itemId = null) {
        // 优先从统一结构读取（使用itemId和planHash）
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item && item.plan && Array.isArray(item.plan) && planIndex >= 0 && planIndex < item.plan.length) {
                    const planItem = item.plan[planIndex];
                    // 安全检查：如果 planItem 为 null，跳过
                    if (!planItem) {
                        // 继续使用回退方式
                    } else {
                        // 如果 plan item 有 _likes 字段，使用它
                        if (planItem._likes) {
                            // 转换旧格式到新格式（兼容性处理）
                            if (Array.isArray(planItem._likes)) {
                                return planItem._likes;
                            } else if (typeof planItem._likes === 'object') {
                                // 旧格式：{ mrb: boolean, djy: boolean }
                                const users = [];
                                if (planItem._likes.mrb) users.push('mrb');
                                if (planItem._likes.djy) users.push('djy');
                                return users;
                            }
                        }
                        // 否则，如果有 _hash，尝试通过 hash 查找
                        if (planItem._hash) {
                            const planItemByHash = item.plan.find(p => p && p !== null && typeof p === 'object' && p._hash === planItem._hash);
                            if (planItemByHash && planItemByHash._likes) {
                                if (Array.isArray(planItemByHash._likes)) {
                                    return planItemByHash._likes;
                                } else if (typeof planItemByHash._likes === 'object') {
                                    const users = [];
                                    if (planItemByHash._likes.mrb) users.push('mrb');
                                    if (planItemByHash._likes.djy) users.push('djy');
                                    return users;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 回退到旧的存储方式（使用itemIndex）
        const key = itemId 
            ? `trip_plan_item_likes_${dayId}_${itemId}_${planIndex}`
            : `trip_plan_item_likes_${dayId}_${itemIndex}_${planIndex}`;
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);
            // 转换旧格式到新格式
            if (Array.isArray(parsed)) {
                return parsed;
            } else if (typeof parsed === 'object') {
                const users = [];
                if (parsed.mrb) users.push('mrb');
                if (parsed.djy) users.push('djy');
                return users;
            }
        }
        return [];
    }
    
    // 切换计划项点赞（新格式：['user1', 'user2']）
    togglePlanItemLike(dayId, itemIndex, planIndex, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 如果itemId为null，尝试从card获取
        if (!itemId) {
            const card = this.cards[itemIndex];
            itemId = card?.id || null;
        }
        
        // 优先保存到统一结构
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item && item.plan && Array.isArray(item.plan) && planIndex >= 0 && planIndex < item.plan.length) {
                    const planItem = item.plan[planIndex];
                    // 安全检查：如果 planItem 为 null，跳过
                    if (!planItem) {
                        // 继续使用回退方式
                    } else {
                        // 初始化 _likes 字段
                        if (!planItem._likes) {
                            planItem._likes = [];
                        }
                        // 确保是数组格式
                        if (!Array.isArray(planItem._likes)) {
                            // 转换旧格式
                            const users = [];
                            if (planItem._likes.mrb) users.push('mrb');
                            if (planItem._likes.djy) users.push('djy');
                            planItem._likes = users;
                        }
                        // 切换点赞状态：如果已点赞则移除，否则添加
                        const userIndex = planItem._likes.indexOf(currentUser);
                        if (userIndex > -1) {
                            planItem._likes.splice(userIndex, 1); // 取消点赞
                        } else {
                            planItem._likes.push(currentUser); // 点赞
                        }
                        planItem._updatedAt = planItem._updatedAt || new Date().toISOString();
                        item._updatedAt = new Date().toISOString();
                        tripDataStructure.saveUnifiedData(unifiedData);
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                                console.error('上传 item 失败:', error);
                            });
                        } else {
                            // 如果没有部分上传方法，使用全量上传
                            if (typeof triggerImmediateUpload === 'function') {
                                triggerImmediateUpload();
                            }
                        }
                        return;
                    }
                }
            }
        }
        
        // 回退到旧的存储方式
        const key = itemId 
            ? `trip_plan_item_likes_${dayId}_${itemId}_${planIndex}`
            : `trip_plan_item_likes_${dayId}_${itemIndex}_${planIndex}`;
        const likes = this.getPlanItemLikes(dayId, itemIndex, planIndex, itemId);
        const userIndex = likes.indexOf(currentUser);
        if (userIndex > -1) {
            likes.splice(userIndex, 1);
        } else {
            likes.push(currentUser);
        }
        localStorage.setItem(key, JSON.stringify(likes));
        // 如果无法使用统一结构，回退到全量上传
        if (typeof triggerImmediateUpload === 'function') {
            triggerImmediateUpload();
        }
    }
    
    // 获取留言点赞（返回格式：['user1', 'user2']）
    getCommentLikes(dayId, itemIndex, commentIndex, itemId = null) {
        // 优先从统一结构读取（使用itemId和commentHash）
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item && item.comments && Array.isArray(item.comments) && commentIndex >= 0 && commentIndex < item.comments.length) {
                    const comment = item.comments[commentIndex];
                    // 安全检查：如果 comment 为 null，跳过
                    if (!comment) {
                        // 继续使用回退方式
                    } else {
                        // 如果 comment 有 _likes 字段，使用它
                        if (comment._likes) {
                            // 转换旧格式到新格式（兼容性处理）
                            if (Array.isArray(comment._likes)) {
                                return comment._likes;
                            } else if (typeof comment._likes === 'object') {
                                // 旧格式：{ mrb: boolean, djy: boolean }
                                const users = [];
                                if (comment._likes.mrb) users.push('mrb');
                                if (comment._likes.djy) users.push('djy');
                                return users;
                            }
                        }
                        // 否则，如果有 _hash，尝试通过 hash 查找
                        if (comment._hash) {
                            const commentByHash = item.comments.find(c => c && c !== null && typeof c === 'object' && c._hash === comment._hash);
                            if (commentByHash && commentByHash._likes) {
                                if (Array.isArray(commentByHash._likes)) {
                                    return commentByHash._likes;
                                } else if (typeof commentByHash._likes === 'object') {
                                    const users = [];
                                    if (commentByHash._likes.mrb) users.push('mrb');
                                    if (commentByHash._likes.djy) users.push('djy');
                                    return users;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 回退到旧的存储方式（使用itemIndex）
        const key = itemId 
            ? `trip_comment_likes_${dayId}_${itemId}_${commentIndex}`
            : `trip_comment_likes_${dayId}_${itemIndex}_${commentIndex}`;
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);
            // 转换旧格式到新格式
            if (Array.isArray(parsed)) {
                return parsed;
            } else if (typeof parsed === 'object') {
                const users = [];
                if (parsed.mrb) users.push('mrb');
                if (parsed.djy) users.push('djy');
                return users;
            }
        }
        return [];
    }
    
    // 切换留言点赞（新格式：['user1', 'user2']）
    toggleCommentLike(dayId, itemIndex, commentIndex, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 如果itemId为null，尝试从card获取
        if (!itemId) {
            const card = this.cards[itemIndex];
            itemId = card?.id || null;
        }
        
        // 优先保存到统一结构
        if (typeof tripDataStructure !== 'undefined' && itemId) {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, dayId, itemId);
                if (item && item.comments && Array.isArray(item.comments) && commentIndex >= 0 && commentIndex < item.comments.length) {
                    const comment = item.comments[commentIndex];
                    // 安全检查：如果 comment 为 null，跳过
                    if (!comment) {
                        // 继续使用回退方式
                    } else {
                        // 初始化 _likes 字段
                        if (!comment._likes) {
                            comment._likes = [];
                        }
                        // 确保是数组格式
                        if (!Array.isArray(comment._likes)) {
                            // 转换旧格式
                            const users = [];
                            if (comment._likes.mrb) users.push('mrb');
                            if (comment._likes.djy) users.push('djy');
                            comment._likes = users;
                        }
                        // 切换点赞状态：如果已点赞则移除，否则添加
                        const userIndex = comment._likes.indexOf(currentUser);
                        if (userIndex > -1) {
                            comment._likes.splice(userIndex, 1); // 取消点赞
                        } else {
                            comment._likes.push(currentUser); // 点赞
                        }
                        comment._updatedAt = comment._updatedAt || new Date().toISOString();
                        item._updatedAt = new Date().toISOString();
                        tripDataStructure.saveUnifiedData(unifiedData);
                        // 只上传这个 item，不进行全量上传
                        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem && itemId) {
                            dataSyncFirebase.uploadItem(dayId, itemId).catch(error => {
                                console.error('上传 item 失败:', error);
                            });
                        } else {
                            // 如果没有部分上传方法，使用全量上传
                            if (typeof triggerImmediateUpload === 'function') {
                                triggerImmediateUpload();
                            }
                        }
                        return;
                    }
                }
            }
        }
        
        // 回退到旧的存储方式
        const key = itemId 
            ? `trip_comment_likes_${dayId}_${itemId}_${commentIndex}`
            : `trip_comment_likes_${dayId}_${itemIndex}_${commentIndex}`;
        const likes = this.getCommentLikes(dayId, itemIndex, commentIndex, itemId);
        const userIndex = likes.indexOf(currentUser);
        if (userIndex > -1) {
            likes.splice(userIndex, 1);
        } else {
            likes.push(currentUser);
        }
        localStorage.setItem(key, JSON.stringify(likes));
        // 如果无法使用统一结构，回退到全量上传
        if (typeof triggerImmediateUpload === 'function') {
            triggerImmediateUpload();
        }
    }
    
    // 获取卡片展开状态
    // 获取卡片展开状态（基于 itemId，不保存到 localStorage）
    getCardExpanded(itemId) {
        if (!itemId) return false;
        return this.cardExpandedStates.get(itemId) || false;
    }
    
    // 设置卡片展开状态（基于 itemId，不保存到 localStorage）
    setCardExpanded(itemId, expanded) {
        if (!itemId) return;
        this.cardExpandedStates.set(itemId, expanded);
    }
    
    // 获取标签标签
    getTagLabel(tag) {
        const labels = {
            '景点': '🏛️ 景点',
            '美食': '🍜 美食',
            '住宿': '🏨 住宿',
            '赶路': '🚗 赶路',
            '其他': '📋 其他'
        };
        return labels[tag] || tag;
    }
    
    // 更新卡片数据（统一方法）
    updateCardData(itemId, updates) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 更新 this.cards 数组中的数据
        const card = this.cards.find(c => c.id === itemId);
        if (card) {
            Object.assign(card, updates);
        }
        
        // 更新统一数据结构
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    Object.assign(item, updates);
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                }
            }
        }
    }
    
    // 编辑标签
    editTag(cardIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        const card = this.cards[cardIndex];
        if (!card) return;
        
        // 获取当前标签（优先使用tag字段，如果没有则使用category作为标签）
        const currentTag = card.tag || card.category || '其他';
        const tags = ['景点', '美食', '住宿', '赶路', '其他'];
        const currentIndex = tags.indexOf(currentTag);
        const nextIndex = (currentIndex + 1) % tags.length;
        const newTag = tags[nextIndex];
        
        // 只更新tag字段，不修改category（标题）
        card.tag = newTag;
        
        // 优先保存到统一结构
        const itemId = card.id;
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    item.tag = newTag;
                    item._updatedAt = new Date().toISOString();
                    tripDataStructure.saveUnifiedData(unifiedData);
                    
                    // 重新渲染
                    this.renderCards();
                    // 重新绑定事件
                    this.attachCardEventsForAll();
                    
                    // 只上传这个 item，不进行全量上传
                    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                        dataSyncFirebase.uploadItem(this.dayId, itemId).catch(error => {
                            console.error('上传 item 失败:', error);
                        });
                    }
                    return;
                }
            }
        }
        
        // 回退到旧的存储方式
        if (card.isCustom) {
            const customItems = JSON.parse(localStorage.getItem(`trip_custom_items_${this.dayId}`) || '[]');
            const itemIndex = customItems.findIndex(item => item.id === card.id);
            if (itemIndex !== -1) {
                customItems[itemIndex].tag = newTag;
                localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(customItems));
            }
        } else {
            // 对于原始项，保存tag到单独的存储
            const tagKey = `trip_tag_${this.dayId}_${cardIndex}`;
            localStorage.setItem(tagKey, newTag);
        }
        
        // 重新渲染
        this.renderCards();
                // 重新绑定事件
        this.attachCardEventsForAll();
        
        // 自动同步
        autoSyncToGist();
    }
    
    // 添加计划项
    async addPlanItem(cardIndex, newItem) {
        console.log('addPlanItem 被调用:', { cardIndex, newItem, dayId: this.dayId });
        // 检查写权限
        if (!checkWritePermission()) {
            console.warn('没有写权限');
            return;
        }
        
        const card = this.cards[cardIndex];
        console.log('card对象:', card, 'card.id:', card?.id);
        if (!card || !newItem || !newItem.trim()) {
            console.warn('card或newItem无效');
            return;
        }
        
        const trimmedItem = newItem.trim();
        
        // 更新plan数组
        if (!card.plan) {
            card.plan = [];
        }
        const planItems = Array.isArray(card.plan) ? card.plan : [card.plan];
        
        // 生成时间戳和哈希值
        const timestamp = Date.now();
        const hash = await generateContentHash(trimmedItem, currentUser, timestamp);
        
        // 检查是否已存在相同哈希的计划项（防止重复）
        const existingItem = planItems.find(item => {
            if (typeof item === 'string') {
                // 如果是字符串，需要检查是否有对应的哈希值存储
                return false; // 旧数据没有哈希，允许添加
            } else if (typeof item === 'object') {
                // 如果是对象，检查哈希值
                // 已删除的项已被过滤，这里不再需要检查
                return item._hash === hash;
            }
            return false;
        });
        
        if (existingItem) {
            // 如果已存在，不重复添加
            return;
        }
        
        // 添加新计划项，包含哈希值
        const newPlanItem = {
            _text: trimmedItem,
            _hash: hash,
            _timestamp: timestamp,
            _user: currentUser
        };
        planItems.push(newPlanItem);
        card.plan = planItems;
        
        // 优先保存到统一结构
        const itemId = card.id;
        console.log('准备保存到统一结构:', { itemId, dayId: this.dayId, planItemsCount: planItems.length });
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            console.log('统一数据:', unifiedData ? '存在' : '不存在');
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                console.log('找到的item:', item ? '存在' : '不存在', itemId);
                if (item) {
                    console.log('更新item.plan，旧plan长度:', item.plan?.length || 0, '新plan长度:', planItems.length);
                    item.plan = planItems;
                    item._updatedAt = new Date().toISOString();
                    const saveSuccess = tripDataStructure.saveUnifiedData(unifiedData);
                    console.log('保存结果:', saveSuccess);
                    
                    if (saveSuccess !== false) {
                        // 更新this.cards数组中的card对象，保持同步
                        card.plan = planItems;
                        console.log('card.plan已更新，准备重新渲染');
                        
                        // 重新渲染
                        this.renderCards();
                        console.log('重新渲染完成');
                        // 重新绑定事件
                        this.attachCardEventsForAll();
                        
                        // 立即触发上传
                        triggerImmediateUpload();
                        return;
                    } else {
                        console.warn('保存到统一结构失败，使用旧存储方式');
                    }
                } else {
                    console.warn(`未找到item: ${itemId}，使用旧存储方式`);
                }
            } else {
                console.warn('统一数据不存在，使用旧存储方式');
            }
        } else {
            console.warn('itemId不存在或tripDataStructure未定义，使用旧存储方式', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
        }
        
        // 回退到旧的存储方式
        if (card.isCustom) {
            const customItems = JSON.parse(localStorage.getItem(`trip_custom_items_${this.dayId}`) || '[]');
            const itemIndex = customItems.findIndex(item => item.id === card.id);
            if (itemIndex !== -1) {
                customItems[itemIndex].plan = planItems;
                localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(customItems));
            }
        } else {
            // 对于原始项，保存到单独的存储
            const key = `trip_plan_${this.dayId}_${cardIndex}`;
            localStorage.setItem(key, JSON.stringify(planItems));
        }
        
        // 重新渲染
        this.renderCards();
                // 重新绑定事件
        this.attachCardEventsForAll();
        
        // 自动同步
        autoSyncToGist();
    }
    
    // 删除计划项（硬删除，使用哈希或索引）
    deletePlanItem(cardIndex, planIndex, planHash = null, itemId = null) {
        // 检查写权限
        if (!checkWritePermission()) {
            console.warn('删除 plan 项失败：没有写权限');
            return;
        }
        
        const card = this.cards[cardIndex];
        if (!card) {
            console.warn('删除 plan 项失败：找不到卡片，cardIndex:', cardIndex);
            return;
        }
        
        console.log('删除 plan 项:', { cardIndex, planIndex, planHash, itemId, dayId: this.dayId });
        
        // 优先使用统一数据结构
        if (itemId && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const item = tripDataStructure.getItemData(unifiedData, this.dayId, itemId);
                if (item) {
                    let planItems = Array.isArray(item.plan) ? [...item.plan] : (item.plan ? [item.plan] : []);
                    console.log('当前 plan 项数量:', planItems.length, 'plan 项:', planItems);
                    
                    // 优先使用哈希值查找（最可靠）
                    let targetIndex = -1;
                    if (planHash && planHash.trim() !== '') {
                        console.log('使用哈希查找:', planHash);
                        targetIndex = planItems.findIndex(p => {
                            if (typeof p === 'object' && p._hash === planHash) {
                                return true;
                            }
                            return false;
                        });
                        console.log('哈希查找结果:', targetIndex);
                    }
                    
                    // 如果哈希找不到，使用索引
                    if (targetIndex === -1) {
                        console.log('哈希找不到，使用索引:', planIndex);
                        targetIndex = planIndex;
                    }
                    
                    // 检查索引是否有效
                    console.log('目标索引:', targetIndex, 'plan 项长度:', planItems.length);
                    if (targetIndex >= 0 && targetIndex < planItems.length) {
                        console.log('准备删除索引', targetIndex, '的 plan 项:', planItems[targetIndex]);
                        // 真正从数组中删除
                        planItems.splice(targetIndex, 1);
                        console.log('删除后 plan 项数量:', planItems.length);
                        
                        // 确保 plan 是数组格式
                        if (!Array.isArray(planItems)) {
                            planItems = planItems.length > 0 ? [planItems] : [];
                        }
                        
                        // 使用 updateItemData 更新统一数据结构
                        const updateSuccess = tripDataStructure.updateItemData(unifiedData, this.dayId, itemId, { plan: planItems });
                        console.log('更新统一数据结构结果:', updateSuccess);
                        
                        if (updateSuccess) {
                            // 更新本地 card 数据
                            card.plan = planItems;
                            
                            // 保存当前滚动位置
                            const pageScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                            const cardElement = this.container.querySelector(`.card[data-index="${cardIndex}"]`);
                            const cardScrollTop = cardElement ? cardElement.scrollTop : 0;
                            
                            // 重新渲染
                            this.renderCards();
                            this.attachCardEventsForAll();
                            
                            // 恢复滚动位置
                            requestAnimationFrame(() => {
                                window.scrollTo({ top: pageScrollTop, behavior: 'instant' });
                                const newCard = this.container.querySelector(`.card[data-index="${cardIndex}"]`);
                                if (newCard) {
                                    newCard.scrollTop = cardScrollTop;
                                }
                            });
                            
                            // 只上传这个 item，不进行全量上传
                            if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.uploadItem) {
                                dataSyncFirebase.uploadItem(this.dayId, itemId).then(result => {
                                    if (result.success) {
                                        console.log('plan 项删除已同步到云端:', result.message);
                                    } else {
                                        console.warn('plan 项删除同步失败:', result.message);
                                    }
                                }).catch(error => {
                                    console.error('plan 项删除同步出错:', error);
                                });
                            }
                            console.log('plan 项删除成功');
                            return;
                        } else {
                            console.error('更新统一数据结构失败');
                        }
                    } else {
                        console.error('索引无效:', targetIndex, 'plan 项长度:', planItems.length);
                    }
                } else {
                    console.warn('删除 plan 项失败：找不到 item，itemId:', itemId);
                }
            } else {
                console.warn('删除 plan 项失败：统一数据不存在');
            }
        } else {
            console.warn('删除 plan 项失败：itemId 为空或 tripDataStructure 未定义', { itemId, hasTripDataStructure: typeof tripDataStructure !== 'undefined' });
        }
        
        // 回退到旧方法（兼容旧数据）
        // 获取plan数组
        if (!card.plan) {
            card.plan = [];
        }
        const planItems = Array.isArray(card.plan) ? card.plan : [card.plan];
        
        // 如果提供了哈希，使用哈希查找；否则使用索引
        let targetIndex = planIndex;
        if (planHash) {
            targetIndex = planItems.findIndex(p => {
                if (typeof p === 'object' && p._hash === planHash) {
                    return true;
                }
                return false;
            });
            if (targetIndex === -1) {
                // 如果哈希找不到，回退到索引
                targetIndex = planIndex;
            }
        }
        
        // 检查索引是否有效
        if (targetIndex < 0 || targetIndex >= planItems.length) return;
        
        // 真正从数组中删除
        planItems.splice(targetIndex, 1);
        card.plan = planItems;
        
        // 保存到localStorage
        if (card.isCustom) {
            const customItems = JSON.parse(localStorage.getItem(`trip_custom_items_${this.dayId}`) || '[]');
            const itemIndex = customItems.findIndex(item => item.id === card.id);
            if (itemIndex !== -1) {
                customItems[itemIndex].plan = planItems;
                localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(customItems));
            }
        } else {
            const key = `trip_plan_${this.dayId}_${cardIndex}`;
            localStorage.setItem(key, JSON.stringify(planItems));
        }
        
        // 重新渲染
        this.renderCards();
        // 重新绑定事件
        this.attachCardEventsForAll();
        
        // 自动同步
        if (typeof triggerImmediateUpload === 'function') {
            triggerImmediateUpload();
        } else if (typeof autoSyncToGist === 'function') {
            autoSyncToGist();
        }
    }
    
    // 拖拽开始（排序模式）
    handleDragStart(e, card, index) {
        if (!this.sortMode) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.isDraggingCard = true;
        this.dragCardIndex = parseInt(index);
        this.dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
        
        card.classList.add('dragging');
        card.style.zIndex = '1000';
        card.style.cursor = 'grabbing';
        
        // 使用箭头函数保持this上下文
        this.dragMoveHandler = (evt) => {
            evt.preventDefault();
            this.handleDragMove(evt);
        };
        this.dragEndHandler = (evt) => {
            evt.preventDefault();
            this.handleDragEnd(evt);
        };
        
        document.addEventListener('mousemove', this.dragMoveHandler, { passive: false });
        document.addEventListener('mouseup', this.dragEndHandler);
        document.addEventListener('touchmove', this.dragMoveHandler, { passive: false });
        document.addEventListener('touchend', this.dragEndHandler);
    }
    
    handleDragMove(e) {
        if (!this.isDraggingCard || !this.sortMode) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = currentY - this.dragStartY;
        
        const cards = Array.from(this.container.querySelectorAll('.card'));
        const currentCard = cards.find(c => parseInt(c.dataset.index) === this.dragCardIndex);
        if (!currentCard) {
            return;
        }
        
        // 更新当前卡片位置
        currentCard.style.transform = `translateY(${deltaY}px)`;
        currentCard.style.opacity = '0.8';
        
        const cardHeight = currentCard.offsetHeight + 20; // 加上间距
        const threshold = cardHeight / 2;
        
        // 找到目标位置 - dataset.index就是数组索引
        let targetIndex = this.dragCardIndex;
        const currentRect = currentCard.getBoundingClientRect();
        const currentCenter = currentRect.top + currentRect.height / 2;
        
        // 按dataset.index排序卡片（即按数组索引排序）
        const sortedCards = cards.map(card => ({
            card: card,
            index: parseInt(card.dataset.index)
        })).sort((a, b) => a.index - b.index);
        
        const currentCardArrayIndex = sortedCards.findIndex(item => item.index === this.dragCardIndex);
        
        sortedCards.forEach((item, arrayIndex) => {
            if (arrayIndex === currentCardArrayIndex) return;
            
            const rect = item.card.getBoundingClientRect();
            const cardCenter = rect.top + rect.height / 2;
            const distance = Math.abs(cardCenter - currentCenter);
            
            if (distance < threshold) {
                if (currentCenter < cardCenter && arrayIndex > currentCardArrayIndex) {
                    targetIndex = item.index;
                } else if (currentCenter > cardCenter && arrayIndex < currentCardArrayIndex) {
                    targetIndex = item.index;
                }
            }
        });
        
        // 更新其他卡片的位置提示
        sortedCards.forEach((item, arrayIndex) => {
            if (item.index === this.dragCardIndex) return;
            
            if (targetIndex > this.dragCardIndex && item.index > this.dragCardIndex && item.index <= targetIndex) {
                item.card.style.transform = `translateY(-${cardHeight}px)`;
            } else if (targetIndex < this.dragCardIndex && item.index < this.dragCardIndex && item.index >= targetIndex) {
                item.card.style.transform = `translateY(${cardHeight}px)`;
            } else {
                item.card.style.transform = '';
            }
        });
    }
    
    handleDragEnd(e) {
        if (!this.isDraggingCard || !this.sortMode) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const cards = Array.from(this.container.querySelectorAll('.card'));
        const currentCard = cards.find(c => parseInt(c.dataset.index) === this.dragCardIndex);
        
        let targetIndex = this.dragCardIndex;
        
        // 计算最终位置 - 使用dataset.index
        if (currentCard) {
            const currentRect = currentCard.getBoundingClientRect();
            const currentCenter = currentRect.top + currentRect.height / 2;
            
            // 按dataset.index排序卡片
            const sortedCards = cards.map(card => ({
                card: card,
                index: parseInt(card.dataset.index)
            })).sort((a, b) => a.index - b.index);
            
            const currentCardArrayIndex = sortedCards.findIndex(item => item.index === this.dragCardIndex);
            
            sortedCards.forEach((item, arrayIndex) => {
                if (arrayIndex === currentCardArrayIndex) return;
                
                const rect = item.card.getBoundingClientRect();
                const cardCenter = rect.top + rect.height / 2;
                
                if (Math.abs(cardCenter - currentCenter) < rect.height / 2) {
                    if (currentCenter < cardCenter && arrayIndex > currentCardArrayIndex) {
                        targetIndex = item.index;
                    } else if (currentCenter > cardCenter && arrayIndex < currentCardArrayIndex) {
                        targetIndex = item.index;
                    }
                }
            });
            
            if (targetIndex !== this.dragCardIndex) {
                // 直接使用数组索引操作（dragCardIndex和targetIndex就是数组索引）
                // 先更新 this.cards 数组
                const [movedItem] = this.cards.splice(this.dragCardIndex, 1);
                this.cards.splice(targetIndex, 0, movedItem);
                
                // 保存新顺序到 localStorage
                this.reorderCards(this.dragCardIndex, targetIndex);
                
            }
        }
        
        // 清理状态
        this.isDraggingCard = false;
        cards.forEach(card => {
            card.classList.remove('dragging');
            card.style.transform = '';
            card.style.opacity = '';
            card.style.zIndex = '';
            card.style.cursor = '';
        });
        
        // 移除事件监听器
        if (this.dragMoveHandler) {
            document.removeEventListener('mousemove', this.dragMoveHandler);
            document.removeEventListener('touchmove', this.dragMoveHandler);
        }
        if (this.dragEndHandler) {
            document.removeEventListener('mouseup', this.dragEndHandler);
            document.removeEventListener('touchend', this.dragEndHandler);
        }
        
        // 重新渲染以更新索引和事件
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 上移卡片
    moveCardUp(index) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        if (index <= 0) {
            return; // 已经在最上面
        }
        
        // 交换位置
        const [movedItem] = this.cards.splice(index, 1);
        this.cards.splice(index - 1, 0, movedItem);
        
        // 保存顺序
        this.saveCardOrder();
        
        // 重新渲染（这会重新创建所有卡片，所以事件会重新绑定）
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 下移卡片
    moveCardDown(index) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        if (index >= this.cards.length - 1) {
            return; // 已经在最下面
        }
        
        // 交换位置
        const [movedItem] = this.cards.splice(index, 1);
        this.cards.splice(index + 1, 0, movedItem);
        
        // 保存顺序
        this.saveCardOrder();
        
        // 重新渲染（这会重新创建所有卡片，所以事件会重新绑定）
        this.renderCards();
        this.attachCardEventsForAll();
    }
    
    // 保存卡片顺序
    saveCardOrder() {
        // 优先更新统一结构中的order字段
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const day = tripDataStructure.getDayData(unifiedData, this.dayId);
                if (day) {
                    // 更新每个item的order字段
                    this.cards.forEach((card, idx) => {
                        if (card.id) {
                            const item = tripDataStructure.getItemData(unifiedData, this.dayId, card.id);
                            if (item) {
                                item.order = idx;
                                item._updatedAt = new Date().toISOString();
                            }
                        }
                    });
                    
                    // 保存统一结构
                    tripDataStructure.saveUnifiedData(unifiedData);
                    triggerImmediateUpload();
                    
                    // 同时更新this.cards数组中的order字段
                    this.cards.forEach((card, idx) => {
                        card.order = idx;
                    });
                }
            }
        }
        
        // 构建顺序信息 - 使用更可靠的唯一标识（用于向后兼容）
        const orderInfo = this.cards.map((item, idx) => {
            // 对于自定义项，使用id；对于原始项，使用category+time组合作为唯一标识
            let uniqueId;
            if (item.isCustom && item.id) {
                uniqueId = item.id;
            } else {
                // 原始项：使用category + time + plan的前几个字符作为唯一标识
                const time = item.time || '';
                let planStr = '';
                if (item.plan) {
                    if (Array.isArray(item.plan)) {
                        // plan是数组，取第一个非删除项的文本
                        const firstPlan = item.plan.find(p => {
                            // 过滤掉已删除的项（兼容旧数据）
                            if (typeof p === 'object' && p._deleted) {
                                return false;
                            }
                            return true;
                        });
                        if (firstPlan) {
                            planStr = typeof firstPlan === 'string' ? firstPlan : (firstPlan._text || '');
                        }
                    } else if (typeof item.plan === 'string') {
                        planStr = item.plan;
                    }
                }
                planStr = planStr.substring(0, 20);
                uniqueId = `${item.category || 'item'}_${time}_${planStr}`.replace(/\s+/g, '_');
            }
            
            return {
                index: idx,
                id: uniqueId,
                category: item.category,
                isCustom: item.isCustom || false
            };
        });
        
        // 保存顺序（向后兼容）
        const orderKey = `trip_card_order_${this.dayId}`;
        localStorage.setItem(orderKey, JSON.stringify(orderInfo));
        
        // 保存自定义项的新顺序（保持完整数据）
        const newCustomItems = this.cards.filter(item => item.isCustom);
        if (newCustomItems.length > 0) {
            localStorage.setItem(`trip_custom_items_${this.dayId}`, JSON.stringify(newCustomItems));
        }
    }
    
    // 保存卡片数据并同步
    saveCard(cardIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        // 保存卡片顺序（如果顺序有变化）
        this.saveCardOrder();
        
        // 触发自动同步
        autoSyncToGist();
        
        updateSyncStatus('卡片已保存并同步', 'success');
    }
    
    // 重新排序卡片（保留用于兼容）
    reorderCards(fromIndex, toIndex) {
        // 检查写权限
        if (!checkWritePermission()) return;
        
        this.saveCardOrder();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 转义HTML但保留<br>标签
    escapeHtmlKeepBr(text) {
        if (!text) return '';
        // 先转义所有HTML
        const div = document.createElement('div');
        div.textContent = text;
        let escaped = div.innerHTML;
        // 将转义后的<br>还原为实际的<br>标签
        escaped = escaped.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
        return escaped;
    }
    
    // 将 Markdown 转换为 HTML
    markdownToHtml(markdown) {
        if (!markdown) return '';
        // 检查 marked 是否可用
        if (typeof marked !== 'undefined') {
            try {
                // 配置 marked 选项
                marked.setOptions({
                    breaks: true, // 支持换行
                    gfm: true, // GitHub Flavored Markdown
                    sanitize: false, // 允许 HTML（如果需要）
                    headerIds: false, // 不生成 header IDs
                    mangle: false // 不混淆邮箱地址
                });
                return marked.parse(markdown);
            } catch (error) {
                console.error('Markdown 解析失败:', error);
                // 如果解析失败，回退到普通文本显示
                return this.escapeHtmlKeepBr(markdown);
            }
        } else {
            // 如果 marked 库未加载，回退到普通文本显示
            console.warn('marked.js 未加载，使用普通文本显示');
            return this.escapeHtmlKeepBr(markdown);
        }
    }
    
    // 格式化时间为HTML time input格式 (HH:mm)
    formatTimeForInput(timeStr) {
        if (!timeStr) return '';
        // 尝试解析各种时间格式
        // 支持格式: "14:30", "14:30:00", "2:30 PM", "14:30:00.000" 等
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2];
            const ampm = timeMatch[3];
            
            // 处理12小时制
            if (ampm) {
                if (ampm.toUpperCase() === 'PM' && hours !== 12) {
                    hours += 12;
                } else if (ampm.toUpperCase() === 'AM' && hours === 12) {
                    hours = 0;
                }
            }
            
            return `${hours.toString().padStart(2, '0')}:${minutes}`;
        }
        return '';
    }
    
    // 格式化时间为显示格式 (HH:mm)
    formatTimeForDisplay(timeStr) {
        if (!timeStr) return '';
        // 如果是HTML time input格式 (HH:mm)，直接返回
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2];
            return `${hours.toString().padStart(2, '0')}:${minutes}`;
        }
        return timeStr;
    }

    // 滑动相关代码已移至 card-slider-swipe.js（备用）
}

// 从配置文件或URL参数中读取配置
function loadConfigFromURL() {
    // 不再从config.js导入，只使用本地缓存的token
    // Token和Gist ID已经缓存在localStorage中，DataSync构造函数会自动读取
    
    // 从URL参数读取（URL参数优先级更高，用于首次配置）
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const gistId = urlParams.get('gist_id') || urlParams.get('gistId');
    const autoSync = urlParams.get('auto_sync') === 'true' || urlParams.get('autoSync') === 'true';
    
    // Gist相关功能已移除，只使用Firebase
    
    // 如果从URL导入了配置，清除URL参数（保护隐私）
    if (token || gistId || autoSync) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 首先从URL加载配置
    loadConfigFromURL();
    
    // 执行数据迁移（合并最新的分散数据）
    if (typeof tripDataStructure !== 'undefined' && typeof tripData !== 'undefined') {
        try {
            const existingData = tripDataStructure.loadUnifiedData();
            const needsMigration = !existingData || existingData._version !== tripDataStructure.DATA_STRUCTURE_VERSION;
            
            if (needsMigration) {
                console.log('执行数据迁移（首次迁移）...');
                await tripDataStructure.migrateToUnifiedStructure(tripData, false);
                console.log('数据迁移完成');
            } else {
                // 即使已有统一数据，也合并最新的分散数据（可能有新的留言、图片等）
                console.log('已存在统一结构数据，合并最新的分散数据...');
                await tripDataStructure.migrateToUnifiedStructure(tripData, false);
                console.log('数据合并完成');
            }
        } catch (error) {
            console.error('数据迁移失败:', error);
        }
    }
    
    // 检查登录状态（等待Firebase初始化后）
    // 先显示登录界面，然后检查是否有保存的登录状态
    showLoginUI();
    
    // 添加登录按钮事件监听器（支持移动端）
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        // 点击事件
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLogin();
        });
        
        // 触摸事件（移动端）
        loginBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLogin();
        });
    }
    
    // 添加密码输入框的回车键事件（移动端兼容）
    const passwordInput = document.getElementById('login-password');
    if (passwordInput) {
        // 支持 Enter 键和移动端虚拟键盘的完成按钮
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
        
        // 移动端虚拟键盘的完成按钮
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                handleLogin();
            }
        });
    }
    
    setTimeout(() => {
        checkLoginStatus();
    }, 1000);
    
    // 只有在登录后才渲染内容（在showLoggedInUI中调用）
    // renderOverview();
    // renderNavigation();
    // showDay('day1');
    
    // 返回顶部按钮
    initBackToTop();
    
    // 如果已配置同步，页面加载时自动下载数据（合并策略）
    const syncType = localStorage.getItem('trip_sync_type') || 'firebase';
    
    if (syncType === 'firebase' && typeof dataSyncFirebase !== 'undefined') {
        // 等待Firebase加载完成
        const initFirebase = async () => {
            // 如果Firebase已加载，使用默认配置初始化
            if (window.firebaseConfig && window.firebaseDatabase) {
                const defaultConfig = {
                    ...window.firebaseConfig,
                    databasePath: 'trip_plan_data'
                };
                const result = await dataSyncFirebase.initialize(defaultConfig);
                if (result.success) {
                    // 先尝试从Firebase下载数据（静默，不显示错误）
                    dataSyncFirebase.download().then(result => {
                        if (result.success) {
                            // 下载成功后，重新显示当前日期以刷新数据
                            if (currentDayId) {
                                showDay(currentDayId);
                            }
                        }
                    }).catch(() => {
                        // 静默处理错误，不影响页面正常使用
                    });
                    
                    // 如果启用自动同步，初始化实时同步
                    if (dataSyncFirebase.autoSyncEnabled) {
                        dataSyncFirebase.setAutoSync(true);
                    }
                }
            } else {
                // 尝试从localStorage加载配置
                dataSyncFirebase.loadConfig().then(result => {
                    if (result.success && dataSyncFirebase.isConfigured()) {
                        // 先尝试从Firebase下载数据（静默，不显示错误）
                        dataSyncFirebase.download().then(result => {
                            if (result.success) {
                                // 下载成功后，缓存数据并重新渲染
                                const unifiedData = tripDataStructure.loadUnifiedData();
                                if (unifiedData) {
                                    // 缓存tripData结构（overview从days的title自动生成，不需要单独保存）
                                    localStorage.setItem('trip_data_cache', JSON.stringify({
                                        title: unifiedData.title || '行程计划',
                                        days: unifiedData.days || []
                                    }));
                                }
                                // 重新渲染总览和导航
                                renderOverview();
                                renderNavigation();
                                // 重新显示当前日期以刷新数据
                                if (currentDayId) {
                                    showDay(currentDayId);
                                }
                            }
                        }).catch(() => {
                            // 静默处理错误，不影响页面正常使用
                        });
                        
                        // 如果启用自动同步，初始化实时同步
                        if (dataSyncFirebase.autoSyncEnabled) {
                            dataSyncFirebase.setAutoSync(true);
                        }
                    }
                });
            }
        };
        
        // 如果Firebase已加载，直接初始化；否则等待加载完成
        if (window.firebaseLoaded) {
            initFirebase();
        } else {
            window.addEventListener('firebaseReady', initFirebase, { once: true });
        }
    }
    // 只使用Firebase同步，不再支持Gist
    
    // 点击模态框外部关闭
    const modal = document.getElementById('sync-config-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeSyncConfig();
            }
        });
    }
});

// 初始化用户选择器
function initUserSelector() {
    updateUserSelector();
    
    document.querySelectorAll('.user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setCurrentUser(btn.dataset.user);
        });
    });
}

// 从统一结构或缓存加载tripData
function loadTripData() {
    let tripData = null;
    
    // 优先从统一结构加载
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData) {
            tripData = {
                title: unifiedData.title || '行程计划',
                days: unifiedData.days || []
            };
        }
    }
    
    // 如果没有统一结构，尝试从localStorage缓存加载
    if (!tripData) {
        const cachedData = localStorage.getItem('trip_data_cache');
        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                tripData = {
                    title: parsed.title || '行程计划',
                    days: parsed.days || []
                };
            } catch (e) {
                console.warn('解析缓存数据失败:', e);
            }
        }
    }
    
    // 如果都没有，返回空结构（等待从数据库加载）
    if (!tripData) {
        tripData = {
            title: '行程计划',
            days: []
        };
    }
    
    // 从days的title自动生成overview（用于向后兼容）
    tripData.overview = (tripData.days || []).map(day => day.title || '');
    
    return tripData;
}

// 渲染总览
function renderOverview() {
    const header = document.querySelector('.header');
    const tripData = loadTripData();
    if (header && tripData) {
        header.innerHTML = `
            <div class="header-title-container">
                <h1 class="header-title-display">${tripData.title || '行程计划'}</h1>
                <input type="text" class="header-title-input" value="${tripData.title || '行程计划'}" style="display: none;" />
            </div>
        `;
        
        // 添加标题编辑事件
        const titleDisplay = header.querySelector('.header-title-display');
        const titleInput = header.querySelector('.header-title-input');
        
        if (titleDisplay && titleInput) {
            titleDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!checkWritePermission()) return;
                
                titleDisplay.style.display = 'none';
                titleInput.style.display = 'block';
                titleInput.focus();
                titleInput.select();
            });
            
            titleInput.addEventListener('blur', () => {
                const newTitle = titleInput.value.trim();
                if (newTitle) {
                    titleDisplay.textContent = newTitle;
                    
                    // 保存到统一结构
                    if (typeof tripDataStructure !== 'undefined') {
                        const unifiedData = tripDataStructure.loadUnifiedData();
                        if (unifiedData) {
                            unifiedData.title = newTitle;
                            tripDataStructure.saveUnifiedData(unifiedData);
                            triggerImmediateUpload();
                        }
                    }
                    
                    // 更新缓存
                    const tripData = loadTripData();
                    tripData.title = newTitle;
                    localStorage.setItem('trip_data_cache', JSON.stringify(tripData));
                }
                
                titleDisplay.style.display = 'block';
                titleInput.style.display = 'none';
            });
            
            titleInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleInput.blur();
                }
            });
        }
    }
}

// 渲染导航（总览从每天的title自动生成）
function renderNavigation() {
    const navContainer = document.querySelector('.nav-container');
    const tripData = loadTripData();
    if (!navContainer || !tripData) return;
    
    // 从每天的title自动生成总览
    const days = tripData.days || [];
    
    let html = '<h2>行程总览</h2><ul class="nav-list">';
    days.forEach((day, index) => {
        const dayId = day.id || `day${index + 1}`;
        const dayTitle = day.title || `Day ${index + 1}`;
        html += `
            <li class="nav-item">
                <a href="#" class="nav-link" data-day="${dayId}">${dayTitle}</a>
            </li>
        `;
    });
    html += '</ul>';
    // 添加开支总计按钮
    html += '<div class="nav-actions"><button class="btn-expense-summary" onclick="showExpenseSummary()">💰 开支总计</button></div>';
    navContainer.innerHTML = html;
    
    // 添加导航点击事件
    navContainer.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const dayId = link.dataset.day;
            showDay(dayId);
            
            // 更新活动状态
            navContainer.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

// 显示指定日期的行程
function showDay(dayId) {
    currentDayId = dayId;
    // 更新全局变量，供实时同步回调使用
    window.currentDayId = currentDayId;
    
    // 优先使用统一数据结构
    let day = null;
    let allItems = [];
    
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData) {
            day = tripDataStructure.getDayData(unifiedData, dayId);
            if (day) {
                // 如果发现_deleted项，先尝试恢复它们
                const hasDeletedItems = day.items.some(item => item._deleted);
                if (hasDeletedItems && typeof tripDataStructure !== 'undefined') {
                    console.warn('发现已删除的项，尝试恢复...');
                    const restored = tripDataStructure.restoreDeletedItems(unifiedData);
                    if (restored) {
                        // 重新加载数据
                        day = tripDataStructure.getDayData(unifiedData, dayId);
                    }
                }
                
                // 确保所有item都有images字段（如果缺失则初始化）
                day.items.forEach(item => {
                    if (!item.hasOwnProperty('images')) {
                        item.images = [];
                    }
                    if (!item.hasOwnProperty('comments')) {
                        item.comments = [];
                    }
                    if (!item.hasOwnProperty('spend')) {
                        item.spend = null;
                    }
                });
                
                // 按order排序（硬删除后不再有_deleted项，但保留兼容性过滤）
                allItems = day.items
                    .filter(item => {
                        // 兼容旧数据：如果还有_deleted标记，过滤掉
                        // 但正常情况下硬删除后不应该有_deleted项
                        if (item._deleted) {
                            console.warn('发现已删除的项（旧数据）:', item.id, '将被过滤');
                            return false;
                        }
                        return true;
                    })
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
                // 确保所有items都有id
                allItems.forEach((item, index) => {
                    if (!item.id) {
                        console.warn(`统一结构中的item缺少id，生成临时id:`, item);
                        item.id = `${dayId}_item_${index}_${Date.now()}`;
                    }
                });
            }
        }
    }
    
    // 如果没有统一数据，尝试从缓存或data.js加载
    if (!day) {
        // 优先从缓存加载（如果有）
        const cachedData = localStorage.getItem('trip_data_cache');
        let cachedTripData = null;
        if (cachedData) {
            try {
                cachedTripData = JSON.parse(cachedData);
                day = cachedTripData.days?.find(d => d.id === dayId);
            } catch (e) {
                console.warn('解析缓存数据失败:', e);
            }
        }
        
        // 如果缓存也没有，尝试从统一结构初始化（如果统一结构存在但没有这个day）
        if (!day && typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData && unifiedData.days) {
                day = unifiedData.days.find(d => d.id === dayId);
            }
        }
        
        if (!day) {
            console.warn(`未找到日期数据: ${dayId}`);
            return;
        }
        
        const customItems = getCustomItems(dayId);
        allItems = [...day.items, ...customItems];
        
        // 为所有项添加id和tag属性（如果还没有的话）
        allItems.forEach((item, index) => {
            // 确保每个item都有id
            if (!item.id) {
                if (item.isCustom) {
                    // 自定义项应该有id，如果没有则生成
                    item.id = item.id || `custom_${dayId}_${Date.now()}_${index}`;
                } else {
                    // 原始项生成id
                    item.id = `${dayId}_item_${index}_${Date.now()}`;
                }
            }
            
            // 添加tag属性
            if (!item.tag) {
                if (item.isCustom) {
                    item.tag = item.tag || item.category || '其他';
                } else {
                    const tagKey = `trip_tag_${dayId}_${index}`;
                    const savedTag = localStorage.getItem(tagKey);
                    item.tag = savedTag || item.category || '其他';
                }
            }
        });
        
        // 应用保存的顺序
        allItems = applyCardOrder(dayId, allItems);
    }
    
    // 更新日期标题
    const dayHeader = document.querySelector('.day-header');
    if (dayHeader) {
        dayHeader.innerHTML = `
            <div class="day-title-container">
                <h2 class="day-title-display">${day.title || ''}</h2>
                <input type="text" class="day-title-input" value="${day.title || ''}" style="display: none;" />
            </div>
            <div class="day-header-actions">
                <button class="add-item-btn" onclick="showAddItemModal('${dayId}')" title="新增行程项">
                    ➕ 新增行程项
                </button>
                <button class="filter-btn" onclick="toggleFilterPanel()" title="筛选">
                    🔍 筛选
                </button>
                <button class="sort-mode-btn" onclick="toggleSortMode()" title="排序">
                    📋 排序
                </button>
            </div>
        `;
        
        // 添加日期标题编辑事件
        const dayTitleDisplay = dayHeader.querySelector('.day-title-display');
        const dayTitleInput = dayHeader.querySelector('.day-title-input');
        
        if (dayTitleDisplay && dayTitleInput) {
            dayTitleDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!checkWritePermission()) return;
                
                dayTitleDisplay.style.display = 'none';
                dayTitleInput.style.display = 'block';
                dayTitleInput.focus();
                dayTitleInput.select();
            });
            
            dayTitleInput.addEventListener('blur', () => {
                const newTitle = dayTitleInput.value.trim();
                if (newTitle) {
                    dayTitleDisplay.textContent = newTitle;
                    
                    // 保存到统一结构
                    if (typeof tripDataStructure !== 'undefined') {
                        const unifiedData = tripDataStructure.loadUnifiedData();
                        if (unifiedData) {
                            const dayData = tripDataStructure.getDayData(unifiedData, dayId);
                            if (dayData) {
                                dayData.title = newTitle;
                                tripDataStructure.saveUnifiedData(unifiedData);
                                triggerImmediateUpload();
                            }
                        }
                    }
                }
                
                dayTitleDisplay.style.display = 'block';
                dayTitleInput.style.display = 'none';
            });
            
            dayTitleInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    dayTitleInput.blur();
                }
            });
        }
    }
    
    // 应用筛选
    const filteredItems = applyFilter(allItems, dayId);
    
    // 创建卡片容器（滚动模式）
    const cardsContainer = document.getElementById('cards-container');
    if (cardsContainer) {
        // 创建新的卡片显示器（滚动模式）
        const slider = new CardSlider('cards-container', filteredItems, dayId);
        // 只有在当前日期时才保存引用，避免跨日期状态混乱
        if (dayId === currentDayId) {
            currentSlider = slider; // 保存引用
        }
        
        // 不再自动滚动到卡片区域，让用户保持在当前位置
    }
}

// 应用卡片顺序
function applyCardOrder(dayId, items) {
    // 先过滤掉已删除的项（兼容旧数据）
    const validItems = items.filter(item => {
        // 兼容旧数据：如果还有_deleted标记，过滤掉
        // 但正常情况下硬删除后不应该有_deleted项
        if (item._deleted) {
            console.warn('发现已删除的项（旧数据）:', item.id || item.category, '将被过滤');
            return false;
        }
        return true;
    });
    
    // 优先使用统一结构中的order字段
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData) {
            const day = tripDataStructure.getDayData(unifiedData, dayId);
            if (day && day.items) {
                // 创建itemId到item的映射
                const itemMap = new Map();
                validItems.forEach(item => {
                    if (item.id) {
                        itemMap.set(item.id, item);
                    }
                });
                
                // 按order排序统一结构中的items
                const orderedItems = day.items
                    .filter(item => !item._deleted && itemMap.has(item.id))
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map(item => itemMap.get(item.id))
                    .filter(item => item !== undefined);
                
                // 添加没有在统一结构中的项（新添加的项）
                const orderedIds = new Set(orderedItems.map(item => item.id));
                validItems.forEach(item => {
                    if (item.id && !orderedIds.has(item.id)) {
                        orderedItems.push(item);
                    }
                });
                
                return orderedItems;
            }
        }
    }
    
    // 回退到旧的localStorage方式
    const orderKey = `trip_card_order_${dayId}`;
    const orderData = localStorage.getItem(orderKey);
    if (!orderData) {
        // 如果没有保存的顺序，按order字段排序
        return validItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    try {
        const order = JSON.parse(orderData);
        const orderedItems = [];
        // 创建映射：优先使用id，如果没有id则使用category+time+plan组合
        const itemMap = new Map();
        validItems.forEach(item => {
            let key;
            if (item.id) {
                // 优先使用id
                key = item.id;
            } else if (item.isCustom) {
                // 自定义项应该有id，如果没有则生成临时key
                key = `custom_${item.category || 'item'}_${Date.now()}`;
            } else {
                // 原始项：使用category + time + plan的前几个字符作为唯一标识
                const time = item.time || '';
                let planStr = '';
                if (item.plan) {
                    if (Array.isArray(item.plan)) {
                        const firstPlan = item.plan.find(p => {
                            if (typeof p === 'object' && p._deleted) {
                                return false;
                            }
                            return true;
                        });
                        if (firstPlan) {
                            planStr = typeof firstPlan === 'string' ? firstPlan : (firstPlan._text || '');
                        }
                    } else if (typeof item.plan === 'string') {
                        planStr = item.plan;
                    }
                }
                planStr = (planStr || '').substring(0, 20);
                key = `${item.category || 'item'}_${time}_${planStr}`.replace(/\s+/g, '_');
            }
            // 如果key已存在，添加索引后缀确保唯一性
            if (itemMap.has(key)) {
                let counter = 1;
                while (itemMap.has(`${key}_${counter}`)) {
                    counter++;
                }
                key = `${key}_${counter}`;
            }
            itemMap.set(key, item);
        });
        
        // 按照保存的顺序排列
        order.forEach(orderItem => {
            const item = itemMap.get(orderItem.id);
            if (item) {
                orderedItems.push(item);
                itemMap.delete(orderItem.id);
            }
        });
        
        // 添加未排序的项（新添加的项），按order字段排序
        const remainingItems = Array.from(itemMap.values());
        remainingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
        orderedItems.push(...remainingItems);
        
        return orderedItems;
    } catch (e) {
        // 如果解析失败，按order字段排序
        return validItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
}

// 应用筛选
let currentFilter = null;
function applyFilter(items, dayId) {
    if (!currentFilter) return items;
    
    return items.filter(item => {
        // 使用item.tag（在showDay中已经为所有项添加了tag属性）
        const tag = item.tag || item.category || '其他';
        return currentFilter === 'all' || tag === currentFilter;
    });
}

// 切换筛选面板
function toggleFilterPanel() {
    const panel = document.getElementById('filter-panel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
}

// 设置筛选
function setFilter(tag) {
    currentFilter = tag;
    if (currentDayId) {
        showDay(currentDayId);
    }
    const panel = document.getElementById('filter-panel');
    if (panel) {
        panel.style.display = 'none';
    }
}

// 切换排序模式
let currentSlider = null;
function toggleSortMode() {
    const cardsContainer = document.getElementById('cards-container');
    if (!cardsContainer) return;
    
    // 如果currentSlider不存在或日期不匹配，重新创建
    if (!currentSlider || currentSlider.dayId !== currentDayId) {
        const tripData = loadTripData();
        const day = tripData.days.find(d => d.id === currentDayId);
        if (!day) return;
        
        // 从统一结构加载数据时，需要过滤已删除的项
        let dayItems = day.items || [];
        if (typeof tripDataStructure !== 'undefined') {
            const unifiedData = tripDataStructure.loadUnifiedData();
            if (unifiedData) {
                const unifiedDay = tripDataStructure.getDayData(unifiedData, currentDayId);
                if (unifiedDay && unifiedDay.items) {
                    // 过滤掉已删除的项
                    dayItems = unifiedDay.items.filter(item => !item._deleted);
                }
            }
        } else {
            // 如果没有统一结构，也过滤已删除的项（如果有_deleted属性）
            dayItems = dayItems.filter(item => !item._deleted);
        }
        
        const customItems = getCustomItems(currentDayId);
        const allItems = [...dayItems, ...customItems];
        
        // 为所有项添加tag属性
        allItems.forEach((item, index) => {
            if (!item.tag) {
                if (item.isCustom) {
                    item.tag = item.tag || item.category || '其他';
                } else {
                    const tagKey = `trip_tag_${currentDayId}_${index}`;
                    const savedTag = localStorage.getItem(tagKey);
                    item.tag = savedTag || item.category || '其他';
                }
            }
        });
        
        const orderedItems = applyCardOrder(currentDayId, allItems);
        const filteredItems = applyFilter(orderedItems, currentDayId);
        // 再次确保过滤掉已删除的项
        const finalItems = filteredItems.filter(item => !item._deleted);
        currentSlider = new CardSlider('cards-container', finalItems, currentDayId);
    }
    
    currentSlider.toggleSortMode();
}

// 获取自定义添加的行程项（包括已删除的，用于保存）
function getAllCustomItems(dayId) {
    const key = `trip_custom_items_${dayId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

// 获取自定义添加的行程项（过滤掉已删除的，用于显示）
function getCustomItems(dayId) {
    const allItems = getAllCustomItems(dayId);
    // 过滤掉已删除的项
    return allItems.filter(item => !item._deleted);
}

// 添加自定义行程项
function addCustomItem(dayId, itemData) {
    // 检查写权限
    if (!checkWritePermission()) {
        console.error('添加自定义项失败：没有写权限');
        return;
    }
    
    if (!dayId) {
        console.error('添加自定义项失败：dayId为空');
        return;
    }
    
    // 优先保存到统一结构
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData) {
            const newItem = tripDataStructure.addItemData(unifiedData, dayId, itemData);
            if (newItem) {
                console.log('成功保存自定义项到统一结构:', newItem);
                showDay(dayId);
                triggerImmediateUpload();
                return;
            }
        }
    }
    
    // 回退到旧的存储方式
    const key = `trip_custom_items_${dayId}`;
    const allItems = getAllCustomItems(dayId);
    
    const newItem = {
        ...itemData,
        id: `custom_${Date.now()}`,
        isCustom: true,
        tag: itemData.tag || '其他',
    };
    
    allItems.push(newItem);
    
    try {
        localStorage.setItem(key, JSON.stringify(allItems));
        console.log('成功保存自定义项:', newItem);
        
        // 自动同步
        autoSyncToGist();
        
        // 刷新显示
        showDay(dayId);
    } catch (error) {
        console.error('保存到localStorage失败:', error);
        alert('保存失败：' + error.message);
    }
}

// 删除自定义行程项（硬删除）
function deleteCustomItem(dayId, itemId) {
    // 检查写权限
    if (!checkWritePermission()) return;
    
    // 优先保存到统一结构
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData) {
            const success = tripDataStructure.deleteItemData(unifiedData, dayId, itemId);
            if (success) {
                console.log('成功删除项（统一结构）:', itemId);
                // 如果当前有CardSlider实例且是同一个day，直接更新它
                if (currentSlider && currentSlider.dayId === dayId) {
                    currentSlider.cards = currentSlider.cards.filter(c => c.id !== itemId);
                    currentSlider.renderCards();
                    currentSlider.attachCardEventsForAll();
                } else {
                    showDay(dayId);
                }
                triggerImmediateUpload();
                return;
            }
        }
    }
    
    // 回退到旧的存储方式
    const key = `trip_custom_items_${dayId}`;
    const items = getAllCustomItems(dayId);
    const itemIndex = items.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
        // 真正从数组中删除
        items.splice(itemIndex, 1);
        localStorage.setItem(key, JSON.stringify(items));
        
        // 自动同步
        triggerImmediateUpload();
        
        showDay(dayId);
    }
}

// 显示新增行程项模态框
function showAddItemModal(dayId) {
    const modal = document.getElementById('add-item-modal');
    if (modal) {
        modal.dataset.dayId = dayId;
        modal.style.display = 'flex';
        // 清空表单
        document.getElementById('new-item-category').value = '';
        document.getElementById('new-item-time').value = '';
        document.getElementById('new-item-plan').value = '';
        document.getElementById('new-item-note').value = '';
    }
}

// 关闭新增行程项模态框
function closeAddItemModal() {
    const modal = document.getElementById('add-item-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 保存新增的行程项
function saveNewItem() {
    // 检查写权限
    if (!checkWritePermission()) {
        console.error('保存失败：没有写权限');
        return;
    }
    
    const modal = document.getElementById('add-item-modal');
    if (!modal) {
        console.error('保存失败：找不到模态框');
        alert('保存失败：找不到表单');
        return;
    }
    
    const dayId = modal.dataset.dayId;
    if (!dayId) {
        console.error('保存失败：dayId为空');
        alert('保存失败：日期ID无效');
        return;
    }
    
    const category = document.getElementById('new-item-category').value.trim();
    
    if (!category) {
        alert('请输入事项名称');
        return;
    }
    
    const itemData = {
        category: category,
        time: document.getElementById('new-item-time').value.trim(),
        plan: document.getElementById('new-item-plan').value.trim(),
        note: document.getElementById('new-item-note').value.trim(),
        tag: document.getElementById('new-item-tag').value || '其他'
    };
    
    try {
        addCustomItem(dayId, itemData);
        closeAddItemModal();
    } catch (error) {
        console.error('保存行程项时出错:', error);
        alert('保存失败：' + error.message);
    }
}

// 自动同步到Gist（如果已配置）
let syncTimeout = null;
// 立即触发上传（不防抖）
function triggerImmediateUpload() {
    // 只使用Firebase同步
    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        return dataSyncFirebase.upload(true).then(result => {
            if (result.success) {
                updateSyncStatus('已上传到云端', 'success');
            } else {
                updateSyncStatus('上传失败: ' + (result.message || '未知错误'), 'error');
            }
            return result;
        }).catch(error => {
            console.error('上传失败:', error);
            updateSyncStatus('上传失败: ' + error.message, 'error');
            return { success: false, message: error.message };
        });
    } else {
        console.log('Firebase未配置，跳过上传');
        return Promise.resolve({ success: false, message: 'Firebase未配置' });
    }
}

function autoSyncToGist() {
    // 防抖，避免频繁同步（仅使用Firebase）
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    
    syncTimeout = setTimeout(() => {
        // 只使用Firebase同步
        if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
            dataSyncFirebase.upload().then(result => {
                if (result.success) {
                    updateSyncStatus('已自动同步', 'success');
                }
            }).catch(() => {
                // 静默处理错误
            });
        }
    }, 2000); // 2秒后同步
}

// 手动上传函数（供按钮调用）
function syncUpload() {
    triggerImmediateUpload();
}

// 手动下载函数（供按钮调用）
function syncDownload() {
    // 只使用Firebase同步
    if (typeof dataSyncFirebase !== 'undefined' && dataSyncFirebase.isConfigured()) {
        updateSyncStatus('正在下载...', 'info');
        dataSyncFirebase.download().then(result => {
            if (result.success) {
                updateSyncStatus('下载成功', 'success');
                // 刷新当前页面显示
                renderOverview();
                renderNavigation();
                if (currentDayId) {
                    showDay(currentDayId);
                }
            } else {
                updateSyncStatus('下载失败: ' + (result.message || '未知错误'), 'error');
            }
        }).catch(error => {
            console.error('下载失败:', error);
            // 安全处理错误信息
            let errorMessage = '下载失败: 未知错误';
            if (error) {
                if (typeof error === 'string') {
                    errorMessage = `下载失败: ${error}`;
                } else if (error.message) {
                    errorMessage = `下载失败: ${error.message}`;
                } else if (error.toString && error.toString() !== '[object Object]') {
                    errorMessage = `下载失败: ${error.toString()}`;
                }
            }
            updateSyncStatus(errorMessage, 'error');
        });
    } else {
        updateSyncStatus('Firebase未配置', 'error');
    }
}

// 获取所有编辑的数据
function getAllEditedData() {
    const data = {
        customItems: {},
        cardOrders: {},
        images: {},
        comments: {},
        likes: {},
        timestamp: new Date().toISOString()
    };
    
    // 收集所有localStorage中的数据
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('trip_')) {
            if (key.includes('_custom_items_')) {
                const dayId = key.replace('trip_custom_items_', '');
                data.customItems[dayId] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_card_order_')) {
                const dayId = key.replace('trip_card_order_', '');
                data.cardOrders[dayId] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_images_')) {
                data.images[key] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_comments_')) {
                data.comments[key] = JSON.parse(localStorage.getItem(key));
            } else if (key.includes('_likes_')) {
                data.likes[key] = JSON.parse(localStorage.getItem(key));
            }
        }
    }
    
    return data;
}

// 返回顶部功能
function initBackToTop() {
    const backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.innerHTML = '↑';
    backToTop.setAttribute('aria-label', '返回顶部');
    document.body.appendChild(backToTop);
    
    // 显示/隐藏按钮
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    });
    
    // 点击返回顶部
    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// 切换同步面板展开/折叠
function toggleSyncPanel() {
    const syncControls = document.querySelector('.sync-controls');
    if (syncControls) {
        syncControls.classList.toggle('expanded');
    }
}

// 收集所有消费数据
function getAllExpenses() {
    const expenses = [];
    
    // 优先使用统一数据结构
    if (typeof tripDataStructure !== 'undefined') {
        const unifiedData = tripDataStructure.loadUnifiedData();
        if (unifiedData && unifiedData.days) {
            unifiedData.days.forEach(day => {
                if (day.items && Array.isArray(day.items)) {
                    day.items.forEach(item => {
                        if (item.spend && Array.isArray(item.spend)) {
                            item.spend.forEach(spendItem => {
                                expenses.push({
                                    dayId: day.id || '',
                                    dayTitle: day.title || '',
                                    itemId: item.id || '',
                                    itemCategory: item.category || '',
                                    itemTime: item.time || '',
                                    itemName: item.plan?.[0] || '',
                                    spendItem: spendItem.item || '',
                                    amount: parseFloat(spendItem.amount) || 0,
                                    payer: spendItem.payer || ''
                                });
                            });
                        }
                    });
                }
            });
        }
    } else {
        // 回退到旧的数据结构
        const tripData = loadTripData();
        if (tripData && tripData.days) {
            tripData.days.forEach(day => {
                if (day.items && Array.isArray(day.items)) {
                    day.items.forEach(item => {
                        if (item.spend && Array.isArray(item.spend)) {
                            item.spend.forEach(spendItem => {
                                expenses.push({
                                    dayId: day.id || '',
                                    dayTitle: day.title || '',
                                    itemCategory: item.category || '',
                                    itemTime: item.time || '',
                                    itemName: item.plan?.[0] || '',
                                    spendItem: spendItem.item || '',
                                    amount: parseFloat(spendItem.amount) || 0,
                                    payer: spendItem.payer || ''
                                });
                            });
                        }
                    });
                }
            });
        }
    }
    
    return expenses;
}

// 显示开支总计
function showExpenseSummary() {
    const modal = document.getElementById('expense-summary-modal');
    const content = document.getElementById('expense-summary-content');
    
    if (!modal || !content) return;
    
    const expenses = getAllExpenses();
    
    if (expenses.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">暂无消费记录</p>';
        modal.style.display = 'flex';
        return;
    }
    
    // 按支出人统计
    const payerStats = {};
    // 按日期统计
    const dayStats = {};
    // 总计
    let totalAmount = 0;
    
    expenses.forEach(expense => {
        const amount = expense.amount || 0;
        totalAmount += amount;
        
        // 按支出人统计
        const payer = expense.payer || '未指定';
        if (!payerStats[payer]) {
            payerStats[payer] = { amount: 0, count: 0, items: [] };
        }
        payerStats[payer].amount += amount;
        payerStats[payer].count += 1;
        payerStats[payer].items.push(expense);
        
        // 按日期统计
        const dayTitle = expense.dayTitle || '未知日期';
        if (!dayStats[dayTitle]) {
            dayStats[dayTitle] = { amount: 0, count: 0, items: [] };
        }
        dayStats[dayTitle].amount += amount;
        dayStats[dayTitle].count += 1;
        dayStats[dayTitle].items.push(expense);
    });
    
    // 生成HTML
    let html = '<div class="expense-summary-container">';
    
    // 总计
    html += `
        <div class="expense-summary-section">
            <h3>💰 总计</h3>
            <div class="expense-total">
                <span class="expense-total-label">总支出：</span>
                <span class="expense-total-amount">¥${totalAmount.toFixed(2)}</span>
            </div>
            <div class="expense-total">
                <span class="expense-total-label">消费项数：</span>
                <span class="expense-total-count">${expenses.length} 项</span>
            </div>
        </div>
    `;
    
    // 按支出人统计
    html += `
        <div class="expense-summary-section">
            <h3>👥 按支出人统计</h3>
            <table class="expense-summary-table">
                <thead>
                    <tr>
                        <th>支出人</th>
                        <th>金额</th>
                        <th>项数</th>
                        <th>占比</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    Object.keys(payerStats).sort().forEach(payer => {
        const stats = payerStats[payer];
        const percentage = totalAmount > 0 ? ((stats.amount / totalAmount) * 100).toFixed(1) : 0;
        html += `
            <tr>
                <td>${payer === '未指定' ? '<span style="color: #999;">未指定</span>' : payer}</td>
                <td class="expense-amount">¥${stats.amount.toFixed(2)}</td>
                <td>${stats.count}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    // 按日期统计
    html += `
        <div class="expense-summary-section">
            <h3>📅 按日期统计</h3>
            <table class="expense-summary-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>金额</th>
                        <th>项数</th>
                        <th>占比</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    Object.keys(dayStats).sort().forEach(dayTitle => {
        const stats = dayStats[dayTitle];
        const percentage = totalAmount > 0 ? ((stats.amount / totalAmount) * 100).toFixed(1) : 0;
        html += `
            <tr>
                <td>${dayTitle}</td>
                <td class="expense-amount">¥${stats.amount.toFixed(2)}</td>
                <td>${stats.count}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    // 详细列表（可选，可折叠）
    html += `
        <div class="expense-summary-section">
            <h3>📋 详细列表</h3>
            <div class="expense-detail-list">
    `;
    
    expenses.forEach((expense, index) => {
        html += `
            <div class="expense-detail-item">
                <div class="expense-detail-header">
                    <span class="expense-detail-day">${expense.dayTitle}</span>
                    <span class="expense-detail-amount">¥${expense.amount.toFixed(2)}</span>
                </div>
                <div class="expense-detail-content">
                    <span class="expense-detail-item-name">${expense.spendItem || '未命名'}</span>
                    <span class="expense-detail-payer">${expense.payer ? '👤 ' + expense.payer : ''}</span>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    html += '</div>';
    
    content.innerHTML = html;
    modal.style.display = 'flex';
}

// 关闭开支总计
function closeExpenseSummary() {
    const modal = document.getElementById('expense-summary-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

