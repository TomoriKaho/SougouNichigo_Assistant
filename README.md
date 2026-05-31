# SounichiNavi / 総日ナビ

综合日语词库管理系统。当前实现范围只包含后端 API 和管理前端，不包含用户前端。

## 功能范围

- 用户管理：角色为 `dev`、`admin`、`user`，用户类型为 `student`、`teacher`
- 词库管理：教材、课、单元、词表类型筛选，词条/词条补充搜索
- 文法管理：教材、课、单元筛选，文法条目搜索、详情编辑、新增和删除
- 课文管理：教材筛选，课文条目详情编辑、新增和删除
- 阅读材料：管理员上传、查看、下载、重命名和删除 HTML、图片、PDF、Word 文件；普通用户可查看和下载全部阅读材料
- 用户反馈：提交 API、反馈历史 API、管理端处理
- 数据库管理：仅备份、还原、导入 `user_data.db`、`vocabulary.db`、`grammar.db`、`text.db`、`reading_materials.db`、`feedback.db`

## 数据初始化

数据库文件位于根目录 `data/`，并被 `.gitignore` 忽略。
上传的阅读材料文件位于 `data/reading_materials/`，元数据位于 `data/reading_materials.db`。支持 HTML、图片、PDF 和 Word；图片不超过 20MB，PDF/Word 不超过 200MB。Word 文件会通过 LibreOffice 转换为 PDF 供浏览器查看，原文件仍用于下载。

如果 `data/vocabulary.db` 不存在，或词条表为空，后端启动时会尝试读取：

```text
data/Vocabulary_4.json
```

并自动导入教材 `综合日语 第四册` 的词库。`data/Vocabulary_4.pdf` 不再保留。

如果 `data/grammar.db` 不存在，或文法条目表为空，后端启动时会尝试读取：

```text
data/grammar_4.json
```

并自动导入教材 `综合日语 第四册` 的文法条目。

如果 `data/text.db` 不存在，或课文条目表为空，后端启动时会尝试读取：

```text
data/text_4.json
```

并自动导入教材 `综合日语 第四册` 的课文条目。

## 初始账号

后端实际读取 `backend/.env`，不会读取 `backend/.env.example`。首次启动会创建以下账号，可在 `backend/.env` 中覆盖：

```text
dev / SounichiNaviDev2026!
admin / SounichiNaviAdmin2026!
```

`dev` 拥有数据库管理、词条新增和词条删除权限。`admin` 可管理用户、编辑词条、处理反馈，但不能操作 `dev` 用户或数据库管理。

## 本地启动

```bash
npm run install:all
npm run backend
npm run frontend:serve
```

默认地址：

- 后端：`http://localhost:3000`
- 管理端：`http://localhost:8080`
