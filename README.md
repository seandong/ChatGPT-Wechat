# ChatGPT-Wechat
Inspired by [ChatGPT-Feishu](https://github.com/bestony/ChatGPT-Feishu)

微信公众号 ChatGPT 机器人


## 效果

<img width="447" alt="image" src="https://user-images.githubusercontent.com/758427/223767480-e5dd6099-395a-498e-9197-27ee22fb9402.png">


## 如何使用？


### 准备工作

- 注册[微信公众号](https://mp.weixin.qq.com/)
- 创建 [OpenAI (ChatGPT)](https://platform.openai.com/) 账号【[注册教程](https://cloud.tencent.com/developer/article/2190154)】
- 创建 [AirCode.io](https://aircode.io/) 账号

### 1. 访问 [AirCode.io](https://aircode.io/dashboard) ，创建一个新的项目

登录 [AirCode](https://aircode.io/dashboard) ，创建一个新的 Node.js v16 的项目，项目名可以根据你的需要填写，可以填写【ChatGPT】

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223665140-947144a3-c2e8-498c-aefa-fa2a539ff69d.png">


### 2. 复制 github 代码仓库下的 callback.js 源码内容，并粘贴到 Aircode 当中

访问 [callback.js](https://github.com/seandong/ChatGPT-Wechat/blob/main/callback.js)，复制代码

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223665655-fa9ee980-8912-4415-af02-e9714ecc24b9.png">

把代码粘贴到 AirCode 默认创建的 hello.js 。

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223667199-ca3f97cf-3269-496a-ad59-62a6e4d8e4bf.png">


### 3. 安装 AirCode 项目所需依赖

点击页面左下角的包管理器，搜索并安装 `axios`、`sha1` 和 `xml2js` 依赖包。

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223668155-9448841f-6e2b-42e4-8c36-399c3ebd93e0.png">


### 4. 获取 OpenAI 的 KEY

访问 [Account API Keys - OpenAI API](https://platform.openai.com/account/api-keys) ，点击【Create new secret key】，创建一个新的 key ，并保存备用。

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223669106-89fc0215-ba21-4f92-aa20-fa7cec41c0c8.png">


### 5. 配置 AirCode 项目环境变量

你需要配置两个环境变量 `OPENAI_KEY` 、`TOKEN`，其中 `OPENAI_KEY` 填写你刚刚在 OpenAI 创建的 key，`TOKEN` 值随机填写 3 ~ 32 位字符串，并保存 `TOKEN` 值备用。

配置完成后，点击上方的 **Deploy** 按钮部署，使这些环境变量生效，并复制页面上的 URL 地址【详见下图第③步】备用。

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223671923-c6cfb417-676e-4b68-b908-d15955de9763.png">

> 此处注意保存 `TOKEN` 和 `URL` 地址

### 6. 配置微信公众号后台

登录并访问 [微信公众号后台 - 设置与开发 - 基础配置](https://mp.weixin.qq.com/) ，点击服务器配置，依次填写上一步的 `URL` 和 `Token`，选择【明文模式】，并【提交】。

<img width="1200" alt="image" src="https://user-images.githubusercontent.com/758427/223673808-ebb246c8-6651-46b9-965b-a8e7a5592c04.png">


### 7. 提交成功后，你就可以在微信公众号体验 ChatGPT 了。


## 如何贡献？

欢迎通过 issue 提交你的想法，帮助我迭代这个项目 or 直接通过 Pull Request 来提交你的代码。


## FAQ

TODO  ...

## LICENSE

[GPLv3](LICENSE)
