import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css"
import { useAppState } from "../../contexts/VerseReferenceContext";
import { ChevronLeft, ChevronRight } from "lucide-react";
import searchVerse from "../../utils/searchVerse";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Bible, VerseReference } from "../../types";
import { ABBR_TO_BOOK } from "../../constants";
import { invoke } from "@tauri-apps/api/core";
import getAdjacentVerse from "../../utils/getAdjacentVerse";
import ACF from "../../acf.json"
import getVerseByReference from "../../utils/getVerseByReference";

const CAPTION_WINDOW = 'caption-window'

function formatReferenceQuery(ref: VerseReference) {
  return `${ABBR_TO_BOOK[ref.book]} ${ref.chapter}:${ref.verse}`;
}

export default function ControlWindow() {
  const { reference, setReference, setIsCaptionOpen } = useAppState()

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VerseReference[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<Array<VerseReference>>([])
  const [pausedReference, setPausedReference] = useState<VerseReference | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const isEnsuringCaptionWindow = useRef(false);
  // Evita reentrância: se o handler de close for chamado de novo
  // enquanto já estamos fechando, não tentamos fechar a legenda 2x.
  const isClosingApp = useRef(false);

  const isPaused = reference === null && pausedReference !== null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedIndex, results]);

  async function ensureCaptionWindow() {
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

  useEffect(() => {
    ensureCaptionWindow();
  }, []);

  useEffect(() => {
    invoke('set_valor', { reference: JSON.stringify(reference) });
    ensureCaptionWindow();
  }, [reference])

  // Ao fechar a janela principal, fecha também a de legenda antes de
  // permitir que o processo/app termine.
  useEffect(() => {
    const mainWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    mainWindow.onCloseRequested(async (event) => {
      if (isClosingApp.current) {
        return;
      }
      isClosingApp.current = true;

      // Impede o fechamento imediato da principal para dar tempo
      // de fechar a legenda de forma coordenada.
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
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  function handleVerseSearch(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);

    if (pausedReference) {
      setPausedReference(null);
    }

    const found = searchVerse(value, ACF as Bible, history);

    setResults(found);
    setSelectedIndex(0);
  }

  function handleGoToAdjacentVerse(direction: 'prev' | 'next') {
    if(!reference && !results.length) {
      return
    }
    const newVerse = getAdjacentVerse(ACF as Bible, reference ?? results[selectedIndex], direction)

    if(!newVerse) {
      return
    }

    if(!reference) {
      setPausedReference(newVerse)
      setQuery(formatReferenceQuery(newVerse))
      return
    }

    setReference(newVerse)
  }

  function handleGoToAdjacentPausedVerse(direction: 'prev' | 'next') {
    if (!pausedReference) {
      return
    }

    const newVerse = getAdjacentVerse(ACF as Bible, pausedReference, direction)
    if (!newVerse) {
      return
    }

    setPausedReference(newVerse)

    const newQuery = formatReferenceQuery(newVerse);
    setQuery(newQuery);
    setResults(searchVerse(newQuery, ACF as Bible, history));
    setSelectedIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (results.length === 0) return;
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      case "ArrowUp":
        if (results.length === 0) return;
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (isPaused) {
          handleGoToAdjacentPausedVerse('prev');
        } else {
          handleGoToAdjacentVerse('prev');
        }
        break;
      case "ArrowRight":
        event.preventDefault();
        if (isPaused) {
          handleGoToAdjacentPausedVerse('next');
        } else {
          handleGoToAdjacentVerse('next');
        }
        break;
      case "Enter":
        if (results.length === 0) return;
        event.preventDefault();
        setReference(results[selectedIndex]);
        setHistory([results[selectedIndex], ...history])
        inputRef.current?.select();
        break;
      case "Escape":
        event.preventDefault();
        if (reference) {
          setPausedReference(reference);

          const newQuery = formatReferenceQuery(reference);
          setQuery(newQuery);
          setResults(searchVerse(newQuery, ACF as Bible, history));
          setSelectedIndex(0);
        }
        setReference(null);
        break;
      default:
        break;
    }
  }

  function handleSelectResult(index: number) {
    setSelectedIndex(index);
    setReference(results[index]);
    inputRef.current?.focus();
  }

  return (
    <main className="container">
      <div className="input-container">
        <div className="search-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleVerseSearch}
            onKeyDown={handleKeyDown}
            onBlur={() => inputRef.current?.focus()}
            autoFocus
          />
          {results.length > 0 && (
            <ul className="verse-results">
              {results.map((result, index) => (
                <li
                  key={`${result.book}-${result.chapter}-${result.verse}-${index}`}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  className={index === selectedIndex ? "selected" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectResult(index)}
                >
                  {ABBR_TO_BOOK[result.book]} {result.chapter}:{result.verse}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="control-container">
        <div>
          <button onClick={() => handleGoToAdjacentVerse('prev')}><ChevronLeft /></button>
          <button onClick={() => handleGoToAdjacentVerse('next')}><ChevronRight /></button>
        </div>
        <div className="verse-preview">
          <span>{
            reference
              ? 'Próximo versículo:'
              : isPaused
                ? 'Versículo pausado:'
                : (results.length ? 'Versículo selecionado:' : '')
          }</span>
          <p>{
            reference
              ? getVerseByReference(ACF as Bible, getAdjacentVerse(ACF as Bible, reference, 'next'))
              : isPaused
                ? getVerseByReference(ACF as Bible, pausedReference)
                : getVerseByReference(ACF as Bible, results[selectedIndex])
          }</p>
        </div>
      </div>
    </main>
  );
}