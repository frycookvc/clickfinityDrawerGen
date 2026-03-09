// ============================================================
// Constants
// ============================================================
const GRID_PITCH = 42.0;
const PANEL_BORDER_TOTAL = 13.0;
const PANEL_BORDER_HALF = 6.5;
const MAX_PRINT_BED = 256.0;
const PANEL_Z_MIN = -2.0;
const PANEL_Z_MAX = 2.0;
const JOINER_HALF_LEN = 3.29; // half of 6.58mm short-axis
const JOINER_LONG_HALF = 16.9; // half of 33.8mm long-axis
const JOINER_TAB_INTRUSION = JOINER_LONG_HALF - (GRID_PITCH - PANEL_BORDER_TOTAL) / 2; // 2.4mm
