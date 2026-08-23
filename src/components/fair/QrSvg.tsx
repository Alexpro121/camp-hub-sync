import { memo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const DEFAULT_LOGO_URL = 'https://www.ironsquad.org.ua/img/logo-zz.svg';

interface Props {
  value: string;
  size?: number;
  className?: string;
  level?: 'L' | 'M' | 'Q' | 'H';
  bgColor?: string;
  fgColor?: string;
  includeMargin?: boolean;
  includeLogo?: boolean;
  logoSrc?: string;
}

/**
 * Векторний SVG-рендер QR-кодів із брендовим логотипом "Залізна Зміна" в центрі.
 * Рівень корекції помилок 'H' (30%) забезпечує стабільне та миттєве сканування.
 */
const QrSvg = memo(({ 
  value, 
  size = 210, 
  className,
  level = 'H', // Максимальний рівень корекції для безпомилкового сканування з логотипом
  bgColor = '#ffffff',
  fgColor = '#0B0D13',
  includeMargin = true,
  includeLogo = true,
  logoSrc = DEFAULT_LOGO_URL,
}: Props) => {
  if (!value) return null;

  // Пропорційний розмір логотипа (~22% від ширини QR)
  const logoSize = Math.round(size * 0.22);

  const imageSettings = includeLogo ? {
    src: logoSrc,
    height: logoSize,
    width: logoSize,
    excavate: true, // Створює чіткий виріз під логотипом для оптичного контрасту
  } : undefined;

  return (
    <div className="relative inline-flex items-center justify-center p-2.5 rounded-2xl bg-white shadow-md border border-slate-200/80 overflow-hidden select-none">
      <QRCodeSVG
        value={value}
        size={size}
        level={level}
        marginSize={includeMargin ? 1 : 0}
        bgColor={bgColor}
        fgColor={fgColor}
        className={className}
        imageSettings={imageSettings}
        aria-label="QR-код для сканування"
        role="img"
      />
    </div>
  );
});

QrSvg.displayName = 'QrSvg';

export default QrSvg;
