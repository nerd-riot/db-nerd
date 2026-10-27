import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatByteSize, parseSizeToBytes } from '../src/lib/memory/memoryGuard.ts';

describe('Table Size Formatting & Byte Sorting', () => {
  describe('formatByteSize', () => {
    it('formats 0 or falsy inputs properly', () => {
      assert.equal(formatByteSize(0), '0 bytes');
      assert.equal(formatByteSize(null as any), '--');
      assert.equal(formatByteSize(undefined as any), '--');
      assert.equal(formatByteSize('--'), '--');
      assert.equal(formatByteSize(NaN), '0 bytes');
      assert.equal(formatByteSize(-500), '0 bytes');
    });

    it('formats exact byte counts under 1024 as bytes', () => {
      assert.equal(formatByteSize(512), '512 bytes');
      assert.equal(formatByteSize(1023), '1023 bytes');
    });

    it('formats KB sizes cleanly like TablePlus', () => {
      assert.equal(formatByteSize(1024), '1 KB');
      assert.equal(formatByteSize(8192), '8 KB');
      assert.equal(formatByteSize(98304), '96 KB');
      assert.equal(formatByteSize(952 * 1024), '952 KB');
    });

    it('formats MB sizes with clean whole or decimal numbers', () => {
      assert.equal(formatByteSize(8 * 1024 * 1024), '8 MB');
      assert.equal(formatByteSize(834 * 1024 * 1024), '834 MB');
      assert.equal(formatByteSize(950 * 1024 * 1024), '950 MB');
      assert.equal(formatByteSize(995 * 1024 * 1024), '995 MB');
    });

    it('formats GB sizes with 2 decimal places matching TablePlus', () => {
      // 5.94 GB = 5.94 * 1024^3 = 6,378,041,344 bytes
      const bytes594GB = Math.round(5.94 * 1024 * 1024 * 1024);
      assert.equal(formatByteSize(bytes594GB), '5.94 GB');

      // 1.04 GB = 1.04 * 1024^3 = 1,116,691,497 bytes
      const bytes104GB = Math.round(1.04 * 1024 * 1024 * 1024);
      assert.equal(formatByteSize(bytes104GB), '1.04 GB');
    });
  });

  describe('parseSizeToBytes', () => {
    it('parses empty or invalid strings to 0', () => {
      assert.equal(parseSizeToBytes(''), 0);
      assert.equal(parseSizeToBytes('--'), 0);
      assert.equal(parseSizeToBytes('null'), 0);
    });

    it('parses bytes units', () => {
      assert.equal(parseSizeToBytes('0 bytes'), 0);
      assert.equal(parseSizeToBytes('8192 bytes'), 8192);
      assert.equal(parseSizeToBytes('500 b'), 500);
    });

    it('parses KB and kB units', () => {
      assert.equal(parseSizeToBytes('96 KB'), 96 * 1024);
      assert.equal(parseSizeToBytes('96 kB'), 96 * 1024);
      assert.equal(parseSizeToBytes('9336 kB'), 9336 * 1024);
    });

    it('parses MB and GB units with decimals', () => {
      assert.equal(parseSizeToBytes('834 MB'), 834 * 1024 * 1024);
      assert.equal(parseSizeToBytes('995 MB'), 995 * 1024 * 1024);
      assert.equal(parseSizeToBytes('1.04 GB'), Math.round(1.04 * 1024 * 1024 * 1024));
      assert.equal(parseSizeToBytes('5.94 GB'), Math.round(5.94 * 1024 * 1024 * 1024));
    });
  });

  describe('Numeric Table Sorting vs Alphabetical Sorting', () => {
    const rawTables = [
      { name: 'orders', total_size: '5.94 GB', total_bytes: 6378041344 },
      { name: 'trade_orders', total_size: '1.04 GB', total_bytes: 1116691497 },
      { name: 'status_logs', total_size: '950 MB', total_bytes: 996147200 },
      { name: 'commission_calculation_configs', total_size: '96 KB', total_bytes: 98304 },
      { name: 'empty_table', total_size: '0 bytes', total_bytes: 0 },
    ];

    it('demonstrates why string comparison broke sort order', () => {
      // In ASCII/Unicode: '9' (0x39) > '5' (0x35) > '1' (0x31)
      const buggyStringSort = [...rawTables].sort((a, b) =>
        b.total_size.toLowerCase().localeCompare(a.total_size.toLowerCase())
      );
      // Buggy sort puts 96 KB and 950 MB before 5.94 GB because '9' > '5'!
      assert.equal(buggyStringSort[0].name, 'commission_calculation_configs'); // '96 kb'
    });

    it('correctly sorts descending by byte size using total_bytes and parseSizeToBytes', () => {
      const properByteSort = [...rawTables].sort((a, b) => {
        const bytesA = a.total_bytes ?? parseSizeToBytes(a.total_size);
        const bytesB = b.total_bytes ?? parseSizeToBytes(b.total_size);
        return bytesB - bytesA;
      });

      assert.deepEqual(
        properByteSort.map((t) => t.name),
        [
          'orders', // 5.94 GB
          'trade_orders', // 1.04 GB
          'status_logs', // 950 MB
          'commission_calculation_configs', // 96 KB
          'empty_table', // 0 bytes
        ]
      );
    });

    it('correctly sorts ascending by byte size', () => {
      const properAscSort = [...rawTables].sort((a, b) => {
        const bytesA = a.total_bytes ?? parseSizeToBytes(a.total_size);
        const bytesB = b.total_bytes ?? parseSizeToBytes(b.total_size);
        return bytesA - bytesB;
      });

      assert.deepEqual(
        properAscSort.map((t) => t.name),
        [
          'empty_table',
          'commission_calculation_configs',
          'status_logs',
          'trade_orders',
          'orders',
        ]
      );
    });

    it('handles fallback where total_bytes is undefined using parseSizeToBytes fallback', () => {
      const tablesWithoutBytes = [
        { name: 'orders', total_size: '5.94 GB' },
        { name: 'status_logs', total_size: '950 MB' },
        { name: 'commission_configs', total_size: '96 kB' },
      ];

      const sorted = [...tablesWithoutBytes].sort((a, b) => {
        const bytesA = parseSizeToBytes(a.total_size);
        const bytesB = parseSizeToBytes(b.total_size);
        return bytesB - bytesA;
      });

      assert.deepEqual(
        sorted.map((t) => t.name),
        ['orders', 'status_logs', 'commission_configs']
      );
    });
  });
});
