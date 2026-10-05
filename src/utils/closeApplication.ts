import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CloseRequestedEvent, Window } from "@tauri-apps/api/window";
import { RefObject } from "react";
import { CAPTION_WINDOW } from "../constants";

export default async function closeApplication(
  mainWindow: Window,
  event: CloseRequestedEvent,
  isClosingApp: RefObject<boolean>,
) {
  if (isClosingApp.current) {
    return;
  }
  isClosingApp.current = true;

  event.preventDefault();

  try {
    const captionWindow = await WebviewWindow.getByLabel(CAPTION_WINDOW);
    if (captionWindow) {
      await captionWindow.close();
    }
  } catch (e) {
    console.error('Erro ao fechar janela de legenda:', e);
  } finally {
    await mainWindow.destroy();
  }
}