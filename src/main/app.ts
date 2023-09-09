import { app, ipcMain, shell } from 'electron';
import { resolve } from 'path';
import { logError } from './log';
import { shortcutInstance } from './shortcut';
import { windowInstance } from './window';

export interface AppBeforeOptions {
  /**
   * 包含要发送到第一实例的附加数据的 JSON 对象
   */
  additionalData?: any;
  /**
   * 后续实例启动时是否聚焦到第一实例
   */
  isFocusMainWin?: boolean;
}

/**
 * 协议注册 (需appReday之前)
 * @param appName 协议名称(默认应用名称)
 */
export const appProtocolRegister = (appName?: string) => {
  let argv = [];
  if (!app.isPackaged) argv.push(resolve(process.argv[1]));
  argv.push('--');
  if (!app.isDefaultProtocolClient(appName || app.name, process.execPath, argv))
    app.setAsDefaultProtocolClient(appName || app.name, process.execPath, argv);
};

/**
 * appReday之前监听
 * @param options
 */
export const appBeforeOn = (options: AppBeforeOptions) => {
  // 默认单例根据自己需要改
  if (!app.requestSingleInstanceLock(options?.additionalData)) app.quit();
  else {
    app.on('second-instance', (event, argv) => {
      //是否多窗口聚焦到第一实例
      if (options?.isFocusMainWin) {
        const main = windowInstance.getMain();
        if (main) {
          if (main.isMinimized()) main.restore();
          main.show();
          main.focus();
        }
        return;
      }
      const win = windowInstance.create(
        {
          ...windowInstance.defaultCustomize,
          argv
        },
        windowInstance.defaultBrowserWindowOptions
      );
      win && windowInstance.load(win).catch(logError);
    });
  }
  // 渲染进程崩溃监听
  app.on('render-process-gone', (event, webContents, details) =>
    logError(
      '[render-process-gone]',
      webContents.getTitle(),
      webContents.getURL(),
      JSON.stringify(details)
    )
  );
  // 子进程崩溃监听
  app.on('child-process-gone', (event, details) =>
    logError('[child-process-gone]', JSON.stringify(details))
  );
  // 关闭所有窗口退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
};

/**
 * appReday之后监听
 * @param options
 */
export const appOn = () => {
  // darwin
  app.on('activate', () => {
    if (windowInstance.getAll().length === 0) {
      const win = windowInstance.create(
        windowInstance.defaultCustomize,
        windowInstance.defaultBrowserWindowOptions
      );
      win && windowInstance.load(win).catch(logError);
    }
  });
  // 获得焦点时发出
  app.on('browser-window-focus', () => {
    // 关闭刷新
    shortcutInstance.register({
      name: '关闭刷新',
      key: 'CommandOrControl+R',
      callback: () => {}
    });
  });
  // 失去焦点时发出
  app.on('browser-window-blur', () => {
    // 注销关闭刷新
    shortcutInstance.unregister('CommandOrControl+R');
  });
  //app常用信息
  ipcMain.handle('app-info-get', (event, args) => {
    return {
      name: app.name,
      version: app.getVersion()
    };
  });
  //app常用获取路径
  ipcMain.handle('app-path-get', (event, args) => {
    return app.getPath(args);
  });
  //app打开外部url
  ipcMain.handle('app-open-url', async (event, args) => {
    return await shell.openExternal(args);
  });
  //app退出
  ipcMain.on('app-quit', (event, args) => {
    app.quit();
  });
  //app重启
  ipcMain.on('app-relaunch', (event, args) => {
    app.relaunch({ args: process.argv.slice(1) });
    if (args) app.exit(0);
  });
};
