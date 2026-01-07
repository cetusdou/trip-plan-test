// 配置文件示例
// 复制此文件为 config.js 并填入你的GitHub Token和Gist ID

const tripConfig = {
    // GitHub Personal Access Token
    // 获取方式：https://github.com/settings/tokens
    // 需要勾选 gist 权限
    githubToken: 'ghp_xxx',
    
    // Gist ID（首次使用留空，会自动创建）
    // 如果已经创建过Gist，可以填入Gist ID
    gistId: '',
    
    // 是否启用自动同步（每30秒自动上传）
    autoSync: false
};

