import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import { runtime } from '../../runtime/workbench-runtime';

/** Read-only view of install / dev-server output. */
export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      fontFamily:
        getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace',
      fontSize: 12,
      lineHeight: 1.3,
      scrollback: 5_000,
      theme: {
        background: '#00000000',
        foreground: '#d4d4d8',
        cursor: '#00000000',
        selectionBackground: '#8b5cf655',
      },
      allowTransparency: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminal.write(runtime.output.snapshot());
    const unsubscribe = runtime.output.subscribe((chunk) => terminal.write(chunk));

    const observer = new ResizeObserver(() => {
      // Fitting a hidden (0-size) terminal throws inside xterm.
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      unsubscribe();
      terminal.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full px-3 py-2" />;
}
