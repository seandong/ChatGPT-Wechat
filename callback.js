// @see https://docs.aircode.io/guide/functions/
const { db } = require('aircode');
const axios = require('axios');
const sha1 = require('sha1');
const xml2js = require('xml2js');

const TOKEN = process.env.TOKEN || '' // 微信服务器配置 Token
const OPENAI_KEY = process.env.OPENAI_KEY || ''; // OpenAI 的 Key

const OPENAI_MODEL = process.env.MODEL || "gpt-3.5-turbo"; // 使用的 AI 模型
const OPENAI_MAX_TOKEN = process.env.MAX_TOKEN || 1024; // 最大 token 的值

const LIMIT_HISTORY_MESSAGES = 50 // 限制历史会话最大条数
const CONVERSATION_MAX_AGE = 60 * 60 * 1000 // 同一会话允许最大周期，默认：1 小时
const ADJACENT_MESSAGE_MAX_INTERVAL = 10 * 60 * 1000 //同一会话相邻两条消息的最大允许间隔时间，默认：10 分钟

const UNSUPPORTED_MESSAGE_TYPES = {
  image: '暂不支持图片消息',
  voice: '暂不支持语音消息',
  video: '暂不支持视频消息',
  music: '暂不支持音乐消息',
  news: '暂不支持图文消息',
}

const WAIT_MESSAGE = `处理中 ... \n\n请稍等几秒后发送【1】查看回复`
const NO_MESSAGE = `暂无内容，请稍后回复【1】再试`
const CLEAR_MESSAGE = `✅ 记忆已清除`
const HELP_MESSAGE = `ChatGPT 指令使用指南

Usage:
    1         查看上一次问题的回复
    /clear    清除上下文
    /help     获取更多帮助
  `

const Message = db.table('messages')
const Event = db.table('events')


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function toXML(payload, content) {
  const timestamp = Date.now();
  const { ToUserName: fromUserName, FromUserName: toUserName } = payload;
  return `
  <xml>
    <ToUserName><![CDATA[${toUserName}]]></ToUserName>
    <FromUserName><![CDATA[${fromUserName}]]></FromUserName>
    <CreateTime>${timestamp}</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[${content}]]></Content>
  </xml>
  `
}


async function processCommandText({ sessionId, question }) {
  // 清理历史会话
  if (question === '/clear') {
    const now = new Date();
    await Message.where({ sessionId }).set({ deletedAt: now }).save()
    return CLEAR_MESSAGE;
  }
  else {
    return HELP_MESSAGE;
  }
}


// 构建 prompt
async function buildOpenAIPrompt(sessionId, question) {
  let prompt = [];

  // 获取最近的历史会话
  const now = new Date();
  // const earliestAt = new Date(now.getTime() - CONVERSATION_MAX_AGE)
  const historyMessages = await Message.where({
    sessionId,
    deletedAt: db.exists(false),
  //  createdAt: db.gt(earliestAt),
  }).sort({ createdAt: -1 }).limit(LIMIT_HISTORY_MESSAGES).find();

  let lastMessageTime = now;
  let tokenSize = 0;
  for (const message of historyMessages) {
    // 如果历史会话记录大于 OPENAI_MAX_TOKEN 或 两次会话间隔超过 10 分钟，则停止添加历史会话
    const timeSinceLastMessage = lastMessageTime ? lastMessageTime - message.createdAt : 0;
    if (tokenSize > OPENAI_MAX_TOKEN || timeSinceLastMessage > ADJACENT_MESSAGE_MAX_INTERVAL) {
      break
    }

    prompt.unshift({ role: 'assistant', content: message.answer, });
    prompt.unshift({ role: 'user', content: message.question, });
    tokenSize += message.token;
    lastMessageTime = message.createdAt;
  }

  prompt.push({ role: 'user', content: question });
  return prompt;
}


