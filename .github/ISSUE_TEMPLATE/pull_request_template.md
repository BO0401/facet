name: Pull Request
description: 提交更改
body:
  - type: textarea
    id: what
    attributes:
      label: 改了什么
    validations:
      required: true
  - type: textarea
    id: why
    attributes:
      label: 为什么
    validations:
      required: true
  - type: textarea
    id: verify
    attributes:
      label: 怎么验证的
      description: 贴 npm test 的关键输出；改引擎必须保持规范 652/652
    validations:
      required: true
  - type: checkboxes
    id: checks
    attributes:
      label: 自检
      options:
        - label: npm run test:spec 通过（652/652）
        - label: npm run test:unit 通过
        - label: 改了构建相关则 npm run test:smoke 通过
        - label: 提交信息符合 Conventional Commits
