/**
 * 注册流式对话 IPC handler。
 *
 * @param {object} dependencies Electron 与服务依赖
 */
function registerChatHandlers({ ipcMain, services, logger }) {
  ipcMain.handle('chat:send', async (event, convId, content, agent, regenerate) => {
    if (!services.msgSvc) {
      event.sender.send('chat:error', 'Services not loaded');
      return;
    }

    const sink = new services.sinkMod.IpcSink(event);
    try {
      await services.msgSvc.sendMessage(convId, content, sink, agent, regenerate);
    } catch (err) {
      logger.error(`chat:send error: ${err.message}`);
      if (!sink.writableEnded) event.sender.send('chat:error', err.message);
    }
  });
}

module.exports = {
  registerChatHandlers,
};