// 获取 OpenAI API 的回复
async function getOpenAIReply(prompt) {
  const data = JSON.stringify({
    model: OPENAI_MODEL,
    messages: prompt
  });

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    data: data,
    timeout: 50000
  };


  try {
      const response = await axios(config);
      console.debug(`[OpenAI response] ${response.data}`);
      if (response.status === 429) {
        return {
          error: '问题太多了，我有点眩晕，请稍后再试'
        }
      }
      // 去除多余的换行
      return {
        answer: response.data.choices[0].message.content.replace("\n\n", ""),
      }
  } catch(e){
     console.error(e.response.data);
     return {
      error: "问题太难了 出错了. (uДu〃).",
    }
  }

}

// 处理文本回复消息
async function replyText(message) {
  const { question, sessionId, msgid } = message;

  // 检查是否是重试操作
  if (question === '1') {
    const now = new Date();
    // const earliestAt = new Date(now.getTime() - CONVERSATION_MAX_AGE)
    const lastMessage = await Message.where({
      sessionId,
      deletedAt: db.exists(false),
    //  createdAt: db.gt(earliestAt),
    }).sort({ createdAt: -1 }).findOne();
    if (lastMessage) {
      return `${lastMessage.question}\n------------\n${lastMessage.answer}`;
    }

    return NO_MESSAGE;
  }

  // 发送指令
  if (question.startsWith('/')) {
    return await processCommandText(message);
  }

  // OpenAI 回复内容
  const prompt = await buildOpenAIPrompt(sessionId, question);
  const { error, answer } = await getOpenAIReply(prompt);
  console.debug(`[OpenAI reply] sessionId: ${sessionId}; prompt: ${prompt}; question: ${question}; answer: ${answer}`);
  if (error) {
    console.error(`sessionId: ${sessionId}; question: ${question}; error: ${error}`);
    return error;
  }

  // 保存消息
  const token = question.length + answer.length;
  const result = await Message.save({ token, answer, ...message });
  console.debug(`[save message] result: ${result}`);

  return answer;
}


// 验证是否是重复推送事件
async function checkEvent(payload) {
  const eventId = payload.MsgId;
  const count = await Event.where({ eventId }).count();
  if (count != 0) {
    return true;
  }

  await Event.save({ eventId, payload });
  return false;
}


// 处理微信事件消息
module.exports = async function(params, context) {
  const requestId = context.headers['x-aircode-request-id'];

  // 签名验证
  if (context.method === 'GET') {
    const _sign = sha1(new Array(TOKEN, params.timestamp, params.nonce).sort().join(''))
    if (_sign !== params.signature) {
      context.status(403)
      return 'Forbidden'
    }

    return params.echostr
  }

  // 解析 XML 数据
  let payload;
  xml2js.parseString(params, { explicitArray: false }, function(err, result) {
    if (err) {
      console.error(`[${requestId}] parse xml error: `, err);
      return
    }
    payload = result.xml;
  })
  console.debug(`[${requestId}] payload: `, payload);

  // 验证是否为重复推送事件
  const duplicatedEvent = await checkEvent(payload);
  if (duplicatedEvent) {
    console.error(`[${requestId}] duplicate payload: `, payload);
    return '';
  }

  // 文本
  if (payload.MsgType === 'text') {
    const newMessage = {
      msgid: payload.MsgId,
      question: payload.Content.trim(),
      username: payload.FromUserName,
      sessionId: payload.FromUserName,
    }

    // 修复请求响应超时问题：如果 5 秒内 AI 没有回复，则返回等待消息
    const responseText = await Promise.race([
      replyText(newMessage),
      sleep(4000.0).then(() => WAIT_MESSAGE),
    ]);
    return toXML(payload, responseText);
  }

  // 事件
  if (payload.MsgType === 'event') {
    // 公众号订阅
    if (payload.Event === 'subscribe') {
      return toXML(payload, HELP_MESSAGE);
    }
  }

  // 暂不支持的消息类型
  if (payload.MsgType in UNSUPPORTED_MESSAGE_TYPES) {
    const responseText = UNSUPPORTED_MESSAGE_TYPES[payload.MsgType];
    return toXML(payload, responseText);
  }

  return 'success'
}