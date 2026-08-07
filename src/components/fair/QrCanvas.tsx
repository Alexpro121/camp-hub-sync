import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size?: number;
  className?: string;
  /** Light background is required for reliable camera scanning. */
  dark?: string;
  light?: string;
}

const QrCanvas = ({ value, size = 220, className, dark = '#0b0b0c', light = '#ffffff' }: Props) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !value) return;
    let cancelled = false;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark, light },
    }).catch(() => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    return () => { cancelled = true; };
  }, [value, size, dark, light]);

  return <canvas ref={ref} width={size} height={size} className={className} aria-label="QR-код оплати" />;
};

export default QrCanvas;