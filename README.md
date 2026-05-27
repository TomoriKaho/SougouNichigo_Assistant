# SounichiNavi / 総日ナビ

综合日语词库管理系统。当前实现范围只包含后端 API 和管理前端，不包含用户前端。

## 功能范围

- 用户管理：角色为 `dev`、`admin`、`user`，用户类型为 `student`、`teacher`
- 词库管理：教材、课、单元、词表类型筛选，词条/词条补充搜索
- 用户反馈：提交 API、反馈历史 API、管理端处理
- 数据库管理：仅备份、还原、导入 `user_data.db`、`vocabulary.db`、`feedback.db`

## 数据初始化

数据库文件位于根目录 `data/`，并被 `.gitignore` 忽略。

如果 `data/vocabulary.db` 不存在，或词条表为空，后端启动时会尝试读取：

```text
data/Vocabulary_4.json
```

并自动导入教材 `综合日语 第四册` 的词库。`data/Vocabulary_4.pdf` 不再保留。

## 初始账号

首次启动会创建以下账号，可在 `server/.env` 中覆盖：

```text
dev / SounichiNaviDev2026!
admin / SounichiNaviAdmin2026!
```

`dev` 拥有数据库管理、词条新增和词条删除权限。`admin` 可管理用户、编辑词条、处理反馈，但不能操作 `dev` 用户或数据库管理。

## 本地启动

```bash
npm run install:all
npm run server
npm run admin:serve
```

默认地址：

- 后端：`http://localhost:3000`
- 管理端：`http://localhost:8080`
