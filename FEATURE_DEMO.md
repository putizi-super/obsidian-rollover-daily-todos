# 新功能演示：复制所有内容除了已完成的TODO

## 功能说明

这个新功能类似于现有的"Roll over children of todos"设置，但有以下区别：

### 原有功能（关闭新开关时）
- 只复制未完成的TODO项目
- 其他内容（标题、普通文本等）不会被复制

### 新功能（开启"Rollover all content except completed todos"时）
- 复制所有内容（标题、文本、未完成的TODO等）
- 删除已完成的TODO项目（根据Done status markers设置判断）
- 如果开启了"Roll over children of todos"，也会删除已完成TODO的子项目

## 使用示例

假设昨天的日记内容如下：

```markdown
# 2024-01-15 日记

## 工作任务
- [x] 完成项目报告
- [ ] 准备明天的会议
  - [ ] 整理会议资料
  - [x] 发送会议邀请

## 个人事项
- [x] 去超市买菜
- [ ] 锻炼30分钟

## 笔记
今天天气很好，心情不错。
```

### 使用原有功能的结果：
```markdown
- [ ] 准备明天的会议
  - [ ] 整理会议资料
- [ ] 锻炼30分钟
```

### 使用新功能的结果：
```markdown
# 2024-01-15 日记

## 工作任务
- [ ] 准备明天的会议
  - [ ] 整理会议资料

## 个人事项
- [ ] 锻炼30分钟

## 笔记
今天天气很好，心情不错。
```

## 设置说明

1. 打开插件设置
2. 找到"Rollover all content except completed todos"选项
3. 开启此选项即可使用新功能
4. 可以配合其他设置使用：
   - "Roll over children of todos"：是否包含子项目
   - "Done status markers"：定义哪些字符表示已完成状态
   - "Delete todos from previous day"：是否从昨天的笔记中删除已处理的内容

## 注意事项

- 新功能开启时，"Remove empty todos in rollover"设置不会生效
- 确保"Done status markers"设置正确，以便正确识别已完成的TODO
- 建议先在测试笔记上试用，确认效果符合预期

## Bug修复

- 修复了删除文件后重新创建时只是创建空白文件的问题
- 现在当删除每日笔记后重新创建时，仍会正确执行回滚功能
