
import { parseHabitData, checkIn, serializeHabitData } from './LifeOS/Organisms/Widgets/HabitTrackerLogic';

// Mock Logic needed locally if I run with ts-node
// Actually I can just create a temp file in packages/ui/src/debug_habit.ts and run it via ts-node or similar if available, 
// or I can just use the tool `run_command` to execute a script.
// Since I can't easily run ts-node on the customized environment without setup, I'll rely on a simple JS script if I can, but I need the TS imports..

// Let's create a test file in the codebase that I can run or I will assume I can run TS.
// If not, I will manually inspect.

// Let's create a "reproduction" test case in a new file `packages/ui/src/test-logic.ts`
// and I will try to compile/run it or just simply analyze.

console.log("Testing CheckIn Logic...");

const initialCsv = "iso date;goal reached\n2023-01-01;x";
console.log("Initial:", JSON.stringify(initialCsv));

const today = new Date().toISOString().split('T')[0] || '';
const newCsv = checkIn(initialCsv, today);

console.log("After CheckIn Today (" + today + "):");
console.log(JSON.stringify(newCsv));

if (newCsv === initialCsv) {
  console.error("FAIL: Content did not change!");
} else if (newCsv.includes(today) && newCsv.includes('x')) {
  console.log("PASS: Entry added.");
} else {
  console.error("FAIL: Unexpected content.");
}

const alreadyCheckedCsv = checkIn(newCsv, today);
console.log("Checking in again (Idempotency):");
console.log(JSON.stringify(alreadyCheckedCsv));

if (alreadyCheckedCsv === newCsv) { // Serialization might re-order? But checkIn sorts.
  console.log("PASS: Content stable.");
} else {
  console.log("INFO: Content changed (maybe sorting/formatting):", JSON.stringify(alreadyCheckedCsv));
}
