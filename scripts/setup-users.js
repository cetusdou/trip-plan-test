/**
 * 一次性脚本：用 Firebase Admin SDK 批量创建/更新登录账户。
 *
 * 作用：
 *   - 为 5 个固定用户创建 Email/Password 账户（合成邮箱 <name>@trip.local）。
 *   - 设置初始密码（默认 <name>1234）。
 *   - 设置自定义声明 custom claim { username: '<name>' }，供安全规则在阶段二判断成员。
 *
 * 幂等：重复运行不会报错，已存在的账户会被更新（重置密码 + 重设 claim）。
 *
 * 用法（在 scripts/ 目录下）：
 *   1. npm install
 *   2. 把服务账号私钥另存为 scripts/service-account.json
 *      （Firebase 控制台 → 项目设置 → 服务账号 → 生成新的私钥）
 *   3. node setup-users.js
 *
 * 也可改用环境变量指定 key 路径：
 *   GOOGLE_APPLICATION_CREDENTIALS=/abs/path/key.json node setup-users.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// ---------- 配置 ----------
const USERS = ['djy', 'xwz', 'mrb', 'hrz', 'zyt'];
const EMAIL_DOMAIN = 'trip.local';
const emailOf = (name) => `${name}@${EMAIL_DOMAIN}`;
const initialPassword = (name) => `${name}1234`;

// ---------- 初始化 Admin SDK ----------
function initAdmin() {
    // 优先用环境变量指定的凭据
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
        return;
    }
    const keyPath = path.join(__dirname, 'service-account.json');
    if (!fs.existsSync(keyPath)) {
        console.error('\n[错误] 找不到服务账号私钥。请把它另存为：');
        console.error('       ' + keyPath);
        console.error('（Firebase 控制台 → 项目设置 → 服务账号 → 生成新的私钥）\n');
        process.exit(1);
    }
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function upsertUser(name) {
    const email = emailOf(name);
    const password = initialPassword(name);
    const auth = admin.auth();

    let user;
    try {
        user = await auth.getUserByEmail(email);
        // 已存在：重置密码并确保显示名
        await auth.updateUser(user.uid, { password, displayName: name });
        console.log(`  ✔ 已更新账户：${email}（密码已重置为初始密码）`);
    } catch (e) {
        if (e && e.code === 'auth/user-not-found') {
            user = await auth.createUser({ email, password, displayName: name });
            console.log(`  ✔ 已创建账户：${email}`);
        } else {
            throw e;
        }
    }

    // 设置/覆盖自定义声明（阶段二安全规则用 request.auth.token.username 判断成员）
    await auth.setCustomUserClaims(user.uid, { username: name });
    console.log(`    ↳ 已设置 custom claim：username=${name}`);
    return { name, email, uid: user.uid };
}

async function main() {
    initAdmin();
    console.log(`开始处理 ${USERS.length} 个账户（域名 @${EMAIL_DOMAIN}）...\n`);

    const results = [];
    for (const name of USERS) {
        try {
            results.push(await upsertUser(name));
        } catch (e) {
            console.error(`  ✘ 处理 ${name} 失败：`, e.message || e);
        }
    }

    console.log('\n完成。账户清单：');
    results.forEach(r => console.log(`  ${r.name}  →  ${r.email}  (初始密码: ${initialPassword(r.name)})  uid=${r.uid}`));
    console.log('\n提示：用户在前端用「用户名 + 密码」登录即可，代码会自动拼成合成邮箱。');
    process.exit(0);
}

main().catch(err => {
    console.error('脚本执行失败：', err);
    process.exit(1);
});
