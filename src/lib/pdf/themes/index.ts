import { InvoiceTheme } from '@prisma/client';

export interface InvoiceThemeTokens {
  name: InvoiceTheme;
  title: string;
  character: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  headerBackground?: string;
  headerTextColor?: string;
  headerStyle: 'split' | 'rounded' | 'minimal' | 'ribbon' | 'classic';
  fontFamily: string;
  tableStriped: boolean;
  tableBorderWidth: string;
  borderRadius: string;
  greeting?: string;
  doubleBorder?: boolean;
}

export const THEMES: Record<InvoiceTheme, InvoiceThemeTokens> = {
  [InvoiceTheme.PROFESIONAL]: {
    name: InvoiceTheme.PROFESIONAL,
    title: 'Profesional',
    character: 'Formal, rapi, cocok untuk korporasi',
    primaryColor: '#1F3A5F', // Biru tua
    accentColor: '#E8EDF3', // Abu muda
    backgroundColor: '#FFFFFF',
    textColor: '#1E293B',
    mutedTextColor: '#64748B',
    borderColor: '#CBD5E1',
    headerStyle: 'split',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Liberation Sans', sans-serif",
    tableStriped: false,
    tableBorderWidth: '1px',
    borderRadius: '4px',
  },
  [InvoiceTheme.FAMILY]: {
    name: InvoiceTheme.FAMILY,
    title: 'Family',
    character: 'Hangat dan ramah, cocok usaha kecil atau toko',
    primaryColor: '#E07A3F', // Oranye lembut
    accentColor: '#FFF6EC', // Krem
    backgroundColor: '#FFFFFF',
    textColor: '#451A03',
    mutedTextColor: '#9A3412',
    borderColor: '#FED7AA',
    headerStyle: 'rounded',
    fontFamily: "'Nunito', 'Segoe UI', Roboto, 'Liberation Sans', sans-serif",
    tableStriped: true,
    tableBorderWidth: '1px',
    borderRadius: '10px',
    greeting: 'Terima kasih atas kepercayaan dan kerja sama Anda!',
  },
  [InvoiceTheme.MINIMALIS]: {
    name: InvoiceTheme.MINIMALIS,
    title: 'Minimalis',
    character: 'Bersih, hemat tinta',
    primaryColor: '#111111', // Hitam
    accentColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    textColor: '#111111',
    mutedTextColor: '#555555',
    borderColor: '#E5E7EB',
    headerStyle: 'minimal',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Liberation Sans', sans-serif",
    tableStriped: false,
    tableBorderWidth: '1px',
    borderRadius: '0px',
  },
  [InvoiceTheme.MODERN]: {
    name: InvoiceTheme.MODERN,
    title: 'Modern',
    character: 'Tegas dan segar',
    primaryColor: '#0F9D8A', // Hijau tosca
    accentColor: '#E6FFFA',
    backgroundColor: '#FFFFFF',
    headerBackground: '#0B1F2A', // Pita header gelap
    headerTextColor: '#FFFFFF',
    textColor: '#0F172A',
    mutedTextColor: '#475569',
    borderColor: '#CCFBF1',
    headerStyle: 'ribbon',
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Liberation Sans', sans-serif",
    tableStriped: true,
    tableBorderWidth: '1px',
    borderRadius: '6px',
  },
  [InvoiceTheme.KLASIK]: {
    name: InvoiceTheme.KLASIK,
    title: 'Klasik',
    character: 'Tradisional, berwibawa',
    primaryColor: '#1C2B4A', // Navy
    accentColor: '#7A5C1E', // Emas tua
    backgroundColor: '#FAF8F5', // Krem tua
    textColor: '#1C1917',
    mutedTextColor: '#57534E',
    borderColor: '#D6D3D1',
    headerStyle: 'classic',
    fontFamily: "'Lora', 'Georgia', 'Times New Roman', serif",
    tableStriped: false,
    tableBorderWidth: '2px',
    borderRadius: '0px',
    doubleBorder: true,
  },
};

export const THEME_TOKENS = THEMES;

export function getThemeTokens(themeName?: InvoiceTheme | string | null): InvoiceThemeTokens {
  if (themeName && themeName in THEMES) {
    return THEMES[themeName as InvoiceTheme];
  }
  return THEMES[InvoiceTheme.PROFESIONAL];
}
