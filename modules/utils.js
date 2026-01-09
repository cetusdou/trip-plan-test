// 工具函数模块

// 生成内容哈希值（用于去重）
async function generateContentHash(content, user, timestamp) {
    const hashString = `${content}|${user}|${timestamp}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(hashString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
}

// 格式化时间显示
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
}

// HTML转义（保留换行）
function escapeHtmlKeepBr(text) {
    if (!text) return '';
    // 确保输入是字符串类型
    if (typeof text !== 'string') {
        text = String(text);
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

// HTML转义
function escapeHtml(text) {
    if (!text) return '';
    // 确保输入是字符串类型
    if (typeof text !== 'string') {
        text = String(text);
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Markdown转HTML
function markdownToHtml(markdown) {
    if (!markdown) return '';
    if (typeof marked !== 'undefined') {
        try {
            return marked.parse(markdown);
        } catch (error) {
            console.error('Markdown 解析失败:', error);
            return escapeHtmlKeepBr(markdown);
        }
    } else {
        console.warn('marked.js 未加载，使用普通文本显示');
        return escapeHtmlKeepBr(markdown);
    }
}

// 格式化时间为HTML time input格式 (HH:mm)
function formatTimeForInput(timeStr) {
    if (!timeStr) return '';
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?/i);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2];
        const ampm = timeMatch[3];
        
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
function formatTimeForDisplay(timeStr) {
    if (!timeStr) return '';
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2];
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
    return timeStr;
}

// 导出到全局
window.generateContentHash = generateContentHash;
window.formatTime = formatTime;
window.escapeHtmlKeepBr = escapeHtmlKeepBr;
window.escapeHtml = escapeHtml;
window.markdownToHtml = markdownToHtml;
window.formatTimeForInput = formatTimeForInput;
window.formatTimeForDisplay = formatTimeForDisplay;

