import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { RefObject } from "react";
import { CAPTION_WINDOW } from "../constants";

export default async function ensureCaptionWindow(
  isEnsuringCaptionWindow: RefObject<boolean>,
  setIsCaptionOpen: (isCaptionOpen: boolean) => void,
) {
  if (isEnsuringCaptionWindow.current) {
    return;
  }

  isEnsuringCaptionWindow.current = true;

  try {
    const existing = await WebviewWindow.getByLabel(CAPTION_WINDOW);
    if (existing) {
      setIsCaptionOpen(true);
      return;
    }

    const captionWindow = new WebviewWindow(CAPTION_WINDOW, {
      url: '/caption',
      title: 'Exibição de versículo',
      width: 1400,
      height: 500,
      decorations: false,
      transparent: true,
      shadow: false,
    });

    captionWindow.setAlwaysOnBottom(true);

    await new Promise<void>((resolve) => {
      captionWindow.once('tauri://created', () => {
        console.log('Janela de legenda criada com sucesso');
        setIsCaptionOpen(true);
        resolve();
      });

      captionWindow.once('tauri://error', (e) => {
        console.error('Erro ao criar janela de legenda:', e);
        resolve();
      });
    });

    captionWindow.once('tauri://destroyed', () => {
      setIsCaptionOpen(false);
    });
  } finally {
    isEnsuringCaptionWindow.current = false;
  }
}