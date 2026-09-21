// The subset of the Telegram Bot API this bot actually reads. Fields we do
// not use are left out on purpose: an update that carries something else is
// ignored rather than mis-parsed.

export type TelegramChat={id:number};
export type TelegramFrom={id:number;username?:string|null};

export type TelegramMessage={
 message_id:number;
 chat:TelegramChat;
 from?:TelegramFrom;
 text?:string;
 /** A voice note. The bytes are fetched separately by file_id. */
 voice?:{file_id:string;duration:number};
};

export type TelegramCallbackQuery={
 id:string;
 data?:string;
 from:TelegramFrom;
 message?:{message_id:number;chat:TelegramChat};
};

export type TelegramUpdate={
 update_id:number;
 message?:TelegramMessage;
 edited_message?:TelegramMessage;
 callback_query?:TelegramCallbackQuery;
};

export type InlineButton={text:string;callback_data:string};
/** Rows of buttons. Telegram caps callback_data at 64 bytes. */
export type InlineKeyboard=InlineButton[][];
