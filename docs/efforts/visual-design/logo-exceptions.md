# Visual Design Logo Exceptions

Owner: Team Lead

## TASK-vd-load-split Logo Exceptions

At both 512x512 and 1024x1024 RGBA raster sizes, no more than 0.5% of pixels may have a maximum channel delta greater than 16/255, and no pixel may have a maximum channel delta greater than 64/255. This is the approved visual tolerance for changed files.

The 134-file light and dark set totals 2,113,222 B raw / 734,615 B gzip before this pass and 2,039,309 B raw / 713,361 B gzip after it. The `microfinance-4.svg` and `microfinance-4-dark.svg` brand copies are excluded from SVGO and remain byte-identical to the geometric originals per the catalog contract. The 32 files still above 20,000 bytes after the additional safe SVGO pass are recorded below. Six are retained at their best tolerance-passing SVGO candidate; the other 26 retain their original bytes because no candidate passed the approved raster tolerance. Reducing these files further requires visible geometry simplification and an owner decision. No manual geometry or color changes are included in TASK-vd-load-split.

| Brand logo | Raw bytes | Gzip bytes | Follow-up reason |
| --- | ---: | ---: | --- |
| `banks-4-dark.svg` | 22,001 | 9,060 | needs visible geometry simplification |
| `banks-4.svg` | 22,001 | 9,060 | needs visible geometry simplification |
| `banks-5-dark.svg` | 82,788 | 20,615 | needs visible geometry simplification |
| `banks-5.svg` | 82,788 | 20,615 | needs visible geometry simplification |
| `commerce-4-dark.svg` | 56,044 | 20,894 | needs visible geometry simplification |
| `commerce-4.svg` | 56,044 | 20,894 | needs visible geometry simplification |
| `commerce-6-dark.svg` | 63,012 | 24,538 | needs visible geometry simplification |
| `commerce-6.svg` | 63,012 | 24,538 | needs visible geometry simplification |
| `energy-1-dark.svg` | 53,461 | 18,204 | needs visible geometry simplification |
| `energy-1.svg` | 53,461 | 18,204 | needs visible geometry simplification |
| `energy-2-dark.svg` | 33,726 | 11,177 | needs visible geometry simplification |
| `energy-2.svg` | 33,726 | 11,608 | needs visible geometry simplification |
| `fuel-4-dark.svg` | 57,933 | 16,573 | needs visible geometry simplification |
| `fuel-4.svg` | 57,933 | 16,573 | needs visible geometry simplification |
| `groceries-1-dark.svg` | 44,478 | 13,715 | needs visible geometry simplification |
| `groceries-1.svg` | 44,478 | 13,715 | needs visible geometry simplification |
| `insurance-6-dark.svg` | 58,574 | 18,139 | needs visible geometry simplification |
| `insurance-6.svg` | 58,574 | 18,139 | needs visible geometry simplification |
| `media-2-dark.svg` | 81,577 | 28,072 | needs visible geometry simplification |
| `media-2.svg` | 81,577 | 28,072 | needs visible geometry simplification |
| `media-3-dark.svg` | 23,543 | 8,901 | needs visible geometry simplification |
| `media-3.svg` | 23,543 | 8,901 | needs visible geometry simplification |
| `microfinance-2-dark.svg` | 41,762 | 15,719 | needs visible geometry simplification |
| `microfinance-2.svg` | 41,762 | 15,719 | needs visible geometry simplification |
| `microfinance-3-dark.svg` | 30,966 | 10,576 | needs visible geometry simplification |
| `microfinance-3.svg` | 30,966 | 10,576 | needs visible geometry simplification |
| `microfinance-6-dark.svg` | 35,541 | 12,779 | needs visible geometry simplification |
| `microfinance-6.svg` | 35,541 | 12,779 | needs visible geometry simplification |
| `technology-5-dark.svg` | 25,983 | 8,298 | needs visible geometry simplification |
| `technology-5.svg` | 25,983 | 8,376 | needs visible geometry simplification |
| `telecom-3-dark.svg` | 37,859 | 12,167 | needs visible geometry simplification |
| `telecom-3.svg` | 37,859 | 12,167 | needs visible geometry simplification |
