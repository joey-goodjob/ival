## Next Quotation Converter

基于 Next.js 的矩阵 Excel → 报价明细转换工具。上传客户提供的机型/颜色矩阵表格，即可在线展开为标准报价明细，并下载生成的 `.xlsx`。

### 环境要求

- Node.js 18+
- npm（已在项目中使用）

### 快速开始

```bash
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 即可体验：上传矩阵 Excel → 预览展开结果 → 下载明细表。

### 主要脚本

| 命令            | 说明                         |
| --------------- | ---------------------------- |
| `npm run dev`   | 启动开发环境                 |
| `npm run build` | 生产环境构建                 |
| `npm run start` | 运行生产构建                 |
| `npm run lint`  | ESLint 代码检查              |
| `npm run test`  | Vitest 单元测试（核心转换） |

### 核心结构

| 路径                                   | 描述                                     |
| -------------------------------------- | ---------------------------------------- |
| `src/app/page.tsx`                     | 前端上传、预览、下载页面                 |
| `src/app/api/convert/route.ts`         | 解析 Excel、调用转换逻辑并返回结果的 API |
| `src/lib/transform.ts`                 | 矩阵 → 明细转换、生成 Excel 的核心逻辑   |
| `tests/transform.test.ts`              | 针对转换逻辑的单元测试                   |

### API 约定

- `POST /api/convert`
  - 请求：`multipart/form-data`，字段 `file` 为 Excel 文件。
  - 响应（成功）：
    ```json
    {
      "rows": [/* 明细行 */],
      "totals": { "totalQty": 0, "totalAmount": 0 },
      "warnings": [],
      "metadata": { "sourceName": "xxx.xlsx", "rowCount": 0 },
      "excelBase64": "base64-string"
    }
    ```
  - 响应（失败）：`{ "error": { "code": "...", "message": "..." } }`

### 输入模板提示

- 第一列必须为 `Model`。
- 颜色列可任意命名（如 `18#Black`、`5#Lilac Blue`），数量 > 0 会展开成独立行。
- 固定尾列：`Qty`、`Price`、`Amount, usd`。若 `Price` 缺失则默认 0.8。

### 测试与质量保障

```bash
npm run lint
npm run test
```

测试覆盖：
- 颜色列展开、总计计算
- 默认价格回退
- 模板缺陷、无效数据的错误处理
- Excel 生成与序列化

### 部署说明

项目适配 Vercel / 自托管环境：

```bash
npm run build
npm run start
```

如需自定义默认价格、权限等，可在后续迭代通过环境变量扩展。
