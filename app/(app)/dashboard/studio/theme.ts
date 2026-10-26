// AG Studio theme for the Quotely dashboard (docs/design-system.md, "Studio theme"). Values are the
// design tokens from app/globals.css, written out because some of them reach canvas-drawn charts,
// where CSS variables don't resolve.

import { studioTheme } from 'ag-studio';

export const MANROPE = '"Manrope", system-ui, sans-serif';
export const PLEX_MONO = '"IBM Plex Mono", ui-monospace, monospace';

const t = {
  base: '#080D0F',
  shell: '#0D1416',
  surface1: '#111B1D',
  surface2: '#172426',
  surface3: '#203032',
  border: '#2B3B3E',
  borderStrong: '#3F5558',
  text: '#F3F7F4',
  text2: '#B8C8C6',
  text3: '#819593',
  accent: '#C5FA82',
  danger: '#FF8C91',
};

// Series colours in the order Studio hands them out (first series, second, ...). Teal (deposits)
// and lime (balances) come first so that every two-series money chart reads the same way: the
// cash-movement line and the payment donut. See the milestone 5 notes for why this differs from
// the order listed in the design doc.
const SERIES = ['#69DBBE', '#C5FA82', '#8FAEFF', '#BB9BFF', '#FFC66D', '#FF8C91'];
const palette = Object.fromEntries(
  SERIES.flatMap((color, i) => [
    [`chartPaletteFills${i + 1}Color`, color],
    [`chartPaletteStrokes${i + 1}Color`, color],
  ]),
);

export const quotelyStudioTheme = studioTheme.withParams({
  // Shared by Studio's chrome, grids and charts.
  backgroundColor: t.base,
  // chromeBackgroundColor is not settable in Studio 3.0 (EXCLUDED_SHARED_THEME_PARAM_KEYS); the shell
  // colour goes on the panel containers below instead.
  foregroundColor: t.text,
  textColor: t.text,
  subtleTextColor: t.text3,
  accentColor: t.accent,
  borderColor: t.border,
  borderRadius: 10,
  fontFamily: MANROPE,
  fontSize: 13,
  browserColorScheme: 'dark',
  iconColor: t.text2,
  rowHoverColor: t.surface3,
  invalidColor: t.danger,
  menuBackgroundColor: t.surface2,
  menuBorder: { width: 1, color: t.border },
  menuTextColor: t.text,
  tooltipBackgroundColor: t.surface2,
  tooltipTextColor: t.text,
  tooltipBorder: { width: 1, color: t.border },

  // Canvas: the page background, no frame.
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: t.base,
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: t.base,
  studioCanvasPadding: 12,
  studioCanvasRowHeight: 16,
  studioCanvasFontFamily: MANROPE,

  // Widgets are the app's cards: surface-1, 1px border, 14px radius, 18px padding.
  studioWidgetBackgroundColor: t.surface1,
  studioWidgetBorder: { width: 1, color: t.border },
  studioWidgetBorderRadius: 14,
  studioWidgetPadding: 18,
  studioWidgetTitleFontFamily: MANROPE,
  studioWidgetTitleFontSize: 14,
  studioWidgetTitleFontWeight: 700,
  studioWidgetTitleTextColor: t.text,
  studioWidgetSubtitleFontFamily: MANROPE,
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: t.text3,
  studioWidgetCaptionFontFamily: MANROPE,
  studioWidgetCaptionFontSize: 11,
  studioWidgetCaptionTextColor: t.text3,
  studioWidgetResizeBorderColor: t.accent,
  studioWidgetToolbarBackgroundColor: t.surface2,
  studioWidgetToolbarBorder: { width: 1, color: t.border },
  studioWidgetToolbarButtonColor: t.text2,
  studioWidgetToolbarButtonHoverBackgroundColor: t.surface3,
  studioWidgetLoadingOverlayBackgroundColor: t.surface1,
  studioWidgetNoDataOverlayBackgroundColor: t.surface1,

  // Edit-mode panels.
  studioPanelWidth: 280,
  studioPanelGroupBackgroundColor: t.surface2,
  studioPanelContainerBackgroundColor: t.shell,
  studioPanelContainerBorder: { width: 1, color: t.border },
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: t.border,
  studioPanelDividerActiveColor: t.accent,
  studioPanelSectionBorderColor: t.border,
  studioPanelHeaderFontFamily: MANROPE,
  studioPanelHeaderFontWeight: 700,
  studioPanelChevronButtonHoverBackgroundColor: t.surface3,
  studioPanelChevronButtonHoverColor: t.accent,
  studioToggleButtonActiveBackgroundColor: '#273F28',
  studioToggleButtonActiveBorderColor: t.accent,
  studioToggleButtonActiveColor: t.accent,

  // Grid widgets.
  gridFontFamily: MANROPE,
  gridFontSize: 13,
  gridDataBackgroundColor: t.surface1,
  gridOddRowBackgroundColor: t.surface1,
  gridHeaderBackgroundColor: t.surface2,
  gridHeaderTextColor: t.text3,
  gridHeaderFontWeight: 650,
  gridHeaderFontSize: 12,
  gridCellTextColor: t.text,
  gridRowHeight: 44,
  gridRowBorder: { width: 1, color: t.border },
  gridHeaderRowBorder: { width: 1, color: t.border },
  gridRowHoverColor: t.surface3,
  gridWrapperBorder: false,

  // Charts.
  chartFontFamily: MANROPE,
  chartFontSize: 12,
  chartTextColor: t.text2,
  chartSubtleTextColor: t.text3,
  chartAxisLineColor: t.border,
  chartGridLineColor: t.border,
  chartTooltipBackgroundColor: t.surface2,
  chartTooltipTextColor: t.text,
  chartTooltipBorder: { width: 1, color: t.border },
  chartBorderColor: t.border,
  chartAccentColor: t.accent,
  ...palette,
});
