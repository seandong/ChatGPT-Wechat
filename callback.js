// @see https://docs.aircode.io/guide/functions/
const aircode = require('aircode');
const axios = require('axios');
const sha1 = require('sha1');
const xml2js = require('xml2js');

const TOKEN = process.env.TOKEN || ''
const APP_ID = process.env.APP_ID || ''
const APP_SECRET = process.env.APP_SECRET || ''
const ENCODING_AES_KEY = process.env.ENCODING_AES_KEY || ''
const OPENAI_KEY = process.env.OPENAI_KEY || ""; // OpenAI 的 Key
const OPENAI_MODEL = process.env.MODEL || "gpt-3.5-turbo"; // 使用的模型
const OPENAI_MAX_TOKEN = process.env.MAX_TOKEN || 1024; // 最大 token 的值

const UNSUPPORTED_MESSAGE_TYPES = {
  image: '暂不支持图片消息',
  voice: '暂不支持语音消息',
  video: '暂不支持视频消息',
  music: '暂不支持音乐消息',
  news: '暂不支持图文消息',
}

const CLEAR_MESSAGE = `✅ 记忆已清除`
const HELP_MESSAGE = `ChatGPT 指令使用指南

Usage:
    /clear    清除上下文
    /help     获取更多帮助
  `

const Message = aircode.db.table('messages')
const Event = aircode.db.table('events')


function responseText({ FromUserName: to, ToUserName: from }, content) {
  const timestamp = Date.now();
  return `
  <xml>
    <ToUserName><![CDATA[${to}]]></ToUserName>
    <FromUserName><![CDATA[${from}]]></FromUserName>
    <CreateTime>${timestamp}</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[${content}]]></Content>
  </xml>
  `
}


async function processCMD(msgid, fromUser, question) {
  let content;

  //TODO: 清理历史消息
  if (question === '/clear') {
    content = CLEAR_MESSAGE;
  }
  else {
    content = HELP_MESSAGE;
  }
  return content;
}

async function buildPrompt(msgid, fromUser, question) {
  const messages = await Message.where({ from_user: fromUser }).find();

  // {"role": "system", "content": "You are a helpful assistant."},
  return messages.map(conversation => ({
    role: 'user',
    content: conversation.question,
  })).concat({ role: 'user', content: question });
}

// 保存用户会话
async function saveMessage(msgid, fromUser, question, answer) {
  const token = question.length + answer.length
  const result = await Message.save({
    msgid,
    question,
    answer,
    token,
    from_user: fromUser,
  });
  if (result) {
    // 如果历史会话记录大于OPENAI_MAX_TOKEN，则从第一条开始抛弃超过限制的对话
    let total = 0;
    const historyMessages = await Message.where({ from_user: fromUser }).sort({ createdAt: -1 }).find();
    for (const { _id, token } of historyMessages) {
      if (total > OPENAI_MAX_TOKEN) {
        await Message.where({ _id }).delete();
      }
      total += token;
    }
  }
}


// 获取 OpenAI API 答案
async function fetchOpenAIAnswer(prompt) {
  var data = JSON.stringify({
    model: OPENAI_MODEL,
    messages: prompt
  });

  var config = {
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
      if (response.status === 429) {
        return '问题太多了，我有点眩晕，请稍后再试';
      }
      // 去除多余的换行
      return response.data.choices[0].message.content.replace("\n\n", "");

  } catch(e){
     console.error(e.response.data)
     return "问题太难了 出错了. (uДu〃).";
  }

}

// 处理文本回复消息
async function replyText(requestId, { FromUserName: fromUser, MsgId: msgid, Content: content }) {
  const question = content.trim()

  // 发送指令
  if (question.startsWith('/')) {
    return processCMD(msgid, fromUser, question);
  }

  const prompt = await buildPrompt(msgid, fromUser, question);
  const answer = await fetchOpenAIAnswer(prompt);
  await saveMessage(msgid, fromUser, question, answer);
  console.debug(`[${requestId}] question: ${question};  answer: ${answer}`);
  return answer;
}


async function duplicateEvent(message) {
  const { MsgId: eventId } = message;
  const count = await Event.where({ event_id: eventId }).count();
  if (count != 0) {
    return true;
  }

  await Event.save({ event_id: eventId, message: message });
  return false;
}


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
  let message;
  xml2js.parseString(params, { explicitArray: false }, function(err, result) {
    message = result.xml
  })
  console.log(`[${requestId}] message: `, message);

  // 验证是否为重复推送事件
  if (await duplicateEvent(message)) {
    console.debug(`[${requestId}] duplicate message: `, message);

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // 尝试检查 10 次历史消息是否已处理完
    for (let i=0; i < 10; i++) {
      const _message = await Message.where({ msgid: message.MsgId }).sort({ createdAt: -1 }).findOne();
      if (_message) {
        return responseText(message, _message.answer)
      }
      await sleep(500.0)
    }
  }

  // 处理文本消息
  if (message.MsgType === 'text') {
    const content = await replyText(requestId, message);
    return responseText(message, content);
  }

  // 暂不支持的消息
  if (message.MsgType in UNSUPPORTED_MESSAGE_TYPES) {
    return responseText(
      message,
      UNSUPPORTED_MESSAGE_TYPES[message.MsgType],
    )
  }
  return 'success'
}
