/** Ліниве завантаження PDF.js через CDN (імпорт PDF-списків і прев'ю сертифіката). */
let pdfjsLoadingPromise: Promise<any> | null = null;

export async function getPdfJsLib(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;

  if (pdfjsLoadingPromise) return pdfjsLoadingPromise;

  pdfjsLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs]');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).pdfjsLib));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.setAttribute('data-pdfjs', 'true');
    script.async = true;

    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib && lib.GlobalWorkerOptions) {
        lib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      resolve(lib);
    };

    script.onerror = () => {
      // Fallback на unpkg CDN
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
      fallbackScript.async = true;
      fallbackScript.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib && lib.GlobalWorkerOptions) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        resolve(lib);
      };
      fallbackScript.onerror = () => reject(new Error('Не вдалося завантажити бібліотеку PDF.js'));
      document.head.appendChild(fallbackScript);
    };

    document.head.appendChild(script);
  });

  return pdfjsLoadingPromise;
}
