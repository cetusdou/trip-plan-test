// 生成完整的 Firebase 数据结构
// 使用方法：在浏览器控制台运行此脚本，或使用 Node.js 运行

// 读取 data.json 文件（如果使用 Node.js）
let tripUnifiedData = null;

if (typeof require !== 'undefined') {
    // Node.js 环境
    const fs = require('fs');
    const dataJson = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    tripUnifiedData = dataJson;
} else {
    // 浏览器环境 - 从 localStorage 或直接使用
    console.log('请在浏览器控制台运行此脚本');
    console.log('或者使用 Node.js: node generate-firebase-data.js');
}

// 用户密码数据（在 Firebase 根路径下的 user_passwords）
const userPasswords = {
    "mrb": "abs",  // 根据截图，密码是 "abs"
    "djy": "abs"   // 根据截图，密码是 "abs"
};

// 生成完整的数据结构
function generateFirebaseData() {
    if (!tripUnifiedData) {
        console.error('无法读取 tripUnifiedData，请确保 data.json 存在');
        return null;
    }

    // 在 trip_plan_data 路径下的数据
    const tripPlanData = {
        trip_unified_data: JSON.stringify(tripUnifiedData)
    };

    // 在根路径下的 user_passwords（需要单独上传）
    const rootData = {
        user_passwords: userPasswords
    };

    return {
        trip_plan_data: tripPlanData,
        root: rootData
    };
}

// 输出数据
if (tripUnifiedData) {
    const firebaseData = generateFirebaseData();
    
    console.log('=== Firebase 数据结构 ===');
    console.log('\n1. trip_plan_data 路径下的数据：');
    console.log(JSON.stringify(firebaseData.trip_plan_data, null, 2));
    
    console.log('\n2. 根路径下的 user_passwords（需要单独上传）：');
    console.log(JSON.stringify(firebaseData.root, null, 2));
    
    // 如果使用 Node.js，可以写入文件
    if (typeof module !== 'undefined' && module.exports) {
        const fs = require('fs');
        fs.writeFileSync('firebase-data.json', JSON.stringify(firebaseData, null, 2));
        console.log('\n数据已保存到 firebase-data.json');
    }
} else {
    console.log('=== 使用说明 ===');
    console.log('\n1. 在 Firebase 控制台的 Realtime Database 中：');
    console.log('   - 在 trip_plan_data 路径下，添加 trip_unified_data 键');
    console.log('   - 值为 data.json 中的 JSON 字符串');
    console.log('   - 在根路径下，确保 user_passwords 存在（根据截图已存在）');
    console.log('\n2. 或者使用代码上传：');
    console.log('   - 使用 dataSyncFirebase.upload() 上传 trip_plan_data');
    console.log('   - user_passwords 应该已经在根路径下了');
}

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateFirebaseData, userPasswords };
}
