# 代码架构优化方案

## 当前问题分析

1. **script.js 文件过大**（4411行）
   - 包含多个职责：认证、UI渲染、数据同步、事件处理
   - 难以维护和测试

2. **全局变量过多**
   - 大量使用 `window.xxx` 暴露函数
   - 模块间耦合度高

3. **代码重复**
   - 多处检查 `typeof window.xxx !== 'undefined'`
   - 重复的 Firebase 检查逻辑
   - 重复的渲染调用模式

## 优化方案

### 阶段1：提取用户认证模块 ✅
- 创建 `modules/auth-manager.js`
- 包含：登录、登出、密码验证、UI切换

### 阶段2：提取 CardSlider 类
- 创建 `modules/card-slider.js`
- 将 CardSlider 类独立出来

### 阶段3：提取 UI 渲染模块
- 创建 `modules/ui-renderer.js`
- 包含：renderOverview, renderNavigation, showDay

### 阶段4：优化全局变量
- 使用模块化导出替代 window.xxx
- 创建统一的全局状态管理

### 阶段5：简化 script.js
- 只保留初始化和协调逻辑
- 使用事件总线进行模块间通信
