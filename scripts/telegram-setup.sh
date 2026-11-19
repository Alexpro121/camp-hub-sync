#!/usr/bin/env bash
# Одноразове налаштування Telegram-бота після деплою функцій:
#  - вебхук на функцію telegram-bot із секретом (без нього бот відхиляє запити);
#  - загальне меню бота, де є лише /start (окремої команди реєстрації немає, лише посилання);
#  - кнопка меню «Відкрити» для всіх: вона відкриває Mini App, де відбувається вся робота.
#
# Використання:
#   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... TELEGRAM_WEBAPP_URL=https://<сайт> SUPABASE_URL=https://<project>.supabase.co ./scripts/telegram-setup.sh
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?Вкажіть TELEGRAM_BOT_TOKEN (токен від @BotFather)}"
: "${TELEGRAM_WEBHOOK_SECRET:?Вкажіть TELEGRAM_WEBHOOK_SECRET (той самий, що в секретах функцій)}"
: "${SUPABASE_URL:?Вкажіть SUPABASE_URL, напр. https://<project>.supabase.co}"
: "${TELEGRAM_WEBAPP_URL:?Вкажіть TELEGRAM_WEBAPP_URL — адресу Mini App}"

if ! [[ "$TELEGRAM_WEBHOOK_SECRET" =~ ^[A-Za-z0-9_-]{16,256}$ ]]; then
  echo "TELEGRAM_WEBHOOK_SECRET: 16-256 символів, лише латиниця, цифри, _ і -" >&2
  exit 1
fi

api="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
hook="${SUPABASE_URL%/}/functions/v1/telegram-bot"

post() {
  curl -fsS "$api/$1" -H 'content-type: application/json' -d "$2"
  echo
}

post setWebhook "{\"url\":\"$hook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
post setMyCommands '{"commands":[{"command":"start","description":"Почати"}]}'
post setChatMenuButton "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Відкрити\",\"web_app\":{\"url\":\"$TELEGRAM_WEBAPP_URL\"}}}"
curl -fsS "$api/getWebhookInfo"
echo
