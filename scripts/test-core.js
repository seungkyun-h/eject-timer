// Unit tests for the timer logic (no Electron / DOM needed).
const { computeTimer, fmt, fmtShort } = require('../renderer/timer-core.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL:', name); }
}
// June 30 2026 is the reference day; month is 0-indexed.
const at = (h, m, settings) => computeTimer(settings, new Date(2026, 5, 30, h, m, 0, 0));

const A = { shift: 'A', overtime: { minutes: 0 } }; // 08:30~18:00

ok('A@10:00 → 8h remaining', Math.round(at(10, 0, A).remainingSec) === 8 * 3600);
ok('A@10:00 → phase work', at(10, 0, A).phase === 'work');
ok('A@17:55 → phase soon (<=10m)', at(17, 55, A).phase === 'soon');
ok('A@18:00 → remaining ~0', Math.abs(at(18, 0, A).remainingSec) < 1.5);
ok('A@18:01 → phase celebrate (<=2m past)', at(18, 1, A).phase === 'celebrate');
ok('A@18:30 → phase overtime', at(18, 30, A).phase === 'overtime');
ok('A@18:30 → counts up 30m past', Math.round(-at(18, 30, A).remainingSec) === 30 * 60);

// overtime extends the target
const Aot = { shift: 'A', overtime: { minutes: 60 } }; // target 19:00
ok('A+60m@18:30 → 30m remaining', Math.round(at(18, 30, Aot).remainingSec) === 30 * 60);
ok('A+60m@18:30 → back to work phase', at(18, 30, Aot).phase === 'work');
ok('A+60m@18:55 → soon again', at(18, 55, Aot).phase === 'soon');

// other shifts
const B = { shift: 'B', overtime: { minutes: 0 } }; // ~17:00
const C = { shift: 'C', overtime: { minutes: 0 } }; // ~19:00
ok('B@17:00 → ~0 remaining', Math.abs(at(17, 0, B).remainingSec) < 1.5);
ok('C@19:00 → ~0 remaining', Math.abs(at(19, 0, C).remainingSec) < 1.5);

// progress is clamped 0..1
ok('A@06:00 → progress clamped to 0', at(6, 0, A).progress === 0);
ok('A@23:00 → progress clamped to 1', at(23, 0, A).progress === 1);
ok('A@13:15 → progress mid (~0.5)', Math.abs(at(13, 15, A).progress - 0.5) < 0.02);

// formatters
ok('fmt(3661) = 01:01:01', fmt(3661) === '01:01:01');
ok('fmtShort(3661) = 1:01', fmtShort(3661) === '1:01');
ok('fmt(negative) clamps to 00:00:00', fmt(-5) === '00:00:00');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
