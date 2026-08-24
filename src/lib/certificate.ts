import certificateAsset from '@/assets/certificate-template.pdf.asset.json';

export const CERTIFICATE_TEMPLATE = certificateAsset.url;

export const validateCertificateName = (orig: string, next: string): boolean => {
  return orig.trim().toLowerCase() === next.trim().toLowerCase();
};

export const renderCertificateCanvas = async (
  name: string,
  img: HTMLImageElement | null
): Promise<string | null> => {
  // Placeholder for future canvas rendering.
  void name;
  void img;
  return null;
};

