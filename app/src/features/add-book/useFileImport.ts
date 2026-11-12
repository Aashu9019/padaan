import { useCallback, useEffect, useRef, useState } from 'react';
import { useImports } from './import-store';

function pdfFiles(list: FileList | null | undefined): File[] {
  if (!list) return [];
  // Type is only a hint (some Android pickers report ''); real validation happens on import.
  return Array.from(list).filter(
    (f) => f.type === 'application/pdf' || f.type === '' || /\.pdf$/i.test(f.name),
  );
}

/** Opens the system file picker for PDFs and queues the chosen files. */
export function usePdfPicker() {
  const enqueue = useImports((s) => s.enqueue);
  return useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.multiple = true;
    input.onchange = () => {
      const files = pdfFiles(input.files);
      if (files.length) enqueue(files);
    };
    input.click();
  }, [enqueue]);
}

/** Window-wide drag-and-drop of PDFs. Returns whether a drag is hovering. */
export function useWindowPdfDrop(onFiles?: (files: File[]) => void) {
  const enqueue = useImports((s) => s.enqueue);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = pdfFiles(e.dataTransfer?.files);
      if (files.length) {
        enqueue(files);
        onFiles?.(files);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [enqueue, onFiles]);

  return dragging;
}
