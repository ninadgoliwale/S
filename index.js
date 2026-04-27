import http from "node:http";

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN environment variable is required");
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const HELP_MESSAGE = [
  "@SHAYAMxESCROW Fee Calculator",
  "",
  "Send a deal amount and I will calculate the escrow fee.",
  "",
  "Examples:",
  "/fee 500",
  "/calc 2500",
  "500",
  "",
  "Charges:",
  "Under Rs 190 = Rs 5",
  "Rs 190 to Rs 599 = Rs 10",
  "Rs 600 to Rs 2000 = 3.5%",
  "Rs 2001 to Rs 3000 = 3%",
  "Above Rs 3000 = 3%",
].join("\n");

let offset = 0;

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("SHAYAMxESCROW Fee Calculator Bot is running");
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });
  server.listen(PORT, () => {
    console.log(`Health server listening on port ${PORT}`);
  });
}

function calculateFee(amount) {
  if (amount < 190) return 5;
  if (amount <= 599) return 10;
  if (amount <= 2000) return amount * 0.035;
  return amount * 0.03;
}

function formatRupees(value) {
  const rounded = Math.ceil(value * 100) / 100;
  return Number.isInteger(rounded) ? `Rs ${rounded}` : `Rs ${rounded.toFixed(2)}`;
}

function extractAmount(text) {
  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  return match ? Number(match[1]) : null;
}

function buildCalculationMessage(amount) {
  const fee = calculateFee(amount);
  const total = amount + fee;
  return [
    `Deal Amount: ${formatRupees(amount)}`,
    `Escrow Fee: ${formatRupees(fee)}`,
    `Total Payable: ${formatRupees(total)}`,
  ].join("\n");
}

async function telegram(method, payload) {
  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

async function sendMessage(chatId, text, replyToMessageId) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId,
    disable_web_page_preview: true,
  });
}

function shouldRespond(message) {
  if (!message || !message.text || !message.chat) return false;
  return ["private", "group", "supergroup"].includes(message.chat.type);
}

async function handleMessage(message) {
  if (!shouldRespond(message)) return;
  const text = message.text.trim();
  const chatId = message.chat.id;
  const replyToMessageId = message.message_id;

  if (text === "/start" || text === "/help" || text.startsWith("/start@") || text.startsWith("/help@")) {
    await sendMessage(chatId, HELP_MESSAGE, replyToMessageId);
    return;
  }

  const commandMatch = text.match(/^\/(?:fee|fees|calc|calculate)(?:@\w+)?(?:\s+(.+))?$/i);
  if (commandMatch) {
    const amount = commandMatch[1] ? extractAmount(commandMatch[1]) : null;
    if (!amount || amount <= 0) {
      await sendMessage(chatId, "Send the deal amount like /fee 500", replyToMessageId);
      return;
    }
    await sendMessage(chatId, buildCalculationMessage(amount), replyToMessageId);
    return;
  }

  if (message.chat.type === "private") {
    const amount = extractAmount(text);
    if (amount && amount > 0) {
      await sendMessage(chatId, buildCalculationMessage(amount), replyToMessageId);
    } else {
      await sendMessage(chatId, HELP_MESSAGE, replyToMessageId);
    }
  }
}

async function poll() {
  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: 50,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleMessage(update.message);
      }
    } catch (error) {
      console.error(error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

startHealthServer();
poll();