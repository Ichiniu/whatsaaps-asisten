function unwrapContainer(message) {
  if (!message) return null;

  if (message.ephemeralMessage?.message) {
    return unwrapContainer(message.ephemeralMessage.message);
  }

  if (message.viewOnceMessage?.message) {
    return unwrapContainer(message.viewOnceMessage.message);
  }

  if (message.viewOnceMessageV2?.message) {
    return unwrapContainer(message.viewOnceMessageV2.message);
  }

  return message;
}

export function extractTextFromMessage(message) {
  const msg = unwrapContainer(message);
  if (!msg) return '';

  if (msg.conversation) {
    return msg.conversation;
  }

  if (msg.extendedTextMessage?.text) {
    return msg.extendedTextMessage.text;
  }

  if (msg.imageMessage?.caption) {
    return msg.imageMessage.caption;
  }

  if (msg.videoMessage?.caption) {
    return msg.videoMessage.caption;
  }

  if (msg.protocolMessage?.editedMessage) {
    return extractTextFromMessage(msg.protocolMessage.editedMessage);
  }

  return '';
}